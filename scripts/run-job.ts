import { Pool } from "pg";
import { isJob, jobNames } from "../src/domains/jobs/registry";
import { runJob } from "../src/domains/jobs/runner";

/**
 * B2: runs one background task once, like the cron route does, from a
 * terminal or a scheduler that has the database address:
 *   npx tsx scripts/run-job.ts mail
 * The long-running workers (mail-worker, documents-worker, attendance-worker)
 * stay for the local machine.
 */
const name = process.argv[2] ?? "";
if (!isJob(name)) {
  console.error(`Usage: tsx scripts/run-job.ts <${jobNames.join("|")}>`);
  process.exit(2);
}
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
try {
  const result = await runJob(db, name);
  console.log(JSON.stringify(result));
  if (result.status === "failed") process.exitCode = 1;
} finally {
  await db.end();
}
