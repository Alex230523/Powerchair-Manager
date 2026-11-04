import { z } from "zod";
import { rawEntries } from "./entries";

/**
 * 20: « Nouveautés ». One file per visible delivery in content/changelog,
 * short and plain, in the three languages, for the roles it concerns.
 */
export const newsRoles = ["player", "parent", "coach", "president", "federation", "all"] as const;
export type NewsRole = (typeof newsRoles)[number];
const text = z.object({ title: z.string().trim().min(3).max(90), text: z.string().trim().min(20).max(400) });
export const newsEntry = z
  .object({
    date: z.iso.date(),
    roles: z.array(z.enum(newsRoles)).min(1),
    link: z.string().regex(/^\/[a-z0-9/_-]*$/),
    image: z.string().regex(/^\/[\w/.-]+\.(png|jpe?g|webp)$/).nullable(),
    fr: text,
    nl: text,
    en: text,
  })
  .strict();
export type NewsEntry = z.infer<typeof newsEntry> & { id: string };

/** Every entry, newest first (a malformed file breaks the build's test, not the page). */
export function allEntries(): NewsEntry[] {
  return rawEntries
    .flatMap((e) => {
      const r = newsEntry.safeParse(e.data);
      return r.success ? [{ ...r.data, id: e.id }] : [];
    })
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));
}
/** The news role of a profile. */
export function newsRoleOf(kind: string | null | undefined, role: string | null | undefined): NewsRole {
  if (kind === "federation") return "federation";
  return role === "club_president" ? "president" : role === "coach" ? "coach" : role === "guardian" ? "parent" : role === "player" ? "player" : "all";
}
export const concerns = (e: { roles: readonly string[] }, role: NewsRole) => e.roles.includes("all") || e.roles.includes(role);
/** « Nouveau » for 14 days after its date, until read. */
export const isFresh = (e: { date: string }, today: string) => Date.parse(today) - Date.parse(e.date) < 14 * 86400000 && e.date <= today;
/** At most this many « Nouveau » in the menu: beyond, the badge says nothing any more. */
export const maxBadges = 3;
/** The menu routes that carry « Nouveau » for this person: the newest few, until the page is opened. */
export function badgeRoutes(entries: NewsEntry[], role: NewsRole, read: Set<string>, today: string) {
  return [...new Set(entries.filter((e) => concerns(e, role) && isFresh(e, today) && !read.has(e.id) && e.link !== "/").map((e) => e.link))].slice(0, maxBadges);
}
/** The entries a menu route stands for: opening the page marks them read, so its badge goes. */
export function entriesOfRoute(entries: NewsEntry[], role: NewsRole, route: string) {
  return entries.filter((e) => concerns(e, role) && e.link === route).map((e) => e.id);
}
/** The one window after signing in: the newest fresh unread entry for this role, unless switched off. */
export function popupEntry(entries: NewsEntry[], role: NewsRole, read: Set<string>, today: string, off: boolean) {
  if (off) return null;
  return entries.find((e) => concerns(e, role) && isFresh(e, today) && !read.has(e.id)) ?? null;
}
