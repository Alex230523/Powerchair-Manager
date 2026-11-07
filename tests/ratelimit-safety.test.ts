import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { clientKey, limits, scale } from "../src/lib/rate-limit";
import { errors } from "../src/components/access-copy";

/**
 * Security (07/11/2026), missing rate limiting: every route of the API is
 * counted, by account or by network address; the costly or mailing actions
 * have their own, lower limits; the limits live in the database (shared by
 * every function of the site), keep no address in clear, can be raised for
 * the test robots but never removed.
 */
const routes = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });
const read = (f: string) => readFileSync(f, "utf8");

describe("missing rate limiting", () => {
  it("keeps limits a person never meets and a script always does", () => {
    expect(limits["public-write"]).toEqual({ max: 10, window: 600 });
    expect(limits["public-write-day"].max).toBeLessThanOrEqual(50);
    expect(limits["user-invite"].max).toBeLessThanOrEqual(30);
    expect(limits["user-export"].max).toBeLessThanOrEqual(20);
    for (const [b, l] of Object.entries(limits)) {
      expect(b, b).toMatch(/^[a-z:-]{3,40}$/);
      expect(l.max, b).toBeGreaterThan(0);
      expect(l.window, b).toBeGreaterThanOrEqual(60);
    }
    // The scale raises, never removes: nonsense or below one counts as one.
    for (const v of [undefined, "", "0", "-5", "0.5", "abc", "Infinity"]) expect(scale({ PFM_RATE_LIMIT_SCALE: v }), String(v)).toBe(1);
    expect(scale({ PFM_RATE_LIMIT_SCALE: "1000" })).toBe(1000);
    expect(scale({ PFM_RATE_LIMIT_SCALE: "1e12" })).toBe(100000);
  });

  it("counts a network address without keeping it, an IPv6 subscriber by his block", () => {
    const req = (h: Record<string, string>) => new Request("https://pfm.example/api/x", { headers: h });
    const k = clientKey(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }));
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain("203");
    expect(clientKey(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(k);
    expect(clientKey(req({ "x-real-ip": "203.0.113.8" }))).not.toBe(k);
    expect(clientKey(req({ "x-real-ip": "2001:db8:1:2:aaaa::1" }))).toBe(clientKey(req({ "x-real-ip": "2001:DB8:1:2:bbbb::9" })));
    expect(clientKey(req({ "x-real-ip": "2001:db8:1:3::1" }))).not.toBe(clientKey(req({ "x-real-ip": "2001:db8:1:2::1" })));
    expect(clientKey(req({}))).toMatch(/^[0-9a-f]{32}$/);
  });

  it("counts every route of the API, by account or by address", () => {
    const http = read("src/lib/http.ts");
    // Every signed-in change passes principal(), which counts it.
    expect(http).toMatch(/const p = \{ userId: s\.user\.id, sessionId: s\.session\.id \};\n\s*await countWrite\(request, p\.userId\);/);
    expect(http).toContain('if (request.method !== "GET" && request.method !== "HEAD") await limit(getDb(), "user-write", userId);');
    expect(http).toMatch(/const flood = tooMany\(e\);\s*if \(flood\) return flood;\s*if \(e instanceof AccessError\)/);
    expect(http).toContain('"Retry-After": String(e.retryAfter)');
    const counted = /principal\(|principalIn\(|principalCounted\(|throttle\(|gate\(|apiV1\(|countWrite\(|limit\(getDb\(\), "user-|mcpAuth|orgMcpAuth|cronAuthorized|getAuth\(\)\.handler/;
    const missing: string[] = [];
    for (const f of routes("src/app/api")) {
      const s = read(f);
      if (!counted.test(s)) missing.push(f);
      // A route reading the session itself counts its changes and answers a flood itself.
      if (s.includes("api.getSession(")) {
        expect(s, f).toMatch(/countWrite\(request, session\.user\.id\)|limit\(getDb\(\), "user-export", session\.user\.id\)/);
        expect(s, f).toContain("tooMany(e)");
      }
    }
    expect(missing).toEqual([]);
    expect(read("src/lib/api-v1.ts")).toContain('await gate(request, "api-ip")');
    expect(read("src/app/api/billing/mollie/route.ts")).toContain('await gate(request, "webhook-ip")');
    for (const f of ["registrations/guest", "open-events/public", "tax/identity", "welcome/[token]"]) expect(read(`src/app/api/${f}/route.ts`), f).toContain('await throttle(getDb(), request, "public-write", "public-write-day");');
  });

  it("gives the costly and the mailing actions their own limits", () => {
    for (const f of ["exports", "club/export/[token]", "tax/export", "privacy/export", "open-events/export"]) expect(read(`src/app/api/${f}/route.ts`), f).toContain('principalCounted(request, "user-export")');
    expect(read("src/app/api/accounts/export/route.ts")).toContain('await limit(getDb(), "user-export", p.userId);');
    expect(read("src/app/api/console/assistant/route.ts")).toContain('principalCounted(request, "operator-assistant")');
    expect(read("src/domains/access/service.ts")).toContain('if (command.action === "invite" || command.action === "resendInvitation") await limit(db, "user-invite", p.userId);');
    expect(read("src/domains/access/presidency.ts")).toContain('if (command.action === "handOver") await limit(db, "user-invite", p.userId);');
    expect(read("src/domains/support/service.ts")).toContain('if (command.action === "open" || command.action === "reply") await limit(db, "user-support", p.userId);');
    expect(read("src/domains/assistant/service.ts")).toContain('if (spent >= dailyTokens()) throw new AccessError("ASSISTANT_QUOTA", 429);');
    // Sign-in, sign-up and the reset links keep their own (Better Auth, in the database).
    expect(read("src/lib/auth.ts")).toMatch(/rateLimit: \{\s*enabled: true,\s*storage: "database"/);
  });

  it("raises the limits for the test robots only, and says it in the three languages", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(/^ {2}PFM_RATE_LIMIT_SCALE: "1000"$/m);
    expect(read("playwright.config.ts")).toContain('PFM_RATE_LIMIT_SCALE: process.env.PFM_RATE_LIMIT_SCALE ?? "1000"');
    expect(read(".env.example")).toMatch(/^PFM_RATE_LIMIT_SCALE=$/m);
    for (const code of ["RATE_LIMITED", "ASSISTANT_QUOTA"]) for (const l of ["fr", "nl", "en"] as const) expect((errors[code]?.[l] ?? "").length, `${code} ${l}`).toBeGreaterThan(30);
  });
});
