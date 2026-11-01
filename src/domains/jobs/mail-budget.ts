import type { Pool } from "pg";

/**
 * B2: a free mail plan allows so many mails a day (MAIL_DAILY_LIMIT, for
 * instance 300). Once reached, the queue waits for the next day: the mails
 * stay « pending » and leave first thing tomorrow, nothing is lost. A run
 * sends at most MAIL_BATCH mails (50 by default) to stay within the time a
 * function may run. Mails written to the local folder do not count.
 */
export function mailLimits(env: Record<string, string | undefined>) {
  const n = (v: string | undefined, fallback: number, max: number) => {
    const x = Number.parseInt(v ?? "", 10);
    return Number.isFinite(x) && x >= 0 ? Math.min(x, max) : fallback;
  };
  return { daily: env.MAIL_DAILY_LIMIT ? n(env.MAIL_DAILY_LIMIT, Number.POSITIVE_INFINITY, 1000000) : Number.POSITIVE_INFINITY, batch: n(env.MAIL_BATCH, 50, 500) };
}
/** How many mails this run may send. Pure part: tested on its own. */
export function allowedNow(limits: { daily: number; batch: number }, sentToday: number) {
  return Math.max(0, Math.min(limits.batch, limits.daily - sentToday));
}
export async function mailBudget(db: Pool, env: Record<string, string | undefined>) {
  const r = (
    await db.query(
      `SELECT count(*) FILTER (WHERE state='sent' AND completed_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Brussels') AT TIME ZONE 'Europe/Brussels'))::int AS sent,
              count(*) FILTER (WHERE state='pending' AND available_at<=now())::int AS pending
         FROM mail_job`,
    )
  ).rows[0] as { sent: number; pending: number };
  return { sentToday: r.sent, pending: r.pending, allowed: allowedNow(mailLimits(env), r.sent) };
}
