"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { rolloverView } from "@/domains/seasons/rollover";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { PageHeader } from "./ui";

const copy = {
  fr: {
    title: "Passage de saison",
    intro:
      "La nouvelle saison part de la précédente : les équipes sont recopiées, les personnes cochées sont réinscrites dès le premier jour, les barèmes de cotisation peuvent suivre (un an plus tard). L'ancienne saison peut être archivée : elle reste consultable mais n'accepte plus de modification.",
    back: "Gestion du club",
    loading: "Chargement…",
    unavailable: "Passage de saison indisponible pour le moment.",
    from: "Saison de départ",
    name: "Nom de la nouvelle saison",
    starts: "Début",
    ends: "Fin",
    teams: "Équipes et personnes à reconduire",
    teamsHint: "Décochez ceux qui ne continuent pas. Les joueurs inactifs ne sont pas reconduits.",
    all: "Tout cocher",
    none: "Rien cocher",
    copyPlans: "Recopier les barèmes de cotisation ({n})",
    archiveOld: "Archiver l'ancienne saison",
    submit: "Créer la nouvelle saison",
    done: "Saison créée : {n} personnes réinscrites, {p} barèmes recopiés.",
    noSeason: "Aucune saison à reconduire. Créez d'abord une saison dans Gestion du club.",
    roles: { player: "Joueur", coach: "Coach", assistant: "Assistant", volunteer: "Bénévole" } as Record<string, string>,
    inactive: "inactif",
  },
  nl: {
    title: "Seizoensovergang",
    intro:
      "Het nieuwe seizoen vertrekt van het vorige: de teams worden gekopieerd, de aangevinkte personen worden vanaf de eerste dag opnieuw ingeschreven, de bijdrageplannen kunnen volgen (een jaar later). Het oude seizoen kan gearchiveerd worden: raadpleegbaar, maar niet meer wijzigbaar.",
    back: "Clubbeheer",
    loading: "Laden…",
    unavailable: "Seizoensovergang momenteel niet beschikbaar.",
    from: "Vertrekseizoen",
    name: "Naam van het nieuwe seizoen",
    starts: "Begin",
    ends: "Einde",
    teams: "Teams en personen om te verlengen",
    teamsHint: "Vink uit wie niet verder doet. Inactieve spelers worden niet verlengd.",
    all: "Alles aanvinken",
    none: "Niets aanvinken",
    copyPlans: "Bijdrageplannen kopiëren ({n})",
    archiveOld: "Oud seizoen archiveren",
    submit: "Nieuw seizoen aanmaken",
    done: "Seizoen aangemaakt: {n} personen opnieuw ingeschreven, {p} plannen gekopieerd.",
    noSeason: "Geen seizoen om te verlengen. Maak eerst een seizoen aan in Clubbeheer.",
    roles: { player: "Speler", coach: "Coach", assistant: "Assistent", volunteer: "Vrijwilliger" },
    inactive: "inactief",
  },
  en: {
    title: "Season rollover",
    intro:
      "The new season starts from the previous one: teams are copied, the people ticked are re-enrolled from day one, dues plans can follow (one year later). The old season can be archived: still readable, no longer editable.",
    back: "Club management",
    loading: "Loading…",
    unavailable: "Season rollover unavailable right now.",
    from: "Season to start from",
    name: "Name of the new season",
    starts: "Start",
    ends: "End",
    teams: "Teams and people to carry over",
    teamsHint: "Untick those who do not continue. Inactive players are not carried over.",
    all: "Tick all",
    none: "Untick all",
    copyPlans: "Copy the dues plans ({n})",
    archiveOld: "Archive the old season",
    submit: "Create the new season",
    done: "Season created: {n} people re-enrolled, {p} plans copied.",
    noSeason: "No season to carry over. Create a season first in Club management.",
    roles: { player: "Player", coach: "Coach", assistant: "Assistant", volunteer: "Volunteer" },
    inactive: "inactive",
  },
};
type View = Awaited<ReturnType<typeof rolloverView>>;
type Member = { profile_id: string; full_name: string; role: string; status: string };

