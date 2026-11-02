import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { categoryIcons, isSettingsCategory, legacyAnchors, searchSettings, settingsCategories, settingsEntries, visibleCategories } from "../src/components/settings-nav";
import { settingsHubCopy } from "../src/components/settings-hub-copy";

/** Wave 15 (C13): settings split into categories, with a search and the old anchors still served. */
const all = ["people.read", "mandates.manage", "audit.read", "dues.manage", "calendar.manage", "notifications.manage", "documents.manage"];
const keys = (o: object): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]))
    .sort();
const texts = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? texts(v) : [String(v)]));

describe("settings categories", () => {
  it("shows every category to a president, in menu order", () => {
    expect(visibleCategories({ kind: "club", role: "club_president", permissions: all })).toEqual([...settingsCategories]);
  });
  it("keeps a coach, a player and a parent to their own account, notifications and data (12)", () => {
    for (const role of ["coach", "player", "guardian"])
      expect(visibleCategories({ kind: "club", role, permissions: ["calendar.read", "people.read"] })).toEqual(["account", "notifications", "data"]);
  });
  it("follows the rights, not the role name: a member trusted with mandates sees the club categories", () => {
    expect(visibleCategories({ kind: "club", role: "coach", permissions: ["mandates.manage"] })).toEqual(["account", "notifications", "data", "club", "members", "seasons", "activities", "money", "journals"]);
    expect(visibleCategories({ kind: "club", role: "coach", permissions: ["audit.read"] })).toEqual(["account", "notifications", "data", "journals"]);
  });
  it("hides Money when the dues module is off, and the club categories outside a club", () => {
    expect(visibleCategories({ kind: "club", role: "club_president", permissions: all, disabled: ["dues"] })).not.toContain("money");
    expect(visibleCategories({ kind: "federation", role: "federation_president", permissions: ["audit.read"] })).toEqual(["account", "notifications", "data", "journals"]);
  });
  it("recognises its own names only", () => {
    expect(isSettingsCategory("money")).toBe(true);
    expect(isSettingsCategory("../access")).toBe(false);
    for (const c of settingsCategories) expect(categoryIcons[c]).toBeTruthy();
  });
});

describe("settings search", () => {
  const fr = settingsHubCopy.fr.entries;
  const every = [...settingsCategories];
  it("finds a setting by a word of its title or its keywords, accents ignored", () => {
    expect(searchSettings("bareme", fr, every).map((e) => e.id)).toEqual(["duesRates"]);
    expect(searchSettings("SEUILS", fr, every).map((e) => e.id)).toEqual(["presence"]);
    expect(searchSettings("logo club", fr, every).map((e) => e.id)).toEqual(["identity"]);
    expect(searchSettings("   ", fr, every)).toEqual([]);
  });
  it("never offers a setting of a category the profile does not see", () => {
    expect(searchSettings("barème", fr, ["account", "notifications"])).toEqual([]);
    expect(searchSettings("langue", fr, ["account", "notifications"]).map((e) => e.id)).toEqual(["language"]);
  });
  it("works in Dutch and English too", () => {
    expect(searchSettings("drempels", settingsHubCopy.nl.entries, every).map((e) => e.id)).toEqual(["presence"]);
    expect(searchSettings("rates", settingsHubCopy.en.entries, every).map((e) => e.id)).toEqual(["duesRates"]);
  });
});

describe("settings anchors and texts", () => {
  const sources = readdirSync("src/components")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(`src/components/${f}`, "utf8"))
    .join("\n");
  it("points every searchable setting at a heading that exists, once", () => {
    const anchors = settingsEntries.map((e) => e.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const a of anchors) {
      // A Card with id="x" gives its heading the id "x-title"; the two journals build theirs from their kind.
      const written =
        sources.includes(`"${a}"`) ||
        (a.endsWith("-title") && sources.includes(`id="${a.slice(0, -6)}"`)) ||
        (a.startsWith("journal-") && sources.includes("`journal-${kind}`") && sources.includes(`kind="${a.slice(8)}"`));
      expect(written, a).toBe(true);
    }
  });
  it("sends every anchor of the former single page to a real category", () => {
    for (const c of Object.values(legacyAnchors)) expect(isSettingsCategory(c)).toBe(true);
    expect(legacyAnchors["settings-dues-title"]).toBe("money");
  });
  it("has the same keys in fr, nl and en, a text for every setting, and no long dashes", () => {
    expect(keys(settingsHubCopy.nl)).toEqual(keys(settingsHubCopy.fr));
    expect(keys(settingsHubCopy.en)).toEqual(keys(settingsHubCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      for (const e of settingsEntries) expect(settingsHubCopy[l].entries[e.id].title).toBeTruthy();
      for (const x of texts(settingsHubCopy[l])) expect(x).not.toMatch(/[–—]/);
    }
  });
  it("links the dues page to the Money sub-page, and the bell to the notifications sub-page", () => {
    expect(readFileSync("src/components/dues.tsx", "utf8")).toContain("/settings/money#settings-dues-title");
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("/settings/notifications");
  });
});
