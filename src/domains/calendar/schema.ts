import { z } from "zod";
import { localTime } from "./time";
export const kinds = [
  "training",
  "friendly",
  "meeting",
  "tournament",
  "camp",
  "association",
  "custom",
] as const;
export const visibilities = [
  "organization",
  "team",
  "participants",
  "staff",
] as const;
const id = z.uuid(),
  text = (n: number) => z.string().trim().max(n);
export const eventFields = z.object({
  title: text(160).min(2),
  kind: z.enum(kinds),
  customType: text(80).default(""),
  timezone: text(80).min(2),
  localStart: localTime,
  localEnd: localTime,
  fold: z.enum(["reject", "earlier", "later"]).default("reject"),
  teamId: id.nullable(),
  placeId: id.nullable(),
  sharedVenueId: id.nullable().optional(),
  freeLocation: text(500).optional(),
  responsibleId: z.string().min(1).max(120),
  visibility: z.enum(visibilities),
  equipment: text(2000),
  instructions: text(5000),
  participants: z.array(id).max(200),
  documents: z.array(id).max(20),
});
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sharedVenue"),
    name: text(120).min(2),
    address: text(500).min(2),
  }),
  z.object({
    action: z.literal("place"),
    id: id.optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: text(120).min(2),
    address: text(500),
    contact: text(250),
    capacity: z.number().int().min(1).max(100000).nullable(),
    costCents: z.number().int().min(0).max(100000000),
    accessible: z.boolean(),
    toilets: z.boolean(),
    parking: z.boolean(),
    storage: z.boolean(),
    charging: z.boolean(),
    logistics: text(2000),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("create"),
    ...eventFields.shape,
    intervalDays: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(7),
      z.literal(14),
    ]),
    occurrences: z.number().int().min(1).max(52),
    requestId: id,
  }),
  z.object({
    action: z.literal("update"),
    id,
    expectedVersion: z.number().int().positive(),
    scope: z.enum(["one", "following", "all"]),
    ...eventFields.shape,
  }),
  z.object({
    action: z.literal("cancel"),
    id,
    expectedVersion: z.number().int().positive(),
    scope: z.enum(["one", "following", "all"]),
    reason: text(1000).min(5),
  }),
  z.object({
    action: z.literal("feed"),
    name: text(80).min(2),
    teamId: id.nullable(),
    /** Wave 15: money deadlines in the feed (only kept for a person with money rights). */
    includeMoney: z.boolean().optional(),
    /** Wave 15 (C9): only the events that concern me (invited, participant or in charge). */
    mine: z.boolean().optional(),
  }),
  z.object({ action: z.literal("revokeFeed"), id }),
  /** Wave 15 (C9): a new link with the same choices; the old one stops working. */
  z.object({ action: z.literal("renewFeed"), id }),
  /** Copies the scheduled events of one week to another (both Mondays). */
  z.object({
    action: z.literal("copyWeek"),
    fromMonday: z.iso.date(),
    toMonday: z.iso.date(),
    teamId: id.nullable(),
    requestId: id,
  }),
]);
/** Day difference between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000,
  );
}
export function isMonday(day: string) {
  return new Date(day + "T12:00:00Z").getUTCDay() === 1;
}
export type EventInput = z.infer<typeof eventFields>;
export type Command = z.infer<typeof commandSchema>;
export const rangeSchema = z
  .object({
    all: z.enum(["true", "false"]).optional(),
    offset: z.coerce.number().int().min(0).max(1000000).optional(),
    from: z.iso.date(),
    to: z.iso.date(),
    team: z.union([id, z.literal("")]).default(""),
    place: z.union([id, z.literal("")]).default(""),
  })
  .refine(
    (v) =>
      v.from < v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    "Range must span at most 366 days",
  );
export type Range = z.infer<typeof rangeSchema>;
