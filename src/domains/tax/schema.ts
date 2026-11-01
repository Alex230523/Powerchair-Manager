import { z } from "zod";
import { natures } from "./rules";

/** B8: what the club does with its tax receipts (approval, donors, gifts, receipts). */
const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const day = z.iso.date();
export const taxCommand = z.discriminatedUnion("action", [
  /** Réglages › Club: the approval by the SPF Finances, number and period required on « oui ». */
  z.object({
    action: z.literal("approval"),
    approved: z.boolean(),
    number: text(60).default(""),
    from: day.nullable().default(null),
    to: day.nullable().default(null),
    thresholdCents: z.number().int().min(0).max(1000000).default(4000),
  }),
  z.object({
    action: z.literal("donor"),
    id: id.optional(),
    kind: z.enum(["person", "company"]),
    name: text(160).min(2),
    street: text(160).default(""),
    postalCode: text(12).default(""),
    city: text(80).default(""),
    country: z.string().regex(/^[A-Z]{2}$/).default("BE"),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    companyNumber: text(20).default(""),
    contactId: id.nullable().default(null),
  }),
  /** The national number, typed by someone with the dedicated right (or by the donor through the secure form). */
  z.object({ action: z.literal("national"), donorId: id, value: text(20) }),
  z.object({ action: z.literal("revealNational"), donorId: id }),
  /** Who else may see the national numbers (the presidency always may). */
  z.object({ action: z.literal("identityRight"), mandateId: id, granted: z.boolean() }),
  z.object({ action: z.literal("requestNational"), donorId: id }),
  z.object({
    action: z.literal("gift"),
    id: id.optional(),
    donorId: id,
    receivedOn: day,
    amountCents: z.number().int().min(1).max(100000000),
    nature: z.enum(natures),
    note: text(300).default(""),
    /** The ledger line or the pot's donation it comes from (once). */
    transactionId: id.nullable().default(null),
    movementId: id.nullable().default(null),
  }),
  z.object({ action: z.literal("cancelGift"), id, reason: text(300).min(5) }),
  /** The receipts of a year: one per donor over the threshold who has none yet. */
  z.object({ action: z.literal("issue"), year: z.number().int().min(2000).max(2100) }),
  z.object({ action: z.literal("correct"), id, reason: text(300).min(5) }),
  z.object({ action: z.literal("cancelReceipt"), id, reason: text(300).min(5) }),
  /** E-mails a private link to each receipt of the year not yet sent (donors with an address). */
  z.object({ action: z.literal("send"), year: z.number().int().min(2000).max(2100) }),
]);
export type TaxCommand = z.infer<typeof taxCommand>;
