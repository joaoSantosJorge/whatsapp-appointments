import { google, calendar_v3 } from "googleapis";
import { config } from "./config.js";
import { HOLIDAYS, OPENING_HOURS, findService } from "./clinic.js";
import {
  addDays, describe, fromLocal, fromMinutes, toLocal, toMinutes, weekdayNamePt, weekdayOf,
} from "./time.js";

const SLOT_STEP_MIN = 15;
const MIN_NOTICE_MIN = 60;
const MAX_RANGE_DAYS = 14;

const auth = new google.auth.GoogleAuth({
  ...(config.serviceAccountJson
    ? { credentials: JSON.parse(config.serviceAccountJson) }
    : { keyFile: config.serviceAccountKeyFile }),
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const calendar = google.calendar({ version: "v3", auth });

interface Interval { start: Date; end: Date }

async function getBusy(from: Date, to: Date): Promise<Interval[]> {
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: config.timezone,
      items: [{ id: config.calendarId }],
    },
  });
  const cal = res.data.calendars?.[config.calendarId];
  if (cal?.errors?.length) {
    throw new Error(`Calendar access error: ${cal.errors.map((e) => e.reason).join(", ")}. ` +
      "Did you share the calendar with the service account email (\"Make changes to events\")?");
  }
  return (cal?.busy ?? []).map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
}

function overlaps(a: Interval, busy: Interval[]): boolean {
  return busy.some((b) => a.start < b.end && b.start < a.end);
}

/** Whether a slot falls entirely inside the clinic's opening hours. */
function withinOpeningHours(start: Date, durationMin: number): boolean {
  const l = toLocal(start);
  if (HOLIDAYS.includes(l.date)) return false;
  const s = toMinutes(l.time);
  return OPENING_HOURS[l.weekday].some(([open, close]) => s >= toMinutes(open) && s + durationMin <= toMinutes(close));
}

function candidateSlots(date: string, durationMin: number): Interval[] {
  if (HOLIDAYS.includes(date)) return [];
  const slots: Interval[] = [];
  for (const [open, close] of OPENING_HOURS[weekdayOf(date)]) {
    for (let m = toMinutes(open); m + durationMin <= toMinutes(close); m += SLOT_STEP_MIN) {
      const start = fromLocal(date, fromMinutes(m));
      slots.push({ start, end: new Date(start.getTime() + durationMin * 60_000) });
    }
  }
  return slots;
}

export interface AvailabilityResult {
  service: string;
  durationMin: number;
  requested?: { start: string; available: boolean; reason?: string };
  availableByDay: { day: string; slots: string[] }[];
  note?: string;
}

/**
 * Finds free slots for a service between two local dates (inclusive).
 * If preferredTime is given, slots closest to that time are returned first for each day.
 */
export async function getAvailableSlots(
  serviceId: string,
  dateFrom: string,
  dateTo?: string,
  preferredTime?: string,
): Promise<AvailabilityResult> {
  const found = findService(serviceId);
  if (!found) throw new Error(`Unknown service_id "${serviceId}"`);
  const { service } = found;

  const today = toLocal(new Date()).date;
  let from = dateFrom < today ? today : dateFrom;
  let to = dateTo && dateTo >= from ? dateTo : from;
  if (to > addDays(from, MAX_RANGE_DAYS)) to = addDays(from, MAX_RANGE_DAYS);

  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const earliest = new Date(Date.now() + MIN_NOTICE_MIN * 60_000);
  const busy = await getBusy(fromLocal(from, "00:00"), fromLocal(addDays(to, 1), "00:00"));

  const result: AvailabilityResult = {
    service: `${found.specialty.name} — ${service.name}`,
    durationMin: service.durationMin,
    availableByDay: [],
  };

  if (preferredTime && days.length === 1) {
    const start = fromLocal(from, preferredTime);
    const slot = { start, end: new Date(start.getTime() + service.durationMin * 60_000) };
    let reason: string | undefined;
    if (start < earliest) reason = "já passou ou é demasiado em cima da hora";
    else if (!withinOpeningHours(start, service.durationMin)) reason = "fora do horário da clínica";
    else if (overlaps(slot, busy)) reason = "horário já ocupado";
    result.requested = { start: describe(start), available: !reason, reason };
  }

  for (const day of days) {
    let free = candidateSlots(day, service.durationMin).filter((s) => s.start >= earliest && !overlaps(s, busy));
    if (free.length === 0) continue;
    if (preferredTime) {
      const target = toMinutes(preferredTime);
      free = [...free].sort(
        (a, b) => Math.abs(toMinutes(toLocal(a.start).time) - target) - Math.abs(toMinutes(toLocal(b.start).time) - target),
      ).slice(0, 4).sort((a, b) => a.start.getTime() - b.start.getTime());
    } else {
      // Spread suggestions across the day: up to 5 evenly spaced slots
      const step = Math.max(1, Math.floor(free.length / 5));
      free = free.filter((_, i) => i % step === 0).slice(0, 5);
    }
    result.availableByDay.push({ day: `${weekdayNamePt(weekdayOf(day))}, ${day}`, slots: free.map((s) => toLocal(s.start).time) });
    if (result.availableByDay.length >= 5) break;
  }

  if (result.availableByDay.length === 0) {
    result.note = "Sem vagas nesse período. Experimente procurar nos dias seguintes.";
  }
  return result;
}

