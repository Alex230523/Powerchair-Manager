import type { Pool } from "pg";
import { createHash } from "node:crypto";

/**
 * Security (06/11/2026), broken authentication: the auth library limits the
 * sign-ins per network address; this limits them per account. After ten
 * failed passwords for one address within fifteen minutes, from wherever, the
 * address is refused until the oldest of them is fifteen minutes old. A good
 * password clears the count. The answer never says whether the account exists.
 */
export const MAX_FAILURES = 10;
export const WINDOW_MINUTES = 15;
const hash = (email: string) => createHash("sha256").update("pfm-auth-v1:" + email.trim().toLowerCase()).digest("hex");

export async function signInBlocked(db: Pool, email: unknown) {
  if (typeof email !== "string" || !email.trim()) return false;
  const n = (await db.query(`SELECT count(*)::int AS n FROM auth_failure WHERE email_hash=$1 AND at>now()-make_interval(mins => $2)`, [hash(email), WINDOW_MINUTES])).rows[0].n as number;
  return n >= MAX_FAILURES;
}
export async function recordSignIn(db: Pool, email: unknown, ok: boolean) {
  if (typeof email !== "string" || !email.trim()) return;
  if (ok) {
    await db.query("DELETE FROM auth_failure WHERE email_hash=$1", [hash(email)]);
    return;
  }
  await db.query("INSERT INTO auth_failure(email_hash) VALUES($1)", [hash(email)]);
  if (Math.random() < 0.02) await db.query("DELETE FROM auth_failure WHERE at<now()-interval '1 day'");
}
