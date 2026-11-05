import { z } from "zod";

/** Lot 6 (05/11/2026): the commission's decisions, recorded and signed. */
export const decisionKinds = ["transfer", "force_majeure", "fine", "international", "discipline", "other"] as const;
export type DecisionKind = (typeof decisionKinds)[number];
const id = z.uuid();
export const commissionCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    kind: z.enum(decisionKinds),
    subject: z.string().trim().min(2).max(200),
    decision: z.string().trim().min(2).max(2000),
    reference: z.string().trim().max(120).default(""),
    decidedOn: z.iso.date(),
  }),
  z.object({ action: z.literal("sign"), id }),
  z.object({ action: z.literal("unsign"), id }),
]);
export type CommissionCommand = z.infer<typeof commissionCommand>;
