"use client";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { clubView } from "@/domains/club/service";
import { errors } from "./access-copy";
import { initials } from "./app-shell";

type View = Awaited<ReturnType<typeof clubView>>;
const copy = {
  fr: {
    identity: "Identité du club",
    intro:
      "Le nom et le logo apparaissent dans l’application et sur les formulaires d’inscription publics.",
    name: "Nom du club",
    contact: "Email de contact public",
    save: "Enregistrer",
    logo: "Logo",
    change: "Choisir un logo (PNG, JPEG ou WebP, 512 Ko max.)",
    remove: "Retirer le logo",
    noLogo: "Aucun logo pour l’instant.",
    saved: "Enregistré.",
    readOnly: "Seul un président peut modifier l’identité du club.",
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
    save: "Opslaan",
    logo: "Logo",
    change: "Logo kiezen (PNG, JPEG of WebP, max. 512 kB)",
    remove: "Logo verwijderen",
    noLogo: "Nog geen logo.",
    saved: "Opgeslagen.",
    readOnly: "Alleen een voorzitter kan de identiteit van de club wijzigen.",
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
    name: "Club name",
    contact: "Public contact email",
    save: "Save",
    logo: "Logo",
    change: "Choose a logo (PNG, JPEG or WebP, 512 KB max.)",
    remove: "Remove logo",
    noLogo: "No logo yet.",
    saved: "Saved.",
    readOnly: "Only a president can change the club identity.",
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

export function ClubIdentity({ locale }: { locale: Locale }) {
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
        code === "INVALID_FILE" || code === "INVALID_INPUT"
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
        <section className="panel" aria-labelledby="club-identity-title">
          <h2 id="club-identity-title">{t.identity}</h2>
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
              !o.logo_version && <p className="muted">{t.noLogo}</p>
            )}
          </div>
          {view.canEdit ? (
            <form
              key={o.name + o.contact_email}
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send({
                  action: "identity",
                  name: String(f.get("name") ?? "").trim(),
                  contactEmail: String(f.get("contact") ?? "").trim(),
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
              <button className="button" disabled={busy}>
                {t.save}
              </button>
            </form>
          ) : (
            <p className="muted">{t.readOnly}</p>
          )}
        </section>
        {o.kind === "club" && (
          <section className="panel" aria-labelledby="club-teams-title">
            <h2 id="club-teams-title">{t.teams}</h2>
            <p className="muted">{t.teamsIntro}</p>
            <p>
              <a href="#teams">{t.teams} ↓</a>
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
              <p className="muted">{t.noTeam}</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
