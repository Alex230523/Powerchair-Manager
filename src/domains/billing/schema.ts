import { z } from "zod";

/** Console, step 4 (05/11/2026): the platform's subscriptions. Pure parts, shared with the screens. */
export const planPeriods = ["month", "year"] as const;
export const planBases = ["organization", "player"] as const;
export const invoiceStates = ["draft", "sent", "paid", "cancelled"] as const;
export type InvoiceState = (typeof invoiceStates)[number];
const id = z.uuid();
const cents = z.number().int().min(0).max(100000000);
/** A discount code: letters, digits and hyphens, written in capitals. */
export const discountCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,30}$/);
export const billingCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    id: id.nullable().default(null),
    code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
    name: z.string().trim().min(2).max(120),
    amountCents: cents,
    period: z.enum(planPeriods),
    basis: z.enum(planBases),
    active: z.boolean().default(true),
  }),
  z.object({ action: z.literal("subscribe"), organizationId: id, planId: id, startedOn: z.iso.date(), note: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("unsubscribe"), id, endedOn: z.iso.date() }),
  /** An invoice for a period of the subscription: the quantity follows the plan's basis at the invoice's date. */
  z.object({ action: z.literal("invoice"), subscriptionId: id, periodFrom: z.iso.date(), periodTo: z.iso.date(), dueDays: z.number().int().min(0).max(120).default(30) }),
  z.object({ action: z.literal("send"), id }),
  z.object({ action: z.literal("paid"), id, paidOn: z.iso.date() }),
  z.object({ action: z.literal("cancel"), id }),
  z.object({ action: z.literal("remind"), id }),
  /** 12/11/2026: a discount code, made here and given to clubs; percent or amount, for one invoice, several or all. */
  z.object({
    action: z.literal("discount"),
    id: id.nullable().default(null),
    code: discountCode,
    percent: z.number().int().min(1).max(100).nullable().default(null),
    amountCents: z.number().int().min(1).max(1000000).nullable().default(null),
    cycles: z.number().int().min(1).max(10).nullable().default(1),
    validUntil: z.iso.date().nullable().default(null),
    maxUses: z.number().int().min(1).max(10000).nullable().default(null),
    note: z.string().trim().max(300).default(""),
    active: z.boolean().default(true),
  }).refine((d) => (d.percent === null) !== (d.amountCents === null), { message: "percent or amount", path: ["percent"] }),
  /** A code given to a club by hand: its next invoices are lowered. */
  z.object({ action: z.literal("applyDiscount"), subscriptionId: id, code: discountCode }),
]);
/** What a code takes off an amount: never more than the amount itself. */
export const discountOf = (amountCents: number, d: { percent: number | null; amount_cents: number | null }) =>
  Math.min(amountCents, d.percent !== null ? Math.round((amountCents * d.percent) / 100) : (d.amount_cents ?? 0));
export type BillingCommand = z.infer<typeof billingCommand>;

/** Invoice numbers: year and a sequence of the platform. */
export const invoiceNumber = (year: number, sequence: number) => `F-${year}-${String(sequence).padStart(4, "0")}`;
/** The monthly equivalent of a plan, for the recurring revenue figure. */
export const monthlyCents = (amountCents: number, period: "month" | "year", quantity = 1) => Math.round((period === "year" ? amountCents / 12 : amountCents) * quantity);
/** The reminder steps after the due date: a courteous one, a firm one, a notice before suspension. */
export const reminderDays = [3, 10, 20] as const;
/** Which step is due today for an invoice sent, unpaid, with this many reminders already. */
export function reminderDue(dueOn: string, today: string, reminders: number) {
  const late = Math.floor((Date.parse(today + "T12:00:00Z") - Date.parse(dueOn + "T12:00:00Z")) / 86400000);
  let level = 0;
  for (let i = 0; i < reminderDays.length; i++) if (late >= reminderDays[i]) level = i + 1;
  return level > reminders ? reminders + 1 : 0;
}
