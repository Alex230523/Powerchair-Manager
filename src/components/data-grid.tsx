"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { Icon, type IconName } from "./icons";
import { DataTable } from "./ui";
import { ShowMore, useShowMore } from "./use-api";
import { bulkSentence, tableCopy } from "./table-copy";
import {
  bulkSummary,
  headerState,
  nextSort,
  parseSort,
  pruneSelection,
  parseHidden,
  readStoredColumns,
  subscribeColumns,
  selectRange,
  sortParam,
  sortRows,
  toCsv,
  writeHidden,
  type BulkOutcome,
  type Sort,
  type SortValue,
} from "./table-state";

/** history.replaceState fires no event: the grid tells its own subscribers. */
const urlEvent = "pfm-grid-url";
function subscribeUrl(change: () => void) {
  window.addEventListener(urlEvent, change);
  window.addEventListener("popstate", change);
  return () => {
    window.removeEventListener(urlEvent, change);
    window.removeEventListener("popstate", change);
  };
}

export type GridColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Present: the header sorts the rows by this value. */
  sort?: (row: T) => SortValue;
  /** False: always shown (the first column is never hidden). */
  hideable?: boolean;
  /** Cells as row headers (the person's name, the chair's name). */
  rowHeader?: boolean;
  className?: string;
};
export type GridAction<T> = {
  id: string;
  label: string;
  icon?: IconName;
  /**
   * One server call per row, so each row is checked against the rights;
   * return nothing for an action done in the browser (an export).
   */
  run: (rows: T[], choice: string) => Promise<BulkOutcome[] | void>;
  /** Hidden when the person may not do it at all. */
  hidden?: boolean;
  /** A choice to make first (the team to assign to, the new status). */
  choose?: { label: string; options: { value: string; label: string }[] };
  /** A sentence to confirm first, "{n}" being the number of rows. */
  confirm?: string;
};

/**
 * The data table with sorting, multiple selection and grouped actions
 * (wave 15, C8), built on DataTable (wave 13: sticky header, 44 px rows).
 * The sort lives in the URL (?sort=name, ?sort=-name), the hidden columns
 * on this device; the first column stays visible when the table scrolls
 * sideways on a phone.
 */
