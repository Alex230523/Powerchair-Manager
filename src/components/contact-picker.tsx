"use client";
import { useEffect, useId, useState } from "react";
import type { Locale } from "@/lib/locale";
import { crmCopy } from "./crm-copy";
import { fundingCopy } from "./funding-copy";
import { contactTags } from "@/domains/funding/schema";
import { errors } from "./access-copy";

type Choice = { id: string; full_name: string; organization_name: string };
type List = { organization_id: string; can: { create: boolean }; contacts: Choice[] };

/**
 * A4: « Choisir ou créer un contact », the same field in every form (grant,
 * sponsor, funder, chair supplier, donation). One picks in the club's book,
 * or creates the contact on the spot without leaving the form: the new
 * contact goes to the book and is chosen. The select carries `name`, so the
 * host form reads it like any field; without access to the book, the field
 * is not shown and the host leaves the link as it is (absent = unchanged).
 */
export function ContactPicker({ locale, name, value, label, none }: { locale: Locale; name: string; value: string | null; label: string; none: string }) {
  const t = crmCopy[locale];
  const tagCopy = (fundingCopy[locale] as (typeof fundingCopy)["fr"]).contacts as { tags: string; tag: Record<string, string> };
  const uid = useId();
  const [list, setList] = useState<List | null>(null),
    [chosen, setChosen] = useState(value ?? ""),
    [creating, setCreating] = useState(false),
    [draft, setDraft] = useState({ fullName: "", organizationName: "", email: "", phone: "" }),
    // 1: the tags chosen right in the creation (« Ajouter un contact »).
    [tags, setTags] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState(""),
    [denied, setDenied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/contacts?list=1", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as List) : null))
      .then((v) => {
        if (cancelled) return;
        if (v) setList(v);
        else setDenied(true);
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const create = async () => {
    if (!list || draft.fullName.trim().length < 2) return;
    setBusy(true);
    setFailed("");
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: list.organization_id, action: "contact", ...draft, email: draft.email.trim(), role: "", tags, notes: "" }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setList({ ...list, contacts: [...list.contacts, { id: v.id, full_name: draft.fullName.trim(), organization_name: v.organization_name ?? draft.organizationName }] });
      setChosen(v.id);
      setCreating(false);
      setDraft({ fullName: "", organizationName: "", email: "", phone: "" });
      setTags([]);
      setStatus(t.pickerCreated);
    } catch (e) {
      setFailed(errors[(e as Error).message]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? "");
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof typeof draft, text: string, type = "text") => (
    <label htmlFor={`${uid}-${key}`}>
      {text}
      <input
        id={`${uid}-${key}`}
        type={type}
        value={draft[key]}
        maxLength={key === "fullName" ? 120 : key === "phone" ? 40 : key === "email" ? 200 : 160}
        required={key === "fullName"}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onKeyDown={(e) => {
          // Enter creates the contact, never submits the host form.
          if (e.key === "Enter") {
            e.preventDefault();
            void create();
          }
        }}
      />
    </label>
  );
  // Without the contact book (a federation, no right): no field, the form keeps the current link.
  if (denied) return null;
  return (
    <div className="contact-picker">
      <label htmlFor={`${uid}-select`}>
        {label}
        <select id={`${uid}-select`} name={name} value={chosen} onChange={(e) => setChosen(e.target.value)} aria-busy={!list}>
          <option value="">{list ? none : t.pickerLoading}</option>
          {/* The current contact stays shown while the list loads. */}
          {!list && value && <option value={value}>…</option>}
          {list?.contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
              {c.organization_name ? ` · ${c.organization_name}` : ""}
            </option>
          ))}
        </select>
      </label>
      {list?.can.create &&
        (creating ? (
          <fieldset className="contact-picker-new">
            <legend>{t.pickerCreateTitle}</legend>
            <div className="form-pair">
              {field("fullName", t.pickerName)}
              {field("organizationName", t.pickerCompany)}
            </div>
            <div className="form-pair">
              {field("email", t.pickerEmail, "email")}
              {field("phone", t.pickerPhone, "tel")}
            </div>
            <fieldset className="tag-picker">
              <legend>{tagCopy.tags}</legend>
              {contactTags.map((x) => (
                <label key={x} className="check">
                  <input type="checkbox" checked={tags.includes(x)} onChange={(e) => setTags(e.target.checked ? [...tags, x] : tags.filter((y) => y !== x))} />
                  {tagCopy.tag[x] ?? x}
                </label>
              ))}
            </fieldset>
            {failed && <p role="alert">{failed}</p>}
            <div className="actions">
              <button type="button" className="button sm" disabled={busy || draft.fullName.trim().length < 2} onClick={() => void create()}>
                {t.pickerAdd}
              </button>
              <button type="button" className="button secondary sm" onClick={() => setCreating(false)}>
                {t.pickerCancel}
              </button>
            </div>
          </fieldset>
        ) : (
          <button type="button" className="text-button contact-picker-create" onClick={() => setCreating(true)}>
            + {t.pickerCreate}
          </button>
        ))}
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
