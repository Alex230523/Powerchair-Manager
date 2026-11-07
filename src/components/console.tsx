"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { consoleHome, consoleOperators, consoleOrganization, consoleOrganizations, consoleSupervision } from "@/domains/console/service";
import type { billingView } from "@/domains/billing/service";
import type { mcpKeys } from "@/domains/mcp/service";
import type { assistantView, AssistantTurn } from "@/domains/assistant/service";
import type { alertPrefView, reportsView } from "@/domains/console/metrics";
import type { consoleSupport, consoleTicket } from "@/domains/support/service";
import type { consoleCountries } from "@/domains/console/service";
import { operatorRoles } from "@/domains/console/schema";
import { planBases, planPeriods } from "@/domains/billing/schema";
import { formatCents } from "@/domains/dashboard/summary";
import { formatBytes as bytes } from "@/domains/storage/summary";
import { Modal } from "./modal";
import { consoleCopy } from "./console-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "./ui";
import { useData, usePost } from "./use-api";

type Home = Awaited<ReturnType<typeof consoleHome>>;
type Organizations = Awaited<ReturnType<typeof consoleOrganizations>>;
type Organization = Awaited<ReturnType<typeof consoleOrganization>>;
type Supervision = Awaited<ReturnType<typeof consoleSupervision>>;
type Operators = Awaited<ReturnType<typeof consoleOperators>>;
type Billing = Awaited<ReturnType<typeof billingView>>;
type Keys = Awaited<ReturnType<typeof mcpKeys>>;
type Alerts = Awaited<ReturnType<typeof alertPrefView>>;
type Reports = Awaited<ReturnType<typeof reportsView>>;
type SupportList = Awaited<ReturnType<typeof consoleSupport>>;
type Countries = Awaited<ReturnType<typeof consoleCountries>>;
type SupportTicket = Awaited<ReturnType<typeof consoleTicket>>;
type Tab = "home" | "organizations" | "billing" | "support" | "supervision" | "countries" | "operators" | "assistant";
type AssistantState = Awaited<ReturnType<typeof assistantView>>;
type Turn = AssistantTurn;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));

/** Console, step 1 (05/11/2026): the operator's console, outside every organisation. */
export function Console({ locale }: { locale: Locale }) {
  const t = consoleCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, denied } = useData<Home>("/api/console", failure);
  const [tab, setTab] = useState<Tab>("home");
  const [organization, setOrganization] = useState<string | null>(null);
  const when = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date(iso));
  if (denied) return <main id="main" className="access console"><EmptyState title={t.denied} /></main>;
  const open = (id: string) => {
    setOrganization(id);
    setTab("organizations");
  };
  return (
    <main id="main" className="access console">
      <PageHeader title={t.title} subtitle={data ? fill(t.signedAs, { name: data.operator.name, role: t.roles[data.operator.role] }) : t.intro} />
      {error && <p role="alert">{error}</p>}
      <Tabs
        label={t.title}
        items={(["home", "organizations", "billing", "support", "supervision", "countries", "operators", "assistant"] as Tab[]).map((id) => ({ id, label: t.tabs[id] }))}
        value={tab}
        onChange={(id) => {
          setTab(id as Tab);
          if (id !== "organizations") setOrganization(null);
        }}
        panelId="console-panel"
        idPrefix="console-tab"
      />
      <div id="console-panel" role="tabpanel" aria-labelledby={`console-tab-${tab}`}>
        {tab === "home" && data && <HomeView locale={locale} data={data} open={open} when={when} />}
        {tab === "organizations" && (organization ? <OrganizationView locale={locale} id={organization} back={() => setOrganization(null)} day={day} when={when} /> : <OrganizationsView locale={locale} open={open} day={day} />)}
        {tab === "billing" && <BillingView locale={locale} day={day} open={open} />}
        {tab === "support" && <SupportView locale={locale} when={when} day={day} open={open} />}
        {tab === "supervision" && <SupervisionView locale={locale} when={when} day={day} />}
        {tab === "countries" && <CountriesView locale={locale} when={when} />}
        {tab === "operators" && <OperatorsView locale={locale} day={day} />}
        {tab === "assistant" && <AssistantView locale={locale} />}
      </div>
    </main>
  );
}

