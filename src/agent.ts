import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { CLINIC } from "./clinic.js";
import { bookAppointment, cancelAppointment, findAppointmentsByPhone, getAvailableSlots } from "./calendar.js";
import { describe, parseStart } from "./time.js";
import type { ToolCall, Usage } from "./activity.js";

const client = new Anthropic();

// Server-side refusal fallback is supported on Opus/Sonnet/Fable, not on Haiku
const fallbackParams = /haiku/.test(config.model)
  ? {}
  : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

const MAX_TOOL_ITERATIONS = 8;
const CONVERSATION_TTL_MS = 12 * 60 * 60 * 1000;
const HISTORY_FILE = path.join(config.dataDir, "conversations.json");

const SYSTEM_PROMPT = `És a assistente virtual da ${CLINIC.name}, uma clínica dentária em Lisboa. Falas com pacientes por WhatsApp.

O teu trabalho:
1. Responder a perguntas sobre a clínica (serviços, preços, horários, morada, seguros, pagamentos, etc.) usando APENAS a informação da clínica abaixo. Se não souberes algo, diz que vais pedir à equipa para entrar em contacto ou indica o telefone da clínica.
2. Marcar, consultar e desmarcar consultas no calendário da clínica.

Estilo:
- Responde em português de Portugal (PT-PT, trata o paciente por "você" ou sem pronome, nunca "tu" nem expressões do Brasil). Se o paciente escrever noutra língua, responde nessa língua.
- Mensagens curtas e calorosas, próprias de WhatsApp. Usa *negrito* com um asterisco de cada lado (formato WhatsApp), nunca **duplo**. Sem títulos markdown. Emojis com moderação (🦷 😊 📅).
- Uma pergunta de cada vez.

Como marcar uma consulta:
1. Percebe o motivo da consulta e escolhe o service_id mais adequado. Se não for claro, faz uma pergunta curta (ex.: "É para uma limpeza ou sente alguma dor?"). Se o paciente não souber, usa a Primeira Consulta (geral-primeira).
2. Se o paciente referir dor forte, inchaço, dente partido ou trauma: mostra empatia, pergunta há quanto tempo e se há inchaço/febre, e propõe a *Consulta de Urgência* o mais cedo possível (hoje, se houver vaga). Se houver febre alta com inchaço da face, dificuldade em respirar ou engolir, aconselha a ligar 112 ou ir às urgências hospitalares. Nunca dês diagnósticos nem receites medicamentos.
3. Usa SEMPRE a ferramenta check_availability antes de falar de horários. Nunca inventes disponibilidade. Interpreta datas relativas ("amanhã à tarde", "sexta de manhã", "para a semana") com base na data/hora atual indicada em cada mensagem. Manhã = 09:00–13:00, tarde = 14:00–19:00.
4. Se o horário pedido estiver livre, propõe-o. Se não estiver, explica brevemente e sugere 2–4 alternativas próximas.
5. Pede o nome completo do paciente (se ainda não o souberes).
6. Antes de marcar, confirma num resumo curto: serviço, data e hora, médico(a). Marca com book_appointment só depois de o paciente confirmar.
7. Depois de marcar, envia a confirmação com data, hora, médico(a), morada e o lembrete de chegar 10 minutos antes. Indica a política de cancelamento.

Para desmarcar ou remarcar, usa list_my_appointments e depois cancel_appointment (e marca de novo, se for remarcação). O número de telefone do paciente é conhecido automaticamente pelo sistema — nunca o peças.

Informação da clínica (JSON):
${JSON.stringify(CLINIC, null, 1)}`;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "check_availability",
    description:
      "Consulta o calendário da clínica e devolve horários livres para um serviço. Usa sempre antes de propor horários. " +
      "Se for indicado preferred_time e apenas um dia, indica também se esse horário exato está livre.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "ID do serviço (ex.: higiene-limpeza, urgencia-consulta)" },
        date_from: { type: "string", description: "Data inicial, formato YYYY-MM-DD" },
        date_to: { type: "string", description: "Data final opcional (YYYY-MM-DD), máx. 14 dias depois de date_from" },
        preferred_time: { type: "string", description: "Hora preferida opcional, formato HH:MM (24h)" },
      },
      required: ["service_id", "date_from"],
    },
  },
  {
    name: "book_appointment",
    description: "Marca a consulta no calendário. Só usar depois de o paciente confirmar serviço, data/hora e nome.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        start: { type: "string", description: "Início em hora de Lisboa, formato YYYY-MM-DDTHH:MM" },
        patient_name: { type: "string", description: "Nome completo do paciente" },
        notes: { type: "string", description: "Motivo da consulta / sintomas descritos pelo paciente (resumo curto)" },
      },
      required: ["service_id", "start", "patient_name"],
    },
  },
  {
    name: "list_my_appointments",
    description: "Lista as próximas consultas marcadas por este paciente (identificado pelo número de WhatsApp).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancel_appointment",
    description: "Desmarca uma consulta deste paciente. Obter o event_id com list_my_appointments e confirmar com o paciente antes.",
    input_schema: {
      type: "object",
      properties: { event_id: { type: "string" } },
      required: ["event_id"],
    },
  },
];

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}$/;
const checkInput = z.object({
  service_id: z.string(),
  date_from: z.string().regex(dateRe),
  date_to: z.string().regex(dateRe).optional(),
  preferred_time: z.string().regex(timeRe).optional(),
});
const bookInput = z.object({
  service_id: z.string(),
  start: z.string(),
  patient_name: z.string().min(2),
  notes: z.string().optional(),
});
const cancelInput = z.object({ event_id: z.string() });

