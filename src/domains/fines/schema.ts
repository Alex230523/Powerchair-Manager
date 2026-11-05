import { z } from "zod";

/**
 * Point 10 (04/11/2026, règlement BPCF 2025): the fines a federation gives
 * its clubs. The amounts the rules set are offered, the federation can
 * change them; the club sees its own fines, nothing of the others.
 */
export const fineKinds = ["late", "forfeit", "forfeit_day", "other"] as const;
export type FineKind = (typeof fineKinds)[number];
/** BPCF: 25 € a late club, 50 € a forfeit, up to 500 € a day of matches not held. */
export const fineDefaults: Record<FineKind, number | null> = { late: 2500, forfeit: 5000, forfeit_day: 50000, other: null };

const id = z.uuid();
export const fineCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    clubId: id,
    kind: z.enum(fineKinds),
    amountCents: z.number().int().min(1).max(10000000),
    issuedOn: z.iso.date(),
    reason: z.string().trim().max(1000).default(""),
  }),
  z.object({ action: z.literal("paid"), id, paid: z.boolean() }),
  z.object({ action: z.literal("cancel"), id }),
]);
export type FineCommand = z.infer<typeof fineCommand>;

export type FineState = "paid" | "open" | "cancelled";
export const fineState = (f: { paid_on: string | null; cancelled_at: string | null }): FineState => (f.cancelled_at ? "cancelled" : f.paid_on ? "paid" : "open");
