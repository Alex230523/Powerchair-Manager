import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ageCategory, answerCommand, nationalCommand, pf2Allowed } from "../src/domains/national/schema";
import { nationalCopy } from "../src/components/national-copy";
import { menuGroups, type Workspace } from "../src/components/menu";
import { shellCopy } from "../src/components/shell-copy";

/** 6: national teams: rules, commands, texts, menu and the health consent. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
const id = "6f1c2a52-6a7e-4c55-9d8f-1f2e3d4c5b6a";

describe("6: rules", () => {
  it("counts the PF2 against the team's rule and places a player in an age category", () => {
    expect(pf2Allowed([{ classification: "PF2" }, { classification: "PF1" }], 1)).toEqual({ count: 1, ok: true });
    expect(pf2Allowed([{ classification: "PF2" }, { classification: "PF2" }], 1)).toEqual({ count: 2, ok: false });
    expect(pf2Allowed([{ classification: "PF2" }], null).ok).toBe(true);
    expect(ageCategory("2010-03-01", "2026-27")).toBe("u18");
    expect(ageCategory("2005-03-01", "2026-27")).toBe("u23");
    expect(ageCategory("1990-03-01", "2026-27")).toBe("senior");
    expect(ageCategory(null, "2026-27")).toBe("unknown");
  });
  it("checks the commands: three levels, a foreign team in free text, the consent's period", () => {
    expect(nationalCommand.safeParse({ action: "select", teamId: id, profileId: id, status: "reserve" }).success).toBe(true);
    expect(nationalCommand.safeParse({ action: "select", teamId: id, profileId: id, status: "captain" }).success).toBe(false);
    expect(nationalCommand.safeParse({ action: "guestTeam", tournamentId: id, name: "France U18" }).success).toBe(true);
    expect(answerCommand.safeParse({ action: "consent", selectionId: id, startsOn: "2026-11-10", endsOn: "2026-11-12" }).success).toBe(true);
    expect(answerCommand.safeParse({ action: "availability", selectionId: id, availability: "maybe" }).success).toBe(false);
  });
});

describe("6: data, menu and texts", () => {
  it("reads care instructions only through an active consent, and never in the candidates", () => {
    const src = readFileSync("src/domains/national/service.ts", "utf8");
    expect(src).toContain("JOIN national_care_consent k ON k.selection_id=ns.id AND k.revoked_at IS NULL AND CURRENT_DATE BETWEEN k.starts_on AND k.ends_on");
    const candidates = src.slice(src.indexOf("async function candidates"), src.indexOf("export async function nationalView"));
    expect(candidates).not.toMatch(/care|health|sensitive/);
  });
  it("opens the national teams to the federation's competitions", () => {
    const fed = (role: Workspace["contexts"][number]["role"], permissions: string[]): Workspace => ({
      user: { name: "Alex" },
      contexts: [{ id: "m1", name: "Fédé", role }],
      profiles: [],
      selected: { id: "m1", organization_id: "o1", organization_name: "Fédé", kind: "federation", logo_version: null },
      permissions,
    });
    const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));
    expect(routes(fed("federation_president", []))).toContain("/federation/national");
    expect(routes(fed("federation_worker", ["federation.competitions"]))).toContain("/federation/national");
    expect(routes(fed("federation_worker", ["federation.finance"]))).not.toContain("/federation/national");
    for (const l of ["fr", "nl", "en"] as const) expect(shellCopy[l].national).toBeTruthy();
  });
  it("has the same texts in three languages, without long dashes nor the banned words", () => {
    expect(keys(nationalCopy.nl)).toEqual(keys(nationalCopy.fr));
    expect(keys(nationalCopy.en)).toEqual(keys(nationalCopy.fr));
    const all = JSON.stringify(nationalCopy) + Object.values(nationalCopy).map((c) => Object.values(c).map(String).join(" ")).join(" ");
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
