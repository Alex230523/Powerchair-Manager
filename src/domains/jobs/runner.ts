import type { Pool } from "pg";
import { logEvent } from "../../lib/log";
import { jobs, type Env, type JobName } from "./registry";

/**
 * B2: one run of a task. A PostgreSQL advisory lock keeps two schedulers
 * (or a retry) from running the same task at the same time; every run is
 * written to job_run, with its counts or its error code, never personal data.
 */
export async function runJob(db: Pool, name: JobName, env: Env = process.env) {
  const lock = await db.connect();
  try {
    const got = (await lock.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", ["pfm:job:" + name])).rows[0].ok as boolean;
    if (!got) {
      logEvent("warn", "job.locked", { job: name });
      return { job: name, status: "locked" as const };
    }
    const id = (await db.query("INSERT INTO job_run(job) VALUES($1) RETURNING id", [name])).rows[0].id as string;
    const started = Date.now();
    try {
      const summary = await jobs[name].run(db, env);
      await db.query("UPDATE job_run SET finished_at=now(),ok=true,summary=$2 WHERE id=$1", [id, JSON.stringify(summary)]);
      logEvent("info", "job.done", { job: name, ms: Date.now() - started, ...summary });
      return { job: name, status: "done" as const, summary };
    } catch (e) {
      const code = (e instanceof Error ? e.message : "UNKNOWN").replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "UNKNOWN";
      await db.query("UPDATE job_run SET finished_at=now(),ok=false,error_code=$2 WHERE id=$1", [id, code]);
      logEvent("error", "job.failed", { job: name, ms: Date.now() - started, code });
      return { job: name, status: "failed" as const, code };
    } finally {
      await lock.query("SELECT pg_advisory_unlock(hashtext($1))", ["pfm:job:" + name]);
    }
  } finally {
    lock.release();
  }
}
