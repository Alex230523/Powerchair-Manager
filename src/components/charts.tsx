"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { chartsCopy } from "./charts-copy";
import { Segmented } from "./ui";
import { cssVars } from "./css-vars";
import { niceStep } from "./chart-math";
import { arcPath, ringSegments } from "@/domains/statistics/club-math";
export { niceStep, trendSentence } from "./chart-math";

/**
 * Sober charts (wave 15, prompt 2.6), drawn in SVG with the design tokens:
 * 12 px axis text in --muted, horizontal grid only in --grid-line, series in
 * --chart-1 to --chart-8 (--primary for the club) or a team colour. Colours
 * are CSS variables, so the dark theme follows without reading them in script.
 * No shadow, gradient or 3D. Every chart has a legend with real check boxes,
 * a "Chart / Table" switch with the same figures, a summary for screen
 * readers and arrow keys to go through the values.
 */
export type ChartSeries = {
  id: string;
  label: string;
  /** A CSS colour, usually var(--chart-n), var(--primary) or var(--team-<colour>-border). */
  color: string;
  values: (number | null)[];
  /** Line width in pixels (lines only): 2 by default, 3 for the club. */
  width?: number;
  dashed?: boolean;
};

/** The width of the drawing, followed when the card is resized. */
function useWidth(initial = 560) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Legend, "see the data" switch and table: the frame around a chart. */
export function ChartFrame({
  locale,
  legend,
  table,
  children,
  view: controlled,
}: {
  locale: Locale;
  legend: { id: string; label: string; color: string; dashed?: boolean }[];
  /** The same figures as a table. */
  table: ReactNode;
  children: (hidden: Set<string>) => ReactNode;
  /** Chosen outside (the « ... » menu of the statistics, wave 16): no switch in the frame. */
  view?: "chart" | "table";
}) {
  const c = chartsCopy[locale];
  const [own, setView] = useState("chart"),
    [hidden, setHidden] = useState<string[]>([]);
  const view = controlled ?? own;
  return (
    <div className="chart-frame">
      {!controlled && (
        <div className="chart-tools">
          <Segmented
            label={c.seeData}
            items={[
              { id: "chart", label: c.chart },
              { id: "table", label: c.table },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      )}
      {view === "chart" ? (
        <>
          {children(new Set(hidden))}
          {legend.length > 1 && (
            <fieldset className="chart-legend">
              <legend className="sr-only">{c.legend}</legend>
              {legend.map((s) => (
                <label key={s.id} className="chart-legend-item">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(s.id)}
                    style={cssVars({ series: s.color })}
                    onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== s.id) : [...h, s.id]))}
                  />
                  <span className="chart-swatch" data-dashed={s.dashed || undefined} style={cssVars({ series: s.color })} aria-hidden="true" />
                  {s.label}
                </label>
              ))}
            </fieldset>
          )}
        </>
      ) : (
        table
      )}
    </div>
  );
}

type TipRow = { id: string; label: string; color: string; value: string; dashed?: boolean };
function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: TipRow[] }) {
  const right = x > width / 2;
  return (
    <div className="chart-tooltip" data-side={right ? "left" : "right"} style={cssVars({ x: `${right ? width - x : x}px` })} aria-hidden="true">
      <p className="chart-tooltip-title">{title}</p>
      {rows.map((r) => (
        <p key={r.id} className="chart-tooltip-row">
          <span className="chart-swatch" data-dashed={r.dashed || undefined} style={cssVars({ series: r.color })} />
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </p>
      ))}
    </div>
  );
}

/** Keyboard and pointer: which category is pointed at. */
function usePointer(count: number, indexAt: (x: number) => number) {
  const [active, setActive] = useState<number | null>(null);
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(count - 1, indexAt(e.clientX - rect.left))));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!count) return;
    const keys: Record<string, (i: number) => number> = {
      ArrowRight: (i) => Math.min(count - 1, i + 1),
      ArrowLeft: (i) => Math.max(0, i - 1),
      Home: () => 0,
      End: () => count - 1,
    };
    const move = keys[e.key];
    if (!move) return;
    e.preventDefault();
    setActive((i) => (i === null ? (e.key === "ArrowLeft" || e.key === "End" ? count - 1 : 0) : move(i)));
  };
  return { active, setActive, onPointerMove, onKeyDown };
}


