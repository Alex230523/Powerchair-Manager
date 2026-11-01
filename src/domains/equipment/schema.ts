import { z } from "zod";
export const ownerships = ["club", "player", "loan"] as const;
export const chairStatuses = [
  "available",
  "in_use",
  "maintenance",
  /** B3: out of service (a breakdown reported, not yet repaired) and lent to another club. */
  "out_of_service",
  "lent",
  "retired",
] as const;
/** FIPFA Laws of the Game: a powerchair must not exceed 10 km/h in play. */
export const MAX_MATCH_SPEED_KMH = 10;
export const itemCategories = [
  "ball",
  "cone",
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
    /** Wave 17 (Q1): a model of the list, or a new one proposed to the federation. */
    modelId: id.nullable().optional(),
    newModel: z.object({ brand: text(80), name: text(80).min(2) }).nullable().optional(),
    storageLocationId: id.nullable().optional(),
    lendable: z.boolean().optional(),
    /** A4: the supplier, a contact of the club's book. Absent keeps it. */
    supplierContactId: id.nullable().optional(),
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
    storageLocationId: id.nullable().optional(),
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
  /* Wave 17 (Q1): maintenance, storage places, models, loans. */
  z.object({ action: z.literal("service"), chairId: id, expectedVersion: z.number().int().positive(), doneOn: z.iso.date(), nextOn: day, note: text(500) }),
  z.object({
    action: z.literal("storage"),
    id: id.optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: text(120).min(2),
    placeId: id.nullable(),
    address: text(300),
    contact: text(200),
    access: text(500),
    notes: text(1000),
    archived: z.boolean().default(false),
  }),
  z.object({ action: z.literal("decideModel"), id, decision: z.enum(["validated", "refused"]), note: text(500) }),
  z.object({
    action: z.literal("lend"),
    chairId: id,
    borrowerId: id,
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    conditions: text(1000),
    depositCents: z.number().int().min(0).max(10000000).nullable(),
  }),
  z.object({ action: z.literal("requestLoan"), chairId: id, startsOn: z.iso.date(), endsOn: z.iso.date(), message: text(1000) }),
  z.object({ action: z.literal("decideLoan"), id, decision: z.enum(["accepted", "refused"]), note: text(1000), conditions: text(1000).optional(), depositCents: z.number().int().min(0).max(10000000).nullable().optional() }),
  z.object({ action: z.literal("handOver"), id, condition: text(1000) }),
  z.object({ action: z.literal("returnLoan"), id, condition: text(1000) }),
  z.object({ action: z.literal("cancelLoan"), id }),
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

/* ------------------------------------------------------------ Wave 17 (Q1) */
export const modelStatuses = ["validated", "proposed", "refused"] as const;
export const loanStatuses = ["requested", "accepted", "ongoing", "returned", "refused", "cancelled"] as const;
export type LoanStatus = (typeof loanStatuses)[number];
/** Loans that hold the chair for their dates. */
export const holdingLoan = (status: string) => status === "requested" || status === "accepted" || status === "ongoing";
/** Two date ranges (YYYY-MM-DD, ends included) share at least a day. */
export function overlaps(a: { starts_on: string; ends_on: string }, b: { starts_on: string; ends_on: string }) {
  return a.starts_on <= b.ends_on && b.starts_on <= a.ends_on;
}
/** A chair is free for the dates when no accepted or ongoing loan covers them. */
export function freeFor(loans: { status: string; starts_on: string; ends_on: string }[], range: { starts_on: string; ends_on: string }) {
  return !loans.some((l) => (l.status === "accepted" || l.status === "ongoing") && overlaps(l, range));
}
/** What can happen next to a loan, for the lender and for the borrower. */
export function loanMoves(status: string, side: "lender" | "borrower") {
  if (side === "lender") return status === "requested" ? ["accept", "refuse"] : status === "accepted" ? ["handOver", "cancel"] : status === "ongoing" ? ["return"] : [];
  return status === "requested" || status === "accepted" ? ["cancel"] : [];
}
/** The return reminder: from seven days before the end, once. */
export function returnReminderDue(endsOn: string, today: string, remindedOn: string | null) {
  if (remindedOn) return false;
  const from = new Date(endsOn + "T12:00:00Z");
  from.setUTCDate(from.getUTCDate() - 7);
  return today >= from.toISOString().slice(0, 10) && today <= endsOn;
}
/** « Equalizer » or « Brand · Name ». */
export const modelLabel = (m: { brand: string; name: string }) => (m.brand ? `${m.brand} · ${m.name}` : m.name);

/** B3: the kinds of a chair's interventions (shared with the client). */
export const interventionKinds = ["service", "breakdown", "repair", "battery", "adjustment", "speed_check"] as const;
