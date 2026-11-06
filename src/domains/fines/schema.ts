import { z } from "zod";

/**
 * Point 10 (04/11/2026, règlement BPCF 2025): the fines a federation gives
 * its clubs. The amounts the rules set are offered, the federation can
 * change them; the club sees its own fines, nothing of the others.
 */
export { fineKinds, type FineKind } from "../federation/policy";
import { bpcfPolicy, fineKinds, type FineKind as Kind } from "../federation/policy";
/** BPCF: 25 € a late club, 50 € a forfeit, up to 500 € a day of matches not held (05/11/2026: the federation's policy may say otherwise). */
export const fineDefaults: Record<Kind, number | null> = { ...bpcfPolicy.fineDefaults, other: null };

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
