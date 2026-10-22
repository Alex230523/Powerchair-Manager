"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { fundingView } from "@/domains/funding/service";
import { addDays, partnerKinds, partnerStatuses } from "@/domains/funding/schema";
import { Icon } from "./icons";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { fundingCopy } from "./funding-copy";
import { shellCopy } from "./shell-copy";
import { Badge, Card, EmptyState, ExportButton, PageHeader, StatCard, Tabs, Toolbar, type Tone } from "./ui";
import { FinanceNav } from "./finance-nav";
import { Modal } from "./modal";
import { sponsorsCopy } from "./sponsors-copy";
import { PackagesPanel, PartnerSheet, PaymentBadge } from "./sponsors";
import { proposedRenewal } from "@/domains/funding/schema";

type View = Awaited<ReturnType<typeof fundingView>>;
type Grant = View["grants"][number];
type Partner = View["partners"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const euro = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
export const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".") || 0) * 100);
export const dateOrNull = (v: FormDataEntryValue | null) => (String(v ?? "") ? String(v) : null);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
/** A day n days from now (no Date.now in render: the lint rule of purity). */
const inDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function useFunding(locale: Locale) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const full = sponsorsCopy[locale].packageFull;
  const failure = useCallback((code: string) => (code === "PACKAGE_FULL" ? full : (errors[code]?.[locale] ?? t.unavailable)), [locale, t.unavailable, full]);
  const { data, error, setError, reload } = useData<View>("/api/funding", failure);
  const { busy, message, post } = usePost("/api/funding", reload, setError, failure);
  const day = (d: string | null) =>
    d ? new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "";
  return { t, data, error, setError, reload, message, busy, post, day };
}
/** Wave 17 (N1): the finance tabs replace the links to the other money pages; the contacts book stays at hand. */
export function Nav({ locale }: { locale: Locale; current: "grants" | "partners" }) {
  const s = shellCopy[locale];
  return <Link className="button secondary" href={`/${locale}/contacts`}>{s.contacts}</Link>;
}
export function ContactSelect({
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

export const grantTone: Record<string, Tone> = { idea: "neutral", submitted: "info", granted: "success", refused: "danger", paid: "success", closed: "neutral" };
const partnerTone: Record<string, Tone> = { prospect: "info", active: "success", ended: "neutral" };
/** What the page was opened with: a sheet (?partner=), a prefilled new partner (from a pot), a tab. */
export type PartnersStart = { partner?: string; name?: string; note?: string; tab?: "partners" | "packages" };
/** Partners: sponsors, donors, patrons and foundations, with their package, conditions, payment and dates (waves 11 and 15). */
export function Partners({ locale, start = {} }: { locale: Locale; start?: PartnersStart }) {
  const { t, data, error, setError, reload, message, busy, post, day } = useFunding(locale);
  const p = t.partners,
    sp = sponsorsCopy[locale];
  const [editing, setEditing] = useState<Partner | "new" | null>(start.name ? "new" : null),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState<"partners" | "packages">(start.tab ?? "partners"),
    [sheet, setSheet] = useState<string | null>(start.partner ?? null),
    [newContact, setNewContact] = useState(false),
    [packageId, setPackageId] = useState<string | null>(null);
  if (!data)
    return (
      <main id="main" className="access funding-partners">
        <PageHeader title={p.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const rows = data.partners.filter((x) => !status || x.status === status);
  const active = data.partners.filter((x) => x.status === "active");
  const soon = inDays(60);
  const renewals = active.filter((x) => {
    const d = x.renewal_on ?? x.ends_on;
    return !!d && d <= soon;
  }).length;
  const lateConditions = data.tasks.filter((x) => x.partner_id && x.status !== "done" && x.due_on && x.due_on < data.today).length;
  const current = editing && editing !== "new" ? editing : undefined;
  const chosen = packageId ?? current?.package_id ?? "";
  const pkg = data.packages.find((k) => k.id === chosen);
  const season = data.seasons.find((x) => x.id === pkg?.season_id) ?? data.seasons[0];
  const openForm = (x: Partner | "new") => {
    setPackageId(null);
    setNewContact(false);
    setEditing(x);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = current;
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
        ...(newContact
          ? {
              newContact: {
                fullName: String(f.get("contactName") ?? ""),
                organizationName: String(f.get("contactCompany") ?? ""),
                email: String(f.get("contactEmail") ?? "").trim(),
                phone: String(f.get("contactPhone") ?? ""),
              },
            }
          : { contactId: String(f.get("contact") ?? "") || null }),
        notes: String(f.get("notes") ?? ""),
        packageId: String(f.get("package") ?? "") || null,
        signedOn: dateOrNull(f.get("signed")),
        paymentDueOn: dateOrNull(f.get("paymentDue")),
        paidOn: dateOrNull(f.get("paid")),
        renewalOn: dateOrNull(f.get("renewal")),
        recordPayment: f.get("recordPayment") === "on",
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  };
  const open = data.partners.find((x) => x.id === sheet);
  return (
    <main id="main" className="access funding-partners">
      <PageHeader
        title={p.title}
        subtitle={p.intro}
        actions={
          <>
            <Nav locale={locale} current="partners" />
            {data.can.manage && tab === "partners" && (
              <button type="button" className="button" onClick={() => openForm("new")}>{p.new}</button>
            )}
          </>
        }
      />
      <FinanceNav locale={locale} current="income" income="partners" />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Tabs
        label={sp.tabsLabel}
        idPrefix="partners-tab"
        panelId="partners-panel"
        value={tab}
        onChange={(v) => setTab(v as "partners" | "packages")}
        items={[
          { id: "partners", label: sp.tabPartners, count: data.partners.length },
          { id: "packages", label: sp.tabPackages, count: data.packages.filter((k) => !k.archived).length },
        ]}
      />
      <div role="tabpanel" id="partners-panel" aria-labelledby={`partners-tab-${tab}`}>
        {tab === "packages" ? (
          <PackagesPanel locale={locale} data={data} busy={busy} post={post} />
        ) : (
          <>
            <div className="stat-row-grid" data-cols="5">
              <StatCard label={p.totalActive} value={String(active.length)} icon="team" tone="brand" />
              <StatCard label={p.totalAmount} value={euro(locale, active.reduce((n, x) => n + x.amount_cents, 0))} icon="funding" tone="info" />
              <StatCard label={p.received} value={euro(locale, (data.received.sponsor ?? 0) + (data.received.donation ?? 0))} icon="dues" tone="success" href={`/${locale}/funding`} />
              <StatCard label={p.renewals} value={String(renewals)} icon="clock" tone={renewals ? "warning" : "neutral"} />
              <StatCard label={sp.lateConditions} value={String(lateConditions)} icon="alert" tone={lateConditions ? "danger" : "neutral"} href={`/${locale}/tasks`} />
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
                  {/* Wave 17 (G2): the partners shown. */}
                  <ExportButton
                    locale={locale}
                    organizationId={data.organization_id}
                    dataset="sponsors"
                    subject={p.title}
                    period={season?.name ?? ""}
                    rows={rows}
                    columns={[
                      { id: "name", label: p.name, value: (x) => x.name },
                      { id: "kind", label: p.kind, value: (x) => p.kinds[x.kind] },
                      { id: "contact", label: sp.contactPerson, value: (x) => x.contact_name ?? "" },
                      { id: "package", label: sp.package, value: (x) => x.package_name ?? "" },
                      { id: "amount", label: p.amount, type: "money", value: (x) => (x.amount_cents ? x.amount_cents / 100 : null) },
                      { id: "conditions", label: sp.conditions, value: (x) => (x.tasks_total ? `${x.tasks_done}/${x.tasks_total}` : "") },
                      { id: "nearest", label: sp.nearest, type: "date", value: (x) => x.nearest?.date ?? null },
                      { id: "status", label: t.status, value: (x) => p.statuses[x.status] },
                    ]}
                  />
                </Toolbar>
              }
            >
              {rows.length ? (
                <div className="table-scroll">
                  <table className="compact-table partners-table">
                    <thead>
                      <tr>
                        <th scope="col">{p.name}</th>
                        <th scope="col">{sp.contactPerson}</th>
                        <th scope="col">{sp.package}</th>
                        <th scope="col" className="num">{p.amount}</th>
                        <th scope="col">{sp.payment}</th>
                        <th scope="col">{sp.conditions}</th>
                        <th scope="col">{sp.nearest}</th>
                        <th scope="col">{t.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((x) => (
                        <tr key={x.id}>
                          <th scope="row">
                            <button type="button" className="text-button partner-open" onClick={() => setSheet(x.id)}>
                              {x.name}<span className="sr-only"> · {sp.open}</span>
                            </button>
                            <span className="muted small"> · {p.kinds[x.kind]}</span>
                          </th>
                          <td>
                            {x.contact_name ? <Link href={`/${locale}/contacts?contact=${x.contact_id}`}>{x.contact_name}</Link> : <span className="muted">…</span>}
                          </td>
                          <td>{x.package_name ? <Badge tone="primary">{x.package_name}</Badge> : <span className="muted">…</span>}</td>
                          <td className="num">{x.amount_cents ? euro(locale, x.amount_cents) : "…"}</td>
                          <td><PaymentBadge locale={locale} payment={x.payment} /></td>
                          <td>
                            {x.tasks_total ? (
                              <span className="task-progress">
                                <span>{sp.conditionsDone.replace("{done}", String(x.tasks_done)).replace("{total}", String(x.tasks_total))}</span>
                                <progress max={x.tasks_total} value={x.tasks_done} aria-label={`${sp.conditions} : ${x.name}`} />
                                {x.tasks_late > 0 && <Badge tone="danger">{x.tasks_late}</Badge>}
                              </span>
                            ) : (
                              <span className="muted">…</span>
                            )}
                          </td>
                          <td>
                            {x.nearest ? (
                              <span className={x.nearest.date < data.today ? "danger-ink" : x.nearest.date <= addDays(data.today, 14) ? "warning-ink" : undefined}>
                                {x.nearest.date <= addDays(data.today, 14) && <Icon name={x.nearest.date < data.today ? "alert" : "clock"} size={14} />} {sp.nearestKinds[x.nearest.kind]} · {day(x.nearest.date)}
                              </span>
                            ) : (
                              <span className="muted">…</span>
                            )}
                          </td>
                          <td><Badge tone={partnerTone[x.status]} dot>{p.statuses[x.status]}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title={p.empty} icon="team" />
              )}
            </Card>
          </>
        )}
      </div>
      {open && !editing && (
        <PartnerSheet
          locale={locale}
          data={data}
          partner={open}
          busy={busy}
          post={post}
          reload={reload}
          setError={setError}
          close={() => setSheet(null)}
          edit={() => openForm(open)}
        />
      )}
      {editing && (
        <Modal title={editing === "new" ? p.new : `${p.editTitle} · ${editing.name}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <div className="form-pair">
              <label>
                {p.name}
                <input name="name" required minLength={2} maxLength={160} defaultValue={editing === "new" ? (start.name ?? "") : editing.name} />
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
                {sp.package}
                <select name="package" value={chosen} onChange={(e) => setPackageId(e.target.value)}>
                  <option value="">{sp.noPackageChoice}</option>
                  {data.packages
                    .filter((k) => !k.archived || k.id === current?.package_id)
                    .map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name} · {euro(locale, k.amount_cents)}{k.season_name ? ` · ${k.season_name}` : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {p.amount}
                <input
                  name="amount"
                  inputMode="decimal"
                  key={"amount" + chosen}
                  defaultValue={packageId && pkg ? String(pkg.amount_cents / 100) : editing === "new" ? "" : String(editing.amount_cents / 100)}
                />
              </label>
            </div>
            {current && chosen !== (current.package_id ?? "") && <p className="notice small">{sp.switchWarning}</p>}
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
                {sp.signedOn}
                <input name="signed" type="date" defaultValue={editing === "new" ? "" : (editing.signed_on ?? "")} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {sp.paymentDueOn}
                <input name="paymentDue" type="date" defaultValue={editing === "new" ? "" : (editing.payment_due_on ?? "")} />
              </label>
              <label>
                {sp.paidOnLabel}
                <input name="paid" type="date" defaultValue={editing === "new" ? "" : (editing.paid_on ?? "")} />
              </label>
            </div>
            {!current?.payment_transaction_id ? (
              <label className="check">
                <input type="checkbox" name="recordPayment" defaultChecked />
                {sp.recordPayment}
              </label>
            ) : (
              <p className="muted small">{sp.recordedPayment}</p>
            )}
            <label>
              {sp.renewalOn}
              <input
                name="renewal"
                type="date"
                key={"renewal" + chosen}
                aria-describedby="renewal-hint"
                defaultValue={editing !== "new" && editing.renewal_on ? editing.renewal_on : season?.ends_on ? proposedRenewal(season.ends_on) : ""}
              />
            </label>
            <p className="muted small" id="renewal-hint">{sp.renewalHint}</p>
            {data.can.contactsManage && (
              <label className="check">
                <input type="checkbox" checked={newContact} onChange={(e) => setNewContact(e.target.checked)} />
                {sp.newContactToggle}
              </label>
            )}
            {newContact ? (
              <fieldset className="official">
                <legend>{sp.contactPerson}</legend>
                <div className="form-pair">
                  <label>
                    {sp.contactName}
                    <input name="contactName" required minLength={2} maxLength={120} />
                  </label>
                  <label>
                    {sp.contactCompany}
                    <input name="contactCompany" maxLength={160} />
                  </label>
                </div>
                <div className="form-pair">
                  <label>
                    {sp.contactEmail}
                    <input name="contactEmail" type="email" maxLength={200} />
                  </label>
                  <label>
                    {sp.contactPhone}
                    <input name="contactPhone" maxLength={40} />
                  </label>
                </div>
              </fieldset>
            ) : (
              <ContactSelect name="contact" value={editing === "new" ? null : editing.contact_id} contacts={data.contacts} label={sp.contactPerson} none={t.noContact} />
            )}
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
            <label>
              {t.notes}
              <textarea name="notes" rows={3} maxLength={4000} defaultValue={editing === "new" ? (start.note ?? "") : editing.notes} />
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
