import { config } from "./config.js";
import { hasSession, markUnlinked, startWhatsApp } from "./whatsapp.js";
import { startWebServer } from "./web.js";
import { getSettings, logEvent } from "./activity.js";

console.log("🦷 Clínica Maria — WhatsApp assistant starting…");
logEvent({ type: "system", text: `Bot started (model ${config.model}, replies ${getSettings().repliesEnabled ? "ON" : "OFF"})` });
if (!getSettings().repliesEnabled) console.log("⏸️  Replies are OFF — turn them on from the dashboard.");
if (config.port) startWebServer(config.port);
// With the dashboard on and no saved session, wait for "Link phone" instead of showing a QR straight away
if (config.port && !hasSession()) {
  markUnlinked();
  console.log("📵 No phone linked — use “Link phone” in the dashboard.");
} else {
  await startWhatsApp();
}
