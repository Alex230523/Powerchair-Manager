/**
 * Pure helpers of the data tables (wave 15, C8): sorting, the sort kept in
 * the URL, selection ranges, the "select all" box and the summary of a
 * grouped action. No React here, so every rule is unit-tested.
 */
export type SortDir = "asc" | "desc";
export type Sort = { key: string; dir: SortDir } | null;
export type SortValue = string | number | boolean | null | undefined;

/** "name" is ascending, "-name" descending; anything else is no sort. */
export function parseSort(raw: string | null | undefined, keys: readonly string[]): Sort {
  if (!raw) return null;
  const dir: SortDir = raw.startsWith("-") ? "desc" : "asc";
  const key = raw.replace(/^-/, "");
  return keys.includes(key) ? { key, dir } : null;
}
export function sortParam(sort: Sort) {
  return sort ? (sort.dir === "desc" ? "-" : "") + sort.key : "";
}
/** A click on a header: ascending first, then descending, then back to ascending. */
export function nextSort(current: Sort, key: string): Sort {
  if (current?.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

const collators = new Map<string, Intl.Collator>();
function collator(locale: string) {
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
    collators.set(locale, c);
  }
  return c;
}
/** Stable sort; empty values always last, whatever the direction. */
export function sortRows<T>(rows: readonly T[], value: ((row: T) => SortValue) | undefined, dir: SortDir, locale = "fr") {
  if (!value) return [...rows];
  const c = collator(locale);
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => {
      const ea = a.v === null || a.v === undefined || a.v === "",
        eb = b.v === null || b.v === undefined || b.v === "";
      if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
      let d: number;
      if (typeof a.v === "number" && typeof b.v === "number") d = a.v - b.v;
      else if (typeof a.v === "boolean" && typeof b.v === "boolean") d = Number(a.v) - Number(b.v);
      else d = c.compare(String(a.v), String(b.v));
      return (dir === "asc" ? d : -d) || a.i - b.i;
    })
    .map((x) => x.row);
}

/** Shift+click: every row between the last box clicked and this one takes the new state. */
export function selectRange(selected: ReadonlySet<string>, order: readonly string[], anchor: string | null, target: string, checked: boolean) {
  const next = new Set(selected);
  const from = anchor ? order.indexOf(anchor) : -1,
    to = order.indexOf(target);
  const ids = from < 0 || to < 0 ? [target] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}
/** State of the "select all" box for the rows shown. */
export function headerState(selected: ReadonlySet<string>, shown: readonly string[]): "none" | "some" | "all" {
  const n = shown.filter((id) => selected.has(id)).length;
  return n === 0 ? "none" : n === shown.length ? "all" : "some";
}
/** Keeps only the ids still present (after a filter or a reload). */
export function pruneSelection(selected: ReadonlySet<string>, present: readonly string[]) {
  const keep = present.filter((id) => selected.has(id));
  return keep.length === selected.size ? selected : new Set(keep);
}

export type BulkOutcome = { id: string; ok: true } | { id: string; ok: false; code: string };
/** "3 done, 1 refused: insufficient rights", grouped by reason, most frequent first. */
export function bulkSummary(results: readonly BulkOutcome[]) {
  const done = results.filter((r) => r.ok).length;
  const reasons = new Map<string, number>();
  for (const r of results) if (!r.ok) reasons.set(r.code, (reasons.get(r.code) ?? 0) + 1);
  return {
    done,
    refused: results.length - done,
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
  };
}

/** Columns hidden by the person, kept on this device (read as an external store). */
const columnsEvent = "pfm-columns";
// When the browser refuses storage, the choice lasts until the page closes.
const memory = new Map<string, string>();
export function subscribeColumns(change: () => void) {
  window.addEventListener(columnsEvent, change);
  window.addEventListener("storage", change);
  return () => {
    window.removeEventListener(columnsEvent, change);
    window.removeEventListener("storage", change);
  };
}
export function readStoredColumns(key: string) {
  try {
    return window.localStorage.getItem("pfm-columns-" + key) ?? memory.get(key) ?? "[]";
  } catch {
    return memory.get(key) ?? "[]";
  }
}
export function parseHidden(raw: string, allowed: readonly string[]): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string" && allowed.includes(k)) : [];
  } catch {
    return [];
  }
}
export function writeHidden(key: string, hidden: readonly string[]) {
  memory.set(key, JSON.stringify(hidden));
  try {
    window.localStorage.setItem("pfm-columns-" + key, JSON.stringify(hidden));
  } catch {
    // Private mode or storage refused: the memory above keeps it for now.
  }
  window.dispatchEvent(new Event(columnsEvent));
}
/** CSV with semicolons (Excel in Belgium), quoted when needed; formulas are defused. */
export function toCsv(head: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]) {
  const cell = (v: string | number | null | undefined) => {
    let x = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(x)) x = "'" + x;
    return /[";\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  return "\ufeff" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}
/** Runs one call per row, in order, and keeps each outcome (the error code when refused). */
export async function eachRow<T>(rows: readonly T[], id: (row: T) => string, call: (row: T) => Promise<void>): Promise<BulkOutcome[]> {
  const out: BulkOutcome[] = [];
  for (const row of rows) {
    try {
      await call(row);
      out.push({ id: id(row), ok: true });
    } catch (e) {
      out.push({ id: id(row), ok: false, code: e instanceof Error && e.message ? e.message : "UNAVAILABLE" });
    }
  }
  return out;
}
