"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { serializePeriod } from "@/domains/statistics/period";
import type { Outcome } from "@/domains/statistics/game-math";
import { medalOf } from "@/domains/awards/schema";
import { Badge, DataTable, KpiCard, Segmented } from "./ui";
import { DataGrid, type GridColumn } from "./data-grid";
import { ChartFrame, DivergingBarChart, HorizontalBars } from "./charts";
import { ChartMenu } from "./chart-menu";
import { downloadCsv, exportPng, slug } from "./chart-export";
import { exportCopy } from "./export-copy";
import { useScope } from "./use-scope";
import { Icon } from "./icons";
import { fill, placeLabel, statisticsCopy } from "./statistics-copy";
import {
  ChartCard,
  Failed,
  StatisticsHeader,
  StatisticsTabs,
  StatisticsTeams,
  colorOf,
  periodText,
  shortDate,
  useCsvSections,
  usePeriod,
  useStat,
  type Register,
  type Spanned,
} from "./statistics";

/**
 * The « Jeu » tab of the statistics (wave 16, S2): what the Matches module
 * holds (scores, competitions, opponents, line-ups), for the season and team
 * of the top bar, each card with its period in its « ... » menu.
 */
const api = "/api/statistics/game";
type Record_ = { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; difference: number; winRate: number | null; form: Outcome[] };
type Summary = {
  season: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  restricted: boolean;
  tiles: { played: number; won: number; winRate: number | null; goalsFor: number; goalsAgainst: number; difference: number } | null;
};
type Line = { profile: string; name: string; team: string; matches: number; starts: number; minutes: number; goals: number; assists: number; yellow: number; red: number };
type Players = Spanned & {
  scorers: (Line & { total: number; average: number | null })[];
  assisters: (Line & { total: number; average: number | null })[];
  minutes: Line[];
  discipline: { players: Line[]; teams: { name: string; yellow: number; red: number }[] };
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const decimal = (locale: Locale, n: number | null) => (n === null ? "…" : new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { maximumFractionDigits: 2 }).format(n));

/** The last results as small pills, the letter inside, never the colour alone. */
function Form({ locale, form }: { locale: Locale; form: Outcome[] }) {
  const g = statisticsCopy[locale].game;
  if (!form.length) return <span className="muted">…</span>;
  return (
    <span className="form-pills" role="img" aria-label={fill(g.teams.formLabel, { n: form.length, list: form.map((o) => g.outcomeNames[o]).join(", ") })}>
      {form.map((o, i) => (
        <span key={i} className="form-pill" data-outcome={o} aria-hidden="true">
          {g.outcomes[o]}
        </span>
      ))}
    </span>
  );
}

export function StatisticsGame({ locale }: { locale: Locale }) {
  const t = statisticsCopy[locale],
    g = t.game;
  const summary = useStat<Summary>("summary", {}, api);
  const { register, exportAll, excelAll } = useCsvSections();
  const scope = useScope();
  const s = summary.data;
  useEffect(() => {
    if (!s?.tiles) return register("tiles", null);
    const x = s.tiles;
    register("tiles", {
      title: t.title,
      rows: [
        [g.tiles.played, x.played],
        [g.tiles.won, x.won],
        [g.tiles.goalsFor, x.goalsFor],
        [g.tiles.goalsAgainst, x.goalsAgainst],
        [g.tiles.difference, signed(x.difference)],
      ],
    });
  }, [s, t, g, register]);
  return (
    <main id="main" className="statistics">
      <StatisticsHeader
        locale={locale}
        summary={s}
        onCsv={() => exportAll(["tiles", "teams", "goals", "scorers", "assisters", "minutes", "discipline", "competitions", "opponents", "tournaments"], `statistics-game-${slug(s?.season?.name ?? "club")}.csv`)}
        onXlsx={() =>
          excelAll(["tiles", "teams", "goals", "scorers", "assisters", "minutes", "discipline", "competitions", "opponents", "tournaments"], scope.organizationId, `${t.title} ${t.tabGame}`, s?.season?.name ?? "", exportCopy[locale].sheet)
        }
      />
      <StatisticsTabs locale={locale} current="game" />
      <StatisticsTeams locale={locale} />
      {summary.error && <Failed locale={locale} retry={summary.retry} />}
      <p className="muted small">{g.note}</p>
      {s?.tiles && (
        <div className="stat-row-grid" data-cols="5">
          <KpiCard label={g.tiles.played} value={s.tiles.played} description={g.tiles.playedHint} icon="trophy" />
          <KpiCard label={g.tiles.won} value={s.tiles.won} description={s.tiles.winRate === null ? g.tiles.noMatch : fill(g.tiles.wonHint, { rate: s.tiles.winRate })} icon="medal" tone="success" />
          <KpiCard label={g.tiles.goalsFor} value={s.tiles.goalsFor} icon="chart" tone="info" />
          <KpiCard label={g.tiles.goalsAgainst} value={s.tiles.goalsAgainst} icon="chart" tone="warning" />
          <KpiCard label={g.tiles.difference} value={signed(s.tiles.difference)} icon="chart" />
        </div>
      )}
      {s && (
        <div className="stats-grid">
          <TeamsCard locale={locale} register={register} />
          <GoalsCard locale={locale} register={register} />
          <LeadersCard locale={locale} register={register} kind="scorers" />
          <LeadersCard locale={locale} register={register} kind="assisters" />
          <MinutesCard locale={locale} register={register} />
          <DisciplineCard locale={locale} register={register} />
          <CompetitionCard locale={locale} register={register} />
          <OpponentsCard locale={locale} register={register} />
          <TournamentsCard locale={locale} register={register} />
        </div>
      )}
    </main>
  );
}

