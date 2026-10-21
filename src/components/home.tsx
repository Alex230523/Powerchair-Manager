"use client";
import { plannerCopy } from "./calendar-planner-copy";
import { CollectionBar } from "./collection-bar";
import Link from "next/link";
import { useEffect, useState } from "react";
import { labels, type Role } from "@/domains/access/policy";
import {
  formatCents,
  type Dashboard,
  type Metric,
} from "@/domains/dashboard/summary";
import type { Locale } from "@/lib/locale";
import { homeCopy } from "./home-copy";
import { Icon, type IconName } from "./icons";
import { shellCopy } from "./shell-copy";
import { useScope } from "./use-scope";
import { Badge, Button, Card, EmptyState, IconTile, KpiCard, PageHeader, Segmented } from "./ui";
type State =
  | { kind: "loading" }
  | { kind: "visitor"; failed: boolean }
  | { kind: "ready"; data: Dashboard };
const zone = "Europe/Brussels";
const featureIcons: IconName[] = ["players", "calendar", "document", "dues"];
function tag(locale: Locale) {
  return locale === "en" ? "en-GB" : `${locale}-BE`;
}
export function Home({ locale }: { locale: Locale }) {
  const t = homeCopy[locale];
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // The season and team chosen in the top bar (wave 12) shape every figure.
  const scope = useScope();
  const query = new URLSearchParams();
  if (scope.seasonId) query.set("season", scope.seasonId);
  if (scope.teamId) query.set("team", scope.teamId);
  const url = "/api/dashboard" + (query.toString() ? "?" + query.toString() : "");
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(url, { cache: "no-store" })
        .then(async (r) => {
          const next: State = r.ok
            ? { kind: "ready", data: (await r.json()) as Dashboard }
            : { kind: "visitor", failed: r.status !== 401 };
          if (!cancelled) setState(next);
        })
        .catch(() => {
          if (!cancelled) setState({ kind: "visitor", failed: true });
        });
    void load();
    // The shell announces profile or preference changes with this event.
    window.addEventListener("pfm-workspace", load);
    return () => {
      cancelled = true;
      window.removeEventListener("pfm-workspace", load);
    };
  }, [attempt, url]);
  if (state.kind === "loading")
    return (
      <main id="main" aria-busy="true">
        <p className="sr-only" role="status">
          {t.loading}
        </p>
        <div className="skeleton skeleton-hero" />
        <div className="skeleton-cards dash-section">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton-grid dash-section">
          <div className="skeleton skeleton-tall" />
          <div className="skeleton skeleton-tall" />
        </div>
      </main>
    );
  if (state.kind === "visitor")
    return (
      <main id="main">
        <section className="landing-hero">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="intro">{t.intro}</p>
          <Link className="button access-link" href={`/${locale}/access`}>
            {t.cta}
            <Icon name="arrow" />
          </Link>
        </section>
        {state.failed && (
          <p role="alert" className="dash-section">
            {t.error}{" "}
            <button
              className="text-button"
              onClick={() => {
                setState({ kind: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              {t.retry}
            </button>
          </p>
        )}
        <ul className="feature-grid">
          {t.features.map((f, i) => (
            <li key={f.title}>
              <span className="feature-icon">
                <Icon name={featureIcons[i] ?? "team"} />
              </span>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </main>
    );
  return <DashboardView locale={locale} data={state.data} />;
}
const todoIcons: Record<Dashboard["todos"][number]["key"], IconName> = {
  documentsExpired: "document",
  registersToClose: "attendance",
  myAttendance: "attendance",
  myDocuments: "document",
  myApplications: "userPlus",
  registrationsReview: "userPlus",
  duesLate: "dues",
  sponsorTasks: "handshake",
  grantTasks: "landmark",
  documentsReview: "document",
  registrationFollowups: "userPlus",
  equipmentService: "wrench",
  courseRequests: "team",
  coursesExpiring: "badgeCheck",
  documentsMissing: "document",
  documentsExpiring: "document",
};
/** The four figures a president reads first; the rest unfolds behind "Tous les chiffres". */
const firstMetrics: Metric["key"][] = ["activePlayers", "upcomingEvents", "pendingResponses", "waitingList"];
const mondayOf = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};
const shiftDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function DashboardView({ locale, data }: { locale: Locale; data: Dashboard }) {
  const t = homeCopy[locale],
    s = shellCopy[locale];
  const first = data.user.name.split(/\s+/)[0] || data.user.name;
  const todayLabel = new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", timeZone: zone }).format(new Date(data.generatedAt));
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(data.generatedAt));
  const href = (route: string) => `/${locale}${route}`;
  // The list is the default everywhere (and the only sensible one under 760 px); the week is a choice.
  const [view, setView] = useState<"list" | "week">("list");
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso));
  const [moreFigures, setMoreFigures] = useState(false);
  const [creating, setCreating] = useState(false);
  // Events and administrative dates, one list ordered by day.
  const timeline = [
    ...data.agenda.map((e) => ({ kind: "event" as const, day: e.startsAt, e })),
    ...data.deadlines.map((d) => ({ kind: "deadline" as const, day: d.date + "T23:59:59Z", d })),
  ].sort((a, b) => a.day.localeCompare(b.day));
  const todoTotal = data.todos.reduce((n, item) => n + item.count, 0);
  const ordered = [...data.metrics].sort((a, b) => {
    const ia = firstMetrics.indexOf(a.key),
      ib = firstMetrics.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const shownMetrics = moreFigures ? ordered : ordered.slice(0, 4);
  const can = data.can ?? { event: false, player: false, operation: false, mail: false };
  const createItems = [
    ...(can.event ? [{ label: t.createEvent, href: href("/calendar?create=1"), icon: "calendar" as IconName }] : []),
    ...(can.player ? [{ label: t.createPlayer, href: href("/players?create=1"), icon: "userPlus" as IconName }] : []),
    ...(can.operation ? [{ label: t.createOperation, href: href("/funding?create=1"), icon: "funding" as IconName }] : []),
    ...(can.mail ? [{ label: t.createMail, href: href("/communication?create=1"), icon: "megaphone" as IconName }] : []),
  ];
  return (
    <main id="main" className="dashboard">
      <PageHeader
        eyebrow={data.context ? `${data.context.organization} · ${labels[data.context.role as Role]?.[locale] ?? data.context.role}` : undefined}
        title={`${t.greeting} ${first}`}
        subtitle={`${todayLabel}${data.season ? ` · ${t.season} ${data.season.name}` : ""}`}
        actions={
          data.context && (
            <>
              {data.context.statistics !== false && (
                <Link className="button secondary" href={href("/statistics")}>
                  <Icon name="chart" />
                  {s.statistics}
                </Link>
              )}
              {createItems.length > 0 && (
                <div className="create-menu">
                  <Button icon="plus" aria-haspopup="menu" aria-expanded={creating} onClick={() => setCreating((v) => !v)}>
                    {t.create}
                  </Button>
                  {creating && (
                    <div className="create-menu-body" role="menu" aria-label={t.create}>
                      {createItems.map((item) => (
                        <Link key={item.href} role="menuitem" href={item.href} onClick={() => setCreating(false)}>
                          <Icon name={item.icon} size={16} /> {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        }
      />
      {!data.context && (
        <p className="notice">
          {t.noContext} <Link href={href("/access")}>{t.chooseProfile}</Link>
        </p>
      )}
      {data.start && !data.start.calendarSubscribed && <StartCard locale={locale} href={href("/calendar?subscribe=1")} />}
      <section className="dash-section" aria-labelledby="dash-todo">
        <h2 id="dash-todo" className="dash-section-title">
          {t.todo}
          {todoTotal > 0 && <Badge tone="primary">{todoTotal}</Badge>}
        </h2>
        {data.todos.length ? (
          <ul className="todo-list">
            {data.todos.slice(0, 6).map((item) => (
              <li key={item.key}>
                <Card className="todo-card" href={href(item.href)} data={{ tone: item.tone }}>
                  <span className="todo-row">
                  <IconTile icon={todoIcons[item.key]} tone={item.tone === "info" ? "neutral" : item.tone} />
                  <span className="todo-count">{item.count}</span>
                  <span className="todo-text">
                    <strong>{t.todos[item.key].title}</strong>
                    <span>{t.todos[item.key].text}</span>
                  </span>
                    <span className="todo-arrow" aria-hidden="true">
                      <Icon name="arrow" size={16} />
                    </span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="check" tone="success" title={t.allClear} />
        )}
      </section>
      {data.context && (
        <div className="dash-grid dash-section">
          <Card
            className="dash-agenda"
            title={t.agenda}
            labelledBy="dash-agenda"
            headingId="dash-agenda"
            actions={
              <Segmented
                label={t.viewLabel}
                items={[
                  { id: "list", label: t.listView },
                  { id: "week", label: t.weekView },
                ]}
                value={view}
                onChange={(id) => setView(id as "list" | "week")}
              />
            }
          >
            {view === "week" ? (
              <WeekView locale={locale} weekStart={weekStart} today={todayIso} onMove={setWeekStart} />
            ) : timeline.length ? (
              <ul className="agenda">
                {timeline.map((row) =>
                  row.kind === "event" ? <AgendaRow key={row.e.id} locale={locale} event={row.e} /> : <DeadlineRow key={row.d.id} locale={locale} deadline={row.d} />,
                )}
              </ul>
            ) : (
              <EmptyState icon="calendar" title={t.agendaEmpty} />
            )}
            <p className="card-link-row">
              <Link href={href("/calendar")}>{t.openCalendar}</Link>
            </p>
          </Card>
          <div className="dash-side">
            {data.metrics.length > 0 && (
              <Card title={t.figures} labelledBy="dash-figures" headingId="dash-figures">
                <ul className="dash-figures stat-row-grid" data-cols="2">
                  {shownMetrics.map((m) => (
                    <li key={m.key}>
                      <MetricCard locale={locale} metric={m} />
                    </li>
                  ))}
                </ul>
                {ordered.length > 4 && (
                  <p className="card-link-row">
                    <button type="button" className="text-button" aria-expanded={moreFigures} onClick={() => setMoreFigures((v) => !v)}>
                      {moreFigures ? t.fewerFigures : t.allFigures}
                    </button>
                  </p>
                )}
              </Card>
            )}
            {data.finance && <FinanceCardView locale={locale} finance={data.finance} />}
          </div>
        </div>
      )}
    </main>
  );
}
/** The money card of the home (wave 14): treasury, season income and expenses, dues collected, players late. */
function FinanceCardView({ locale, finance }: { locale: Locale; finance: NonNullable<Dashboard["finance"]> }) {
  const t = homeCopy[locale];
  const money = (c: number) => formatCents(c, locale);
  const d = finance.dues;
  return (
    <Card title={t.financeTitle} labelledBy="dash-money" headingId="dash-money" className="finance-card">
      {finance.treasury !== null && (
        <p className="finance-treasury">
          <span className="stat-label">{t.treasury}</span>
          <span className="stat-value">{money(finance.treasury)}</span>
        </p>
      )}
      {finance.treasury !== null && (
        <dl className="finance-lines amounts">
          <div>
            <dt>{t.income}</dt>
            <dd className="num">{money(finance.income)}</dd>
          </div>
          <div>
            <dt>{t.expenses}</dt>
            <dd className="num">{money(finance.expenses)}</dd>
          </div>
        </dl>
      )}
      {d && (
        <div className="finance-dues">
          <div className="finance-dues-head">
            <span>{t.duesCollected}</span>
            {d.playersLate > 0 && (
              <Link href={`/${locale}/dues?state=late`} className="finance-late">
                <Badge tone="danger">{t.playersLate.replace("{n}", String(d.playersLate))}</Badge>
              </Link>
            )}
          </div>
          {d.rate === null ? <p className="muted">{t.noDues}</p> : <CollectionBar locale={locale} totals={d} />}
        </div>
      )}
      <p className="card-link-row">
        {finance.treasury !== null ? <Link href={`/${locale}/funding`}>{t.seeFinances}</Link> : <Link href={`/${locale}/dues`}>{t.seeDues}</Link>}
      </p>
    </Card>
  );
}
/** Monday to Sunday, the events of the week in pastel capsules; a fetch of its own, an error inside the card only. */
function WeekView({ locale, weekStart, today, onMove }: { locale: Locale; weekStart: string; today: string; onMove: (iso: string) => void }) {
  const t = homeCopy[locale];
  const scope = useScope();
  const query = new URLSearchParams({ week: weekStart });
  if (scope.seasonId) query.set("season", scope.seasonId);
  if (scope.teamId) query.set("team", scope.teamId);
  const url = `/api/dashboard?${query.toString()}`;
  const [state, setState] = useState<{ url: string; events: NonNullable<Dashboard["week"]>["events"] | null; failed: boolean }>({ url: "", events: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = (await r.json()) as Dashboard;
        if (!cancelled) setState({ url, events: d.week?.events ?? [], failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url, events: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const loading = state.url !== url && !state.failed;
  const days = Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i));
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag(locale), { timeZone: zone, ...o });
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(iso));
  const label = (d: string) => new Date(d + "T12:00:00Z");
  return (
    <div className="week-view">
      <div className="week-nav">
        <button type="button" className="icon-button sm" aria-label={t.previousWeek} onClick={() => onMove(shiftDays(weekStart, -7))}>
          <Icon name="back" size={16} />
        </button>
        <strong aria-live="polite">{t.weekOf.replace("{day}", fmt({ day: "numeric", month: "long" }).format(label(weekStart)))}</strong>
        <button type="button" className="icon-button sm" aria-label={t.nextWeek} onClick={() => onMove(shiftDays(weekStart, 7))}>
          <Icon name="arrow" size={16} />
        </button>
        <Button variant="ghost" size="sm" onClick={() => onMove(mondayOf(today))}>
          {t.thisWeek}
        </Button>
      </div>
      {state.failed ? (
        <p role="alert" className="week-error">
          {t.weekError}
        </p>
      ) : (
        <ol className="week-grid" aria-busy={loading || undefined}>
          {days.map((d) => {
            const items = (state.events ?? []).filter((e) => dayOf(e.startsAt) === d);
            return (
              <li key={d} className="week-day" data-today={d === today || undefined}>
                <div className="week-day-head">
                  <span className="week-day-name">{fmt({ weekday: "short" }).format(label(d))}</span>
                  <span className="week-day-num">{fmt({ day: "numeric" }).format(label(d))}</span>
                </div>
                <ul className="week-events">
                  {items.map((e) => (
                    <li key={e.id}>
                      <Link className="week-event" href={`/${locale}/calendar?event=${e.id}`} data-color={e.teamColor ?? "none"} data-kind={e.kind} data-status={e.status}>
                        <span className="week-event-time">{fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(e.startsAt))}</span>
                        <span className="week-event-title">{e.title}</span>
                        {e.team && <span className="sr-only"> · {e.team}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
      {!state.failed && state.events && state.events.length === 0 && <p className="muted week-empty">{t.weekEmpty}</p>}
    </div>
  );
}
const metricIcons: Record<Metric["key"], IconName> = {
  activeMembers: "club",
  activePlayers: "players",
  activeTeams: "team",
  upcomingEvents: "calendar",
  pendingResponses: "attendance",
  waitingList: "inbox",
  acceptedRecently: "check",
  duesNext30: "dues",
  treasury: "funding",
  myNextDue: "dues",
};
function MetricCard({ locale, metric }: { locale: Locale; metric: Metric }) {
  const t = homeCopy[locale].metrics[metric.key];
  const value =
    metric.format === "cents"
      ? formatCents(metric.value, locale)
      : new Intl.NumberFormat(tag(locale)).format(metric.value);
  const hint = metric.date
    ? new Intl.DateTimeFormat(tag(locale), {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(metric.date + "T12:00:00Z"))
    : t.hint;
  return <KpiCard label={t.label} value={value} description={hint || undefined} icon={metricIcons[metric.key]} href={metric.href ? `/${locale}${metric.href}` : undefined} />;
}
function AgendaRow({
  locale,
  event,
}: {
  locale: Locale;
  event: Dashboard["agenda"][number];
}) {
  const t = homeCopy[locale];
  const start = new Date(event.startsAt),
    end = new Date(event.endsAt);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag(locale), { timeZone: zone, ...o });
  const time = part({ hour: "2-digit", minute: "2-digit" });
  const details = [
    `${part({ weekday: "long" }).format(start)} ${time.format(start)}-${time.format(end)}`,
    event.place,
  ].filter(Boolean);
  const r = event.readiness;
  return (
    <li className={event.status === "cancelled" ? "agenda-cancelled" : ""}>
      <Link className="agenda-link" href={`/${locale}/calendar?event=${event.id}`}>
        <span className="agenda-date" aria-hidden="true">
          <strong>{part({ day: "numeric" }).format(start)}</strong>
          <span>{part({ month: "short" }).format(start)}</span>
        </span>
        <span className="agenda-body">
          <strong>
            {event.title}
            {event.status === "cancelled" && (
              <Badge tone="danger">
                {t.cancelled}
              </Badge>
            )}
            {event.responseNeeded && event.status !== "cancelled" && (
              <Badge tone="warning">
                {t.responseNeeded}
              </Badge>
            )}
          </strong>
          <span>
            <span className="sr-only">
              {part({ day: "numeric", month: "long" }).format(start)},{" "}
            </span>
            {details.join(" · ")}
            {event.team && (
              <>
                {" "}
                <span className="team-chip" data-color={event.teamColor ?? "none"}>
                  <span className="team-dot" aria-hidden="true" />
                  {event.team}
                </span>
              </>
            )}
          </span>
          {r && (
            <span className="readiness">
              <Badge tone={r.tone === "ok" ? "success" : r.tone === "warn" ? "warning" : "danger"} dot>
                {r.players} {t.players} · {r.coaches} {t.coaches}
                <span className="sr-only">
                  {" "}
                  · {t.readinessWord[r.tone]} · {t.readiness[r.tone]}
                </span>
              </Badge>
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
function DeadlineRow({
  locale,
  deadline,
}: {
  locale: Locale;
  deadline: Dashboard["deadlines"][number];
}) {
  const t = homeCopy[locale];
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag(locale), { timeZone: "UTC", ...o });
  const day = new Date(deadline.date + "T12:00:00Z");
  const label = t.deadlines[deadline.kind];
  const extra =
    deadline.kind === "documents"
      ? `${deadline.count}`
      : deadline.kind === "dues"
        ? `${deadline.count} · ${formatCents(deadline.cents ?? 0, locale)}`
        : deadline.title;
  return (
    <li className="agenda-deadline">
      <Link className="agenda-link" href={`/${locale}${deadline.href}`}>
        <span className="agenda-date" data-kind={deadline.kind} aria-hidden="true">
          <strong>{part({ day: "numeric" }).format(day)}</strong>
          <span>{part({ month: "short" }).format(day)}</span>
        </span>
        <span className="agenda-body">
          <strong>{label}</strong>
          <span>
            <span className="sr-only">{part({ day: "numeric", month: "long" }).format(day)}, </span>
            {part({ weekday: "long" }).format(day)} · {extra}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** "Bien démarrer" of players and parents (wave 15, C9): add the trainings to the phone's calendar. */
function StartCard({ locale, href }: { locale: Locale; href: string }) {
  const p = plannerCopy[locale];
  return (
    <Card className="start-card dash-section" title={p.startTitle} id="dash-start">
      <ul className="start-steps">
        <li>
          <IconTile icon="calendar" tone="primary" />
          <span className="start-step-text">
            <strong>{p.startCalendar}</strong>
            <span className="muted small">{p.startCalendarText}</span>
          </span>
          <Link className="button" href={href}>
            {p.start}
          </Link>
        </li>
      </ul>
    </Card>
  );
}
