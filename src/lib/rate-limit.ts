import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/**
 * Security (07/11/2026), missing rate limiting. A counter per bucket, key and
 * fixed window, kept in PostgreSQL: the site runs as many short-lived
 * functions, so a counter in memory would count nothing. Past the limit, the
 * request is refused with 429 and the seconds to wait.
 *
 * The limits are far above what a person does by hand; they stop a script.
 * PFM_RATE_LIMIT_SCALE multiplies them (the tests' fast robots use 1000); it
 * can raise a limit, never remove it.
 */
export const limits = {
  /** A public page's data, a widget, a calendar feed, a receipt by its link. */
  "public-read": { max: 300, window: 60 },
  /** A form without an account: a registration link, an open event, an unsubscription. */
  "public-write": { max: 10, window: 600 },
  "public-write-day": { max: 40, window: 86400 },
  /** The public API before its key is checked, and the payment provider's calls. */
  "api-ip": { max: 120, window: 60 },
  "webhook-ip": { max: 120, window: 60 },
  /** Any change by a signed-in account. */
  "user-write": { max: 300, window: 60 },
  /** E-mails sent to addresses typed by someone: invitations, links again, a presidency handed over. */
  "user-invite": { max: 30, window: 3600 },
  /** Whole files built on demand: exports, archives. */
  "user-export": { max: 20, window: 600 },
  /** Support tickets and their messages. */
  "user-support": { max: 30, window: 3600 },
  /** The console's assistant: each turn calls the model (and costs). */
  "operator-assistant": { max: 40, window: 600 },
} as const;
export type Bucket = keyof typeof limits;

/** Refused: too many in this window. Not an AccessError (no import cycle with the domains); the routes answer it with 429. */
export class RateLimited extends Error {
  code = "RATE_LIMITED" as const;
  status = 429 as const;
  constructor(public retryAfter: number) {
    super("RATE_LIMITED");
    this.name = "RateLimited";
  }
}

export function scale(env: Record<string, string | undefined> = process.env) {
  const n = Number(env.PFM_RATE_LIMIT_SCALE);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100000) : 1;
}

/** Counts one more request; refuses it past the limit. */
export async function limit(db: Pool | PoolClient, bucket: Bucket, key: string, env: Record<string, string | undefined> = process.env) {
  const { max, window } = limits[bucket];
  const row = (
    await db.query(
      `INSERT INTO rate_counter(bucket,key,window_start,count)
       VALUES($1,$2,to_timestamp(floor(extract(epoch FROM now())/$3)*$3),1)
       ON CONFLICT (bucket,key,window_start) DO UPDATE SET count=rate_counter.count+1
       RETURNING count,ceil($3-(extract(epoch FROM now())-extract(epoch FROM rate_counter.window_start)))::int AS reset`,
      [bucket, key.slice(0, 100), window],
    )
  ).rows[0] as { count: number; reset: number };
  // Old windows go now and then: the table stays small.
  if (Math.random() < 0.01) await db.query("DELETE FROM rate_counter WHERE window_start<now()-interval '1 day'");
  if (row.count > max * scale(env)) throw new RateLimited(Math.max(1, row.reset));
}

/**
 * The network address of a request, hashed: Vercel sets x-real-ip and
 * x-forwarded-for itself (a client cannot choose them). An IPv6 address
 * counts by its /64, the block a single subscriber gets.
 */
export function clientKey(request: Request) {
  const raw = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim().toLowerCase() || "unknown";
  const ip = raw.includes(":") ? raw.split(":").slice(0, 4).join(":") : raw;
  return createHash("sha256").update("pfm-rate-v1:" + ip).digest("hex").slice(0, 32);
}

/** For a route without an account: counts the address. */
export async function throttle(db: Pool | PoolClient, request: Request, ...buckets: Bucket[]) {
  const key = clientKey(request);
  for (const b of buckets) await limit(db, b, key);
}
