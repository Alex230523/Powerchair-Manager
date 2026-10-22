"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { contactDetail, contactsView } from "@/domains/crm/service";
import { contactTags } from "@/domains/funding/schema";
import { interactionKinds, legalBases, organizationKinds, type InteractionKind } from "@/domains/crm/schema";
import { parseContacts } from "@/domains/crm/import";
import type { ImportRow } from "@/domains/crm/schema";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { fundingCopy } from "./funding-copy";
import { crmCopy, fill } from "./crm-copy";
import { Badge, Button, Card, EmptyState, ExportButton, PageHeader, Tabs, Toolbar } from "./ui";
import { DataGrid } from "./data-grid";
import { Icon } from "./icons";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof contactsView>>;
type Contact = View["contacts"][number];
type Organization = View["organizations"][number];
type Detail = Awaited<ReturnType<typeof contactDetail>>;
type Post = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const dayLabel = (locale: Locale, d: string | null) => (d ? new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "");
const euro = (locale: Locale, cents: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * The club's contact book (wave 11), a light CRM since A4: organisations,
 * a sheet per contact with everything it is linked to, the exchange log in
 * one click, the next action in the to-do, duplicates merged, import and
 * export, GDPR. People outside the club only; players have their own sheet.
 */
export function Contacts({ locale, start }: { locale: Locale; start?: string }) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const c = t.contacts,
    k = crmCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/contacts", failure);
  const { busy, message, post, postFor } = usePost("/api/contacts", reload, setError, failure);
  const [editing, setEditing] = useState<Contact | "new" | null>(null),
    [sheet, setSheet] = useState<string | null>(start ?? null),
    [tab, setTab] = useState<"contacts" | "organizations" | "duplicates">("contacts"),
    [org, setOrg] = useState<Organization | "new" | null>(null),
    [importing, setImporting] = useState(false),
    [query, setQuery] = useState(""),
    [tagFilter, setTagFilter] = useState(""),
    [archived, setArchived] = useState(false);
  if (!data)
    return (
      <main id="main" className="access contacts">
        <PageHeader title={c.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const send: Post = (body, done) => post({ organizationId: data.organization_id, ...body }, done);
  const sendFor = (body: Record<string, unknown>) => postFor({ organizationId: data.organization_id, ...body }, "") as Promise<Record<string, unknown> | null>;
  const q = query.trim().toLowerCase();
  const rows = data.contacts.filter(
    (x) =>
      (archived || !x.archived) &&
      (!tagFilter || x.tags.includes(tagFilter)) &&
      (!q || [x.full_name, x.organization_name, x.role, x.email, x.phone].some((v) => v.toLowerCase().includes(q))),
  );
  const byId = new Map(data.contacts.map((x) => [x.id, x]));
  return (
    <main id="main" className="access contacts">
      <PageHeader
        title={c.title}
        subtitle={c.intro}
        actions={
          data.can.manage && (
            <>
              <Button variant="secondary" icon="download" onClick={() => setImporting(true)}>
                {k.importOpen}
              </Button>
              <Button icon="plus" onClick={() => setEditing("new")}>
                {c.new}
              </Button>
            </>
          )
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Tabs
        label={k.tabs}
        idPrefix="contacts-tab"
        panelId="contacts-panel"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { id: "contacts", label: k.tabContacts, count: data.contacts.filter((x) => !x.archived).length },
          { id: "organizations", label: k.tabOrganizations, count: data.organizations.length },
          ...(data.can.manage ? [{ id: "duplicates", label: k.tabDuplicates, count: data.duplicates.length }] : []),
        ]}
      />
      <div role="tabpanel" id="contacts-panel" aria-labelledby={`contacts-tab-${tab}`}>
        {tab === "contacts" && (
          <Card
            title={c.title}
            id="contacts"
            className="flush"
            actions={
              <Toolbar>
                <div className="toolbar-field">
                  <label htmlFor="contact-search">{t.search}</label>
                  <input id="contact-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="toolbar-field">
                  <label htmlFor="contact-tag">{c.tags}</label>
                  <select id="contact-tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                    <option value="">{t.all}</option>
                    {contactTags.map((x) => (
                      <option key={x} value={x}>
                        {c.tag[x]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="check toolbar-check">
                  <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                  {c.showArchived}
                </label>
                <ExportButton
                  locale={locale}
                  organizationId={data.organization_id}
                  dataset="contacts"
                  subject={c.title}
                  rows={rows}
                  columns={[
                    { id: "name", label: c.name, value: (x) => x.full_name },
                    { id: "organization", label: c.organization, value: (x) => x.organization_name },
                    { id: "role", label: c.role, value: (x) => x.role },
                    { id: "email", label: c.email, value: (x) => x.email },
                    { id: "phone", label: c.phone, value: (x) => x.phone },
                    { id: "tags", label: c.tags, value: (x) => x.tags.map((g) => c.tag[g] ?? g).join(", ") },
                    { id: "last", label: k.lastContact, type: "date", value: (x) => x.last_contact_on },
                  ]}
                />
              </Toolbar>
            }
          >
            {rows.length ? (
              <DataGrid
                locale={locale}
                label={c.title}
                className="contact-table"
                sortKey="contactSort"
                rows={rows}
                rowId={(x) => x.id}
                rowName={(x) => x.full_name}
                columns={[
                  {
                    key: "name",
                    header: c.name,
                    rowHeader: true,
                    hideable: false,
                    sort: (x) => x.full_name,
                    cell: (x) => (
                      <>
                        <button type="button" className="text-button contact-open" aria-label={fill(k.openOf, { name: x.full_name })} onClick={() => setSheet(x.id)}>
                          {x.full_name}
                        </button>
                        {x.role && <span className="muted small"> · {x.role}</span>}
                        {x.archived && <Badge tone="neutral">{c.archived}</Badge>}
                        {!x.contact_ok && <Badge tone="warning">{k.contactNo}</Badge>}
                      </>
                    ),
                  },
                  { key: "organization", header: c.organization, sort: (x) => x.organization_name, cell: (x) => x.organization_name },
                  { key: "email", header: c.email, sort: (x) => x.email, cell: (x) => x.email && <a href={`mailto:${x.email}`}>{x.email}</a> },
                  { key: "phone", header: c.phone, cell: (x) => x.phone && <a href={`tel:${x.phone.replace(/\s/g, "")}`}>{x.phone}</a> },
                  {
                    key: "tags",
                    header: c.tags,
                    cell: (x) => (
                      <span className="tag-cell">
                        {x.tags.map((g) => (
                          <Badge key={g} tone={g === "sponsor" || g === "donor" ? "brand" : "neutral"}>
                            {c.tag[g] ?? g}
                          </Badge>
                        ))}
                      </span>
                    ),
                  },
                  { key: "last", header: k.lastContact, sort: (x) => x.last_contact_on ?? "", cell: (x) => (x.last_contact_on ? dayLabel(locale, x.last_contact_on) : <span className="muted">{k.never}</span>) },
                ]}
              />
            ) : (
              <EmptyState title={c.empty} icon="message" />
            )}
          </Card>
        )}
        {tab === "organizations" && (
          <Card
            title={k.tabOrganizations}
            className="flush"
            actions={
              data.can.manage && (
                <Button variant="secondary" icon="plus" onClick={() => setOrg("new")}>
                  {k.newOrganization}
                </Button>
              )
            }
          >
            {data.organizations.length ? (
              <ul className="organization-list">
                {data.organizations.map((o) => (
                  <li key={o.id}>
                    <div>
                      <strong>{o.name}</strong> <Badge>{k.kinds[o.kind]}</Badge>
                      <p className="muted small">
                        {fill(k.contactsCount, { n: o.contacts })}
                        {o.website && (
                          <>
                            {" · "}
                            <a href={o.website} target="_blank" rel="noopener noreferrer">
                              {o.website.replace(/^https?:\/\//, "")}
                            </a>
                          </>
                        )}
                        {o.address && ` · ${o.address}`}
                      </p>
                    </div>
                    {data.can.manage && (
                      <div className="row-actions">
                        <Button variant="secondary" size="sm" aria-label={`${k.editOrganization} : ${o.name}`} onClick={() => setOrg(o)}>
                          {t.edit}
                        </Button>
                        <button type="button" className="icon-button sm" disabled={busy} aria-label={fill(k.deleteOrganizationOf, { name: o.name })} title={fill(k.deleteOrganizationOf, { name: o.name })} onClick={() => void send({ action: "deleteOrganization", id: o.id }, t.deleted)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={k.organizationsEmpty} icon="club" />
            )}
          </Card>
        )}
        {tab === "duplicates" && data.can.manage && (
          <Card title={k.tabDuplicates}>
            <p className="muted">{k.duplicatesIntro}</p>
            {data.duplicates.length ? (
              <ul className="duplicate-list">
                {data.duplicates.map((d) => {
                  const a = byId.get(d.a),
                    b = byId.get(d.b);
                  if (!a || !b) return null;
                  const merge = (keep: Contact, other: Contact) => {
                    if (!window.confirm(fill(k.mergeConfirm, { name: keep.full_name, other: other.full_name }))) return;
                    void send({ action: "merge", keepId: keep.id, mergeId: other.id }, k.merged);
                  };
                  return (
                    <li key={d.a + d.b}>
                      <p>
                        <Badge tone="warning">{k.reasons[d.reason]}</Badge> <strong>{a.full_name}</strong> {a.email && <span className="muted">({a.email})</span>} · <strong>{b.full_name}</strong>{" "}
                        {b.email && <span className="muted">({b.email})</span>}
                      </p>
                      <div className="row-actions">
                        {[
                          [a, b],
                          [b, a],
                        ].map(([keep, other]) => (
                          <Button key={keep.id} variant="secondary" size="sm" disabled={busy} aria-label={fill(k.keepOf, { name: keep.full_name, other: other.full_name })} onClick={() => merge(keep, other)}>
                            {fill(k.keep, { name: keep.full_name })}
                          </Button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={k.duplicatesNone} icon="check" tone="success" />
            )}
          </Card>
        )}
      </div>
      {sheet && !editing && (
        <ContactSheet
          key={sheet}
          locale={locale}
          id={sheet}
          view={data}
          busy={busy}
          send={send}
          close={() => setSheet(null)}
          edit={(x) => setEditing(x)}
          version={data.contacts.find((x) => x.id === sheet)?.version ?? 0}
          interactionsCount={data.contacts.find((x) => x.id === sheet)?.interactions ?? 0}
        />
      )}
      {editing && <ContactForm locale={locale} view={data} contact={editing === "new" ? null : editing} busy={busy} send={send} close={() => setEditing(null)} />}
      {org && <OrganizationForm locale={locale} organization={org === "new" ? null : org} busy={busy} send={send} close={() => setOrg(null)} />}
      {importing && <ImportDialog locale={locale} busy={busy} sendFor={sendFor} close={() => setImporting(false)} />}
    </main>
  );
}

function ContactForm({ locale, view, contact, busy, send, close }: { locale: Locale; view: View; contact: Contact | null; busy: boolean; send: Post; close: () => void }) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const c = t.contacts,
    k = crmCopy[locale];
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send(
      {
        action: "contact",
        ...(contact ? { id: contact.id } : {}),
        fullName: String(f.get("fullName") ?? ""),
        organizationName: String(f.get("organizationName") ?? ""),
        role: String(f.get("role") ?? ""),
        email: String(f.get("email") ?? "").trim(),
        phone: String(f.get("phone") ?? ""),
        tags: contactTags.filter((x) => f.get("tag:" + x) === "on"),
        notes: String(f.get("notes") ?? ""),
        archived: f.get("archived") === "on",
        legalBasis: String(f.get("legalBasis") ?? "legitimate_interest"),
        contactOk: f.get("contactOk") === "on",
        consentOn: String(f.get("consentOn") ?? "") || null,
      },
      t.saved,
    ).then((ok) => ok && close());
  };
  return (
    <Modal title={contact ? `${c.editTitle} · ${contact.full_name}` : c.new} close={close}>
      <form className="finance-form" onSubmit={submit}>
        <div className="form-pair">
          <label>
            {c.name}
            <input name="fullName" required minLength={2} maxLength={120} defaultValue={contact?.full_name ?? ""} />
          </label>
          <div className="field">
            <label>
              {k.organization}
              <input name="organizationName" maxLength={160} list="contact-organizations" defaultValue={contact?.organization_name ?? ""} aria-describedby="contact-organization-hint" />
            </label>
            <span className="muted small field-hint" id="contact-organization-hint">
              {k.organizationHint}
            </span>
            <datalist id="contact-organizations">
              {view.organizations.map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="form-pair">
          <label>
            {c.role}
            <input name="role" maxLength={120} defaultValue={contact?.role ?? ""} />
          </label>
          <label>
            {c.email}
            <input name="email" type="email" maxLength={200} defaultValue={contact?.email ?? ""} />
          </label>
        </div>
        <label>
          {c.phone}
          <input name="phone" maxLength={40} defaultValue={contact?.phone ?? ""} />
        </label>
        <fieldset className="tag-picker">
          <legend>{c.tags}</legend>
          <div className="check-grid">
            {contactTags.map((x) => (
              <label key={x} className="check">
                <input type="checkbox" name={"tag:" + x} defaultChecked={!!contact?.tags.includes(x)} />
                {c.tag[x]}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          {t.notes}
          <textarea name="notes" rows={3} maxLength={4000} defaultValue={contact?.notes ?? ""} />
        </label>
        <fieldset className="official">
          <legend>{k.gdpr}</legend>
          <div className="form-pair">
            <label>
              {k.legalBasis}
              <select name="legalBasis" defaultValue={contact?.legal_basis ?? "legitimate_interest"}>
                {legalBases.map((b) => (
                  <option key={b} value={b}>
                    {k.legalBases[b]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {k.consentOn}
              <input name="consentOn" type="date" defaultValue={contact?.consent_on ?? ""} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="contactOk" defaultChecked={contact?.contact_ok ?? true} />
            {k.contactOk}
          </label>
        </fieldset>
        {contact && (
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={contact.archived} />
            {c.archived}
          </label>
        )}
        <div className="actions">
          <button className="button" disabled={busy}>
            {t.save}
          </button>
          <button type="button" className="button secondary" onClick={close}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OrganizationForm({ locale, organization, busy, send, close }: { locale: Locale; organization: Organization | null; busy: boolean; send: Post; close: () => void }) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const k = crmCopy[locale];
  return (
    <Modal title={organization ? `${k.editOrganization} · ${organization.name}` : k.newOrganization} close={close}>
      <form
        className="finance-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send(
            {
              action: "organization",
              ...(organization ? { id: organization.id } : {}),
              name: String(f.get("name") ?? ""),
              kind: String(f.get("kind") ?? "other"),
              website: String(f.get("website") ?? "").trim(),
              address: String(f.get("address") ?? ""),
              notes: String(f.get("notes") ?? ""),
            },
            t.saved,
          ).then((ok) => ok && close());
        }}
      >
        <div className="form-pair">
          <label>
            {t.contacts.name}
            <input name="name" required minLength={2} maxLength={160} defaultValue={organization?.name ?? ""} />
          </label>
          <label>
            {k.kind}
            <select name="kind" defaultValue={organization?.kind ?? "company"}>
              {organizationKinds.map((x) => (
                <option key={x} value={x}>
                  {k.kinds[x]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {k.website}
          <input name="website" type="url" maxLength={300} placeholder="https://" defaultValue={organization?.website ?? ""} />
        </label>
        <label>
          {k.address}
          <input name="address" maxLength={300} defaultValue={organization?.address ?? ""} />
        </label>
        <label>
          {t.notes}
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={organization?.notes ?? ""} />
        </label>
        <div className="actions">
          <button className="button" disabled={busy}>
            {t.save}
          </button>
          <button type="button" className="button secondary" onClick={close}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** One contact: the facts, the log in one click, what it is linked to, the next action, GDPR. */
function ContactSheet({
  locale,
  id,
  view,
  busy,
  send,
  close,
  edit,
  version,
  interactionsCount,
}: {
  locale: Locale;
  id: string;
  view: View;
  busy: boolean;
  send: Post;
  close: () => void;
  edit: (c: Contact) => void;
  /** The book's version of the contact and its log: a change reloads the sheet. */
  version: number;
  interactionsCount: number;
}) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const c = t.contacts,
    k = crmCopy[locale];
  const [d, setD] = useState<Detail | null>(null),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contacts?contact=${id}`, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setD(v as Detail);
      })
      .catch((e: Error) => {
        if (!cancelled) setFailed(errors[e.message]?.[locale] ?? t.unavailable);
      });
    return () => {
      cancelled = true;
    };
  }, [id, version, interactionsCount, locale, t.unavailable]);
  const contact = view.contacts.find((x) => x.id === id);
  if (!contact) return null;
  const linked = d?.linked;
  const groups: [keyof (typeof k)["linkedKinds"], { id: string; label: string; href: string }[]][] = linked
    ? [
        ["grants", linked.grants.map((x) => ({ id: x.id, label: x.name, href: `/${locale}/funding/grants-sponsors?vue=subsides&grant=${x.id}` }))],
        ["partners", linked.partners.map((x) => ({ id: x.id, label: x.name, href: `/${locale}/funding/grants-sponsors?vue=sponsoring&partner=${x.id}` }))],
        ["funders", linked.funders.map((x) => ({ id: x.id, label: x.name, href: `/${locale}/funding/grants-sponsors?vue=subsides&funder=${x.id}` }))],
        ["donations", linked.donations.map((x) => ({ id: x.id, label: `${dayLabel(locale, x.occurred_on)} · ${x.pot} · ${euro(locale, x.amount_cents)}`, href: `/${locale}/fundraising` }))],
        ["chairs", linked.chairs.map((x) => ({ id: x.id, label: x.name, href: `/${locale}/equipment/${x.id}` }))],
        ["venues", linked.venues.map((x) => ({ id: x.id, label: x.name, href: `/${locale}/venues` }))],
        ["events", linked.events.map((x) => ({ id: x.id, label: `${dayLabel(locale, x.starts_at)} · ${x.title}`, href: `/${locale}/calendar?event=${x.id}` }))],
        ["tasks", linked.tasks.map((x) => ({ id: x.id, label: `${x.title}${x.due_on ? ` · ${dayLabel(locale, x.due_on)}` : ""}`, href: `/${locale}/tasks?task=${x.id}` }))],
      ]
    : [];
  return (
    <Modal title={contact.full_name} close={close} className="player-dialog side-sheet contact-sheet">
      {failed && <p role="alert">{failed}</p>}
      <section aria-labelledby="contact-facts">
        <h3 id="contact-facts" className="sr-only">
          {c.editTitle}
        </h3>
        <dl className="sheet-facts">
          <div>
            <dt>{k.organization}</dt>
            <dd>{d?.organization ? `${d.organization.name} · ${k.kinds[d.organization.kind as keyof typeof k.kinds]}` : contact.organization_name || "…"}</dd>
          </div>
          {contact.role && (
            <div>
              <dt>{c.role}</dt>
              <dd>{contact.role}</dd>
            </div>
          )}
          <div>
            <dt>{c.email}</dt>
            <dd>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "…"}</dd>
          </div>
          <div>
            <dt>{c.phone}</dt>
            <dd>{contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a> : "…"}</dd>
          </div>
          <div>
            <dt>{k.lastContact}</dt>
            <dd>{contact.last_contact_on ? dayLabel(locale, contact.last_contact_on) : k.never}</dd>
          </div>
          <div>
            <dt>{k.legalBasis}</dt>
            <dd>
              {k.legalBases[contact.legal_basis]} · {contact.contact_ok ? k.contactOk : k.contactNo}
            </dd>
          </div>
        </dl>
        {contact.tags.length > 0 && (
          <p className="tag-cell">
            {contact.tags.map((g) => (
              <Badge key={g}>{c.tag[g] ?? g}</Badge>
            ))}
          </p>
        )}
        {contact.notes && <p className="pre-line muted">{contact.notes}</p>}
        {view.can.manage && (
          <div className="row-actions">
            <Button variant="secondary" size="sm" onClick={() => edit(contact)}>
              {t.edit}
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="contact-log">
        <h3 id="contact-log">{k.log}</h3>
        <form
          className="contact-log-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const kind = (submitter?.value ?? "note") as InteractionKind;
            const summary = String(new FormData(form).get("summary") ?? "").trim();
            if (!summary) return;
            void send({ action: "interaction", contactId: contact.id, kind, summary }, t.saved).then((ok) => ok && form.reset());
          }}
        >
          <label htmlFor="contact-log-line">
            {k.logLabel}
            <input id="contact-log-line" name="summary" required maxLength={300} aria-describedby="contact-log-hint" />
          </label>
          <p className="muted small" id="contact-log-hint">
            {k.logHint}
          </p>
          <div className="row-actions">
            {interactionKinds.map((x) => (
              <button key={x} type="submit" name="kind" value={x} className="button secondary sm" disabled={busy} aria-label={fill(k.logAs, { kind: k.interactionKinds[x] })}>
                {k.interactionKinds[x]}
              </button>
            ))}
          </div>
        </form>
        {d && d.interactions.length ? (
          <ul className="contact-log">
            {d.interactions.map((i) => (
              <li key={i.id} data-kind={i.kind}>
                <Badge tone={i.kind === "sent" ? "info" : "neutral"}>{k.interactionKinds[i.kind as InteractionKind] ?? i.kind}</Badge> <span>{k.sources[i.source] ?? i.summary}</span>
                <span className="muted small">
                  {" "}
                  · {dayLabel(locale, i.happened_on)}
                  {i.author ? ` · ${i.author}` : ` · ${k.automatic}`}
                </span>
                {i.kind !== "sent" && (i.mine || view.can.manage) && (
                  <button
                    type="button"
                    className="icon-button sm"
                    disabled={busy}
                    aria-label={fill(k.removeLine, { date: dayLabel(locale, i.happened_on) })}
                    title={fill(k.removeLine, { date: dayLabel(locale, i.happened_on) })}
                    onClick={() => void send({ action: "deleteInteraction", id: i.id }, t.deleted)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{d ? k.logEmpty : t.loading}</p>
        )}
      </section>

      <section aria-labelledby="contact-linked">
        <h3 id="contact-linked">{k.linked}</h3>
        {groups.some(([, items]) => items.length) ? (
          <dl className="contact-linked">
            {groups
              .filter(([, items]) => items.length)
              .map(([key, items]) => (
                <div key={key}>
                  <dt>{k.linkedKinds[key]}</dt>
                  <dd>
                    <ul>
                      {items.map((x) => (
                        <li key={x.id}>
                          <Link href={x.href}>{x.label}</Link>
                        </li>
                      ))}
                    </ul>
                    {key === "donations" && linked && (
                      <p className="muted small">{linked.donationsByYear.map((y) => fill(k.donationsTotal, { year: y.year, total: euro(locale, y.cents) })).join(" · ")}</p>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="muted">{d ? k.linkedEmpty : t.loading}</p>
        )}
      </section>

      {view.can.manage && (
        <section aria-labelledby="contact-next">
          <h3 id="contact-next">{k.nextAction}</h3>
          <form
            className="contact-next-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void send(
                { action: "nextAction", contactId: contact.id, title: String(f.get("title") ?? ""), dueOn: String(f.get("due") ?? "") || null, responsibleId: String(f.get("who") ?? "") || null },
                k.nextActionAdded,
              ).then((ok) => ok && form.reset());
            }}
          >
            <label htmlFor="contact-next-title">
              {k.nextActionTitle}
              <input id="contact-next-title" name="title" required minLength={2} maxLength={200} />
            </label>
            <div className="form-pair">
              <label htmlFor="contact-next-due">
                {k.nextActionDue}
                <input id="contact-next-due" name="due" type="date" />
              </label>
              <label htmlFor="contact-next-who">
                {k.nextActionWho}
                <select id="contact-next-who" name="who" defaultValue="">
                  <option value="">{k.nobody}</option>
                  {view.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button size="sm" disabled={busy}>
              {k.nextActionAdd}
            </Button>
          </form>
        </section>
      )}

      {view.can.manage && (
        <section aria-labelledby="contact-gdpr">
          <h3 id="contact-gdpr">{k.gdpr}</h3>
          <div className="row-actions">
            <a className="button secondary sm" href={`/api/contacts?export=${contact.id}`} download>
              {k.exportData}
            </a>
            <button
              type="button"
              className="button danger sm"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(k.eraseConfirm)) return;
                void send({ action: "erase", id: contact.id }, k.erased).then((ok) => ok && close());
              }}
            >
              {k.erase}
            </button>
          </div>
        </section>
      )}
    </Modal>
  );
}

/** CSV or vCard, read here, checked again by the server; 500 rows per sending. */
function ImportDialog({ locale, busy, sendFor, close }: { locale: Locale; busy: boolean; sendFor: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; close: () => void }) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const k = crmCopy[locale];
  const [parsed, setParsed] = useState<{ rows: ImportRow[]; ignored: number } | null>(null),
    [tags, setTags] = useState<string[]>([]),
    [done, setDone] = useState("");
  return (
    <Modal title={k.importTitle} close={close}>
      <div className="stack-form">
        <p className="muted">{k.importIntro}</p>
        <label htmlFor="contact-import-file">
          {k.importFile}
          <input
            id="contact-import-file"
            type="file"
            accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return setParsed(null);
              void file.text().then((text) => setParsed(parseContacts(file.name, text)));
            }}
          />
        </label>
        {done && <p role="status">{done}</p>}
        {parsed &&
          (parsed.rows.length ? (
            <>
              <p role="status">
                {fill(k.importPreview, { n: parsed.rows.length })}
                {parsed.ignored > 0 && ` · ${fill(k.importIgnored, { n: parsed.ignored })}`}
              </p>
              <div className="table-scroll" role="region" aria-label={k.importPreview.replace("{n}", String(parsed.rows.length))} tabIndex={0}>
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.contacts.name}</th>
                      <th scope="col">{k.organization}</th>
                      <th scope="col">{t.contacts.email}</th>
                      <th scope="col">{t.contacts.phone}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <th scope="row">{r.fullName}</th>
                        <td>{r.organizationName}</td>
                        <td>{r.email}</td>
                        <td>{r.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <fieldset className="tag-picker">
                <legend>{k.importTags}</legend>
                <div className="check-grid">
                  {contactTags.map((x) => (
                    <label key={x} className="check">
                      <input type="checkbox" checked={tags.includes(x)} onChange={(e) => setTags(e.target.checked ? [...tags, x] : tags.filter((y) => y !== x))} />
                      {t.contacts.tag[x]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="actions">
                <Button
                  disabled={busy || !!done}
                  onClick={async () => {
                    let created = 0,
                      skipped = 0;
                    for (let i = 0; i < parsed.rows.length; i += 500) {
                      const r = await sendFor({ action: "import", rows: parsed.rows.slice(i, i + 500), tags });
                      if (!r) return;
                      created += Number(r.created ?? 0);
                      skipped += Number(r.skipped ?? 0);
                    }
                    setDone(fill(k.importDone, { created, skipped }));
                  }}
                >
                  {k.importRun}
                </Button>
                <Button variant="secondary" onClick={close}>
                  {t.cancel}
                </Button>
              </div>
            </>
          ) : (
            <p role="alert">{k.importNone}</p>
          ))}
      </div>
    </Modal>
  );
}
