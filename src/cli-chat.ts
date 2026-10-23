// Terminal chat with the same agent, no WhatsApp needed. Useful for testing and as a demo fallback.
import readline from "node:readline/promises";
import { handleMessage, resetConversation } from "./agent.js";

const phone = process.argv[2]?.replace(/\D/g, "") || "351900000000";
resetConversation(phone);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`🦷 Chat de teste (simulating WhatsApp number +${phone}). Type "/reset" to restart, Ctrl+C to exit.\n`);

while (true) {
  const text = (await rl.question("👤 ")).trim();
  if (!text) continue;
  if (text === "/reset") {
    resetConversation(phone);
    console.log("🔄 reset\n");
    continue;
  }
  const { reply } = await handleMessage(phone, text);
  console.log(`\n🤖 ${reply}\n`);
}
