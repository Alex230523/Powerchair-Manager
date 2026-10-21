import { Pool } from "pg";
import { attendanceTick } from "../src/domains/attendance/service";
import { eventMailTick } from "../src/domains/communication/service";
import { duesReminderTick } from "../src/domains/reminders/service";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
console.log("Attendance worker ready");
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
try {
  do {
    try {
      const n = await attendanceTick(db);
      if (n) console.log("Attendance scheduled actions:", n);
      // Mails prepared before an event, sent at the chosen time (wave 9).
      const mails = await eventMailTick(db);
      if (mails) console.log("Event mails sent:", mails);
      // Automatic dues reminders (wave 11), when a club switched them on.
      const reminders = await duesReminderTick(db);
      if (reminders) console.log("Dues reminders sent:", reminders);
    } catch (e) {
      console.error(
        "Attendance worker:",
        e instanceof Error ? e.name : "unknown",
      );
      if (process.argv.includes("--once")) throw e;
    }
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
  } while (!stopping);
} finally {
  await db.end();
}
