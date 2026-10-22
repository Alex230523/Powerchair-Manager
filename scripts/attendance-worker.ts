import { Pool } from "pg";
import { attendanceTick } from "../src/domains/attendance/service";
import { eventMailTick } from "../src/domains/communication/service";
import { duesReminderTick } from "../src/domains/reminders/service";
import { fundingTaskTick } from "../src/domains/funding/service";
import { affiliationTick } from "../src/domains/affiliations/service";
import { licenceReminderTick } from "../src/domains/licences/service";
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
      // Sponsor conditions and grant tasks due in 7 days, partner renewals of the day (wave 15).
      const tasks = await fundingTaskTick(db);
      if (tasks) console.log("Funding task reminders sent:", tasks);
      // Affiliation periods that open today, told once to the presidents (wave 17, N2).
      const affiliations = await affiliationTick(db);
      if (affiliations) console.log("Affiliation renewals sent:", affiliations);
      // Driving licences that expire within 30 days, told once to their holder (wave 17, O1).
      const licences = await licenceReminderTick(db);
      if (licences) console.log("Licence reminders sent:", licences);
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
