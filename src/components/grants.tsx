"use client";
import { AnnualReminder } from "./annual-reminder";
import { ImpactLinks } from "./impact-links";
import { SupportTabs } from "./grants-sponsors";
import { grantsSponsorsCopy } from "./grants-sponsors-copy";
import { DataGrid } from "./data-grid";
import { ContactPicker } from "./contact-picker";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { fundingView } from "@/domains/funding/service";
import { deadlineTone, grantStatuses } from "@/domains/funding/schema";
import { grantsCopy } from "./grants-copy";
import { fundingCopy } from "./funding-copy";
import { sponsorsCopy } from "./sponsors-copy";
import { Badge, Button, Card, EmptyState, ExportButton, PageHeader, StatCard, Tabs, Toolbar } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { HistoryList, TaskList, dayLabel, euro } from "./sponsors";
import { Nav, cents, dateOrNull, grantTone, useFunding } from "./funding-pages";
import { externalHref } from "@/lib/html";

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
    c = grantsCopy[locale],
    gs = grantsSponsorsCopy[locale];
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
        <PageHeader title={gs.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const own = new Set(data.own);
  const mineIds = new Set(data.tasks.filter((x) => x.grant_id && x.responsible_id && own.has(x.responsible_id)).map((x) => x.grant_id));
  const rows = data.grants.filter(
    (x) => (!status || x.status === status) && (!season || x.season_id === season) && (!funder || x.funder_id === funder) && (!mine || mineIds.has(x.id)),
  );
  const open = rows.filter((x) => ["idea", "submitted", "granted"].includes(x.status));
  // A2: the totals follow the filters: requested, granted, received (the instalments).
  const requested = rows.filter((x) => x.status !== "idea" && x.status !== "refused").reduce((n, x) => n + x.requested_cents, 0);
  const granted = rows.filter((x) => ["granted", "paid", "closed"].includes(x.status)).reduce((n, x) => n + (x.granted_cents ?? 0), 0);
  const receivedTotal = rows.reduce((n, x) => n + x.received_cents, 0);
  const openTasks = (id: string) => data.tasks.filter((k) => k.grant_id === id && k.status !== "done").length;
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
        opensOn: dateOrNull(f.get("opens")),
        startsOn: dateOrNull(f.get("starts")),
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
        title={gs.title}
        subtitle={gs.intro}
        actions={
          <>
            <Nav locale={locale} current="grants" />
            {data.can.manage && (
              <button type="button" className="button" onClick={() => setEditing("new")}>{g.new}</button>
            )}
          </>
        }
      />
      <SupportTabs locale={locale} current="grants" />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="stat-row-grid" data-cols="4">
        <StatCard label={g.open} value={String(open.length)} icon="document" tone="brand" />
        <StatCard label={gs.totalRequested} value={euro(locale, requested)} icon="funding" tone="info" />
        <StatCard label={gs.totalGranted} value={euro(locale, granted)} icon="check" tone="success" />
        <StatCard label={gs.totalReceived} value={euro(locale, receivedTotal)} icon="dues" tone="neutral" />
      </div>
      <Card title={gs.grants} id="grants" className="flush"
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
              <label htmlFor="grant-season">{gs.season}</label>
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
            {/* Wave 17 (G2): the grants shown, with their filters. */}
            <ExportButton
              locale={locale}
              organizationId={data.organization_id}
              dataset="grants"
              subject={g.title}
              period={data.seasons.find((x) => x.id === season)?.name ?? ""}
              rows={rows}
              columns={[
                { id: "grant", label: c.colGrant, value: (x) => label(x) },
                { id: "purpose", label: c.season, value: (x) => [x.purpose, x.season_name].filter(Boolean).join(" · ") },
                { id: "starts", label: gs.startsOn, type: "date", value: (x) => x.starts_on },
                { id: "ends", label: c.endsOn, type: "date", value: (x) => x.ends_on },
                { id: "opens", label: gs.colOpens, type: "date", value: (x) => x.opens_on },
                { id: "deadline", label: c.colDeadline, type: "date", value: (x) => x.deadline_on },
                { id: "call", label: gs.colCall, value: (x) => x.program_url },
                { id: "contact", label: gs.colContact, value: (x) => x.contact_name ?? "" },
                { id: "filed", label: gs.colFiled, value: (x) => (x.status === "idea" ? gs.no : gs.yes) },
                { id: "requested", label: g.totalRequested, type: "money", value: (x) => x.requested_cents / 100 },
                { id: "granted", label: g.totalGranted, type: "money", value: (x) => (x.granted_cents === null ? null : x.granted_cents / 100) },
                { id: "received", label: gs.colReceived, type: "money", value: (x) => x.received_cents / 100 },
                { id: "status", label: t.status, value: (x) => g.statuses[x.status] },
                { id: "checklist", label: c.colChecklist, value: (x) => (x.tasks_total ? `${x.tasks_done}/${x.tasks_total}` : "") },
              ]}
            />
          </Toolbar>
        }
      >
        {rows.length ? (
          <DataGrid
            locale={locale}
            label={gs.grants}
            className="grants-table"
            sortKey="grantSort"
            storageKey="pfm-grants-columns"
            rows={rows}
            rowId={(x) => x.id}
            rowName={(x) => label(x)}
            columns={[
              {
                key: "grant",
                header: gs.colGrant,
                rowHeader: true,
                hideable: false,
                sort: (x) => label(x),
                cell: (x) => (
                  <>
                    <button type="button" className="text-button name-link grant-open" onClick={() => setSheet(x.id)}>
                      {label(x)}<span className="sr-only"> · {c.open}</span>
                    </button>
                    {(x.purpose || x.season_name) && <span className="muted small grant-purpose">{[x.purpose, x.season_name].filter(Boolean).join(" · ")}</span>}
                  </>
                ),
              },
              {
                key: "period",
                header: gs.colPeriod,
                sort: (x) => x.starts_on ?? x.ends_on ?? "",
                cell: (x) => (x.starts_on || x.ends_on ? fill(gs.period, { from: x.starts_on ? day(x.starts_on) : "…", to: x.ends_on ? day(x.ends_on) : "…" }) : <span className="muted">…</span>),
              },
              { key: "opens", header: gs.colOpens, sort: (x) => x.opens_on ?? "", cell: (x) => (x.opens_on ? day(x.opens_on) : <span className="muted">…</span>) },
              {
                key: "deadline",
                header: gs.colDeadline,
                sort: (x) => x.deadline_on ?? "",
                cell: (x) => {
                  const tone = deadlineTone(x, data.today);
                  return (
                    <>
                      {x.deadline_on ? day(x.deadline_on) : <span className="muted">…</span>}
                      {tone && (
                        <Badge tone={tone}>
                          <Icon name={tone === "danger" ? "alert" : "clock"} size={14} /> {tone === "danger" ? c.passed : c.soon}
                        </Badge>
                      )}
                    </>
                  );
                },
              },
              {
                key: "call",
                header: gs.colCall,
                cell: (x) =>
                  x.program_url ? (
                    <a href={externalHref(x.program_url)} target="_blank" rel="noopener noreferrer" aria-label={fill(gs.seeCallOf, { grant: label(x) })}>
                      {gs.seeCall}
                    </a>
                  ) : (
                    <span className="muted">…</span>
                  ),
              },
              {
                key: "contact",
                header: gs.colContact,
                sort: (x) => x.contact_name ?? "",
                cell: (x) =>
                  x.contact_name ? (
                    <>
                      <Link href={`/${locale}/contacts?contact=${x.contact_id}`}>{x.contact_name}</Link>
                      {/* A4: the last exchange with this contact. */}
                      {x.contact_last_on && <span className="muted small"> · {day(x.contact_last_on)}</span>}
                    </>
                  ) : (
                    <span className="muted">…</span>
                  ),
              },
              { key: "status", header: t.status, sort: (x) => grantStatuses.indexOf(x.status), cell: (x) => <Badge tone={grantTone[x.status]} dot>{g.statuses[x.status]}</Badge> },
              { key: "filed", header: gs.colFiled, sort: (x) => Number(x.status !== "idea"), cell: (x) => (x.status === "idea" ? gs.no : gs.yes) },
              {
                key: "requested",
                header: gs.colRequested,
                className: "num",
                sort: (x) => x.requested_cents,
                cell: (x) => (x.status === "idea" ? <span className="muted">…</span> : euro(locale, x.requested_cents)),
              },
              {
                key: "received",
                header: gs.colReceived,
                className: "num",
                sort: (x) => x.received_cents,
                cell: (x) =>
                  x.status === "idea" ? (
                    <span className="muted">…</span>
                  ) : (
                    <>
                      {euro(locale, x.received_cents)}
                      {x.granted_cents !== null && <span className="muted"> / {euro(locale, x.granted_cents)}</span>}
                    </>
                  ),
              },
              {
                key: "previous",
                header: gs.colPrevious,
                cell: (x) =>
                  x.previous_id ? (
                    <button type="button" className="text-button" aria-label={fill(gs.previousOf, { grant: label(x) })} onClick={() => setSheet(x.previous_id)}>
                      {gs.previous}
                    </button>
                  ) : (
                    <span className="muted">…</span>
                  ),
              },
              {
                key: "tasks",
                header: gs.colTasks,
                hideable: false,
                sort: (x) => openTasks(x.id),
                cell: (x) => (
                  <Link className="button secondary sm" href={`/${locale}/tasks?grant=${x.id}`} aria-label={fill(gs.tasksOf, { about: label(x), n: openTasks(x.id) })}>
                    {fill(gs.tasks, { n: openTasks(x.id) })}
                  </Link>
                ),
              },
            ]}
          />
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
                {gs.opensOn}
                <input name="opens" type="date" defaultValue={v?.opens_on ?? ""} />
              </label>
              <label>
                {gs.startsOn}
                <input name="starts" type="date" defaultValue={v?.starts_on ?? ""} />
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
              {data.can.contacts && <ContactPicker locale={locale} name="contact" value={v?.contact_id ?? null} label={t.contact} none={t.noContact} />}
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
    [grantsSponsorsCopy[locale].opensOn, dayLabel(locale, grant.opens_on) || c.notSet],
    [grantsSponsorsCopy[locale].startsOn, dayLabel(locale, grant.starts_on) || c.notSet],
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
                  <a className="button secondary" href={externalHref(grant.program_url)} target="_blank" rel="noopener noreferrer">
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
            <GrantPayments locale={locale} data={data} grant={grant} busy={busy} post={post} />
            {/* H13: the impact report for the grant's period, filed with its justification. */}
            <ImpactLinks locale={locale} data={data} grant={grant} />
            {/* 9: the yearly reminder, kept when the year's file closes. */}
            <AnnualReminder locale={locale} data={data} grantId={grant.id} closed={grant.status === "closed" || grant.status === "paid"} busy={busy} post={post} />
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
          <dd>{funder.website ? <a href={externalHref(funder.website)} target="_blank" rel="noopener noreferrer">{funder.website}</a> : c.notSet}</dd>
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
                <button type="button" className="text-button name-link" onClick={() => openGrant(x.id)}>{label(x)}</button>
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
          {data.can.contacts && <ContactPicker locale={locale} name="contact" value={funder.contact_id} label={c.funderContact} none={t.noContact} />}
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

/** A2: the money received for a grant, one line per instalment. */
function GrantPayments({ locale, data, grant, busy, post }: { locale: Locale; data: View; grant: Grant; busy: boolean; post: Post }) {
  const gs = grantsSponsorsCopy[locale],
    t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const lines = data.payments.filter((x) => x.grant_id === grant.id);
  const awarded = ["granted", "paid", "closed"].includes(grant.status);
  const id = `grant-payments-${grant.id}`;
  return (
    <section aria-labelledby={id} className="grant-payments">
      <h3 id={id}>{gs.payments}</h3>
      <p className="muted small">{gs.paymentsIntro}</p>
      {lines.length ? (
        <>
          <ul className="payment-lines">
            {lines.map((x) => (
              <li key={x.id}>
                <span>{dayLabel(locale, x.received_on)}</span>
                <strong>{euro(locale, x.amount_cents)}</strong>
                {x.note && <span className="muted">{x.note}</span>}
                {data.can.manage && (
                  <button
                    type="button"
                    className="icon-button sm"
                    disabled={busy}
                    aria-label={fill(gs.removePayment, { date: dayLabel(locale, x.received_on) })}
                    title={fill(gs.removePayment, { date: dayLabel(locale, x.received_on) })}
                    onClick={() => void post({ organizationId: data.organization_id, action: "deleteGrantPayment", id: x.id }, t.deleted)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p>{fill(gs.paymentsTotal, { total: euro(locale, grant.received_cents) })}</p>
        </>
      ) : (
        <p className="muted">{gs.noPayment}</p>
      )}
      {data.can.manage &&
        (awarded ? (
          <form
            className="payment-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void post(
                {
                  organizationId: data.organization_id,
                  action: "grantPayment",
                  grantId: grant.id,
                  receivedOn: String(f.get("on") ?? ""),
                  amountCents: cents(f.get("amount")),
                  note: String(f.get("note") ?? ""),
                },
                t.saved,
              ).then((ok) => ok && form.reset());
            }}
          >
            <label>
              {gs.paymentDate}
              <input name="on" type="date" required defaultValue={data.today} />
            </label>
            <label>
              {gs.paymentAmount}
              <input name="amount" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" />
            </label>
            <label>
              {gs.paymentNote}
              <input name="note" maxLength={200} />
            </label>
            <Button size="sm" disabled={busy}>{gs.addPayment}</Button>
          </form>
        ) : (
          <p className="muted small">{gs.paymentsOnlyGranted}</p>
        ))}
    </section>
  );
}
