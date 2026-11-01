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
  /** Wave 17 (N2): federation and insurance affiliations. */
  "affiliation",
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
    /** Dues receivable paid by this income line (category "dues" only). */
    receivableId: z.uuid().nullable().optional(),
    /** Trip this expense or income belongs to (budget against actual). */
    tripId: z.uuid().nullable().optional(),
    /** Team the line belongs to (wave 12); null or absent means the whole club. */
    teamId: z.uuid().nullable().optional(),
  }),
  z.object({
    action: z.literal("budget"),
    season: z.string().regex(/^\d{4}-\d{2}$/),
    /** Budget of one team (wave 12), or of the whole club when absent. */
    teamId: z.uuid().nullable().optional(),
    lines: z
      .array(
        z.object({
          direction: z.enum(["in", "out"]),
          category: z.enum(categories),
          amountCents: z.number().int().min(0).max(100000000),
        }),
      )
      .max(categories.length * 2),
  }),
  z.object({ action: z.literal("removeReceipt"), id: z.uuid() }),
  z.object({
    action: z.literal("cancel"),
    id: z.uuid(),
    reason: text(500).min(5),
  }),
  /** Wave 17 (N1): deleting an operation of a year not approved yet, with a short reason. */
  z.object({
    action: z.literal("delete"),
    id: z.uuid(),
    reason: text(500).min(3),
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
/**
 * Colour of a budget line (wave 15, 2.8). Spending: under 90 % success, 90 to
 * 100 % warning, beyond danger. Income is never an alarm: success once the
 * plan is reached, neutral before.
 */
export function budgetTone(direction: "in" | "out", ratio: number | null): "success" | "warning" | "danger" | "neutral" {
  if (ratio === null) return "neutral";
  if (direction === "in") return ratio >= 100 ? "success" : "neutral";
  return ratio < 90 ? "success" : ratio <= 100 ? "warning" : "danger";
}
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

/** Bounds of a season label such as "2026-27". */
export function seasonBounds(label: string) {
  const start = Number(label.slice(0, 4));
  return { from: `${start}-07-01`, to: `${start + 1}-06-30`, label };
}

export type BudgetLine = {
  direction: "in" | "out";
  category: string;
  amount_cents: number;
};
/**
 * Planned against actual per category and direction. The gap is positive when
 * the club does better than planned (more income, or less spending).
 */
export function budgetComparison(
  lines: BudgetLine[],
  actual: Record<string, { in: number; out: number }>,
) {
  const keys = new Set<string>();
  for (const l of lines) keys.add(l.direction + ":" + l.category);
  for (const [category, v] of Object.entries(actual)) {
    if (v.in) keys.add("in:" + category);
    if (v.out) keys.add("out:" + category);
  }
  return [...keys]
    .map((key) => {
      const [direction, category] = key.split(":") as ["in" | "out", string];
      const planned =
        lines.find((l) => l.direction === direction && l.category === category)
          ?.amount_cents ?? 0;
      const real = actual[category]?.[direction] ?? 0;
      return {
        direction,
        category,
        planned,
        actual: real,
        gap: direction === "in" ? real - planned : planned - real,
        /** Share of the plan already used, null without a plan. */
        ratio: planned ? Math.round((real / planned) * 100) : null,
      };
    })
    .sort((a, b) =>
      a.direction === b.direction
        ? a.category.localeCompare(b.category)
        : a.direction === "in"
          ? -1
          : 1,
    );
}

/** Checks the file signature of a receipt, not only its declared type. */
export function receiptType(bytes: Uint8Array) {
  const hex = (n: number) =>
    Array.from(bytes.subarray(0, n), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  if (hex(4) === "25504446") return "application/pdf";
  if (hex(8) === "89504e470d0a1a0a") return "image/png";
  if (hex(3) === "ffd8ff") return "image/jpeg";
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
export const receiptMaxBytes = 5 * 1024 * 1024;

/**
 * Wave 17 (N1): the closing balance of a bank statement in CSV: the last
 * value of the column called « Solde », « Saldo » or « Balance » (Belgian
 * banks write 1.234,56 or 1234.56), in cents; null when not found.
 */
export function csvClosingBalance(text: string): number | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const sep = [";", ",", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const cells = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const col = cells(lines[0]).findIndex((h) => /^(solde|saldo|balance)\b/i.test(h));
  if (col < 0) return null;
  for (let i = lines.length - 1; i > 0; i--) {
    const raw = cells(lines[i])[col]?.replace(/\s|€|EUR/gi, "");
    if (!raw) continue;
    // « 1.234,56 » or « 1234.56 »: the last separator is the decimal one.
    const normal = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    const n = Number(normal);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return null;
}
/** PDF or CSV, by content: a statement is never anything else. */
export function statementType(bytes: Uint8Array, name: string): "application/pdf" | "text/csv" | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
  if (/\.csv$/i.test(name) && !bytes.subarray(0, 4096).includes(0)) return "text/csv";
  return null;
}
export const statementMaxBytes = 5 * 1024 * 1024;
