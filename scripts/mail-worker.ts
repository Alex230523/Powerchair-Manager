import { Pool } from "pg";
import {
  processOne,
  recoverExpired,
} from "../src/domains/notifications/worker";
import { createTransport } from "../src/domains/notifications/transport";
import { digestTick } from "../src/domains/digest/service";
const once = process.argv.includes("--once"),
  transport = createTransport(
    process.env,
    process.argv.includes("--allow-external"),
  );
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
});
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log("Notification worker ready; transport=" + transport.mode);
// The weekly digests (wave 15, C7) are built about once a minute, before the queue is emptied.
let digestAt = 0;
try {
  do {
    await recoverExpired(db);
    if (once || Date.now() - digestAt >= 60000) {
      digestAt = Date.now();
      try {
        const digests = await digestTick(db);
        if (digests) console.log("Weekly digests queued:", digests);
      } catch (e) {
        console.error("Weekly digest tick:", e instanceof Error ? e.name : "unknown");
        if (once) throw e;
      }
    }
    let count = 0;
    while (!stopping && count < 20) {
      const result = await processOne(db, transport);
      if (!result) break;
      console.log("Mail job", result.id, result.state);
      count++;
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (!stopping);
} finally {
  await db.end();
}
