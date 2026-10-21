"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { fundingView, fundingTasksView, PackageRow, TaskRow } from "@/domains/funding/service";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { sponsorsCopy } from "./sponsors-copy";
import { fundingCopy } from "./funding-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Toolbar } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof fundingView>>;
type Partner = View["partners"][number];
type Post = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
export const euro = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
export const dayLabel = (locale: Locale, d: string | null) =>
  d ? new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "";
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".") || 0) * 100);

/* ---------- Packages (the "Formules" tab) ---------- */
type Draft = { key: string; id?: string; title: string; description: string; quantity: string; offsetDays: string };
let draftKey = 0;
const toDraft = (c: PackageRow["conditions"][number]): Draft => ({
  key: "c" + ++draftKey,
  id: c.id,
  title: c.title,
  description: c.description,
  quantity: c.quantity,
  offsetDays: c.offset_days === null ? "" : String(c.offset_days),
});

export function PackagesPanel({ locale, data, busy, post }: { locale: Locale; data: View; busy: boolean; post: Post }) {
  const s = sponsorsCopy[locale],
    t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const [editing, setEditing] = useState<PackageRow | "new" | null>(null);
  const [conditions, setConditions] = useState<Draft[]>([]);
  const next = data.seasons[0]?.id ?? null;
  const open = (k: PackageRow | "new") => {
    setConditions(k === "new" ? [] : k.conditions.map(toDraft));
    setEditing(k);
  };
  const move = (i: number, by: number) => {
    const list = [...conditions];
    const [x] = list.splice(i, 1);
    list.splice(i + by, 0, x);
    setConditions(list);
  };
  const change = (i: number, field: keyof Draft, value: string) => setConditions(conditions.map((c, j) => (j === i ? { ...c, [field]: value } : c)));
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = editing && editing !== "new" ? editing : undefined;
    void post(
      {
        organizationId: data.organization_id,
        action: "package",
        ...(cur ? { id: cur.id } : {}),
        seasonId: String(f.get("season") ?? "") || null,
        name: String(f.get("name") ?? ""),
        amountCents: cents(f.get("amount")),
        description: String(f.get("description") ?? ""),
        places: String(f.get("places") ?? "") ? Number(f.get("places")) : null,
        featured: f.get("featured") === "on",
        conditions: conditions
          .filter((c) => c.title.trim().length >= 2)
          .map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            title: c.title.trim(),
            description: c.description,
            quantity: c.quantity,
            offsetDays: c.offsetDays === "" ? null : Number(c.offsetDays),
          })),
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  }
  const active = data.packages.filter((k) => !k.archived),
    archived = data.packages.filter((k) => k.archived);
  const placesBadge = (k: PackageRow) => {
    if (k.places === null) return <Badge>{s.unlimited}</Badge>;
    const left = Math.max(0, k.places - k.taken);
    return <Badge tone={left === 0 ? "danger" : left === 1 ? "warning" : "success"}>{left === 0 ? s.full : left === 1 ? s.placeLeft : fill(s.placesLeft, { n: left })}</Badge>;
  };
  const card = (k: PackageRow) => (
    <li key={k.id}>
      <Card className="package-card" title={k.name} subtitle={k.season_name ?? s.noSeason} headingId={`package-${k.id}`} labelledBy={`package-${k.id}`}
        actions={k.featured ? <Badge tone="primary">{s.advice}</Badge> : undefined}>
        <p className="package-amount">{euro(locale, k.amount_cents)}</p>
        {k.description && <p className="muted">{k.description}</p>}
        <p>{placesBadge(k)}{k.archived && <Badge>{s.archived}</Badge>}</p>
        {k.conditions.length ? (
          <ul className="package-conditions">
            {k.conditions.map((c) => (
              <li key={c.id}>
                <Icon name="check" size={16} />
                <span>
                  {c.title}
                  {c.quantity && <span className="muted"> · {c.quantity}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{s.noConditions}</p>
        )}
        {data.can.manage && (
          <div className="row-actions">
            <button type="button" className="text-button" onClick={() => open(k)}>
              {t.edit}<span className="sr-only"> : {k.name}</span>
            </button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void post({ organizationId: data.organization_id, action: "duplicatePackage", id: k.id, seasonId: next }, t.saved)}>
              {s.duplicate}<span className="sr-only"> : {k.name}</span>
            </button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void post({ organizationId: data.organization_id, action: "archivePackage", id: k.id, archived: !k.archived }, t.saved)}>
              {k.archived ? s.unarchive : s.archive}<span className="sr-only"> : {k.name}</span>
            </button>
          </div>
        )}
      </Card>
    </li>
  );
  return (
    <section aria-labelledby="packages-title" className="packages">
      <div className="panel-head">
        <div>
          <h2 id="packages-title">{s.tabPackages}</h2>
          <p className="muted">{s.packagesIntro}</p>
        </div>
        {data.can.manage && (
          <div className="row-actions">
            <Button variant="secondary" disabled={busy} title={s.importHint}
              onClick={() => void post({ organizationId: data.organization_id, action: "importPackages", seasonId: next, locale }, t.saved)}>
              {s.importExample}
            </Button>
            <Button icon="plus" onClick={() => open("new")}>{s.newPackage}</Button>
          </div>
        )}
      </div>
      {data.can.manage && !data.packages.length && <p className="muted small">{s.importHint}</p>}
      {active.length ? <ul className="package-grid">{active.map(card)}</ul> : <EmptyState title={s.noPackage} icon="funding" />}
      {archived.length > 0 && (
        <details className="others-box">
          <summary>{s.archived} ({archived.length})</summary>
          <ul className="package-grid">{archived.map(card)}</ul>
        </details>
      )}
      {editing && (
        <Modal title={editing === "new" ? s.newPackage : `${s.editPackage} · ${editing.name}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <div className="form-pair">
              <label>
                {s.packageName}
                <input name="name" required minLength={2} maxLength={120} defaultValue={editing === "new" ? "" : editing.name} />
              </label>
              <label>
                {s.packageAmount}
                <input name="amount" inputMode="decimal" required defaultValue={editing === "new" ? "" : String(editing.amount_cents / 100)} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {s.season}
                <select name="season" defaultValue={editing === "new" ? (next ?? "") : (editing.season_id ?? "")}>
                  <option value="">{s.noSeason}</option>
                  {data.seasons.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {s.places}
                <input name="places" type="number" min={1} max={1000} defaultValue={editing === "new" || editing.places === null ? "" : String(editing.places)} />
              </label>
            </div>
            <label>
              {s.packageDescription}
              <textarea name="description" rows={2} maxLength={2000} defaultValue={editing === "new" ? "" : editing.description} />
            </label>
            <label className="check">
              <input type="checkbox" name="featured" defaultChecked={editing !== "new" && editing.featured} />
              {s.featured}
            </label>
            <fieldset className="condition-editor">
              <legend>{s.conditions}</legend>
              {conditions.length === 0 && <p className="muted small">{s.noConditions}</p>}
              <ol>
                {conditions.map((c, i) => (
                  <li key={c.key}>
                    <div className="form-pair">
                      <label>
                        {s.conditionTitle} {i + 1}
                        <input value={c.title} required minLength={2} maxLength={160} placeholder={s.conditionTitleHint} onChange={(e) => change(i, "title", e.target.value)} />
                      </label>
                      <label>
                        {s.quantity}
                        <input value={c.quantity} maxLength={80} placeholder={s.quantityHint} onChange={(e) => change(i, "quantity", e.target.value)} />
                      </label>
                    </div>
                    <div className="form-pair">
                      <label>
                        {s.offset}
                        <input type="number" min={0} max={730} value={c.offsetDays} onChange={(e) => change(i, "offsetDays", e.target.value)} />
                      </label>
                      <label>
                        {s.conditionDescription}
                        <input value={c.description} maxLength={1000} onChange={(e) => change(i, "description", e.target.value)} />
                      </label>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="icon-button sm" aria-label={`${s.moveUp} : ${c.title || i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <Icon name="chevronUp" size={16} />
                      </button>
                      <button type="button" className="icon-button sm" aria-label={`${s.moveDown} : ${c.title || i + 1}`} disabled={i === conditions.length - 1} onClick={() => move(i, 1)}>
                        <Icon name="chevronDown" size={16} />
                      </button>
                      <button type="button" className="text-button danger" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}>
                        {s.removeCondition}<span className="sr-only"> : {c.title || i + 1}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" className="button secondary" onClick={() => setConditions([...conditions, { key: "c" + ++draftKey, title: "", description: "", quantity: "", offsetDays: "" }])}>
                <Icon name="plus" size={16} /> {s.addCondition}
              </button>
            </fieldset>
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

/* ---------- A task line (sponsor condition or grant check-list) ---------- */
export function TaskList({
  locale,
  tasks,
  people,
  organizationId,
  partnerId,
  grantId,
  manage,
  busy,
  post,
  reload,
  setError,
  today,
}: {
  locale: Locale;
  tasks: TaskRow[];
  people: { id: string; full_name: string }[];
  organizationId: string;
  partnerId?: string;
  grantId?: string;
  manage: boolean;
  busy: boolean;
  post: Post;
  reload: () => Promise<void>;
  setError: (s: string) => void;
  today: string;
}) {
  const s = sponsorsCopy[locale],
    t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  async function upload(task: string, file: File) {
    const d = new FormData();
    d.set("file", file);
    d.set("organizationId", organizationId);
    const r = await fetch(`/api/funding/proof/${task}`, { method: "POST", body: d });
    if (!r.ok) {
      const v = await r.json().catch(() => ({}));
      setError(errors[v.error]?.[locale] ?? t.unavailable);
      return;
    }
    await reload();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = editing && editing !== "new" ? editing : undefined;
    void post(
      {
        organizationId,
        action: "task",
        ...(cur ? { id: cur.id } : {}),
        ...(partnerId ? { partnerId } : { grantId }),
        title: String(f.get("title") ?? ""),
        detail: String(f.get("detail") ?? ""),
        dueOn: String(f.get("due") ?? "") || null,
        responsibleId: String(f.get("responsible") ?? "") || null,
        proofUrl: String(f.get("proof") ?? "").trim(),
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  }
  return (
    <div className="task-list">
      {tasks.length ? (
        <ul>
          {tasks.map((x) => {
            const late = x.status === "todo" && x.due_on && x.due_on < today;
            return (
              <li key={x.id} data-status={x.status}>
                <label className="check task-check">
                  <input
                    type="checkbox"
                    checked={x.status === "done"}
                    disabled={busy}
                    onChange={(e) => void post({ organizationId, action: "taskDone", id: x.id, done: e.target.checked }, t.saved)}
                  />
                  <span className="task-title">{x.title}</span>
                </label>
                <p className="task-meta muted small">
                  {x.status === "done" ? (
                    fill(s.doneOn, { d: dayLabel(locale, x.done_on) })
                  ) : x.due_on ? (
                    <>
                      {s.dueOn} {dayLabel(locale, x.due_on)}
                      {late && (
                        <Badge tone="danger">
                          <Icon name="alert" size={14} /> {s.overdue}
                        </Badge>
                      )}
                    </>
                  ) : (
                    s.noDate
                  )}
                  {" · "}
                  {s.responsible} : {x.responsible_name ?? s.nobody}
                </p>
                {x.detail && <p className="small">{x.detail}</p>}
                {(x.proof_url || x.proofs.length > 0) && (
                  <p className="small task-proofs">
                    {s.proofs} :{" "}
                    {x.proof_url && (
                      <a href={x.proof_url} target="_blank" rel="noopener noreferrer">
                        {x.proof_url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    )}
                    {x.proofs.map((p) => (
                      <span key={p.id}>
                        {" "}
                        <a href={`/api/funding/proof/${p.id}`} target="_blank" rel="noopener">
                          {p.filename}
                        </a>
                        {manage && (
                          <button type="button" className="text-button" disabled={busy} onClick={() => void post({ organizationId, action: "removeProof", id: p.id }, t.saved)}>
                            {s.removeProof}<span className="sr-only"> : {p.filename}</span>
                          </button>
                        )}
                      </span>
                    ))}
                  </p>
                )}
                {manage && (
                  <div className="row-actions">
                    <button type="button" className="text-button" onClick={() => setEditing(x)}>
                      {s.editTask}<span className="sr-only"> : {x.title}</span>
                    </button>
                    <label className="text-button file-button">
                      {s.proofFile}<span className="sr-only"> : {x.title}</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        data-nodirty=""
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void upload(x.id, file);
                        }}
                      />
                    </label>
                    <button type="button" className="text-button danger" disabled={busy} onClick={() => void post({ organizationId, action: "deleteTask", id: x.id }, t.deleted)}>
                      {s.deleteTask}<span className="sr-only"> : {x.title}</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{s.noTasks}</p>
      )}
      {manage && (
        <button type="button" className="button secondary" onClick={() => setEditing("new")}>
          <Icon name="plus" size={16} /> {s.addTask}
        </button>
      )}
      {editing && (
        <Modal title={editing === "new" ? s.addTask : `${s.editTask} · ${editing.title}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <label>
              {s.taskTitle}
              <input name="title" required minLength={2} maxLength={200} defaultValue={editing === "new" ? "" : editing.title} />
            </label>
            <label>
              {s.taskDetail}
              <textarea name="detail" rows={2} maxLength={2000} defaultValue={editing === "new" ? "" : editing.detail} />
            </label>
            <div className="form-pair">
              <label>
                {s.dueOn}
                <input name="due" type="date" defaultValue={editing === "new" ? "" : (editing.due_on ?? "")} />
              </label>
              <label>
                {s.responsible}
                <select name="responsible" defaultValue={editing === "new" ? "" : (editing.responsible_id ?? "")}>
                  <option value="">{s.nobody}</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {s.proof}
              <input name="proof" type="url" maxLength={500} placeholder="https://" defaultValue={editing === "new" ? "" : editing.proof_url} />
            </label>
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ---------- The partner sheet (side panel) ---------- */
export function PartnerSheet({
  locale,
  data,
  partner,
  busy,
  post,
  reload,
  setError,
  close,
  edit,
}: {
  locale: Locale;
  data: View;
  partner: Partner;
  busy: boolean;
  post: Post;
  reload: () => Promise<void>;
  setError: (s: string) => void;
  close: () => void;
  edit: () => void;
}) {
  const s = sponsorsCopy[locale],
    t = fundingCopy[locale] as (typeof fundingCopy)["fr"],
    p = t.partners;
  const [copied, setCopied] = useState(false);
  const contact = data.contacts.find((c) => c.id === partner.contact_id);
  const tasks = data.tasks.filter((x) => x.partner_id === partner.id);
  const history = data.history.filter((h) => h.target_id === partner.id);
  const reportUrl = partner.report_token && typeof window !== "undefined" ? `${window.location.origin}/${locale}/partner-report/${partner.report_token}` : "";
  return (
    <Modal title={partner.name} close={close} className="player-dialog side-sheet">
      <p className="muted">
        {p.kinds[partner.kind]} · <Badge tone={partner.status === "active" ? "success" : partner.status === "prospect" ? "info" : "neutral"}>{p.statuses[partner.status]}</Badge>
      </p>
      <section aria-labelledby="sheet-details">
        <h3 id="sheet-details">{s.details}</h3>
        <dl className="sheet-facts">
          <div>
            <dt>{s.contactPerson}</dt>
            <dd>
              {partner.contact_name ? (
                <>
                  <Link href={`/${locale}/contacts?contact=${partner.contact_id}`}>{partner.contact_name}</Link>
                  {contact?.organization_name && <span className="muted"> · {contact.organization_name}</span>}
                </>
              ) : (
                s.noContactLinked
              )}
            </dd>
          </div>
          <div>
            <dt>{s.package}</dt>
            <dd>{partner.package_name ?? s.noPackageChoice}</dd>
          </div>
          <div>
            <dt>{s.amountLabel}</dt>
            <dd className="num">{euro(locale, partner.amount_cents)}</dd>
          </div>
          <div>
            <dt>{s.payment}</dt>
            <dd><PaymentBadge locale={locale} payment={partner.payment} /></dd>
          </div>
          <div>
            <dt>{s.signedOn}</dt>
            <dd>{dayLabel(locale, partner.signed_on) || s.toDefine}</dd>
          </div>
          <div>
            <dt>{s.renewalOn}</dt>
            <dd>{dayLabel(locale, partner.renewal_on) || s.toDefine}</dd>
          </div>
        </dl>
        {data.can.manage && (
          <div className="row-actions">
            <Button variant="secondary" size="sm" onClick={edit}>{t.edit}</Button>
            <Link className="button secondary sm" href={`/${locale}/funding/partners/${partner.id}/agreement`}>{s.agreement}</Link>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void post({ organizationId: data.organization_id, action: "partnerReport", partnerId: partner.id, public: !partner.report_token }, t.saved)}
            >
              {partner.report_token ? s.reportOff : s.report}
            </Button>
          </div>
        )}
        {reportUrl && (
          <p className="small">
            {s.reportLink} : <a href={reportUrl}>{reportUrl}</a>{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                void navigator.clipboard?.writeText(reportUrl).then(() => setCopied(true));
              }}
            >
              {s.copy}
            </button>
            {copied && <span role="status"> {s.copied}</span>}
          </p>
        )}
      </section>
      <section aria-labelledby="sheet-tasks">
        <h3 id="sheet-tasks">
          {s.tasks} <Badge>{fill(s.conditionsDone, { done: partner.tasks_done, total: partner.tasks_total })}</Badge>
        </h3>
        <TaskList
          locale={locale}
          tasks={tasks}
          people={data.people}
          organizationId={data.organization_id}
          partnerId={partner.id}
          manage={data.can.manage}
          busy={busy}
          post={post}
          reload={reload}
          setError={setError}
          today={data.today}
        />
      </section>
      <section aria-labelledby="sheet-history">
        <h3 id="sheet-history">{s.history}</h3>
        {history.length ? (
          <ol className="history-list">
            {history.map((h, i) => (
              <li key={i}>
                <span className="muted small">{new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(h.created_at))}</span>{" "}
                <strong>{s.historyActions[h.action] ?? h.action}</strong>
                {h.action === "partner.package" && h.details.from ? (
                  <span> · {fill(s.previousPackage, { from: String(h.details.from), season: String(h.details.season ?? ""), delivered: Number(h.details.delivered ?? 0), total: Number(h.details.total ?? 0) })}</span>
                ) : typeof h.details.title === "string" ? (
                  <span> · {h.details.title}</span>
                ) : null}
                {h.actor && <span className="muted small"> · {h.actor}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{s.noHistory}</p>
        )}
      </section>
    </Modal>
  );
}
export function PaymentBadge({ locale, payment }: { locale: Locale; payment: Partner["payment"] }) {
  const s = sponsorsCopy[locale];
  if (!payment) return <span className="muted">…</span>;
  if (payment.kind === "paid") return <Badge tone="success" dot>{fill(s.paidOn, { d: dayLabel(locale, payment.date) })}</Badge>;
  if (payment.kind === "late")
    return (
      <Badge tone="danger">
        <Icon name="alert" size={14} /> {fill(s.lateSince, { d: dayLabel(locale, payment.date) })}
      </Badge>
    );
  return <Badge tone="info" dot>{fill(s.expectedOn, { d: dayLabel(locale, payment.date) })}</Badge>;
}

/* ---------- Tasks page (/tasks): every task for money people, one's own otherwise ---------- */
type Tasks = Awaited<ReturnType<typeof fundingTasksView>>;
export function FundingTasks({ locale }: { locale: Locale }) {
  const s = sponsorsCopy[locale],
    t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<Tasks>("/api/funding/tasks", failure);
  const { busy, message, post } = usePost("/api/funding", reload, setError, failure);
  const [mine, setMine] = useState(false),
    [show, setShow] = useState<"todo" | "done">("todo");
  if (!data)
    return (
      <main id="main" className="access funding-tasks">
        <PageHeader title={s.tasksTitle} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const own = new Set(data.own);
  const rows = data.tasks.filter((x) => x.status === show && (!mine || (x.responsible_id && own.has(x.responsible_id))));
  return (
    <main id="main" className="access funding-tasks">
      <PageHeader title={s.tasksTitle} subtitle={s.tasksIntro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Card title={s.tasksTitle} labelledBy="tasks-title" headingId="tasks-title"
        actions={
          <Toolbar label={t.status}>
            <Segmented label={t.status} items={[{ id: "todo", label: s.pending }, { id: "done", label: s.tasksDone }]} value={show} onChange={(v) => setShow(v as "todo" | "done")} />
            {data.can.all && (
              <label className="check">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
                {s.tasksMine}
              </label>
            )}
          </Toolbar>
        }>
        {rows.length ? (
          <ul className="task-list task-page">
            {rows.map((x) => {
              const late = x.status === "todo" && x.due_on && x.due_on < data.today;
              const href = data.can.all ? (x.partner_id ? `/${locale}/funding/partners?partner=${x.partner_id}` : `/${locale}/funding/grants?grant=${x.grant_id}`) : null;
              return (
                <li key={x.id} data-status={x.status}>
                  <label className="check task-check">
                    <input type="checkbox" checked={x.status === "done"} disabled={busy} onChange={(e) => void post({ organizationId: data.organization_id, action: "taskDone", id: x.id, done: e.target.checked }, t.saved)} />
                    <span className="task-title">{x.title}</span>
                  </label>
                  <p className="task-meta muted small">
                    <Badge tone={x.partner_id ? "primary" : "info"}>{x.partner_id ? s.sourcePartner : s.sourceGrant}</Badge>{" "}
                    {href ? <Link href={href}>{x.file_name}</Link> : x.file_name}
                    {" · "}
                    {x.due_on ? `${s.dueOn} ${dayLabel(locale, x.due_on)}` : s.noDate}
                    {late && (
                      <Badge tone="danger">
                        <Icon name="alert" size={14} /> {s.overdue}
                      </Badge>
                    )}
                    {" · "}
                    {s.responsible} : {x.responsible_name ?? s.nobody}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="check" tone="success" title={s.tasksEmpty} />
        )}
      </Card>
    </main>
  );
}

/* ---------- Public partner report (no account) ---------- */
type Report = { club: string; organizationId: string; logoVersion: string | null; partner: string; package: string | null; season: string | null; tasks: { title: string; status: string; done_on: string | null; proof_url: string; proofs: { id: string; filename: string }[] }[] };
export function PartnerReportPage({ locale, token }: { locale: Locale; token: string }) {
  const s = sponsorsCopy[locale];
  const failure = useCallback(() => s.noReport, [s.noReport]);
  const { data, error } = useData<Report>(`/api/funding/report?t=${encodeURIComponent(token)}`, failure);
  return (
    <main id="main" className="access partner-report">
      {!data ? (
        error ? <EmptyState icon="lock" title={error} /> : <p role="status">…</p>
      ) : (
        <>
          <PageHeader eyebrow={data.club} title={s.reportTitle} subtitle={fill(s.reportIntro, { partner: data.partner }) + (data.package ? ` · ${data.package}${data.season ? ` · ${data.season}` : ""}` : "")} />
          {data.logoVersion && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="club-logo-large" src={`/api/club/logo?org=${data.organizationId}&v=${data.logoVersion}`} alt={data.club} />
          )}
          <Card title={s.conditions} labelledBy="report-tasks" headingId="report-tasks">
            <ul className="task-list">
              {data.tasks.map((x, i) => (
                <li key={i} data-status={x.status}>
                  <p>
                    <Badge tone={x.status === "done" ? "success" : "neutral"} dot>{x.status === "done" ? s.delivered : s.pending}</Badge> <strong>{x.title}</strong>
                    {x.done_on && <span className="muted small"> · {dayLabel(locale, x.done_on)}</span>}
                  </p>
                  {x.status === "done" && (x.proof_url || x.proofs.length > 0) && (
                    <p className="small">
                      {x.proof_url && (
                        <a href={x.proof_url} target="_blank" rel="noopener noreferrer">{s.seeProof}</a>
                      )}
                      {x.proofs.map((p) => (
                        <span key={p.id}>
                          {" "}
                          <a href={`/api/funding/report/proof?t=${encodeURIComponent(token)}&id=${p.id}`} target="_blank" rel="noopener">{p.filename}</a>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </main>
  );
}
