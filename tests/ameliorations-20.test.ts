import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { inWindow, marketOpen, bpcfRules, trainingIndemnity, freeLeave } from "../src/domains/transfers/schema";
import { eligibility } from "../src/domains/competitions/journey";
import { fineDefaults, fineState } from "../src/domains/fines/schema";
import { federationExamples, bpcfPlayerCapCents } from "../src/domains/affiliations/schema";

/** 04/11/2026: the twenty improvements listed after the feedback. */
const read = (f: string) => readFileSync(f, "utf8");
const components = readdirSync("src/components").filter((f) => f.endsWith(".tsx"));

describe("points 1 to 5: corrections", () => {
  it("1: no example written in French inside a component, no long dash", () => {
    for (const f of components) {
      const s = read(`src/components/${f}`);
      expect(s, f).not.toMatch(/placeholder="(Ex\.|Bv\.|E\.g\.)/);
      expect(s, f).not.toMatch(/placeholder="[^"]*[—–]/);
    }
  });
  it("2 and 18: the bubbles are placed against the window and show on a touch screen", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.hover-bubble-panel \{[^}]*position: fixed/);
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.hover-bubble-panel/);
    expect(read("src/components/hover-bubble.tsx")).toContain('e.key === "Escape"');
    expect(read("src/components/home.tsx")).toContain("<HoverBubble");
    expect(read("src/components/player-directory.tsx")).toContain("<HoverBubble");
  });
  it("3: a won or lost score has a shape, not only a colour", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain('.match-score[data-outcome="win"] > [aria-hidden]::before');
    expect(css).toContain('.match-score[data-outcome="loss"] > [aria-hidden]::before');
  });
  it("5: yearly transfer periods compare day and month, across the new year", () => {
    expect(inWindow({ from: "2026-07-01", to: "2026-08-31" }, "2031-07-15", true)).toBe(true);
    expect(inWindow({ from: "2026-07-01", to: "2026-08-31" }, "2031-07-15", false)).toBe(false);
    expect(inWindow({ from: "2026-12-20", to: "2027-01-10" }, "2030-01-05", true)).toBe(true);
    expect(inWindow({ from: "2026-12-20", to: "2027-01-10" }, "2030-02-05", true)).toBe(false);
    const r = bpcfRules("2026-11-04", "");
    expect(r.yearlyWindows).toBe(true);
    expect(marketOpen(r, "2029-08-01")).toBe(true);
    expect(marketOpen(r, "2029-10-01")).toBe(false);
  });
});

describe("points 6 to 11: transfers and the federation (BPCF)", () => {
  it("6 and 11: the training compensation follows the format, the years and the caps", () => {
    expect(trainingIndemnity("academy", 3)).toBe(15000);
    expect(trainingIndemnity("elite", 3)).toBe(37500);
    expect(trainingIndemnity("elite_certified", 3)).toBe(50000);
    expect(trainingIndemnity("elite_certified", 0)).toBe(25000);
    expect(trainingIndemnity("", 3)).toBeNull();
    expect(trainingIndemnity("academy", 2, "international")).toBe(125000);
    expect(trainingIndemnity("elite_certified", 9, "international")).toBe(300000);
  });
  it("7: a force majeure reaches the commission at any time", () => {
    const rules = { windows: [{ from: "2020-07-01", to: "2020-08-31" }], consentedAnytime: false, federationValidation: true };
    const refused = { status: "refused", player_consent: "given", from_organization_id: "x", federation_at: null };
    expect(freeLeave(refused, rules, "2026-11-04")).toBe(false);
    expect(freeLeave({ ...refused, force_majeure: true }, rules, "2026-11-04")).toBe(true);
  });
  it("8: an unconfirmed compensation keeps the player off the sheet", () => {
    expect(eligibility({ licence: "active", documentsDue: 0, chair: null, transferUnpaid: true }).blocking).toEqual(["transferPayment"]);
    expect(eligibility({ licence: "active", documentsDue: 0, chair: null }).blocking).toEqual([]);
  });
  it("9: the BPCF participation is ready, 80 € by 30 September", () => {
    expect(federationExamples.find((x) => x.key === "bpcf_participation")).toMatchObject({ basis: "player", amountCents: bpcfPlayerCapCents, opensMonth: 9, dueMonth: 9, dueDay: 30 });
  });
  it("10: the fines of the rules", () => {
    expect(fineDefaults).toMatchObject({ late: 2500, forfeit: 5000, forfeit_day: 50000, other: null });
    expect(fineState({ paid_on: null, cancelled_at: "x" })).toBe("cancelled");
    expect(fineState({ paid_on: "2026-11-04", cancelled_at: null })).toBe("paid");
  });
});
