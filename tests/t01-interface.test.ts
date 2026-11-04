import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { homeCopy } from "../src/components/home-copy";
import { teamChoices } from "../src/components/team-choices";
import { categories, offeredCategories, retiredCategories, commandSchema } from "../src/domains/documents/schema";
import { menuGroups, type Workspace } from "../src/components/menu";
import { permissions } from "../src/domains/access/policy";
import { moduleOfPath } from "../src/domains/access/rights";
import { formsCopy } from "../src/components/registration-forms-copy";
import { matchesCopy } from "../src/components/matches-copy";
import { placeComboCopy } from "../src/components/place-combobox-copy";
import { retiredCopy } from "../src/components/documents-copy";
import { accessCopy } from "../src/components/access-copy";

/** Lot 1: the interface corrections, without any change of business rule. */
const css = readFileSync("src/app/globals.css", "utf8");
describe("one rule for alignments", () => {
  it("gives fields, menus and buttons one height and check boxes one size", () => {
    expect(css).toContain("--control-height: 2.75rem;");
    expect(css).toContain("--check-size: 20px;");
    expect(css).toMatch(/input\[type="checkbox"\],\ninput\[type="radio"\] \{[^}]*width: var\(--check-size\);[^}]*min-height: 0;/);
    expect(css).toContain("margin-top: max(0px, calc((1lh - var(--check-size)) / 2));");
    expect(css).toContain(":where(label) > select:where(:not(.compact-select))");
  });
  it("keeps the key figures of one grid the same size, a hint on one line, none on « Matchs joués »", () => {
    expect(css).toMatch(/\.stat-row-grid \{\n {2}grid-auto-rows: 1fr;/);
    for (const l of ["fr", "nl", "en"] as const) expect(homeCopy[l].metrics.matchesPlayed.hint).toBeUndefined();
  });
});

describe("behaviours", () => {
  it("lists each team once, those of the chosen season", () => {
    const teams = [
      { id: "a1", name: "Aigles", season_id: "s1", starts_on: "2025-07-01" },
      { id: "a2", name: "Aigles", season_id: "s2", starts_on: "2026-07-01" },
      { id: "b2", name: "Ours", season_id: "s2", starts_on: "2026-07-01" },
    ];
    expect(teamChoices(teams, "s2", "").map((t) => t.id)).toEqual(["a2", "b2"]);
    expect(teamChoices(teams, null, "").map((t) => t.id)).toEqual(["a2", "b2"]);
    // A team chosen from another season stays listed.
    expect(teamChoices(teams, "s2", "a1").map((t) => t.id)).toEqual(["a1", "a2", "b2"]);
  });
  it("opens an event in a centred window that keeps ?event= and gives the focus back", () => {
    const cal = readFileSync("src/components/calendar.tsx", "utf8");
    expect(cal).toContain('className="player-dialog side-sheet event-sheet event-modal"');
    expect(cal).toContain('url.searchParams.set("event", id)');
    expect(cal).toContain("back?.isConnected && back.focus()");
    expect(css).toContain(".player-dialog.side-sheet.event-sheet.event-modal {");
  });
  it("searches the place in one combobox, then offers free text and « + Créer ce lieu »", () => {
    const combo = readFileSync("src/components/place-combobox.tsx", "utf8");
    for (const a of ['role="combobox"', 'role="listbox"', 'role="group"', "aria-activedescendant", 'name="place"', 'name="sharedVenue"', 'name="freeLocation"']) expect(combo).toContain(a);
    for (const l of ["fr", "nl", "en"] as const) expect(Object.keys(placeComboCopy[l]).sort()).toEqual(Object.keys(placeComboCopy.fr).sort());
    expect(readFileSync("src/components/calendar.tsx", "utf8")).toContain("<PlaceCombobox");
  });
  it("offers « Toutes les équipes » in the invitations", () => {
    expect(readFileSync("src/components/event-invite.tsx", "utf8")).toContain("{t.allTeams}");
  });
  it("has one « Nouveau match » that asks friendly or competition", () => {
    const m = readFileSync("src/components/matches.tsx", "utf8");
    expect(m).not.toContain("lc.newFriendly");
    expect(m).toContain("setChoosing(true)");
    for (const l of ["fr", "nl", "en"] as const) expect(matchesCopy[l].kindFriendly && matchesCopy[l].kindCompetition).toBeTruthy();
  });
  it("folds each question of a registration form, title kept, all at once too", () => {
    for (const l of ["fr", "nl", "en"] as const) for (const k of ["fold", "unfold", "foldAll", "unfoldAll", "untitled"] as const) expect(formsCopy[l][k]).toBeTruthy();
    const r = readFileSync("src/components/registrations.tsx", "utf8");
    expect(r).toContain("aria-expanded={!folded.has(f.key)}");
    expect(r).toContain("onInvalidCapture");
  });
});

