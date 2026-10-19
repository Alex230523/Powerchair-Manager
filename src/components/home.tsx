"use client";
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
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/dashboard", { cache: "no-store" })
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
  }, [attempt]);
  if (state.kind === "loading")
    return (
      <main id="main" aria-busy="true">
        <p className="sr-only" role="status">
          {t.loading}
        </p>
        <div className="skeleton skeleton-hero" />
        <div className="todo-list dash-section">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
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
function DashboardView({ locale, data }: { locale: Locale; data: Dashboard }) {
  const t = homeCopy[locale],
    s = shellCopy[locale];
  const first = data.user.name.split(/\s+/)[0] || data.user.name;
  const today = new Intl.DateTimeFormat(tag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: zone,
  }).format(new Date(data.generatedAt));
  const href = (route: string) => `/${locale}${route}`;
  const shortcuts: { route: string; label: string; icon: IconName }[] =
    data.context
      ? [
          { route: "/calendar", label: s.calendar, icon: "calendar" },
          { route: "/attendance", label: s.attendance, icon: "attendance" },
          { route: "/documents", label: s.documents, icon: "document" },
          { route: "/messages", label: s.messages, icon: "message" },
          ...(data.scopes.includes("people")
            ? [
                {
                  route: "/players",
                  label: s.players,
                  icon: "players" as const,
                },
              ]
            : []),
          ...(data.scopes.includes("equipment")
            ? [
                {
                  route: "/equipment",
                  label: s.equipment,
                  icon: "wheelchair" as const,
                },
              ]
            : []),
        ]
      : [];
  return (
    <main id="main" className="dashboard">
      <div className="dash-head">
        <div>
          {data.context && (
            <p className="eyebrow">
              {data.context.organization} ·{" "}
              {labels[data.context.role as Role]?.[locale] ?? data.context.role}
            </p>
          )}
          <h1>
            {t.greeting}, {first}
          </h1>
          <p>{today}</p>
        </div>
        {data.context && (
          <Link className="button secondary" href={href("/statistics")}>
            <Icon name="chart" />
            {s.statistics}
          </Link>
        )}
      </div>
      {!data.context && (
        <p className="notice">
          {t.noContext} <Link href={href("/access")}>{t.chooseProfile}</Link>
        </p>
      )}
      <section className="dash-section" aria-labelledby="dash-todo">
        <h2 id="dash-todo">
          {t.todo}
          {data.todos.length > 0 && (
            <span className="count-pill">
              {data.todos.reduce((n, item) => n + item.count, 0)}
            </span>
          )}
        </h2>
        {data.todos.length ? (
          <ul className="todo-list">
            {data.todos.map((item) => (
              <li key={item.key}>
                <Link
                  className="todo-item"
                  data-tone={item.tone}
                  href={href(item.href)}
                >
                  <span className="todo-count">{item.count}</span>
                  <span className="todo-text">
                    <strong>{t.todos[item.key].title}</strong>
                    <span>{t.todos[item.key].text}</span>
                  </span>
                  <span className="todo-arrow">
                    <Icon name="arrow" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="all-clear">
            <Icon name="check" />
            {t.allClear}
          </p>
        )}
      </section>
      {data.metrics.length > 0 && (
        <section className="dash-section" aria-labelledby="dash-figures">
          <h2 id="dash-figures">{t.figures}</h2>
          <ul className="metric-grid">
            {data.metrics.map((m) => (
              <li key={m.key}>
                <MetricCard locale={locale} metric={m} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.context && (
        <div className="dash-columns dash-section">
          <section className="panel" aria-labelledby="dash-agenda">
            <h2 id="dash-agenda">{t.agenda}</h2>
            {data.agenda.length ? (
              <ul className="agenda">
                {data.agenda.map((e) => (
                  <AgendaRow key={e.id} locale={locale} event={e} />
                ))}
              </ul>
            ) : (
              <p className="muted">{t.agendaEmpty}</p>
            )}
            <p>
              <Link href={href("/calendar")}>{t.openCalendar}</Link>
            </p>
          </section>
          <section className="panel" aria-labelledby="dash-shortcuts">
            <h2 id="dash-shortcuts">{t.shortcuts}</h2>
            <ul className="quick-links">
              {shortcuts.map((q) => (
                <li key={q.route}>
                  <Link href={href(q.route)}>
                    <span className="nav-icon">
                      <Icon name={q.icon} />
                    </span>
                    {q.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
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
  const body = (
    <>
      <span className="metric-label">{t.label}</span>
      <span className="metric-value">{value}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </>
  );
  return metric.href ? (
    <Link className="metric" href={`/${locale}${metric.href}`}>
      {body}
    </Link>
  ) : (
    <div className="metric">{body}</div>
  );
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
    `${part({ weekday: "long" }).format(start)} ${time.format(start)}–${time.format(end)}`,
    event.team,
    event.place,
  ].filter(Boolean);
  return (
    <li className={event.status === "cancelled" ? "agenda-cancelled" : ""}>
      <span className="agenda-date" aria-hidden="true">
        <strong>{part({ day: "numeric" }).format(start)}</strong>
        <span>{part({ month: "short" }).format(start)}</span>
      </span>
      <span className="agenda-body">
        <strong>
          {event.title}
          {event.status === "cancelled" && (
            <span className="status-tag" data-tone="danger">
              {t.cancelled}
            </span>
          )}
          {event.responseNeeded && event.status !== "cancelled" && (
            <span className="status-tag" data-tone="warning">
              {t.responseNeeded}
            </span>
          )}
        </strong>
        <span>
          <span className="sr-only">
            {part({ day: "numeric", month: "long" }).format(start)},{" "}
          </span>
          {details.join(" · ")}
        </span>
      </span>
    </li>
  );
}
