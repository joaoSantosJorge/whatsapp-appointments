# 🦷 Clínica Maria — WhatsApp AI Receptionist (demo)

Patients message your WhatsApp. A Claude-powered assistant answers questions about the (fictional)
**Clínica Maria**. It also checks your Google Calendar and books, proposes alternatives for, or cancels
appointments. Each booking shows up in Google Calendar as `🦷 [Especialidade] Serviço — Nome`, colour-coded by specialty.

```
WhatsApp (your number, linked via QR) ──► Baileys ──► Claude agent ──► Google Calendar
                                              ◄── reply ◄──  tools: check_availability / book / list / cancel
```

## Setup (≈15 min)

### 1. Google Calendar (service account)
1. Go to https://console.cloud.google.com → create a project (e.g. `dental-demo`).
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **IAM & Admin → Service Accounts** → *Create service account* (no roles needed) → open it →
   **Keys → Add key → JSON**. Save the file in this folder as `service-account.json`.
4. In Google Calendar (web), create a new calendar called **"Clínica Maria"** (recommended, so
   demo bookings don't mix with your personal events). You can also use your main calendar.
5. Open that calendar's **Settings → Share with specific people → Add** the service account email
   (`…@….iam.gserviceaccount.com`) with **"Make changes to events"**.
6. In the same settings page, copy the **Calendar ID** (under *Integrate calendar*).

### 2. Configure
```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY, GOOGLE_CALENDAR_ID (and the key file path if different)
npm install
npm run check-calendar     # should list events + free slots → "✅ Calendar access OK"
npm run chat               # talk to the assistant in the terminal (no WhatsApp)
```

### 3. Connect WhatsApp
```bash
npm start
```
Scan the QR code with your phone: **WhatsApp → Settings → Linked devices → Link a device**.
The session is saved in `auth/`, so you only scan once.

**Test from a different phone.** The bot ignores messages you send from your own number. To avoid the bot
replying to friends/family during the demo, set `ALLOWED_NUMBERS=351912345678,…` in `.env`.

## Deploying on Railway
The project is already set up on Railway (`sorriso-atlantico-bot` → service `whatsapp-bot`), with a volume at
`/data` that keeps the WhatsApp session and conversations across redeploys. Set the secrets once:
```bash
railway variables --set "ANTHROPIC_API_KEY=sk-ant-..." \
  --set "GOOGLE_CALENDAR_ID=...@group.calendar.google.com" \
  --set "GOOGLE_SERVICE_ACCOUNT_JSON=$(cat service-account.json)"
```
Railway redeploys automatically. Open `https://<your-domain>/?key=<ADMIN_KEY>` and scan the QR from that page.
Redeploy code changes with `railway up`.

## Dashboard
Open `http://localhost:3000/?key=<ADMIN_KEY>` (local, with `PORT` set) or `https://<your-domain>/?key=<ADMIN_KEY>` (Railway):
- **Replies ON/OFF switch** (top right). Replies start **OFF**: incoming messages are logged but get no answer, read
  receipt or typing indicator, and they are never answered later. Switch it on when your test patient is ready. The
  setting is saved in `data/settings.json`, so it survives restarts.
- **Link phone / Unlink phone** button. Unlinking logs the bot out of WhatsApp (it disappears from the phone's Linked
  devices); linking shows a QR to scan. With the dashboard on, the bot waits for "Link phone" when no phone is linked.
- **Delete** a conversation (in its thread): removes it from the log and stats, and the assistant forgets it.
- Stats: messages received/sent, contacts, response time, bookings, errors, plus hourly/daily charts.
- Every conversation as a chat thread, with the tools the assistant used, response time and tokens for each reply.
- Live activity feed (messages, tool calls, ignored messages, errors, connection events), upcoming appointments,
  Claude token usage.

Everything is logged to `data/activity.jsonl`. JSON API (same key, via `?key=` or the `x-admin-key` header):
`GET /api/state`, `GET /api/events?phone=&limit=`, `GET /api/appointments`, `POST /api/replies {"enabled": true}`,
`POST /api/whatsapp/link`, `POST /api/whatsapp/unlink`, `DELETE /api/conversations?phone=`.

## Demo script
| Patient says | What happens |
|---|---|
| "Olá, qual é o horário e aceitam Médis?" | Answers from the clinic info |
| "Tenho uma dor de dentes muito forte desde ontem" | Empathy + triage → earliest *Consulta de Urgência* slot |
| "Queria marcar uma limpeza amanhã às 10h" | Books 10:00 if free; otherwise proposes the nearest times |
| "Quero alinhadores invisíveis" | Suggests the free aligner consultation and books it |
| "Preciso de desmarcar a minha consulta" | Lists your bookings and cancels after confirmation |
| Message in English | Replies in English |

Tip: block a slot manually in Google Calendar before the demo (e.g. tomorrow 10:00) to show the
"busy → alternatives" flow. Send `/reset` in the chat to start a fresh conversation.

## Files
- `src/clinic.ts`: clinic knowledge base (13 specialties, services, prices, dentists, FAQs). Edit freely.
- `src/calendar.ts`: availability (opening hours + Google free/busy) and booking/cancelling.
- `src/agent.ts`: Claude system prompt, tools and tool-use loop; history in `data/conversations.json`.
- `src/whatsapp.ts`: WhatsApp connection (Baileys) and message handling.
- `src/activity.ts`: activity log, stats and the replies on/off setting.
- `src/web.ts` + `src/dashboard.html`: the dashboard and its API.

> Baileys uses WhatsApp Web's protocol and is unofficial. That's fine for a demo. For production, move to the
> official WhatsApp Business Cloud API (only `src/whatsapp.ts` needs to change).
