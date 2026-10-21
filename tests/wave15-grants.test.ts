import { describe, it, expect } from "vitest";
import { deadlineTone, fundingCommand, grantChecklist, nextYearDate } from "../src/domains/funding/schema";
import { grantsCopy } from "../src/components/grants-copy";
import { sponsorsCopy } from "../src/components/sponsors-copy";
import { homeCopy } from "../src/components/home-copy";
import { todoKeys } from "../src/domains/dashboard/summary";

/** Wave 15 (C2): grant check-list, deadline badge, next year's dates, texts. */
const keys = (o: object): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]))
    .sort();
const texts = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? texts(v) : [String(v)]));

describe("grant file", () => {
  it("offers the same eight usual steps in each language", () => {
    expect(grantChecklist.fr).toHaveLength(8);
    expect(grantChecklist.nl).toHaveLength(8);
    expect(grantChecklist.en).toHaveLength(8);
    expect(new Set(grantChecklist.fr).size).toBe(8);
  });
  it("warns 14 days before a deadline and flags it once passed, while the file is not filed", () => {
    const today = "2026-10-21";
    expect(deadlineTone({ status: "idea", deadline_on: "2026-11-04" }, today)).toBe("warning");
    expect(deadlineTone({ status: "idea", deadline_on: "2026-11-05" }, today)).toBeNull();
    expect(deadlineTone({ status: "idea", deadline_on: "2026-10-20" }, today)).toBe("danger");
    expect(deadlineTone({ status: "submitted", deadline_on: "2026-10-20" }, today)).toBeNull();
    expect(deadlineTone({ status: "idea", deadline_on: null }, today)).toBeNull();
  });
  it("moves dates to the same day next year, 29 February to 28 February", () => {
    expect(nextYearDate("2026-03-15")).toBe("2027-03-15");
    expect(nextYearDate("2028-02-29")).toBe("2029-02-28");
    expect(nextYearDate(null)).toBeNull();
  });
  it("accepts only web links for the call and the funder's site", () => {
    const base = { action: "grant", funder: "ADEPS", program: "", purpose: "", requestedCents: 0, status: "idea", notes: "" };
    expect(fundingCommand.safeParse({ ...base, programUrl: "https://www.adeps.be" }).success).toBe(true);
    expect(fundingCommand.safeParse({ ...base, programUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(fundingCommand.safeParse({ ...base, programUrl: "" }).success).toBe(true);
  });
});

describe("grant texts", () => {
  it("have the same keys in the three languages and no long dashes", () => {
    expect(keys(grantsCopy.nl)).toEqual(keys(grantsCopy.fr));
    expect(keys(grantsCopy.en)).toEqual(keys(grantsCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      for (const t of [...texts(grantsCopy[l]), ...grantChecklist[l], ...texts(sponsorsCopy[l].layerKinds)]) expect(t).not.toMatch(/[–—]/);
      expect(Object.keys(sponsorsCopy[l].layerKinds)).toEqual(expect.arrayContaining(["grantEnd", "grantRecheck"]));
      expect(homeCopy[l].todos.grantTasks.title).toBeTruthy();
    }
  });
  it("puts grant steps right after sponsor conditions on the home", () => {
    expect(todoKeys.indexOf("grantTasks")).toBe(todoKeys.indexOf("sponsorTasks") + 1);
  });
});
