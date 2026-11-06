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

/**
 * Security (06/11/2026): the auth router ignores empty segments, so « /sign-up/email/ »,
 * « //sign-up//email » or an encoded letter reach the same endpoint. The gates read the
 * path the way the router does: decoded, lower-cased, without empty segments. A path that
 * cannot be decoded is treated as a sign-up (refused without an invitation).
 */
export function authEndpoint(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return "/sign-up/email";
  }
  const parts = decoded.toLowerCase().split("/").filter(Boolean);
  const at = parts.indexOf("auth");
  return "/" + (at >= 0 ? parts.slice(at + 1) : parts).join("/");
}
export const isSignUp = (pathname: string) => /^\/sign-up(\/|$)/.test(authEndpoint(pathname));
export const isPasswordSignIn = (pathname: string) => authEndpoint(pathname) === "/sign-in/email";
