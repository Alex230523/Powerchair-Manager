import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fedCan, federationCompetences, permissions } from "../src/domains/access/policy";
import { federationRoles, fitsKind } from "../src/domains/access/staff-roles";
import { circularCommand } from "../src/domains/circulars/service";
import { circularsCopy } from "../src/components/circulars-copy";
import { staffRolesCopy } from "../src/components/staff-roles-copy";
import { focusCopy } from "../src/components/home-focus-copy";

/** 32 and 33 (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("federation delegates and circulars", () => {
  it("gives every competence to the presidency, a delegate only those of his roles", () => {
    expect(fedCan("federation_president", [], "federation.finance")).toBe(true);
    expect(fedCan("federation_worker", ["federation.referees"], "federation.referees")).toBe(true);
    expect(fedCan("federation_worker", ["federation.referees"], "federation.finance")).toBe(false);
    expect(fedCan("federation_worker", [])).toBe(false);
    expect(fedCan("referee", ["federation.referees"], "federation.referees")).toBe(false);
    expect(fedCan("club_president", [...federationCompetences])).toBe(false);
  });
  it("never lets a club's presidency hold a federation competence", () => {
    expect(permissions("club_president", []).some((g) => g.startsWith("federation."))).toBe(false);
    expect(permissions("federation_president", []).filter((g) => g.startsWith("federation.")).sort()).toEqual([...federationCompetences].sort());
  });
  it("proposes the eight delegated roles, one competence each, in three languages", () => {
    expect(federationRoles).toHaveLength(8);
    expect(federationRoles.flatMap((r) => r.grants).sort()).toEqual([...federationCompetences].sort());
    for (const r of federationRoles) expect(r.name.fr && r.name.nl && r.name.en && r.description.fr && r.description.nl && r.description.en).toBeTruthy();
    expect(fitsKind("club", "federation.finance")).toBe(false);
    expect(fitsKind("federation", "dues.manage")).toBe(false);
  });
  it("asks a recipient and a title for a circular", () => {
    expect(circularCommand.safeParse({ action: "save", title: "Info", body: "Texte", audiences: [] }).success).toBe(false);
    expect(circularCommand.safeParse({ action: "save", title: "Info", body: "Texte", audiences: ["presidents"] }).success).toBe(true);
  });
  it("has every text in three languages and keeps the banned words out", () => {
    for (const l of ["nl", "en"] as const) {
      expect(keys(circularsCopy[l])).toEqual(keys(circularsCopy.fr));
      expect(keys(staffRolesCopy[l])).toEqual(keys(staffRolesCopy.fr));
      expect(keys(focusCopy[l])).toEqual(keys(focusCopy.fr));
    }
    for (const f of ["src/components/circulars.tsx", "src/components/circulars-copy.ts", "src/domains/circulars/service.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
