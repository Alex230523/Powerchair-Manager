import { z } from "zod";
import { DPA_VERSION } from "./texts";

/** 21: the club's data care (no I/O: shared with the page). */
export const retentionCategories = ["notifications", "audit", "health_documents", "sensitive_access"] as const;
export type RetentionCategory = (typeof retentionCategories)[number];
/** Months, within bounds the club cannot leave. */
export const retentionBounds: Record<RetentionCategory, { min: number; max: number; default: number }> = {
  notifications: { min: 3, max: 24, default: 12 },
  audit: { min: 12, max: 120, default: 60 },
  // After the expiry of a sensitive (health) document.
  health_documents: { min: 6, max: 60, default: 24 },
  sensitive_access: { min: 12, max: 60, default: 24 },
};
/**
 * What a closure keeps: the accounting the law asks to keep, and the record
 * of the closure and of the agreement. Everything else of the club goes.
 */
export const keptTables = [
  "account",
  "accounts_mapping",
  "annual_accounts",
  "bank_account",
  "bank_allocation",
  "bank_import",
  "bank_line",
  "bank_mapping",
  "bank_statement",
  "dues_installment",
  "dues_receivable",
  "finance_budget",
  "finance_receipt",
  "finance_transaction",
  "grant_payment",
  "referee_expense",
  "tax_donor",
  "tax_gift",
  "tax_receipt",
  "venue_invoice",
  "club_termination",
  "club_dpa_acceptance",
];
export const careCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acceptDpa"), version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("export") }),
  z.object({ action: z.literal("close"), confirmName: z.string().trim().min(2).max(120), reason: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("cancelClose") }),
  z.object({ action: z.literal("retention"), category: z.enum(retentionCategories), months: z.number().int().min(1).max(240) }),
  z.object({ action: z.literal("request"), id: z.uuid(), status: z.enum(["in_progress", "done", "refused"]), response: z.string().trim().max(2000).default("") }),
  /** Console, series D: a profile linked to the person's identity code (the person gave it), so two clubs share one identity. */
  z.object({ action: z.literal("linkIdentity"), profileId: z.uuid(), identityCode: z.string().trim().toUpperCase().regex(/^PFM-[A-Z0-9]{10}$/) }),
]);
export type CareCommand = z.infer<typeof careCommand>;
export const dataRequestCommand = z.object({ organizationId: z.uuid(), kind: z.enum(["access", "rectification", "erasure"]), details: z.string().trim().max(2000).default("") });
export const currentDpa = DPA_VERSION;
