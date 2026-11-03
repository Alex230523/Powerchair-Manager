import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { delta, figures, presence, progressCommand } from "../src/domains/progress/schema";
import { progressCopy } from "../src/components/progress-copy";

/** 31: « Mon suivi »: the numbers, the commands, the texts and where the tab lives. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
const at = (d: string, actual: string, match = false) => ({ at: `${d}T18:00:00.000Z`, actual, match });

describe("31: the season's numbers", () => {
  it("counts only the days marked, and the current run from the latest", () => {
    expect(presence([at("2026-10-01", "present"), at("2026-10-08", "absent"), at("2026-10-15", "late"), at("2026-10-22", "present"), at("2026-10-29", "unchecked")])).toEqual({
      invited: 4,
      present: 3,
      rate: 75,
      streak: 2,
    });
    expect(presence([])).toEqual({ invited: 0, present: 0, rate: null, streak: 0 });
    expect(presence([at("2026-10-01", "present"), at("2026-10-08", "absent")]).streak).toBe(0);
  });
  it("splits trainings and matches, and compares with last season only when there is something to compare", () => {
    const f = figures([at("2026-10-01", "present"), at("2026-10-02", "present", true)], { played: 1, minutes: 30, goals: 2, assists: 0, yellow: 0, red: 0 });
    expect(f.trainings.invited).toBe(1);
    expect(f.matches.invited).toBe(1);
    expect(delta(75, 60)).toBe(15);
    expect(delta(75, null)).toBeNull();
  });
});

describe("31: the commands", () => {
  const id = "6f1c2a52-6a7e-4c55-9d8f-1f2e3d4c5b6a";
  it("checks the objective's area, status and length", () => {
    expect(progressCommand.safeParse({ action: "goalCreate", profileId: id, category: "driving", title: "Demi-tour serré" }).success).toBe(true);
    expect(progressCommand.safeParse({ action: "goalCreate", profileId: id, category: "health", title: "Demi-tour serré" }).success).toBe(false);
    expect(progressCommand.safeParse({ action: "goalStatus", id, status: "acquired" }).success).toBe(true);
    expect(progressCommand.safeParse({ action: "goalStatus", id, status: "done" }).success).toBe(false);
    expect(progressCommand.safeParse({ action: "feedbackReact", id, reaction: "x".repeat(281) }).success).toBe(false);
    expect(progressCommand.parse({ action: "feedbackCreate", profileId: id, body: "Bien joué" })).toMatchObject({ eventId: null, matchId: null });
  });
});

describe("31: texts and page", () => {
  it("has the same texts in three languages, without long dashes nor the banned words", () => {
    expect(keys(progressCopy.nl)).toEqual(keys(progressCopy.fr));
    expect(keys(progressCopy.en)).toEqual(keys(progressCopy.fr));
    const all = JSON.stringify(progressCopy) + Object.values(progressCopy).map((c) => Object.values(c).map(String).join(" ")).join(" ");
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/convoqu|opgeroep|summon|call-up|classement des joueurs/i);
    expect(progressCopy.fr.tabSelf).toBe("Mon suivi");
    expect(progressCopy.fr.statuses).toEqual({ to_work: "À travailler", progressing: "En progrès", acquired: "Acquis" });
  });
  it("adds the tab to the player's sheet and opens it from the notification", () => {
    const sheet = readFileSync("src/components/player-profile.tsx", "utf8");
    expect(sheet).toContain('id="panel-progress"');
    expect(sheet).toContain("useProgress(locale, id)");
    expect(readFileSync("src/app/[locale]/players/[id]/page.tsx", "utf8")).toContain("initialTab");
    expect(readFileSync("src/domains/progress/service.ts", "utf8")).toContain("?tab=progress");
  });
  it("keeps the private notes in a table of their own", () => {
    const sql = readFileSync("db/migrations/0107_player_progress.sql", "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS player_coach_note");
    expect(sql).not.toMatch(/player_feedback[^;]*private/);
  });
});
