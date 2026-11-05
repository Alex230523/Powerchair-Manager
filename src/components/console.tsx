"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { consoleHome, consoleOperators, consoleOrganization, consoleOrganizations, consoleSupervision } from "@/domains/console/service";
import { operatorRoles } from "@/domains/console/schema";
import { formatBytes } from "@/domains/storage/summary";
import { consoleCopy } from "./console-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "./ui";
import { useData, usePost } from "./use-api";

type Home = Awaited<ReturnType<typeof consoleHome>>;
type Organizations = Awaited<ReturnType<typeof consoleOrganizations>>;
type Organization = Awaited<ReturnType<typeof consoleOrganization>>;
type Supervision = Awaited<ReturnType<typeof consoleSupervision>>;
type Operators = Awaited<ReturnType<typeof consoleOperators>>;
type Tab = "home" | "organizations" | "supervision" | "operators";
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
        items={(["home", "organizations", "supervision", "operators"] as Tab[]).map((id) => ({ id, label: t.tabs[id] }))}
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
        {tab === "supervision" && <SupervisionView locale={locale} when={when} day={day} />}
        {tab === "operators" && <OperatorsView locale={locale} day={day} />}
      </div>
    </main>
  );
}

function Tile({ title, hint, lines }: { title: string; hint?: string; lines: [number | string, string][] }) {
  return (
    <li className="console-tile">
      <p className="stat-label">{title}</p>
      {hint && <p className="stat-hint">{hint}</p>}
      <dl className="console-lines">
        {lines.map(([value, label]) => (
          <div key={label}>
            <dt className="num">{value}</dt>
            <dd>{label}</dd>
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
  return (
    <div className="stack">
      <p className="muted small">{fill(t.generated, { time: when(data.generatedAt) })}</p>
      <ul className="console-tiles">
        <Tile title={k.organizations} hint={k.organizationsHint} lines={[[o.clubs, k.clubs], [o.federations, k.federations], [o.newThisMonth, k.newThisMonth]]} />
        <Tile title={k.people} lines={[[p.accounts, k.accounts], [p.players, k.players], [p.coaches, k.coaches], [p.referees, k.referees], [p.licences, k.licences]]} />
        <Tile title={k.activity} lines={[[a.active7, k.active7], [a.active30, k.active30], [a.matches30, k.matches30], [a.mails7, k.mails7], [formatBytes(a.storageBytes, locale), k.storage]]} />
        <Tile title={k.health} hint={h.lastMigration ? fill(k.lastMigration, { name: h.lastMigration }) : k.noMigration} lines={[[h.jobsLate, k.jobsLate], [h.jobs - h.jobsLate, k.jobsOk], [h.mailsOverdue, k.mailsOverdue], [h.mailsFailed7, k.mailsFailed]]} />
        <Tile title={k.support} lines={[[s.feedbackOpen, k.feedbackOpen], [s.feedbackWeek, k.feedbackWeek], [s.dataRequestsOpen, k.dataRequestsOpen], [s.dataRequestsLate, k.dataRequestsLate]]} />
        <Tile title={k.compliance} lines={[[c.noPresident, k.noPresident], [c.noDpa, k.noDpa], [c.minorsWithoutGuardian, k.minorsWithoutGuardian], [c.terminationsPending, k.terminationsPending]]} />
      </ul>
      <p className="muted small">{t.billingSoon}</p>
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
  const [note, setNote] = useState("");
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
    [o.storage, formatBytes(x.storage_bytes, locale)],
    [o.disabledModules, (x.disabled_modules as string[]).join(", ") || "0"],
    [o.dataRequestsOpen, x.data_requests_open],
    [o.apiKeys, x.api_keys],
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
        {message}
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
          {x.dpa_accepted_at ? <Badge tone="success">{`${o.dpa} ${day(x.dpa_accepted_at)}`}</Badge> : x.kind === "club" ? <Badge tone="warning">{o.dpaNone}</Badge> : null}
          {x.termination_on && <Badge tone="danger">{`${o.termination} ${day(x.termination_on)}`}</Badge>}
        </p>
      </Card>
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
                {x.name} · {formatBytes(x.bytes, locale)} · {fill(s.files, { n: x.files })}
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
    </div>
  );
}

function OperatorsView({ locale, day }: { locale: Locale; day: (iso: string) => string }) {
  const t = consoleCopy[locale],
    o = t.operators;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Operators>("/api/console?view=operators", failure);
  const { busy, message, post } = usePost("/api/console", reload, setError, failure);
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
      <p>
        <Link href={`/${locale}`}>{t.backToApp}</Link>
      </p>
    </div>
  );
}
