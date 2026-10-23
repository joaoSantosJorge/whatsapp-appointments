import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp.js";
import { startWebServer } from "./web.js";
import { getSettings, logEvent } from "./activity.js";

console.log("🦷 Clínica Maria — WhatsApp assistant starting…");
logEvent({ type: "system", text: `Bot started (model ${config.model}, replies ${getSettings().repliesEnabled ? "ON" : "OFF"})` });
if (!getSettings().repliesEnabled) console.log("⏸️  Replies are OFF — turn them on from the dashboard.");
if (config.port) startWebServer(config.port);
await startWhatsApp();
