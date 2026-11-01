import { z } from "zod";
import { categories } from "../finance/schema";
import { banks } from "./parse";

/** B1: what the treasurer does with the bank (accounts, statements, reconciliation, credits). */
const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
export const statementLine = z.object({
  bookedOn: z.iso.date(),
  amountCents: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 100000000),
  counterparty: text(160).default(""),
  counterpartyIban: text(34).default(""),
  communication: text(400).default(""),
  bankRef: text(80).default(""),
});
export const columnMap = z.object({
  date: z.number().int().min(-1).max(200),
  amount: z.number().int().min(-1).max(200),
  credit: z.number().int().min(-1).max(200),
  debit: z.number().int().min(-1).max(200),
  counterparty: z.number().int().min(-1).max(200),
  counterpartyIban: z.number().int().min(-1).max(200),
  communication: z.array(z.number().int().min(0).max(200)).max(5),
  bankRef: z.number().int().min(-1).max(200),
});
const part = z.object({
  target: z.enum(["receivable", "credit", "pot", "partner", "grant", "other"]),
  /** Receivable, pot, sponsor or grant; for a credit, the person it is carried for. */
  targetId: id.nullable().default(null),
  amountCents: z.number().int().min(1).max(100000000),
  /** « other » only: the ledger's category. */
  category: z.enum(categories).optional(),
});
export const bankCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("account"),
    id: id.optional(),
    label: text(80).min(2),
    iban: z.string().trim().max(42),
    bic: text(11).default(""),
    holder: text(70).default(""),
    forDues: z.boolean(),
  }),
  z.object({ action: z.literal("archiveAccount"), id, archived: z.boolean() }),
  /** What an import would do: new lines, duplicates, what reconciles by itself. Nothing is written. */
  z.object({ action: z.literal("preview"), accountId: id.nullable().default(null), lines: z.array(statementLine).min(1).max(5000) }),
  z.object({
    action: z.literal("import"),
    accountId: id.nullable().default(null),
    format: z.enum(["csv", "xlsx", "coda", "camt"]),
    bank: z.enum(banks).default("other"),
    filename: text(160).default(""),
    lines: z.array(statementLine).min(1).max(5000),
    /** The column map used (CSV, XLSX), remembered for this bank. */
    columns: columnMap.optional(),
  }),
  z.object({ action: z.literal("allocate"), lineId: id, parts: z.array(part).min(1).max(20) }),
  z.object({ action: z.literal("cancelAllocation"), id, reason: text(300).min(5) }),
  z.object({ action: z.literal("ignore"), lineId: id, ignored: z.boolean(), note: text(300).default("") }),
  /** A credit (overpayment) used for a receivable of the family. */
  z.object({ action: z.literal("applyCredit"), profileId: id, receivableId: id, amountCents: z.number().int().min(1).max(100000000) }),
  /** A credit paid back to the family, with its reason. */
  z.object({ action: z.literal("refundCredit"), profileId: id, amountCents: z.number().int().min(1).max(100000000), occurredOn: z.iso.date(), reason: text(300).min(5) }),
]);
export type BankCommand = z.infer<typeof bankCommand>;
export type StatementLineInput = z.infer<typeof statementLine>;
