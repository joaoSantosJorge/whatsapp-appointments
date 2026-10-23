import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isPnUser,
  normalizeMessageContent,
  useMultiFileAuthState,
  type WAMessage,
} from "@whiskeysockets/baileys";
import fs from "node:fs";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import { handleMessage, resetConversation } from "./agent.js";

// Ignore messages older than this when (re)connecting, so the bot doesn't answer backlog
const MAX_MESSAGE_AGE_S = 120;

const NON_TEXT_REPLY =
  "Obrigado pela mensagem! 😊 De momento só consigo ler mensagens de texto. Pode escrever-me o que precisa?";

// Exposed to the web status page
export const status: { connection: "connecting" | "qr" | "open" | "closed"; qr?: string; me?: string } = {
  connection: "connecting",
};

// One promise chain per chat so fast consecutive messages are processed in order
const queues = new Map<string, Promise<void>>();

function enqueue(jid: string, task: () => Promise<void>) {
  const prev = queues.get(jid) ?? Promise.resolve();
  const next = prev.then(task).catch((err) => console.error("[whatsapp] handler error:", err));
  queues.set(jid, next);
}

/** Resolves the sender's phone number (digits only) from a message key, handling WhatsApp LIDs. */
function phoneOf(msg: WAMessage): string {
  const jid = msg.key.remoteJid!;
  const pnJid = isPnUser(jid) ? jid : msg.key.remoteJidAlt && isPnUser(msg.key.remoteJidAlt) ? msg.key.remoteJidAlt : jid;
  return pnJid.split("@")[0].split(":")[0];
}

function textOf(msg: WAMessage): string | undefined {
  const content = normalizeMessageContent(msg.message);
  return content?.conversation ?? content?.extendedTextMessage?.text ?? undefined;
}

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Sorriso Atlântico Bot", "Chrome", "1.0"],
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      status.connection = "qr";
      status.qr = qr;
      console.log("\n📱 Scan this QR with WhatsApp → Settings → Linked devices → Link a device:\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      status.connection = "open";
      status.qr = undefined;
      status.me = sock.user?.id?.split(":")[0];
      console.log("✅ WhatsApp connected. Waiting for messages…");
      if (config.allowedNumbers.length) console.log(`   (only replying to: ${config.allowedNumbers.join(", ")})`);
    }
    if (connection === "close") {
      status.connection = "closed";
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // The device was unlinked from the phone: wipe the session so a fresh QR is generated
        console.error("❌ Logged out from WhatsApp. Clearing session — scan the new QR to link again.");
        fs.rmSync(config.authDir, { recursive: true, force: true });
      } else {
        console.log(`🔄 Connection closed (${code ?? "unknown"}), reconnecting…`);
      }
      startWhatsApp();
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid || msg.key.fromMe) continue;
      if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter") || jid.endsWith("@broadcast")) continue;
      if (Number(msg.messageTimestamp ?? 0) < Date.now() / 1000 - MAX_MESSAGE_AGE_S) continue;
      if (!msg.message || msg.message.protocolMessage || msg.message.reactionMessage) continue;

      const phone = phoneOf(msg);
      if (config.allowedNumbers.length && !config.allowedNumbers.includes(phone)) continue;

      enqueue(jid, async () => {
        await sock.readMessages([msg.key]);
        const text = textOf(msg)?.trim();
        if (!text) {
          await sock.sendMessage(jid, { text: NON_TEXT_REPLY });
          return;
        }
        console.log(`\n💬 ${msg.pushName ?? ""} (+${phone}): ${text}`);

        // Handy during demos: "/reset" starts a fresh conversation
        if (text.toLowerCase() === "/reset") {
          resetConversation(phone);
          await sock.sendMessage(jid, { text: "🔄 Conversa reiniciada." });
          return;
        }

        await sock.sendPresenceUpdate("composing", jid);
        const reply = await handleMessage(phone, text);
        await sock.sendPresenceUpdate("paused", jid);
        await sock.sendMessage(jid, { text: reply });
        console.log(`🤖 → +${phone}: ${reply}`);
      });
    }
  });

  return sock;
}
