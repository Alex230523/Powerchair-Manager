import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { menuGroups, bottomNav, type Workspace } from "../src/components/menu";
import { settingsEntries, visibleCategories } from "../src/components/settings-nav";
import { settingsHubCopy } from "../src/components/settings-hub-copy";
import { familyCopy, authorizationSettingsCopy } from "../src/components/family-copy";
import { authorizationCopy, authorizationDefaults, authorizationKinds, fillCopy } from "../src/domains/authorizations/authorization-copy";
import { receivesMoneySql } from "../src/domains/family/split";

/** 27 to 29: the parents' space, the authorizations, the two homes (pure parts). */
const ws = (role: string, permissions: string[] = []) =>
  ({
    user: { name: "X" },
    contexts: [{ id: "m", name: "Club", role }],
    profiles: [],
    selected: { id: "m", organization_id: "o", organization_name: "Club", kind: "club", logo_version: null },
    permissions,
  }) as unknown as Workspace;
const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("Ma famille", () => {
  it("is in a parent's menu first, and only a parent's", () => {
    expect(routes(ws("guardian"))[0]).toBe("/family");
    expect(routes(ws("player"))).not.toContain("/family");
    expect(routes(ws("club_president", ["people.read"]))).not.toContain("/family");
    expect(bottomNav(ws("guardian")).map((i) => i.route)).toEqual(["", "/family", "/calendar", "/dues"]);
  });
  it("speaks the three languages with the same words to fill", () => {
    for (const copy of [familyCopy, authorizationSettingsCopy, authorizationCopy]) {
      expect(keys(copy.nl).sort()).toEqual(keys(copy.fr).sort());
      expect(keys(copy.en).sort()).toEqual(keys(copy.fr).sort());
    }
    for (const l of ["fr", "nl", "en"] as const) expect(Object.keys(authorizationCopy[l].kinds).sort()).toEqual([...authorizationKinds].sort());
  });
  it("never names a child by a colour alone, and keeps the banned words out", () => {
    const page = readFileSync("src/components/family.tsx", "utf8");
    expect(page).toContain("child-initial");
    for (const f of ["src/components/family.tsx", "src/components/family-copy.ts", "src/components/child-switcher.tsx", "src/components/authorization-settings.tsx", "src/components/billing-split.tsx"])
      expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
  it("remembers the chosen child for every page of the family space", () => {
    for (const f of ["src/components/calendar.tsx", "src/components/documents.tsx", "src/components/dues.tsx"]) expect(readFileSync(f, "utf8")).toContain("useClubChildFilter");
  });
});

describe("authorizations", () => {
  it("live in Réglages › Documents, for whom manages the documents", () => {
    expect(visibleCategories({ kind: "club", role: "coach", permissions: ["documents.manage"] })).toContain("documents");
    expect(visibleCategories({ kind: "club", role: "coach", permissions: ["documents.read"] })).not.toContain("documents");
    expect(settingsEntries.find((e) => e.id === "authorizations")?.category).toBe("documents");
    for (const l of ["fr", "nl", "en"] as const) {
      expect(settingsHubCopy[l].categories.documents.title).toBeTruthy();
      expect(settingsHubCopy[l].entries.authorizations.title).toBeTruthy();
    }
  });
  it("asks travel and emergency care on trips by default, the image right for the season", () => {
    expect(authorizationDefaults.travel).toEqual({ validity: "event", onTrips: true });
    expect(authorizationDefaults.care).toEqual({ validity: "season", onTrips: true });
    expect(authorizationDefaults.image).toEqual({ validity: "season", onTrips: false });
    expect(fillCopy(authorizationCopy.fr.requestTitle, { kind: "Droit à l'image (saison)", name: "Emma" })).toBe("Droit à l'image (saison) à signer pour Emma");
  });
  it("are recalled by the daily jobs, and signed through the existing signature", () => {
    expect(readFileSync("src/domains/jobs/registry.ts", "utf8")).toContain("authorizationReminders: await authorizationTick(db)");
    expect(readFileSync("src/domains/documents/service.ts", "utf8")).toContain("await authorizationSigned(s.c, d.id, p.userId)");
  });
});

describe("two homes", () => {
  it("sends the money mail to the split's parents only, when there is a split", () => {
    const sql = receivesMoneySql("g");
    expect(sql).toContain("NOT EXISTS(SELECT 1 FROM billing_split bs WHERE bs.subject_profile_id=g.subject_profile_id)");
    expect(sql).toContain("bs.guardian_profile_id=g.guardian_profile_id");
    for (const f of ["src/domains/dues/issue.ts", "src/domains/reminders/service.ts"]) expect(readFileSync(f, "utf8")).toContain("receivesMoneySql");
  });
  it("adds its tables and columns without touching an applied migration", () => {
    const sql = readFileSync("db/migrations/0082_family.sql", "utf8");
    expect(sql).not.toMatch(/\bDROP\b/);
    for (const t of ["authorization_request", "authorization_setting", "billing_split"]) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS postal_address");
  });
});
