import { z } from "zod";
import { csvRows } from "../people/csv";

/**
 * 9, part 1: reserved funds (« fonds affectés »). Pure parts shared by the
 * service, the pages and the tests.
 */
export const allocationSources = ["grant", "sponsor", "donation", "fundraising", "other"] as const;
export const allocationPurposes = ["equipment", "salary", "training", "travel", "other"] as const;
const id = z.uuid();
const fields = {
  sourceKind: z.enum(allocationSources),
  grantId: id.nullable().default(null),
  partnerId: id.nullable().default(null),
  potId: id.nullable().default(null),
  sourceLabel: z.string().trim().max(160).default(""),
  purpose: z.enum(allocationPurposes),
  label: z.string().trim().min(2).max(160),
  amountCents: z.number().int().min(1).max(100000000),
  useBy: z.iso.date().nullable().default(null),
  proof: z.string().trim().max(300).default(""),
};
export const allocationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields }),
  z.object({ action: z.literal("update"), id, ...fields }),
  z.object({ action: z.literal("close"), id, closed: z.boolean() }),
  /** An operation (income or expense) attached to an allocation, or detached (null). */
  z.object({ action: z.literal("link"), transactionId: id, allocationId: id.nullable() }),
]);
export type AllocationCommand = z.infer<typeof allocationCommand>;

/** Received (income linked), spent (expenses linked), what stays reserved, and what is granted but not yet received. */
export function allocationState(amountCents: number, receivedCents: number, spentCents: number) {
  return {
    received: receivedCents,
    spent: spentCents,
    remaining: Math.max(0, receivedCents - spentCents),
    toReceive: Math.max(0, amountCents - receivedCents),
  };
}
/** The cash in three figures: total, of which reserved, and available. */
export function treasury(totalCents: number, reservedCents: number) {
  return { total: totalCents, reserved: reservedCents, available: totalCents - reservedCents };
}
/** The alert due for an allocation: 60 then 30 days before its use-by date, if money is left. */
export function alertDue(useBy: string | null, today: string, remaining: number): 60 | 30 | null {
  if (!useBy || remaining <= 0 || useBy < today) return null;
  const days = Math.round((Date.parse(useBy + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
  return days <= 30 ? 30 : days <= 60 ? 60 : null;
}
/** The CSV for the grant's justification report: one line per linked operation, then the allocation's totals. */
export function allocationCsv(
  rows: { label: string; source: string; purpose: string; useBy: string | null; operations: { date: string; label: string; direction: string; cents: number }[]; state: ReturnType<typeof allocationState> }[],
  head: string[],
) {
  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const out: unknown[][] = [head];
  for (const r of rows) {
    for (const o of r.operations) out.push([r.label, r.source, r.purpose, o.date, o.label, o.direction === "in" ? euros(o.cents) : "", o.direction === "out" ? euros(o.cents) : "", ""]);
    out.push([r.label, r.source, r.purpose, r.useBy ?? "", "", euros(r.state.received), euros(r.state.spent), euros(r.state.remaining)]);
  }
  return csvRows(out);
}
