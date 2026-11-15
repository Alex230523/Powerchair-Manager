import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { menuGroups, settingsItem, type Workspace } from "../src/components/menu";
import { permissions } from "../src/domains/access/policy";
import { searchSettings, settingsEntries, visibleCategories } from "../src/components/settings-nav";
import { settingsHubCopy } from "../src/components/settings-hub-copy";

/** 12: no « Plus » group; « Réglages » apart; « Gestion du club » and personal data inside Réglages. */
const ws = (role: "club_president" | "coach" | "player"): Workspace => ({
  user: { name: "X" },
  contexts: [{ id: "m", name: "C", role }],
  profiles: [],
  selected: { id: "m", organization_id: "o", organization_name: "C", kind: "club", logo_version: null },
  permissions: permissions(role, []),
});
describe("one « Réglages », no « Plus »", () => {
  it("leaves neither « Plus », « Gestion du club » nor « Données personnelles » in any menu", () => {
    for (const role of ["club_president", "coach", "player"] as const) {
      const groups = menuGroups(ws(role));
      expect(groups.map((g) => g.id)).not.toContain("more");
      const routes = groups.flatMap((g) => g.items.map((i) => i.route));
      for (const r of ["/club/manage", "/privacy", "/settings"]) expect(routes, role).not.toContain(r);
    }
    expect(settingsItem.route).toBe("/settings");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain('{state?.selected && <div className="nav-settings">{item(settingsItem)}</div>}');
  });
  it("redirects the former addresses", () => {
    expect(readFileSync("src/app/[locale]/privacy/page.tsx", "utf8")).toContain("redirect(`/${locale}/settings/data`)");
    expect(readFileSync("src/app/[locale]/club/manage/page.tsx", "utf8")).toContain("redirect(`/${locale}/settings/club`)");
  });
});
describe("every moved block in Réglages, found by the search", () => {
  it("offers « Mes données » to everyone, the club's data and seasons to whom may", () => {
    expect(visibleCategories({ kind: "club", role: "player", permissions: permissions("player", []) })).toContain("data");
    expect(visibleCategories({ kind: "club", role: "coach", permissions: ["calendar.read"] })).not.toContain("seasons");
    expect(visibleCategories({ kind: "club", role: "coach", permissions: ["calendar.read"] })).not.toContain("members");
    expect(visibleCategories({ kind: "club", role: "club_president", permissions: permissions("club_president", []) })).toEqual(expect.arrayContaining(["data", "seasons", "club", "members"]));
  });
  it("finds each moved block by its name in the three languages", () => {
    const all = visibleCategories({ kind: "club", role: "club_president", permissions: permissions("club_president", []) });
    for (const [word, id] of [
      ["Mes données", "myData"],
      ["Données personnelles du club", "privacy"],
      ["Saisons et équipes", "seasons"],
      ["Passage de saison", "rollover"],
      ["Transmission de la présidence", "presidency"],
    ] as const)
      expect(searchSettings(word, settingsHubCopy.fr.entries, all).map((e) => e.id), word).toContain(id);
    for (const l of ["fr", "nl", "en"] as const) for (const e of settingsEntries) expect(settingsHubCopy[l].entries[e.id]?.title, `${l} ${e.id}`).toBeTruthy();
  });
  it("puts the panels where the entries say", () => {
    const s = readFileSync("src/components/settings.tsx", "utf8");
    expect(s).toContain('category === "data" && (');
    // 13/11/2026: the club's personal data are under « Sécurité et confidentialité ».
    expect(s).toContain('category === "journals" && ws?.selected?.kind === "club" && (own.has("audit.read") || own.has("mandates.manage")) && <Privacy locale={locale} embedded />');
    expect(s).toContain('<People locale={locale} management embedded />');
    expect(s).toContain('<div id="settings-presidency">');
    // 04/11/2026: « Équipes du club » repeated the cards above it on « Mes équipes »: removed.
    expect(readFileSync("src/components/teams.tsx", "utf8")).not.toContain("<ClubIdentity");
    // 13/11/2026: the shortcut opens the settings' home, now in four parts.
    expect(readFileSync("src/components/home.tsx", "utf8")).toContain('href("/settings")');
  });
});
