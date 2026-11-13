"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { deletionView } from "@/domains/account/deletion";
import { errors } from "./access-copy";
import { Button, Card, Field } from "./ui";
import { useData, usePost } from "./use-api";

type View = Awaited<ReturnType<typeof deletionView>>;
const copy = {
  fr: {
    title: "Supprimer mon compte",
    intro: "Votre compte est supprimé {days} jours après la demande : d'ici là, vous pouvez changer d'avis. Ensuite, plus de connexion, plus de nom, d'adresse ni de photo. Les clubs gardent leurs propres fiches (inscriptions, paiements) dans leurs registres.",
    sole: "Vous êtes seul(e) à la présidence de : {names}. Transmettez d'abord la présidence, ou fermez le club dans Réglages, Club.",
    handover: "Transmettre la présidence",
    confirm: "Tapez votre adresse e-mail pour confirmer",
    ask: "Supprimer mon compte dans {days} jours",
    pending: "Suppression prévue le {day}. Vous pouvez encore l'annuler.",
    cancel: "Annuler la suppression",
    asked: "Suppression demandée. Un e-mail de confirmation est parti.",
    cancelled: "Suppression annulée.",
  },
  nl: {
    title: "Mijn account verwijderen",
    intro: "Uw account wordt {days} dagen na de aanvraag verwijderd: tot dan kunt u van gedachten veranderen. Daarna geen aanmelding, naam, adres of foto meer. De clubs bewaren hun eigen fiches (inschrijvingen, betalingen) in hun registers.",
    sole: "U bent de enige in het voorzitterschap van: {names}. Draag eerst het voorzitterschap over, of stop de club in Instellingen, Club.",
    handover: "Het voorzitterschap overdragen",
    confirm: "Typ uw e-mailadres om te bevestigen",
    ask: "Mijn account over {days} dagen verwijderen",
    pending: "Verwijdering gepland op {day}. U kunt ze nog annuleren.",
    cancel: "De verwijdering annuleren",
    asked: "Verwijdering aangevraagd. Er is een bevestigingsmail vertrokken.",
    cancelled: "Verwijdering geannuleerd.",
  },
  en: {
    title: "Delete my account",
    intro: "Your account is deleted {days} days after the request: until then, you can change your mind. Then no more sign-in, name, address or photo. The clubs keep their own files (registrations, payments) in their records.",
    sole: "You are the only one in the presidency of: {names}. Hand over the presidency first, or close the club in Settings, Club.",
    handover: "Hand over the presidency",
    confirm: "Type your e-mail address to confirm",
    ask: "Delete my account in {days} days",
    pending: "Deletion planned on {day}. You can still cancel it.",
    cancel: "Cancel the deletion",
    asked: "Deletion requested. A confirmation e-mail has left.",
    cancelled: "Deletion cancelled.",
  },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** 12/11/2026: Réglages, Mon compte: deleting one's account after 30 days that can be cancelled. */
export function AccountDeletion({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<View>("/api/account/deletion", failure);
  const { busy, message, post } = usePost("/api/account/deletion", reload, setError, failure);
  const [email, setEmail] = useState("");
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
  return (
    <Card title={t.title} labelledBy="settings-delete-account" headingId="settings-delete-account" className="danger-zone">
      <p className="muted">{fill(t.intro, { days: data.days })}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.pending ? (
        <>
          <p className="notice">{fill(t.pending, { day: day(data.pending.due_on) })}</p>
          <p>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void post({ action: "cancel" }, t.cancelled)}>
              {t.cancel}
            </Button>
          </p>
        </>
      ) : data.sole.length ? (
        <>
          <p className="notice">{fill(t.sole, { names: data.sole.map((o) => o.name).join(", ") })}</p>
          <p>
            <Link className="button secondary" href={`/${locale}/settings/organisation#settings-presidency`}>
              {t.handover}
            </Link>
          </p>
        </>
      ) : (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void post({ action: "request", confirmEmail: email }, t.asked).then((ok) => ok && setEmail(""));
          }}
        >
          <Field id="delete-account-email" label={t.confirm} required>
            <input id="delete-account-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div>
            <Button variant="danger" disabled={busy || !email.trim()}>
              {fill(t.ask, { days: data.days })}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
