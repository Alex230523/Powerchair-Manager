"use client";
import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { clubView } from "@/domains/club/service";
import { errors } from "./access-copy";
import { initials } from "./app-shell";
import { Card, EmptyState } from "./ui";

type View = Awaited<ReturnType<typeof clubView>>;
const copy = {
  fr: {
    identity: "Identité du club",
    intro:
      "Le nom et le logo apparaissent dans l’application et sur les formulaires d’inscription publics.",
    name: "Nom du club",
    contact: "Email de contact public",
    federation: "Fédération",
    noFederation: "Aucune fédération",
    federationHelp: "Choisir une fédération lui envoie une demande : votre club n'y est rattaché qu'après son accord.",
    federationPending: "Demande envoyée à {name} le {day}, en attente de sa réponse.",
    save: "Enregistrer",
    logo: "Logo",
    change: "Choisir un logo (PNG, JPEG ou WebP, 512 Ko max.)",
    remove: "Retirer le logo",
    noLogo: "Aucun logo pour l’instant.",
    saved: "Enregistré.",
    readOnly: "Seul un président peut modifier l’identité du club.",
    movedText: "Le nom, le logo, l’email de contact et la fédération du club se règlent dans Réglages, catégorie Club.",
    movedLink: "Ouvrir les réglages du club",
    teams: "Équipes du club",
    teamsIntro:
      "Un club peut aligner plusieurs équipes la même saison. Créez-les et modifiez-les dans la section « Équipes » plus bas.",
    players: "joueurs",
    coaches: "Encadrement",
    noTeam: "Aucune équipe pour la saison en cours.",
    invalidFile:
      "Ce fichier n’est pas une image PNG, JPEG ou WebP de 512 Ko maximum.",
  },
  nl: {
    identity: "Identiteit van de club",
    intro:
      "Naam en logo verschijnen in de applicatie en op de openbare inschrijvingsformulieren.",
    name: "Naam van de club",
    contact: "Openbaar contactadres",
    federation: "Federatie",
    noFederation: "Geen federatie",
    federationHelp: "Een federatie kiezen stuurt haar een aanvraag: uw club wordt pas aangesloten na haar akkoord.",
    federationPending: "Aanvraag verstuurd naar {name} op {day}, wacht op haar antwoord.",
    save: "Opslaan",
    logo: "Logo",
    change: "Logo kiezen (PNG, JPEG of WebP, max. 512 kB)",
    remove: "Logo verwijderen",
    noLogo: "Nog geen logo.",
    saved: "Opgeslagen.",
    readOnly: "Alleen een voorzitter kan de identiteit van de club wijzigen.",
    movedText: "Naam, logo, contactadres en federatie van de club stel je in bij Instellingen, categorie Club.",
    movedLink: "De clubinstellingen openen",
    teams: "Teams van de club",
    teamsIntro:
      "Een club kan meerdere teams in hetzelfde seizoen hebben. Maak en wijzig ze in de sectie ‘Teams’ hieronder.",
    players: "spelers",
    coaches: "Begeleiding",
    noTeam: "Geen team voor het lopende seizoen.",
    invalidFile:
      "Dit bestand is geen PNG-, JPEG- of WebP-afbeelding van maximaal 512 kB.",
  },
  en: {
    identity: "Club identity",
    intro:
      "The name and logo appear in the app and on public registration forms.",
    federation: "Federation",
    noFederation: "No federation",
    federationHelp: "Choosing a federation sends it a request: your club is attached only after its agreement.",
    federationPending: "Request sent to {name} on {day}, waiting for its answer.",
    name: "Club name",
    contact: "Public contact email",
    save: "Save",
    logo: "Logo",
    change: "Choose a logo (PNG, JPEG or WebP, 512 KB max.)",
    remove: "Remove logo",
    noLogo: "No logo yet.",
    saved: "Saved.",
    readOnly: "Only a president can change the club identity.",
    movedText: "The club name, logo, contact email and federation are set in Settings, Club category.",
    movedLink: "Open the club settings",
    teams: "Club teams",
    teamsIntro:
      "A club can field several teams in the same season. Create and edit them in the ‘Teams’ section below.",
    players: "players",
    coaches: "Staff",
    noTeam: "No team for the current season.",
    invalidFile:
      "This file is not a PNG, JPEG or WebP image of at most 512 KB.",
  },
};