/** A tile of counts; a third element is the change over 30 days (series A), shown after the label. */
function Tile({ title, hint, lines, deltaLabel }: { title: string; hint?: string; lines: [number | string, string, (number | string | null)?][]; deltaLabel?: string }) {
  return (
    <li className="console-tile">
      <p className="stat-label">{title}</p>
      {hint && <p className="stat-hint">{hint}</p>}
      <dl className="console-lines">
        {lines.map(([value, label, delta]) => (
          <div key={label}>
            <dt className="num">{value}</dt>
            <dd>
              {label}
              {delta !== undefined && delta !== null && (
                <span className={`console-delta ${typeof delta === "number" && delta < 0 ? "down" : typeof delta === "number" && delta > 0 ? "up" : ""}`}> {typeof delta === "number" ? (delta > 0 ? "+" : "") + delta : delta} {deltaLabel}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function HomeView({ locale, data, open, when }: { locale: Locale; data: Home; open: (id: string) => void; when: (iso: string) => string }) {
  const t = consoleCopy[locale],
    k = t.tiles;
  const o = data.organizations,
    p = data.people,
    a = data.activity,
    h = data.health,
    s = data.support,
    c = data.compliance;
  // Series A: the change over 30 days, when a snapshot that old exists.
  const d = (key: string, now: number) => (data.trends[key]?.prev30 === null || data.trends[key]?.prev30 === undefined ? null : now - data.trends[key].prev30!);
  const dc = (key: string, now: number) => {
    const x = d(key, now);
    return x === null ? null : `${x > 0 ? "+" : ""}${formatCents(x, locale)}`;
  };
  const months = data.trends.clubs?.series ?? [];
  return (
    <div className="stack">
      <p className="muted small">{fill(t.generated, { time: when(data.generatedAt) })}</p>
      <ul className="console-tiles">
        <Tile title={k.organizations} hint={k.organizationsHint} deltaLabel={t.delta30} lines={[[o.clubs, k.clubs, d("clubs", o.clubs)], [o.federations, k.federations], [o.newThisMonth, k.newThisMonth]]} />
        <Tile title={k.people} deltaLabel={t.delta30} lines={[[p.accounts, k.accounts, d("accounts", p.accounts)], [p.players, k.players, d("players", p.players)], [p.coaches, k.coaches], [p.referees, k.referees], [p.licences, k.licences]]} />
        <Tile title={k.activity} deltaLabel={t.delta30} lines={[[a.active7, k.active7], [a.active30, k.active30, d("active30", a.active30)], [a.matches30, k.matches30, d("matches30", a.matches30)], [a.mails7, k.mails7], [bytes(a.storageBytes, locale), k.storage]]} />
        <Tile title={k.health} hint={h.lastMigration ? fill(k.lastMigration, { name: h.lastMigration }) : k.noMigration} lines={[[h.jobsLate, k.jobsLate], [h.jobs - h.jobsLate, k.jobsOk], [h.mailsOverdue, k.mailsOverdue], [h.mailsFailed7, k.mailsFailed]]} />
        <Tile title={k.support} lines={[[s.ticketsOpen, k.ticketsOpen], [s.ticketsWaiting24, k.ticketsWaiting24], [s.firstReplyHours === null ? "·" : s.firstReplyHours, s.firstReplyHours === null ? k.firstReplyNone : k.firstReplyHours], [s.feedbackOpen, k.feedbackOpen], [s.dataRequestsOpen, k.dataRequestsOpen], [s.dataRequestsLate, k.dataRequestsLate]]} />
        <Tile title={k.billing} hint={t.billingSoon} deltaLabel={t.delta30} lines={[[formatCents(data.billing.invoicedMonth, locale), k.invoicedMonth], [formatCents(data.billing.paidMonth, locale), k.paidMonth], [formatCents(data.billing.open, locale), k.open, dc("open", data.billing.open)], [`${formatCents(data.billing.late, locale)} (${data.billing.lateCount})`, k.late, dc("late", data.billing.late)], [data.billing.subscriptions, k.subscriptions, d("subscriptions", data.billing.subscriptions)]]} />
        <Tile title={k.compliance} lines={[[c.noPresident, k.noPresident], [c.noDpa, k.noDpa], [c.minorsWithoutGuardian, k.minorsWithoutGuardian], [c.terminationsPending, k.terminationsPending]]} />
      </ul>
      <Card title={t.trends}>
        {months.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t.month}</th>
                  <th scope="col" className="num">{k.clubs}</th>
                  <th scope="col" className="num">{k.players}</th>
                  <th scope="col" className="num">{k.active30}</th>
                  <th scope="col" className="num">{t.billing.figures.mrr}</th>
                  <th scope="col" className="num">{k.open}</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const at = (key: string) => data.trends[key]?.series.find((x) => x.month === m.month)?.value;
                  return (
                    <tr key={m.month}>
                      <th scope="row">{m.month}</th>
                      <td className="num">{m.value}</td>
                      <td className="num">{at("players") ?? ""}</td>
                      <td className="num">{at("active30") ?? ""}</td>
                      <td className="num">{at("mrr") !== undefined ? formatCents(at("mrr")!, locale) : ""}</td>
                      <td className="num">{at("open") !== undefined ? formatCents(at("open")!, locale) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t.trendsNone}</p>
        )}
      </Card>
      <Card title={t.byCountry}>
        <div className="table-scroll" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t.organizations.country}</th>
                <th scope="col" className="num">{k.federations}</th>
                <th scope="col" className="num">{k.clubs}</th>
              </tr>
            </thead>
            <tbody>
              {o.byCountry.map((r) => (
                <tr key={r.country}>
                  <td>{r.country}</td>
                  <td className="num">{r.federations}</td>
                  <td className="num">{r.clubs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={t.todo}>
        {data.todos.some((x) => x.count) ? (
          <ul className="console-todos">
            {data.todos
              .filter((x) => x.count)
              .map((x) => (
                <li key={x.key}>
                  <p>
                    <Badge tone="warning">{x.count}</Badge> {t.todoKeys[x.key as keyof typeof t.todoKeys] ?? x.key}
                  </p>
                  <p className="console-orgs">
                    {x.organizations.map((org) => (
                      <button key={org.id} type="button" className="text-button" onClick={() => open(org.id)}>
                        {org.name}
                      </button>
                    ))}
                    {x.count > x.organizations.length && <span className="muted small">{fill(t.more, { n: x.count - x.organizations.length })}</span>}
                  </p>
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">{t.todoNone}</p>
        )}
      </Card>
      <Card title={t.recentActions}>
        {data.recentActions.length ? (
          <ul className="plain-list">
            {data.recentActions.map((x) => (
              <li key={x.id}>
                {when(x.created_at)} · {t.actionKinds[x.kind] ?? x.kind} · {x.operator}
                {x.organization ? ` · ${x.organization}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.recentNone}</p>
        )}
      </Card>
    </div>
  );
}

function OrganizationsView({ locale, open, day }: { locale: Locale; open: (id: string) => void; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    o = t.organizations;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const [q, setQ] = useState(""),
    [kind, setKind] = useState(""),
    [country, setCountry] = useState("");
  const [sent, setSent] = useState(q);
  useEffect(() => {
    const h = setTimeout(() => setSent(q), 300);
    return () => clearTimeout(h);
  }, [q]);
  const url = `/api/console?view=organizations&q=${encodeURIComponent(sent)}&kind=${kind}&country=${country}`;
  const { data, error } = useData<Organizations>(url, failure);
  return (
    <div className="stack">
      {error && <p role="alert">{error}</p>}
      <div className="toolbar-filters" role="search">
        <label>
          {o.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          {o.kind}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{o.allKinds}</option>
            <option value="club">{o.club}</option>
            <option value="federation">{o.federation}</option>
          </select>
        </label>
        <label>
          {o.country}
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{o.allCountries}</option>
            {(data?.countries ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data && (
        <>
          <p className="muted small">{fill(o.count, { n: data.organizations.length })}</p>
          {data.organizations.length ? (
            <div className="table-scroll" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{o.columns.name}</th>
                    <th scope="col">{o.columns.country}</th>
                    <th scope="col">{o.columns.federation}</th>
                    <th scope="col" className="num">{o.columns.members}</th>
                    <th scope="col" className="num">{o.columns.players}</th>
                    <th scope="col" className="num">{o.columns.presidents}</th>
                    <th scope="col">{o.columns.lastActivity}</th>
                    <th scope="col">{o.columns.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.organizations.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        <button type="button" className="text-button" onClick={() => open(r.id)}>
                          {r.name}
                        </button>{" "}
                        <Badge tone={r.kind === "federation" ? "info" : "neutral"}>{r.kind === "federation" ? o.federation : o.club}</Badge>
                      </th>
                      <td>{r.country}</td>
                      <td>{r.federation ?? ""}</td>
                      <td className="num">{r.members}</td>
                      <td className="num">{r.players}</td>
                      <td className="num">{r.presidents === 0 ? <Badge tone="danger">0</Badge> : r.presidents}</td>
                      <td>{r.last_activity ? day(r.last_activity) : o.never}</td>
                      <td>{day(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={o.none} />
          )}
        </>
      )}
    </div>
  );
}

function OrganizationView({ locale, id, back, day, when }: { locale: Locale; id: string; back: () => void; day: (iso: string) => string; when: (iso: string) => string }) {
  const t = consoleCopy[locale],
    o = t.organization;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Organization>(`/api/console?view=organization&id=${id}`, failure);
  const { busy, message, post } = usePost("/api/console", reload, setError, failure);
  const bill = usePost("/api/console/billing", reload, setError, failure);
  const [note, setNote] = useState("");
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [borrowing, setBorrowing] = useState(false);
  const [borrowReason, setBorrowReason] = useState("");
  const [borrowMinutes, setBorrowMinutes] = useState(30);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const x = data.organization;
  const facts: [string, string | number][] = [
    [o.members, x.members],
    [o.players, x.players],
    [o.coaches, x.coaches],
    [o.teams, x.teams],
    ...(x.kind === "federation" ? ([[o.clubs, x.clubs]] as [string, number][]) : []),
    [o.created, day(x.created_at)],
    [o.lastActivity, x.last_activity ? when(x.last_activity) : t.organizations.never],
    [o.actions30, x.actions30],
    [o.storage, bytes(x.storage_bytes, locale)],
    [o.disabledModules, (x.disabled_modules as string[]).join(", ") || "0"],
    [o.dataRequestsOpen, x.data_requests_open],
    [o.apiKeys, x.api_keys],
    [o.mcpKeys, x.mcp_keys],
  ];
  return (
    <div className="stack">
      <p>
        <button type="button" className="text-button" onClick={back}>
          ← {o.back}
        </button>
      </p>
      <div className="console-org-head">
        <h2>{x.name}</h2>
        <p className="muted">{[x.kind === "federation" ? t.organizations.federation : t.organizations.club, x.country, x.federation].filter(Boolean).join(" · ")}</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message || bill.message}
      </p>
      <Card title={o.facts}>
        <dl className="console-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="badge-row">
          {x.suspended_at && <Badge tone="danger">{o.suspended}</Badge>}
          {x.dpa_accepted_at ? <Badge tone="success">{`${o.dpa} ${day(x.dpa_accepted_at)}`}</Badge> : x.kind === "club" ? <Badge tone="warning">{o.dpaNone}</Badge> : null}
          {x.termination_on && <Badge tone="danger">{`${o.termination} ${day(x.termination_on)}`}</Badge>}
        </p>
        {x.suspended_at && <p className="muted small">{fill(o.suspendedSince, { day: day(x.suspended_at), reason: x.suspended_reason })}</p>}
        {data.canWrite && (
          <p className="actions">
            {x.suspended_at ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void post({ action: "reinstate", organizationId: id }, o.reinstateDone)}>
                {o.reinstate}
              </Button>
            ) : (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setSuspending(true)}>
                {o.suspend}
              </Button>
            )}
          </p>
        )}
      </Card>
      <Card title={o.borrows}>
        {data.myBorrow ? (
          <p className="actions">
            <span>{fill(o.borrowOpen, { time: when(data.myBorrow.expiresAt) })}</span>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: data.myBorrow!.mandateId }) }).then((r) => {
                  if (r.ok) window.location.assign(`/${locale}`);
                });
              }}
            >
              {o.borrowGo}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "borrowEnd", id: data.myBorrow!.id }, o.borrowEnded)}>
              {o.borrowEnd}
            </Button>
          </p>
        ) : (
          data.canWrite && (
            <p className="actions">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setBorrowing(true)}>
                {o.borrow}
              </Button>
            </p>
          )
        )}
        {data.borrows.length ? (
          <ul className="plain-list">
            {data.borrows.map((b) => (
              <li key={b.id}>
                {fill(o.borrowLine, { operator: b.operator, start: when(b.started_at), reason: b.reason })} {b.active && <Badge tone="warning">{o.borrowActive}</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{o.borrowsNone}</p>
        )}
      </Card>
      {/* Series D: the first steps, the probable duplicates, the timeline. */}
      <Card title={o.onboarding} id="console-onboarding">
        <p className="muted small">{fill(o.onboardingDone, { done: data.onboarding.done, total: data.onboarding.total })}</p>
        <ul className="plain-list">
          {data.onboarding.steps.map((st) => (
            <li key={st.key}>
              <Badge tone={st.done ? "success" : "neutral"}>{st.done ? "✓" : "·"}</Badge> {o.onboardingSteps[st.key]}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={o.duplicates} id="console-duplicates">
        <p className="muted small">{o.duplicatesIntro}</p>
        {data.duplicates.count ? (
          <div className="console-plan">
            <span>
              <strong>{fill(o.duplicatesCount, { n: data.duplicates.count })}</strong>
              {data.duplicates.notified_at && <span className="muted small"> · {fill(o.duplicatesLast, { day: day(data.duplicates.notified_at) })}</span>}
            </span>
            {data.canWrite && (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "duplicatesNotify", organizationId: id }, o.duplicatesNotified)}>
                {o.duplicatesNotify}
              </Button>
            )}
          </div>
        ) : (
          <p className="muted">{o.duplicatesNone}</p>
        )}
      </Card>
      <Card title={o.timeline} id="console-timeline">
        {data.timeline.length ? (
          <ol className="plain-list">
            {data.timeline.map((e, i) => (
              <li key={i}>
                <span className="muted small">{when(e.at)}</span> · {fill(o.timelineKinds[e.kind] ?? e.kind, { label: e.label })}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{o.timelineNone}</p>
        )}
      </Card>
      {borrowing && (
        <Modal title={o.borrow} close={() => setBorrowing(false)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "borrow", organizationId: id, reason: borrowReason, minutes: borrowMinutes }, o.borrowDone).then((ok) => ok && setBorrowing(false));
            }}
          >
            <p>{o.borrowIntro}</p>
            <label>
              {o.borrowReason}
              <textarea value={borrowReason} onChange={(e) => setBorrowReason(e.target.value)} rows={3} minLength={5} maxLength={500} required />
            </label>
            <label>
              {o.borrowMinutes}
              <input type="number" min={5} max={120} value={borrowMinutes} onChange={(e) => setBorrowMinutes(Number(e.target.value) || 30)} required />
            </label>
            <p className="actions">
              <Button disabled={busy || borrowReason.trim().length < 5}>{o.borrowConfirm}</Button>
              <Button type="button" variant="secondary" onClick={() => setBorrowing(false)}>
                {t.cancel}
              </Button>
            </p>
          </form>
        </Modal>
      )}
      <Card title={o.subscription}>
        {data.subscription ? (
          <>
            <p>
              <strong>{data.subscription.plan}</strong> · {formatCents(data.subscription.amount_cents, locale)} {t.billing.periods[data.subscription.period].toLowerCase()} · {t.billing.bases[data.subscription.basis].toLowerCase()} · {o.startedOn.toLowerCase()} {day(data.subscription.started_on)}
              {data.subscription.note ? ` · ${data.subscription.note}` : ""}
            </p>
            {data.canBill && (
              <p className="actions">
                <Button type="button" variant="secondary" disabled={bill.busy} onClick={() => void bill.post({ action: "unsubscribe", id: data.subscription!.id, endedOn: new Date().toISOString().slice(0, 10) }, o.unsubscribed)}>
                  {o.unsubscribe}
                </Button>
              </p>
            )}
          </>
        ) : (
          <p className="muted">{o.subscriptionNone}</p>
        )}
        {!data.subscription && data.canBill && data.plans.length > 0 && (
          <form
            className="stack-form"
            aria-label={o.subscribe}
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void bill.post({ action: "subscribe", organizationId: id, planId: String(d.get("plan")), startedOn: String(d.get("startedOn")), note: String(d.get("note") ?? "") }, o.subscribed);
            }}
          >
            <div className="form-grid">
              <label>
                {o.plan}
                <select name="plan" required defaultValue={data.plans[0].id}>
                  {data.plans.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} · {formatCents(pl.amount_cents, locale)} {t.billing.periods[pl.period].toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {o.startedOn}
                <input name="startedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              </label>
              <label>
                {o.note}
                <input name="note" maxLength={500} />
              </label>
            </div>
            <p>
              <Button disabled={bill.busy}>{o.subscribe}</Button>
            </p>
          </form>
        )}
      </Card>
      {suspending && (
        <Modal title={o.suspend} close={() => setSuspending(false)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "suspend", organizationId: id, reason }, o.suspendDone).then((ok) => ok && setSuspending(false));
            }}
          >
            <p>{o.suspendConfirm}</p>
            <label>
              {o.suspendReason}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} minLength={5} maxLength={500} required />
            </label>
            <p className="actions">
              <Button disabled={busy || reason.trim().length < 5}>{o.suspend}</Button>
              <Button type="button" variant="secondary" onClick={() => setSuspending(false)}>
                {t.cancel}
              </Button>
            </p>
          </form>
        </Modal>
      )}
      <Card title={o.officers}>
        {data.officers.length ? (
          <ul className="plain-list">
            {data.officers.map((f, i) => (
              <li key={i}>
                {f.name} · {o.officerRoles[f.role] ?? f.role}
                {f.email ? ` · ${f.email}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{o.officersNone}</p>
        )}
      </Card>
      <Card title={o.notes}>
        {data.notes.length ? (
          <ul className="plain-list">
            {data.notes.map((n) => (
              <li key={n.id}>
                <span className="muted small">
                  {when(n.created_at)} · {n.operator}
                </span>
                <br />
                {n.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{o.notesNone}</p>
        )}
        {data.canWrite ? (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "note", organizationId: id, text: note }, o.noteSaved).then((ok) => ok && setNote(""));
            }}
          >
            <label>
              {o.noteAdd}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} required />
            </label>
            <p>
              <Button disabled={busy || !note.trim()}>{o.noteSave}</Button>
            </p>
          </form>
        ) : (
          <p className="muted small">{o.readOnly}</p>
        )}
      </Card>
      <Card title={o.interventions}>
        {data.actions.length ? (
          <ul className="plain-list">
            {data.actions.map((a) => (
              <li key={a.id}>
                {when(a.created_at)} · {t.actionKinds[a.kind] ?? a.kind} · {a.operator}
                {a.reason ? ` · ${a.reason}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{o.interventionsNone}</p>
        )}
      </Card>
    </div>
  );
}

function SupervisionView({ locale, when, day }: { locale: Locale; when: (iso: string) => string; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    s = t.supervision;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error } = useData<Supervision>("/api/console?view=supervision", failure);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  return (
    <div className="stack">
      <Card title={s.jobs}>
        <div className="table-scroll" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{s.jobColumns.job}</th>
                <th scope="col">{s.jobColumns.every}</th>
                <th scope="col">{s.jobColumns.lastRun}</th>
                <th scope="col">{s.jobColumns.lastOk}</th>
                <th scope="col">{s.jobColumns.state}</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.job}>
                  <th scope="row">{j.job}</th>
                  <td>{fill(s.minutes, { n: j.every })}</td>
                  <td>{j.lastRun ? when(j.lastRun) : s.never}</td>
                  <td>{j.lastOk ? when(j.lastOk) : s.never}</td>
                  <td>{j.late ? <Badge tone="danger">{s.late}</Badge> : <Badge tone="success">{s.ok}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={s.mails}>
        {data.mails.length ? (
          <ul className="plain-list">
            {data.mails.map((m) => (
              <li key={m.state}>
                {m.state} : {m.n}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.mailsNone}</p>
        )}
      </Card>
      <Card title={s.storage}>
        {data.storage.length ? (
          <ul className="plain-list">
            {data.storage.map((x) => (
              <li key={x.id}>
                {x.name} · {bytes(x.bytes, locale)} · {fill(s.files, { n: x.files })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.storageNone}</p>
        )}
      </Card>
      <Card title={s.migrations}>
        {data.migrations.length ? (
          <ul className="plain-list">
            {data.migrations.map((m) => (
              <li key={m.name}>
                {m.name} · {when(m.applied_at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.migrationsNone}</p>
        )}
      </Card>
      <Card title={s.feedback}>
        {data.feedback.length ? (
          <ul className="plain-list">
            {data.feedback.map((f) => (
              <li key={f.id}>
                {day(f.created_at)} · {s.feedbackKinds[f.kind] ?? f.kind} · {s.feedbackStates[f.state] ?? f.state}
                {f.issue_number ? ` · ${fill(s.issue, { n: f.issue_number })}` : ""}
                {f.organization ? ` · ${f.organization}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.feedbackNone}</p>
        )}
      </Card>
      <Card title={s.dataRequests}>
        {data.dataRequests.length ? (
          <ul className="plain-list">
            {data.dataRequests.map((d) => (
              <li key={d.id}>
                {d.organization} · {s.dataRequestKinds[d.kind] ?? d.kind} · {s.dataRequestStates[d.status] ?? d.status} · {fill(s.dueOn, { day: day(d.due_on) })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.dataRequestsNone}</p>
        )}
      </Card>
      <ReportsCard locale={locale} day={day} />
    </div>
  );
}

/** Series A: the operator's daily alert, its rules and hour, and what it would hold now. */
function AlertPrefs({ locale, day }: { locale: Locale; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    a = t.alerts;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Alerts>("/api/console/alerts", failure);
  const { busy, message, post } = usePost("/api/console/alerts", reload, setError, failure);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  return (
    <Card title={a.title} id="console-alerts">
      <p className="muted">{a.intro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <form
        key={`${data.email}-${data.hour}-${data.rules.join(",")}`}
        className="stack-form"
        aria-label={a.title}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void post({ action: "alertPref", email: d.get("email") === "on", hour: Number(d.get("hour")), rules: d.getAll("rule").map(String) }, a.saved);
        }}
      >
        <label className="check">
          <input type="checkbox" name="email" defaultChecked={data.email} /> {a.email}
        </label>
        <label>
          {a.hour}
          <input name="hour" type="number" min={0} max={23} defaultValue={data.hour} required />
        </label>
        <fieldset className="policy-group">
          <legend>{a.rules}</legend>
          {data.allRules.map((r) => (
            <label key={r} className="check">
              <input type="checkbox" name="rule" value={r} defaultChecked={data.rules.includes(r)} /> {a.ruleNames[r]}
            </label>
          ))}
        </fieldset>
        <p>
          <Button disabled={busy}>{a.save}</Button>
        </p>
      </form>
      <h3>{a.now}</h3>
      {data.now.length ? (
        <ul className="plain-list">
          {data.now.map((i) => (
            <li key={i.rule}>
              <Badge tone="warning">{i.count}</Badge> {a.ruleNames[i.rule]}
              {i.detail ? ` · ${i.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{a.nowNone}</p>
      )}
      <p className="muted small">{data.last ? fill(a.last, { day: day(data.last.day) }) : a.lastNone}</p>
    </Card>
  );
}

/** Series A: the monthly reports, downloaded or generated again. */
function ReportsCard({ locale, day }: { locale: Locale; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    r = t.reports;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Reports>("/api/console/reports", failure);
  const { busy, message, post } = usePost("/api/console/reports", reload, setError, failure);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const monthLabel = (iso: string) => new Intl.DateTimeFormat(tag(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
  const missing = data.months.filter((m) => !data.reports.some((x) => x.month === m));
  return (
    <Card title={r.title} id="console-reports">
      <p className="muted">{r.intro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.reports.length ? (
        <ul className="plain-list">
          {data.reports.map((x) => (
            <li key={x.id} className="console-plan">
              <span>
                <strong>{fill(r.monthOf, { month: monthLabel(x.month) })}</strong> · {day(x.generated_at)}
                <br />
                <span className="muted small">
                  {fill(r.line, { clubs: x.summary.end.clubs ?? 0, players: x.summary.end.players ?? 0, invoiced: formatCents(x.summary.billing.invoiced, locale), collected: formatCents(x.summary.billing.collected, locale), interventions: x.summary.interventions })}
                </span>
              </span>
              <a className="button secondary sm" href={`/api/console/reports?id=${x.id}`}>
                {r.download}
                <span className="sr-only"> : {monthLabel(x.month)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{r.none}</p>
      )}
      {missing.slice(0, 3).map((m) => (
        <p key={m}>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ month: m }, r.generated)}>
            {fill(r.generate, { month: monthLabel(m) })}
          </Button>
        </p>
      ))}
    </Card>
  );
}

function OperatorsView({ locale, day }: { locale: Locale; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    o = t.operators;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Operators>("/api/console?view=operators", failure);
  const { busy, message, post } = usePost("/api/console", reload, setError, failure);
  const keys = usePost("/api/console/mcp-keys", reload, setError, failure);
  const when = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const owner = data.me.role === "owner";
  return (
    <div className="stack">
      <p className="muted">{o.intro}</p>
      {data.fromEnvironment > 0 && <p className="muted small">{fill(o.fromEnvironment, { n: data.fromEnvironment })}</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.operators.length ? (
        <div className="table-scroll" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{o.columns.name}</th>
                <th scope="col">{o.columns.email}</th>
                <th scope="col">{o.columns.role}</th>
                <th scope="col">{o.columns.since}</th>
                {owner && <th scope="col"></th>}
              </tr>
            </thead>
            <tbody>
              {data.operators.map((x) => (
                <tr key={x.user_id}>
                  <th scope="row">{x.name}</th>
                  <td>{x.email}</td>
                  <td>
                    {t.roles[x.role]} {x.revoked_at && <Badge tone="neutral">{o.revokedBadge}</Badge>}
                  </td>
                  <td>{day(x.created_at)}</td>
                  {owner && (
                    <td>
                      {!x.revoked_at && x.user_id !== data.me.userId && (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "revokeOperator", userId: x.user_id }, o.revoked)}>
                          {o.revoke}
                          <span className="sr-only"> : {x.name}</span>
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{o.none}</p>
      )}
      {owner ? (
        <form
          className="stack-form panel"
          aria-label={o.add}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget),
              form = e.currentTarget;
            void post({ action: "addOperator", email: String(d.get("email") ?? ""), role: String(d.get("role") ?? "support") }, o.saved).then((ok) => ok && form.reset());
          }}
        >
          <h3>{o.add}</h3>
          <div className="form-grid">
            <label>
              {o.email}
              <input name="email" type="email" required maxLength={200} />
            </label>
            <label>
              {o.role}
              <select name="role" defaultValue="support">
                {operatorRoles.map((r) => (
                  <option key={r} value={r}>
                    {t.roles[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            <Button disabled={busy}>{o.save}</Button>
          </p>
        </form>
      ) : (
        <p className="muted small">{o.ownerOnly}</p>
      )}
      <AlertPrefs locale={locale} day={day} />
      <McpKeys locale={locale} day={day} />
      {/* Series D: the sessions' journal and the review of the keys. */}
      <Card title={o.sessions} id="console-sessions">
        <p className="muted small">
          {fill(o.sessionsIntro, { h: data.sessionHours })}
          {owner ? ` ${o.sessionsAll}` : ""}
        </p>
        {data.sessions.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  {owner && <th scope="col">{o.sessionColumns.operator}</th>}
                  <th scope="col">{o.sessionColumns.started}</th>
                  <th scope="col">{o.sessionColumns.last}</th>
                  <th scope="col">{o.sessionColumns.ip}</th>
                  <th scope="col">{o.sessionColumns.browser}</th>
                  <th scope="col" className="num">{o.sessionColumns.calls}</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((x) => (
                  <tr key={x.session_id}>
                    {owner && <th scope="row">{x.operator}</th>}
                    <td>
                      {when(x.started_at)} <Badge tone={x.alive ? "success" : "neutral"}>{x.alive ? o.sessionAlive : o.sessionGone}</Badge>
                    </td>
                    <td>{when(x.last_console_at)}</td>
                    <td>{x.ip || "·"}</td>
                    <td>{x.user_agent || "·"}</td>
                    <td className="num">{x.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{o.sessionsNone}</p>
        )}
      </Card>
      <Card title={o.keysReview} id="console-keys-review">
        <p className="muted small">{o.keysReviewIntro}</p>
        {data.keys.length ? (
          <ul className="plain-list">
            {data.keys.map((k) => (
              <li key={k.id} className="console-plan">
                <span>
                  {fill(o.keyLine, { operator: k.operator, name: k.name, scopes: k.scopes.map((sc) => t.mcp.scopeNames[sc as keyof typeof t.mcp.scopeNames] ?? sc).join(", ") })} · {fill(t.mcp.calls, { n: k.calls })} ·{" "}
                  {k.last_used_at ? fill(t.mcp.lastUsed, { day: day(k.last_used_at) }) : t.mcp.never}{" "}
                  <Badge tone={k.review ? "warning" : "success"}>{k.review ? fill(t.mcp.review, { why: o.keyReasons[k.review] }) : o.keyOk}</Badge>
                </span>
                {owner && (
                  <Button variant="secondary" size="sm" disabled={keys.busy} onClick={() => void keys.post({ action: "revokeKey", id: k.id }, t.mcp.revoked)}>
                    {t.mcp.revoke}
                    <span className="sr-only"> : {k.operator}, {k.name}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{o.keysReviewNone}</p>
        )}
      </Card>
      <p>
        <Link href={`/${locale}`}>{t.backToApp}</Link>
      </p>
    </div>
  );
}

/** Console, step 6 (06/11/2026): an operator's keys for the MCP server, the secret shown once. */
function McpKeys({ locale, day }: { locale: Locale; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    m = t.mcp;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Keys>("/api/console/mcp-keys", failure);
  const { busy, message, post, postFor } = usePost("/api/console/mcp-keys", reload, setError, failure);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const url = typeof window === "undefined" ? data.endpoint : `${window.location.origin}${data.endpoint}`;
  return (
    <Card title={m.title} id="console-mcp">
      <p className="muted">{m.intro}</p>
      <p>
        <code>{fill(m.endpoint, { url })}</code>
      </p>
      <p className="muted small">{m.howTo}</p>
      <p className="muted small">{m.tools}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {secret && (
        <div className="panel mcp-secret" role="group" aria-label={m.secretOnce}>
          <p>
            <strong>{m.secretOnce}</strong>
          </p>
          <p>
            <code>{secret}</code>
          </p>
          <p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
              }}
            >
              {copied ? m.copied : m.copy}
            </Button>
          </p>
        </div>
      )}
      <h3>{m.keys}</h3>
      {data.keys.length ? (
        <ul className="plain-list">
          {data.keys.map((k) => (
            <li key={k.id} className="console-plan">
              <span>
                <strong>{k.name}</strong> <code>pfmop_{k.prefix}_…</code> · {k.scopes.map((sc) => m.scopeNames[sc] ?? sc).join(", ")} · {fill(m.calls, { n: k.calls })} · {k.last_used_at ? fill(m.lastUsed, { day: day(k.last_used_at) }) : m.never}{" "}
                {k.revoked_at && <Badge tone="neutral">{m.revokedBadge}</Badge>}
                {k.review && <Badge tone="warning">{fill(m.review, { why: t.operators.keyReasons[k.review] })}</Badge>}
              </span>
              {!k.revoked_at && (
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "revokeKey", id: k.id }, m.revoked)}>
                  {m.revoke}
                  <span className="sr-only"> : {k.name}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{m.keysNone}</p>
      )}
      <form
        className="stack-form"
        aria-label={m.create}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget),
            form = e.currentTarget;
          void postFor({ action: "createKey", name: String(d.get("name") ?? ""), scopes: d.getAll("scope").map(String) }, m.created).then((r) => {
            const key = (r as { key?: string } | null)?.key;
            if (key) {
              setSecret(key);
              setCopied(false);
              form.reset();
            }
          });
        }}
      >
        <label>
          {m.name}
          <input name="name" required minLength={2} maxLength={80} />
        </label>
        <fieldset className="policy-group">
          <legend>{m.scopes}</legend>
          {data.scopes.map((sc) => (
            <label key={sc} className="check">
              <input type="checkbox" name="scope" value={sc} defaultChecked={sc.endsWith(":read")} /> {m.scopeNames[sc] ?? sc}
            </label>
          ))}
        </fieldset>
        <p>
          <Button disabled={busy}>{m.create}</Button>
        </p>
      </form>
    </Card>
  );
}

/** Console, step 4 (05/11/2026): plans, subscriptions, invoices and reminders. */
function BillingView({ locale, day, open }: { locale: Locale; day: (iso: string) => string; open: (id: string) => void }) {
  const t = consoleCopy[locale],
    b = t.billing;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const { data, error, setError, reload } = useData<Billing>(`/api/console/billing?state=${state}&country=${country}`, failure);
  const { busy, message, post } = usePost("/api/console/billing", reload, setError, failure);
  const [editing, setEditing] = useState<Billing["plans"][number] | "new" | null>(null);
  const [invoicing, setInvoicing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const money = (c: number) => formatCents(c, locale);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const f = data.figures;
  const tone = { draft: "neutral", sent: "warning", paid: "success", cancelled: "neutral" } as const;
  const plan = editing === "new" ? null : editing;
  return (
    <div className="stack">
      <p className="muted">{b.intro}</p>
      <p className="muted small">{data.mollie === "live" ? b.mollieOn : data.mollie === "test" ? b.mollieTest : b.mollieOff}</p>
      {!data.canBill && <p className="muted small">{b.readOnly}</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <ul className="console-tiles">
        <Tile title={t.tiles.billing} hint={b.reminderSteps} lines={[[money(f.mrr), b.figures.mrr], [money(f.invoicedMonth), b.figures.invoicedMonth], [money(f.paidMonth), b.figures.paidMonth], [money(f.open), b.figures.open], [`${money(f.late)} (${f.lateCount})`, b.figures.late]]} />
      </ul>
      <Card title={b.plans} actions={data.canBill ? <Button type="button" icon="plus" size="sm" onClick={() => setEditing("new")}>{b.planAdd}</Button> : undefined}>
        {data.plans.length ? (
          <ul className="plain-list">
            {data.plans.map((pl) => (
              <li key={pl.id} className="console-plan">
                <span>
                  <strong>{pl.name}</strong> <code>{pl.code}</code> · {money(pl.amount_cents)} {b.periods[pl.period].toLowerCase()} · {b.bases[pl.basis].toLowerCase()} · {fill(b.subscribers, { n: pl.subscribers })}{" "}
                  <Badge tone={pl.active ? "success" : "neutral"}>{pl.active ? b.active : b.inactive}</Badge>
                </span>
                {data.canBill && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(pl)}>
                    {b.planEdit}
                    <span className="sr-only"> : {pl.name}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{b.plansNone}</p>
        )}
      </Card>
      <Card title={b.subscriptions}>
        {data.subscriptions.length ? (
          <ul className="plain-list">
            {data.subscriptions.map((su) => (
              <li key={su.id} className="console-plan">
                <span>
                  <button type="button" className="text-button" onClick={() => open(su.organization_id)}>
                    {su.organization}
                  </button>{" "}
                  · {su.plan} · {money(su.amount_cents)} {b.periods[su.period].toLowerCase()} · {su.ended_on ? fill(b.ended, { day: day(su.ended_on) }) : su.last_invoiced_to ? fill(b.lastInvoiced, { day: day(su.last_invoiced_to) }) : b.neverInvoiced}
                </span>
                {data.canBill && !su.ended_on && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setInvoicing(invoicing === su.id ? null : su.id)} aria-expanded={invoicing === su.id}>
                    {b.invoiceFor}
                    <span className="sr-only"> : {su.organization}</span>
                  </Button>
                )}
                {invoicing === su.id && (
                  <form
                    className="stack-form console-invoice-form"
                    aria-label={b.invoiceFor}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void post({ action: "invoice", subscriptionId: su.id, periodFrom: String(d.get("from")), periodTo: String(d.get("to")), dueDays: Number(d.get("dueDays")) }, b.invoiceCreated).then((ok) => ok && setInvoicing(null));
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        {b.periodFrom}
                        <input name="from" type="date" required defaultValue={su.last_invoiced_to ? nextDay(su.last_invoiced_to) : su.started_on} />
                      </label>
                      <label>
                        {b.periodTo}
                        <input name="to" type="date" required defaultValue={data.today} />
                      </label>
                      <label>
                        {b.dueDays}
                        <input name="dueDays" type="number" min={0} max={120} defaultValue={30} required />
                      </label>
                    </div>
                    <p>
                      <Button disabled={busy}>{b.createInvoice}</Button>
                    </p>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{b.subscriptionsNone}</p>
        )}
      </Card>
      <Card title={b.invoices}>
        <div className="toolbar-filters">
          <label>
            {b.filterState}
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">{b.allStates}</option>
              {(["draft", "sent", "paid", "cancelled"] as const).map((st) => (
                <option key={st} value={st}>
                  {b.states[st]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.organizations.country}
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t.organizations.allCountries}</option>
              {[...new Set(data.subscriptions.map((x) => x.country))].sort().map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data.invoices.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{b.columns.number}</th>
                  <th scope="col">{b.columns.organization}</th>
                  <th scope="col">{b.columns.label}</th>
                  <th scope="col" className="num">{b.columns.amount}</th>
                  <th scope="col">{b.columns.issued}</th>
                  <th scope="col">{b.columns.due}</th>
                  <th scope="col">{b.columns.state}</th>
                  <th scope="col" className="num">{b.columns.reminders}</th>
                  {data.canBill && <th scope="col"></th>}
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">{i.number}</th>
                    <td>
                      <button type="button" className="text-button" onClick={() => open(i.organization_id)}>
                        {i.organization}
                      </button>
                    </td>
                    <td>{i.label}</td>
                    <td className="num">{money(i.amount_cents)}</td>
                    <td>{day(i.issued_on)}</td>
                    <td>{day(i.due_on)}</td>
                    <td>
                      <Badge tone={i.late ? "danger" : tone[i.state]}>{i.late ? b.late : b.states[i.state]}</Badge>
                      {i.paid_on && <span className="muted small"> {b.paid.toLowerCase()} {day(i.paid_on)}{i.paid_via ? ` (${b.paidVia[i.paid_via]})` : ""}</span>}
                      {i.state !== "draft" && (
                        <>
                          {" "}
                          <a className="text-button" href={`/api/console/billing?ubl=${i.id}`}>
                            {b.ubl}
                            <span className="sr-only"> : {i.number}</span>
                          </a>
                        </>
                      )}
                    </td>
                    <td className="num">{i.reminders}</td>
                    {data.canBill && (
                      <td>
                        <span className="console-row-actions">
                          {i.state === "draft" && (
                            <>
                              <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "send", id: i.id }, b.sent)}>
                                {b.send}
                                <span className="sr-only"> : {i.number}</span>
                              </Button>
                              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "cancel", id: i.id }, b.cancelled)}>
                                {b.cancel}
                                <span className="sr-only"> : {i.number}</span>
                              </Button>
                            </>
                          )}
                          {i.state === "sent" && (
                            <>
                              <Button type="button" size="sm" disabled={busy} onClick={() => setPaying(paying === i.id ? null : i.id)} aria-expanded={paying === i.id}>
                                {b.markPaid}
                                <span className="sr-only"> : {i.number}</span>
                              </Button>
                              <Button type="button" variant="secondary" size="sm" disabled={busy || i.reminders >= 3} onClick={() => void post({ action: "remind", id: i.id }, b.reminded)}>
                                {b.remind}
                                <span className="sr-only"> : {i.number}</span>
                              </Button>
                              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "cancel", id: i.id }, b.cancelled)}>
                                {b.cancel}
                                <span className="sr-only"> : {i.number}</span>
                              </Button>
                            </>
                          )}
                        </span>
                        {paying === i.id && (
                          <form
                            className="console-invoice-form"
                            aria-label={b.markPaid}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void post({ action: "paid", id: i.id, paidOn: String(new FormData(e.currentTarget).get("paidOn")) }, b.markedPaid).then((ok) => ok && setPaying(null));
                            }}
                          >
                            <label>
                              {b.paidOn}
                              <input name="paidOn" type="date" required defaultValue={data.today} />
                            </label>
                            <Button size="sm" disabled={busy}>
                              {b.markPaid}
                            </Button>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{b.invoicesNone}</p>
        )}
      </Card>
      {editing && (
        <Modal title={plan ? b.planEdit : b.planAdd} close={() => setEditing(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void post(
                {
                  action: "plan",
                  id: plan?.id ?? null,
                  code: String(d.get("code")),
                  name: String(d.get("name")),
                  amountCents: Math.round(Number(String(d.get("amount")).replace(",", ".")) * 100),
                  period: String(d.get("period")),
                  basis: String(d.get("basis")),
                  active: d.get("active") === "on",
                },
                b.saved,
              ).then((ok) => ok && setEditing(null));
            }}
          >
            <div className="form-grid">
              <label>
                {b.code}
                <input name="code" required pattern="[a-z0-9-]{2,40}" defaultValue={plan?.code ?? ""} />
              </label>
              <label>
                {b.name}
                <input name="name" required minLength={2} maxLength={120} defaultValue={plan?.name ?? ""} />
              </label>
              <label>
                {b.amount}
                <input name="amount" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={plan ? (plan.amount_cents / 100).toFixed(2) : ""} />
              </label>
              <label>
                {b.period}
                <select name="period" defaultValue={plan?.period ?? "year"}>
                  {planPeriods.map((pe) => (
                    <option key={pe} value={pe}>
                      {b.periods[pe]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {b.basis}
                <select name="basis" defaultValue={plan?.basis ?? "organization"}>
                  {planBases.map((ba) => (
                    <option key={ba} value={ba}>
                      {b.bases[ba]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input name="active" type="checkbox" defaultChecked={plan?.active ?? true} /> {b.active}
              </label>
            </div>
            <p className="actions">
              <Button disabled={busy}>{b.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t.cancel}
              </Button>
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
const nextDay = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Console, step 7 (06/11/2026): the assistant in the console; a write waits for the person's confirmation. */
function AssistantView({ locale }: { locale: Locale }) {
  const t = consoleCopy[locale],
    a = t.assistant;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<AssistantState>("/api/console/assistant", failure);
  const [messages, setMessages] = useState<Turn["messages"]>([]);
  const [pending, setPending] = useState<Turn["pending"]>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/console/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, ...body }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const turn = v as Turn;
      setMessages(turn.messages);
      setPending(turn.pending);
      await reload();
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  };
  const ask = (q: string) => {
    if (!q.trim() || pending) return;
    const next = [...messages, { role: "user" as const, content: q.trim() }];
    setMessages(next);
    setDraft("");
    void send({ messages: next });
  };
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const textOf = (m: Turn["messages"][number]) => (typeof m.content === "string" ? m.content : m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n"));
  const shown = messages.filter((m) => textOf(m).trim());
  const reads = data.tools.filter((x) => x.readOnly).map((x) => x.name),
    writes = data.tools.filter((x) => !x.readOnly).map((x) => x.name);
  return (
    <div className="stack">
      <p className="muted">{a.intro}</p>
      <p className="muted small">{a.leaves}</p>
      {!data.configured && <p role="alert">{a.off}</p>}
      <p className="muted small">
        {fill(a.model, { model: data.model })} · {fill(a.usage, { calls: data.today.calls, tokens: data.today.input_tokens + data.today.output_tokens, month: data.month.n })}
      </p>
      <p className="muted small">
        {fill(a.toolsRead, { tools: reads.join(", ") })}
        {writes.length ? ` · ${fill(a.toolsWrite, { tools: writes.join(", ") })}` : ""}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="assistant-log" role="log" aria-live="polite" aria-label={t.tabs.assistant}>
        {shown.length === 0 && (
          <div className="assistant-examples">
            <p className="muted small">{a.examples}</p>
            <ul className="plain-list">
              {a.exampleList.map((q) => (
                <li key={q}>
                  <button type="button" className="text-button" disabled={busy || !data.configured} onClick={() => ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {shown.map((m, i) => (
          <div key={i} className={`assistant-message ${m.role}`}>
            <p className="assistant-who">{m.role === "user" ? a.you : a.assistant}</p>
            <p className="assistant-text">{textOf(m)}</p>
          </div>
        ))}
        {busy && <p className="muted small">{a.thinking}</p>}
      </div>
      {pending && (
        <div className="panel assistant-pending" role="group" aria-label={a.pending}>
          <p>
            <strong>{a.pending}</strong>
          </p>
          <p>{fill(a.pendingIntro, { name: pending.name })}</p>
          {pending.afterUserText && (
            <p className="assistant-warning" role="note">
              <strong>{a.pendingUserText}</strong>
            </p>
          )}
          {pending.effect && <p>{a.pendingEffect[pending.effect]}</p>}
          {pending.details.length > 0 && (
            <p>
              {a.pendingTarget}
              {pending.details.join(" · ")}
            </p>
          )}
          <p className="muted small">{pending.description}</p>
          <pre className="assistant-args">{JSON.stringify(pending.input, null, 1)}</pre>
          <p className="actions">
            <Button type="button" disabled={busy} onClick={() => void send({ messages, decision: { toolUseId: pending.toolUseId, approve: true } })}>
              {a.approve}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void send({ messages, decision: { toolUseId: pending.toolUseId, approve: false } })}>
              {a.refuse}
            </Button>
          </p>
        </div>
      )}
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label className="sr-only" htmlFor="assistant-draft">
          {a.send}
        </label>
        <textarea id="assistant-draft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={8000} placeholder={a.placeholder} disabled={busy || !data.configured || !!pending} />
        <p className="actions">
          <Button disabled={busy || !data.configured || !!pending || !draft.trim()}>{a.send}</Button>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setMessages([]);
                setPending(null);
              }}
            >
              {a.clear}
            </Button>
          )}
        </p>
      </form>
    </div>
  );
}

/** Console, series C (06/11/2026): the support desk, the canned replies and the GDPR requests followed. */
function SupportView({ locale, when, day, open }: { locale: Locale; when: (iso: string) => string; day: (iso: string) => string; open: (id: string) => void }) {
  const t = consoleCopy[locale],
    s = t.supportDesk;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const { data, error, setError, reload } = useData<SupportList>(`/api/console/support?state=${state}&q=${encodeURIComponent(q)}`, failure);
  const { busy, message, post } = usePost("/api/console/support", reload, setError, failure);
  const [template, setTemplate] = useState<SupportList["templates"][number] | "new" | null>(null);
  if (ticket) return <TicketView locale={locale} id={ticket} back={() => { setTicket(null); void reload(); }} when={when} templates={data?.templates ?? []} open={open} />;
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const tone = { open: "warning", answered: "info", closed: "neutral" } as const;
  const tpl = template === "new" ? null : template;
  return (
    <div className="stack">
      <p className="muted">{s.intro}</p>
      {!data.canWrite && <p className="muted small">{s.readOnly}</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <p className="muted small">
        {fill(s.counts, data.counts)} · {data.firstReplyHours === null ? s.firstReplyNone : fill(s.firstReply, { h: data.firstReplyHours })}
      </p>
      <Card title={t.tabs.support}>
        <div className="toolbar-filters">
          <label>
            {s.filter}
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">{s.all}</option>
              {(["open", "answered", "closed"] as const).map((st) => (
                <option key={st} value={st}>
                  {s.states[st]}
                </option>
              ))}
            </select>
          </label>
          <input type="search" aria-label={s.search} placeholder={s.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {data.tickets.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{s.columns.subject}</th>
                  <th scope="col">{s.columns.from}</th>
                  <th scope="col">{s.columns.state}</th>
                  <th scope="col">{s.columns.priority}</th>
                  <th scope="col">{s.columns.last}</th>
                  <th scope="col">{s.columns.assigned}</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((k) => (
                  <tr key={k.id}>
                    <th scope="row">
                      <button type="button" className="text-button" onClick={() => setTicket(k.id)}>
                        {k.subject}
                        <span className="sr-only"> : {s.open}</span>
                      </button>
                      <span className="muted small"> · {s.categories[k.category]}</span>
                    </th>
                    <td>
                      {k.requester}
                      {k.organization && <span className="muted small"> · {k.organization}</span>}
                    </td>
                    <td>
                      <Badge tone={tone[k.state]}>{s.states[k.state]}</Badge>
                    </td>
                    <td>{s.priorities[k.priority]}</td>
                    <td>{when(k.last_message_at)}</td>
                    <td>{k.assigned ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{s.none}</p>
        )}
      </Card>
      <Card title={s.privacy} id="console-privacy">
        <p className="muted small">{s.privacyIntro}</p>
        {data.privacy.length ? (
          <ul className="plain-list">
            {data.privacy.map((d) => (
              <li key={d.id} className="console-plan">
                <span>
                  <button type="button" className="text-button" onClick={() => open(d.organization_id)}>
                    {d.organization}
                  </button>{" "}
                  · {t.supervision.dataRequestKinds[d.kind] ?? d.kind} · {t.supervision.dataRequestStates[d.status] ?? d.status} ·{" "}
                  <Badge tone={d.days_left < 0 ? "danger" : d.days_left <= 7 ? "warning" : "neutral"}>{d.days_left < 0 ? fill(s.overdue, { n: -d.days_left }) : d.days_left === 0 ? s.dueToday : fill(s.daysLeft, { n: d.days_left })}</Badge>
                  {d.notices > 0 && d.last_notice && <span className="muted small"> · {fill(s.notices, { n: d.notices, day: day(d.last_notice) })}</span>}
                </span>
                {data.canWrite && (
                  <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "privacyRemind", requestId: d.id }, s.reminded)}>
                    {s.remind}
                    <span className="sr-only"> : {d.organization}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.privacyNone}</p>
        )}
        <p className="muted small">{fill(s.certificates, { n: data.certificates })}</p>
      </Card>
      <Card title={s.templates} actions={data.canWrite ? <Button type="button" icon="plus" size="sm" onClick={() => setTemplate("new")}>{s.saveTemplate}</Button> : undefined}>
        <p className="muted small">{s.templatesIntro}</p>
        {data.templates.length ? (
          <ul className="plain-list">
            {data.templates.map((x) => (
              <li key={x.id} className="console-plan">
                <span>
                  <strong>{x.name}</strong> <span className="muted small">· {x.text_fr.slice(0, 120)}</span>
                </span>
                {data.canWrite && (
                  <span className="console-row-actions">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setTemplate(x)}>
                      {t.billing.planEdit}
                      <span className="sr-only"> : {x.name}</span>
                    </Button>
                    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "archiveTemplate", id: x.id }, "")}>
                      {s.archiveTemplate}
                      <span className="sr-only"> : {x.name}</span>
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{s.templatesNone}</p>
        )}
      </Card>
      {template && (
        <Modal title={s.template} close={() => setTemplate(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({ action: "template", id: tpl?.id ?? null, name: f.get("name"), fr: f.get("fr"), nl: f.get("nl"), en: f.get("en") }, "").then((ok) => {
                if (ok) setTemplate(null);
              });
            }}
          >
            <label>
              {s.templateName}
              <input name="name" required minLength={2} maxLength={80} defaultValue={tpl?.name ?? ""} />
            </label>
            <label>
              {s.templateFr}
              <textarea name="fr" required rows={4} maxLength={4000} defaultValue={tpl?.text_fr ?? ""} />
            </label>
            <label>
              {s.templateNl}
              <textarea name="nl" rows={3} maxLength={4000} defaultValue={tpl?.text_nl ?? ""} />
            </label>
            <label>
              {s.templateEn}
              <textarea name="en" rows={3} maxLength={4000} defaultValue={tpl?.text_en ?? ""} />
            </label>
            <Button type="submit" disabled={busy}>
              {s.saveTemplate}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function TicketView({ locale, id, back, when, templates, open }: { locale: Locale; id: string; back: () => void; when: (iso: string) => string; templates: SupportList["templates"]; open: (id: string) => void }) {
  const t = consoleCopy[locale],
    s = t.supportDesk;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<SupportTicket>(`/api/console/support?ticket=${id}`, failure);
  const { busy, message, post } = usePost("/api/console/support", reload, setError, failure);
  const [text, setText] = useState("");
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const k = data.ticket;
  const tone = { open: "warning", answered: "info", closed: "neutral" } as const;
  const send = (close: boolean) => void post({ action: "reply", id: k.id, text, close }, s.told).then((ok) => { if (ok) setText(""); });
  return (
    <div className="stack">
      <Button type="button" variant="secondary" icon="back" onClick={back}>
        {s.back}
      </Button>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <Card title={k.subject}>
        <p className="muted small">
          {k.requester} &lt;{k.email}&gt;
          {k.organization_id && k.organization && (
            <>
              {" "}
              ·{" "}
              <button type="button" className="text-button" onClick={() => open(k.organization_id!)}>
                {k.organization}
              </button>
            </>
          )}{" "}
          · {s.categories[k.category]} · {when(k.created_at)} · <Badge tone={tone[k.state]}>{s.states[k.state]}</Badge> · {s.priorities[k.priority]}
          {k.assigned && ` · ${s.columns.assigned} ${k.assigned}`}
        </p>
        {data.canWrite && (
          <div className="console-row-actions">
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "assign", id: k.id, toMe: k.assigned_to !== data.me }, "")}>
              {k.assigned_to === data.me ? s.unassign : s.assignMe}
            </Button>
            <label>
              {s.columns.priority}
              <select value={k.priority} disabled={busy} onChange={(e) => void post({ action: "priority", id: k.id, priority: e.target.value }, "")}>
                {(["low", "normal", "high"] as const).map((p) => (
                  <option key={p} value={p}>
                    {s.priorities[p]}
                  </option>
                ))}
              </select>
            </label>
            {k.state === "closed" ? (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "reopen", id: k.id }, "")}>
                {s.reopen}
              </Button>
            ) : (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "close", id: k.id }, s.told)}>
                {s.close}
              </Button>
            )}
          </div>
        )}
        <h3>{s.thread}</h3>
        <div className="assistant-log" role="log" aria-label={s.thread}>
          {data.messages.map((m) => (
            <div key={m.id} className={`assistant-message ${m.by_operator ? "" : "user"}`}>
              <div className="assistant-who">
                {m.by_operator ? `${s.operator} · ${m.author}` : m.author} · {when(m.created_at)}
              </div>
              <div className="assistant-text">{m.text}</div>
            </div>
          ))}
        </div>
        {data.canWrite && (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(false);
            }}
          >
            {templates.length > 0 && (
              <label>
                {s.template}
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const x = templates.find((y) => y.id === e.target.value);
                    if (x) setText(locale === "nl" && x.text_nl ? x.text_nl : locale === "en" && x.text_en ? x.text_en : x.text_fr);
                  }}
                >
                  <option value="">{s.noTemplate}</option>
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {s.reply}
              <textarea value={text} onChange={(e) => setText(e.target.value)} required rows={5} maxLength={4000} />
            </label>
            <div className="console-row-actions">
              <Button type="submit" disabled={busy || !text.trim()}>
                {s.send}
              </Button>
              <Button type="button" variant="secondary" disabled={busy || !text.trim()} onClick={() => send(true)}>
                {s.sendClose}
              </Button>
            </div>
          </form>
        )}
        {data.log.length > 0 && (
          <>
            <h3>{s.log}</h3>
            <ul className="plain-list">
              {data.log.map((l, i) => (
                <li key={i}>
                  {when(l.created_at)} · {s.logKinds[l.kind] ?? l.kind} · {l.operator}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

/** Console, series E (06/11/2026): the countries, what lives in each, the owner's additions. */
function CountriesView({ locale, when }: { locale: Locale; when: (iso: string) => string }) {
  const t = consoleCopy[locale],
    k = t.countries;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Countries>("/api/console?view=countries", failure);
  const { busy, message, post } = usePost("/api/console", reload, setError, failure);
  const [editing, setEditing] = useState<Countries["countries"][number] | "new" | null>(null);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const name = (c: Countries["countries"][number]) => (locale === "nl" ? c.name_nl : locale === "en" ? c.name_en : c.name_fr);
  const e = editing === "new" ? null : editing;
  return (
    <div className="stack">
      <p className="muted">{k.intro}</p>
      <p className="muted small">{k.eurOnly}</p>
      {!data.canEdit && <p className="muted small">{k.ownerOnly}</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <Card title={t.tabs.countries} actions={data.canEdit ? <Button type="button" icon="plus" size="sm" onClick={() => setEditing("new")}>{k.add}</Button> : undefined}>
        {data.countries.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{k.columns.country}</th>
                  <th scope="col" className="num">{k.columns.federations}</th>
                  <th scope="col" className="num">{k.columns.clubs}</th>
                  <th scope="col" className="num">{k.columns.players}</th>
                  <th scope="col" className="num">{k.columns.policies}</th>
                  <th scope="col" className="num">{k.columns.mrr}</th>
                  <th scope="col" className="num">{k.columns.open}</th>
                  <th scope="col" className="num">{k.columns.late}</th>
                  <th scope="col">{k.columns.transfers}</th>
                  <th scope="col">{k.columns.lastActivity}</th>
                  {data.canEdit && <th scope="col"></th>}
                </tr>
              </thead>
              <tbody>
                {data.countries.map((c) => (
                  <tr key={c.code}>
                    <th scope="row">
                      {name(c)} <span className="muted small">({c.code} · {c.currency})</span>
                      {c.suspended > 0 && (
                        <>
                          {" "}
                          <Badge tone="warning">{fill(k.suspended, { n: c.suspended })}</Badge>
                        </>
                      )}
                    </th>
                    <td className="num">{c.federations}</td>
                    <td className="num">{c.clubs}</td>
                    <td className="num">{c.players}</td>
                    <td className="num">{c.policies}</td>
                    <td className="num">{formatCents(c.mrr, locale)}</td>
                    <td className="num">{formatCents(c.open, locale)}</td>
                    <td className="num">{c.late ? <Badge tone="danger">{formatCents(c.late, locale)}</Badge> : formatCents(0, locale)}</td>
                    <td>
                      {c.transfers_in} / {c.transfers_out}
                    </td>
                    <td>{c.last_activity ? when(c.last_activity) : "·"}</td>
                    {data.canEdit && (
                      <td>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(c)}>
                          {k.edit}
                          <span className="sr-only"> : {name(c)}</span>
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{k.none}</p>
        )}
      </Card>
      {editing && (
        <Modal title={e ? k.edit : k.add} close={() => setEditing(null)}>
          <form
            className="stack-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              const f = new FormData(ev.currentTarget);
              void post({ action: "country", code: f.get("code"), name_fr: f.get("name_fr"), name_nl: f.get("name_nl"), name_en: f.get("name_en"), currency: f.get("currency"), sort: Number(f.get("sort")) || 100 }, k.saved).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
          >
            <label>
              {k.code}
              <input name="code" required pattern="[A-Za-z]{2}" maxLength={2} defaultValue={e?.code ?? ""} readOnly={!!e} />
            </label>
            <label>
              {k.nameFr}
              <input name="name_fr" required minLength={2} maxLength={80} defaultValue={e?.name_fr ?? ""} />
            </label>
            <label>
              {k.nameNl}
              <input name="name_nl" required minLength={2} maxLength={80} defaultValue={e?.name_nl ?? ""} />
            </label>
            <label>
              {k.nameEn}
              <input name="name_en" required minLength={2} maxLength={80} defaultValue={e?.name_en ?? ""} />
            </label>
            <label>
              {k.currency}
              <input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue={e?.currency ?? "EUR"} />
            </label>
            <label>
              {k.sort}
              <input name="sort" type="number" min={1} max={999} defaultValue={e?.sort ?? 100} />
            </label>
            <Button type="submit" disabled={busy}>
              {k.save}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
