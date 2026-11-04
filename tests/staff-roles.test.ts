import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adjustments, effectiveGrants, proposedRoles, roleGrants, sensitiveGrants, staffRoleCommand } from "../src/domains/access/staff-roles";
import { staffRolesCopy } from "../src/components/staff-roles-copy";

/** 7: staff roles (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("staff roles", () => {
  it("proposes the eight roles in three languages, none with a sensitive right", () => {
    expect(proposedRoles.map((r) => r.key)).toEqual(["head-coach", "assistant-coach", "team-manager", "equipment-manager", "transport-manager", "treasurer", "secretary", "recruitment"]);
    for (const r of proposedRoles) {
      expect(r.name.fr && r.name.nl && r.name.en && r.description.fr && r.description.nl && r.description.en).toBeTruthy();
      expect(r.grants.filter((g) => sensitiveGrants.includes(g))).toEqual([]);
    }
  });
  it("gives a role « for its teams only » nothing club-wide for the calendar, attendance and players", () => {
    expect(roleGrants({ grants: ["calendar.manage", "attendance.manage", "equipment.manage"], scope: "own_teams" })).toEqual(["equipment.manage"]);
    expect(roleGrants({ grants: ["calendar.manage"], scope: "all" })).toEqual(["calendar.manage"]);
  });
  it("adds the roles together, then the person's own additions and removals", () => {
    const roles = [
      { grants: ["dues.manage", "dues.read"], scope: "all" },
      { grants: ["equipment.manage"], scope: "all" },
    ];
    expect(effectiveGrants(roles, [], [])).toEqual(["dues.manage", "dues.read", "equipment.manage"]);
    expect(effectiveGrants(roles, ["documents.read"], ["dues.read"])).toEqual(["documents.read", "dues.manage", "equipment.manage"]);
    expect(adjustments(roles, ["dues.manage", "equipment.manage", "documents.read"])).toEqual({ added: ["documents.read"], removed: ["dues.read"] });
  });
  it("never lets a role carry the donors' identity", () => {
    expect(staffRoleCommand.safeParse({ action: "save", name: { fr: "Rôle" }, grants: ["tax.identity"], scope: "all" }).success).toBe(false);
  });
  it("has every text in three languages and keeps the banned words out", () => {
    for (const l of ["nl", "en"] as const) expect(keys(staffRolesCopy[l])).toEqual(keys(staffRolesCopy.fr));
    for (const f of ["src/components/staff-roles.tsx", "src/components/staff-roles-copy.ts", "src/domains/access/staff-roles.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
