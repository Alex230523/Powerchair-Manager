"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { periodKinds, type Period } from "@/domains/statistics/period";
import { statisticsCopy } from "./statistics-copy";
import { Icon } from "./icons";
import { useScope } from "./use-scope";
import { exportCopy } from "./export-copy";
import { excelFromRows } from "./chart-export";

/**
 * The round « ... » button of a chart card (wave 16, S1) and its small panel:
 * the period (six choices, two dates for a custom one), the data as a table,
 * the CSV and PNG exports. Escape or a click outside closes it and gives the
 * focus back to the button.
 */
export function ChartMenu({
  locale,
  period,
  onPeriod,
  table,
  onTable,
  onCsv,
  onPng,
  xlsx,
  children,
}: {
  locale: Locale;
  /** Omitted: the chart has no period (the storage). */
  period?: Period;
  onPeriod?: (p: Period) => void;
  table?: boolean;
  onTable?: () => void;
  onCsv?: () => void;
  onPng?: () => void;
  /** Wave 17 (G2): the same figures as an Excel file. */
  xlsx?: { title: string; rows: (string | number | null)[][]; period?: string };
  /** More entries (buttons), under the others: a click on one closes the menu. */
  children?: ReactNode;
}) {
  const t = statisticsCopy[locale].menu;
  const scope = useScope();
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState(period?.kind ?? "season"),
    [invalid, setInvalid] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const close = (focus = true) => {
    setOpen(false);
    setInvalid(false);
    if (focus) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("input:checked, input, button")?.focus();
    const outside = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node) || button.current?.contains(e.target as Node)) return;
      setOpen(false);
      setInvalid(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className="chart-menu">
      <button
        ref={button}
        type="button"
        className="icon-button chart-menu-button"
        aria-label={t.options}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setKind(period?.kind ?? "season");
          setOpen((v) => !v);
        }}
      >
        <Icon name="ellipsis" size={18} />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className="chart-menu-panel"
          role="group"
          aria-label={t.options}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          {period && onPeriod && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const from = String(f.get("from") ?? ""),
                  to = String(f.get("to") ?? "");
                if (!from || !to || from > to) return setInvalid(true);
                onPeriod({ kind: "custom", from, to });
                close();
              }}
            >
              <fieldset className="chart-menu-periods">
                <legend>{t.period}</legend>
                {periodKinds.map((k) => (
                  <label key={k} className="check">
                    <input
                      type="radio"
                      name={`${id}-period`}
                      value={k}
                      checked={kind === k}
                      onChange={() => {
                        setKind(k);
                        setInvalid(false);
                        if (k !== "custom") {
                          onPeriod({ kind: k });
                          close();
                        }
                      }}
                    />
                    {t.periods[k]}
                  </label>
                ))}
              </fieldset>
              {kind === "custom" && (
                <div className="chart-menu-dates">
                  <label>
                    {t.from}
                    <input type="date" name="from" required defaultValue={period.from ?? ""} />
                  </label>
                  <label>
                    {t.to}
                    <input type="date" name="to" required defaultValue={period.to ?? ""} />
                  </label>
                  {invalid && <p role="alert">{t.invalid}</p>}
                  <button type="submit" className="button secondary">
                    {t.apply}
                  </button>
                </div>
              )}
            </form>
          )}
          <div className="chart-menu-actions">
            {onTable && (
              <button
                type="button"
                aria-pressed={!!table}
                onClick={() => {
                  onTable();
                  close();
                }}
              >
                <Icon name="document" size={16} />
                {table ? t.showChart : t.showData}
              </button>
            )}
            {onCsv && (
              <button
                type="button"
                onClick={() => {
                  onCsv();
                  close();
                }}
              >
                <Icon name="download" size={16} />
                {t.csv}
              </button>
            )}
            {xlsx && scope.organizationId && (
              <button
                type="button"
                onClick={() => {
                  close();
                  void excelFromRows(scope.organizationId!, xlsx.title, xlsx.period ?? "", xlsx.rows);
                }}
              >
                <Icon name="download" size={16} />
                {exportCopy[locale].chartExcel}
              </button>
            )}
            {onPng && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onPng();
                }}
              >
                <Icon name="image" size={16} />
                {t.png}
              </button>
            )}
            {children && <div onClick={() => setOpen(false)}>{children}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
