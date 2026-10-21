import type { Pool } from "pg";
import { createHash } from "node:crypto";

/**
 * Who may create an account (wave 16, I1): only someone holding a valid
 * invitation for that very email address. Accounts are also created on the
 * server (club creation by a federation, demo data, operators' scripts),
 * which never goes through the public sign-up route.
 */
export { invitationHeader } from "./signup-header";

export async function signupAllowed(db: Pool, token: string | null, email: unknown) {
  if (!token || !/^[a-f0-9]{64}$/.test(token) || typeof email !== "string") return false;
  const hash = createHash("sha256").update(token).digest("hex");
  return !!(
    await db.query(
      "SELECT 1 FROM invitation WHERE token_hash=$1 AND lower(email)=lower($2) AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now())",
      [hash, email.trim()],
    )
  ).rowCount;
}
