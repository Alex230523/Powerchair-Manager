import { z } from "zod";

/**
 * Wave 17 (N2): affiliations and federal fees. Pure rules, shared by the
 * server and the screens: the period that is open today, its deadline, the
 * amount (per club, or per licensed player) and the state of a due.
 */
export type FeeRule = {
  frequency: "annual" | "monthly";
  opens_month: number;
  opens_day: number;
  due_days: number | null;
  due_month: number | null;
  due_day: number | null;
};
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(d, last))}`;
};
const plusDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The period opened most recently (on or before today), with its opening day and deadline. */
export function currentPeriod(rule: FeeRule, today: string) {
  const y = Number(today.slice(0, 4)),
    m = Number(today.slice(5, 7));
  if (rule.frequency === "monthly") {
    let open = iso(y, m, rule.opens_day);
    if (open > today) {
      const pm = m === 1 ? 12 : m - 1,
        py = m === 1 ? y - 1 : y;
      open = iso(py, pm, rule.opens_day);
    }
    return { period: open.slice(0, 7), opensOn: open, dueOn: plusDays(open, rule.due_days ?? 30) };
  }
  let start = y;
  if (iso(y, rule.opens_month, rule.opens_day) > today) start = y - 1;
  const opensOn = iso(start, rule.opens_month, rule.opens_day);
  let dueOn: string;
  if (rule.due_days !== null) dueOn = plusDays(opensOn, rule.due_days);
  else {
    dueOn = iso(start, rule.due_month!, rule.due_day!);
    if (dueOn < opensOn) dueOn = iso(start + 1, rule.due_month!, rule.due_day!);
  }
  return { period: `${start}-${String(start + 1).slice(2)}`, opensOn, dueOn };
}

/** Per club: the amount; per player: the amount times the players licensed at the opening. */
export function dueAmount(basis: "player" | "club", amountCents: number, players: number) {
  return basis === "club" ? amountCents : amountCents * players;
}

export type DueState = "paid" | "late" | "open";
export function dueState(d: { paid_on: string | null; due_on: string }, today: string): DueState {
  return d.paid_on ? "paid" : d.due_on < today ? "late" : "open";
}

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
/** The fields of a definition, for a federation or a club. */
export const feeFields = {
  name: text(120).min(2),
  description: text(1000),
  contactId: id.nullable(),
  basis: z.enum(["player", "club"]),
  frequency: z.enum(["annual", "monthly"]),
  amountCents: z.number().int().min(0).max(10000000),
  opensMonth: z.number().int().min(1).max(12),
  opensDay: z.number().int().min(1).max(28),
  /** Either a number of days after the opening, or a fixed day (yearly fees only). */
  dueDays: z.number().int().min(1).max(366).nullable(),
  dueMonth: z.number().int().min(1).max(12).nullable(),
  dueDay: z.number().int().min(1).max(31).nullable(),
};
export const feeRuleValid = (v: { frequency: string; dueDays: number | null; dueMonth: number | null; dueDay: number | null }) =>
  v.dueDays !== null ? v.dueMonth === null && v.dueDay === null : v.frequency === "annual" && v.dueMonth !== null && v.dueDay !== null;

export const clubAffiliationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addFee"), ...feeFields }),
  z.object({ action: z.literal("archiveFee"), id }),
  /** « Marquer en ordre »: the day it was paid, and the expense in the ledger if wanted. */
  z.object({
    action: z.literal("markPaid"),
    id,
    paidOn: z.iso.date(),
    createExpense: z.boolean().default(false),
    method: z.enum(["transfer", "cash", "card", "other"]).default("transfer"),
  }),
]);
export type ClubAffiliationCommand = z.infer<typeof clubAffiliationCommand>;

export const federationAffiliationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addFee"), ...feeFields, allClubs: z.boolean(), clubIds: z.array(id).max(500).default([]) }),
  z.object({ action: z.literal("archiveFee"), id }),
  /** One reminder to every club late on the federation's fees (or on one of them). */
  z.object({ action: z.literal("remind"), feeId: id.nullable().default(null) }),
]);
export type FederationAffiliationCommand = z.infer<typeof federationAffiliationCommand>;

/** Proposed to a federation, amounts to fill in. */
export const federationExamples = [
  { key: "bpcf", name: "Affiliation BPCF", basis: "club" as const, frequency: "annual" as const },
  { key: "sportea", name: "Sportéa", basis: "player" as const, frequency: "annual" as const },
];