type Teams = Spanned & { colors: Record<string, string | null>; teams: (Record_ & { name: string; corners: { ours: number; theirs: number } })[] };
function TeamsCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    g = t.game.teams;
  const [period, setPeriod] = usePeriod("teams", "season");
  const { data, error, retry } = useStat<Teams>("teams", { period: serializePeriod(period) }, api);
  const rows = useMemo(
    () =>
      data
        ? [
            [g.team, g.played, g.won, g.drawn, g.lost, g.goalsFor, g.goalsAgainst, g.difference, g.cornersFor, g.cornersAgainst, g.form],
            ...data.teams.map((x) => [x.name, x.played, x.won, x.drawn, x.lost, x.goalsFor, x.goalsAgainst, signed(x.difference), x.corners.ours, x.corners.theirs, x.form.map((o) => t.game.outcomes[o]).join(" ")]),
          ]
        : [],
    [data, g, t.game.outcomes],
  );
  useEffect(() => register("teams", data ? { title: g.title, rows } : null), [register, data, rows, g.title]);
  const columns: GridColumn<Teams["teams"][number]>[] = [
    {
      key: "team",
      header: g.team,
      rowHeader: true,
      sort: (x) => x.name,
      cell: (x) => (
        <span className="team-chip" data-color={data?.colors[x.name] ?? undefined}>
          <span className="team-dot" aria-hidden="true" />
          {x.name}
        </span>
      ),
    },
    { key: "played", header: g.played, sort: (x) => x.played, cell: (x) => x.played, className: "num" },
    { key: "won", header: g.won, sort: (x) => x.won, cell: (x) => x.won, className: "num" },
    { key: "drawn", header: g.drawn, sort: (x) => x.drawn, cell: (x) => x.drawn, className: "num" },
    { key: "lost", header: g.lost, sort: (x) => x.lost, cell: (x) => x.lost, className: "num" },
    { key: "for", header: g.goalsFor, sort: (x) => x.goalsFor, cell: (x) => x.goalsFor, className: "num" },
    { key: "against", header: g.goalsAgainst, sort: (x) => x.goalsAgainst, cell: (x) => x.goalsAgainst, className: "num" },
    { key: "diff", header: g.difference, sort: (x) => x.difference, cell: (x) => signed(x.difference), className: "num" },
    // Point 14: corners for and against.
    { key: "cornersFor", header: g.cornersFor, sort: (x) => x.corners.ours, cell: (x) => x.corners.ours, className: "num" },
    { key: "cornersAgainst", header: g.cornersAgainst, sort: (x) => x.corners.theirs, cell: (x) => x.corners.theirs, className: "num" },
    { key: "form", header: g.form, cell: (x) => <Form locale={locale} form={x.form} /> },
  ];
  return (
    <ChartCard
      id="stats-teams"
      title={g.title}
      sub={periodText(t, locale, data)}
      className="stats-wide"
      menu={<ChartMenu locale={locale} period={period} onPeriod={setPeriod} onCsv={() => downloadCsv(`${slug(g.title)}.csv`, rows)} xlsx={{ title: g.title, rows }} />}
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (data.teams.length ? (
          <>
            <DataGrid locale={locale} label={g.title} columns={columns} rows={data.teams} rowId={(x) => x.name} rowName={(x) => x.name} sortKey="sort-teams" />
            <p className="muted small">{g.legend}</p>
          </>
        ) : (
          <p className="muted">{g.empty}</p>
        ))}
    </ChartCard>
  );
}

