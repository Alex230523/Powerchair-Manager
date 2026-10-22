import type { Pool } from "pg";
import { active, audit, AccessError, type Principal } from "../access/service";
import { typedXlsx } from "../../lib/xlsx";
import { statisticsCsv } from "../statistics/summary";
import { exportFileName, type ExportInput } from "./schema";

/**
 * Wave 17 (G2): writes the export the person asked for, as Excel (typed
 * cells, bold frozen header) or CSV, and notes who exported what and how
 * many lines in the journal.
 */
export async function exportFile(db: Pool, p: Principal, input: ExportInput, expected: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (a.organization_id !== expected) throw new AccessError("CONTEXT_CHANGED", 409);
    const width = input.columns.length;
    const rows = input.rows.map((r) => r.slice(0, width));
    await audit(c, a.organization_id, p.userId, "export." + input.dataset, a.organization_id, { rows: rows.length, format: input.format, columns: input.columns.map((x) => x.header) });
    await c.query("COMMIT");
    const name = exportFileName(a.organization_name, input.subject, input.period, input.format);
    if (input.format === "xlsx") return { name, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: typedXlsx(input.columns, rows, input.subject) as Uint8Array | string };
    // CSV: amounts with two decimals and dates as written, a header in the person's words.
    const text = statisticsCsv([
      input.columns.map((x) => x.header),
      ...rows.map((r) => r.map((v, i) => (input.columns[i].type === "money" && typeof v === "number" ? v.toFixed(2) : v))),
    ]);
    return { name, type: "text/csv; charset=utf-8", body: text as Uint8Array | string };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
