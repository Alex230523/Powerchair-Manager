import type { IconName } from "./icons";
import type { PaletteCopy } from "./command-palette-copy";

/**
 * The actions of the Ctrl+K window (wave 15, C6) and its recent items.
 * Pure: which action a person sees depends on the same rights as the page it
 * opens; each one reuses the links of the "Créer" menu of the home page.
 */
export const actionIds = ["createEvent", "addPlayer", "importPlayers", "recordExpense", "mailTeam", "collectDues", "attendanceToday", "addTask", "changeSeason", "changeTeam"] as const;
export type ActionId = (typeof actionIds)[number];
export type PaletteAction = { id: ActionId; icon: IconName; route?: string; scope?: "season" | "team" };

export type PaletteContext = {
  kind?: "club" | "federation";
  role?: string;
  permissions: readonly string[];
  disabled: readonly string[];
  seasons: number;
  teams: number;
};

export function paletteActions(c: PaletteContext): PaletteAction[] {
  if (c.kind !== "club") return [];
  const has = (...p: string[]) => p.some((x) => c.permissions.includes(x));
  const on = (m: string) => !c.disabled.includes(m);
  const all: (PaletteAction & { allowed: boolean })[] = [
    { id: "createEvent", icon: "calendar", route: "/calendar?create=1", allowed: has("calendar.manage") },
    { id: "addPlayer", icon: "userPlus", route: "/players?create=1", allowed: has("people.manage") },
    { id: "importPlayers", icon: "players", route: "/players?import=1", allowed: has("people.manage") },
    { id: "recordExpense", icon: "funding", route: "/funding?create=1", allowed: on("finance") && has("dues.manage") },
    { id: "mailTeam", icon: "megaphone", route: "/communication?create=1", allowed: on("messages") && has("notifications.manage", "calendar.manage") },
    { id: "collectDues", icon: "dues", route: "/dues", allowed: on("dues") && has("dues.manage") },
    { id: "attendanceToday", icon: "attendance", route: "/attendance", allowed: has("attendance.manage", "calendar.manage") },
    // A1: a task in a few keys.
    { id: "addTask", icon: "clipboardList", route: "/tasks?new=1", allowed: c.role === "club_president" || has("calendar.manage", "teams.manage", "mandates.manage", "dues.manage") },
    { id: "changeSeason", icon: "calendar", scope: "season", allowed: c.seasons > 1 },
    { id: "changeTeam", icon: "team", scope: "team", allowed: c.teams > 1 },
  ];
  return all.filter((a) => a.allowed).map(({ allowed: _allowed, ...a }) => a);
}

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr");

/** All actions when the field is empty, else those whose words contain what was typed. */
export function matchActions(actions: readonly PaletteAction[], t: PaletteCopy, query: string) {
  const needle = fold(query.trim());
  return needle ? actions.filter((a) => fold(t[a.id]).includes(needle)) : [...actions];
}

/** The last five items opened, kept on this device. */
export type Recent = { key: string; label: string; detail?: string; href: string; icon: IconName };
const recentKey = "pfm-recent-commands";
export function readRecent(): Recent[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(recentKey) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.href === "string" && typeof r.label === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
export function pushRecent(list: readonly Recent[], item: Recent) {
  return [item, ...list.filter((r) => r.key !== item.key)].slice(0, 5);
}
export function writeRecent(list: readonly Recent[]) {
  try {
    window.localStorage.setItem(recentKey, JSON.stringify(list));
  } catch {
    // Private mode: nothing is remembered.
  }
}
