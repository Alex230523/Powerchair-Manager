import { Pool } from "pg";
import {
  processOne,
  recoverExpired,
} from "../src/domains/notifications/worker";
import { createTransport } from "../src/domains/notifications/transport";
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
try {
  do {
    await recoverExpired(db);
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