describe("renamings and withdrawals", () => {
  const club = (role: "club_president"): Workspace => ({ user: { name: "X" }, contexts: [{ id: "m", name: "C", role }], profiles: [], selected: { id: "m", organization_id: "o", organization_name: "C", kind: "club", logo_version: null }, permissions: permissions(role, []) });
  it("turns « Licences » into « Classification », the old address redirected", () => {
    const routes = menuGroups(club("club_president")).flatMap((g) => g.items.map((i) => i.route));
    expect(routes).toContain("/classification");
    expect(routes).not.toContain("/licenses");
    expect(readFileSync("src/app/[locale]/licenses/page.tsx", "utf8")).toContain("redirect(`/${locale}/classification`)");
    expect(moduleOfPath("/classification")).toBe("licenses");
    const lic = readFileSync("src/components/licenses.tsx", "utf8");
    const page = lic.slice(lic.indexOf("export function ClubClassification"));
    expect(page.slice(0, page.indexOf("\nexport function", 10) > 0 ? page.indexOf("\nexport function", 10) : undefined)).not.toContain("requestLicenses");
  });
  it("withdraws « Carte d'identité » from new documents and offers its deletion to the president", () => {
    expect(retiredCategories).toEqual(["identity"]);
    expect(offeredCategories).not.toContain("identity");
    expect(categories).toContain("identity");
    expect(() => commandSchema.parse({ action: "request", seasonId: "00000000-0000-4000-8000-000000000000", name: "Carte", category: "identity", sensitive: false })).toThrow();
    for (const l of ["fr", "nl", "en"] as const) expect(Object.keys(retiredCopy[l]).sort()).toEqual(Object.keys(retiredCopy.fr).sort());
    const docs = readFileSync("src/components/documents.tsx", "utf8");
    expect(docs).not.toContain('"/licenses"');
    expect(docs).not.toContain("Fiches d’exercice");
    expect(docs).toContain('action: "purgeRetired"');
  });
  it("chooses the tags right in « Ajouter un contact »", () => {
    const picker = readFileSync("src/components/contact-picker.tsx", "utf8");
    expect(picker).toContain('className="tag-picker"');
    expect(picker).toContain("tags, notes");
  });
  it("leaves registrations and dues off the coaches' page, the export at the top, « Colonnes » on the table's bar", () => {
    const dir = readFileSync("src/components/player-directory.tsx", "utf8");
    expect(dir).toContain('{role === "player" && (\n            <>\n              <Link');
    expect(dir).toContain('{role === "coach" && data?.capabilities.canExport && (');
    expect(readFileSync("src/components/data-grid.tsx", "utf8")).toContain('<div className="dg-toolbar">');
  });
});

describe("the sign-in screen", () => {
  it("shows « Réessayer » only when the server cannot be reached, inside the card", () => {
    const a = readFileSync("src/components/access.tsx", "utf8");
    expect(a).not.toContain("{loading || state ? null : (");
    expect(a).toContain("{unreachable && (");
    expect(accessCopy.fr.unreachable).toBe("Impossible de joindre le serveur. Vérifiez votre connexion.");
    expect(css).toContain(".access-card .access-links {");
    expect(existsSync("src/app/[locale]/classification/page.tsx")).toBe(true);
  });
});
