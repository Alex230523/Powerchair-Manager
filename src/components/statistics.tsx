"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/locale";
import { parsePeriod, periodParam, serializePeriod, type Period, type PeriodKind } from "@/domains/statistics/period";
import { ageBands, isoWeek } from "@/domains/statistics/club-math";
import { formatBytes, storageCategories } from "@/domains/storage/summary";
import { useScope } from "./use-scope";
import { Badge, Button, Card, DataTable, KpiCard, PageHeader, Segmented } from "./ui";
import { ChartFrame, DonutChart, GroupedBarChart, LineChart, SplitBar, StackedBarChart, trendSentence, type ChartSeries } from "./charts";
import { ChartMenu } from "./chart-menu";
import { excelFromRows, downloadCsv, exportPng, slug } from "./chart-export";
import { exportCopy } from "./export-copy";
import { fill, statisticsCopy, type StatisticsCopy } from "./statistics-copy";
import { reportCopy } from "./report-copy";
import { HallOfFame } from "./hall-of-fame";
import { brusselsDay } from "@/lib/today";

/**
 * The statistics (wave 16, S1): two addresses, the « Club » tab here. The
 * season and the team come from the top bar; each chart has its period in
 * its « ... » menu, kept in the address. No filter bar.
 */
export const colorOf = (c: string | null | undefined, i: number) => (c ? `var(--team-${c}-border)` : `var(--chart-${(i % 8) + 1})`);
const palette = (i: number) => `var(--chart-${(i % 8) + 1})`;
export const shortDate = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const money = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

type Summary = {
  season: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  restricted: boolean;
  tiles: { players: number; coaches: number; trainings: number; matches: number; treasury: number | null; attendance: number | null } | null;
  can: { money: boolean; storage: boolean; manageAwards: boolean };
};
export type Spanned = { period: Period; from: string; to: string; names: string[] };
export type CsvSection = { title: string; rows: (string | number | null)[][] };

/** One chart's data from /api/statistics/club (or /game), for the season and team of the top bar. */
export function useStat<T>(chart: string, params: Record<string, string | undefined>, api = "/api/statistics/club") {
  const scope = useScope();
  const query = new URLSearchParams({ chart });
  if (scope.seasonId) query.set("season", scope.seasonId);
  if (scope.teamId) query.set("team", scope.teamId);
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, v);
  const url = api + "?" + query;
  const [state, setState] = useState<{ url: string; data: T | null; error: string }>({ url: "", data: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    fetch(url, { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        setState({ url, data: v as T, error: "" });
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setState({ url, data: null, error: e.message || "UNAVAILABLE" });
      });
    return () => c.abort();
  }, [url, attempt]);
  // The previous figures stay on screen while the next ones load.
  return { data: state.data, error: state.url === url ? state.error : "", loading: state.url !== url, retry: () => setAttempt((n) => n + 1) };
}

/** The period of a chart, kept in the address (?p-<chart>=). */
export function usePeriod(chart: string, fallback: PeriodKind): [Period, (p: Period) => void] {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const raw = params.get(periodParam(chart));
  const period = useMemo(() => parsePeriod(raw, fallback), [raw, fallback]);
  const set = useCallback(
    (p: Period) => {
      const next = new URLSearchParams(params.toString());
      if (p.kind === fallback) next.delete(periodParam(chart));
      else next.set(periodParam(chart), serializePeriod(p));
      router.replace(`${path}${next.size ? "?" + next : ""}`, { scroll: false });
    },
    [params, router, path, chart, fallback],
  );
  return [period, set];
}

/** The period under a chart's title: a season, seasons, or two dates. */
export function periodText(t: StatisticsCopy, locale: Locale, d: Spanned | null) {
  if (!d) return t.loading;
  if (d.period.kind === "custom") return fill(t.period.dates, { from: shortDate(locale, d.from), to: shortDate(locale, d.to) });
  if (!d.names.length) return d.period.kind === "previous" ? t.period.none : fill(t.period.dates, { from: shortDate(locale, d.from), to: shortDate(locale, d.to) });
  return d.names.length === 1 ? fill(t.period.one, { season: d.names[0] }) : fill(t.period.many, { first: d.names[0], last: d.names[d.names.length - 1] });
}

