"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { careMoments } from "@/domains/trips/schema";
import { tripsCopy } from "./trips-copy";
import { Card } from "./player-profile";
import { EmptyState } from "./ui";

const copy = {
  fr: {
    title: "Consignes de soin",
    hint: "Ce que les accompagnants doivent faire et quand : transfert, installation, ventilation, hydratation… Visibles des coachs du joueur et emportées dans le carnet des déplacements. Données de santé : chiffrées, et chaque lecture par le staff est tracée.",
    none: "Aucune consigne.",
    add: "Ajouter une consigne",
    moment: "Moment",
    time: "Heure (facultatif)",
    what: "Consigne",
    details: "Détails",
    active: "Active",
    inactive: "Plus d'actualité",
    edit: "Modifier",
    save: "Enregistrer",
    cancel: "Annuler",
  },
  nl: {
    title: "Zorginstructies",
    hint: "Wat de begeleiders moeten doen en wanneer: transfer, installatie, beademing, drinken… Zichtbaar voor de coaches van de speler en opgenomen in het boekje van de verplaatsingen. Gezondheidsgegevens: versleuteld, en elke raadpleging door de staf wordt gelogd.",
    none: "Geen instructies.",
    add: "Instructie toevoegen",
    moment: "Moment",
    time: "Uur (optioneel)",
    what: "Instructie",
    details: "Details",
    active: "Actief",
    inactive: "Niet meer van toepassing",
    edit: "Wijzigen",
    save: "Opslaan",
    cancel: "Annuleren",
  },
  en: {
    title: "Care instructions",
    hint: "What assistants must do and when: transfer, positioning, ventilation, drinks… Visible to the player's coaches and carried in the trip book. Health data: encrypted, and each reading by staff is logged.",
    none: "No instruction.",
    add: "Add an instruction",
    moment: "When",
    time: "Time (optional)",
    what: "Instruction",
    details: "Details",
    active: "Active",
    inactive: "No longer relevant",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
  },
};
export type CareItem = {
  id: string;
  moment: string;
  time: string;
  title: string;
  details: string;
  active: boolean;
};

export function CareCard({
  locale,
  care,
  canEdit,
  busy,
  send,
}: {
  locale: Locale;
  care: CareItem[];
  canEdit: boolean;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<void>;
}) {
  const t = copy[locale],
    m = tripsCopy[locale].moments;
  const [editing, setEditing] = useState<string | null>(null);
  function submit(e: FormEvent<HTMLFormElement>, item?: CareItem) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({
      action: "care",
      ...(item ? { careId: item.id } : {}),
      moment: String(f.get("moment")),
      time: String(f.get("time") ?? ""),
      title: String(f.get("title") ?? ""),
      details: String(f.get("details") ?? ""),
      active: item ? f.get("active") === "on" : true,
    }).then(() => setEditing(null));
  }
  const form = (item?: CareItem) => (
    <form className="care-form" onSubmit={(e) => submit(e, item)}>
      <label>
        {t.moment}
        <select name="moment" defaultValue={item?.moment ?? "morning"}>
          {careMoments.map((k) => (
            <option key={k} value={k}>{m[k]}</option>
          ))}
        </select>
      </label>
      <label>
        {t.time}
        <input name="time" type="time" defaultValue={item?.time} />
      </label>
      <label>
        {t.what}
        <input name="title" required minLength={2} maxLength={120} defaultValue={item?.title} placeholder="Ex. Transfert au lève-personne" />
      </label>
      <label>
        {t.details}
        <textarea name="details" maxLength={2000} rows={2} defaultValue={item?.details} />
      </label>
      {item && (
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={item.active} />
          {t.active}
        </label>
      )}
      <div className="actions">
        <button className="button" disabled={busy}>{t.save}</button>
        <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
      </div>
    </form>
  );
  return (
    <Card
      title={t.title}
      icon="lock"
      action={
        canEdit && editing === null ? (
          <button type="button" className="text-button" onClick={() => setEditing("new")}>
            {t.add}
          </button>
        ) : null
      }
    >
      <p className="muted">{t.hint}</p>
      {editing === "new" && form()}
      {care.length ? (
        <ul className="care-items">
          {care.map((c) => (
            <li key={c.id} data-inactive={!c.active || undefined}>
              {editing === c.id ? (
                form(c)
              ) : (
                <>
                  <div>
                    <strong>{m[c.moment]}{c.time && ` ${c.time}`}</strong> · {c.title}
                    {!c.active && <span className="muted"> · {t.inactive}</span>}
                    {c.details && <p className="small pre-line">{c.details}</p>}
                  </div>
                  {canEdit && (
                    <button type="button" className="text-button" onClick={() => setEditing(c.id)}>
                      {t.edit}
                      <span className="sr-only"> : {c.title}</span>
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        editing !== "new" && <EmptyState title={t.none} />
      )}
    </Card>
  );
}
