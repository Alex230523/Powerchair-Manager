import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clubRequestSchema, clubRequestCommand, mails, openCountries } from "../src/domains/independent/service";
import { billingCommand, discountCode, discountOf } from "../src/domains/billing/schema";
import { nextDay, yearOn } from "../src/domains/billing/service";
import { menuGroups, type Workspace } from "../src/components/menu";
import { joinClubCopy, joinCopy } from "../src/components/join-copy";
import { independentCopy } from "../src/components/independent-copy";
import { limits } from "../src/lib/rate-limit";

/**
 * 12/11/2026: a club can use the platform without a federation. The request's
 * form, the discount codes, the invoice's dates and the menu of a club
 * without a federation.
 */
const read = (f: string) => readFileSync(f, "utf8");
const form = { clubName: "Les Roues Libres", countryCode: "FR", city: "Lille", presidentName: "Inès Martin", presidentEmail: "ines@example.test", locale: "fr", acceptTerms: true };
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();

describe("club without a federation", () => {
  it("takes a request only for the open countries, with the terms accepted", () => {
    expect([...openCountries]).toEqual(["BE", "NL", "FR", "GB", "US"]);
    expect(clubRequestSchema.safeParse(form).success).toBe(true);
    expect(clubRequestSchema.safeParse({ ...form, countryCode: "DE" }).success).toBe(false);
    expect(clubRequestSchema.safeParse({ ...form, acceptTerms: false }).success).toBe(false);
    expect(clubRequestSchema.safeParse({ ...form, presidentEmail: "pas-une-adresse" }).success).toBe(false);
    expect(clubRequestSchema.safeParse({ ...form, website: "http://spam" }).success).toBe(false);
    expect(clubRequestSchema.parse({ ...form, discountCode: "bienvenue-50" }).discountCode).toBe("BIENVENUE-50");
    expect(clubRequestSchema.safeParse({ ...form, discountCode: "x;--" }).success).toBe(false);
    expect(clubRequestCommand.safeParse({ action: "refuse", id: "6f0c1c9e-8a43-4c8e-9a39-0a3d6f1c0b11", reason: "" }).success).toBe(false);
  });

  it("makes discount codes of one kind, and never takes more than the invoice", () => {
    expect(discountCode.parse(" offert-100 ")).toBe("OFFERT-100");
    expect(discountCode.safeParse("ABC").success).toBe(false);
    const base = { action: "discount", code: "LANCEMENT", cycles: 1 };
    expect(billingCommand.safeParse({ ...base, percent: 20 }).success).toBe(true);
    expect(billingCommand.safeParse({ ...base, amountCents: 2000 }).success).toBe(true);
    expect(billingCommand.safeParse({ ...base, percent: 20, amountCents: 2000 }).success).toBe(false);
    expect(billingCommand.safeParse({ ...base }).success).toBe(false);
    expect(billingCommand.safeParse({ ...base, percent: 101 }).success).toBe(false);
    expect(discountOf(9900, { percent: 50, amount_cents: null })).toBe(4950);
    expect(discountOf(9900, { percent: 100, amount_cents: null })).toBe(9900);
    expect(discountOf(9900, { percent: null, amount_cents: 20000 })).toBe(9900);
    expect(discountOf(9900, { percent: null, amount_cents: 1500 })).toBe(1500);
  });

  it("invoices a year from the day after the trial", () => {
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(yearOn("2026-12-12")).toBe("2027-12-11");
    expect(yearOn("2028-02-29")).toBe("2029-02-28");
  });

  it("keeps the federal modules out of a club without a federation's menu", () => {
    const ws = (federation_id: string | null): Workspace => ({
      user: { name: "Inès" },
      contexts: [{ id: "m", name: "Club", role: "club_president" }],
      profiles: [],
      selected: { id: "m", organization_id: "o", organization_name: "Club", kind: "club", federation_id, logo_version: null },
      permissions: ["people.read", "teams.manage", "calendar.manage", "attendance.manage", "members.read", "mandates.manage"],
    });
    const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));
    for (const r of ["/transfers", "/classification", "/discipline", "/circulars"]) {
      expect(routes(ws(null))).not.toContain(r);
      expect(routes(ws("f"))).toContain(r);
    }
    expect(routes(ws(null))).toContain("/teams");
  });

  it("writes every sentence in the three languages, with the same keys and no long dash", () => {
    for (const copy of [joinClubCopy, joinCopy, independentCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
      expect(JSON.stringify(copy)).not.toMatch(/[\u2013\u2014]/);
    }
    for (const l of ["fr", "nl", "en"] as const) {
      expect(mails.confirm(l, "Club", "https://x").text).toContain("https://x");
      expect(mails.refused(l, "Club", "Raison").text).toContain("Raison");
    }
    expect(joinClubCopy.fr.price).toContain("99 €");
    expect(joinClubCopy.fr.price).toContain("30 jours");
  });

  it("counts the public form, the confirmation and the codes typed by a president", () => {
    expect(read("src/app/api/join/club/route.ts")).toContain('throttle(getDb(), request, "public-write", "public-write-day")');
    expect(read("src/app/api/join/club/confirm/route.ts")).toContain('throttle(getDb(), request, "public-write", "public-write-day")');
    expect(read("src/app/api/club/billing/route.ts")).toContain('principalCounted(request, "user-code")');
    expect(limits["user-code"]).toEqual({ max: 10, window: 3600 });
    // The console's decisions: owner and support only; the codes: owner and finance (canBill).
    expect(read("src/domains/independent/service.ts")).toContain("if (!canWrite(o)) throw new AccessError(\"FORBIDDEN\")");
    // Acceptance checks the platform's operator still in office, for a club without a federation.
    expect(read("src/domains/access/invite.ts")).toContain("po.revoked_at IS NULL AND po.role IN ('owner','support')");
  });
});
