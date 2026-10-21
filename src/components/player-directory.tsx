"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScopedTeam, ApplyScope } from "./use-scope";
import type { peopleView } from "@/domains/people/service";
import { ageOn } from "@/domains/people/schema";
import { peopleCopy, peopleErrors } from "./people-copy";
import { errors } from "./access-copy";
import { Button, EmptyState, PageHeader } from "./ui";
import { Modal } from "./modal";
import { PlayerImport } from "./player-import";
import { ExportDialog } from "./export-dialog";
import { DataGrid, downloadCsv, postCommand } from "./data-grid";
import { eachRow } from "./table-state";
import { bulkCopy } from "./bulk-copy";
const copy = {
  fr: {
    players: "Joueurs",
    coaches: "Gestion des coachs",
    former: "Anciens joueurs",
    formerCoach: "Anciens coachs",
    active: "Joueurs actuels",
    activeCoach: "Coachs actuels",
    intro: "Les personnes, leurs équipes et leurs informations de jeu.",
    registrations: "Gestion des inscriptions",
    dues: "Cotisations",
    club: "Gestion du club",
    add: "Ajouter un joueur",
    addCoach: "Ajouter un coach",
    existing: "Ajouter une personne déjà connue du club",
    personal: "Informations personnelles",
    game: "Informations de jeu",
    coaching: "Équipes encadrées",
    position: "Poste",
    number: "Numéro de maillot",
    archive: "Vers les anciens joueurs",
    archiveCoach: "Vers les anciens coachs",
    restore: "Réintégrer",
    confirm: "Confirmer le départ",
    restoreConfirm: "Confirmer la réintégration",
    archiveHint:
      "Ce départ clôture les affectations de cette fonction. Le dossier, les cotisations et les autres fonctions sont conservés.",
    restoreHint:
      "La réintégration ne rouvre pas les anciennes affectations : attribuez une équipe si nécessaire.",
    new: "Nouvelle fiche",
    all: "Tous",
    unassigned: "Sans équipe actuelle",
    open: "Voir le profil",
    full: "Fiche complète",
    close: "Fermer la fiche",
    addRole: "Ajouter au répertoire",
    noAccess:
      "Les informations personnelles restent limitées à vos autorisations.",
    count: "personnes",
    positions: ["Gardien", "Défenseur", "Ailier", "Pivot", "Polyvalent"],
    history: "Historique sportif",
    gameSave: "Enregistrer les informations de jeu",
  },
  nl: {
    players: "Spelers",
    coaches: "Coaches beheren",
    former: "Oud-spelers",
    formerCoach: "Voormalige coaches",
    active: "Huidige spelers",
    activeCoach: "Huidige coaches",
    intro: "Personen, teams en sportinformatie.",
    registrations: "Inschrijvingen beheren",
    dues: "Bijdragen",
    club: "Club beheren",
    add: "Speler toevoegen",
    addCoach: "Coach toevoegen",
    existing: "Bestaande persoon toevoegen",
    personal: "Persoonlijke gegevens",
    game: "Sportinformatie",
    coaching: "Begeleide teams",
    position: "Positie",
    number: "Shirtnummer",
    archive: "Naar oud-spelers",
    archiveCoach: "Naar voormalige coaches",
    restore: "Opnieuw opnemen",
    confirm: "Vertrek bevestigen",
    restoreConfirm: "Terugkeer bevestigen",
    archiveHint:
      "Het vertrek sluit toewijzingen voor deze functie. Het dossier, bijdragen en andere functies blijven behouden.",
    restoreHint:
      "Oude toewijzingen worden niet heropend. Wijs zo nodig een team toe.",
    new: "Nieuw dossier",
    all: "Alle",
    unassigned: "Geen huidig team",
    open: "Profiel bekijken",
    full: "Volledige fiche",
    close: "Profiel sluiten",
    addRole: "Aan lijst toevoegen",
    noAccess: "Persoonlijke gegevens blijven beperkt tot uw rechten.",
    count: "personen",
    positions: ["Doelman", "Verdediger", "Vleugelspeler", "Spits", "Allround"],
    history: "Sportgeschiedenis",
    gameSave: "Sportinformatie opslaan",
  },
  en: {
    players: "Players",
    coaches: "Coach management",
    former: "Former players",
    formerCoach: "Former coaches",
    active: "Current players",
    activeCoach: "Current coaches",
    intro: "People, teams and playing information.",
    registrations: "Registration management",
    dues: "Dues",
    club: "Club management",
    add: "Add player",
    addCoach: "Add coach",
    existing: "Add a person already known to the club",
    personal: "Personal information",
    game: "Playing information",
    coaching: "Coached teams",
    position: "Position",
    number: "Shirt number",
    archive: "Move to former players",
    archiveCoach: "Move to former coaches",
    restore: "Reinstate",
    confirm: "Confirm departure",
    restoreConfirm: "Confirm reinstatement",
    archiveHint:
      "Departure closes assignments for this function. Records, dues and other functions are retained.",
    restoreHint:
      "Previous assignments are not reopened. Assign a team if needed.",
    new: "New record",
    all: "All",
    unassigned: "No current team",
    open: "View profile",
    full: "Full profile",
    close: "Close profile",
    addRole: "Add to directory",
    noAccess: "Personal details remain limited to your permissions.",
    count: "people",
    positions: ["Goalkeeper", "Defender", "Winger", "Pivot", "All-rounder"],
    history: "Sport history",
    gameSave: "Save playing information",
  },
};
type View = Awaited<ReturnType<typeof peopleView>>;
type Profile = View["profiles"][number];
export function PlayerDirectory({
  locale,
  role = "player",
  former = false,
  create = false,
  importing = false,
}: {
  locale: Locale;
  role?: "player" | "coach";
  former?: boolean;
  /** Opens the creation window at once (the "Créer" menu of the home page). */
  create?: boolean;
  /** Opens the Excel import at once (Ctrl+K action, wave 15). */
  importing?: boolean;
}) {
  const t = copy[locale],
    p = peopleCopy[locale],
    [data, setData] = useState<View | null>(null),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(create),
    [confirming, setConfirming] = useState(""),
    [q, setQ] = useState(""),
    [position, setPosition] = useState(""),
    [minimum, setMinimum] = useState("");
  const { team, setTeam, differs: teamDiffers, apply: applyTeam } = useScopedTeam();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const route = role === "player" ? "players" : "coaches",
    title =
      role === "player"
        ? former
          ? t.former
          : t.players
        : former
          ? t.formerCoach
          : t.coaches;
  const error = (code: string) =>
    peopleErrors[code]?.[locale] ?? errors[code]?.[locale] ?? p.unavailable;
  async function load() {
    const r = await fetch("/api/people?status=all", { cache: "no-store" }),
      v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/people?status=all", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        return v;
      })
      .then((v) => {
        if (!cancelled) setData(v);
      })
      .catch(() => {
        if (!cancelled) setFailure(p.unavailable);
      });
    return () => {
      cancelled = true;
    };
  }, [p.unavailable]);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      const r = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, organizationId: data?.context.id }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(p.saved);
      return v as { id?: string };
    } catch (e) {
      setFailure(error(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>, fn: (f: FormData) => void) {
    e.preventDefault();
    fn(new FormData(e.currentTarget));
  }
  const isFormer = (r: Profile) =>
    r.former_roles.includes(role) || r.status !== "active";
  const sporting = (r: Profile) =>
    r.directory_roles.includes(role) ||
    r.assignments.some((a) => a.role === role);
  const current = (r: Profile) =>
    r.assignments.filter(
      (a) =>
        a.role === role &&
        (former ||
          (!a.cancelled &&
            !a.closed_at &&
            a.starts_on <= today &&
            (!a.ends_on || a.ends_on >= today))),
    );
  const teamName = (id: string) =>
    data?.teams.find((t) => t.id === id)?.name ?? "—";
  const roster =
    data?.profiles.filter(
      (r) =>
        sporting(r) &&
        isFormer(r) === former &&
        r.full_name.toLocaleLowerCase().includes(q.toLocaleLowerCase()) &&
        (!team || current(r).some((a) => a.team_id === team)) &&
        (!position || r.playing_position === position) &&
        (!minimum ||
          (r.birth_date && ageOn(r.birth_date, today) >= Number(minimum))),
    ) ?? [];
  const teamsOf = (r: Profile) => [...new Set(current(r).map((a) => a.team_id))];
  const positionOf = (r: Profile) =>
    r.playing_position ||
    current(r)
      .map((a) => a.position)
      .filter(Boolean)
      .join(", ");
  const ageOf = (r: Profile) => (r.birth_date ? ageOn(r.birth_date, today) : null);
  // Teams one may still join: not archived, season not over.
  const openTeams = data?.teams.filter((x) => !x.archived && !x.season_archived && x.ends_on >= today) ?? [];
  const b = bulkCopy[locale];
  const person = data?.profiles.find((r) => r.id === selected),
    manager = !!data?.capabilities.peopleManage,
    teamsManage = !!data?.capabilities.teamsManage;
  const feedback = (
    <>
      {failure && <p role="alert">{failure}</p>}
      {message && <p role="status">{message}</p>}
    </>
  );
  function personalFields(r?: Profile) {
    return (
      <>
        <label>
          {p.name}
          <input
            name="fullName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={r?.full_name}
          />
        </label>
        <label>
          {p.birth}
          <input
            name="birthDate"
            type="date"
            max={today}
            defaultValue={r?.birth_date ?? ""}
          />
        </label>
        <label>
          {p.email}
          <input name="email" type="email" defaultValue={r?.email ?? ""} />
        </label>
        <label>
          {p.phone}
          <input name="phone" maxLength={40} defaultValue={r?.phone ?? ""} />
        </label>
        <label>
          {p.joined}
          <input
            name="joinedOn"
            type="date"
            required
            max={today}
            defaultValue={r?.joined_on ?? today}
          />
        </label>
      </>
    );
  }
  const personal = (f: FormData) => ({
    fullName: f.get("fullName"),
    birthDate: f.get("birthDate") || null,
    email: f.get("email") || "",
    phone: f.get("phone") || "",
    joinedOn: f.get("joinedOn"),
  });
  async function archive(r: Profile) {
    if (confirming !== r.id) {
      setConfirming(r.id);
      return;
    }
    if (
      await send({
        action: "directoryArchive",
        id: r.id,
        role,
        archived: !former,
      })
    ) {
      setConfirming("");
      setSelected("");
    }
  }
  return (
    <main id="main" className="access player-directory">
      <PageHeader title={title} subtitle={data?.context.name ?? t.intro} actions={<><div className="directory-actions">
          <Link
            className="button secondary"
            href={`/${locale}/${data?.capabilities.registrationsManage ? "registrations" : "registrations/mine"}`}
          >
            {data?.capabilities.registrationsManage
              ? t.registrations
              : locale === "fr"
                ? "Mes inscriptions"
                : locale === "nl"
                  ? "Mijn inschrijvingen"
                  : "My applications"}
          </Link>
          <Link className="button secondary" href={`/${locale}/dues`}>
            {t.dues}
          </Link>
          <Link
            className="button secondary"
            href={`/${locale}/${route}${former ? "" : "/former"}`}
          >
            {role === "player"
              ? former
                ? t.active
                : t.former
              : former
                ? t.activeCoach
                : t.formerCoach}
          </Link>
          {manager && !former && data && (
            <PlayerImport
              locale={locale}
              role={role}
              initiallyOpen={importing}
              organizationId={data.context.id}
              teams={data.teams.filter(
                (x) => !x.archived && !x.season_archived,
              )}
              done={(text) => {
                void load().then(() => setMessage(text));
              }}
            />
          )}
          {manager && !former && (
            <Button
              onClick={() => {
                setCreating(true);
                setFailure("");
                setMessage("");
              }}
            >
              {role === "player" ? t.add : t.addCoach}
            </Button>
          )}
        </div></>} />
      {!person && !creating && feedback}
      {!data && (
        <p>
          <Link href={`/${locale}/access`}>{p.missing}</Link>
        </p>
      )}
      {data && (
        <>
          {role === "coach" && manager && (
            <p className="notice">
              {locale === "fr"
                ? "Une fiche de coach ne crée pas de compte ni de droits de connexion. Les invitations et accès se gèrent dans Mon espace."
                : locale === "nl"
                  ? "Een coachfiche maakt geen account of toegangsrechten aan. Beheer uitnodigingen en rechten in Mijn ruimte."
                  : "A coach record does not create an account or grant sign-in permissions. Manage invitations and access in My space."}{" "}
              <Link href={`/${locale}/access`}>
                {locale === "fr"
                  ? "Mon espace"
                  : locale === "nl"
                    ? "Mijn ruimte"
                    : "My space"}
              </Link>
            </p>
          )}
          <form
            className="directory-filters"
            onSubmit={(e) => e.preventDefault()}
          >
            <label>
              {p.search}
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={p.name}
              />
            </label>
            <div className="directory-field">
              <label htmlFor="directory-team">{p.team}</label>
              <select id="directory-team" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">{t.all}</option>
                {data.teams.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <ApplyScope locale={locale} differs={teamDiffers} apply={applyTeam} />
            </div>
            {role === "player" && (
              <label>
                {t.position}
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="">{t.all}</option>
                  {[
                    ...new Set(
                      data.profiles
                        .filter(sporting)
                        .map((r) => r.playing_position)
                        .filter(Boolean),
                    ),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            {data.capabilities.peopleRead && (
              <label>
                {p.minAge}
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                />
              </label>
            )}
          </form>
          <div className="directory-meta">
            <p>
              {roster.length} {t.count}
            </p>
            {data.capabilities.canExport && (
              <ExportDialog
                locale={locale}
                query={`organizationId=${data.context.id}&status=all&directoryRole=${role}&former=${former}&q=${encodeURIComponent(q)}&team=${team}&playingPosition=${encodeURIComponent(position)}${minimum ? "&minAge=" + minimum : ""}`}
              />
            )}
          </div>
          <DataGrid
            locale={locale}
            label={title}
            caption={title}
            className="directory-table"
            storageKey={route}
            rows={roster}
            rowId={(r) => r.id}
            rowName={(r) => r.full_name}
            onDone={load}
            reasons={b.reasons}
            columns={[
              {
                key: "name",
                header: p.name,
                rowHeader: true,
                hideable: false,
                sort: (r) => r.full_name,
                cell: (r) => (
                  <button
                    className="person-link"
                    onClick={() => {
                      setSelected(r.id);
                      setFailure("");
                      setMessage("");
                    }}
                  >
                    <span className="avatar" aria-hidden="true">
                      {r.full_name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")}
                    </span>
                    {r.full_name}
                  </button>
                ),
              },
              {
                key: "team",
                header: p.team,
                className: "tag-cell",
                sort: (r) => teamsOf(r).map(teamName).join(", "),
                cell: (r) =>
                  teamsOf(r).length
                    ? teamsOf(r).map((id) => (
                        <span key={id} className="team-chip" data-color={data?.teams.find((x) => x.id === id)?.color ?? "none"}>
                          <span className="team-dot" aria-hidden="true" />
                          {teamName(id)}
                        </span>
                      ))
                    : t.unassigned,
              },
              ...(role === "player"
                ? [
                    { key: "position", header: t.position, sort: positionOf, cell: (r: Profile) => positionOf(r) || "—" },
                    { key: "number", header: t.number, sort: (r: Profile) => r.jersey_number, cell: (r: Profile) => r.jersey_number ?? "—" },
                  ]
                : []),
              { key: "age", header: p.age, sort: ageOf, cell: (r) => ageOf(r) ?? "—" },
              {
                key: "actions",
                header: p.actions,
                hideable: false,
                cell: (r) => (
                  <>
                    <div className="row-actions">
                      <button className="text-button" aria-label={`${t.open} : ${r.full_name}`} onClick={() => setSelected(r.id)}>
                        {t.open} →
                      </button>
                      <Link className="text-button" href={`/${locale}/${role === "player" ? "players" : "coaches"}/${r.id}`} aria-label={`${t.full} : ${r.full_name}`}>
                        {t.full}
                      </Link>
                      {manager && r.status === "active" && (
                        <button className="button secondary" disabled={busy} onClick={() => void archive(r)}>
                          {confirming === r.id ? (former ? t.restoreConfirm : t.confirm) : former ? t.restore : role === "player" ? t.archive : t.archiveCoach}
                        </button>
                      )}
                    </div>
                    {confirming === r.id && <p>{former ? t.restoreHint : t.archiveHint}</p>}
                  </>
                ),
              },
            ]}
            actions={[
              {
                id: "assign",
                label: b.assign,
                icon: "team",
                hidden: !teamsManage || former,
                choose: { label: b.team, options: openTeams.map((x) => ({ value: x.id, label: x.name })) },
                run: (rows, teamId) => {
                  const team = openTeams.find((x) => x.id === teamId);
                  const startsOn = team && team.starts_on > today ? team.starts_on : today;
                  return eachRow(rows, (r) => r.id, async (r) => {
                    await postCommand("/api/people", { organizationId: data.context.id, action: "assign", teamId, profileId: r.id, role, position: "", startsOn, endsOn: null });
                  });
                },
              },
              {
                id: "email",
                label: b.email,
                icon: "message",
                hidden: !manager,
                run: async (rows) => {
                  const results = rows.map((r) => (r.email ? { id: r.id, ok: true as const } : { id: r.id, ok: false as const, code: "NO_EMAIL" }));
                  const to = rows.map((r) => r.email).filter(Boolean);
                  if (to.length) window.location.href = `mailto:?bcc=${to.map((e) => encodeURIComponent(e!)).join(",")}`;
                  return results;
                },
              },
              {
                id: "export",
                label: b.export,
                icon: "document",
                hidden: !data.capabilities.canExport,
                run: async (rows) => {
                  downloadCsv(`${route}-${today}`, [p.name, p.team, ...(role === "player" ? [t.position, t.number] : []), p.age], rows.map((r) => [r.full_name, teamsOf(r).map(teamName).join(", "), ...(role === "player" ? [positionOf(r), r.jersey_number ?? ""] : []), ageOf(r) ?? ""]));
                },
              },
              {
                id: "archive",
                label: former ? b.restore : b.archive,
                icon: "user",
                hidden: !manager,
                confirm: former ? b.restoreConfirm : b.archiveConfirm,
                run: (rows) =>
                  eachRow(rows, (r) => r.id, async (r) => {
                    await postCommand("/api/people", { organizationId: data.context.id, action: "directoryArchive", id: r.id, role, archived: !former });
                  }),
              },
            ]}
          />
          {!roster.length && <EmptyState title={p.empty} />}
          {manager && !former && (
            <details className="panel">
              <summary>{t.existing}</summary>
              <form
                onSubmit={(e) =>
                  submit(e, (f) => {
                    void send({
                      action: "directoryRole",
                      id: f.get("id"),
                      role,
                    });
                  })
                }
              >
                <label>
                  {p.person}
                  <select name="id" required>
                    <option value="">{p.person}</option>
                    {data.profiles
                      .filter((r) => !sporting(r) && r.status === "active")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.full_name}
                        </option>
                      ))}
                  </select>
                </label>
                <Button disabled={busy}>{t.addRole}</Button>
              </form>
            </details>
          )}
        </>
      )}
      {creating && (
        <Modal
          title={role === "player" ? t.add : t.addCoach}
          close={() => setCreating(false)}
        >
          {feedback}
          <form
            onSubmit={(e) =>
              submit(e, (f) => {
                void send({
                  action: "createPerson",
                  ...personal(f),
                  directoryRoles: [role],
                }).then((r) => {
                  if (r?.id) {
                    setCreating(false);
                    setSelected(r.id);
                  }
                });
              })
            }
          >
            <h3>{t.personal}</h3>
            {personalFields()}
            <Button disabled={busy}>{p.create}</Button>
          </form>
        </Modal>
      )}
      {person && (
        <Modal
          title={person.full_name}
          close={() => {
            setSelected("");
            setConfirming("");
          }}
        >
          {feedback}
          <section>
            <h3>{t.personal}</h3>
            {person.detailed ? (
              manager ? (
                <form
                  key={person.id + "-" + person.version}
                  onSubmit={(e) =>
                    submit(e, (f) => {
                      void send({
                        action: "updatePerson",
                        id: person.id,
                        version: person.version,
                        ...personal(f),
                      });
                    })
                  }
                >
                  {personalFields(person)}
                  <Button disabled={busy}>{p.save}</Button>
                </form>
              ) : (
                <>
                  <dl>
                    <dt>{p.name}</dt>
                    <dd>{person.full_name}</dd>
                    <dt>{p.birth}</dt>
                    <dd>{person.birth_date ?? "—"}</dd>
                    <dt>{p.email}</dt>
                    <dd>{person.email || "—"}</dd>
                    <dt>{p.phone}</dt>
                    <dd>{person.phone || "—"}</dd>
                  </dl>
                  {person.can_edit && (
                    <form
                      key={"contacts-" + person.id + "-" + person.version}
                      onSubmit={(e) =>
                        submit(e, (f) => {
                          void send({
                            action: "contacts",
                            id: person.id,
                            version: person.version,
                            email: f.get("email"),
                            phone: f.get("phone"),
                          });
                        })
                      }
                    >
                      <label>
                        {p.email}
                        <input
                          name="email"
                          type="email"
                          defaultValue={person.email ?? ""}
                        />
                      </label>
                      <label>
                        {p.phone}
                        <input
                          name="phone"
                          maxLength={40}
                          defaultValue={person.phone ?? ""}
                        />
                      </label>
                      <Button disabled={busy}>{p.save}</Button>
                    </form>
                  )}
                </>
              )
            ) : (
              <p>{t.noAccess}</p>
            )}
          </section>
          <section>
            <h3>{role === "player" ? t.game : t.coaching}</h3>
            {role === "player" &&
              (teamsManage && !isFormer(person) ? (
                <form
                  key={"game-" + person.id + "-" + person.version}
                  onSubmit={(e) =>
                    submit(e, (f) => {
                      void send({
                        action: "gameInfo",
                        id: person.id,
                        version: person.version,
                        position: f.get("position"),
                        jerseyNumber:
                          f.get("number") === ""
                            ? null
                            : Number(f.get("number")),
                      });
                    })
                  }
                >
                  <label>
                    {t.position}
                    <input
                      name="position"
                      maxLength={80}
                      list="playing-positions"
                      defaultValue={person.playing_position}
                    />
                    <datalist id="playing-positions">
                      {t.positions.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    {t.number}
                    <input
                      name="number"
                      type="number"
                      min="0"
                      max="99"
                      defaultValue={person.jersey_number ?? ""}
                    />
                  </label>
                  <Button disabled={busy}>{t.gameSave}</Button>
                </form>
              ) : (
                <p>
                  {t.position}: {person.playing_position || "—"} · {t.number}:{" "}
                  {person.jersey_number ?? "—"}
                </p>
              ))}
            <h4>{t.history}</h4>
            <ul>
              {person.assignments
                .filter((a) => a.role === role)
                .map((a) => (
                  <li key={a.id}>
                    {teamName(a.team_id)} · {a.position || "—"} · {a.starts_on}{" "}
                    → {a.ends_on ?? "—"}
                    {a.closed_at || a.cancelled ? ` · ${p.archived}` : ""}
                  </li>
                ))}
            </ul>
            {!person.assignments.some((a) => a.role === role) && (
              <p>{t.unassigned}</p>
            )}
            {teamsManage && !isFormer(person) && (
              <form
                onSubmit={(e) =>
                  submit(e, (f) => {
                    void send({
                      action: "assign",
                      profileId: person.id,
                      teamId: f.get("team"),
                      role,
                      position: f.get("position") || "",
                      startsOn: f.get("from"),
                      endsOn: f.get("until") || null,
                    });
                  })
                }
              >
                <label>
                  {p.team}
                  <select name="team" required>
                    {data?.teams
                      .filter((v) => !v.archived && !v.season_archived)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ·{" "}
                          {data.seasons.find((s) => s.id === v.season_id)?.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {t.position}
                  <input
                    name="position"
                    maxLength={80}
                    defaultValue={person.playing_position}
                  />
                </label>
                <label>
                  {p.from}
                  <input
                    name="from"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </label>
                <label>
                  {p.until}
                  <input name="until" type="date" />
                </label>
                <Button
                  disabled={
                    busy ||
                    !data?.teams.some((v) => !v.archived && !v.season_archived)
                  }
                >
                  {p.assign}
                </Button>
              </form>
            )}
          </section>
          <div className="directory-actions">
            <Link
              className="button"
              href={`/${locale}/${role === "player" ? "players" : "coaches"}/${person.id}`}
            >
              {t.full}
            </Link>
            <Link className="button secondary" href={`/${locale}/dues`}>
              {t.dues}
            </Link>
            <Link
              className="button secondary"
              href={`/${locale}/${data?.capabilities.registrationsManage ? "registrations" : "registrations/mine"}`}
            >
              {data?.capabilities.registrationsManage
                ? t.registrations
                : locale === "fr"
                  ? "Mes inscriptions"
                  : locale === "nl"
                    ? "Mijn inschrijvingen"
                    : "My applications"}
            </Link>
            <button
              className="button secondary"
              onClick={() => setSelected("")}
            >
              {t.close}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
