import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adopted, assemblySteps, associationCommand, endingMandates, proxyAllowed, quorum, rulesOf } from "../src/domains/association/schema";
import { associationWords } from "../src/domains/association/association-copy";
import { associationCopy } from "../src/components/association-copy";
import { assemblyDeadline } from "../src/domains/accounts/schema";

/** 17: the ASBL's life (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("the ASBL's life", () => {
  it("takes the statutes' rules, with defaults the club changes", () => {
    const r = rulesOf({});
    expect(r).toMatchObject({ noticeDays: 15, quorumPercent: 0, maxProxies: 1, secondWithoutQuorum: true });
    expect(r.majorities.exit).toBe("two_thirds");
    expect(rulesOf({ noticeDays: 21, quorumPercent: 50 })).toMatchObject({ noticeDays: 21, quorumPercent: 50 });
    expect(() => rulesOf({ noticeDays: 3 })).toThrow();
  });
  it("counts the quorum with those represented", () => {
    expect(quorum(10, 4, 1, 50)).toMatchObject({ count: 5, needed: 5, reached: true });
    expect(quorum(10, 3, 1, 50).reached).toBe(false);
    expect(quorum(10, 0, 0, 0)).toMatchObject({ needed: 0, reached: true });
  });
  it("checks each majority", () => {
    expect(adopted("simple", { for: 3, against: 2, abstain: 5 })).toBe(true);
    expect(adopted("absolute", { for: 3, against: 2, abstain: 5 })).toBe(false);
    expect(adopted("two_thirds", { for: 4, against: 2, abstain: 9 })).toBe(true);
    expect(adopted("two_thirds", { for: 3, against: 2, abstain: 0 })).toBe(false);
    expect(adopted("four_fifths", { for: 4, against: 1, abstain: 0 })).toBe(true);
    expect(adopted("simple", { for: 0, against: 0, abstain: 3 })).toBe(false);
  });
  it("sets the steps before an assembly, and six months after the closing", () => {
    expect(assemblySteps("2027-06-10", 15)).toEqual({ prepare: "2027-05-05", agenda: "2027-05-23", invite: "2027-05-26", reminder: "2027-06-05" });
    expect(assemblyDeadline("2026-12-31")).toBe("2027-06-30");
  });
  it("finds the mandates that end within the year; refuses a proxy beyond the maximum", () => {
    expect(endingMandates([{ board_role: "treasurer", board_until: "2027-03-01" }, { board_role: "director", board_until: "2031-01-01" }, { board_role: null, board_until: null }], "2026-11-02")).toHaveLength(1);
    expect(proxyAllowed(0, 1)).toBe(true);
    expect(proxyAllowed(1, 1)).toBe(false);
  });
  it("asks a reason for a correction", () => {
    expect(() => associationCommand.parse({ action: "correct", lineId: "0b6d3d1e-3c4f-4d58-9a5e-2f7d1c9e8b01", status: "none", reason: "" })).toThrow();
  });
  it("speaks three languages, without the banned words", () => {
    for (const copy of [associationWords, associationCopy] as Record<string, object>[]) {
      expect(keys(copy.nl).sort()).toEqual(keys(copy.fr).sort());
      expect(keys(copy.en).sort()).toEqual(keys(copy.fr).sort());
    }
    for (const f of ["src/components/association-copy.ts", "src/components/association.tsx", "src/domains/association/association-copy.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
  it("keeps the register frozen in the database, without dropping anything", () => {
    const sql = readFileSync("db/migrations/0088_association.sql", "utf8");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON member_register");
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
