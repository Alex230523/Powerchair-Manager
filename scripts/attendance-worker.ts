import { Pool } from "pg";
import { attendanceTick } from "../src/domains/attendance/service";
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
