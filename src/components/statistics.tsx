"use client";
import { SeasonHeadcount } from "./retention";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { useScope, useSeeded, ApplyScope } from "./use-scope";
import type { attendanceView } from "@/domains/attendance/service";
import {
  summarize,
  percentage,
  statisticsCsv,
  monthlyRates,
  monthsBetween,
  type StatisticalEvent,
} from "@/domains/statistics/summary";
import { localAt, shiftLocal } from "@/domains/calendar/time";
import { kindLabels } from "./calendar-copy";
import { Button, Card, DataTable, EmptyState, PageHeader, StatCard, Toolbar } from "./ui";
import { ChartFrame, LineChart, trendSentence, type ChartSeries } from "./charts";
import { statisticsCopy } from "./statistics-copy";
import { reportCopy } from "./report-copy";
type View = Awaited<ReturnType<typeof attendanceView>>;
export function Statistics({ locale }: { locale: Locale }) {
  const t = statisticsCopy[locale],
    today = localAt(new Date(), "Europe/Brussels").slice(0, 10);
  const scope = useScope();
  // The top bar choice (wave 12) seeds the team filter and re-seeds it when it changes.
  const globalTeam = scope.teamId ?? "";
  const [dates, setDates] = useState({
      from: shiftLocal(today + "T12:00", -90).slice(0, 10),
      to: today,
    }),
    [team, setTeam] = useSeeded(globalTeam),
    [kind, setKind] = useState(""),
    [data, setData] = useState<View | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [invalid, setInvalid] = useState(false);
  const filters = useMemo(() => ({ ...dates, team }), [dates, team]);
  const setFilters = (f: { from: string; to: string; team: string }) => {
    setDates({ from: f.from, to: f.to });
    setTeam(f.team);
  };
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/attendance?" + new URLSearchParams({ ...filters, place: "" }), {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        if (!c.signal.aborted) {
          setData(d);
          setError(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setError(true);
          setData(null);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [filters]);
  // With a team chosen, the club's average comes from a second reading without the team filter.
  const [club, setClub] = useState<{ key: string; events: StatisticalEvent[] } | null>(null);
  useEffect(() => {
    if (!filters.team) return;
    const c = new AbortController();
    fetch("/api/attendance?" + new URLSearchParams({ from: filters.from, to: filters.to, team: "", place: "" }), { cache: "no-store", signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !c.signal.aborted) setClub({ key: filters.from + filters.to, events: d.events });
      })
      .catch(() => {});
    return () => c.abort();
  }, [filters]);
  const report = summarize(
      (data?.events ?? []) as unknown as StatisticalEvent[],
      kind,
    ),
    rate = (n: number, d: number) =>
      percentage(n, d) === null ? "…" : percentage(n, d) + " %";
  function exportCsv() {
    const text = statisticsCsv([
      [
        t.name,
        t.invited,
        t.answers,
        t.observed,
        t.attended,
        t.absent,
        t.late,
        t.early,
        t.rate,
      ],
      ...report.people.map((p) => [
        p.name,
        p.invited,
        p.answered,
        p.closed,
        p.attended,
        p.absent,
        p.late,
        p.early,
        percentage(p.attended, p.closed),
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `statistics-${filters.from}-${filters.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const seasonValue =
    data?.seasons.find((s) => s.starts_on === filters.from && s.ends_on === filters.to)?.id ?? "";
  return (
    <main id="main" className="access statistics">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          <>
            <Link className="button secondary" href={"/" + locale + "/attendance"}>
              {t.attendance}
            </Link>
            <Link className="button secondary" href={"/" + locale + "/calendar"}>
              {t.calendar}
            </Link>
            <Link className="button secondary" href={"/" + locale + "/statistics/report"}>
              {reportCopy[locale].title}
            </Link>
            <Button disabled={!data || loading || data.limited || !report.people.length} onClick={exportCsv}>
              {t.export}
            </Button>
          </>
        }
      />
      <form
        className="statistics-filters"
        key={filters.from + filters.to + filters.team}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            from = String(f.get("from")),
            to = String(f.get("to"));
          if (from >= to || Date.parse(to) - Date.parse(from) > 366 * 86400000) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setLoading(true);
          setFilters({ from, to, team: String(f.get("team")) });
        }}
      >
        <Toolbar label={t.apply} actions={<Button disabled={loading}>{t.apply}</Button>}>
          <div className="toolbar-field">
            <label htmlFor="stats-season">{t.season}</label>
            <select
              id="stats-season"
              value={seasonValue}
              disabled={loading}
              onChange={(e) => {
                const s = data?.seasons.find((s) => s.id === e.target.value);
                if (s) {
                  if (Date.parse(s.ends_on) - Date.parse(s.starts_on) > 366 * 86400000) {
                    setInvalid(true);
                    return;
                  }
                  setInvalid(false);
                  setLoading(true);
                  setFilters({ ...filters, from: s.starts_on, to: s.ends_on });
                }
              }}
            >
              <option value="">{t.custom}</option>
              {data?.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-field">
            <label htmlFor="stats-from">{t.from}</label>
            <input id="stats-from" name="from" type="date" required defaultValue={filters.from} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="stats-to">{t.to}</label>
            <input id="stats-to" name="to" type="date" required defaultValue={filters.to} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="stats-team">{t.team}</label>
            <select id="stats-team" name="team" defaultValue={filters.team}>
              <option value="">{t.all}</option>
              {data?.teams.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <ApplyScope locale={locale} differs={filters.team !== globalTeam} apply={() => scope.setTeam(filters.team || null)} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="stats-kind">{t.kind}</label>
            <select id="stats-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t.all}</option>
              {Object.entries(kindLabels[locale]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </Toolbar>
      </form>
      {invalid && <p role="alert" className="error-message">{t.invalid}</p>}
      {error && (
        <p role="alert" className="error-message">
          {t.error}{" "}
          <button type="button" className="text-button" onClick={() => { setLoading(true); setError(false); setFilters({ ...filters }); }}>
            {t.apply}
          </button>
        </p>
      )}
      <div role="status" className="sr-only">{loading ? t.loading : ""}</div>
      {loading && !data && (
        <div className="stat-row-grid" data-cols="5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((k) => (
            <div key={k} className="skeleton stat-card" />
          ))}
        </div>
      )}
      {data && (
        <>
          {data.limited && <p role="alert" className="notice">{t.partial}</p>}
          <div className="stat-row-grid" data-cols="5">
            <StatCard label={t.sessions} value={report.sessions} icon="calendar" tone="brand" />
            <StatCard label={t.closed} value={report.closedSessions} icon="check" tone="success" hint={`${report.sessions ? Math.round((report.closedSessions / report.sessions) * 100) : 0} %`} />
            <StatCard label={t.people} value={report.people.length} icon="players" tone="info" />
            <StatCard label={t.rate} value={rate(report.total.attended, report.total.closed)} icon="attendance" tone="brand" hint={`${report.total.attended} / ${report.total.closed}`} />
            <StatCard label={t.answers} value={rate(report.total.answered, report.total.invited)} icon="inbox" tone="warning" hint={`${report.total.answered} / ${report.total.invited}`} />
          </div>
          {!report.total.invited ? (
            <EmptyState
              icon="chart"
              title={t.empty}
              action={
                <Link className="button secondary" href={"/" + locale + "/calendar"}>
                  {t.calendar}
                </Link>
              }
            />
          ) : (
            <div className="statistics-columns">
              <Card title={t.monthly} subtitle={t.monthlyIntro} id="stats-monthly">
                <MonthlyChart
                  locale={locale}
                  from={filters.from}
                  to={filters.to}
                  kind={kind}
                  team={filters.team}
                  events={(data.events ?? []) as unknown as (StatisticalEvent & { team_id: string | null })[]}
                  club={filters.team && club?.key === filters.from + filters.to ? club.events : null}
                  teams={data.teams as { id: string; name: string; color: string | null }[]}
                />
                <p className="muted small">{t.hint}</p>
              </Card>
              <Card title={t.individual} subtitle={t.observed} id="stats-people" className="card-flush">
                <div className="statistics-table-scroll" tabIndex={0} role="region" aria-label={t.individual}>
                  <table className="compact-table">
                    <thead>
                      <tr>
                        {[t.name, t.invited, t.answers, t.attended, t.absent, t.late, t.early, t.rate].map((h) => (
                          <th scope="col" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.people.map((p) => (
                        <tr key={p.id}>
                          <th scope="row">{p.name}</th>
                          <td className="num">{p.invited}</td>
                          <td className="num">{rate(p.answered, p.invited)}</td>
                          <td className="num">
                            {p.attended} / {p.closed}
                          </td>
                          <td className="num">{p.absent}</td>
                          <td className="num">{p.late}</td>
                          <td className="num">{p.early}</td>
                          <td className="num">
                            <strong>{rate(p.attended, p.closed)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
      <SeasonHeadcount locale={locale} />
      <p className="muted small">{t.future}</p>
    </main>
  );
}

/**
 * "Évolution mensuelle" (wave 15, 2.6): one line per team (2 px, team colour)
 * and the club (3 px, --primary), from 0 to 100 %; with a team chosen, its
 * line and the club's average dashed.
 */
function MonthlyChart({
  locale,
  from,
  to,
  kind,
  team,
  events,
  club,
  teams,
}: {
  locale: Locale;
  from: string;
  to: string;
  kind: string;
  team: string;
  events: (StatisticalEvent & { team_id: string | null })[];
  club: StatisticalEvent[] | null;
  teams: { id: string; name: string; color: string | null }[];
}) {
  const t = statisticsCopy[locale];
  const months = monthsBetween(from, to);
  const labels = months.map((m) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(m + "-01T12:00Z")));
  const long = (i: number) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(months[i] + "-01T12:00Z"));
  const rates = monthlyRates(events, months, kind);
  const colour = (id: string, i: number) => {
    const c = teams.find((x) => x.id === id)?.color;
    return c ? `var(--team-${c}-border)` : `var(--chart-${(i % 8) + 1})`;
  };
  const series: ChartSeries[] = [];
  if (team) {
    const name = teams.find((x) => x.id === team)?.name ?? t.team;
    series.push({ id: team, label: name, color: colour(team, 0), width: 3, values: rates.club });
    if (club) series.push({ id: "club", label: t.clubAverage, color: "var(--primary)", width: 2, dashed: true, values: monthlyRates(club, months, kind).club });
  } else {
    [...rates.teams]
      .filter(([, v]) => v.some((x) => x !== null))
      .map(([id, values]) => ({ id, values, name: teams.find((x) => x.id === id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((x, i) => series.push({ id: x.id, label: x.name, color: colour(x.id, i), values: x.values }));
    series.push({ id: "club", label: t.club, color: "var(--primary)", width: 3, values: rates.club });
  }
  const pct = (v: number) => `${Math.round(v)} %`;
  const summary = `${t.monthlySummary}. ${series.map((s) => trendSentence(s.label, months.map((_, i) => long(i)), s.values, pct)).join(". ")}`;
  return (
    <ChartFrame
      locale={locale}
      legend={series}
      table={
        <DataTable label={t.monthly}>
          <thead>
            <tr>
              <th scope="col">{t.month}</th>
              {series.map((s) => (
                <th scope="col" className="num" key={s.id}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m}>
                <th scope="row">{long(i)}</th>
                {series.map((s) => (
                  <td className="num" key={s.id}>{s.values[i] === null ? "…" : pct(s.values[i] as number)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </DataTable>
      }
    >
      {(hidden) => <LineChart locale={locale} summary={summary} categories={labels} series={series.filter((s) => !hidden.has(s.id))} format={pct} />}
    </ChartFrame>
  );
}
