// Sanity check: verifies Google Calendar access and shows tomorrow's free slots.
import { config } from "./config.js";
import { getAvailableSlots, listUpcomingEvents } from "./calendar.js";
import { addDays, toLocal } from "./time.js";

console.log(`📅 Calendar: ${config.calendarId}\n`);

try {
  const events = await listUpcomingEvents();
  console.log(`Next ${events.length} event(s):`);
  for (const e of events) console.log(`  • ${e.when} — ${e.title}`);

  const tomorrow = addDays(toLocal(new Date()).date, 1);
  const slots = await getAvailableSlots("higiene-limpeza", tomorrow, addDays(tomorrow, 2));
  console.log(`\nFree slots for "${slots.service}" (${slots.durationMin} min):`);
  for (const d of slots.availableByDay) console.log(`  • ${d.day}: ${d.slots.join(", ")}`);
  if (slots.note) console.log(`  ${slots.note}`);
  console.log("\n✅ Calendar access OK");
} catch (err) {
  console.error("\n❌ Calendar check failed:", (err as Error).message);
  console.error("   - Is the Google Calendar API enabled in your Google Cloud project?");
  console.error("   - Is the calendar shared with the service account email (\"Make changes to events\")?");
  process.exit(1);
}
