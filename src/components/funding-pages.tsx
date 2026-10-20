"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { fundingView } from "@/domains/funding/service";
import { grantStatuses, partnerKinds, partnerStatuses } from "@/domains/funding/schema";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { fundingCopy } from "./funding-copy";
import { shellCopy } from "./shell-copy";
import { Badge, Card, EmptyState, PageHeader, StatCard, Toolbar, type Tone } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof fundingView>>;
type Grant = View["grants"][number];
type Partner = View["partners"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const euro = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".") || 0) * 100);
const dateOrNull = (v: FormDataEntryValue | null) => (String(v ?? "") ? String(v) : null);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
/** A day n days from now (no Date.now in render: the lint rule of purity). */
const inDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function useFunding(locale: Locale) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/funding", failure);
  const { busy, message, post } = usePost("/api/funding", reload, setError, failure);
  const day = (d: string | null) =>
    d ? new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "";
  return { t, data, error, message, busy, post, day };
}
function Nav({ locale, current }: { locale: Locale; current: "grants" | "partners" }) {
  const s = shellCopy[locale];
  return (
    <>
      <Link className="button secondary" href={`/${locale}/funding`}>{s.funding}</Link>
      {current !== "grants" && <Link className="button secondary" href={`/${locale}/funding/grants`}>{s.grants}</Link>}
      {current !== "partners" && <Link className="button secondary" href={`/${locale}/funding/partners`}>{s.partners}</Link>}
      <Link className="button secondary" href={`/${locale}/contacts`}>{s.contacts}</Link>
    </>
  );
}
function ContactSelect({
  name,
  value,
  contacts,
  label,
  none,
}: {
  name: string;
  value: string | null;
  contacts: View["contacts"];
  label: string;
  none: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">{none}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}{c.organization_name ? ` · ${c.organization_name}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

const grantTone: Record<string, Tone> = { idea: "neutral", submitted: "info", granted: "success", refused: "danger", paid: "success", closed: "neutral" };
/** Grants (subsides): one row per application, the next date in front. */
export function Grants({ locale }: { locale: Locale }) {
  const { t, data, error, message, busy, post, day } = useFunding(locale);
  const g = t.grants;
  const [editing, setEditing] = useState<Grant | "new" | null>(null),
    [status, setStatus] = useState("");
  if (!data)
    return (
      <main id="main" className="access funding-grants">
        <h1>{g.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const rows = data.grants.filter((x) => !status || x.status === status);
  const open = data.grants.filter((x) => ["idea", "submitted", "granted"].includes(x.status));
  const requested = open.reduce((n, x) => n + x.requested_cents, 0);
  const granted = data.grants.filter((x) => x.status === "granted" || x.status === "paid").reduce((n, x) => n + (x.granted_cents ?? 0), 0);
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
        funder: String(f.get("funder") ?? ""),
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
        contactId: String(f.get("contact") ?? "") || null,
        notes: String(f.get("notes") ?? ""),
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  };
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
          </Toolbar>
        }
      >
        {rows.length ? (
          <div className="table-scroll">
            <table className="compact-table">
              <thead>
                <tr>
                  <th scope="col">{g.funder}</th>
                  <th scope="col">{g.purpose}</th>
                  <th scope="col" className="num">{g.requested}</th>
                  <th scope="col" className="num">{g.granted}</th>
                  <th scope="col">{g.next}</th>
                  <th scope="col">{t.status}</th>
                  <th scope="col"><span className="sr-only">{t.edit}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <th scope="row">
                      {x.funder}
                      {x.program && <span className="muted small"> · {x.program}</span>}
                      {x.contact_name && <span className="muted small"> · {x.contact_name}</span>}
                    </th>
                    <td>{x.purpose}{x.season_name && <span className="muted small"> · {x.season_name}</span>}</td>
                    <td className="num">{euro(locale, x.requested_cents)}</td>
                    <td className="num">{x.granted_cents === null ? "…" : euro(locale, x.granted_cents)}</td>
                    <td>
                      {x.next ? (
                        <>
                          {g.nextKinds[x.next.kind]} · {day(x.next.date)}
                          {x.next.date < today() && <Badge tone="danger">!</Badge>}
                        </>
                      ) : (
                        <span className="muted">…</span>
                      )}
                    </td>
                    <td><Badge tone={grantTone[x.status]} dot>{g.statuses[x.status]}</Badge></td>
                    <td className="row-actions">
                      {data.can.manage && (
                        <button type="button" className="text-button" onClick={() => setEditing(x)}>
                          {t.edit}<span className="sr-only"> : {x.funder}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={g.empty} icon="document" />
        )}
      </Card>
      {editing && (
        <Modal title={editing === "new" ? g.new : `${g.editTitle} · ${editing.funder}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <div className="form-pair">
              <label>
                {g.funder}
                <input name="funder" required minLength={2} maxLength={160} defaultValue={editing === "new" ? "" : editing.funder} />
              </label>
              <label>
                {g.program}
                <input name="program" maxLength={160} defaultValue={editing === "new" ? "" : editing.program} />
              </label>
            </div>
            <label>
              {g.purpose}
              <textarea name="purpose" rows={2} maxLength={2000} defaultValue={editing === "new" ? "" : editing.purpose} />
            </label>
            <div className="form-pair">
              <label>
                {g.season}
                <select name="season" defaultValue={editing === "new" ? "" : (editing.season_id ?? "")}>
                  <option value="">{t.none}</option>
                  {data.seasons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t.status}
                <select name="status" defaultValue={editing === "new" ? "idea" : editing.status}>
                  {grantStatuses.map((k) => (
                    <option key={k} value={k}>{g.statuses[k]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.requested}
                <input name="requested" inputMode="decimal" defaultValue={editing === "new" ? "" : String(editing.requested_cents / 100)} />
              </label>
              <label>
                {g.granted}
                <input name="granted" inputMode="decimal" defaultValue={editing === "new" || editing.granted_cents === null ? "" : String(editing.granted_cents / 100)} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.deadline}
                <input name="deadline" type="date" defaultValue={editing === "new" ? "" : (editing.deadline_on ?? "")} />
              </label>
              <label>
                {g.submitted}
                <input name="submitted" type="date" defaultValue={editing === "new" ? "" : (editing.submitted_on ?? "")} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.decision}
                <input name="decision" type="date" defaultValue={editing === "new" ? "" : (editing.decision_on ?? "")} />
              </label>
              <label>
                {g.paid}
                <input name="paid" type="date" defaultValue={editing === "new" ? "" : (editing.paid_on ?? "")} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {g.report}
                <input name="report" type="date" defaultValue={editing === "new" ? "" : (editing.report_due_on ?? "")} />
              </label>
              <ContactSelect name="contact" value={editing === "new" ? null : editing.contact_id} contacts={data.contacts} label={t.contact} none={t.noContact} />
            </div>
            <label>
              {t.notes}
              <textarea name="notes" rows={3} maxLength={4000} defaultValue={editing === "new" ? "" : editing.notes} />
            </label>
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
              {editing !== "new" && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t.confirmRemove)) return;
                    void post({ organizationId: data.organization_id, action: "deleteGrant", id: editing.id }, t.deleted).then((ok) => ok && setEditing(null));
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

const partnerTone: Record<string, Tone> = { prospect: "info", active: "success", ended: "neutral" };
/** Partners: sponsors, donors, patrons and foundations, with the next step. */
export function Partners({ locale }: { locale: Locale }) {
  const { t, data, error, message, busy, post, day } = useFunding(locale);
  const p = t.partners;
  const [editing, setEditing] = useState<Partner | "new" | null>(null),
    [status, setStatus] = useState("");
  if (!data)
    return (
      <main id="main" className="access funding-partners">
        <h1>{p.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const rows = data.partners.filter((x) => !status || x.status === status);
  const active = data.partners.filter((x) => x.status === "active");
  const soon = inDays(60);
  const renewals = active.filter((x) => x.ends_on && x.ends_on <= soon).length;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = editing && editing !== "new" ? editing : undefined;
    void post(
      {
        organizationId: data.organization_id,
        action: "partner",
        ...(cur ? { id: cur.id } : {}),
        name: String(f.get("name") ?? ""),
        kind: String(f.get("kind") ?? "sponsor"),
        status: String(f.get("status") ?? "prospect"),
        amountCents: cents(f.get("amount")),
        inKind: String(f.get("inKind") ?? ""),
        counterpart: String(f.get("counterpart") ?? ""),
        startsOn: dateOrNull(f.get("starts")),
        endsOn: dateOrNull(f.get("ends")),
        nextActionOn: dateOrNull(f.get("nextActionOn")),
        nextAction: String(f.get("nextAction") ?? ""),
        contactId: String(f.get("contact") ?? "") || null,
        notes: String(f.get("notes") ?? ""),
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  };
  return (
    <main id="main" className="access funding-partners">
      <PageHeader
        title={p.title}
        subtitle={p.intro}
        actions={
          <>
            <Nav locale={locale} current="partners" />
            {data.can.manage && (
              <button type="button" className="button" onClick={() => setEditing("new")}>{p.new}</button>
            )}
          </>
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="stat-row-grid" data-cols="4">
        <StatCard label={p.totalActive} value={String(active.length)} icon="team" tone="brand" />
        <StatCard label={p.totalAmount} value={euro(locale, active.reduce((n, x) => n + x.amount_cents, 0))} icon="funding" tone="info" />
        <StatCard label={p.received} value={euro(locale, (data.received.sponsor ?? 0) + (data.received.donation ?? 0))} icon="dues" tone="success" href={`/${locale}/funding`} />
        <StatCard label={p.renewals} value={String(renewals)} icon="alert" tone={renewals ? "warning" : "neutral"} />
      </div>
      <Card title={p.title} id="partners" className="flush"
        actions={
          <Toolbar>
            <div className="toolbar-field">
              <label htmlFor="partner-status">{t.status}</label>
              <select id="partner-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t.all}</option>
                {partnerStatuses.map((k) => (
                  <option key={k} value={k}>{p.statuses[k]}</option>
                ))}
              </select>
            </div>
          </Toolbar>
        }
      >
        {rows.length ? (
          <div className="table-scroll">
            <table className="compact-table">
              <thead>
                <tr>
                  <th scope="col">{p.name}</th>
                  <th scope="col">{p.kind}</th>
                  <th scope="col" className="num">{p.amount}</th>
                  <th scope="col">{p.counterpart}</th>
                  <th scope="col">{p.next}</th>
                  <th scope="col">{t.status}</th>
                  <th scope="col"><span className="sr-only">{t.edit}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <th scope="row">
                      {x.name}
                      {x.contact_name && <span className="muted small"> · {x.contact_name}</span>}
                    </th>
                    <td>{p.kinds[x.kind]}{x.in_kind && <span className="muted small"> · {x.in_kind}</span>}</td>
                    <td className="num">{x.amount_cents ? euro(locale, x.amount_cents) : "…"}</td>
                    <td>{x.counterpart}</td>
                    <td>
                      {x.next ? (
                        <>
                          {p.nextKinds[x.next.kind]} · {day(x.next.date)}
                          {x.next.kind === "action" && x.next_action && <span className="muted small"> · {x.next_action}</span>}
                          {x.next.date < today() && <Badge tone="danger">!</Badge>}
                        </>
                      ) : (
                        <span className="muted">…</span>
                      )}
                    </td>
                    <td><Badge tone={partnerTone[x.status]} dot>{p.statuses[x.status]}</Badge></td>
                    <td className="row-actions">
                      {data.can.manage && (
                        <button type="button" className="text-button" onClick={() => setEditing(x)}>
                          {t.edit}<span className="sr-only"> : {x.name}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={p.empty} icon="team" />
        )}
      </Card>
      {editing && (
        <Modal title={editing === "new" ? p.new : `${p.editTitle} · ${editing.name}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <div className="form-pair">
              <label>
                {p.name}
                <input name="name" required minLength={2} maxLength={160} defaultValue={editing === "new" ? "" : editing.name} />
              </label>
              <label>
                {p.kind}
                <select name="kind" defaultValue={editing === "new" ? "sponsor" : editing.kind}>
                  {partnerKinds.map((k) => (
                    <option key={k} value={k}>{p.kinds[k]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                {t.status}
                <select name="status" defaultValue={editing === "new" ? "prospect" : editing.status}>
                  {partnerStatuses.map((k) => (
                    <option key={k} value={k}>{p.statuses[k]}</option>
                  ))}
                </select>
              </label>
              <label>
                {p.amount}
                <input name="amount" inputMode="decimal" defaultValue={editing === "new" ? "" : String(editing.amount_cents / 100)} />
              </label>
            </div>
            <label>
              {p.inKind}
              <input name="inKind" maxLength={400} defaultValue={editing === "new" ? "" : editing.in_kind} />
            </label>
            <label>
              {p.counterpart}
              <input name="counterpart" maxLength={400} defaultValue={editing === "new" ? "" : editing.counterpart} />
            </label>
            <div className="form-pair">
              <label>
                {p.starts}
                <input name="starts" type="date" defaultValue={editing === "new" ? "" : (editing.starts_on ?? "")} />
              </label>
              <label>
                {p.ends}
                <input name="ends" type="date" defaultValue={editing === "new" ? "" : (editing.ends_on ?? "")} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {p.nextActionOn}
                <input name="nextActionOn" type="date" defaultValue={editing === "new" ? "" : (editing.next_action_on ?? "")} />
              </label>
              <label>
                {p.nextAction}
                <input name="nextAction" maxLength={200} defaultValue={editing === "new" ? "" : editing.next_action} />
              </label>
            </div>
            <ContactSelect name="contact" value={editing === "new" ? null : editing.contact_id} contacts={data.contacts} label={t.contact} none={t.noContact} />
            <label>
              {t.notes}
              <textarea name="notes" rows={3} maxLength={4000} defaultValue={editing === "new" ? "" : editing.notes} />
            </label>
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
              {editing !== "new" && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t.confirmRemove)) return;
                    void post({ organizationId: data.organization_id, action: "deletePartner", id: editing.id }, t.deleted).then((ok) => ok && setEditing(null));
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
