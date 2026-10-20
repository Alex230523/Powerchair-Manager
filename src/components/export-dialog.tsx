"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import {
  columnLabels,
  defaultColumns,
  exportColumns,
  type ExportColumn,
} from "@/domains/people/export";
import { Modal } from "./modal";
import { exportCopy } from "./export-copy";

/** Selective export: chosen columns, as CSV, Excel or a printable page. */
export function ExportDialog({ locale, query }: { locale: Locale; query: string }) {
  const t = exportCopy[locale];
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<ExportColumn[]>(defaultColumns);
  const href = (format: string) =>
    `/api/people/export?${query}&format=${format}&locale=${locale}&columns=${columns.join(",")}`;
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        {t.open}
      </button>
      {open && (
        <Modal title={t.title} close={() => setOpen(false)}>
          <p className="muted">{t.intro}</p>
          <fieldset>
            <legend>{t.columns}</legend>
            <div className="export-columns">
              {exportColumns.map((c) => (
                <label key={c} className="check">
                  <input
                    type="checkbox"
                    checked={columns.includes(c)}
                    onChange={(e) =>
                      setColumns(
                        e.target.checked
                          ? exportColumns.filter((x) => x === c || columns.includes(x))
                          : columns.filter((x) => x !== c),
                      )
                    }
                  />
                  {columnLabels[locale][c]}
                </label>
              ))}
            </div>
          </fieldset>
          {columns.length ? (
            <div className="actions">
              <a className="button" href={href("xlsx")}>
                {t.excel}
              </a>
              <a className="button secondary" href={href("csv")}>
                {t.csv}
              </a>
              <a className="button secondary" href={href("html")} target="_blank" rel="noopener">
                {t.print}
              </a>
            </div>
          ) : (
            <p role="alert">{t.none}</p>
          )}
        </Modal>
      )}
    </>
  );
}
