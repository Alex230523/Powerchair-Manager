import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { peopleCommand, representativeRelations } from "../src/domains/people/schema";
import { representativeCopy } from "../src/components/representative-copy";
import { seasonCheckCopy } from "../src/domains/season-check/check-copy";
import { todoKeys } from "../src/domains/dashboard/summary";
import { homeCopy } from "../src/components/home-copy";

/** 8: players and families. */
describe("a player with his representatives", () => {
  it("accepts up to two representatives, known or new, legal or carer", () => {
    const base = { action: "createPerson", fullName: "Lucas", birthDate: "2014-01-01", email: "", phone: "", joinedOn: "2026-09-01" };
    expect(peopleCommand.parse({ ...base, representatives: [{ fullName: "Nadia", relation: "mother", rights: "legal" }] })).toBeTruthy();
    expect(() => peopleCommand.parse({ ...base, representatives: [1, 2, 3].map(() => ({ fullName: "X", relation: "other", rights: "aid" })) })).toThrow();
    expect(() => peopleCommand.parse({ ...base, representatives: [{ fullName: "Nadia", relation: "aunt", rights: "legal" }] })).toThrow();
    expect(representativeRelations).toEqual(["mother", "father", "guardian", "administrator", "carer", "other"]);
  });
  it("has its texts in three languages, the relations each named", () => {
    for (const l of ["nl", "en"] as const) expect(Object.keys(representativeCopy[l]).sort()).toEqual(Object.keys(representativeCopy.fr).sort());
    for (const l of ["fr", "nl", "en"] as const) for (const r of representativeRelations) expect(representativeCopy[l].relations[r]).toBeTruthy();
    for (const l of ["nl", "en"] as const) expect(Object.keys(seasonCheckCopy[l]).sort()).toEqual(Object.keys(seasonCheckCopy.fr).sort());
    expect(JSON.stringify([representativeCopy, seasonCheckCopy])).not.toMatch(/[–—]/);
  });
  it("tells the club about the minors nobody answers for", () => {
    expect(todoKeys).toContain("minorsWithoutGuardian");
    for (const l of ["fr", "nl", "en"] as const) expect(homeCopy[l].todos.minorsWithoutGuardian.title).toBeTruthy();
    expect(readFileSync("src/components/player-directory.tsx", "utf8")).toContain("representativeCopy[locale].missing");
  });
});
describe("the start-of-season check", () => {
  it("opens at sign-in, never blocking, and is followed in Réglages › Saisons", () => {
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("<SeasonCheckPrompt");
    expect(readFileSync("src/components/settings.tsx", "utf8")).toContain("<SeasonCheckPanel");
    expect(readFileSync("db/migrations/0081_season_check.sql", "utf8")).toContain("grace_days integer NOT NULL DEFAULT 14");
    expect(readFileSync("src/domains/jobs/registry.ts", "utf8")).toContain("seasonChecks: await seasonCheckTick(db)");
  });
});
