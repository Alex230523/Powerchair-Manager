import { z } from "zod";
export const ownerships = ["club", "player", "loan"] as const;
export const chairStatuses = [
  "available",
  "in_use",
  "maintenance",
  "retired",
] as const;
/** FIPFA Laws of the Game: a powerchair must not exceed 10 km/h in play. */
export const MAX_MATCH_SPEED_KMH = 10;
export const itemCategories = [
  "ball",
  "first_aid",
  "battery",
  "charger",
  "spare_part",
  "jersey",
  "protection",
  "tool",
  "other",
] as const;
export const wishStatuses = [
  "pending",
  "approved",
  "refused",
  "bought",
  "cancelled",
] as const;
const id = z.uuid(),
  text = (n: number) => z.string().trim().max(n),
  day = z.iso.date().nullable();
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("chair"),
    id: id.optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: text(80).min(2),
    brand: text(80),
    model: text(80),
    serialNumber: text(80),
    ownership: z.enum(ownerships),
    status: z.enum(chairStatuses),
    maxSpeedKmh: z.number().min(0).max(20).nullable(),
    battery: text(120),
    acquiredOn: day,
    lastServiceOn: day,
    nextServiceOn: day,
    notes: text(2000),
    /** Where the chair is kept (club room, a coach's garage). */
    storage: text(120).optional(),
  }),
  z.object({
    action: z.literal("assign"),
    chairId: id,
    profileId: id,
    primary: z.boolean(),
    startsOn: z.iso.date(),
  }),
  z.object({
    action: z.literal("unassign"),
    id,
    endsOn: z.iso.date(),
  }),
  z.object({
    action: z.literal("item"),
    id: id.optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: text(120).min(2),
    category: z.enum(itemCategories),
    quantity: z.number().int().min(0).max(10000),
    storage: text(120),
    expiresOn: day,
    notes: text(1000),
    archived: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("wish"),
    title: text(160).min(2),
    reason: text(1000),
    quantity: z.number().int().min(1).max(1000),
    estimatedCents: z.number().int().min(0).max(100000000).nullable(),
    link: z.union([
      z.literal(""),
      z.string().trim().max(500).regex(/^https?:\/\/[^\s<>"]+$/),
    ]),
  }),
  z.object({
    action: z.literal("decideWish"),
    id,
    expectedVersion: z.number().int().positive(),
    decision: z.enum(["approved", "refused"]),
    note: text(1000),
  }),
  z.object({
    action: z.literal("boughtWish"),
    id,
    expectedVersion: z.number().int().positive(),
    boughtOn: z.iso.date(),
  }),
  z.object({ action: z.literal("cancelWish"), id }),
]);
/** Material other than chairs. */
export type ExpiryState = "expired" | "soon" | "ok" | "none";
/** First-aid kits, batteries, extinguishers: expired, within 30 days, or fine. */
export function expiryState(expiresOn: string | null, today: string): ExpiryState {
  if (!expiresOn) return "none";
  if (expiresOn < today) return "expired";
  const soon = new Date(today + "T12:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 30);
  return expiresOn <= soon.toISOString().slice(0, 10) ? "soon" : "ok";
}
export type Command = z.infer<typeof commandSchema>;
export type ServiceState = "ok" | "soon" | "due" | "unknown";
/** Maintenance reminder: overdue, within 14 days, or fine. Dates are YYYY-MM-DD. */
export function serviceState(
  next: string | null,
  today: string,
  status: string,
): ServiceState {
  if (status === "retired") return "ok";
  if (status === "maintenance") return "due";
  if (!next) return "unknown";
  if (next < today) return "due";
  const soon = new Date(today + "T12:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 14);
  return next <= soon.toISOString().slice(0, 10) ? "soon" : "ok";
}
/** A chair faster than the match limit is flagged, never blocked: it may be used for training only. */
export function overMatchSpeed(speed: number | string | null) {
  return speed !== null && Number(speed) > MAX_MATCH_SPEED_KMH;
}