export function Rollover({ locale }: { locale: Locale }) {
  const t = copy[locale] as (typeof copy)["fr"];
  const [from, setFrom] = useState("");
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const { data, error, setError, reload } = useData<View>(
    "/api/seasons/rollover" + (from ? `?from=${from}` : ""),
    failure,
  );
  const { busy, message, post } = usePost("/api/seasons/rollover", reload, setError, failure);
  const [unticked, setUnticked] = useState<Set<string>>(new Set()),
    [result, setResult] = useState("");
  if (!data)
    return (
      <main id="main" className="access rollover">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const key = (team: string, profile: string) => `${team}:${profile}`;
  const toggle = (k: string) => {
    const next = new Set(unticked);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setUnticked(next);
  };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data?.from) return;
    const f = new FormData(e.currentTarget);
    const teams = data.teams.map((team) => ({
      teamId: team.id,
      profiles: (team.members as Member[])
        .filter((m) => m.status === "active" && !unticked.has(key(team.id, m.profile_id)))
        .map((m) => m.profile_id),
    }));
    const enrolled = teams.reduce((n, x) => n + x.profiles.length, 0);
    void post(
      {
        fromSeasonId: data.from.id,
        name: String(f.get("name") ?? ""),
        startsOn: String(f.get("starts")),
        endsOn: String(f.get("ends")),
        teams,
        copyPlans: f.get("copyPlans") === "on",
        archiveOld: f.get("archiveOld") === "on",
        organizationId: data.organization_id,
      },
      "",
    ).then((ok) => {
      if (ok)
        setResult(
          t.done
            .replace("{n}", String(enrolled))
            .replace("{p}", f.get("copyPlans") === "on" ? String(data.plans.length) : "0"),
        );
    });
  }
  return (
    <main id="main" className="access rollover">
      <p className="back-link">
        <Link className="button secondary" href={`/${locale}/settings/seasons`}>{t.back}</Link>
      </p>
      <h1>{t.title}</h1>
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      {(result || message) && <p role="status">{result || message}</p>}
      {!data.from ? (
        <p className="notice">{t.noSeason}</p>
      ) : (
        <form onSubmit={submit} key={data.from.id}>
          <div className="form-grid">
            <label htmlFor="ro-from">
              {t.from}
              <select id="ro-from" value={data.from.id} onChange={(e) => setFrom(e.target.value)}>
                {data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label htmlFor="ro-name">
              {t.name}
              <input id="ro-name" name="name" required minLength={2} maxLength={80} defaultValue={data.suggestion?.name} />
            </label>
            <label htmlFor="ro-starts">
              {t.starts}
              <input id="ro-starts" name="starts" type="date" required defaultValue={data.suggestion?.startsOn} />
            </label>
            <label htmlFor="ro-ends">
              {t.ends}
              <input id="ro-ends" name="ends" type="date" required defaultValue={data.suggestion?.endsOn} />
            </label>
          </div>
          <h2>{t.teams}</h2>
          <p className="muted">{t.teamsHint}</p>
          {data.teams.map((team) => {
            const members = team.members as Member[];
            return (
              <fieldset key={team.id} className="rollover-team">
                <legend>{team.name}</legend>
                <div className="row-actions">
                  <button type="button" className="text-button" onClick={() => {
                    const next = new Set(unticked);
                    members.forEach((m) => next.delete(key(team.id, m.profile_id)));
                    setUnticked(next);
                  }}>
                    {t.all}<span className="sr-only"> : {team.name}</span>
                  </button>
                  <button type="button" className="text-button" onClick={() => {
                    const next = new Set(unticked);
                    members.forEach((m) => next.add(key(team.id, m.profile_id)));
                    setUnticked(next);
                  }}>
                    {t.none}<span className="sr-only"> : {team.name}</span>
                  </button>
                </div>
                <div className="people-picker">
                  {members.map((m) => (
                    <label key={m.profile_id + m.role} className="check">
                      <input
                        type="checkbox"
                        disabled={m.status !== "active"}
                        checked={m.status === "active" && !unticked.has(key(team.id, m.profile_id))}
                        onChange={() => toggle(key(team.id, m.profile_id))}
                      />
                      {m.full_name} <span className="muted small">({t.roles[m.role] ?? m.role}{m.status !== "active" && `, ${t.inactive}`})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          {data.can.money && data.plans.length > 0 && (
            <label className="check">
              <input type="checkbox" name="copyPlans" defaultChecked />
              {t.copyPlans.replace("{n}", String(data.plans.length))}
            </label>
          )}
          <label className="check">
            <input type="checkbox" name="archiveOld" />
            {t.archiveOld}
          </label>
          <button className="button" disabled={busy}>{t.submit}</button>
        </form>
      )}
    </main>
  );
}
