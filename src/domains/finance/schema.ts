import { z } from "zod";
export const categories = [
  "dues",
  "subsidy",
  "sponsor",
  "donation",
  "event",
  "equipment",
  "venue",
  "travel",
  "competition",
  "insurance",
  "other",
] as const;
export const methods = ["transfer", "cash", "card", "other"] as const;
const text = (n: number) => z.string().trim().max(n);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    occurredOn: z.iso.date(),
    label: text(160).min(2),
    direction: z.enum(["in", "out"]),
    category: z.enum(categories),
    amountCents: z.number().int().min(1).max(100000000),
    method: z.enum(methods),
    counterparty: text(160),
    reference: text(160),
    notes: text(2000),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.uuid(),
    reason: text(500).min(5),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export type Entry = {
  direction: "in" | "out";
  amount_cents: number;
  occurred_on: string;
  cancelled_at: string | null;
  category: string;
};
/**
 * Ledger figures. Cancelled entries never count. The period covers
 * [from, to] inclusive (YYYY-MM-DD), usually the current season.
 */
export function ledgerSummary(entries: Entry[], from: string, to: string) {
  let balance = 0,
    income = 0,
    expenses = 0;
  const byCategory: Record<string, { in: number; out: number }> = {};
  for (const e of entries) {
    if (e.cancelled_at) continue;
    const sign = e.direction === "in" ? 1 : -1;
    balance += sign * e.amount_cents;
    if (e.occurred_on < from || e.occurred_on > to) continue;
    if (e.direction === "in") income += e.amount_cents;
    else expenses += e.amount_cents;
    const c = (byCategory[e.category] ??= { in: 0, out: 0 });
    c[e.direction] += e.amount_cents;
  }
  return { balance, income, expenses, result: income - expenses, byCategory };
}
/** Season boundaries: 1 July to 30 June, the usual Belgian club season. */
export function seasonOf(day: string) {
  const year = Number(day.slice(0, 4)),
    start = day.slice(5) >= "07-01" ? year : year - 1;
  return {
    from: `${start}-07-01`,
    to: `${start + 1}-06-30`,
    label: `${start}-${String(start + 1).slice(2)}`,
  };
}
