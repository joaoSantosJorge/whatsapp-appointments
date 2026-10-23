import { config } from "./config.js";
import { startWhatsApp } from "./whatsapp.js";
import { startWebServer } from "./web.js";

console.log("🦷 Clínica Dentária Sorriso Atlântico — WhatsApp assistant starting…");
if (config.port) startWebServer(config.port);
await startWhatsApp();
