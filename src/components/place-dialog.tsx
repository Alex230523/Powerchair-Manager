"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import { placeCategories, type PlaceCategory, type PlaceRow } from "@/domains/venues/schema";
import { placesCopy } from "./places-copy";
import { errors } from "./access-copy";
import { Button } from "./ui";
import { Modal } from "./modal";

type Contact = { id: string; full_name: string; organization_name: string };

/**
 * Wave 17 (C4): the one window that creates or edits a place, opened from
 * the Places page, the calendar header and the event form. The contact is
 * chosen in the contacts book or created here.
 */
export function PlaceDialog({
  locale,
  place,
  category = "training",
  initialName = "",
  close,
  saved,
}: {
  locale: Locale;
  place?: PlaceRow;
  /** 1: the name typed in the event's place field (« + Créer ce lieu »). */
  initialName?: string;
  category?: PlaceCategory;
  close: () => void;
  saved: (id: string) => void;
}) {
  const t = placesCopy[locale];
  const [ctx, setCtx] = useState<{ organization_id: string; contacts: Contact[] } | null>(null),
    [newContact, setNewContact] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/venues", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setCtx({ organization_id: v.organization_id, contacts: v.contacts });
      })
      .catch((e: Error) => !cancelled && setError(errors[e.message]?.[locale] ?? errors.FORBIDDEN?.[locale] ?? e.message));
    return () => {
      cancelled = true;
    };
  }, [locale]);
  async function submit(form: HTMLFormElement) {
    if (!ctx) return;
    const f = new FormData(form);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: ctx.organization_id,
          action: "savePlace",
          ...(place ? { id: place.id, expectedVersion: place.version } : {}),
          name: s("name"),
          address: s("address"),
          category: s("category") || "training",
          contactId: newContact ? null : s("contact") || null,
          newContact: newContact ? { fullName: s("contactName"), organizationName: s("contactCompany"), email: s("contactEmail"), phone: s("contactPhone") } : null,
          capacity: s("capacity") ? Number(s("capacity")) : null,
          accessible: f.has("accessible"),
          toilets: f.has("toilets"),
          parking: f.has("parking"),
          storage: f.has("storage"),
          charging: f.has("charging"),
          home: f.has("home"),
          bookingNeeded: f.has("bookingNeeded"),
          foodPolicy: s("food"),
          notes: s("notes"),
          archived: f.has("archived"),
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      saved(v.id);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(errors[code]?.[locale] ?? code);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={place ? t.editOf.replace("{name}", place.name) : t.add} close={close} className="player-dialog place-dialog">
      {error && <p role="alert">{error}</p>}
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <label>
          {t.name}
          <input name="name" required minLength={2} maxLength={120} defaultValue={place?.name ?? initialName} />
        </label>
        <label>
          {t.address}
          <input name="address" maxLength={500} defaultValue={place?.address} />
        </label>
        <fieldset className="check-row">
          <legend>{t.category}</legend>
          {placeCategories.map((c) => (
            <label key={c} className="check">
              <input type="radio" name="category" value={c} defaultChecked={(place?.category ?? category) === c} />
              {t.categories[c]}
            </label>
          ))}
        </fieldset>
        {newContact ? (
          <fieldset className="stack-form">
            <legend>{t.newContact}</legend>
            <label>
              {t.contactName}
              <input name="contactName" required minLength={2} maxLength={120} />
            </label>
            <label>
              {t.contactCompany}
              <input name="contactCompany" maxLength={160} />
            </label>
            <label>
              {t.contactEmail}
              <input name="contactEmail" type="email" maxLength={200} />
            </label>
            <label>
              {t.contactPhone}
              <input name="contactPhone" maxLength={40} />
            </label>
            <button type="button" className="text-button" onClick={() => setNewContact(false)}>
              {t.pickContact}
            </button>
          </fieldset>
        ) : (
          <div className="field-with-action">
            <label>
              {t.contact}
              <select name="contact" defaultValue={place?.contact_id ?? ""}>
                <option value="">{t.noContact}</option>
                {(ctx?.contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.organization_name ? ` · ${c.organization_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="button secondary" onClick={() => setNewContact(true)}>
              {t.newContact}
            </button>
          </div>
        )}
        <label>
          {t.capacity}
          <input name="capacity" type="number" min={1} max={100000} defaultValue={place?.capacity ?? ""} />
        </label>
        <fieldset className="check-row">
          <legend>{t.accessibility}</legend>
          {(["accessible", "toilets", "parking", "storage", "charging"] as const).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" name={k} defaultChecked={place?.[k]} />
              {t.access[k]}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" name="home" defaultChecked={place?.home} />
          {t.home}
        </label>
        {/* 18: the hall's bookings are worked out from the calendar when it must be booked. */}
        <label className="check">
          <input type="checkbox" name="bookingNeeded" defaultChecked={place ? place.booking_needed : true} />
          {t.bookingNeeded}
        </label>
        <label>
          {t.food}
          <textarea name="food" rows={2} maxLength={1000} defaultValue={place?.food_policy} />
        </label>
        <label>
          {t.notes}
          <textarea name="notes" rows={2} maxLength={2000} defaultValue={place?.notes} />
        </label>
        {place && (
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={place.archived} />
            {t.archived}
          </label>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={busy || !ctx}>
            {t.save}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