export function Failed({ locale, retry }: { locale: Locale; retry: () => void }) {
  const t = statisticsCopy[locale];
  return (
    <p role="alert" className="error-message">
      {t.error}{" "}
      <button type="button" className="text-button" onClick={retry}>
        {t.retry}
      </button>
    </p>
  );
}

export function StatisticsTabs({ locale, current }: { locale: Locale; current: "club" | "game" }) {
  const t = statisticsCopy[locale];
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["season", "team"]) if (params.get(k)) keep.set(k, params.get(k)!);
  const q = keep.size ? "?" + keep : "";
  return (
    <nav className="page-tabs" aria-label={t.tabs}>
      <Link href={`/${locale}/statistics/club${q}`} aria-current={current === "club" ? "page" : undefined}>
        {t.tabClub}
      </Link>
      <Link href={`/${locale}/statistics/game${q}`} aria-current={current === "game" ? "page" : undefined}>
        {t.tabGame}
      </Link>
    </nav>
  );
}

/**
 * 5 and 12/11/2026: the team filter of both tabs, « Toutes les équipes » then
 * one tab per team, each with its address (no team in the top bar any more).
 */
export function StatisticsTeams({ locale }: { locale: Locale }) {
  const g = statisticsCopy[locale].game;
  const scope = useScope();
  if (scope.seasonTeams.length < 2) return null;
  return (
    <nav className="game-team-tabs" aria-label={g.teamTabs}>
      <ul>
        <li>
          <a
            href="?"
            aria-current={!scope.teamId ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              scope.setTeam(null);
            }}
          >
            {g.allTeams}
          </a>
        </li>
        {scope.seasonTeams.map((x) => (
          <li key={x.id}>
            <a
              href={`?team=${x.id}`}
              aria-current={scope.teamId === x.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                scope.setTeam(x.id);
              }}
            >
              {x.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The page header of both tabs: title, season and team in the subtitle, the report and the CSV of the tab. */
export function StatisticsHeader({
  locale,
  summary,
  onCsv,
  onXlsx,
}: {
  locale: Locale;
  summary: { season: { name: string } | null; team: { name: string } | null; restricted: boolean } | null;
  onCsv: () => void;
  /** Wave 17 (G2): the whole tab as an Excel file. */
  onXlsx?: () => void;
}) {
  const t = statisticsCopy[locale];
  const s = summary;
  const teamText = s?.team ? s.team.name : s?.restricted ? t.myTeams : t.allTeams;
  return (
    <PageHeader
      title={t.title}
      subtitle={s ? (s.season ? fill(t.subtitle, { season: s.season.name, team: teamText }) : t.noSeason) : t.loading}
      actions={
        <>
          <Link className="button secondary" href={`/${locale}/statistics/report`}>
            {reportCopy[locale].title}
          </Link>
          {onXlsx && (
            <Button icon="download" variant="secondary" disabled={!s} onClick={onXlsx}>
              {exportCopy[locale].openExcel}
            </Button>
          )}
          <Button icon="download" disabled={!s} onClick={onCsv}>
            {t.exportCsv}
          </Button>
        </>
      }
    />
  );
}

/** Each card gives its figures to the header's « Export CSV ». */
export function useCsvSections() {
  const sections = useRef(new Map<string, CsvSection>());
  const register = useCallback((key: string, section: CsvSection | null) => {
    if (section) sections.current.set(key, section);
    else sections.current.delete(key);
  }, []);
  const exportAll = useCallback((order: string[], filename: string) => {
    const rows: (string | number | null)[][] = [];
    for (const key of order) {
      const sec = sections.current.get(key);
      if (sec) rows.push([sec.title], ...sec.rows, []);
    }
    downloadCsv(filename, rows);
  }, []);
  /** Wave 17 (G2): one sheet, a line per figure, its section in the first column. */
  const excelAll = useCallback((order: string[], organizationId: string | null, subject: string, period: string, labels: { section: string; label: string; value: string }) => {
    if (!organizationId) return;
    const rows: (string | number | null)[][] = [[labels.section, labels.label, labels.value]];
    for (const key of order) {
      const sec = sections.current.get(key);
      if (sec) for (const r of sec.rows) rows.push([sec.title, ...r]);
    }
    void excelFromRows(organizationId, subject, period, rows);
  }, []);
  return { register, exportAll, excelAll };
}

export function StatisticsClub({ locale }: { locale: Locale }) {
  const t = statisticsCopy[locale];
  const scope = useScope();
  const summary = useStat<Summary>("summary", {});
  const { register, exportAll, excelAll } = useCsvSections();
  const s = summary.data;
  useEffect(() => {
    if (!s?.tiles) return register("tiles", null);
    const x = s.tiles;
    register("tiles", {
      title: t.title,
      rows: [
        [t.tiles.players, x.players],
        [t.tiles.coaches, x.coaches],
        [t.tiles.trainings, x.trainings],
        [t.tiles.matches, x.matches],
        x.treasury !== null ? [t.tiles.treasury, (x.treasury / 100).toFixed(2)] : [t.tiles.attendance, x.attendance === null ? "" : `${x.attendance} %`],
      ],
    });
  }, [s, t, register]);
  return (
    <main id="main" className="statistics">
      <StatisticsHeader
        locale={locale}
        summary={s}
        onCsv={() => exportAll(["tiles", "attendance", "headcount", "results", "storage"], `statistics-${slug(s?.season?.name ?? "club")}.csv`)}
        onXlsx={() => excelAll(["tiles", "attendance", "headcount", "results", "storage"], scope.organizationId, t.title, s?.season?.name ?? "", exportCopy[locale].sheet)}
      />
      <StatisticsTabs locale={locale} current="club" />
      <StatisticsTeams locale={locale} />
      {summary.error && <Failed locale={locale} retry={summary.retry} />}
      <div role="status" className="sr-only">
        {summary.loading ? t.loading : ""}
      </div>
      {!s && !summary.error && (
        <div className="stat-row-grid" data-cols="5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((k) => (
            <div key={k} className="skeleton stat-card" />
          ))}
        </div>
      )}
      {s?.tiles && (
        <div className="stat-row-grid" data-cols="5">
          <KpiCard label={t.tiles.players} value={s.tiles.players} description={t.tiles.playersHint} icon="players" />
          <KpiCard label={t.tiles.coaches} value={s.tiles.coaches} description={t.tiles.coachesHint} icon="whistle" tone="info" />
          <KpiCard label={t.tiles.trainings} value={s.tiles.trainings} description={t.tiles.trainingsHint} icon="attendance" tone="success" />
          <KpiCard label={t.tiles.matches} value={s.tiles.matches} description={t.tiles.matchesHint} icon="trophy" tone="warning" />
          {s.tiles.treasury !== null ? (
            <KpiCard label={t.tiles.treasury} value={money(locale, s.tiles.treasury)} description={t.tiles.treasuryHint} icon="funding" />
          ) : (
            <KpiCard label={t.tiles.attendance} value={s.tiles.attendance === null ? "…" : `${s.tiles.attendance} %`} description={t.tiles.attendanceHint} icon="chart" />
          )}
        </div>
      )}
      {s && (
        <div className="stats-grid" key={`${scope.seasonId}:${scope.teamId}`}>
          <AttendanceCard locale={locale} register={register} />
          <HeadcountCard locale={locale} register={register} />
          <ResultsCard locale={locale} register={register} />
          {s.can.storage && <StorageCard locale={locale} register={register} />}
          <HallOfFame locale={locale} />
        </div>
      )}
    </main>
  );
}

export type Register = (key: string, section: CsvSection | null) => void;

/** The card frame of a chart: title, period under it, the « ... » menu and the tools. */
export function ChartCard({
  id,
  title,
  sub,
  tools,
  menu,
  className = "",
  children,
}: {
  id: string;
  title: string;
  sub: string;
  tools?: ReactNode;
  menu: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      id={id}
      title={title}
      subtitle={sub}
      className={`stats-card ${className}`}
      actions={
        <span className="stats-card-tools">
          {tools}
          {menu}
        </span>
      }
    >
      {children}
    </Card>
  );
}

type AttendanceData = Spanned & {
  grain: "month" | "week";
  buckets: string[];
  teams: { name: string; color: string | null; values: (number | null)[] }[];
  club: (number | null)[];
  scoped: (number | null)[] | null;
};
function AttendanceCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    a = t.attendance;
  const [period, setPeriod] = usePeriod("attendance", "season");
  const [grain, setGrain] = useState<"month" | "week">("month"),
    [table, setTable] = useState(false);
  const { data, error, retry } = useStat<AttendanceData>("attendance", { period: serializePeriod(period), grain });
  const area = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => {
    if (!data) return { short: [] as string[], long: [] as string[] };
    if (data.grain === "week")
      return {
        short: data.buckets.map((b) => fill(a.weekShort, { n: isoWeek(b).week })),
        long: data.buckets.map((b) => fill(a.weekLong, { n: isoWeek(b).week, date: shortDate(locale, b) })),
      };
    const f = (opts: Intl.DateTimeFormatOptions) => data.buckets.map((m) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(m + "-01T12:00Z")));
    return { short: f({ month: "short", year: "2-digit" }), long: f({ month: "long", year: "numeric" }) };
  }, [data, a, locale]);
  const series: ChartSeries[] = useMemo(() => {
    if (!data) return [];
    const out: ChartSeries[] = data.teams.map((x, i) => ({ id: "team:" + x.name, label: x.name, color: colorOf(x.color, i), values: x.values, width: data.scoped && data.teams.length === 1 ? 3 : 2 }));
    out.push(
      data.scoped
        ? { id: "club", label: a.clubAverage, color: "var(--primary)", width: 2, dashed: true, values: data.club }
        : { id: "club", label: a.club, color: "var(--primary)", width: 3, values: data.club },
    );
    return out;
  }, [data, a]);
  const pct = (v: number) => `${Math.round(v)} %`;
  const rows = useMemo(
    () => (data ? [[a.bucket, ...series.map((s) => s.label)], ...data.buckets.map((_, i) => [labels.long[i], ...series.map((s) => (s.values[i] === null ? "" : `${s.values[i]} %`))])] : []),
    [data, series, labels, a.bucket],
  );
  useEffect(() => register("attendance", data ? { title: a.title, rows } : null), [register, data, rows, a.title]);
  const sub = periodText(t, locale, data);
  const empty = data && !data.club.some((v) => v !== null);
  return (
    <ChartCard
      id="stats-attendance"
      title={a.title}
      sub={sub}
      className="stats-wide"
      tools={
        <Segmented
          label={a.grain}
          items={[
            { id: "month", label: a.month },
            { id: "week", label: a.week },
          ]}
          value={grain}
          onChange={(v) => setGrain(v as "month" | "week")}
        />
      }
      menu={
        <ChartMenu
          locale={locale}
          period={period}
          onPeriod={setPeriod}
          table={table}
          onTable={() => setTable((v) => !v)}
          onCsv={() => downloadCsv(`${slug(a.title)}.csv`, rows)} xlsx={{ title: a.title, rows }}
          onPng={() => area.current && void exportPng(area.current, a.title, sub, `${slug(a.title)}.png`)}
        />
      }
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data && (
        <div ref={area}>
          {empty ? (
            <p className="muted">{a.empty}</p>
          ) : (
            <ChartFrame
              locale={locale}
              view={table ? "table" : "chart"}
              legend={series}
              table={
                <DataTable label={a.title}>
                  <thead>
                    <tr>
                      <th scope="col">{a.bucket}</th>
                      {series.map((s) => (
                        <th scope="col" className="num" key={s.id}>
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.buckets.map((b, i) => (
                      <tr key={b}>
                        <th scope="row">{labels.long[i]}</th>
                        {series.map((s) => (
                          <td className="num" key={s.id}>
                            {s.values[i] === null ? "…" : pct(s.values[i] as number)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              }
            >
              {(hidden) => (
                <LineChart
                  locale={locale}
                  summary={`${a.summary}. ${series.map((s) => trendSentence(s.label, labels.long, s.values, pct)).join(". ")}`}
                  categories={labels.short}
                  titles={labels.long}
                  tickEvery={data.grain === "week" ? 4 : undefined}
                  series={series.filter((s) => !hidden.has(s.id))}
                  format={pct}
                />
              )}
            </ChartFrame>
          )}
          <p className="muted small">{a.hint}</p>
        </div>
      )}
    </ChartCard>
  );
}

type HeadcountData = Spanned & {
  view: "teams" | "age" | "classification" | "coaches";
  historyStart: string | null;
  seasons: {
    id: string;
    name: string;
    teams: { name: string; color: string | null; count: number }[];
    total: number;
    shared: number;
    ages: { key: string; count: number }[] | null;
    classes: { key: string; count: number }[] | null;
    currentClassification: boolean;
    retention: { stayed: number | null; joined: number | null; left: number | null; rate: number | null };
  }[];
};
const classOrder = ["PF1", "PF2", "pending", "not_classified"] as const;
function HeadcountCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    h = t.headcount;
  const [period, setPeriod] = usePeriod("headcount", "last5");
  const [view, setView] = useState<HeadcountData["view"]>("teams"),
    [table, setTable] = useState(false);
  const { data, error, retry } = useStat<HeadcountData>("headcount", { period: serializePeriod(period), view });
  const area = useRef<HTMLDivElement>(null);
  const grouped = data && (data.view === "teams" || data.view === "coaches");
  // Teams (by name, a team keeps its name from one season to the next) or categories.
  const keys = useMemo(() => {
    if (!data) return [] as { id: string; label: string; color: string }[];
    if (data.view === "age") return ageBands.map((k, i) => ({ id: k, label: h.ages[k], color: palette(i) }));
    if (data.view === "classification") return classOrder.map((k, i) => ({ id: k, label: h.classes[k], color: palette(i) }));
    const out: { id: string; label: string; color: string }[] = [];
    for (const s of data.seasons) for (const x of s.teams) if (!out.some((k) => k.id === x.name)) out.push({ id: x.name, label: x.name, color: colorOf(x.color, out.length) });
    return out;
  }, [data, h]);
  const value = useCallback(
    (s: HeadcountData["seasons"][number], key: string) =>
      (data?.view === "age" ? s.ages?.find((x) => x.key === key)?.count : data?.view === "classification" ? s.classes?.find((x) => x.key === key)?.count : s.teams.find((x) => x.name === key)?.count) ?? 0,
    [data],
  );
  const shared = data?.seasons.reduce((n, s) => n + s.shared, 0) ?? 0;
  const current = data?.view === "classification" && data.seasons.some((s) => s.currentClassification);
  const withRetention = data?.view === "teams";
  const rows = useMemo(
    () =>
      data
        ? [
            [h.season, ...keys.map((k) => k.label), h.total, ...(withRetention ? [h.stayed, h.joined, h.left, h.retention] : [])],
            ...data.seasons.map((s) => [
              s.name + (s.currentClassification ? ` (${h.currentMark})` : ""),
              ...keys.map((k) => value(s, k.id)),
              s.total,
              ...(withRetention ? [s.retention.stayed, s.retention.joined, s.retention.left, s.retention.rate === null ? null : `${s.retention.rate} %`] : []),
            ]),
          ]
        : [],
    [data, keys, value, withRetention, h],
  );
  useEffect(() => register("headcount", data ? { title: `${h.title} (${h.views[data.view]})`, rows } : null), [register, data, rows, h]);
  const sub = periodText(t, locale, data);
  const summary = data ? `${h.summary} : ${data.seasons.map((s) => `${s.name} ${s.total} ${h.people}`).join(", ")}` : "";
  const empty = data && !data.seasons.some((s) => s.total > 0);
  return (
    <ChartCard
      id="stats-headcount"
      title={h.title}
      sub={sub}
      tools={
        <Segmented
          label={h.view}
          items={(["teams", "age", "classification", "coaches"] as const).map((k) => ({ id: k, label: h.views[k] }))}
          value={view}
          onChange={(v) => setView(v as HeadcountData["view"])}
        />
      }
      menu={
        <ChartMenu
          locale={locale}
          period={period}
          onPeriod={setPeriod}
          table={table}
          onTable={() => setTable((v) => !v)}
          onCsv={() => downloadCsv(`${slug(h.title)}.csv`, rows)} xlsx={{ title: h.title, rows }}
          onPng={() => area.current && void exportPng(area.current, `${h.title} · ${h.views[view]}`, sub, `${slug(h.title)}.png`)}
        />
      }
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data && (
        <div ref={area}>
          {empty ? (
            <p className="muted">{data.view === "coaches" ? h.emptyCoaches : h.empty}</p>
          ) : (
            <ChartFrame
              locale={locale}
              view={table ? "table" : "chart"}
              legend={keys}
              table={
                <>
                  <DataTable label={h.title}>
                    <thead>
                      <tr>
                        {rows[0].map((x, i) => (
                          <th scope="col" className={i ? "num" : undefined} key={String(x)}>
                            {x}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(1).map((r, i) => (
                        <tr key={data.seasons[i].id}>
                          <th scope="row">{r[0]}</th>
                          {r.slice(1).map((v, j) => (
                            <td className="num" key={j}>
                              {v === null ? "…" : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                  {grouped && shared > 0 && <p className="muted small">{fill(h.shared, { n: shared })}</p>}
                </>
              }
            >
              {(hidden) =>
                grouped ? (
                  <GroupedBarChart
                    locale={locale}
                    summary={summary}
                    hidden={hidden}
                    groups={data.seasons.map((s) => ({ label: s.name, total: s.total, bars: keys.map((k) => ({ id: k.id, label: k.label, color: k.color, value: value(s, k.id) })).filter((b) => b.value > 0) }))}
                  />
                ) : (
                  <StackedBarChart
                    locale={locale}
                    summary={summary}
                    categories={data.seasons.map((s) => s.name)}
                    segments={keys.filter((k) => !hidden.has(k.id)).map((k) => ({ ...k, values: data.seasons.map((s) => value(s, k.id)) }))}
                  />
                )
              }
            </ChartFrame>
          )}
          {data.view === "age" && <p className="muted small">{h.ageNote}</p>}
          {current && <p className="muted small">{fill(h.currentNote, { date: shortDate(locale, data.historyStart ?? brusselsDay()) })}</p>}
        </div>
      )}
    </ChartCard>
  );
}

type ResultsData = Spanned & { teams: { name: string; color: string | null; team_id: string; season_id: string; won: number; drawn: number; lost: number }[] };
function ResultsCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    r = t.results;
  const [period, setPeriod] = usePeriod("results", "season");
  const [table, setTable] = useState(false);
  const { data, error, retry } = useStat<ResultsData>("results", { period: serializePeriod(period) });
  const area = useRef<HTMLDivElement>(null);
  const line = (x: { won: number; drawn: number; lost: number }) => fill(r.line, x);
  const rows = useMemo(
    () => (data ? [[r.team, r.played, r.won, r.drawn, r.lost], ...data.teams.map((x) => [x.name, x.won + x.drawn + x.lost, x.won, x.drawn, x.lost])] : []),
    [data, r],
  );
  useEffect(() => register("results", data ? { title: r.title, rows } : null), [register, data, rows, r.title]);
  const sub = periodText(t, locale, data);
  return (
    <ChartCard
      id="stats-results"
      title={r.title}
      sub={sub}
      menu={
        <ChartMenu
          locale={locale}
          period={period}
          onPeriod={setPeriod}
          table={table}
          onTable={() => setTable((v) => !v)}
          onCsv={() => downloadCsv(`${slug(r.title)}.csv`, rows)} xlsx={{ title: r.title, rows }}
          onPng={() => area.current && void exportPng(area.current, r.title, sub, `${slug(r.title)}.png`)}
        />
      }
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (!data.teams.length ? (
          <p className="muted">{r.empty}</p>
        ) : table ? (
          <DataTable label={r.title}>
            <thead>
              <tr>
                {rows[0].map((x, i) => (
                  <th scope="col" className={i ? "num" : undefined} key={String(x)}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.teams.map((x) => (
                <tr key={x.name}>
                  <th scope="row">{x.name}</th>
                  <td className="num">{x.won + x.drawn + x.lost}</td>
                  <td className="num">{x.won}</td>
                  <td className="num">{x.drawn}</td>
                  <td className="num">{x.lost}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <div ref={area}>
            <ul className="result-rings">
            {data.teams.map((x) => {
              const total = x.won + x.drawn + x.lost;
              return (
                <li key={x.name}>
                  <Link href={`/${locale}/statistics/game?season=${x.season_id}&team=${x.team_id}`} aria-label={`${fill(r.open, { team: x.name })} : ${total ? line(x) : r.none}`}>
                    <DonutChart won={x.won} drawn={x.drawn} lost={x.lost} unit={total === 1 ? r.match : r.matches} />
                    <span className="result-ring-name" data-export-text>
                      <span className="team-dot" data-color={x.color ?? undefined} aria-hidden="true" />
                      {x.name}
                    </span>
                    <span className="result-ring-line muted small" data-export-text>
                      {total ? line(x) : r.none}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          </div>
        ))}
    </ChartCard>
  );
}

type StorageData = {
  used: number;
  quota: number;
  free: number;
  percent: number;
  level: "ok" | "warning" | "full";
  segments: { key: string; share: number }[];
  categories: { key: (typeof storageCategories)[number]; bytes: number; files: number }[];
};
type Largest = { files: { id: string; category: (typeof storageCategories)[number]; name: string; bytes: number; createdAt: string; href: string }[] };
function StorageCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    st = t.storage;
  const { data, error, retry } = useStat<StorageData>("storage", {});
  const [largest, setLargest] = useState<Largest | null>(null),
    [table, setTable] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const size = (n: number) => formatBytes(n, locale);
  const colors = Object.fromEntries([...storageCategories.map((k, i) => [k, palette(i)]), ["free", "var(--grid-line)"]]) as Record<string, string>;
  const usedLine = data ? fill(st.used, { used: size(data.used), quota: size(data.quota), percent: data.percent }) : "";
  const rows = useMemo(
    () =>
      data
        ? [
            [st.category, st.size, st.filesHeader],
            ...data.categories.map((c) => [st.categories[c.key], formatBytes(c.bytes, locale), c.files]),
            [st.categories.free, formatBytes(data.free, locale), ""],
          ]
        : [],
    [data, st, locale],
  );
  useEffect(() => register("storage", data ? { title: `${st.title} · ${usedLine}`, rows } : null), [register, data, rows, st.title, usedLine]);
  async function showLargest() {
    const r = await fetch(`/api/statistics/club?chart=largest`, { cache: "no-store" });
    if (r.ok) setLargest(await r.json());
  }
  return (
    <ChartCard
      id="stats-storage"
      title={st.title}
      sub={st.quota}
      tools={data && data.level !== "ok" ? <Badge tone={data.level === "full" ? "danger" : "warning"}>{data.level === "full" ? st.full : st.warning}</Badge> : undefined}
      menu={
        <ChartMenu
          locale={locale}
          table={table}
          onTable={() => setTable((v) => !v)}
          onCsv={() => downloadCsv(`${slug(st.title)}.csv`, rows)} xlsx={{ title: st.title, rows }}
          onPng={() => area.current && void exportPng(area.current, st.title, usedLine, `${slug(st.title)}.png`)}
        />
      }
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data && (
        <div ref={area} className="storage">
          {!table && <SplitBar label={`${st.summary} : ${usedLine}`} parts={data.segments.map((s) => ({ id: s.key, share: s.share, color: colors[s.key] }))} />}
          <p className="storage-used" data-export-text>
            {usedLine}
          </p>
          {data.level !== "ok" && <p className={data.level === "full" ? "notice" : "muted small"}>{data.level === "full" ? st.fullText : st.warningText}</p>}
          <ul className="storage-legend">
            {[...data.categories, { key: "free" as const, bytes: data.free, files: 0 }].map((c) => (
              <li key={c.key}>
                <span className="chart-swatch storage-swatch" data-key={c.key} aria-hidden="true" />
                <span data-export-text>{st.categories[c.key]}</span>
                <span className="num" data-export-text>
                  {size(c.bytes)}
                </span>
                {c.key !== "free" && <span className="muted small">{fill(st.files, { n: c.files })}</span>}
              </li>
            ))}
          </ul>
          {data.level !== "ok" && !largest && (
            <Button variant="secondary" size="sm" onClick={() => void showLargest()}>
              {st.largest}
            </Button>
          )}
          {largest && (
            <DataTable label={st.largestTitle} caption={st.largestTitle}>
              <thead>
                <tr>
                  <th scope="col">{st.file}</th>
                  <th scope="col">{st.category}</th>
                  <th scope="col" className="num">
                    {st.size}
                  </th>
                  <th scope="col">{st.added}</th>
                </tr>
              </thead>
              <tbody>
                {largest.files.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">
                      <Link href={`/${locale}${f.href}`}>{f.name}</Link>
                    </th>
                    <td>{st.categories[f.category]}</td>
                    <td className="num">{size(f.bytes)}</td>
                    <td>{shortDate(locale, String(f.createdAt).slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      )}
    </ChartCard>
  );
}
