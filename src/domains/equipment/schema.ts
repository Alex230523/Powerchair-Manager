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
]);
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
