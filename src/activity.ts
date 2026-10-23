// Activity log (everything the bot receives, sends and does) + persisted settings, used by the dashboard.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { addDays, toLocal } from "./time.js";

const LOG_FILE = path.join(config.dataDir, "activity.jsonl");
const SETTINGS_FILE = path.join(config.dataDir, "settings.json");
const MAX_EVENTS = 5000;

export type Handled = "replied" | "paused" | "not_allowed" | "non_text" | "reset";

export interface ToolCall {
  name: string;
  input: unknown;
  result: string; // truncated JSON
  ok: boolean;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type ActivityEvent = { id: number; ts: number } & (
  | { type: "received"; phone: string; name?: string; text: string; handled: Handled }
  | {
      type: "sent";
      phone: string;
      text: string;
      latencyMs?: number;
      toolCalls?: ToolCall[];
      usage?: Usage;
      fallback?: boolean;
      error?: string;
    }
  | { type: "system"; text: string; level?: "info" | "warn" | "error" }
);

// Distributive Omit so each event variant keeps its own fields
type NewEvent = ActivityEvent extends infer E ? (E extends ActivityEvent ? Omit<E, "id" | "ts"> : never) : never;

const events: ActivityEvent[] = loadEvents();
let nextId = (events.at(-1)?.id ?? 0) + 1;

function loadEvents(): ActivityEvent[] {
  try {
    return fs
      .readFileSync(LOG_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-MAX_EVENTS)
      .map((l) => JSON.parse(l) as ActivityEvent);
  } catch {
    return [];
  }
}

export function logEvent(e: NewEvent): ActivityEvent {
  const event = { ...e, id: nextId++, ts: Date.now() } as ActivityEvent;
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + "\n");
  } catch (err) {
    console.error("[activity] failed to persist event:", err);
  }
  return event;
}

/** Most recent events first. `after` returns only events newer than that id. */
export function getEvents(opts: { phone?: string; limit?: number; after?: number } = {}): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < (opts.limit ?? 200); i--) {
    const e = events[i];
    if (opts.after !== undefined && e.id <= opts.after) break;
    if (opts.phone && !("phone" in e && e.phone === opts.phone)) continue;
    out.push(e);
  }
  return out;
}

// ---- Settings ----

interface Settings {
  repliesEnabled: boolean;
}

// Replies start OFF so the bot never answers anyone until explicitly switched on from the dashboard
let settings: Settings = { repliesEnabled: false };
try {
  settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) };
} catch {}

export function getSettings(): Readonly<Settings> {
  return settings;
}

export function setRepliesEnabled(enabled: boolean) {
  if (settings.repliesEnabled === enabled) return;
  settings = { ...settings, repliesEnabled: enabled };
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  logEvent({ type: "system", text: enabled ? "Replies turned ON" : "Replies turned OFF", level: enabled ? "info" : "warn" });
  console.log(enabled ? "▶️  Replies turned ON" : "⏸️  Replies turned OFF");
}

// ---- Stats ----

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function getStats() {
  const now = Date.now();
  const today = toLocal(new Date()).date;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const perDay = new Map(days.map((d) => [d, { date: d, received: 0, sent: 0 }]));
  const perHour = Array.from({ length: 24 }, (_, i) => ({
    hour: toLocal(new Date(now - (23 - i) * HOUR_MS)).time.slice(0, 2),
    received: 0,
    sent: 0,
  }));

  const received = { today: 0, week: 0, total: 0 };
  const sent = { today: 0, week: 0, total: 0 };
  const handled: Record<Handled, number> = { replied: 0, paused: 0, not_allowed: 0, non_text: 0, reset: 0 };
  const tools: Record<string, number> = {};
  let bookings = 0, cancellations = 0, failedBookings = 0, errors = 0, fallbacks = 0;
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const latencies: number[] = [];
  const contacts = new Map<string, { phone: string; name?: string; received: number; sent: number; lastTs: number }>();

  for (const e of events) {
    const date = toLocal(new Date(e.ts)).date;
    const age = now - e.ts;
    const hourIdx = 23 - Math.floor(age / HOUR_MS);

    if (e.type === "system") {
      if (e.level === "error") errors++;
      continue;
    }
    const c = contacts.get(e.phone) ?? { phone: e.phone, received: 0, sent: 0, lastTs: 0 };
    c.lastTs = e.ts;
    contacts.set(e.phone, c);

    const bucket = e.type === "received" ? received : sent;
    bucket.total++;
    if (date === today) bucket.today++;
    if (age < 7 * DAY_MS) bucket.week++;
    const day = perDay.get(date);
    if (day) day[e.type]++;
    if (hourIdx >= 0 && hourIdx < 24) perHour[hourIdx][e.type]++;

    if (e.type === "received") {
      c.received++;
      if (e.name) c.name = e.name;
      handled[e.handled]++;
    } else {
      c.sent++;
      if (e.latencyMs !== undefined) latencies.push(e.latencyMs);
      if (e.fallback) fallbacks++;
      if (e.error) errors++;
      for (const t of e.toolCalls ?? []) {
        tools[t.name] = (tools[t.name] ?? 0) + 1;
        if (!t.ok) errors++;
        const ok = t.ok && t.result.includes('"ok":true');
        if (t.name === "book_appointment") ok ? bookings++ : failedBookings++;
        if (t.name === "cancel_appointment" && ok) cancellations++;
      }
      if (e.usage) {
        usage.input += e.usage.input;
        usage.output += e.usage.output;
        usage.cacheRead += e.usage.cacheRead;
        usage.cacheWrite += e.usage.cacheWrite;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const allContacts = [...contacts.values()];
  return {
    received,
    sent,
    handled,
    contacts: allContacts.length,
    activeContacts24h: allContacts.filter((c) => now - c.lastTs < DAY_MS).length,
    latency: {
      avgMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      p95Ms: percentile(latencies, 95),
    },
    bookings,
    failedBookings,
    cancellations,
    tools,
    errors,
    fallbacks,
    usage,
    perHour,
    perDay: [...perDay.values()],
    since: events[0]?.ts ?? null,
  };
}

/** One row per contact, most recent first. */
export function getConversations() {
  const map = new Map<
    string,
    { phone: string; name?: string; lastText: string; lastTs: number; lastType: string; count: number; ignored: number; tools: number }
  >();
  for (const e of events) {
    if (e.type === "system") continue;
    const c = map.get(e.phone) ?? { phone: e.phone, lastText: "", lastTs: 0, lastType: "", count: 0, ignored: 0, tools: 0 };
    c.lastText = e.text;
    c.lastTs = e.ts;
    c.lastType = e.type;
    c.count++;
    if (e.type === "received") {
      if (e.name) c.name = e.name;
      if (e.handled === "paused" || e.handled === "not_allowed") c.ignored++;
    } else {
      c.tools += e.toolCalls?.length ?? 0;
    }
    map.set(e.phone, c);
  }
  return [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
}
