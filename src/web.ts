// Minimal status page for hosted deploys: shows the WhatsApp QR so it can be scanned without a terminal.
import http from "node:http";
import QRCode from "qrcode";
import { config } from "./config.js";
import { status } from "./whatsapp.js";

function page(body: string, refresh = true) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="5">' : ""}<title>Sorriso Atlântico Bot</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#1d2433;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 4px 24px #0001}
img{width:280px;max-width:100%}p{color:#5b6475;line-height:1.5}</style></head><body><main>${body}</main></body></html>`;
}

export function startWebServer(port: number) {
  http
    .createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/health") {
        res.writeHead(200).end("ok");
        return;
      }
      if (config.adminKey && url.searchParams.get("key") !== config.adminKey) {
        res.writeHead(401, { "content-type": "text/html; charset=utf-8" }).end(page("<h1>🔒</h1><p>Add <code>?key=ADMIN_KEY</code> to the URL.</p>", false));
        return;
      }
      let body: string;
      if (status.connection === "open") {
        body = `<h1>✅ Connected</h1><p>WhatsApp is linked${status.me ? ` to <b>+${status.me}</b>` : ""}. The assistant is answering messages.</p>`;
      } else if (status.qr) {
        const img = await QRCode.toDataURL(status.qr, { width: 280, margin: 1 });
        body = `<h1>📱 Link WhatsApp</h1><img src="${img}" alt="WhatsApp QR code">
<p>On your phone: <b>WhatsApp → Settings → Linked devices → Link a device</b>, then scan this code. It refreshes automatically.</p>`;
      } else {
        body = `<h1>⏳ Connecting…</h1><p>Waiting for WhatsApp (${status.connection}).</p>`;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(body));
    })
    .listen(port, () => console.log(`🌐 Status page on port ${port}`));
}