async function runTool(name: string, input: unknown, phone: string): Promise<unknown> {
  switch (name) {
    case "check_availability": {
      const i = checkInput.parse(input);
      return getAvailableSlots(i.service_id, i.date_from, i.date_to, i.preferred_time);
    }
    case "book_appointment": {
      const i = bookInput.parse(input);
      const start = parseStart(i.start);
      if (!start) return { ok: false, error: "Data/hora inválida. Use YYYY-MM-DDTHH:MM." };
      return bookAppointment({ serviceId: i.service_id, start, patientName: i.patient_name, phone, notes: i.notes });
    }
    case "list_my_appointments":
      return { appointments: await findAppointmentsByPhone(phone) };
    case "cancel_appointment":
      return cancelAppointment(cancelInput.parse(input).event_id, phone);
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// ---- Conversation history (per phone, append-only, persisted to disk) ----

interface Conversation {
  messages: Anthropic.Beta.BetaMessageParam[];
  updatedAt: number;
}

const conversations = new Map<string, Conversation>(loadHistory());

function loadHistory(): [string, Conversation][] {
  try {
    return Object.entries(JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")));
  } catch {
    return [];
  }
}

function saveHistory() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(conversations)));
}

export function resetConversation(phone: string) {
  conversations.delete(phone);
  saveHistory();
}

const FALLBACK_REPLY =
  `Peço desculpa, estou com uma dificuldade técnica neste momento. 🙏 Pode tentar novamente daqui a pouco ou ligar para ${CLINIC.phone}.`;

export interface AgentResult {
  reply: string;
  toolCalls: ToolCall[];
  usage: Usage;
  fallback: boolean;
  error?: string;
}

/**
 * Handles one incoming patient message and returns the reply text plus what happened along the way.
 * `phone` is the patient's number (digits only, with country code) and is the only identity used by tools.
 */
export async function handleMessage(phone: string, text: string): Promise<AgentResult> {
  const toolCalls: ToolCall[] = [];
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const done = (reply: string, extra: { fallback?: boolean; error?: string } = {}): AgentResult => ({
    reply,
    toolCalls,
    usage,
    fallback: extra.fallback ?? false,
    error: extra.error,
  });

  const existing = conversations.get(phone);
  const fresh = !existing || Date.now() - existing.updatedAt > CONVERSATION_TTL_MS;
  // Work on a copy; only commit to history if the whole turn succeeds
  const messages: Anthropic.Beta.BetaMessageParam[] = fresh ? [] : [...existing.messages];

  messages.push({
    role: "user",
    content: `[Data/hora atual: ${describe(new Date())} (Lisboa)]\n${text}`,
  });

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.beta.messages.create({
        model: config.model,
        max_tokens: 16000,
        ...fallbackParams,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });
      usage.input += response.usage.input_tokens;
      usage.output += response.usage.output_tokens;
      usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

      if (response.stop_reason === "refusal") {
        console.warn(`[agent] refusal for ${phone}:`, response.stop_details);
        return done(FALLBACK_REPLY, { fallback: true, error: "Model refusal" });
      }

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        conversations.set(phone, { messages, updatedAt: Date.now() });
        saveHistory();
        return reply ? done(reply) : done(FALLBACK_REPLY, { fallback: true, error: "Empty reply" });
      }

      const results = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          try {
            const result = await runTool(tu.name, tu.input, phone);
            const json = JSON.stringify(result);
            console.log(`  🔧 ${tu.name}(${JSON.stringify(tu.input)}) →`, json.slice(0, 300));
            toolCalls.push({ name: tu.name, input: tu.input, result: json.slice(0, 2000), ok: true });
            return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) };
          } catch (err) {
            console.error(`  ❌ ${tu.name} failed:`, err);
            toolCalls.push({ name: tu.name, input: tu.input, result: (err as Error).message, ok: false });
            return { type: "tool_result", tool_use_id: tu.id, content: `Erro: ${(err as Error).message}`, is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
    console.error(`[agent] hit max tool iterations for ${phone}`);
    return done(FALLBACK_REPLY, { fallback: true, error: "Hit max tool iterations" });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`[agent] Claude API error ${err.status}:`, err.message);
      return done(FALLBACK_REPLY, { fallback: true, error: `Claude API error ${err.status}: ${err.message}` });
    }
    console.error("[agent] unexpected error:", err);
    return done(FALLBACK_REPLY, { fallback: true, error: (err as Error).message ?? String(err) });
  }
}