export function DataGrid<T>({
  locale,
  label,
  caption,
  columns,
  rows,
  rowId,
  rowName,
  actions = [],
  storageKey,
  sortKey = "sort",
  defaultSort = null,
  onDone,
  className = "",
  rowClassName,
  rowState,
  pageSize = 50,
  reasons,
  tools,
}: {
  locale: Locale;
  label: string;
  caption?: ReactNode;
  columns: GridColumn<T>[];
  rows: T[];
  rowId: (row: T) => string;
  /** Read by screen readers on the row's box: "Sélectionner Zoé Martin". */
  rowName: (row: T) => string;
  actions?: GridAction<T>[];
  /** Remembers the hidden columns; no menu without it. */
  storageKey?: string;
  /** URL parameter of the sort, when a page shows two tables. */
  sortKey?: string;
  defaultSort?: Sort;
  /** After a grouped action: reload the page's data. */
  onDone?: () => void | Promise<void>;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  /** A word for the row's state (data-state), for its colours. */
  rowState?: (row: T) => string | undefined;
  /** Rows shown at first; "Show more" adds the next page (after sorting). */
  pageSize?: number;
  /** Words for the module's own refusal codes, in the summary. */
  reasons?: Record<string, string>;
  /** 1: what sits on the table's own bar, left of « Colonnes » (a count, a filter). */
  tools?: ReactNode;
}) {
  const base = tableCopy[locale];
  const t = useMemo(() => (reasons ? { ...base, reasons: { ...base.reasons, ...reasons } } : base), [base, reasons]);
  const shownActions = actions.filter((a) => !a.hidden);
  const selectable = shownActions.length > 0;
  const sortable = useMemo(() => columns.filter((c) => c.sort).map((c) => c.key), [columns]);
  const hideable = useMemo(() => columns.slice(1).filter((c) => c.hideable !== false).map((c) => c.key), [columns]);
  // The sort of the URL and the hidden columns of this device are read as
  // external stores: the server renders the defaults, the browser its own.
  const urlSort = useSyncExternalStore(subscribeUrl, () => new URLSearchParams(window.location.search).get(sortKey) ?? "", () => "");
  const [chosenSort, setSort] = useState<Sort | undefined>(undefined);
  const sort = chosenSort !== undefined ? chosenSort : (parseSort(urlSort, sortable) ?? defaultSort);
  const storedHidden = useSyncExternalStore(
    subscribeColumns,
    () => (storageKey ? readStoredColumns(storageKey) : "[]"),
    () => "[]",
  );
  const hidden = useMemo(() => (storageKey ? parseHidden(storedHidden, hideable) : []), [storedHidden, storageKey, hideable]);
  const [picked, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const visible = columns.filter((c) => !hidden.includes(c.key));
  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
    return col ? sortRows(rows, col.sort, sort!.dir, locale) : rows;
  }, [rows, columns, sort, locale]);
  const { visible: shown, more } = useShowMore(sorted, pageSize);
  // Selection and ranges work on the rows shown, never on hidden ones;
  // a filter or a reload drops the rows that are gone.
  const order = useMemo(() => shown.map(rowId), [shown, rowId]);
  const selected = useMemo(() => pruneSelection(picked, order), [picked, order]);
  const [pending, setPending] = useState<{ id: string; choice: string } | null>(null);
  const state = headerState(selected, order);
  const all = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (all.current) all.current.indeterminate = state === "some";
  }, [state]);

  function changeSort(key: string) {
    const next = nextSort(sort, key);
    setSort(next);
    const params = new URLSearchParams(window.location.search);
    params.set(sortKey, sortParam(next));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    window.dispatchEvent(new Event(urlEvent));
  }
  function toggleColumn(key: string, show: boolean) {
    const next = show ? hidden.filter((k) => k !== key) : [...hidden, key];
    if (storageKey) writeHidden(storageKey, next);
  }
  function tick(id: string, e: MouseEvent<HTMLInputElement>) {
    const checked = e.currentTarget.checked;
    setSelected(e.shiftKey ? selectRange(selected, order, anchor, id, checked) : selectRange(selected, order, null, id, checked));
    setAnchor(id);
  }
  const run = useCallback(
    async (action: GridAction<T>, choice = "") => {
      const chosen = shown.filter((r) => selected.has(rowId(r)));
      if (!chosen.length) return;
      setPending(null);
      setBusy(true);
      setStatus(t.working);
      try {
        const results = await action.run(chosen, choice);
        if (results) {
          const summary = bulkSummary(results);
          setStatus(bulkSentence(t, locale, summary));
          // What succeeded leaves the selection; what was refused stays, to see it.
          const failed = new Set(results.filter((r) => !r.ok).map((r) => r.id));
          setSelected(new Set([...selected].filter((id) => failed.has(id))));
          await onDone?.();
        } else setStatus("");
      } catch {
        setStatus(t.otherReason);
      } finally {
        setBusy(false);
      }
    },
    [shown, selected, rowId, t, locale, onDone],
  );
  const count = [...selected].filter((id) => order.includes(id)).length;
  const waiting = pending ? shownActions.find((a) => a.id === pending.id) ?? null : null;

  return (
    <div className={`data-grid ${selectable ? "selectable" : ""} ${className}`.replace(/\s+/g, " ").trim()}>
      {(tools || (storageKey && hideable.length > 0)) && (
      <div className="dg-toolbar">
      {tools && <div className="dg-tools">{tools}</div>}
      {storageKey && hideable.length > 0 && (
        <details className="dg-columns" onToggle={(e) => setColumnsOpen(e.currentTarget.open)}>
          <summary className="button secondary sm">
            <Icon name="settings" size={16} />
            {t.columns}
          </summary>
          {/* Built only when open, so its labels never double the table's own. */}
          {columnsOpen && (
          <fieldset>
            <legend className="sr-only">{t.columnsShown}</legend>
            {columns
              .filter((c) => hideable.includes(c.key))
              .map((c) => (
                <label className="check" key={c.key}>
                  <input type="checkbox" data-nodirty="" checked={!hidden.includes(c.key)} onChange={(e) => toggleColumn(c.key, e.target.checked)} />
                  {c.header}
                </label>
              ))}
          </fieldset>
          )}
        </details>
      )}
      </div>
      )}
      {/* Point 17: under 600 px each row becomes a card, each value with its column's name. */}
      <DataTable label={label} caption={caption} className="dg-cards">
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="dg-select">
                <input
                  ref={all}
                  type="checkbox"
                  data-nodirty=""
                  aria-label={t.selectAll}
                  checked={state === "all"}
                  disabled={!order.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(order) : new Set())}
                />
              </th>
            )}
            {visible.map((c) => (
              <th key={c.key} scope="col" role="columnheader" className={c.className} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.sort ? (
                  <button type="button" className="dg-sort" onClick={() => changeSort(c.key)}>
                    {c.header}
                    <span className={sort?.key === c.key ? "dg-sort-icon" : "dg-sort-icon idle"}>
                      <Icon name={sort?.key === c.key && sort.dir === "desc" ? "chevronDown" : "chevronUp"} size={14} />
                    </span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const id = rowId(row);
            return (
              <tr key={id} role="row" className={rowClassName?.(row)} data-state={rowState?.(row)} data-selected={selected.has(id) ? "" : undefined}>
                {selectable && (
                  <td className="dg-select">
                    <input
                      type="checkbox"
                      data-nodirty=""
                      aria-label={t.selectRow.replace("{name}", rowName(row))}
                      checked={selected.has(id)}
                      onClick={(e) => tick(id, e)}
                      onChange={() => undefined}
                    />
                  </td>
                )}
                {visible.map((c) =>
                  c.rowHeader ? (
                    <th key={c.key} scope="row" role="rowheader" className={c.className} data-label={c.header}>
                      {c.cell(row)}
                    </th>
                  ) : (
                    <td key={c.key} role="cell" className={c.className} data-label={c.header}>
                      {c.cell(row)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <ShowMore locale={locale} {...more} />
      {selectable && count > 0 && (
        <div className="dg-bar" role="toolbar" aria-label={t.toolbar}>
          <strong>{t.selected[count === 1 ? 0 : 1].replace("{n}", String(count))}</strong>
          {waiting ? (
            <div className="dg-bar-actions">
              {waiting.choose ? (
                <label className="dg-bar-choice">
                  {waiting.choose.label}
                  <select value={pending!.choice} onChange={(e) => setPending({ id: waiting.id, choice: e.target.value })}>
                    {waiting.choose.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span>{waiting.confirm?.replace("{n}", String(count))}</span>
              )}
              <button type="button" className="dg-bar-button" disabled={busy || (!!waiting.choose && !pending!.choice)} onClick={() => void run(waiting, pending!.choice)}>
                {waiting.choose ? t.apply : t.confirm}
              </button>
              <button type="button" className="dg-bar-button quiet" disabled={busy} onClick={() => setPending(null)}>
                {t.back}
              </button>
            </div>
          ) : (
            <div className="dg-bar-actions">
              {shownActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="dg-bar-button"
                  disabled={busy}
                  onClick={() => (a.choose || a.confirm ? setPending({ id: a.id, choice: a.choose?.options[0]?.value ?? "" }) : void run(a))}
                >
                  {a.icon && <Icon name={a.icon} size={16} />}
                  {a.label}
                </button>
              ))}
              <button type="button" className="dg-bar-button quiet" disabled={busy} onClick={() => setSelected(new Set())}>
                {t.clear}
              </button>
            </div>
          )}
        </div>
      )}
      <p className="dg-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** Downloads the selected rows as a CSV file, in the order and columns shown. */
export function downloadCsv(name: string, head: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]) {
  const url = URL.createObjectURL(new Blob([toCsv(head, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".csv") ? name : name + ".csv";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** POSTs one command and throws the error code, for eachRow(). */
export async function postCommand(url: string, body: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v;
}
