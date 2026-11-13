import { describe, it, expect } from "vitest";
import { menuGroups, type Workspace } from "../src/components/menu";
import { nationalStaffCopy } from "../src/components/national-staff-copy";
import { shellCopy } from "../src/components/shell-copy";
import { careRoles } from "../src/domains/national/service";

/** 13/11/2026: « Mon équipe nationale », the national staff's page. */
const ws = (role: Workspace["contexts"][number]["role"], nationalStaff: boolean): Workspace => ({
  user: { name: "Léo" },
  contexts: [{ id: "m1", name: "Club", role }],
  profiles: [],
  selected: { id: "m1", organization_id: "o1", organization_name: "Club", kind: "club", logo_version: null },
  permissions: role === "club_president" ? ["people.read"] : [],
  nationalStaff,
});
const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));

describe("national staff", () => {
  it("shows « Mon équipe nationale » to the staff only, whatever the profile", () => {
    for (const role of ["coach", "club_president", "player"] as const) {
      expect(routes(ws(role, true))).toContain("/national");
      expect(routes(ws(role, false))).not.toContain("/national");
    }
  });
  it("lets the coach, the assistant, the physio and the companion read the care instructions, not the mechanic", () => {
    expect([...careRoles]).toEqual(["head_coach", "assistant", "physio", "companion"]);
  });
  it("has the same words in the three languages, without dashes", () => {
    const keys = Object.keys(nationalStaffCopy.fr).sort();
    for (const l of ["fr", "nl", "en"] as const) {
      expect(Object.keys(nationalStaffCopy[l]).sort()).toEqual(keys);
      expect(shellCopy[l].groupNational.length).toBeGreaterThan(0);
      expect(shellCopy[l].nationalStaff.length).toBeGreaterThan(0);
      expect(JSON.stringify(nationalStaffCopy[l])).not.toMatch(/[–—]/);
      expect(nationalStaffCopy[l].myRoles).toContain("{roles}");
    }
  });
});
