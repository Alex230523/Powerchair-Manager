import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { daysBetween, planCardShown, planSummary, planSteps } from "../src/domains/seasons/plan";
import { seasonPlanCopy } from "../src/components/season-plan-copy";
import { newSeasonMail, planTaskTitles } from "../src/domains/seasons/plan-copy";
import { settingsEntries } from "../src/components/settings-nav";

/** 16: « Préparer la saison suivante » (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
const choices = {
  season: { name: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-06-30", teams: ["t1", "t2"] },
  players: { teams: [{ teamId: "t1", profiles: ["a", "b"] }, { teamId: "t2", profiles: ["c"] }, { teamId: "t3", profiles: ["d"] }] },
  dues: { copyPlans: true, amounts: {}, issueOn: "2026-09-15" },
  affiliations: { fees: ["f1"] },
  reminders: { items: ["grant:x"] },
  check: { launchOn: "2026-09-01" },
  communication: { subject: "Nouvelle saison", text: "Bonjour", sendOn: "2026-08-25" },
};
const material = { fees: [{ id: "f1", name: "LFH", dueOn: "2026-10-01" }], reminders: [{ key: "grant:x", name: "Province", dueOn: "2026-11-01" }], plans: [{ id: "p", category: "Jeunes" }] };

describe("season assistant", () => {
  it("has its nine steps, in order", () => {
    expect([...planSteps]).toEqual(["review", "season", "players", "dues", "affiliations", "reminders", "check", "communication", "summary"]);
  });
  it("shows the card from 45 days before the end, until it is launched", () => {
    expect(planCardShown(46, false)).toBe(false);
    expect(planCardShown(45, false)).toBe(true);
    expect(planCardShown(10, true)).toBe(false);
    expect(daysBetween("2026-06-01", "2026-06-30")).toBe(29);
  });
  it("sums up what will be created, a skipped step left out", () => {
    const all = planSummary({}, choices, material);
    expect(all.map((x) => [x.what, x.on, x.count ?? null])).toEqual([
      ["season", "2026-09-01", 2],
      ["players", "2026-09-01", 3],
      ["plans", null, 1],
      ["issue", "2026-09-15", null],
      ["LFH", "2026-10-01", null],
      ["Province", "2026-11-01", null],
      ["check", "2026-09-01", null],
      ["Nouvelle saison", "2026-08-25", null],
    ]);
    const skipped = planSummary({ season: "skipped", communication: "skipped" }, choices, material);
    expect(skipped.map((x) => x.what)).toEqual(["LFH", "Province"]);
  });
  it("speaks three languages", () => {
    for (const copy of [seasonPlanCopy, newSeasonMail, planTaskTitles]) {
      expect(keys(copy.nl).sort()).toEqual(keys(copy.fr).sort());
      expect(keys(copy.en).sort()).toEqual(keys(copy.fr).sort());
    }
  });
  it("lives in Réglages › Saisons, is run by the daily jobs, and reuses the existing bricks", () => {
    expect(settingsEntries.find((e) => e.id === "seasonPlan")?.category).toBe("seasons");
    expect(readFileSync("src/domains/jobs/registry.ts", "utf8")).toContain("seasonPlan: await seasonPlanTick(db)");
    const service = readFileSync("src/domains/seasons/plan.ts", "utf8");
    for (const brick of ["performRollover", "issueMany", "sendNewsletterNow", "feesOf"]) expect(service).toContain(brick);
    expect(readFileSync("db/migrations/0083_season_plan.sql", "utf8")).not.toMatch(/\bDROP\b/);
  });
});
