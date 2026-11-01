import { z } from "zod";

/** Hall of fame (wave 16, S1): the commands on the club's prizes. Pure, for the unit tests. */
export const awardKinds = ["team", "individual", "club"] as const;
const day = z.iso.date();
const fields = {
  title: z.string().trim().min(2).max(120),
  competition: z.string().trim().max(120).default(""),
  kind: z.enum(awardKinds),
  place: z.number().int().min(1).max(500).nullable(),
  awardedOn: day,
  seasonId: z.uuid().nullable(),
  teamId: z.uuid().nullable(),
  profileId: z.uuid().nullable(),
  note: z.string().trim().max(500).default(""),
  publishable: z.boolean().default(false),
};
const valid = (x: { kind: string; profileId: string | null }) => x.kind !== "individual" || !!x.profileId;
export const awardCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields, tripId: z.uuid().nullable().default(null) }).refine(valid, { path: ["profileId"] }),
  z.object({ action: z.literal("update"), id: z.uuid(), expectedVersion: z.number().int().min(1), ...fields }).refine(valid, { path: ["profileId"] }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
  /** A photo: PNG, JPEG or WebP of 1.5 MB at most, base64. */
  z.object({ action: z.literal("photo"), id: z.uuid(), mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(2_100_000) }),
  z.object({ action: z.literal("removePhoto"), id: z.uuid() }),
  /** The public page (Settings > Club): on gives it an address, off removes it. */
  z.object({ action: z.literal("widget"), enabled: z.boolean() }),
]);
export type AwardCommand = z.infer<typeof awardCommand>;

/** The medal of a place: gold, silver, bronze, or a star for any other distinction. */
export function medalOf(place: number | null) {
  return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : "star";
}
/** What the public page shows: never a person's prize nor a photo without « Peut être publié ». */
export function publicAward<T extends { kind: string; publishable: boolean; has_photo: boolean; person: string | null }>(a: T) {
  if (a.kind === "individual" && !a.publishable) return null;
  return { ...a, has_photo: a.has_photo && a.publishable, person: a.publishable ? a.person : null };
}
/** Prizes grouped by season name, the most recent first (the timeline). */
export function bySeason<T extends { season: string | null; awarded_on: string }>(awards: T[], none: string) {
  const groups = new Map<string, { latest: string; items: T[] }>();
  for (const a of [...awards].sort((x, y) => y.awarded_on.localeCompare(x.awarded_on))) {
    const key = a.season ?? none;
    const g = groups.get(key) ?? { latest: a.awarded_on, items: [] };
    g.items.push(a);
    groups.set(key, g);
  }
  return [...groups].sort((x, y) => y[1].latest.localeCompare(x[1].latest)).map(([season, g]) => ({ season, items: g.items }));
}
