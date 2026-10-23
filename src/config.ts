import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const schema = z
  .object({
    CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
    // Either a path to the service account JSON key, or its full JSON contents (for hosted deploys)
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_CALENDAR_ID: z.string().min(1, "GOOGLE_CALENDAR_ID is required"),
    TIMEZONE: z.string().default("Europe/Lisbon"),
    ALLOWED_NUMBERS: z.string().default(""),
    // Where the WhatsApp session (auth/) and conversations (data/) are stored. Point to a volume when hosted.
    DATA_DIR: z.string().default("."),
    PORT: z.coerce.number().optional(),
    // Required to view the QR page when the web server is running (hosted deploys)
    ADMIN_KEY: z.string().optional(),
  })
  .refine((e) => e.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || e.GOOGLE_SERVICE_ACCOUNT_JSON, {
    message: "Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON",
    path: ["GOOGLE_SERVICE_ACCOUNT_KEY_FILE"],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid .env configuration:");
  for (const issue of parsed.error.issues) console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
  console.error("   Copy .env.example to .env and fill it in.");
  process.exit(1);
}

export const config = {
  model: parsed.data.CLAUDE_MODEL,
  serviceAccountKeyFile: parsed.data.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  serviceAccountJson: parsed.data.GOOGLE_SERVICE_ACCOUNT_JSON,
  calendarId: parsed.data.GOOGLE_CALENDAR_ID,
  timezone: parsed.data.TIMEZONE,
  allowedNumbers: parsed.data.ALLOWED_NUMBERS.split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean),
  authDir: path.join(parsed.data.DATA_DIR, "auth"),
  dataDir: path.join(parsed.data.DATA_DIR, "data"),
  port: parsed.data.PORT,
  adminKey: parsed.data.ADMIN_KEY,
};
