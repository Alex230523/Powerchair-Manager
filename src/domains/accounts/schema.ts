import { z } from "zod";
import { categories } from "../finance/schema";

/**
 * Annual accounts of a small ASBL in simplified accounting (wave 15, C12):
 * the statement of income and expenses and the statement of assets, prepared
 * from the ledger. Pure rules here; the model must still be checked once by
 * the club's treasurer or accountant.
 */
export const incomeRubrics = ["dues", "gifts", "subsidies", "goods_in", "other_in"] as const;
export const expenseRubrics = ["goods_out", "wages", "services", "other_out"] as const;
export type Rubric = (typeof incomeRubrics)[number] | (typeof expenseRubrics)[number];
export type Category = (typeof categories)[number];
export const statuses = ["draft", "verified", "approved", "filed"] as const;

/** Where each ledger category goes by default; the club can change it. */
export function defaultRubric(direction: "in" | "out", category: Category): Rubric {
  if (direction === "in")
    return ({ dues: "dues", donation: "gifts", sponsor: "gifts", subsidy: "subsidies", equipment: "goods_in", event: "other_in" } as Partial<Record<Category, Rubric>>)[category] ?? "other_in";
  return ({ equipment: "goods_out", venue: "services", travel: "services", competition: "services", insurance: "services", affiliation: "services", event: "services" } as Partial<Record<Category, Rubric>>)[category] ?? "other_out";
}

/** The financial year containing a day, for a start written "MM-DD": [from, to] inclusive. */
export function fiscalYear(start: string, day: string) {
  const year = Number(day.slice(0, 4));
  const begin = day.slice(5) >= start ? year : year - 1;
  const from = `${begin}-${start}`;
  const next = new Date(`${begin + 1}-${start}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() - 1);
  return { from, to: next.toISOString().slice(0, 10), label: start === "01-01" ? String(begin) : `${begin}-${String(begin + 1).slice(2)}` };
}
/** The year before. */
export function previousYear(start: string, from: string) {
  const d = new Date(from + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return fiscalYear(start, d.toISOString().slice(0, 10));
}
/** Six months after the closing: the general assembly approves the accounts by then. */
export function assemblyDeadline(to: string) {
  const d = new Date(to + "T12:00:00Z");
  const month = d.getUTCMonth() + 6;
  const target = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0));
  return new Date(Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), target.getUTCDate()))).toISOString().slice(0, 10);
}
/** Thirty days after the approval: filing with the registry of the enterprise court. */
export function filingDeadline(approvedOn: string) {
  const d = new Date(approvedOn + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export type Line = { direction: "in" | "out"; category: string; amount_cents: number; occurred_on: string };
export type ManualLine = { side: "asset" | "debt"; label: string; cents: number; comment: string };

/** The statement of income and expenses: one total per rubric. */
export function statement(lines: Line[], mapping: Map<string, Rubric>) {
  const income = Object.fromEntries(incomeRubrics.map((r) => [r, 0])) as Record<(typeof incomeRubrics)[number], number>;
  const expenses = Object.fromEntries(expenseRubrics.map((r) => [r, 0])) as Record<(typeof expenseRubrics)[number], number>;
  for (const l of lines) {
    const rubric = mapping.get(`${l.direction}:${l.category}`) ?? defaultRubric(l.direction, l.category as Category);
    if (l.direction === "in") income[rubric as keyof typeof income] += l.amount_cents;
    else expenses[rubric as keyof typeof expenses] += l.amount_cents;
  }
  const totalIn = Object.values(income).reduce((a, b) => a + b, 0),
    totalOut = Object.values(expenses).reduce((a, b) => a + b, 0);
  return { income, expenses, totalIn, totalOut, result: totalIn - totalOut };
}

/** The checks shown before exporting, each passed, failed or not applicable. */
export function controls(input: {
  totalIn: number;
  totalOut: number;
  opening: number;
  closing: number;
  outside: number;
  uncategorised: number;
  previousClosing: number | null;
}) {
  return {
    balance: input.totalIn - input.totalOut === input.closing - input.opening ? "ok" : "fail",
    categories: input.uncategorised === 0 ? "ok" : "fail",
    dates: input.outside === 0 ? "ok" : "fail",
    carried: input.previousClosing === null ? "na" : input.previousClosing === input.opening ? "ok" : "fail",
  } as Record<"balance" | "categories" | "dates" | "carried", "ok" | "fail" | "na">;
}

const text = (n: number) => z.string().trim().max(n);
const cents = z.number().int().min(0).max(1_000_000_000);
export const accountsCommand = z.discriminatedUnion("action", [
  /** Start of the financial year, "MM-DD" (1 January by default, 1 July like the season). */
  z.object({ action: z.literal("fiscalStart"), start: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])$/) }),
  z.object({ action: z.literal("mapping"), direction: z.enum(["in", "out"]), category: z.enum(categories), rubric: z.enum([...incomeRubrics, ...expenseRubrics]) }),
  /** The lines the platform does not know, and the rights and commitments (draft only). */
  z.object({
    action: z.literal("save"),
    yearStart: z.iso.date(),
    manual: z.array(z.object({ side: z.enum(["asset", "debt"]), label: text(160).min(2), cents, comment: text(500) })).max(40),
    commitments: text(8000),
  }),
  z.object({ action: z.literal("verify"), yearStart: z.iso.date(), name: text(120).min(2), on: z.iso.date() }),
  z.object({ action: z.literal("approve"), yearStart: z.iso.date(), on: z.iso.date() }),
  z.object({ action: z.literal("file"), yearStart: z.iso.date(), on: z.iso.date() }),
  /** Back to a draft after verification, or a new version of approved accounts. */
  z.object({ action: z.literal("reopen"), yearStart: z.iso.date() }),
]);
export type AccountsCommand = z.infer<typeof accountsCommand>;
