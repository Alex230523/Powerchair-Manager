import { describe, expect, it } from "vitest";
import { moneyRights } from "../src/domains/access/policy";
import { yearTemplate, taskCommand } from "../src/domains/tasks/schema";
import { rulesOf } from "../src/domains/association/schema";
import { menuGroups, type Workspace } from "../src/components/menu";
import { todoCopy } from "../src/components/todo-copy";
import { associationCopy } from "../src/components/association-copy";

/** 35: the federation as an ASBL, its pure parts. */
const routes = (kind: "club" | "federation", role: Workspace["contexts"][number]["role"], permissions: string[] = []) =>
  menuGroups({
    user: { name: "Alex" },
    contexts: [{ id: "m1", name: "Org", role }],
    profiles: [],
    selected: { id: "m1", organization_id: "o1", organization_name: "Org", kind, logo_version: null },
    permissions,
  })
    .flatMap((g) => g.items)
    .map((i) => i.route);

describe("federation as an ASBL", () => {
  it("gives the books to the finance competence, never across kinds", () => {
    expect(moneyRights({ kind: "federation", role: "federation_president", grants: [] })).toEqual({ read: true, manage: true });
    expect(moneyRights({ kind: "federation", role: "federation_worker", grants: ["federation.finance"] })).toEqual({ read: true, manage: true });
    expect(moneyRights({ kind: "federation", role: "federation_worker", grants: ["federation.licences"] })).toEqual({ read: false, manage: false });
    expect(moneyRights({ kind: "federation", role: "referee", grants: [] })).toEqual({ read: false, manage: false });
    expect(moneyRights({ kind: "club", role: "club_president", grants: [] })).toEqual({ read: true, manage: true });
    // A club right never opens a federation's books.
    expect(moneyRights({ kind: "federation", role: "federation_worker", grants: ["dues.manage"] })).toEqual({ read: false, manage: false });
  });
  it("shows Finances and the ASBL's life by competence", () => {
    for (const r of ["/funding", "/funding/grants-sponsors", "/club/association"]) {
      expect(routes("federation", "federation_president")).toContain(r);
      expect(routes("federation", "federation_worker", ["federation.finance"])).toContain(r);
      expect(routes("federation", "federation_worker", ["federation.licences"])).not.toContain(r);
      expect(routes("federation", "referee")).not.toContain(r);
    }
  });
  it("proposes the federation's own year", () => {
    expect(yearTemplate("01-01", 2027, true).map((i) => i.key)).toEqual(["assembly", "filing", "ubo", "tax", "insurance", "affiliationsOpen", "competitionCalendar", "classificationDays"]);
    expect(yearTemplate("01-01", 2027).map((i) => i.key)).toEqual(["assembly", "filing", "ubo", "tax", "insurance", "affiliation"]);
    expect(yearTemplate("01-01", 2027, true).every((i) => i.category.startsWith("fed_"))).toBe(true);
    expect(taskCommand.safeParse({ action: "applyYear", year: 2027, items: [{ key: "affiliationsOpen", title: "Ouverture", dueOn: null, responsibleUserId: "abc" }] }).success).toBe(true);
  });
  it("weighs nothing unless the statutes say so", () => {
    expect(rulesOf({}).weighting).toBe("equal");
    expect(rulesOf({ weighting: "licences" }).weighting).toBe("licences");
  });
  it("has the words in the three languages", () => {
    for (const l of ["fr", "nl", "en"] as const) {
      expect(todoCopy[l].yearItems.classificationDays).toBeTruthy();
      expect(associationCopy[l].representatives).toBeTruthy();
      expect(associationCopy[l].weightings.licences).toBeTruthy();
    }
  });
});
