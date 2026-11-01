"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScopedTeam, ApplyScope } from "./use-scope";
import type { peopleView } from "@/domains/people/service";
import { ageOn } from "@/domains/people/schema";
import { peopleCopy, peopleErrors } from "./people-copy";
import { errors } from "./access-copy";
import { Badge, Button, EmptyState, PageHeader } from "./ui";
import { Modal } from "./modal";
import { SheetDialog, DepartureDialog } from "./player-sheet";
import { fillIn, sheetCopy } from "./player-sheet-copy";
import { PlayerImport } from "./player-import";
import { ExportDialog } from "./export-dialog";
import { DataGrid, downloadCsv, postCommand } from "./data-grid";
import { eachRow } from "./table-state";
import { bulkCopy } from "./bulk-copy";
import { setupCopy } from "./setup-copy";
import { InviteFields, isMinor } from "./invite-fields";
import { coachSpaceCopy } from "./coach-space-copy";
import type { TrainingState } from "@/domains/licences/schema";

/** Wave 17 (O1): « Formé » (course and date in the tooltip), « En attente de validation » or « Non formé ». */
function TrainingBadge({ locale, state }: { locale: Locale; state: TrainingState | null | undefined }) {
  const t = coachSpaceCopy[locale];
  if (state?.status === "trained") {
    const date = state.on
      ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(state.on + "T12:00:00Z"))
      : "";
    const tip = t.trainedTip.replace("{title}", state.title).replace("{date}", date);
    return (
      <span className="training-badge" title={tip}>
        <Badge tone="success">{t.trained}</Badge>
        <span className="sr-only"> · {tip}</span>
      </span>
    );
  }
  if (state?.status === "pending") {
    const tip = t.pendingTip.replace("{title}", state.title);
    return (
      <span className="training-badge" title={tip}>
        <Badge tone="warning">{t.pending}</Badge>
        <span className="sr-only"> · {tip}</span>
      </span>
    );
  }
  return <Badge tone="neutral">{t.untrained}</Badge>;
}
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
    addRole: "Ajouter au répertoire",
    count: "personnes",
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
    addRole: "Aan lijst toevoegen",
    count: "personen",
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
    addRole: "Add to directory",
    count: "people",
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
    [inviting, setInviting] = useState(true),
    [newBirth, setNewBirth] = useState(""),
    [importKey, setImportKey] = useState(0),
    [confirming, setConfirming] = useState(""),
    [q, setQ] = useState(""),
    [position, setPosition] = useState(""),
    // Wave 17 (J1): the departure window (reason and note), for a departure or a later change.
    [leaving, setLeaving] = useState<{ id: string; mode: "leave" | "edit" } | null>(null);
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
        (!position || r.playing_position === position),
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
    // Leaving: the departure window asks why. Coming back: a confirmation.
    if (!former) {
      setLeaving({ id: r.id, mode: "leave" });
      return;
    }
    if (confirming !== r.id) {
      setConfirming(r.id);
      return;
    }
    if (await send({ action: "directoryArchive", id: r.id, role, archived: false })) {
      setConfirming("");
      setSelected("");
    }
  }
  const sc = sheetCopy[locale];
  const space = coachSpaceCopy[locale];
  const situationText = (r: Profile) => {
    const x = r.situation;
    if (!x) return "—";
    if (x.kind === "deceased") return sc.statuses.deceased;
    if (x.kind === "club") return x.team ? fillIn(sc.playsAtTeam, { club: x.club, team: x.team }) : fillIn(sc.playsAt, { club: x.club });
    if (x.kind === "team") return fillIn(sc.otherTeam, { teams: x.teams.join(", ") });
    return sc.statuses[x.status];
  };
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
              key={importKey}
              locale={locale}
              role={role}
              canInvite={!!data.capabilities.invite}
              initiallyOpen={importing || importKey > 0}
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
          {role === "coach" && manager && !data.capabilities.invite && (
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
          </form>
          <div className="directory-meta">
            <p>
              {roster.length} {t.count}
            </p>
            {data.capabilities.canExport && (
              <ExportDialog
                locale={locale}
                query={`organizationId=${data.context.id}&status=all&directoryRole=${role}&former=${former}&q=${encodeURIComponent(q)}&team=${team}&playingPosition=${encodeURIComponent(position)}`}
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
              ...(role === "coach" && !former
                ? [
                    {
                      key: "training",
                      header: space.training,
                      sort: (r: Profile) => (r.training?.status === "trained" ? 0 : r.training?.status === "pending" ? 1 : 2),
                      cell: (r: Profile) => <TrainingBadge locale={locale} state={r.training} />,
                    },
                  ]
                : []),
              { key: "age", header: p.age, sort: ageOf, cell: (r) => ageOf(r) ?? "—" },
              ...(former
                ? [
                    {
                      key: "situation",
                      header: sc.situation,
                      sort: situationText,
                      cell: (r: Profile) =>
                        r.situation?.kind === "deceased" ? (
                          <Badge tone="neutral">{sc.inMemoriam}</Badge>
                        ) : (
                          <span className={r.situation?.kind === "club" || r.situation?.kind === "team" ? undefined : "muted"}>{situationText(r)}</span>
                        ),
                    },
                  ]
                : []),
              {
                key: "actions",
                header: p.actions,
                hideable: false,
                cell: (r) => (
                  <>
                    <div className="row-actions">
                      <button className="text-button" aria-label={fillIn(sc.viewOf, { name: r.full_name })} onClick={() => setSelected(r.id)}>
                        {sc.view} →
                      </button>
                      {manager && former && (
                        <button className="text-button" aria-label={fillIn(sc.editSituationOf, { name: r.full_name })} onClick={() => setLeaving({ id: r.id, mode: "edit" })}>
                          {sc.editSituation}
                        </button>
                      )}
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
          {!roster.length && (
            <EmptyState
              title={p.empty}
              action={
                manager &&
                !former &&
                role === "player" && (
                  <button className="button" type="button" onClick={() => setImportKey((k) => k + 1)}>
                    {setupCopy[locale].empty.players}
                  </button>
                )
              }
            />
          )}
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
            onChange={(e) => {
              const field = e.target;
              if (field instanceof HTMLInputElement && field.name === "birthDate") setNewBirth(field.value);
            }}
            onSubmit={(e) =>
              submit(e, (f) => {
                const invite = !!data?.capabilities.invite && inviting;
                void send({
                  action: "createPerson",
                  ...personal(f),
                  directoryRoles: [role],
                  invite,
                  ...(invite && f.get("guardianEmail") ? { guardianName: f.get("guardianName"), guardianEmail: f.get("guardianEmail") } : {}),
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
            {data?.capabilities.invite && <InviteFields locale={locale} on={inviting} setOn={setInviting} minor={role === "player" && isMinor(newBirth)} />}
            <Button disabled={busy}>{p.create}</Button>
          </form>
        </Modal>
      )}
      {person && (
        <SheetDialog
          locale={locale}
          id={person.id}
          name={person.full_name}
          role={role}
          close={() => {
            setSelected("");
            setConfirming("");
          }}
          onChanged={() => void load()}
        />
      )}
      {leaving && data && (
        <DepartureDialog
          locale={locale}
          person={data.profiles.find((r) => r.id === leaving.id)!}
          mode={leaving.mode}
          president={data.context.role === "club_president"}
          busy={busy}
          close={() => setLeaving(null)}
          save={async (v) => {
            const ok =
              leaving.mode === "leave" && v.status !== "deceased"
                ? await send({ action: "directoryArchive", id: leaving.id, role, archived: true, departureStatus: v.status, departureNote: v.note })
                : await send({ action: "departure", id: leaving.id, status: v.status, note: v.note, confirm: v.confirm });
            if (ok) setLeaving(null);
          }}
        />
      )}
    </main>
  );
}
