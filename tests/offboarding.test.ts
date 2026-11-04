import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { departureProgress, dueBefore, offboardingCommand, optionalKinds } from "../src/domains/offboarding/schema";
import { offboardingWords, fillWords } from "../src/domains/offboarding/offboarding-copy";
import { offboardingCopy } from "../src/components/offboarding-copy";
import { settingsEntries } from "../src/components/settings-nav";
import { settingsHubCopy } from "../src/components/settings-hub-copy";

/** « Fin de coach » (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("coach leaving", () => {
  it("sets each deadline before the end date, never before today", () => {
    expect(dueBefore("2026-12-01", "replace", "2026-11-02")).toBe("2026-11-17");
    expect(dueBefore("2026-12-01", "keys", "2026-11-02")).toBe("2026-12-01");
    expect(dueBefore("2026-11-05", "replace", "2026-11-02")).toBe("2026-11-02");
  });
  it("counts done and skipped steps alike", () => {
    expect(departureProgress([{ done_at: "x" }, { done_at: null }, { done_at: new Date() }, { done_at: null }])).toEqual({ done: 2, total: 4, percent: 50 });
    expect(departureProgress([])).toEqual({ done: 0, total: 0, percent: 100 });
  });
  it("asks a reason to skip and never lets the rights or the closing be left out", () => {
    const id = "4f2c1c9e-5b8f-4a5e-9b8a-2a1d3c4e5f60";
    expect(offboardingCommand.safeParse({ action: "skip", runId: id, key: "thanks", reason: "" }).success).toBe(false);
    expect(offboardingCommand.safeParse({ action: "settings", skip: ["rights"] }).success).toBe(false);
    expect(offboardingCommand.safeParse({ action: "settings", skip: optionalKinds }).success).toBe(true);
    expect(offboardingCommand.parse({ action: "start", profileId: id, endsOn: "2026-12-01", reason: "moved", locale: "fr" })).toMatchObject({ notifyCoach: true, note: "" });
  });
  it("has every text in three languages, filled without leftovers", () => {
    for (const l of ["nl", "en"] as const) {
      expect(keys(offboardingWords[l])).toEqual(keys(offboardingWords.fr));
      expect(keys(offboardingCopy[l])).toEqual(keys(offboardingCopy.fr));
    }
    expect(fillWords(offboardingWords.fr.task, { name: "Ana", step: "Clés" })).toBe("Fin de coach (Ana) : Clés");
    expect(settingsEntries.some((e) => e.id === "offboarding" && e.category === "members")).toBe(true);
    for (const l of ["fr", "nl", "en"] as const) expect(settingsHubCopy[l].entries.offboarding.title).toBeTruthy();
  });
  it("keeps the banned words out", () => {
    for (const f of ["src/components/offboarding.tsx", "src/components/offboarding-copy.ts", "src/domains/offboarding/offboarding-copy.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    }
  });
});
