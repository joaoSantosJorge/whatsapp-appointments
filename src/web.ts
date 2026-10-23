// Admin dashboard for the bot: live activity, conversations, stats, the WhatsApp QR and the replies on/off switch.
import fs from "node:fs";
import http from "node:http";
import QRCode from "qrcode";
import { config } from "./config.js";
import { linkWhatsApp, status, unlinkWhatsApp } from "./whatsapp.js";
import { deleteContactEvents, getConversations, getEvents, getSettings, getStats, logEvent, setRepliesEnabled } from "./activity.js";
import { resetConversation } from "./agent.js";
import { listUpcomingEvents } from "./calendar.js";

const DASHBOARD_HTML = fs.readFileSync(new URL("./dashboard.html", import.meta.url), "utf8");
const APPOINTMENTS_TTL_MS = 60_000;

let appointmentsCache: { at: number; data: unknown } | undefined;

async function getAppointments() {
  if (appointmentsCache && Date.now() - appointmentsCache.at < APPOINTMENTS_TTL_MS) return appointmentsCache.data;
  try {
    const data = { ok: true, appointments: await listUpcomingEvents(15) };
    appointmentsCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function getState() {
  return {
    now: Date.now(),
    connection: status.connection,
    me: status.me,
    connectedSince: status.connectedSince,
    startedAt: status.startedAt,
    qr: status.connection !== "open" && status.qr ? await QRCode.toDataURL(status.qr, { width: 280, margin: 1 }) : undefined,
    repliesEnabled: getSettings().repliesEnabled,
    config: {
      model: config.model,
      timezone: config.timezone,
      calendarId: config.calendarId,
      allowedNumbers: config.allowedNumbers,
    },
    stats: getStats(),
    conversations: getConversations(),
  };
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("Body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

export function startWebServer(port: number) {
  http
    .createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/health") {
          res.writeHead(200).end("ok");
          return;
        }
        const key = url.searchParams.get("key") ?? req.headers["x-admin-key"];
        if (config.adminKey && key !== config.adminKey) {
          if (url.pathname.startsWith("/api/")) return json(res, 401, { error: "Unauthorized" });
          res
            .writeHead(401, { "content-type": "text/html; charset=utf-8" })
            .end(`<!doctype html><meta charset="utf-8"><title>Clínica Maria Bot</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<p>🔒 Add <code>?key=ADMIN_KEY</code> to the URL.</p></body>`);
          return;
        }

        if (req.method === "GET" && url.pathname === "/") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(DASHBOARD_HTML);
        } else if (req.method === "GET" && url.pathname === "/api/state") {
          json(res, 200, await getState());
        } else if (req.method === "GET" && url.pathname === "/api/events") {
          const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);
          const after = url.searchParams.has("after") ? Number(url.searchParams.get("after")) : undefined;
          json(res, 200, { events: getEvents({ phone: url.searchParams.get("phone") ?? undefined, limit, after }) });
        } else if (req.method === "GET" && url.pathname === "/api/appointments") {
          json(res, 200, await getAppointments());
        } else if (req.method === "POST" && url.pathname === "/api/replies") {
          const body = (await readBody(req)) as { enabled?: unknown };
          if (typeof body.enabled !== "boolean") return json(res, 400, { error: "Expected { enabled: boolean }" });
          setRepliesEnabled(body.enabled);
          json(res, 200, { repliesEnabled: getSettings().repliesEnabled });
        } else if (req.method === "POST" && url.pathname === "/api/whatsapp/link") {
          await linkWhatsApp();
          json(res, 200, { connection: status.connection });
        } else if (req.method === "POST" && url.pathname === "/api/whatsapp/unlink") {
          await unlinkWhatsApp();
          json(res, 200, { connection: status.connection });
        } else if (req.method === "DELETE" && url.pathname === "/api/conversations") {
          const phone = url.searchParams.get("phone")?.replace(/\D/g, "");
          if (!phone) return json(res, 400, { error: "Expected ?phone=" });
          const deleted = deleteContactEvents(phone);
          resetConversation(phone); // also forget the assistant's chat memory for this person
          logEvent({ type: "system", text: `Deleted a conversation (${deleted} events)` });
          json(res, 200, { deleted });
        } else {
          json(res, 404, { error: "Not found" });
        }
      } catch (err) {
        console.error("[web] request failed:", err);
        if (!res.headersSent) json(res, 500, { error: (err as Error).message });
      }
    })
    .listen(port, () => console.log(`🌐 Dashboard on http://localhost:${port}/${config.adminKey ? "?key=…" : ""}`));
}
