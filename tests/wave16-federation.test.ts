import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { menuGroups, type Workspace } from "../src/components/menu";
import { shellCopy } from "../src/components/shell-copy";
import { federationCopy } from "../src/components/federation-copy";
import { federationClubsCommand } from "../src/domains/federation/clubs";
import { errors } from "../src/components/access-copy";

/** Wave 16 (I3): the federation's space. */
const federation = (role: Workspace["contexts"][number]["role"]): Workspace => ({
  user: { name: "Alex" },
  contexts: [{ id: "m1", name: "BPCF", role }],
  profiles: [],
  selected: { id: "m1", organization_id: "o1", organization_name: "BPCF", kind: "federation", logo_version: null },
  permissions: ["organization.read", "mandates.manage", "invitations.create"],
});
describe("federation space", () => {
  it("orders the menu as the federation president's day", () => {
    const routes = menuGroups(federation("federation_president"))
      .flatMap((g) => g.items)
      .map((i) => i.route);
    // 13/11/2026: in groups: Agenda, Clubs et licences, Compétitions, Formation, Administration.
    const order = ["/calendar", "/federation/clubs", "/federation/teams", "/federation/licenses", "/tournaments", "/federation/referees", "/federation/courses", "/funding"];
    expect(order.map((r) => routes.indexOf(r))).toEqual([...order.map((r) => routes.indexOf(r))].sort((a, b) => a - b));
    expect(order.every((r) => routes.includes(r))).toBe(true);
    // A referee keeps their own space.
    const referee = menuGroups(federation("referee")).flatMap((g) => g.items).map((i) => i.route);
    expect(referee).toContain("/referee");
    expect(referee).not.toContain("/federation/clubs");
    for (const l of ["fr", "nl", "en"] as const) expect(shellCopy[l].federationTeams).toBeTruthy();
    expect(shellCopy.fr.federationClubs).toBe("Clubs et présidents");
  });
  it("keeps the same copy in three languages, without long dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(federationCopy.nl)).toEqual(keys(federationCopy.fr));
    expect(keys(federationCopy.en)).toEqual(keys(federationCopy.fr));
    expect(JSON.stringify(federationCopy)).not.toMatch(/[–—]/);
    for (const l of ["fr", "nl", "en"] as const) expect(errors.AFFILIATION_TAKEN[l]).toBeTruthy();
  });
  it("validates a new club and its president", () => {
    const club = {
      action: "createClub",
      name: "Lions de Namur",
      city: "Namur",
      affiliationNumber: "BPCF-012",
      companyNumber: "0123.456.789",
      legalForm: "asbl",
      contactEmail: "",
      president: { firstName: "Claire", lastName: "Présidente", email: "claire@example.test" },
    };
    expect(federationClubsCommand.safeParse(club).success).toBe(true);
    expect(federationClubsCommand.safeParse({ ...club, companyNumber: "123" }).success).toBe(false);
    expect(federationClubsCommand.safeParse({ ...club, president: { ...club.president, email: "pas-un-email" } }).success).toBe(false);
  });
  it("adds columns only, and checks a federation invitation in the federation", () => {
    const migration = readFileSync("db/migrations/0046_federation_clubs.sql", "utf8");
    expect(migration).not.toMatch(/DROP|ALTER COLUMN|RENAME/i);
    const invite = readFileSync("src/domains/access/invite.ts", "utf8");
    expect(invite).toContain("r.role='federation_president'");
    expect(invite).toContain("club.federation_id=r.organization_id");
    expect(invite).toContain("if (invite.succession)");
  });
});
