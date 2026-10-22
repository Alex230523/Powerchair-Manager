import { z } from "zod";

/**
 * Wave 17 (G2): « Exporter en Excel » (and CSV) on every important list.
 * The page sends what the person sees (already limited to their rights,
 * their filters, their team and season); the server writes the file with
 * typed cells and keeps a line in the journal.
 */
export const datasets = [
  "members",
  "attendanceCall",
  "attendanceSeason",
  "attendanceStats",
  "dues",
  "operations",
  "budget",
  "affiliations",
  "sponsors",
  "grants",
  "equipment",
  "registrations",
  "matches",
  "statistics",
] as const;
export type Dataset = (typeof datasets)[number];
export const columnTypes = ["text", "number", "money", "date"] as const;
const cell = z.union([z.string().max(2000), z.number(), z.null()]);
export const exportInput = z.object({
  dataset: z.enum(datasets),
  format: z.enum(["xlsx", "csv"]),
  /** The file's subject, as a word (« cotisations »), and the season or period shown. */
  subject: z.string().trim().min(1).max(60),
  period: z.string().trim().max(60).default(""),
  columns: z
    .array(z.object({ header: z.string().trim().min(1).max(80), type: z.enum(columnTypes) }))
    .min(1)
    .max(40),
  rows: z.array(z.array(cell).max(40)).max(20000),
});
export type ExportInput = z.infer<typeof exportInput>;

/** A file name from words: lower case, no accents, dashes. */
export function slugOf(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
/** « mon-club-cotisations-2026-27.xlsx » */
export function exportFileName(club: string, subject: string, period: string, format: "xlsx" | "csv") {
  return [slugOf(club), slugOf(subject), slugOf(period)].filter(Boolean).join("-") + "." + format;
}
