import type { Pool, PoolClient } from "pg";

/** Console, series C: the support desk's figure read by the dashboard and the snapshots (no console import here). */
/** The median hours before the first answer, over the tickets opened in the last 30 days (null without any). */
export async function firstReplyMedianHours(c: PoolClient | Pool) {
  const r = (await c.query("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_reply_at-created_at))/3600) AS h FROM support_ticket WHERE created_at>now()-interval '30 days' AND first_reply_at IS NOT NULL")).rows[0].h as number | null;
  return r === null ? null : Math.round(Number(r) * 10) / 10;
}
