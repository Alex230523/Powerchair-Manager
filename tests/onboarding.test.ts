import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dueOf, onboardingCommand, progress, selfSteps, stepSchema, suggested } from "../src/domains/onboarding/schema";
import { onboardingCopy } from "../src/components/onboarding-copy";
import { tutorialCopy } from "../src/components/tutorial-copy";
import { tutorialAudience } from "../src/domains/tutorial/schema";

/** Parcours d'accueil (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("welcome journeys", () => {
  it("proposes three templates whose steps are valid, in three languages", () => {
    for (const s of Object.values(suggested)) {
      for (const st of s.steps) {
        expect(stepSchema.parse(st)).toEqual(st);
        expect(st.title.fr && st.title.nl && st.title.en).toBeTruthy();
      }
      expect(new Set(s.steps.map((x) => x.key)).size).toBe(s.steps.length);
    }
    expect(suggested.coach.steps.map((x) => x.kind)).toEqual(["message", "sign", "profile", "profile", "upload", "training", "task", "meeting", "tour", "read", "read"]);
    expect(suggested.referee.audience).toBe("referee");
  });
  it("counts the required steps, finds the next one and those late", () => {
    const steps = [
      { key: "a", required: true, done_at: "2026-11-01", due_on: "2026-11-01" },
      { key: "b", required: false, done_at: null, due_on: "2026-10-01" },
      { key: "c", required: true, done_at: null, due_on: "2026-10-30" },
    ];
    expect(progress(steps, "2026-11-02")).toEqual({ done: 1, total: 2, percent: 50, next: "b", late: 1, finished: false });
    expect(dueOf("2026-11-02", 30)).toBe("2026-12-02");
  });
  it("leaves the automatic steps to their brick", () => {
    expect(selfSteps).toEqual(["message", "read", "sign", "training"]);
    expect(() => onboardingCommand.parse({ action: "saveTemplate", name: "X", audience: "coach", trigger: "invitation", steps: [] })).toThrow();
  });
  it("gives the guided tour to the player and the referee", () => {
    expect([tutorialAudience("coach"), tutorialAudience("player"), tutorialAudience("referee"), tutorialAudience("guardian")]).toEqual(["coach", "player", "referee", null]);
    for (const l of ["fr", "nl", "en"] as const) {
      expect(tutorialCopy[l].steps.player?.length).toBe(4);
      expect(tutorialCopy[l].steps.referee?.length).toBe(4);
    }
  });
  it("speaks three languages, without the banned words", () => {
    expect(keys(onboardingCopy.nl).sort()).toEqual(keys(onboardingCopy.fr).sort());
    expect(keys(onboardingCopy.en).sort()).toEqual(keys(onboardingCopy.fr).sort());
    for (const f of ["src/components/onboarding-copy.ts", "src/components/onboarding.tsx", "src/domains/onboarding/schema.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
  it("adds without dropping anything", () => {
    expect(readFileSync("db/migrations/0089_onboarding.sql", "utf8")).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
