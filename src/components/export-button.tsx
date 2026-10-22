"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import type { Dataset } from "@/domains/exports/schema";
import type { ColumnType } from "@/lib/xlsx";
import { exportCopy } from "./export-copy";
import { Modal } from "./modal";
import { downloadBlob } from "./chart-export";
import { Icon } from "./icons";

export type ExportColumnDef<R> = { id: string; label: string; type?: ColumnType; value: (row: R) => string | number | null | undefined; selected?: boolean };
type Cell = string | number | null;

/** Sends what is shown to the server, which writes the file and notes it in the journal. */
export async function downloadExport(organizationId: string, body: { dataset: Dataset; format: "xlsx" | "csv"; subject: string; period?: string; columns: { header: string; type: ColumnType }[]; rows: Cell[][] }) {
  const r = await fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "UNAVAILABLE");
  const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `export.${body.format}`;
  downloadBlob(await r.blob(), name);
}
const cellOf = (v: unknown, type: ColumnType): Cell => {
  if (v === null || v === undefined || v === "") return null;
  if ((type === "money" || type === "number") && typeof v === "number") return v;
  return typeof v === "number" ? v : String(v);
};

/**
 * Wave 17 (G2): « Exporter en Excel », one component for every list. The
 * person picks the columns and the format (Excel by default, or CSV); the
 * rows are the ones on screen, with the page's filters, team and season.
 */
export function ExportButton<R>({
  locale,
  organizationId,
  dataset,
  subject,
  period = "",
  columns,
  rows,
  label,
  variant = "secondary",
}: {
  locale: Locale;
  organizationId: string;
  dataset: Dataset;
  /** One or two words for the file name (« cotisations »). */
  subject: string;
  period?: string;
  columns: ExportColumnDef<R>[];
  rows: R[];
  label?: string;
  variant?: "secondary" | "ghost";
}) {
  const t = exportCopy[locale];
  const [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>(() => columns.filter((c) => c.selected !== false).map((c) => c.id)),
    [format, setFormat] = useState<"xlsx" | "csv">("xlsx"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const picked = columns.filter((c) => chosen.includes(c.id));
  async function run() {
    setBusy(true);
    setError("");
    try {
      await downloadExport(organizationId, {
        dataset,
        format,
        subject,
        period,
        columns: picked.map((c) => ({ header: c.label, type: c.type ?? "text" })),
        rows: rows.map((r) => picked.map((c) => cellOf(c.value(r), c.type ?? "text"))),
      });
      setOpen(false);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className={`button ${variant}`} onClick={() => setOpen(true)}>
        <span className="button-icon" aria-hidden="true">
          <Icon name="download" size={16} />
        </span>
        {label ?? t.openExcel}
      </button>
      {open && (
        <Modal title={label ?? t.openExcel} close={() => setOpen(false)}>
          <p className="muted">{t.intro}</p>
          {error && <p role="alert">{error}</p>}
          <fieldset>
            <legend>{t.columns}</legend>
            <div className="export-columns">
              {columns.map((c) => (
                <label key={c.id} className="check">
                  <input type="checkbox" checked={chosen.includes(c.id)} onChange={(e) => setChosen(e.target.checked ? columns.filter((x) => x.id === c.id || chosen.includes(x.id)).map((x) => x.id) : chosen.filter((x) => x !== c.id))} />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="check-row export-format">
            <legend>{t.format}</legend>
            <label className="check">
              <input type="radio" name="export-format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
              {t.excel}
            </label>
            <label className="check">
              <input type="radio" name="export-format" checked={format === "csv"} onChange={() => setFormat("csv")} />
              {t.csv}
            </label>
          </fieldset>
          {picked.length ? (
            <div className="actions">
              <button type="button" className="button" disabled={busy} onClick={() => void run()}>
                {t.download}
              </button>
            </div>
          ) : (
            <p role="alert">{t.none}</p>
          )}
        </Modal>
      )}
    </>
  );
}
