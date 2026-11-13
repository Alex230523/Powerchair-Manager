import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { demoAccounts, demoSwitchEnabled } from "../src/domains/demo/switch";

/**
 * 12/11/2026: the demo profile switch exists on a Vercel preview only (or a
 * local run that asks for it), with the project's own demo password; never in
 * production, and only towards the six demo accounts.
 */
describe("demo profile switch", () => {
  const pw = "a-demo-password-of-the-project";
  it("is on for a preview with the demo password, never in production", () => {
    expect(demoSwitchEnabled({ VERCEL_ENV: "preview", PFM_DEMO_PASSWORD: pw })).toBe(true);
    expect(demoSwitchEnabled({ VERCEL_ENV: "production", PFM_DEMO_PASSWORD: pw, PFM_DEMO_SWITCH: "true" })).toBe(false);
    expect(demoSwitchEnabled({ VERCEL_ENV: "preview" })).toBe(false);
    expect(demoSwitchEnabled({ VERCEL_ENV: "preview", PFM_DEMO_PASSWORD: "short" })).toBe(false);
    expect(demoSwitchEnabled({ NODE_ENV: "production", PFM_DEMO_PASSWORD: pw, PFM_DEMO_SWITCH: "true" })).toBe(false);
    expect(demoSwitchEnabled({ NODE_ENV: "development", PFM_DEMO_PASSWORD: pw, PFM_DEMO_SWITCH: "true" })).toBe(true);
    expect(demoSwitchEnabled({ NODE_ENV: "development", PFM_DEMO_PASSWORD: pw })).toBe(false);
  });
  it("leads only to the six demo accounts, from a demo account, counted and journaled by the session", () => {
    expect(demoAccounts.map((a) => a.email)).toEqual(["president@demo.pfm", "coach@demo.pfm", "joueur@demo.pfm", "parent@demo.pfm", "federation@demo.pfm", "arbitre@demo.pfm"]);
    const route = readFileSync("src/app/api/demo/switch/route.ts", "utf8");
    // Refused before anything else when off; then the account must be a demo one, counted.
    expect(route.indexOf("if (!demoSwitchEnabled()) throw")).toBeLessThan(route.indexOf("await principal(request)", route.indexOf("export async function POST")));
    expect(route).toContain('await limit(getDb(), "user-invite", p.userId);');
    expect(route).toContain("if (!(await isDemoAccount(getDb(), p.userId))) throw new AccessError(\"FORBIDDEN\");");
    expect(readFileSync("src/domains/demo/switch.ts", "utf8")).toContain("o.is_demo");
  });
});
