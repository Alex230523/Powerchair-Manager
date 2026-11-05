import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bpcfPolicy, certificateNumber, fineDefault, policyOf, policySchema, trainingIndemnity } from "../src/domains/federation/policy";
import { consoleCommand, operatorRoles } from "../src/domains/console/schema";
import { envOperators } from "../src/domains/console/service";
import { federationPolicyCopy } from "../src/components/federation-policy-copy";
import { consoleCopy } from "../src/components/console-copy";
import { transfersCopy } from "../src/components/transfers-copy";
import { apiRoutes, pages } from "./access-matrix";

/** 05/11/2026: the federation's rulebook as data, the international dossier, the operator's console. */
const keys = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v !== null && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])) : [];

describe("the rulebook of a federation", () => {
  it("applies the BPCF 2025 scale without a policy, and completes a partial one", () => {
    expect(policyOf(undefined)).toEqual(bpcfPolicy);
    expect(policyOf({ trainingRates: { international: { academy: 60000 } }, fineDefaults: { late: -5 } })).toMatchObject({
      trainingRates: { national: bpcfPolicy.trainingRates.national, international: { academy: 60000, elite: 75000, elite_certified: 100000 } },
      fineDefaults: { late: 2500 },
    });
    expect(policySchema.safeParse(bpcfPolicy).success).toBe(true);
    expect(policySchema.safeParse({ ...bpcfPolicy, internationalFileFeeCents: -1 }).success).toBe(false);
  });
  it("computes the compensation from the policy given, capped, with the file fee abroad", () => {
    expect(trainingIndemnity("academy", 3)).toBe(15000);
    expect(trainingIndemnity("academy", 2, "international")).toBe(125000);
    const nl = policyOf({ trainingRates: { international: { academy: 60000 } }, internationalFileFeeCents: 30000, indemnityCaps: { international: 100000 } });
    expect(trainingIndemnity("academy", 2, "international", nl)).toBe(100000);
    expect(trainingIndemnity("academy", 1, "international", nl)).toBe(90000);
    expect(trainingIndemnity("", 3, "national", nl)).toBeNull();
    expect(fineDefault(nl, "late")).toBe(2500);
    expect(fineDefault(nl, "other")).toBeNull();
  });
  it("numbers the certificates by year and sequence", () => {
    expect(certificateNumber(2026, 7)).toBe("CIT-2026-0007");
  });
  it("says the same things in the three languages", () => {
    for (const copy of [federationPolicyCopy, consoleCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
    }
    expect(keys(transfersCopy.nl.bpcf2)).toEqual(keys(transfersCopy.fr.bpcf2));
    expect(keys(transfersCopy.en.bpcf2)).toEqual(keys(transfersCopy.fr.bpcf2));
    for (const f of ["src/components/federation-policy-copy.ts", "src/components/console-copy.ts", "src/components/transfers-copy.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/[—–]/);
  });
});

describe("the operator's console", () => {
  it("reads the owners from the configuration, trimmed and lower-cased", () => {
    expect(envOperators({})).toEqual([]);
    expect(envOperators({ PFM_OPERATOR_EMAILS: " Alex@Example.test ,, sam@example.test " })).toEqual(["alex@example.test", "sam@example.test"]);
  });
  it("accepts only the commands it knows, with a real role", () => {
    expect(operatorRoles).toEqual(["owner", "support", "finance", "readonly"]);
    expect(consoleCommand.safeParse({ action: "addOperator", email: "a@b.test", role: "support" }).success).toBe(true);
    expect(consoleCommand.safeParse({ action: "addOperator", email: "a@b.test", role: "god" }).success).toBe(false);
    expect(consoleCommand.safeParse({ action: "note", organizationId: "x", text: "y" }).success).toBe(false);
  });
  it("is in the access matrix, refused to every club or federation role", () => {
    const c = apiRoutes["console"];
    expect(c.methods).toEqual(["GET", "POST"]);
    expect(Object.values(c.expect!.GET!).filter((s) => s === 200)).toEqual([]);
    expect(pages["/console"]).toBeDefined();
    expect(pages["/federation/policy"]).toBeDefined();
  });
  it("has its own bar in the shell and never the club menu", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain('console-bar');
    expect(shell).toMatch(/\/console\(\\\/\|\$\)\//);
  });
});

describe("the platform's billing (console, step 4) and the suspension (step 3)", () => {
  it("numbers invoices per year, computes the monthly equivalent and the reminder steps", async () => {
    const { invoiceNumber, monthlyCents, reminderDue, billingCommand } = await import("../src/domains/billing/schema");
    expect(invoiceNumber(2026, 12)).toBe("F-2026-0012");
    expect(monthlyCents(24000, "year")).toBe(2000);
    expect(monthlyCents(300, "month", 3)).toBe(900);
    expect(reminderDue("2026-11-01", "2026-11-02", 0)).toBe(0);
    expect(reminderDue("2026-11-01", "2026-11-04", 0)).toBe(1);
    expect(reminderDue("2026-11-01", "2026-11-04", 1)).toBe(0);
    expect(reminderDue("2026-11-01", "2026-11-12", 1)).toBe(2);
    expect(reminderDue("2026-11-01", "2026-11-25", 2)).toBe(3);
    expect(reminderDue("2026-11-01", "2026-12-25", 3)).toBe(0);
    expect(billingCommand.safeParse({ action: "plan", code: "Club An", name: "x", amountCents: 1, period: "year", basis: "organization" }).success).toBe(false);
    expect(billingCommand.safeParse({ action: "plan", code: "club-an", name: "Club", amountCents: 1, period: "year", basis: "organization" }).success).toBe(true);
  });
  it("blocks the writes of a suspended organisation at the door, the account and the console apart", () => {
    const http = readFileSync("src/lib/http.ts", "utf8");
    expect(http).toContain('ORG_SUSPENDED');
    expect(http).toMatch(/workspace\|account\|auth\|console\|feedback/);
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("suspended-banner");
    expect(apiRoutes["console/billing"].expect!.GET!.president).toBe(403);
    expect(apiRoutes["club/billing"].expect!.GET!.coach).toBe(403);
  });
});
