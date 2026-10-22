import type { Pool } from "pg";
import { jobNames, jobs, type Env } from "./registry";

/**
 * B2: the state of the background tasks for /api/health: the last run and
 * the last good one of each. A task is late after two missed cycles; one
 * that never ran is late only once production says tasks are scheduled
 * (PFM_JOBS_EXPECTED=true), so a local machine stays green.
 */
export type JobState = { job: string; every: number; lastRun: string | null; lastOk: string | null; late: boolean };
export function lateJob(every: number, lastOk: Date | null, now: Date, expected: boolean) {
  if (!lastOk) return expected;
  return now.getTime() - lastOk.getTime() > 2 * every * 60000;
}
export async function jobStates(db: Pool, env: Env = process.env, now = new Date()): Promise<JobState[]> {
  const rows = (
    await db.query(
      "SELECT job,max(started_at) AS last_run,max(finished_at) FILTER (WHERE ok) AS last_ok FROM job_run WHERE job=ANY($1::text[]) GROUP BY job",
      [jobNames],
    )
  ).rows as { job: string; last_run: Date | null; last_ok: Date | null }[];
  const expected = env.PFM_JOBS_EXPECTED === "true";
  return jobNames.map((job) => {
    const r = rows.find((x) => x.job === job);
    return {
      job,
      every: jobs[job].every,
      lastRun: r?.last_run ? new Date(r.last_run).toISOString() : null,
      lastOk: r?.last_ok ? new Date(r.last_ok).toISOString() : null,
      late: lateJob(jobs[job].every, r?.last_ok ? new Date(r.last_ok) : null, now, expected),
    };
  });
}
/** Mails that should have left more than 30 minutes ago. */
export async function overdueMails(db: Pool) {
  return (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE state='pending' AND available_at<now()-interval '30 minutes'")).rows[0].n as number;
}
