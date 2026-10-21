"use client";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { fundingView } from "@/domains/funding/service";
import { addDays, deadlineTone, grantStatuses } from "@/domains/funding/schema";
import { grantsCopy } from "./grants-copy";
import { fundingCopy } from "./funding-copy";
import { sponsorsCopy } from "./sponsors-copy";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, Tabs, Toolbar } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { HistoryList, TaskList, dayLabel, euro } from "./sponsors";
import { ContactSelect, Nav, cents, dateOrNull, grantTone, useFunding } from "./funding-pages";

type View = Awaited<ReturnType<typeof fundingView>>;
type Grant = View["grants"][number];
type Funder = View["funders"][number];
type Post = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const label = (g: Pick<Grant, "funder" | "program">) => (g.program ? `${g.funder} · ${g.program}` : g.funder);

/** What the page was opened with: a grant sheet (?grant=) or a funder (?funder=). */
export type GrantsStart = { grant?: string; funder?: string };

/**
 * Grants (wave 11, completed in wave 15, C2): one row per application with its
 * deadline, amounts, check-list and contact; a side sheet with the details,
 * the funder, the check-list, the equipment financed and the history.
 */
export function Grants({ locale, start = {} }: { locale: Locale; start?: GrantsStart }) {
  const { t, data, error, setError, reload, message, busy, post, day } = useFunding(locale);
  const g = t.grants,
    c = grantsCopy[locale];
  const [editing, setEditing] = useState<Grant | "new" | null>(null),
    [sheet, setSheet] = useState<string | null>(start.grant ?? null),
    [funderEdit, setFunderEdit] = useState<string | null>(start.funder ?? null),
    [status, setStatus] = useState(""),
    [season, setSeason] = useState(""),
    [funder, setFunder] = useState(""),
    [mine, setMine] = useState(false);
  if (!data)
    return (
      <main id="main" className="access funding-grants">
        <PageHeader title={g.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const own = new Set(data.own);
  const mineIds = new Set(data.tasks.filter((x) => x.grant_id && x.responsible_id && own.has(x.responsible_id)).map((x) => x.grant_id));
  const rows = data.grants.filter(
    (x) => (!status || x.status === status) && (!season || x.season_id === season) && (!funder || x.funder_id === funder) && (!mine || mineIds.has(x.id)),
  );
  const open = data.grants.filter((x) => ["idea", "submitted", "granted"].includes(x.status));
  const requested = open.reduce((n, x) => n + x.requested_cents, 0);
  const granted = data.grants.filter((x) => x.status === "granted" || x.status === "paid").reduce((n, x) => n + (x.granted_cents ?? 0), 0);
  const current = data.grants.find((x) => x.id === sheet) ?? null;
  const editedFunder = data.funders.find((f) => f.id === funderEdit) ?? null;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = editing && editing !== "new" ? editing : undefined;
    void post(
      {
        organizationId: data.organization_id,
        action: "grant",
        ...(cur ? { id: cur.id } : {}),
        seasonId: String(f.get("season") ?? "") || null,
        funder: String(f.get("funder") ?? "").trim(),
        program: String(f.get("program") ?? ""),
        purpose: String(f.get("purpose") ?? ""),
        requestedCents: cents(f.get("requested")),
        grantedCents: String(f.get("granted") ?? "") ? cents(f.get("granted")) : null,
        status: String(f.get("status") ?? "idea"),
        deadlineOn: dateOrNull(f.get("deadline")),
        submittedOn: dateOrNull(f.get("submitted")),
        decisionOn: dateOrNull(f.get("decision")),
        paidOn: dateOrNull(f.get("paid")),
        reportDueOn: dateOrNull(f.get("report")),
        endsOn: dateOrNull(f.get("ends")),
        recheckOn: dateOrNull(f.get("recheck")),
        programUrl: String(f.get("url") ?? "").trim(),
        conditions: String(f.get("conditions") ?? ""),
        explanation: String(f.get("explanation") ?? ""),
        contactId: String(f.get("contact") ?? "") || null,
        notes: String(f.get("notes") ?? ""),
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  };
  const v = editing && editing !== "new" ? editing : null;
  return (
    <main id="main" className="access funding-grants">
      <PageHeader
        title={g.title}
        subtitle={g.intro}
        actions={
          <>
            <Nav locale={locale} current="grants" />
            {data.can.manage && (
              <button type="button" className="button" onClick={() => setEditing("new")}>{g.new}</button>
            )}
          </>
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="stat-row-grid" data-cols="4">
        <StatCard label={g.open} value={String(open.length)} icon="document" tone="brand" />
        <StatCard label={g.totalRequested} value={euro(locale, requested)} icon="funding" tone="info" />
        <StatCard label={g.totalGranted} value={euro(locale, granted)} icon="check" tone="success" />
        <StatCard label={g.received} value={euro(locale, data.received.subsidy ?? 0)} icon="dues" tone="neutral" href={`/${locale}/funding`} />
      </div>
      <Card title={g.title} id="grants" className="flush"
        actions={
          <Toolbar>
            <div className="toolbar-field">
              <label htmlFor="grant-status">{t.status}</label>
              <select id="grant-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t.all}</option>
                {grantStatuses.map((k) => (
                  <option key={k} value={k}>{g.statuses[k]}</option>
                ))}
              </select>
            </div>
            <div className="toolbar-field">
              <label htmlFor="grant-season">{c.season}</label>
              <select id="grant-season" value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="">{c.allSeasons}</option>
                {data.seasons.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <div className="toolbar-field">
              <label htmlFor="grant-funder">{c.funder}</label>
              <select id="grant-funder" value={funder} onChange={(e) => setFunder(e.target.value)}>
                <option value="">{c.allFunders}</option>
                {data.funders.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              {c.mine}
            </label>
          </Toolbar>
        }
      >
        {rows.length ? (
          <div className="table-scroll">
            <table className="compact-table grants-table">
              <thead>
                <tr>
                  <th scope="col">{c.colGrant}</th>
                  <th scope="col">{c.colDeadline}</th>
                  <th scope="col" className="num">{c.colAmounts}</th>
                  <th scope="col">{t.status}</th>
                  <th scope="col">{c.colChecklist}</th>
                  <th scope="col">{c.colContact}</th>
                  <th scope="col">{c.colNext}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const tone = deadlineTone(x, data.today);
                  return (
                    <tr key={x.id}>
                      <th scope="row">
                        <button type="button" className="text-button grant-open" onClick={() => setSheet(x.id)}>
                          {label(x)}<span className="sr-only"> · {c.open}</span>
                        </button>
                        {(x.purpose || x.season_name) && (
                          <span className="muted small grant-purpose">{[x.purpose, x.season_name].filter(Boolean).join(" · ")}</span>
                        )}
                      </th>
                      <td>
                        {x.deadline_on ? day(x.deadline_on) : <span className="muted">…</span>}
                        {tone && (
                          <Badge tone={tone}>
                            <Icon name={tone === "danger" ? "alert" : "clock"} size={14} /> {tone === "danger" ? c.passed : c.soon}
                          </Badge>
                        )}
                      </td>
                      <td className="num">
                        {euro(locale, x.requested_cents)}
                        <span className="muted"> / {x.granted_cents === null ? "…" : euro(locale, x.granted_cents)}</span>
                      </td>
                      <td><Badge tone={grantTone[x.status]} dot>{g.statuses[x.status]}</Badge></td>
                      <td>
                        {x.tasks_total ? (
                          <span className="task-progress">
                            <span>{fill(c.progress, { done: x.tasks_done, total: x.tasks_total })}</span>
                            <progress max={x.tasks_total} value={x.tasks_done} aria-label={`${c.colChecklist} : ${label(x)}`} />
                          </span>
                        ) : (
                          <span className="muted">{c.noChecklist}</span>
                        )}
                      </td>
                      <td>
                        {x.contact_name ? <Link href={`/${locale}/contacts?contact=${x.contact_id}`}>{x.contact_name}</Link> : <span className="muted">…</span>}
                      </td>
                      <td>
                        {x.next ? (
                          <span className={x.next.date <= addDays(data.today, 14) ? "warning-ink" : undefined}>
                            {x.next.date <= addDays(data.today, 14) && <Icon name="clock" size={14} />} {g.nextKinds[x.next.kind]} · {day(x.next.date)}
                          </span>
                        ) : (
                          <span className="muted">…</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={data.grants.length ? c.noneFiltered : g.empty} icon="document" />
        )}
      </Card>
      {current && !editing && !editedFunder && (
        <GrantSheet
          key={current.id}
          locale={locale}
          data={data}
          grant={current}
          busy={busy}
          post={post}
          reload={reload}
          setError={setError}
          close={() => setSheet(null)}
          edit={() => setEditing(current)}
          editFunder={(id) => setFunderEdit(id)}
          openGrant={(id) => setSheet(id)}
        />
      )}
      {editedFunder && (
        <FunderForm locale={locale} data={data} funder={editedFunder} busy={busy} post={post} close={() => setFunderEdit(null)} />
      )}
      {editing && (
        <Modal title={editing === "new" ? g.new : `${g.editTitle} · ${editing.funder}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <div className="form-pair">
              <label>
                {c.funder}
                <input name="funder" required minLength={2} maxLength={160} list="grant-funders" defaultValue={v?.funder ?? ""} aria-describedby="grant-funder-hint" />
                <span className="muted small field-hint" id="grant-funder-hint">{c.funderPick}</span>
                <datalist id="grant-funders">
                  {data.funders.map((f) => (
                    <option key={f.id} value={f.name} />
                  ))}
                </datalist>
              </label>
              <label>
                {g.program}
                <input name="program" maxLength={160} defaultValue={v?.program ?? ""} />
              </label>
            </div>
            <label>
              {c.programUrl}
              <input name="url" type="url" maxLength={500} placeholder="https://" defaultValue={v?.program_url ?? ""} />
            </label>
            <label>
              {g.purpose}
              <textarea name="purpose" rows={2} maxLength={2000} defaultValue={v?.purpose ?? ""} />
            </label>
            <div className="form-pair">
              <label>
                {g.season}
                <select name="season" defaultValue={v?.season_id ?? ""}>
                  <option value="">{t.none}</option>
                  {data.seasons.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t.status}
                <select name="status" defaultValue={v?.status ?? "idea"}>
                  {grantStatuses.map((k) => (
                    <option key={k} value={k}>{g.statuses[k]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.requested}
                <input name="requested" inputMode="decimal" defaultValue={v ? String(v.requested_cents / 100) : ""} />
              </label>
              <label>
                {g.granted}
                <input name="granted" inputMode="decimal" defaultValue={v && v.granted_cents !== null ? String(v.granted_cents / 100) : ""} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.deadline}
                <input name="deadline" type="date" defaultValue={v?.deadline_on ?? ""} />
              </label>
              <label>
                {g.submitted}
                <input name="submitted" type="date" defaultValue={v?.submitted_on ?? ""} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.decision}
                <input name="decision" type="date" defaultValue={v?.decision_on ?? ""} />
              </label>
              <label>
                {g.paid}
                <input name="paid" type="date" defaultValue={v?.paid_on ?? ""} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.report}
                <input name="report" type="date" defaultValue={v?.report_due_on ?? ""} />
              </label>
              <label>
                {c.endsOn}
                <input name="ends" type="date" defaultValue={v?.ends_on ?? ""} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {c.recheckOn}
                <input name="recheck" type="date" defaultValue={v?.recheck_on ?? ""} aria-describedby="grant-recheck-hint" />
                <span className="muted small field-hint" id="grant-recheck-hint">{c.recheckHint}</span>
              </label>
              <ContactSelect name="contact" value={v?.contact_id ?? null} contacts={data.contacts} label={t.contact} none={t.noContact} />
            </div>
            <label>
              {c.conditions}
              <textarea name="conditions" rows={3} maxLength={4000} defaultValue={v?.conditions ?? ""} />
            </label>
            <label>
              {c.explanation}
              <textarea name="explanation" rows={3} maxLength={4000} defaultValue={v?.explanation ?? ""} />
            </label>
            <label>
              {t.notes}
              <textarea name="notes" rows={3} maxLength={4000} defaultValue={v?.notes ?? ""} />
            </label>
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
              {v && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t.confirmRemove)) return;
                    void post({ organizationId: data.organization_id, action: "deleteGrant", id: v.id }, t.deleted).then((ok) => {
                      if (!ok) return;
                      setEditing(null);
                      setSheet(null);
                    });
                  }}
                >
                  {t.remove}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

/** The side sheet of a grant: details and funder, check-list, history. */
function GrantSheet({
  locale,
  data,
  grant,
  busy,
  post,
  reload,
  setError,
  close,
  edit,
  editFunder,
  openGrant,
}: {
  locale: Locale;
  data: View;
  grant: Grant;
  busy: boolean;
  post: Post;
  reload: () => Promise<void>;
  setError: (s: string) => void;
  close: () => void;
  edit: () => void;
  editFunder: (id: string) => void;
  openGrant: (id: string) => void;
}) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const g = t.grants,
    c = grantsCopy[locale],
    s = sponsorsCopy[locale];
  const [tab, setTab] = useState<"detail" | "checklist" | "history">("detail");
  const funder = data.funders.find((f) => f.id === grant.funder_id) ?? null;
  const tasks = data.tasks.filter((x) => x.grant_id === grant.id);
  const history = data.history.filter((h) => h.target_id === grant.id || (funder && h.target_id === funder.id));
  const others = funder ? data.grants.filter((x) => x.funder_id === funder.id && x.id !== grant.id) : [];
  const previous = grant.previous_id ? data.grants.find((x) => x.id === grant.previous_id) : null;
  const facts: [string, ReactNode][] = [
    [t.status, <Badge key="s" tone={grantTone[grant.status]} dot>{g.statuses[grant.status]}</Badge>],
    [g.season, grant.season_name ?? c.notSet],
    [g.requested, euro(locale, grant.requested_cents)],
    [g.granted, grant.granted_cents === null ? c.notSet : euro(locale, grant.granted_cents)],
    [g.deadline, dayLabel(locale, grant.deadline_on) || c.notSet],
    [g.submitted, dayLabel(locale, grant.submitted_on) || c.notSet],
    [g.decision, dayLabel(locale, grant.decision_on) || c.notSet],
    [g.paid, dayLabel(locale, grant.paid_on) || c.notSet],
    [g.report, dayLabel(locale, grant.report_due_on) || c.notSet],
    [c.endsOn, dayLabel(locale, grant.ends_on) || c.notSet],
    [c.recheckOn, dayLabel(locale, grant.recheck_on) || c.notSet],
    [t.contact, grant.contact_name ? <Link key="c" href={`/${locale}/contacts?contact=${grant.contact_id}`}>{grant.contact_name}</Link> : c.notSet],
  ];
  return (
    <Modal title={label(grant)} close={close} className="player-dialog side-sheet grant-sheet">
      <Tabs
        label={c.tabsLabel}
        idPrefix="grant-tab"
        panelId="grant-panel"
        value={tab}
        onChange={(v) => setTab(v as "detail" | "checklist" | "history")}
        items={[
          { id: "detail", label: c.tabDetail },
          { id: "checklist", label: c.tabChecklist, count: grant.tasks_total },
          { id: "history", label: c.tabHistory },
        ]}
      />
      <div role="tabpanel" id="grant-panel" aria-labelledby={`grant-tab-${tab}`}>
        {tab === "detail" && (
          <>
            <section aria-labelledby="grant-facts">
              <h3 id="grant-facts">{s.details}</h3>
              {grant.purpose && <p>{grant.purpose}</p>}
              <dl className="sheet-facts">
                {facts.map(([k, val]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
              {grant.program_url && (
                <p>
                  <a href={grant.program_url} target="_blank" rel="noopener noreferrer">
                    {c.programUrl}<span className="sr-only"> ({grant.program_url})</span>
                  </a>
                </p>
              )}
              {grant.conditions && (
                <>
                  <h4>{c.conditions}</h4>
                  <p className="pre-line">{grant.conditions}</p>
                </>
              )}
              {grant.explanation && (
                <>
                  <h4>{c.explanation}</h4>
                  <p className="pre-line">{grant.explanation}</p>
                </>
              )}
              {grant.notes && <p className="pre-line muted">{grant.notes}</p>}
              <div className="row-actions">
                {data.can.manage && <Button variant="secondary" size="sm" onClick={edit}>{t.edit}</Button>}
                {previous && (
                  <Button variant="secondary" size="sm" onClick={() => openGrant(previous.id)}>{c.previous}</Button>
                )}
                {grant.next_id ? (
                  <Button variant="secondary" size="sm" onClick={() => openGrant(grant.next_id as string)}>{c.openNext}</Button>
                ) : (
                  data.can.manage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      title={c.nextYearHint}
                      onClick={() => void post({ organizationId: data.organization_id, action: "nextYear", grantId: grant.id }, c.nextYearDone)}
                    >
                      {c.nextYear}
                    </Button>
                  )
                )}
              </div>
            </section>
            {funder && <FunderFacts locale={locale} data={data} funder={funder} others={others} edit={() => editFunder(funder.id)} openGrant={openGrant} />}
            <FinancedChairs locale={locale} data={data} grant={grant} busy={busy} post={post} />
          </>
        )}
        {tab === "checklist" && (
          <section aria-labelledby="grant-checklist">
            <h3 id="grant-checklist">
              {c.tabChecklist} {grant.tasks_total > 0 && <Badge>{fill(c.progress, { done: grant.tasks_done, total: grant.tasks_total })}</Badge>}
            </h3>
            {data.can.manage && (
              <div className="checklist-template">
                <p className="muted small" id="grant-checklist-hint">{c.checklistHint}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  aria-describedby="grant-checklist-hint"
                  onClick={() => void post({ organizationId: data.organization_id, action: "grantChecklist", grantId: grant.id, locale }, c.checklistAdded)}
                >
                  {c.addChecklist}
                </Button>
              </div>
            )}
            <TaskList
              locale={locale}
              tasks={tasks}
              people={data.people}
              organizationId={data.organization_id}
              grantId={grant.id}
              manage={data.can.manage}
              busy={busy}
              post={post}
              reload={reload}
              setError={setError}
              today={data.today}
            />
          </section>
        )}
        {tab === "history" && (
          <section aria-labelledby="grant-history">
            <h3 id="grant-history">{c.tabHistory}</h3>
            <HistoryList locale={locale} items={history} labels={c.historyActions} />
          </section>
        )}
      </div>
    </Modal>
  );
}

/** The funder's details, shared by all its files. */
function FunderFacts({
  locale,
  data,
  funder,
  others,
  edit,
  openGrant,
}: {
  locale: Locale;
  data: View;
  funder: Funder;
  others: Grant[];
  edit: () => void;
  openGrant: (id: string) => void;
}) {
  const c = grantsCopy[locale];
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  return (
    <section aria-labelledby="grant-funder-title" className="funder-facts">
      <h3 id="grant-funder-title">
        {c.funderCard} · {funder.name}
      </h3>
      <dl className="sheet-facts">
        <div>
          <dt>{c.website}</dt>
          <dd>{funder.website ? <a href={funder.website} target="_blank" rel="noopener noreferrer">{funder.website}</a> : c.notSet}</dd>
        </div>
        <div>
          <dt>{c.funderEmail}</dt>
          <dd>{funder.email ? <a href={`mailto:${funder.email}`}>{funder.email}</a> : c.notSet}</dd>
        </div>
        <div>
          <dt>{c.funderPhone}</dt>
          <dd>{funder.phone ? <a href={`tel:${funder.phone.replace(/\s/g, "")}`}>{funder.phone}</a> : c.notSet}</dd>
        </div>
        <div>
          <dt>{c.funderAddress}</dt>
          <dd>{funder.address || c.notSet}</dd>
        </div>
        <div>
          <dt>{c.funderContact}</dt>
          <dd>{funder.contact_name ? <Link href={`/${locale}/contacts?contact=${funder.contact_id}`}>{funder.contact_name}</Link> : c.notSet}</dd>
        </div>
      </dl>
      {funder.notes && <p className="pre-line muted">{funder.notes}</p>}
      {others.length > 0 && (
        <>
          <h4>{c.funderFiles}</h4>
          <ul className="plain-list">
            {others.map((x) => (
              <li key={x.id}>
                <button type="button" className="text-button" onClick={() => openGrant(x.id)}>{label(x)}</button>
                <span className="muted small"> · {[x.season_name, t.grants.statuses[x.status]].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.can.manage && (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={edit}>{c.editFunder}</Button>
        </div>
      )}
    </section>
  );
}

/** Edit the funder: name and general details, its contact person. */
function FunderForm({ locale, data, funder, busy, post, close }: { locale: Locale; data: View; funder: Funder; busy: boolean; post: Post; close: () => void }) {
  const c = grantsCopy[locale];
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void post(
      {
        organizationId: data.organization_id,
        action: "funder",
        id: funder.id,
        name: String(f.get("name") ?? "").trim(),
        website: String(f.get("website") ?? "").trim(),
        email: String(f.get("email") ?? "").trim(),
        phone: String(f.get("phone") ?? "").trim(),
        address: String(f.get("address") ?? ""),
        notes: String(f.get("notes") ?? ""),
        contactId: String(f.get("contact") ?? "") || null,
      },
      t.saved,
    ).then((ok) => ok && close());
  };
  return (
    <Modal title={`${c.editFunder} · ${funder.name}`} close={close}>
      <form className="finance-form" onSubmit={submit}>
        <p className="muted small">{c.funderHint}</p>
        <label>
          {c.funderName}
          <input name="name" required minLength={2} maxLength={160} defaultValue={funder.name} />
        </label>
        <div className="form-pair">
          <label>
            {c.website}
            <input name="website" type="url" maxLength={300} placeholder="https://" defaultValue={funder.website} />
          </label>
          <label>
            {c.funderEmail}
            <input name="email" type="email" maxLength={200} defaultValue={funder.email} />
          </label>
        </div>
        <div className="form-pair">
          <label>
            {c.funderPhone}
            <input name="phone" type="tel" maxLength={40} defaultValue={funder.phone} />
          </label>
          <ContactSelect name="contact" value={funder.contact_id} contacts={data.contacts} label={c.funderContact} none={t.noContact} />
        </div>
        <label>
          {c.funderAddress}
          <input name="address" maxLength={300} defaultValue={funder.address} />
        </label>
        <label>
          {c.funderNotes}
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={funder.notes} />
        </label>
        <div className="actions">
          <button className="button" disabled={busy}>{t.save}</button>
          <button type="button" className="button secondary" onClick={close}>{t.cancel}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Chairs bought with the grant and their purchase value; the list exports to Excel. */
function FinancedChairs({ locale, data, grant, busy, post }: { locale: Locale; data: View; grant: Grant; busy: boolean; post: Post }) {
  const c = grantsCopy[locale];
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const financed = data.chairs.filter((x) => x.grant_id === grant.id);
  const total = financed.reduce((n, x) => n + (x.purchase_value_cents ?? 0), 0);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const chairs = data.chairs
      .filter((x) => f.get(`chair-${x.id}`) === "on")
      .map((x) => ({ id: x.id, purchaseValueCents: String(f.get(`value-${x.id}`) ?? "") ? cents(f.get(`value-${x.id}`)) : null }));
    void post({ organizationId: data.organization_id, action: "grantChairs", grantId: grant.id, chairs }, t.saved);
  };
  return (
    <section aria-labelledby="grant-chairs" className="grant-chairs">
      <h3 id="grant-chairs">{c.chairsTitle}</h3>
      {financed.length > 0 && <p>{fill(c.chairsCount, { n: financed.length, total: euro(locale, total) })}</p>}
      {!data.chairs.length ? (
        <p className="muted">{c.chairsNone}</p>
      ) : data.can.manage ? (
        <form onSubmit={submit} className="chairs-form" key={grant.id + financed.map((x) => x.id + x.purchase_value_cents).join()}>
          <p className="muted small">{c.chairsHint}</p>
          <ul className="plain-list">
            {data.chairs.map((x) => (
              <li key={x.id} className="chair-row">
                <label className="check">
                  <input type="checkbox" name={`chair-${x.id}`} defaultChecked={x.grant_id === grant.id} disabled={!!x.grant_id && x.grant_id !== grant.id} />
                  {x.name}
                  {(x.brand || x.model) && <span className="muted small"> · {[x.brand, x.model].filter(Boolean).join(" ")}</span>}
                </label>
                <label className="chair-value">
                  <span className="sr-only">{x.name} · </span>
                  {c.purchaseValue}
                  <input name={`value-${x.id}`} inputMode="decimal" defaultValue={x.purchase_value_cents === null ? "" : String(x.purchase_value_cents / 100)} />
                </label>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <Button size="sm" disabled={busy}>{c.saveChairs}</Button>
            {financed.length > 0 && (
              <a className="button secondary sm" href={`/api/funding/grants/${grant.id}/chairs?locale=${locale}`} download>
                <Icon name="document" size={16} /> {c.exportChairs}
              </a>
            )}
          </div>
        </form>
      ) : (
        financed.length > 0 && (
          <ul className="plain-list">
            {financed.map((x) => (
              <li key={x.id}>
                {x.name}
                {x.purchase_value_cents !== null && <span className="muted"> · {euro(locale, x.purchase_value_cents)}</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
