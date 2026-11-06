import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { authEndpoint, isPasswordSignIn, isSignUp } from "../src/domains/access/signup";
import { MAX_FAILURES, WINDOW_MINUTES } from "../src/domains/access/lockout";

/**
 * Security (06/11/2026), broken authentication: the gates read an address the
 * way the auth router does; the settings that keep accounts safe stay as they
 * are; every route that changes something with a session cookie checks where
 * the request comes from.
 */
const routes = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });

describe("broken authentication", () => {
  it("reads the auth address the way the router does: no form of the sign-up escapes the invitation", () => {
    for (const p of [
      "/api/auth/sign-up/email",
      "/api/auth/sign-up/email/",
      "/api/auth//sign-up//email",
      "/api/auth/sign-up/%65mail",
      "/api/auth/SIGN-UP/EMAIL",
      "/api/auth/sign-up/email///",
      "/api/auth/%2Fsign-up/email",
      "/api/auth/sign-up/%E0%A4%A",
    ])
      expect(isSignUp(p), p).toBe(true);
    for (const p of ["/api/auth/sign-in/email", "/api/auth/get-session", "/api/auth/sign-out", "/api/auth/request-password-reset"]) expect(isSignUp(p), p).toBe(false);
    for (const p of ["/api/auth/sign-in/email", "/api/auth/sign-in/email/", "/api/auth//Sign-In/%65mail"]) expect(isPasswordSignIn(p), p).toBe(true);
    expect(authEndpoint("/api/auth//reset-password/")).toBe("/reset-password");
    expect(isPasswordSignIn("/api/auth/sign-in/social")).toBe(false);
  });
  it("checks the invitation in front of the library and again inside it; refuses a sign-in after repeated failures", () => {
    const route = readFileSync("src/app/api/auth/[...all]/route.ts", "utf8");
    expect(route).toContain("isSignUp(path)");
    expect(route).not.toMatch(/endsWith\(/);
    expect(route).toContain("signInBlocked(");
    expect(route).toContain("recordSignIn(");
    expect(MAX_FAILURES).toBeLessThanOrEqual(10);
    expect(WINDOW_MINUTES).toBeGreaterThanOrEqual(15);
    const auth = readFileSync("src/lib/auth.ts", "utf8");
    expect(auth).toMatch(/ctx\.path !== "\/sign-up\/email"/);
    expect(auth).toContain("signupAllowed(pool");
  });
  it("keeps the settings that protect accounts", () => {
    const auth = readFileSync("src/lib/auth.ts", "utf8");
    expect(Number(auth.match(/minPasswordLength:\s*(\d+)/)?.[1])).toBeGreaterThanOrEqual(12);
    expect(auth).toMatch(/revokeSessionsOnPasswordReset:\s*true/);
    expect(auth).toMatch(/cookieCache:\s*\{\s*enabled:\s*false/);
    expect(Number(auth.match(/expiresIn:\s*([\d* ]+),/)?.[1].split("*").reduce((a, b) => a * Number(b), 1))).toBeLessThanOrEqual(86400);
    expect(auth).toMatch(/rateLimit:\s*\{\s*enabled:\s*true/);
    expect(auth).toMatch(/"\/request-password-reset":\s*\{\s*window:\s*300,\s*max:\s*3/);
    expect(auth).toContain("BETTER_AUTH_SECRET must contain at least 32 characters");
    // A deactivated account opens no session; an existing one stops at the next call.
    expect(auth).toMatch(/if \(result\.rowCount && !result\.rows\[0\]\.active\) return false/);
    expect(readFileSync("src/domains/access/service.ts", "utf8")).toMatch(/WHERE u\.id=\$1 AND s\.id=\$2 AND u\.active AND s\."expiresAt">now\(\)/);
  });
  it("checks the origin of every request that changes something with a session cookie", () => {
    const bearer = /cronAuthorized|mcpAuth|orgMcpAuth|mollieWebhook|getAuth\(\)\.handler/;
    const missing: string[] = [];
    for (const f of routes("src/app/api")) {
      const s = readFileSync(f, "utf8");
      if (!/export (async function|const) (POST|PUT|PATCH|DELETE)\b/.test(s)) continue;
      if (/origin\(request\)|request\.headers\.get\("origin"\) !== process\.env\.BETTER_AUTH_URL/.test(s) || bearer.test(s)) continue;
      missing.push(f);
    }
    expect(missing).toEqual([]);
    // The check compares with the site's own address, never with a pattern.
    expect(readFileSync("src/lib/http.ts", "utf8")).toMatch(/request\.headers\.get\("origin"\) !== process\.env\.BETTER_AUTH_URL/);
  });
  it("closes the door of an operator who leaves: keys refused at the entrance, accesses ended", () => {
    expect(readFileSync("src/domains/mcp/service.ts", "utf8")).toMatch(/if \(k\.operator_revoked\) throw new McpAuthError\(401/);
    const console = readFileSync("src/domains/console/service.ts", "utf8");
    expect(console).toContain("UPDATE operator_api_key SET revoked_at=now() WHERE operator_id=$1 AND revoked_at IS NULL");
    expect(console).toContain("UPDATE platform_borrow SET ended_at=now() WHERE operator_id=$1 AND ended_at IS NULL");
  });
});
