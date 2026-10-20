import { z } from "zod";
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    seasonId: z.uuid(),
    category: z.string().trim().min(2).max(80),
    amountCents: z.number().int().min(0).max(100000000),
    maxInstallments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
  }),
  z.object({ action: z.literal("archivePlan"), id: z.uuid() }),
  /**
   * Changes a rate (wave 11, from Réglages). When dues were already issued on
   * it this season the president must confirm: those dues keep their amounts.
   */
  z.object({
    action: z.literal("updatePlan"),
    id: z.uuid(),
    category: z.string().trim().min(2).max(80),
    amountCents: z.number().int().min(0).max(100000000),
    maxInstallments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
    confirm: z.boolean().optional(),
  }),
  /** Sibling discount of a plan; open dues without payment are recomputed. */
  z.object({
    action: z.literal("siblingRule"),
    planId: z.uuid(),
    secondPercent: z.number().int().min(0).max(100),
    nextPercent: z.number().int().min(0).max(100),
  }),
  z.object({
    action: z.literal("issue"),
    planId: z.uuid(),
    profileId: z.uuid(),
    discountCents: z.number().int().min(0).max(100000000).default(0),
    reason: z.string().trim().max(500).default(""),
    installments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
    applicationId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal("schedule"),
    id: z.uuid(),
    version: z.number().int().positive(),
    installments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.uuid(),
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
  }),
  /** Money received for a receivable: written in the ledger (income, dues). */
  z.object({
    action: z.literal("pay"),
    id: z.uuid(),
    amountCents: z.number().int().min(1).max(100000000),
    method: z.enum(["transfer", "cash", "card", "other"]),
    occurredOn: z.iso.date(),
    reference: z.string().trim().max(160).default(""),
  }),
]);
/** What a receivable still owes, instalment by instalment, after the payments received. */
export function settle(
  installments: { ordinal: number; due_on: string; amount_cents: number }[],
  paidCents: number,
) {
  let left = Math.max(0, paidCents);
  return installments.map((i) => {
    const covered = Math.min(left, i.amount_cents);
    left -= covered;
    return { ...i, paid_cents: covered, left_cents: i.amount_cents - covered };
  });
}
export type DuesState = "paid" | "late" | "due_soon" | "on_track" | "cancelled" | "exempt";
/** One word for the row of a player: paid, late, due within 14 days, on track. */
export function duesState(
  d: { status: string; net_cents: number },
  settled: { due_on: string; left_cents: number }[],
  today: string,
): DuesState {
  if (d.status === "cancelled") return "cancelled";
  if (d.net_cents === 0) return "exempt";
  const open = settled.filter((i) => i.left_cents > 0);
  if (!open.length) return "paid";
  if (open.some((i) => i.due_on < today)) return "late";
  const soon = new Date(today + "T12:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 14);
  return open[0].due_on <= soon.toISOString().slice(0, 10) ? "due_soon" : "on_track";
}
export type Command = z.infer<typeof commandSchema>;
export function schedule(cents: number, count: number, first: string) {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    cents > 100000000 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12 ||
    !z.iso.date().safeParse(first).success
  )
    throw new Error("INVALID_INPUT");
  const [year, month, day] = first.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const end = new Date(Date.UTC(year, month + i, 0));
    const date = new Date(
      Date.UTC(year, month - 1 + i, Math.min(day, end.getUTCDate())),
    );
    return {
      ordinal: i + 1,
      due_on: date.toISOString().slice(0, 10),
      amount_cents: Math.floor(cents / count) + (i < cents % count ? 1 : 0),
    };
  });
}

/**
 * Siblings share at least one parent or representative. Among the children of
 * a family who owe the same plan, the eldest is rank 1 (full price); the
 * second gets `second` percent off, the following ones `next` percent.
 */
export function siblingRanks(
  children: { id: string; birth_date: string | null; full_name: string }[],
  guardiansOf: Map<string, Set<string>>,
) {
  // Families are the connected groups of children sharing a guardian.
  const parent = new Map(children.map((c) => [c.id, c.id]));
  const find = (x: string): string => {
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const a of children)
    for (const b of children)
      if (
        a.id < b.id &&
        [...(guardiansOf.get(a.id) ?? [])].some((g) => guardiansOf.get(b.id)?.has(g))
      )
        parent.set(find(a.id), find(b.id));
  const families = new Map<string, typeof children>();
  for (const c of children) {
    const root = find(c.id);
    families.set(root, [...(families.get(root) ?? []), c]);
  }
  const ranks = new Map<string, number>();
  for (const family of families.values()) {
    family.sort(
      (a, b) =>
        (a.birth_date ?? "9999").localeCompare(b.birth_date ?? "9999") ||
        a.full_name.localeCompare(b.full_name),
    );
    family.forEach((c, i) => ranks.set(c.id, i + 1));
  }
  return ranks;
}
export function siblingDiscount(
  amountCents: number,
  rank: number,
  second: number,
  next: number,
) {
  const percent = rank <= 1 ? 0 : rank === 2 ? second : next;
  return Math.round((amountCents * percent) / 100);
}
