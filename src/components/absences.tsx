"use client";
import { useCallback, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { absencesView } from "@/domains/absences/service";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";

export const absenceCopy = {
  fr: {
    title: "Absences annoncées",
    intro:
      "Hospitalisation, fauteuil en réparation, examens : annoncez l'absence à l'avance. Toutes les séances de la période sont répondues « absent » avec le motif, y compris celles planifiées plus tard. Le staff le voit tout de suite.",
    who: "Pour",
    from: "Du",
    to: "Au",
    reason: "Motif",
    ifAbsent: "Motif si absent",
    comment: "Précision (facultatif)",
    declare: "Annoncer l'absence",
    declared: "Absence annoncée.",
    cancel: "Annuler l'annonce",
    cancelled: "Annonce annulée : les réponses à venir sont rouvertes.",
    none: "Aucune absence annoncée.",
    by: "annoncée par {n}",
    reasons: {
      illness: "Maladie",
      injury: "Blessure",
      chair: "Fauteuil en panne ou en réparation",
      transport: "Pas de transport",
      school_work: "École ou travail",
      family: "Raison familiale",
      other: "Autre",
    } as Record<string, string>,
    unavailable: "Absences indisponibles pour le moment.",
  },
  nl: {
    title: "Aangekondigde afwezigheden",
    intro:
      "Ziekenhuisopname, rolstoel in herstelling, examens: kondig de afwezigheid vooraf aan. Alle sessies in de periode worden „afwezig” beantwoord met de reden, ook later geplande. De staf ziet het meteen.",
    who: "Voor",
    from: "Van",
    to: "Tot",
    reason: "Reden",
    ifAbsent: "Reden indien afwezig",
    comment: "Toelichting (optioneel)",
    declare: "Afwezigheid aankondigen",
    declared: "Afwezigheid aangekondigd.",
    cancel: "Aankondiging annuleren",
    cancelled: "Aankondiging geannuleerd: de komende antwoorden zijn heropend.",
    none: "Geen aangekondigde afwezigheden.",
    by: "aangekondigd door {n}",
    reasons: {
      illness: "Ziekte",
      injury: "Blessure",
      chair: "Rolstoel defect of in herstelling",
      transport: "Geen vervoer",
      school_work: "School of werk",
      family: "Familiale reden",
      other: "Andere",
    },
    unavailable: "Afwezigheden momenteel niet beschikbaar.",
  },
  en: {
    title: "Announced absences",
    intro:
      "Hospital stay, chair under repair, exams: announce the absence ahead. Every session in the period is answered \"absent\" with the reason, including those planned later. The staff see it at once.",
    who: "For",
    from: "From",
    to: "To",
    reason: "Reason",
    ifAbsent: "Reason if absent",
    comment: "Details (optional)",
    declare: "Announce the absence",
    declared: "Absence announced.",
    cancel: "Cancel the announcement",
    cancelled: "Announcement cancelled: upcoming answers are open again.",
    none: "No announced absence.",
    by: "announced by {n}",
    reasons: {
      illness: "Illness",
      injury: "Injury",
      chair: "Chair broken or under repair",
      transport: "No transport",
      school_work: "School or work",
      family: "Family reason",
      other: "Other",
    },
    unavailable: "Absences unavailable right now.",
  },
};
type View = Awaited<ReturnType<typeof absencesView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function AbsencesPanel({ locale }: { locale: Locale }) {
  const t = absenceCopy[locale] as (typeof absenceCopy)["fr"];
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const { data, error, setError, reload } = useData<View>("/api/absences", failure);
  const { busy, message, post } = usePost("/api/absences", reload, setError, failure);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  if (!data.profiles.length && !data.absences.length) return null;
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void post(
      {
        action: "declare",
        profileId: String(f.get("profile")),
        startsOn: String(f.get("from")),
        endsOn: String(f.get("to")),
        reason: String(f.get("reason")),
        comment: String(f.get("comment") ?? ""),
        organizationId: data?.organization_id,
      },
      t.declared,
    ).then((ok) => ok && form.reset());
  }
  return (
    <section className="panel" aria-labelledby="absences-title">
      <h2 id="absences-title">{t.title}</h2>
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data.absences.length ? (
        <ul className="profile-list">
          {data.absences.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{a.full_name}</strong>
                <p className="small">
                  {day(a.starts_on)} → {day(a.ends_on)} · {t.reasons[a.reason]}
                  {a.comment && ` · ${a.comment}`}
                </p>
                <p className="muted small">{t.by.replace("{n}", a.declared_by)}</p>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void post({ action: "cancel", id: a.id, organizationId: data.organization_id }, t.cancelled)
                }
              >
                {t.cancel}
                <span className="sr-only"> : {a.full_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.none}</p>
      )}
      {data.profiles.length > 0 && (
        <form className="inline-form" onSubmit={submit}>
          <label htmlFor="abs-who">
            {t.who}
            <select id="abs-who" name="profile" required>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label htmlFor="abs-from">
            {t.from}
            <input id="abs-from" name="from" type="date" required min={data.today} defaultValue={data.today} />
          </label>
          <label htmlFor="abs-to">
            {t.to}
            <input id="abs-to" name="to" type="date" required min={data.today} />
          </label>
          <label htmlFor="abs-reason">
            {t.reason}
            <select id="abs-reason" name="reason" defaultValue="illness">
              {Object.entries(t.reasons).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label htmlFor="abs-comment">
            {t.comment}
            <input id="abs-comment" name="comment" maxLength={500} />
          </label>
          <button className="button secondary" disabled={busy}>{t.declare}</button>
        </form>
      )}
    </section>
  );
}