export interface BookingInput {
  serviceId: string;
  start: Date;
  patientName: string;
  phone: string;
  notes?: string;
}

export async function bookAppointment(input: BookingInput) {
  const found = findService(input.serviceId);
  if (!found) throw new Error(`Unknown service_id "${input.serviceId}"`);
  const { specialty, service } = found;
  const end = new Date(input.start.getTime() + service.durationMin * 60_000);

  if (input.start.getTime() < Date.now() + MIN_NOTICE_MIN * 60_000) {
    return { ok: false as const, error: "Esse horário já passou ou é demasiado em cima da hora." };
  }
  if (!withinOpeningHours(input.start, service.durationMin)) {
    return { ok: false as const, error: "Esse horário está fora do horário de funcionamento da clínica." };
  }
  // Re-check right before inserting so a slot taken in the meantime can't be double-booked
  const busy = await getBusy(input.start, end);
  if (overlaps({ start: input.start, end }, busy)) {
    return { ok: false as const, error: "Esse horário acabou de ficar ocupado. Verifique novamente a disponibilidade." };
  }

  const event = await calendar.events.insert({
    calendarId: config.calendarId,
    requestBody: {
      summary: `🦷 [${specialty.name}] ${service.name} — ${input.patientName}`,
      description: [
        `Paciente: ${input.patientName}`,
        `Telefone (WhatsApp): +${input.phone}`,
        `Especialidade: ${specialty.name}`,
        `Serviço: ${service.name} (${service.durationMin} min, ${service.price})`,
        `Médico(a): ${specialty.dentist}`,
        input.notes ? `Motivo / notas: ${input.notes}` : undefined,
        "",
        "Marcado via WhatsApp (assistente IA)",
      ].filter((l) => l !== undefined).join("\n"),
      location: "Clínica Dentária Sorriso Atlântico — Av. da Liberdade 245, 2.º, Lisboa",
      colorId: specialty.colorId,
      start: { dateTime: input.start.toISOString(), timeZone: config.timezone },
      end: { dateTime: end.toISOString(), timeZone: config.timezone },
      extendedProperties: {
        private: { phone: input.phone, serviceId: service.id, source: "whatsapp-bot" },
      },
    },
  });

  return {
    ok: true as const,
    eventId: event.data.id!,
    when: describe(input.start),
    durationMin: service.durationMin,
    service: service.name,
    specialty: specialty.name,
    dentist: specialty.dentist,
    price: service.price,
  };
}

function summarizeEvent(e: calendar_v3.Schema$Event) {
  const start = new Date(e.start?.dateTime ?? e.start?.date ?? "");
  return { eventId: e.id, when: describe(start), title: e.summary };
}

export async function findAppointmentsByPhone(phone: string) {
  const res = await calendar.events.list({
    calendarId: config.calendarId,
    privateExtendedProperty: [`phone=${phone}`],
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });
  return (res.data.items ?? []).map(summarizeEvent);
}

export async function cancelAppointment(eventId: string, phone: string) {
  const res = await calendar.events.get({ calendarId: config.calendarId, eventId }).catch(() => undefined);
  const event = res?.data;
  if (!event || event.status === "cancelled" || event.extendedProperties?.private?.phone !== phone) {
    return { ok: false as const, error: "Marcação não encontrada para este número." };
  }
  await calendar.events.delete({ calendarId: config.calendarId, eventId });
  return { ok: true as const, cancelled: summarizeEvent(event) };
}

export async function listUpcomingEvents(max = 10) {
  const res = await calendar.events.list({
    calendarId: config.calendarId,
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: max,
  });
  return (res.data.items ?? []).map(summarizeEvent);
}
