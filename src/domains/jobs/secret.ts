import { createHash, timingSafeEqual } from "node:crypto";

/**
 * B2: a cron route answers only with « Authorization: Bearer <CRON_SECRET> »
 * (what Vercel Cron sends, and what the GitHub workflow sends). Without a
 * secret of at least 32 characters configured, the routes stay closed.
 */
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest(),
    b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