/** Details printed on official papers such as mutual insurance attestations. */
const official = {
  fr: {
    title: "Pour les documents officiels",
    hint: "Repris sur les attestations pour la mutuelle.",
    address: "Adresse du siège",
    company: "Numéro d'entreprise (BCE)",
    signatory: "Signataire",
    signatoryHint: "Ex. Alex Martin, président",
    iban: "Compte bancaire (IBAN)",
    ibanHint: "Repris sur les conventions de sponsoring.",
    invalid: "Vérifiez le numéro d’entreprise et l’IBAN : l’un des deux n’est pas valide.",
    rollover: "Passage de saison",
    legal: "Forme du club",
    legalHelp: "Le statut du club propose ses obligations selon la forme (Réglages, Club, Statut et obligations).",
    legalForms: { "": "Non précisée", asbl: "ASBL", de_facto: "Association de fait", other: "Autre" },
  },
  nl: {
    title: "Voor officiële documenten",
    hint: "Overgenomen op de attesten voor het ziekenfonds.",
    address: "Adres van de zetel",
    company: "Ondernemingsnummer (KBO)",
    signatory: "Ondertekenaar",
    signatoryHint: "Bv. Alex Martin, voorzitter",
    iban: "Bankrekening (IBAN)",
    ibanHint: "Overgenomen op de sponsorovereenkomsten.",
    invalid: "Controleer het ondernemingsnummer en de IBAN: een van beide is ongeldig.",
    rollover: "Seizoensovergang",
    legal: "Vorm van de club",
    legalHelp: "Het statuut van de club stelt de verplichtingen voor volgens de vorm (Instellingen, Club, Statuut en verplichtingen).",
    legalForms: { "": "Niet opgegeven", asbl: "VZW", de_facto: "Feitelijke vereniging", other: "Andere" },
  },
  en: {
    title: "For official papers",
    hint: "Printed on mutual insurance attestations.",
    address: "Registered address",
    company: "Company number (BCE/KBO)",
    signatory: "Signatory",
    signatoryHint: "E.g. Alex Martin, president",
    iban: "Bank account (IBAN)",
    ibanHint: "Printed on sponsorship agreements.",
    invalid: "Check the company number and the IBAN: one of them is not valid.",
    rollover: "Season rollover",
    legal: "Legal form",
    legalHelp: "The club status proposes its obligations from the form (Settings, Club, Status and obligations).",
    legalForms: { "": "Not given", asbl: "Non-profit (ASBL)", de_facto: "Unincorporated association", other: "Other" },
  },
};
/** `only`: "identity" in Settings > Club (wave 15), "teams" in Gestion du club, which links to the identity. */
export function ClubIdentity({ locale, only }: { locale: Locale; only?: "identity" | "teams" }) {
  const t = copy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/club", { cache: "no-store" });
    if (r.ok) setView(await r.json());
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/club", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok && !cancelled) setView(await r.json());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: view?.organization.id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(t.saved);
      // The shell shows the club name and logo: ask it to refresh.
      window.dispatchEvent(new Event("pfm-workspace"));
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "INVALID_INPUT" && body.action === "identity"
          ? official[locale].invalid
          : code === "INVALID_FILE" || code === "INVALID_INPUT"
            ? t.invalidFile
            : (errors[code]?.[locale] ?? code),
      );
    } finally {
      setBusy(false);
    }
  }
  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      file.size > 524288 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError(t.invalidFile);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result).split(",")[1] ?? "";
      void send({ action: "logo", mediaType: file.type, data });
    };
    reader.readAsDataURL(file);
  }
  if (!view) return null;
  const o = view.organization;
  return (
    <div className="club-identity">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="grid">
        {/* 12: no « identity moved » card any more on the teams side. */}
        {only === "teams" ? null : (
        <Card title={t.identity} labelledBy="club-identity-title" headingId="club-identity-title">
          <p className="muted">{t.intro}</p>
          <div className="logo-row">
            {o.logo_version ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="club-logo-large"
                src={`/api/club/logo?org=${o.id}&v=${o.logo_version}`}
                alt={`${t.logo} ${o.name}`}
              />
            ) : (
              <span className="club-logo-large placeholder" aria-hidden="true">
                {initials(o.name)}
              </span>
            )}
            {view.canEdit ? (
              <div className="logo-actions">
                <label className="button secondary file-button">
                  {t.change}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={upload}
                    disabled={busy}
                  />
                </label>
                {o.logo_version && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void send({ action: "removeLogo" })}
                  >
                    {t.remove}
                  </button>
                )}
              </div>
            ) : (
              !o.logo_version && <EmptyState title={t.noLogo} />
            )}
          </div>
          {view.canEdit ? (
            <form
              key={o.name + o.contact_email + (o.federation_id ?? "") + (o.legal_form ?? "") + (o.address ?? "") + (o.company_number ?? "") + (o.signatory ?? "") + (o.iban ?? "")}
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send({
                  action: "identity",
                  name: String(f.get("name") ?? "").trim(),
                  contactEmail: String(f.get("contact") ?? "").trim(),
                  ...(o.kind === "club"
                    ? {
                        federationId: String(f.get("federation") ?? "") || null,
                        legalForm: String(f.get("legalForm") ?? "") || null,
                        address: String(f.get("address") ?? "").trim(),
                        companyNumber: String(f.get("company") ?? "").trim(),
                        signatory: String(f.get("signatory") ?? "").trim(),
                        iban: String(f.get("iban") ?? "").trim(),
                      }
                    : {}),
                });
              }}
            >
              <label htmlFor="club-name">
                {t.name}
                <input
                  id="club-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={o.name}
                />
              </label>
              <label htmlFor="club-contact">
                {t.contact}
                <input
                  id="club-contact"
                  name="contact"
                  type="email"
                  maxLength={254}
                  defaultValue={o.contact_email}
                />
              </label>
              {o.kind === "club" && (
                <label htmlFor="club-federation">
                  {t.federation}
                  <select
                    id="club-federation"
                    name="federation"
                    defaultValue={o.federation_id ?? ""}
                    aria-describedby="club-federation-help"
                  >
                    <option value="">{t.noFederation}</option>
                    {view.federations.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <span id="club-federation-help" className="field-help">
                    {o.federation_request_id && o.federation_requested_at
                      ? t.federationPending
                          .replace("{name}", o.federation_request_name ?? "")
                          .replace("{day}", new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric" }).format(new Date(o.federation_requested_at)))
                      : t.federationHelp}
                  </span>
                </label>
              )}
              {o.kind === "club" && (
                <label htmlFor="club-legal-form">
                  {official[locale].legal}
                  <select id="club-legal-form" name="legalForm" defaultValue={o.legal_form ?? ""} aria-describedby="club-legal-form-help">
                    {(["", "asbl", "de_facto", "other"] as const).map((k) => (
                      <option key={k} value={k}>
                        {official[locale].legalForms[k]}
                      </option>
                    ))}
                  </select>
                  <span className="muted small" id="club-legal-form-help">
                    {official[locale].legalHelp}
                  </span>
                </label>
              )}
              {o.kind === "club" && (
                <fieldset className="official">
                  <legend>{official[locale].title}</legend>
                  <p className="muted small">{official[locale].hint}</p>
                  <label htmlFor="club-address">
                    {official[locale].address}
                    <input id="club-address" name="address" maxLength={300} defaultValue={o.address ?? ""} />
                  </label>
                  <label htmlFor="club-company">
                    {official[locale].company}
                    <input
                      id="club-company"
                      name="company"
                      maxLength={12}
                      pattern="[01][0-9]{3}\.[0-9]{3}\.[0-9]{3}"
                      placeholder="0123.456.789"
                      defaultValue={o.company_number ?? ""}
                    />
                  </label>
                  <label htmlFor="club-signatory">
                    {official[locale].signatory}
                    <input
                      id="club-signatory"
                      name="signatory"
                      maxLength={160}
                      placeholder={official[locale].signatoryHint}
                      defaultValue={o.signatory ?? ""}
                    />
                  </label>
                  <label htmlFor="club-iban">
                    {official[locale].iban}
                    <input id="club-iban" name="iban" maxLength={42} placeholder="BE68 5390 0754 7034" defaultValue={o.iban ?? ""} aria-describedby="club-iban-hint" autoComplete="off" />
                  </label>
                  <p className="muted small" id="club-iban-hint">{official[locale].ibanHint}</p>
                </fieldset>
              )}
              <button className="button" disabled={busy}>
                {t.save}
              </button>
            </form>
          ) : (
            <p className="muted">{t.readOnly}</p>
          )}
        </Card>
        )}
        {o.kind === "club" && only !== "identity" && (
          <Card title={t.teams} labelledBy="club-teams-title" headingId="club-teams-title">
            <p className="muted">{t.teamsIntro}</p>
            <p>
              {/* On « Mes équipes » the teams are right above: no link down to them. */}
              {only !== "teams" && <a href="#teams">{t.teams} ↓</a>}
              {view.canEdit && (
                <>
                  {only !== "teams" && " · "}
                  <Link href={`/${locale}/club/rollover`}>{official[locale].rollover}</Link>
                </>
              )}
            </p>
            {view.teams.length ? (
              <ul className="team-cards">
                {view.teams.map((team) => (
                  <li key={team.id}>
                    <strong>{team.name}</strong>
                    <span className="muted">
                      {[team.season, team.category, team.level]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span>
                      {team.players} {t.players}
                      {team.coaches ? ` · ${t.coaches} : ${team.coaches}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.noTeam} />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