type Goals = Spanned & { colors: Record<string, string | null>; matches: { id: string; starts_at: string; team: string; opponent: string; our: number; their: number }[] };
function GoalsCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    g = t.game.goals;
  const [period, setPeriod] = usePeriod("goals", "season");
  const [table, setTable] = useState(false);
  const { data, error, retry } = useStat<Goals>("goals", { period: serializePeriod(period) }, api);
  const area = useRef<HTMLDivElement>(null);
  const teams = useMemo(() => (data ? [...new Set(data.matches.map((m) => m.team))].sort() : []), [data]);
  const legend = teams.map((name, i) => ({ id: name, label: name, color: colorOf(data?.colors[name], i) }));
  const title = (m: Goals["matches"][number]) => fill(g.match, { date: shortDate(locale, m.starts_at.slice(0, 10)), team: m.team, opponent: m.opponent });
  const rows = useMemo(
    () => (data ? [[t.game.tournaments.date, t.game.team, t.game.opponents.opponent, g.scored, g.conceded], ...data.matches.map((m) => [m.starts_at.slice(0, 10), m.team, m.opponent, m.our, m.their])] : []),
    [data, g, t.game],
  );
  useEffect(() => register("goals", data ? { title: g.title, rows } : null), [register, data, rows, g.title]);
  const sub = periodText(t, locale, data);
  return (
    <ChartCard
      id="stats-goals"
      title={g.title}
      sub={sub}
      className="stats-wide"
      menu={
        <ChartMenu
          locale={locale}
          period={period}
          onPeriod={setPeriod}
          table={table}
          onTable={() => setTable((v) => !v)}
          onCsv={() => downloadCsv(`${slug(g.title)}.csv`, rows)} xlsx={{ title: g.title, rows }}
          onPng={() => area.current && void exportPng(area.current, g.title, sub, `${slug(g.title)}.png`)}
        />
      }
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (!data.matches.length ? (
          <p className="muted">{g.empty}</p>
        ) : (
          <div ref={area}>
            <ChartFrame
              locale={locale}
              view={table ? "table" : "chart"}
              legend={[...legend, { id: "__conceded", label: g.conceded, color: "var(--chart-8)" }]}
              table={
                <DataTable label={g.title}>
                  <thead>
                    <tr>
                      {rows[0].map((h, i) => (
                        <th scope="col" className={i > 2 ? "num" : undefined} key={String(h)}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.matches.map((m) => (
                      <tr key={m.id}>
                        <th scope="row">{shortDate(locale, m.starts_at.slice(0, 10))}</th>
                        <td>{m.team}</td>
                        <td>{m.opponent}</td>
                        <td className="num">{m.our}</td>
                        <td className="num">{m.their}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              }
            >
              {(hidden) => (
                <DivergingBarChart
                  locale={locale}
                  summary={`${g.summary} : ${data.matches.map((m) => `${title(m)} ${fill(g.score, { our: m.our, their: m.their })}`).join(", ")}`}
                  upLabel={g.scored}
                  downLabel={g.conceded}
                  bars={data.matches
                    .filter((m) => !hidden.has(m.team))
                    .map((m) => ({ id: m.id, label: m.opponent, title: title(m), up: m.our, down: hidden.has("__conceded") ? 0 : m.their, color: legend.find((l) => l.id === m.team)?.color ?? "var(--chart-1)" }))}
                />
              )}
            </ChartFrame>
          </div>
        ))}
    </ChartCard>
  );
}

function LeadersCard({ locale, register, kind }: { locale: Locale; register: Register; kind: "scorers" | "assisters" }) {
  const t = statisticsCopy[locale],
    g = t.game;
  const c = g[kind];
  const [period, setPeriod] = usePeriod(kind, "season");
  const { data, error, retry } = useStat<Players>("players", { period: serializePeriod(period) }, api);
  const list = useMemo(() => data?.[kind] ?? [], [data, kind]);
  const rows = useMemo(() => [[g.player, g.team, g.total, g.average], ...list.map((l) => [l.name, l.team, l.total, l.average])], [list, g]);
  useEffect(() => register(kind, data ? { title: c.title, rows } : null), [register, data, rows, c.title, kind]);
  return (
    <ChartCard
      id={`stats-${kind}`}
      title={c.title}
      sub={periodText(t, locale, data)}
      menu={<ChartMenu locale={locale} period={period} onPeriod={setPeriod} onCsv={() => downloadCsv(`${slug(c.title)}.csv`, rows)} xlsx={{ title: c.title, rows }} />}
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (!list.length ? (
          <p className="muted">{c.empty}</p>
        ) : (
          <DataTable label={c.title}>
            <thead>
              <tr>
                <th scope="col">{g.player}</th>
                <th scope="col">{g.team}</th>
                <th scope="col" className="num">
                  {g.total}
                </th>
                <th scope="col" className="num">
                  {g.average}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.profile}>
                  <th scope="row">
                    <Link href={`/${locale}/players/${l.profile}`}>{l.name}</Link>
                  </th>
                  <td>{l.team}</td>
                  <td className="num">
                    <strong>{l.total}</strong>
                  </td>
                  <td className="num">{decimal(locale, l.average)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ))}
    </ChartCard>
  );
}

function MinutesCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    g = t.game,
    c = g.minutes;
  const [period, setPeriod] = usePeriod("minutes", "season");
  const [table, setTable] = useState(false);
  const { data, error, retry } = useStat<Players>("players", { period: serializePeriod(period) }, api);
  const area = useRef<HTMLDivElement>(null);
  const list = useMemo(() => data?.minutes ?? [], [data]);
  const rows = useMemo(() => [[g.player, g.team, c.minutes, c.starts, c.matches], ...list.map((l) => [l.name, l.team, l.minutes, l.starts, l.matches])], [list, g, c]);
  useEffect(() => register("minutes", data ? { title: c.title, rows } : null), [register, data, rows, c.title]);
  const sub = periodText(t, locale, data);
  return (
    <ChartCard
      id="stats-minutes"
      title={c.title}
      sub={sub}
      menu={
        <ChartMenu
          locale={locale}
          period={period}
          onPeriod={setPeriod}
          table={table}
          onTable={() => setTable((v) => !v)}
          onCsv={() => downloadCsv(`${slug(c.title)}.csv`, rows)} xlsx={{ title: c.title, rows }}
          onPng={() => area.current && void exportPng(area.current, c.title, sub, `${slug(c.title)}.png`)}
        />
      }
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (!list.length ? (
          <p className="muted">{c.empty}</p>
        ) : table ? (
          <DataTable label={c.title}>
            <thead>
              <tr>
                {rows[0].map((h, i) => (
                  <th scope="col" className={i > 1 ? "num" : undefined} key={String(h)}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.profile}>
                  <th scope="row">{l.name}</th>
                  <td>{l.team}</td>
                  <td className="num">{l.minutes}</td>
                  <td className="num">{l.starts}</td>
                  <td className="num">{l.matches}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <div ref={area}>
            <HorizontalBars
              summary={`${c.summary} : ${list.map((l) => `${l.name} ${fill(c.bar, { minutes: l.minutes, starts: l.starts, matches: l.matches })}`).join(", ")}`}
              format={(v) => `${v} min`}
              rows={list.map((l) => ({ id: l.profile, label: l.name, value: l.minutes, note: fill(c.startsShort, { n: l.starts }), color: "var(--chart-1)" }))}
            />
          </div>
        ))}
    </ChartCard>
  );
}

function DisciplineCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    g = t.game,
    c = g.discipline;
  const [period, setPeriod] = usePeriod("discipline", "season");
  const { data, error, retry } = useStat<Players>("players", { period: serializePeriod(period) }, api);
  const players = useMemo(() => data?.discipline.players ?? [], [data]),
    teams = useMemo(() => data?.discipline.teams ?? [], [data]);
  const rows = useMemo(
    () => [[g.player, g.team, c.yellow, c.red], ...players.map((l) => [l.name, l.team, l.yellow, l.red]), [], [g.team, "", c.yellow, c.red], ...teams.map((x) => [x.name, "", x.yellow, x.red])],
    [players, teams, g, c],
  );
  useEffect(() => register("discipline", data ? { title: c.title, rows } : null), [register, data, rows, c.title]);
  const head = (first: string) => (
    <thead>
      <tr>
        <th scope="col">{first}</th>
        <th scope="col" className="num">
          {c.yellow}
        </th>
        <th scope="col" className="num">
          {c.red}
        </th>
      </tr>
    </thead>
  );
  return (
    <ChartCard
      id="stats-discipline"
      title={c.title}
      sub={periodText(t, locale, data)}
      menu={<ChartMenu locale={locale} period={period} onPeriod={setPeriod} onCsv={() => downloadCsv(`${slug(c.title)}.csv`, rows)} xlsx={{ title: c.title, rows }} />}
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data && (
        <>
          <h3 className="stats-subtitle">{c.byPlayer}</h3>
          {players.length ? (
            <DataTable label={`${c.title} : ${c.byPlayer}`}>
              {head(g.player)}
              <tbody>
                {players.map((l) => (
                  <tr key={l.profile}>
                    <th scope="row">{l.name}</th>
                    <td className="num">{l.yellow}</td>
                    <td className="num">{l.red}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <p className="muted">{c.empty}</p>
          )}
          {teams.length > 0 && (
            <>
              <h3 className="stats-subtitle">{c.byTeam}</h3>
              <DataTable label={`${c.title} : ${c.byTeam}`}>
                {head(g.team)}
                <tbody>
                  {teams.map((x) => (
                    <tr key={x.name}>
                      <th scope="row">{x.name}</th>
                      <td className="num">{x.yellow}</td>
                      <td className="num">{x.red}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </>
          )}
        </>
      )}
    </ChartCard>
  );
}

type Competitions = Spanned & { kinds: (Record_ & { name: "league" | "cup" | "tournament" | "friendly" })[] };
function CompetitionCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    g = t.game,
    c = g.competitions,
    h = g.teams;
  const [period, setPeriod] = usePeriod("competitions", "season");
  const [kind, setKind] = useState<Competitions["kinds"][number]["name"]>("league");
  const { data, error, retry } = useStat<Competitions>("competitions", { period: serializePeriod(period) }, api);
  const rows = useMemo(
    () =>
      data
        ? [
            [c.choose, h.played, h.won, h.drawn, h.lost, h.goalsFor, h.goalsAgainst, h.difference],
            ...data.kinds.map((k) => [c.kinds[k.name], k.played, k.won, k.drawn, k.lost, k.goalsFor, k.goalsAgainst, signed(k.difference)]),
          ]
        : [],
    [data, c, h],
  );
  useEffect(() => register("competitions", data ? { title: c.title, rows } : null), [register, data, rows, c.title]);
  const r = data?.kinds.find((k) => k.name === kind);
  return (
    <ChartCard
      id="stats-competitions"
      title={c.title}
      sub={periodText(t, locale, data)}
      tools={
        <Segmented label={c.choose} items={(["league", "cup", "tournament", "friendly"] as const).map((k) => ({ id: k, label: c.kinds[k] }))} value={kind} onChange={(v) => setKind(v as typeof kind)} />
      }
      menu={<ChartMenu locale={locale} period={period} onPeriod={setPeriod} onCsv={() => downloadCsv(`${slug(c.title)}.csv`, rows)} xlsx={{ title: c.title, rows }} />}
    >
      {error && <Failed locale={locale} retry={retry} />}
      {r &&
        (!r.played ? (
          <p className="muted">{c.empty}</p>
        ) : (
          <dl className="competition-record">
            {(
              [
                [h.played, r.played],
                [h.won, r.won],
                [h.drawn, r.drawn],
                [h.lost, r.lost],
                [h.goalsFor, r.goalsFor],
                [h.goalsAgainst, r.goalsAgainst],
                [h.difference, signed(r.difference)],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div className="competition-form">
              <dt>{h.form}</dt>
              <dd>
                <Form locale={locale} form={r.form} />
              </dd>
            </div>
          </dl>
        ))}
    </ChartCard>
  );
}

type Opponents = Spanned & { opponents: (Record_ & { name: string })[] };
function OpponentsCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    g = t.game,
    c = g.opponents,
    h = g.teams;
  const [period, setPeriod] = usePeriod("opponents", "season");
  const { data, error, retry } = useStat<Opponents>("opponents", { period: serializePeriod(period) }, api);
  const rows = useMemo(
    () => (data ? [[c.opponent, h.played, h.won, h.drawn, h.lost, h.goalsFor, h.goalsAgainst], ...data.opponents.map((x) => [x.name, x.played, x.won, x.drawn, x.lost, x.goalsFor, x.goalsAgainst])] : []),
    [data, c, h],
  );
  useEffect(() => register("opponents", data ? { title: c.title, rows } : null), [register, data, rows, c.title]);
  const columns: GridColumn<Opponents["opponents"][number]>[] = [
    { key: "opponent", header: c.opponent, rowHeader: true, sort: (x) => x.name, cell: (x) => x.name },
    { key: "played", header: h.played, sort: (x) => x.played, cell: (x) => x.played, className: "num" },
    { key: "won", header: h.won, sort: (x) => x.won, cell: (x) => x.won, className: "num" },
    { key: "drawn", header: h.drawn, sort: (x) => x.drawn, cell: (x) => x.drawn, className: "num" },
    { key: "lost", header: h.lost, sort: (x) => x.lost, cell: (x) => x.lost, className: "num" },
    { key: "goals", header: c.goals, sort: (x) => x.difference, cell: (x) => fill(g.goals.score, { our: x.goalsFor, their: x.goalsAgainst }), className: "num" },
  ];
  return (
    <ChartCard
      id="stats-opponents"
      title={c.title}
      sub={periodText(t, locale, data)}
      menu={<ChartMenu locale={locale} period={period} onPeriod={setPeriod} onCsv={() => downloadCsv(`${slug(c.title)}.csv`, rows)} xlsx={{ title: c.title, rows }} />}
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (data.opponents.length ? (
          <DataGrid locale={locale} label={c.title} columns={columns} rows={data.opponents} rowId={(x) => x.name} rowName={(x) => x.name} sortKey="sort-opponents" pageSize={20} />
        ) : (
          <p className="muted">{c.empty}</p>
        ))}
    </ChartCard>
  );
}

/** « 2e place sur 8 », or the place alone. */
function rankText(locale: Locale, x: { final_rank: number; teams_count: number | null }) {
  const t = statisticsCopy[locale];
  const place = placeLabel(t.awards, x.final_rank, locale);
  return x.teams_count ? fill(t.game.tournaments.rank, { rank: place, n: x.teams_count }) : place;
}
type Tournaments = Spanned & { tournaments: { id: string; title: string; ends_on: string; final_rank: number; teams_count: number | null; team: string | null; season: string | null; awarded: boolean }[] };
function TournamentsCard({ locale, register }: { locale: Locale; register: Register }) {
  const t = statisticsCopy[locale],
    c = t.game.tournaments;
  const [period, setPeriod] = usePeriod("tournaments", "last5");
  const { data, error, retry } = useStat<Tournaments>("tournaments", { period: serializePeriod(period) }, api);
  const rank = (x: Tournaments["tournaments"][number]) => rankText(locale, x);
  const rows = useMemo(
    () => (data ? [[c.season, c.tournament, t.game.team, c.date, c.place], ...data.tournaments.map((x) => [x.season ?? "", x.title, x.team ?? "", x.ends_on, rankText(locale, x)])] : []),
    [data, c, t, locale],
  );
  useEffect(() => register("tournaments", data ? { title: c.title, rows } : null), [register, data, rows, c.title]);
  return (
    <ChartCard
      id="stats-tournaments"
      title={c.title}
      sub={periodText(t, locale, data)}
      className="stats-wide"
      tools={
        <Link className="button secondary sm" href={`/${locale}/statistics/club#hall-of-fame`}>
          {c.hall}
        </Link>
      }
      menu={<ChartMenu locale={locale} period={period} onPeriod={setPeriod} onCsv={() => downloadCsv(`${slug(c.title)}.csv`, rows)} xlsx={{ title: c.title, rows }} />}
    >
      {error && <Failed locale={locale} retry={retry} />}
      {data &&
        (!data.tournaments.length ? (
          <p className="muted">{c.empty}</p>
        ) : (
          <DataTable label={c.title}>
            <thead>
              <tr>
                <th scope="col">{c.season}</th>
                <th scope="col">{c.tournament}</th>
                <th scope="col">{t.game.team}</th>
                <th scope="col">{c.date}</th>
                <th scope="col">{c.place}</th>
              </tr>
            </thead>
            <tbody>
              {data.tournaments.map((x) => (
                <tr key={x.id}>
                  <td>{x.season ?? t.awards.noSeason}</td>
                  <th scope="row">
                    <Link href={`/${locale}/trips/${x.id}`}>{x.title}</Link>
                  </th>
                  <td>{x.team ?? ""}</td>
                  <td>{shortDate(locale, x.ends_on)}</td>
                  <td>
                    <span className="award-place">
                      <span className="medal" data-medal={medalOf(x.final_rank)} aria-hidden="true">
                        <Icon name={medalOf(x.final_rank) === "star" ? "star" : "medal"} size={16} />
                      </span>
                      {rank(x)}
                      {x.awarded && <Badge tone="success">{c.awarded}</Badge>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ))}
    </ChartCard>
  );
}
