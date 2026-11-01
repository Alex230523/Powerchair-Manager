import { Pool } from "pg";
import { eventMailTick } from "../src/domains/communication/service";
import { fundingTaskTick } from "../src/domains/funding/service";
import { affiliationTick } from "../src/domains/affiliations/service";
import { equipmentLoanTick } from "../src/domains/equipment/loans";
import { taskSourcesTick } from "../src/domains/tasks/sources";
import { runAutomations } from "../src/domains/automations/engine";
import { ruleKeys } from "../src/domains/automations/catalog";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
console.log("Attendance worker ready");
let stopping = false;
let sourcesAt = 0;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
try {
  do {
    try {
      // B7: the « convocation sans réponse » automation (attendance reminders and minimum checks).
      const n = (await runAutomations(db, undefined, ["callNoAnswer"])).sent;
      if (n) console.log("Attendance scheduled actions:", n);
      // Mails prepared before an event, sent at the chosen time (wave 9).
      const mails = await eventMailTick(db);
      if (mails) console.log("Event mails sent:", mails);
      // Automatic dues reminders (wave 11), when a club switched them on.
      // B7: the catalogue of automations (dues, documents, grants, sponsors, licences, …), each once a run.
      const reminders = (await runAutomations(db, undefined, ruleKeys.filter((r) => r !== "callNoAnswer"))).sent;
      if (reminders) console.log("Automations sent:", reminders);
      // A1: the tasks the application creates by itself, once an hour (before their reminders).
      if (Date.now() - sourcesAt > 3600000 || process.argv.includes("--once")) {
        sourcesAt = Date.now();
        const sources = await taskSourcesTick(db);
        if (sources) console.log("Automatic tasks created or closed:", sources);
      }
      // Sponsor conditions and grant tasks due in 7 days, partner renewals of the day (wave 15).
      const tasks = await fundingTaskTick(db, { tasks: true });
      if (tasks) console.log("Funding task reminders sent:", tasks);
      // Affiliation periods that open today, told once to the presidents (wave 17, N2).
      const affiliations = await affiliationTick(db);
      if (affiliations) console.log("Affiliation renewals sent:", affiliations);
      // Chair loans ending within seven days, told once to both clubs (wave 17, Q1).
      const loans = await equipmentLoanTick(db);
      if (loans) console.log("Loan return reminders sent:", loans);
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
