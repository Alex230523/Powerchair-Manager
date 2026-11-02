import { describe, it, expect } from "vitest";
import { matchActions, paletteActions, pushRecent, type PaletteContext } from "../src/components/palette";
import { paletteCopy } from "../src/components/command-palette-copy";

/** Wave 15 (C6): the actions of the Ctrl+K window. */
const president: PaletteContext = {
  kind: "club",
  role: "club_president",
  permissions: ["calendar.manage", "people.manage", "dues.manage", "notifications.manage", "attendance.manage"],
  disabled: [],
  seasons: 2,
  teams: 3,
};
const ids = (c: PaletteContext) => paletteActions(c).map((a) => a.id);

describe("palette actions", () => {
  it("offers each action only with its right and its module", () => {
    expect(ids(president)).toEqual(["createEvent", "addPlayer", "importPlayers", "recordExpense", "mailTeam", "collectDues", "attendanceToday", "addTask", "changeSeason", "changeTeam"]);
    expect(ids({ ...president, role: "coach", permissions: ["attendance.manage"], seasons: 1, teams: 1 })).toEqual(["attendanceToday"]);
    expect(ids({ ...president, disabled: ["finance", "dues", "communication"] })).not.toEqual(expect.arrayContaining(["recordExpense"]));
    expect(ids({ ...president, disabled: ["finance", "dues", "communication"] })).toEqual(["createEvent", "addPlayer", "importPlayers", "attendanceToday", "addTask", "changeSeason", "changeTeam"]);
    expect(ids({ ...president, kind: "federation" })).toEqual([]);
  });
  it("opens the same forms as the Créer menu of the home page", () => {
    const routes = Object.fromEntries(paletteActions(president).map((a) => [a.id, a.route ?? a.scope]));
    expect(routes).toMatchObject({ createEvent: "/calendar?create=1", addPlayer: "/players?create=1", recordExpense: "/funding?create=1", mailTeam: "/communication?create=1", addTask: "/tasks?new=1", changeSeason: "season" });
  });
  it("matches what is typed, accents ignored, all when empty", () => {
    const all = paletteActions(president);
    expect(matchActions(all, paletteCopy.fr, "").length).toBe(all.length);
    expect(matchActions(all, paletteCopy.fr, "evenement").map((a) => a.id)).toEqual(["createEvent"]);
    expect(matchActions(all, paletteCopy.nl, "spelers").map((a) => a.id)).toEqual(["importPlayers"]);
    expect(matchActions(all, paletteCopy.en, "zzz")).toEqual([]);
  });
  it("keeps the five last items, newest first, without doubles", () => {
    let list = [] as ReturnType<typeof pushRecent>;
    for (const k of ["a", "b", "c", "d", "e", "f", "c"]) list = pushRecent(list, { key: k, label: k, href: "/" + k, icon: "home" });
    expect(list.map((r) => r.key)).toEqual(["c", "f", "e", "d", "b"]);
  });
  it("has every text in three languages, without dashes", () => {
    expect(Object.keys(paletteCopy.nl)).toEqual(Object.keys(paletteCopy.fr));
    expect(Object.keys(paletteCopy.en)).toEqual(Object.keys(paletteCopy.fr));
    expect(JSON.stringify(paletteCopy)).not.toMatch(/[–—]/);
  });
});
