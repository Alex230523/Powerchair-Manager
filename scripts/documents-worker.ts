import { Pool } from "pg";
import { sweepDocuments } from "../src/domains/documents/service";
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
console.log("Document expiry worker ready");
try {
  do {
    const count = await sweepDocuments(db);
    if (count) console.log("Expired documents processed:", count);
    if (process.argv.includes("--once")) break;
    for (let i = 0; i < 60 && !stop; i++)
      await new Promise((r) => setTimeout(r, 1000));
  } while (!stop);
} finally {
  await db.end();
}