/** Lines over categories (months): 2 px, no fill, points on hover; Y from 0 to max. */
export function LineChart({
  locale,
  summary,
  categories,
  series,
  max = 100,
  format,
  height = 240,
  tickEvery,
  titles,
}: {
  locale: Locale;
  /** Accessible name: what the chart shows and its trend. */
  summary: string;
  categories: string[];
  series: ChartSeries[];
  max?: number;
  format: (v: number) => string;
  height?: number;
  /** A label every n categories at least (weeks: every 4), more apart if the width asks. */
  tickEvery?: number;
  /** Longer names of the categories, for the tooltip and the screen reader. */
  titles?: string[];
}) {
  const c = chartsCopy[locale];
  const { ref, width } = useWidth();
  const m = { l: 44, r: 12, t: 12, b: 28 };
  const pw = Math.max(width - m.l - m.r, 40),
    ph = height - m.t - m.b,
    n = categories.length;
  const x = (i: number) => (n <= 1 ? m.l + pw / 2 : m.l + (i * pw) / (n - 1));
  const y = (v: number) => m.t + ph - (Math.min(Math.max(v, 0), max) / max) * ph;
  const { active, setActive, onPointerMove, onKeyDown } = usePointer(n, (px) => (n <= 1 ? 0 : Math.round(((px - m.l) * (n - 1)) / pw)));
  const fit = Math.max(1, Math.ceil((n * 64) / pw));
  const step = tickEvery ? tickEvery * Math.ceil(fit / tickEvery) : fit;
  const title = (i: number) => titles?.[i] ?? categories[i];
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? "" : `${i === 0 || values[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const rows = (i: number): TipRow[] =>
    series.map((s) => ({ id: s.id, label: s.label, color: s.color, dashed: s.dashed, value: s.values[i] === null ? c.noValue : format(s.values[i] as number) }));
  return (
    <div
      ref={ref}
      className="chart"
      role="group"
      aria-label={summary}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
    >
      <svg width={width} height={height} aria-hidden="true" onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={m.l} x2={m.l + pw} y1={y(f * max)} y2={y(f * max)} stroke="var(--grid-line)" strokeWidth={1} />
            <text x={m.l - 8} y={y(f * max)} dy="0.32em" textAnchor="end" className="chart-axis">
              {format(f * max)}
            </text>
          </g>
        ))}
        {categories.map((label, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"} className="chart-axis">
              {label}
            </text>
          ) : null,
        )}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + ph} stroke="var(--border-strong)" strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.id}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) =>
              v !== null && (i === active || n === 1 || ((s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null)) ? (
                <circle key={i} cx={x(i)} cy={y(v)} r={i === active ? 4.5 : 3} fill="var(--surface)" stroke={s.color} strokeWidth={2} />
              ) : null,
            )}
          </g>
        ))}
      </svg>
      {active !== null && <Tooltip x={x(active)} width={width} title={title(active)} rows={rows(active)} />}
      <p className="sr-only" aria-live="polite">
        {active !== null ? `${title(active)} : ${rows(active).map((r) => `${r.label} ${r.value}`).join(", ")}` : ""}
      </p>
      <p className="sr-only">{c.keys}</p>
    </div>
  );
}

/** Stacked bars over categories (seasons): narrow columns, 1 px gap between segments, total on top. */
export function StackedBarChart({
  locale,
  summary,
  categories,
  segments,
  height = 260,
  format = (v) => String(v),
}: {
  locale: Locale;
  summary: string;
  categories: string[];
  segments: ChartSeries[];
  height?: number;
  format?: (v: number) => string;
}) {
  const c = chartsCopy[locale];
  const { ref, width } = useWidth();
  const m = { l: 40, r: 12, t: 24, b: 28 };
  const pw = Math.max(width - m.l - m.r, 40),
    ph = height - m.t - m.b,
    n = categories.length;
  const totals = categories.map((_, i) => segments.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const stepY = niceStep(Math.max(...totals, 1) / 4);
  const top = Math.max(stepY * Math.ceil(Math.max(...totals, 1) / stepY), stepY);
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const band = pw / Math.max(n, 1),
    bar = Math.min(28, band * 0.6);
  const cx = (i: number) => m.l + band * (i + 0.5);
  const { active, setActive, onPointerMove, onKeyDown } = usePointer(n, (px) => Math.floor((px - m.l) / band));
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += stepY) ticks.push(v);
  const rows = (i: number): TipRow[] => [
    ...segments.filter((s) => (s.values[i] ?? 0) > 0).map((s) => ({ id: s.id, label: s.label, color: s.color, value: format(s.values[i] ?? 0) })),
    { id: "__total", label: c.total, color: "transparent", value: format(totals[i]) },
  ];
  return (
    <div ref={ref} className="chart" role="group" aria-label={summary} tabIndex={0} onKeyDown={onKeyDown} onBlur={() => setActive(null)}>
      <svg width={width} height={height} aria-hidden="true" onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" strokeWidth={1} />
            <text x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="chart-axis">
              {format(v)}
            </text>
          </g>
        ))}
        {active !== null && <rect x={m.l + band * active} y={m.t} width={band} height={ph} fill="var(--surface-soft)" />}
        {categories.map((label, i) => {
          let base = 0;
          return (
            <g key={label + i}>
              {segments.map((s) => {
                const v = s.values[i] ?? 0;
                if (v <= 0) return null;
                const from = base;
                base += v;
                return <rect key={s.id} x={cx(i) - bar / 2} y={y(base)} width={bar} height={Math.max(y(from) - y(base), 0)} fill={s.color} stroke="var(--surface)" strokeWidth={1} />;
              })}
              {totals[i] > 0 && (
                <text x={cx(i)} y={y(totals[i]) - 6} textAnchor="middle" className="chart-total">
                  {format(totals[i])}
                </text>
              )}
              <text x={cx(i)} y={height - 8} textAnchor="middle" className="chart-axis">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null && <Tooltip x={cx(active)} width={width} title={categories[active]} rows={rows(active)} />}
      <p className="sr-only" aria-live="polite">
        {active !== null ? `${categories[active]} : ${rows(active).map((r) => `${r.label} ${r.value}`).join(", ")}` : ""}
      </p>
      <p className="sr-only">{c.keys}</p>
    </div>
  );
}

export type BarGroup = { label: string; total: number; bars: { id: string; label: string; color: string; value: number }[] };
/**
 * Grouped bars (wave 16, S1): one group per season, the bars side by side (a
 * team each, in its colour), the group's total above it. The total is given:
 * a person in two teams counts in both bars but once in the total.
 */
export function GroupedBarChart({
  locale,
  summary,
  groups,
  hidden,
  height = 260,
  format = (v) => String(v),
}: {
  locale: Locale;
  summary: string;
  groups: BarGroup[];
  hidden: Set<string>;
  height?: number;
  format?: (v: number) => string;
}) {
  const c = chartsCopy[locale];
  const { ref, width } = useWidth();
  const m = { l: 40, r: 12, t: 24, b: 28 };
  const pw = Math.max(width - m.l - m.r, 40),
    ph = height - m.t - m.b,
    n = groups.length;
  const shown = groups.map((g) => g.bars.filter((b) => !hidden.has(b.id)));
  const peak = Math.max(1, ...groups.map((g) => g.total), ...shown.flat().map((b) => b.value));
  const stepY = niceStep(peak / 4);
  const top = Math.max(stepY * Math.ceil(peak / stepY), stepY);
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const band = pw / Math.max(n, 1);
  const { active, setActive, onPointerMove, onKeyDown } = usePointer(n, (px) => Math.floor((px - m.l) / band));
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += stepY) ticks.push(v);
  const rows = (i: number): TipRow[] => [
    ...shown[i].map((b) => ({ id: b.id, label: b.label, color: b.color, value: format(b.value) })),
    { id: "__total", label: c.total, color: "transparent", value: format(groups[i].total) },
  ];
  return (
    <div ref={ref} className="chart" role="group" aria-label={summary} tabIndex={0} onKeyDown={onKeyDown} onBlur={() => setActive(null)}>
      <svg width={width} height={height} aria-hidden="true" onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" strokeWidth={1} />
            <text x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="chart-axis">
              {format(v)}
            </text>
          </g>
        ))}
        {active !== null && <rect x={m.l + band * active} y={m.t} width={band} height={ph} fill="var(--surface-soft)" />}
        {groups.map((g, i) => {
          const bars = shown[i];
          const inner = band * 0.8,
            bar = Math.max(3, Math.min(22, inner / Math.max(bars.length, 1) - 2));
          const start = m.l + band * i + (band - bars.length * (bar + 2) + 2) / 2;
          const highest = Math.max(g.total, ...bars.map((b) => b.value));
          return (
            <g key={g.label + i}>
              {bars.map((b, j) => (
                <rect key={b.id} x={start + j * (bar + 2)} y={y(b.value)} width={bar} height={Math.max(y(0) - y(b.value), 0)} fill={b.color} rx={2} />
              ))}
              {g.total > 0 && (
                <text x={m.l + band * (i + 0.5)} y={y(highest) - 6} textAnchor="middle" className="chart-total">
                  {format(g.total)}
                </text>
              )}
              <text x={m.l + band * (i + 0.5)} y={height - 8} textAnchor="middle" className="chart-axis">
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null && <Tooltip x={m.l + band * (active + 0.5)} width={width} title={groups[active].label} rows={rows(active)} />}
      <p className="sr-only" aria-live="polite">
        {active !== null ? `${groups[active].label} : ${rows(active).map((r) => `${r.label} ${r.value}`).join(", ")}` : ""}
      </p>
      <p className="sr-only">{c.keys}</p>
    </div>
  );
}

/**
 * A ring of results (wave 16, S1): wins in --success, draws in --warning,
 * losses in --danger, 1 px of background between the segments; grey without
 * a match. The number of matches in the middle, in the serif face.
 */
export function DonutChart({
  won,
  drawn,
  lost,
  label,
  unit,
  size = 120,
}: {
  won: number;
  drawn: number;
  lost: number;
  /** Accessible name: the team and its results in words; none when a link around it already says so. */
  label?: string;
  /** « matchs » under the number. */
  unit: string;
  size?: number;
}) {
  const { total, segments } = ringSegments(won, drawn, lost);
  const r = size / 2,
    inner = r - Math.max(12, size * 0.14);
  const colors = { won: "var(--success)", drawn: "var(--warning)", lost: "var(--danger)" } as const;
  return (
    <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      {total ? (
        segments.map((s) => <path key={s.key} d={arcPath(r, r, r - 1, inner, s.start, s.end)} fill={colors[s.key]} stroke="var(--surface)" strokeWidth={1} />)
      ) : (
        <path d={arcPath(r, r, r - 1, inner, 0, 1)} fill="var(--grid-line)" />
      )}
      <text x={r} y={r - 2} textAnchor="middle" className="donut-total">
        {total}
      </text>
      <text x={r} y={r + 16} textAnchor="middle" className="chart-axis">
        {unit}
      </text>
    </svg>
  );
}

/** One horizontal bar split in parts (wave 16, S1: the storage), 1 px of background between them. */
export function SplitBar({ parts, label, height = 20 }: { parts: { id: string; share: number; color: string }[]; label: string; height?: number }) {
  const { ref, width } = useWidth();
  let at = 0;
  return (
    <div ref={ref} className="split-bar">
      <svg width={width} height={height} role="img" aria-label={label}>
        {parts.map((p) => {
          const w = Math.max(0, p.share * width);
          const x = at;
          at += w;
          return w > 0 ? <rect key={p.id} x={x} y={0} width={w} height={height} fill={p.color} stroke="var(--surface)" strokeWidth={1} /> : null;
        })}
      </svg>
    </div>
  );
}
