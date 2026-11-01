import { describe, it, expect } from "vitest";
import { menuGroups, type Workspace } from "../src/components/menu";
import { grantsSponsorsCopy } from "../src/components/grants-sponsors-copy";
import { financeNavCopy, incomeSections } from "../src/components/finance-nav-copy";
import { fundingCommand } from "../src/domains/funding/schema";
import { todoCopy } from "../src/components/todo-copy";

/** A2: « Subsides & sponsors », one entry, two views, its commands and texts. */
const workspace = (role: Workspace["contexts"][number]["role"], permissions: string[]): Workspace => ({
  user: { name: "Alex" },
  contexts: [{ id: "m1", name: "Club", role }],
  profiles: [],
  selected: { id: "m1", organization_id: "o1", organization_name: "Club", kind: "club", logo_version: null },
  permissions,
});
const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));

describe("A2 grants and sponsors", () => {
  it("has one menu entry, for those who read the money", () => {
    expect(routes(workspace("club_president", ["dues.read", "dues.manage"])).filter((r) => r.startsWith("/funding/grants-sponsors"))).toHaveLength(1);
    expect(routes(workspace("treasurer" as never, ["dues.read"]))).toContain("/funding/grants-sponsors");
    expect(routes(workspace("coach", ["calendar.read"]))).not.toContain("/funding/grants-sponsors");
  });
  it("gathers grants and sponsors in one income section", () => {
    expect([...incomeSections]).toEqual(["dues", "support", "fundraising"]);
    expect(financeNavCopy.fr.incomes.support).toBe("Subsides & sponsors");
  });
  it("reads an instalment and the new fields", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(fundingCommand.parse({ action: "grantPayment", grantId: id, receivedOn: "2026-10-22", amountCents: 50000, note: "" })).toMatchObject({ amountCents: 50000 });
    expect(() => fundingCommand.parse({ action: "grantPayment", grantId: id, receivedOn: "2026-10-22", amountCents: 0, note: "" })).toThrow();
    const g = fundingCommand.parse({ action: "grant", funder: "Région", program: "", purpose: "", requestedCents: 0, status: "idea", notes: "", opensOn: "2026-11-01", startsOn: null });
    expect(g).toMatchObject({ opensOn: "2026-11-01", startsOn: null });
    // Absent means unchanged.
    expect("lastContactOn" in fundingCommand.parse({ action: "partner", name: "Garage", kind: "sponsor", status: "active", amountCents: 0, inKind: "", counterpart: "", nextAction: "", notes: "" })).toBe(false);
  });
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(grantsSponsorsCopy.nl)).toEqual(keys(grantsSponsorsCopy.fr));
    expect(keys(grantsSponsorsCopy.en)).toEqual(keys(grantsSponsorsCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      expect(JSON.stringify(grantsSponsorsCopy[l])).not.toMatch(/[–—]/);
      for (const k of ["grantOpening", "partnerRenewal", "partnerContact"]) expect(todoCopy[l].sources[k]).toContain("{about}");
    }
  });
});
