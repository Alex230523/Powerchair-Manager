"use client";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { contactsView } from "@/domains/funding/service";
import { contactTags } from "@/domains/funding/schema";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { fundingCopy } from "./funding-copy";
import { Badge, Card, EmptyState, PageHeader, Toolbar } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof contactsView>>;
type Contact = View["contacts"][number];

/** The club's contact book (wave 11): people outside the club, by tag. */
export function Contacts({ locale }: { locale: Locale }) {
  const t = fundingCopy[locale] as (typeof fundingCopy)["fr"];
  const c = t.contacts;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/contacts", failure);
  const { busy, message, post } = usePost("/api/contacts", reload, setError, failure);
  const [editing, setEditing] = useState<Contact | "new" | null>(null),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [archived, setArchived] = useState(false);
  if (!data)
    return (
      <main id="main" className="access contacts">
        <h1>{c.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const q = query.trim().toLowerCase();
  const rows = data.contacts.filter(
    (x) =>
      (archived || !x.archived) &&
      (!tag || x.tags.includes(tag)) &&
      (!q || [x.full_name, x.organization_name, x.role, x.email, x.phone].some((v) => v.toLowerCase().includes(q))),
  );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = editing && editing !== "new" ? editing : undefined;
    void post(
      {
        organizationId: data.organization_id,
        action: "contact",
        ...(current ? { id: current.id } : {}),
        fullName: String(f.get("fullName") ?? ""),
        organizationName: String(f.get("organizationName") ?? ""),
        role: String(f.get("role") ?? ""),
        email: String(f.get("email") ?? "").trim(),
        phone: String(f.get("phone") ?? ""),
        tags: contactTags.filter((k) => f.get("tag:" + k) === "on"),
        notes: String(f.get("notes") ?? ""),
        archived: f.get("archived") === "on",
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  };
  return (
    <main id="main" className="access contacts">
      <PageHeader
        title={c.title}
        subtitle={c.intro}
        actions={
          data.can.manage && (
            <button type="button" className="button" onClick={() => setEditing("new")}>
              {c.new}
            </button>
          )
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Card title={c.title} id="contacts" className="flush"
        actions={
          <Toolbar>
            <div className="toolbar-field">
              <label htmlFor="contact-search">{t.search}</label>
              <input id="contact-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="toolbar-field">
              <label htmlFor="contact-tag">{c.tags}</label>
              <select id="contact-tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">{t.all}</option>
                {contactTags.map((k) => (
                  <option key={k} value={k}>{c.tag[k]}</option>
                ))}
              </select>
            </div>
            <label className="check toolbar-check">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              {c.showArchived}
            </label>
          </Toolbar>
        }
      >
        {rows.length ? (
          <div className="table-scroll">
            <table className="compact-table contact-table">
              <thead>
                <tr>
                  <th scope="col">{c.name}</th>
                  <th scope="col">{c.organization}</th>
                  <th scope="col">{c.email}</th>
                  <th scope="col">{c.phone}</th>
                  <th scope="col">{c.tags}</th>
                  <th scope="col"><span className="sr-only">{t.edit}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} data-archived={x.archived || undefined}>
                    <th scope="row">
                      {x.full_name}
                      {x.role && <span className="muted small"> · {x.role}</span>}
                      {x.archived && <Badge tone="neutral">{c.archived}</Badge>}
                    </th>
                    <td>{x.organization_name}</td>
                    <td>{x.email && <a href={`mailto:${x.email}`}>{x.email}</a>}</td>
                    <td>{x.phone && <a href={`tel:${x.phone.replace(/\s/g, "")}`}>{x.phone}</a>}</td>
                    <td className="tag-cell">
                      {x.tags.map((k) => (
                        <Badge key={k} tone={k === "sponsor" || k === "donor" ? "brand" : "neutral"}>{c.tag[k] ?? k}</Badge>
                      ))}
                      {(x.grants > 0 || x.partners > 0) && (
                        <span className="muted small">
                          {" "}{c.usedIn} {[x.grants ? `${x.grants} ${c.grants}` : "", x.partners ? `${x.partners} ${c.partners}` : ""].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="row-actions">
                      {data.can.manage && (
                        <button type="button" className="text-button" onClick={() => setEditing(x)}>
                          {t.edit}<span className="sr-only"> : {x.full_name}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={c.empty} icon="message" />
        )}
      </Card>
      {editing && (
        <Modal title={editing === "new" ? c.new : `${c.editTitle} · ${editing.full_name}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            <div className="form-pair">
              <label>
                {c.name}
                <input name="fullName" required minLength={2} maxLength={120} defaultValue={editing === "new" ? "" : editing.full_name} />
              </label>
              <label>
                {c.organization}
                <input name="organizationName" maxLength={160} defaultValue={editing === "new" ? "" : editing.organization_name} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {c.role}
                <input name="role" maxLength={120} defaultValue={editing === "new" ? "" : editing.role} />
              </label>
              <label>
                {c.email}
                <input name="email" type="email" maxLength={200} defaultValue={editing === "new" ? "" : editing.email} />
              </label>
            </div>
            <label>
              {c.phone}
              <input name="phone" maxLength={40} defaultValue={editing === "new" ? "" : editing.phone} />
            </label>
            <fieldset className="tag-picker">
              <legend>{c.tags}</legend>
              <div className="check-grid">
                {contactTags.map((k) => (
                  <label key={k} className="check">
                    <input type="checkbox" name={"tag:" + k} defaultChecked={editing !== "new" && editing.tags.includes(k)} />
                    {c.tag[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              {t.notes}
              <textarea name="notes" rows={3} maxLength={4000} defaultValue={editing === "new" ? "" : editing.notes} />
            </label>
            {editing !== "new" && (
              <label className="check">
                <input type="checkbox" name="archived" defaultChecked={editing.archived} />
                {c.archived}
              </label>
            )}
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
