"use client";
import { RetentionCard } from "./retention";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { useScope, ApplyScope } from "./use-scope";
import type { attendanceView } from "@/domains/attendance/service";
import {
  summarize,
  percentage,
  statisticsCsv,
  type StatisticalEvent,
} from "@/domains/statistics/summary";
import { localAt, shiftLocal } from "@/domains/calendar/time";
import { kindLabels } from "./calendar-copy";
import { Button, Card, EmptyState, PageHeader, StatCard, Toolbar } from "./ui";
const copies = {
  fr: {
    title: "Statistiques",
    intro:
      "Les présences et réponses enregistrées dans votre périmètre d’accès.",
    from: "Du",
    to: "Au",
    team: "Équipe",
    kind: "Type d’événement",
    all: "Tous",
    apply: "Afficher",
    season: "Saison",
    custom: "Période personnalisée",
    sessions: "Événements",
    closed: "Registres clôturés",
    people: "Personnes convoquées",
    rate: "Assiduité",
    answers: "Réponses aux convocations",
    invited: "Convocations",
    attended: "Participations",
    absent: "Absences",
    late: "Retards",
    early: "Départs anticipés",
    monthly: "Évolution mensuelle",
    individual: "Détail par personne",
    name: "Personne",
    month: "Mois",
    observed: "Présences attendues sur registres clôturés",
    empty:
      "Aucune donnée pour cette période. Ajoutez des événements et renseignez leurs présences pour alimenter les statistiques.",
    hint: "L’assiduité porte uniquement sur les registres clôturés, hors événements annulés et convocations retirées. Retards et départs anticipés comptent comme une participation. Une réponse « présent » ne vaut pas un pointage.",
    partial:
      "Résultats incomplets : la limite de 500 événements est atteinte. Réduisez la période ; l’export est désactivé.",
    error:
      "Chargement impossible. Vérifiez votre connexion et votre profil actif.",
    loading: "Chargement…",
    export: "Exporter CSV",
    calendar: "Calendrier",
    attendance: "Gérer les présences",
    future:
      "Les statistiques de matchs (buts, résultats, classement) seront disponibles avec le module de matchs officiels.",
    invalid: "Choisissez une période de 1 à 366 jours.",
  },
  en: {
    title: "Statistics",
    intro: "Recorded attendance and responses within your access scope.",
    from: "From",
    to: "To",
    team: "Team",
    kind: "Event type",
    all: "All",
    apply: "Show",
    season: "Season",
    custom: "Custom period",
    sessions: "Events",
    closed: "Closed registers",
    people: "Invited people",
    rate: "Attendance rate",
    answers: "Invitation responses",
    invited: "Invitations",
    attended: "Attendances",
    absent: "Absences",
    late: "Late arrivals",
    early: "Early departures",
    monthly: "Monthly trend",
    individual: "By person",
    name: "Person",
    month: "Month",
    observed: "Expected attendances in closed registers",
    empty:
      "No data for this period. Add events and record attendance to populate statistics.",
    hint: "Attendance rates use closed registers only, excluding cancelled events and withdrawn invitations. Late arrivals and early departures count as attendance. A positive response is not an attendance mark.",
    partial:
      "Incomplete results: 500-event limit reached. Narrow the period; export is disabled.",
    error: "Unable to load. Check your connection and active profile.",
    loading: "Loading…",
    export: "Export CSV",
    calendar: "Calendar",
    attendance: "Manage attendance",
    future:
      "Match statistics (goals, results, standings) will follow the official matches module.",
    invalid: "Choose a period of 1 to 366 days.",
  },
  nl: {
    title: "Statistieken",
    intro:
      "Geregistreerde aanwezigheid en antwoorden binnen je toegangsrechten.",
    from: "Van",
    to: "Tot",
    team: "Team",
    kind: "Evenementtype",
    all: "Alle",
    apply: "Tonen",
    season: "Seizoen",
    custom: "Aangepaste periode",
    sessions: "Evenementen",
    closed: "Afgesloten registers",
    people: "Opgeroepen personen",
    rate: "Aanwezigheidspercentage",
    answers: "Antwoorden op oproepen",
    invited: "Oproepen",
    attended: "Deelnames",
    absent: "Afwezigheden",
    late: "Te laat",
    early: "Vroeg vertrek",
    monthly: "Maandelijkse evolutie",
    individual: "Per persoon",
    name: "Persoon",
    month: "Maand",
    observed: "Verwachte aanwezigheid in afgesloten registers",
    empty:
      "Geen gegevens voor deze periode. Voeg evenementen toe en registreer aanwezigheid.",
    hint: "Alleen afgesloten registers tellen mee, zonder geannuleerde evenementen en ingetrokken oproepen. Te laat komen en vroeg vertrekken tellen als deelname. Een positief antwoord is geen aanwezigheidsregistratie.",
    partial:
      "Onvolledige resultaten: limiet van 500 evenementen bereikt. Beperk de periode; export is uitgeschakeld.",
    error: "Laden mislukt. Controleer je verbinding en actieve profiel.",
    loading: "Laden…",
    export: "CSV exporteren",
    calendar: "Kalender",
    attendance: "Aanwezigheid beheren",
    future: "Wedstrijdstatistieken volgen met de officiële wedstrijdmodule.",
    invalid: "Kies een periode van 1 tot 366 dagen.",
  },
};
type View = Awaited<ReturnType<typeof attendanceView>>;
export function Statistics({ locale }: { locale: Locale }) {
  const t = copies[locale],
    today = localAt(new Date(), "Europe/Brussels").slice(0, 10);
  const scope = useScope();
  const [filters, setFilters] = useState({
      from: shiftLocal(today + "T12:00", -90).slice(0, 10),
      to: today,
      team: scope.teamId ?? "",
    }),
    [kind, setKind] = useState(""),
    [data, setData] = useState<View | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [invalid, setInvalid] = useState(false);
  const globalTeam = scope.teamId ?? "";
  useEffect(() => {
    // The top bar choice (wave 12) re-seeds the local filter.
    setFilters((f) => (f.team === globalTeam ? f : { ...f, team: globalTeam }));
  }, [globalTeam]);
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
              <Card title={t.monthly} subtitle={t.hint} id="stats-monthly">
                <div className="statistics-bars">
                  {report.months.map((m) => (
                    <div className="statistics-bar" key={m.month}>
                      <span>
                        {new Intl.DateTimeFormat(locale, {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(m.month + "-01T12:00Z"))}
                      </span>
                      <meter
                        min={0}
                        max={100}
                        value={percentage(m.attended, m.closed) ?? 0}
                        aria-label={m.month + " · " + t.rate}
                      />
                      <strong>{rate(m.attended, m.closed)}</strong>
                      <span>
                        {m.attended} / {m.closed}
                      </span>
                    </div>
                  ))}
                </div>
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
      <RetentionCard locale={locale} />
      <p className="muted small">{t.future}</p>
    </main>
  );
}
