import { mfaSatisfied } from "../../lib/security-policy";
import { keyCounts, keysOnDeparture, seesAllKeys } from "../keys/service";
import { csvRows } from "./csv";
import { defaultColumns, exportGrid, type ExportColumn } from "./export";
import { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  account,
  active,
  audit,
  requirePermission,
  AccessError,
  type Principal,
} from "../access/service";
import { offerUndo } from "../undo/service";
import { inviteProfile } from "../access/invite";
import { permissions, type Permission } from "../access/policy";
import { trainingState } from "../licences/schema";
import {
  ageOn,
  orderedDates,
  peopleCommand,
  representativeRelations,
  type representativeSchema,
  type DepartureStatus,
  type PeopleCommand,
} from "./schema";
export { peopleCommand };
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const filterSchema = z.object({
  playingPosition: z.string().max(80).default(""),
  directoryRole: z.enum(["", "player", "coach"]).default(""),
  former: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(120).default(""),
  status: z
    .enum(["active", "inactive", "archived", "transferred", "all"])
    .default("active"),
  team: z.union([z.uuid(), z.literal("")]).default(""),
  season: z.union([z.uuid(), z.literal("")]).default(""),
  sportRole: z
    .enum(["", "player", "coach", "assistant", "volunteer"])
    .default(""),
  minAge: z.coerce.number().int().min(0).max(120).optional(),
  maxAge: z.coerce.number().int().min(0).max(120).optional(),
  joinedBefore: z.iso.date().optional(),
});
export type Filters = z.infer<typeof filterSchema>;
type Context = Awaited<ReturnType<typeof active>>;
type User = Awaited<ReturnType<typeof account>>;
type Scope = {
  client: PoolClient;
  p: Principal;
  user: User;
  context: Context;
  rights: Permission[];
};
type Profile = {
  directory_roles: string[];
  former_roles: string[];
  playing_position: string;
  jersey_number: number | null;
  id: string;
  organization_id: string;
  person_id: string;
  user_id: string | null;
  full_name: string;
  birth_date: string | null;
  email: string | null;
  phone: string;
  joined_on: string;
  status: string;
  version: number;
  /** Wave 17 (J1): why the person left (null while in the club). */
  departure_status: DepartureStatus | null;
  departure_note: string;
};
type Relation = {
  id: string;
  guardian_profile_id: string;
  subject_profile_id: string;
  kind: "declared" | "legal_verified" | "delegated_aid";
  can_view: boolean;
  can_edit: boolean;
  starts_on: string;
  ends_on: string | null;
  revoked_at: string | null;
  authorization_note: string;
};
type Team = {
  id: string;
  season_id: string;
  name: string;
  category: string;
  level: string;
  home_location: string;
  archived: boolean;
  /** Palette key of the team (wave 12), null when none. */
  color: string | null;
  staff_contact_id: string | null;
  starts_on: string;
  ends_on: string;
  season_archived: boolean;
};
type Assignment = {
  id: string;
  team_id: string;
  profile_id: string;
  role: string;
  position: string;
  starts_on: string;
  ends_on: string | null;
  cancelled: boolean;
  closed_at: string | null;
};
function right(s: Scope, p: Permission) {
  requirePermission(
    s.context.role,
    s.context.grants,
    p,
    mfaSatisfied(!!s.user.twoFactorEnabled),
  );
}
function currentDates(start: string, end: string | null, day = today()) {
  return start <= day && (!end || end >= day);
}
function relationAllows(r: Relation, subject: Profile, edit = false) {
  return (
    !r.revoked_at &&
    r.kind !== "declared" &&
    r.can_view &&
    (!edit || r.can_edit) &&
    currentDates(r.starts_on, r.ends_on) &&
    !!subject.birth_date &&
    (r.kind !== "legal_verified" || ageOn(subject.birth_date, today()) < 18)
  );
}
/**
 * Wave 16 (I2): the invitation that goes with a new file. An adult gets it at
 * their own address; for a minor player it goes to the parent, whose account
 * will be linked to the child. Without an address nothing is sent (false).
 */
async function inviteWith(
  s: Scope,
  i: { profileId: string; role: "player" | "coach"; fullName: string; birthDate: string | null; email: string; teamId?: string | null; guardian?: { id: string; name: string; email: string } },
) {
  const org = s.context.organization_id;
  const minor = !!i.birthDate && ageOn(i.birthDate, today()) < 18;
  const to = minor ? (i.role === "player" ? i.guardian?.email : "") : i.email;
  if (!to) return false;
  const profileId = minor ? i.guardian!.id : i.profileId;
  // One live invitation per file and address is enough.
  if (
    (
      await s.client.query(
        "SELECT 1 FROM invitation WHERE organization_id=$1 AND profile_id=$2 AND lower(email)=lower($3) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()",
        [org, profileId, to],
      )
    ).rowCount
  )
    return false;
  await inviteProfile(s.client, org, s.p.userId, {
    email: to,
    role: minor ? "guardian" : i.role,
    profileId,
    teamId: i.teamId ?? null,
    guardianOf: minor ? i.profileId : null,
    greeting: (minor ? i.guardian!.name : i.fullName).trim().split(/\s+/)[0] ?? "",
  });
  return true;
}
/**
 * 8: the representatives of a new player: a person already known to the
 * club (a sibling's parent) or a new one, linked as legal representative
 * (declared until they accept the invitation, as since wave 16) or as a
 * delegated carer (sees the file until the end of the season). The relation
 * (mother, father…) is kept in the link's note.
 */
const relationWords: Record<(typeof representativeRelations)[number], string> = {
  mother: "mère",
  father: "père",
  guardian: "tuteur",
  administrator: "administrateur",
  carer: "aidant",
  other: "autre",
};
async function addRepresentatives(
  s: Scope,
  player: string,
  command: { joinedOn: string; fullName: string; phone: string },
  reps: z.infer<typeof representativeSchema>[],
) {
  const org = s.context.organization_id,
    c = s.client;
  const out: { id: string; name: string; email: string; locale: string }[] = [];
  const seen = new Set<string>();
  for (const r of reps) {
    let id: string, name: string, mail: string;
    if (r.existingId) {
      const known = (await c.query("SELECT id,full_name,COALESCE(email,'') AS email FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [r.existingId, org])).rows[0];
      if (!known) throw new AccessError("NOT_FOUND", 404);
      id = known.id;
      name = known.full_name;
      mail = r.email || known.email;
    } else {
      name = (r.fullName ?? "").trim();
      if (name.length < 2) throw new AccessError("REPRESENTATIVE_NAME_REQUIRED", 400);
      mail = r.email ?? "";
      const person = (await c.query("INSERT INTO person(locale) VALUES($1) RETURNING id", [r.locale === "nl" ? "nl" : "fr"])).rows[0].id;
      id = (
        await c.query("INSERT INTO club_person(organization_id,person_id,full_name,email,phone,joined_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [org, person, name, mail || null, r.phone ?? "", command.joinedOn])
      ).rows[0].id;
    }
    if (seen.has(id) || id === player) throw new AccessError("INVALID_INPUT", 400);
    seen.add(id);
    const note = `Lien : ${relationWords[r.relation]}, donné à l'ajout du joueur`;
    if (r.rights === "legal")
      await c.query(
        "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'declared',false,false,$4,$5,$6)",
        [org, id, player, command.joinedOn, note, s.p.userId],
      );
    else
      await c.query(
        `INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,ends_on,authorization_note,verified_by)
         VALUES($1,$2,$3,'delegated_aid',true,false,$4,COALESCE((SELECT max(ends_on) FROM season WHERE organization_id=$1 AND NOT archived AND ends_on>=$4::date),$4::date+365),$5,$6)`,
        [org, id, player, command.joinedOn, note, s.p.userId],
      );
    out.push({ id, name, email: mail, locale: r.locale ?? "fr" });
  }
  return out;
}
/** 8: one invitation per representative and address, to manage the player's file. */
async function inviteRepresentative(s: Scope, player: string, r: { id: string; name: string; email: string }) {
  const org = s.context.organization_id;
  if (
    (await s.client.query("SELECT 1 FROM invitation WHERE organization_id=$1 AND profile_id=$2 AND lower(email)=lower($3) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()", [org, r.id, r.email]))
      .rowCount
  )
    return false;
  await inviteProfile(s.client, org, s.p.userId, {
    email: r.email,
    role: "guardian",
    profileId: r.id,
    guardianOf: player,
    greeting: r.name.trim().split(/\s+/)[0] ?? "",
  });
  return true;
}
function adult(profile: Profile) {
  return !!profile.birth_date && ageOn(profile.birth_date, today()) >= 18;
}
async function transaction<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: Scope) => Promise<T>,
  transferToken?: string,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const initial = await active(client, p);
    const orgs = [initial.organization_id];
    if (transferToken) {
      const source = await client.query(
        "SELECT source_organization_id FROM person_transfer WHERE token_hash=$1",
        [createHash("sha256").update(transferToken).digest("hex")],
      );
      if (source.rowCount) orgs.push(source.rows[0].source_organization_id);
    }
    await client.query(
      `SELECT id FROM organization WHERE id=ANY($1::uuid[]) ORDER BY id FOR ${write ? "UPDATE" : "SHARE"}`,
      [orgs],
    );
    await client.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const user = await account(client, p),
      context = await active(client, p);
    if (initial.organization_id !== context.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (context.kind !== "club") throw new AccessError("CLUB_ONLY");
    const result = await fn({
      client,
      p,
      user,
      context,
      rights: permissions(context.role, context.grants),
    });
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new AccessError("DUPLICATE", 409);
    if (code === "23503") throw new AccessError("NOT_FOUND", 404);
    if (code === "23514") throw new AccessError("INVALID_INPUT", 400);
    throw e;
  } finally {
    client.release();
  }
}
async function records(s: Scope) {
  const org = s.context.organization_id;
  const profiles = (
    await s.client.query(
      `SELECT c.*,c.birth_date::text,c.joined_on::text,p.user_id FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 ORDER BY c.full_name,c.id`,
      [org],
    )
  ).rows as Profile[];
  const relations = (
    await s.client.query(
      "SELECT r.*,r.starts_on::text,r.ends_on::text FROM guardian_relationship r WHERE organization_id=$1",
      [org],
    )
  ).rows as Relation[];
  const teams = (
    await s.client.query(
      // Current players of each team, compared with its places when moving someone (wave 16, R1).
      "SELECT t.*,s.starts_on::text,s.ends_on::text,s.archived AS season_archived,(SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=t.id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active') AS players FROM team t JOIN season s ON s.id=t.season_id AND s.organization_id=t.organization_id WHERE t.organization_id=$1 ORDER BY s.starts_on DESC,t.name",
      [org],
    )
  ).rows as Team[];
  const assignments = (
    await s.client.query(
      "SELECT a.*,a.starts_on::text,a.ends_on::text FROM team_membership a WHERE organization_id=$1 ORDER BY a.starts_on DESC",
      [org],
    )
  ).rows as Assignment[];
  return { profiles, relations, teams, assignments };
}
function visibility(s: Scope, all: Awaited<ReturnType<typeof records>>) {
  const full =
    s.rights.includes("people.read") || s.rights.includes("people.manage");
  if (full || s.rights.includes("teams.manage") || s.context.role === "coach") {
    if (!mfaSatisfied(!!s.user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
  }
  const own = all.profiles.find(
    (p) => p.user_id === s.p.userId && p.status === "active",
  );
  const authorizedRelations =
    s.context.role === "guardian" && own
      ? all.relations.filter(
          (r) =>
            r.guardian_profile_id === own.id &&
            all.profiles.some(
              (p) =>
                p.id === r.subject_profile_id &&
                p.status === "active" &&
                relationAllows(r, p),
            ),
        )
      : [];
  const visibleTeams = new Set<string>();
  if (full || s.rights.includes("teams.manage"))
    all.teams.forEach((t) => visibleTeams.add(t.id));
  else if (s.context.role === "coach" && own) {
    if (s.context.team_id) {
      if (
        all.teams.some(
          (t) =>
            t.id === s.context.team_id &&
            !t.archived &&
            !t.season_archived &&
            currentDates(t.starts_on, t.ends_on),
        )
      )
        visibleTeams.add(s.context.team_id);
    } else
      all.assignments
        .filter(
          (a) =>
            a.profile_id === own.id &&
            ["coach", "assistant"].includes(a.role) &&
            !a.cancelled &&
            !a.closed_at &&
            currentDates(a.starts_on, a.ends_on) &&
            all.teams.some(
              (t) =>
                t.id === a.team_id &&
                !t.archived &&
                !t.season_archived &&
                currentDates(t.starts_on, t.ends_on),
            ),
        )
        .forEach((a) => visibleTeams.add(a.team_id));
  }
  const subjects = new Set([
    ...(own ? [own.id] : []),
    ...authorizedRelations.map((r) => r.subject_profile_id),
  ]);
  const details = new Set(full ? all.profiles.map((p) => p.id) : [...subjects]);
  if (s.context.role !== "coach")
    all.assignments
      .filter((a) => subjects.has(a.profile_id))
      .forEach((a) => visibleTeams.add(a.team_id));
  const visibleProfiles = new Set(
    full || s.rights.includes("teams.manage")
      ? all.profiles.map((p) => p.id)
      : [...subjects],
  );
  if (s.context.role === "coach")
    all.assignments
      .filter((a) => visibleTeams.has(a.team_id))
      .forEach((a) => {
        if (
          all.profiles.some(
            (p) => p.id === a.profile_id && p.status === "active",
          )
        )
          visibleProfiles.add(a.profile_id);
      });
  return {
    full,
    own,
    authorizedRelations,
    visibleTeams,
    visibleProfiles,
    details,
  };
}
/**
 * Wave 17 (J1): where a former member is today. Deceased first; then
 * licensed this season in another club of the same federation (only that
 * club's and team's names); then still in another team of this club; else
 * the reason chosen when leaving.
 */
export type Situation =
  | { kind: "deceased" }
  | { kind: "club"; club: string; team: string | null }
  | { kind: "team"; teams: string[] }
  | { kind: "status"; status: Exclude<DepartureStatus, "deceased"> };
async function situationsOf(s: Scope, all: Awaited<ReturnType<typeof records>>, people: Profile[]) {
  const day = today();
  const former = people.filter((p) => p.status !== "active" || p.former_roles.length > 0 || p.departure_status);
  const out = new Map<string, Situation>();
  if (!former.length) return out;
  const elsewhere = new Map(
    (
      await s.client.query(
        `SELECT DISTINCT ON (me.id) me.id,o.name AS club,
                (SELECT t.name FROM team_membership m JOIN team t ON t.id=m.team_id
                  WHERE m.profile_id=other.id AND m.organization_id=other.organization_id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL
                    AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) ORDER BY m.starts_on DESC LIMIT 1) AS team
           FROM club_person me
           JOIN organization mine ON mine.id=me.organization_id AND mine.federation_id IS NOT NULL
           JOIN club_person other ON other.person_id=me.person_id AND other.organization_id<>me.organization_id AND other.status='active'
           JOIN organization o ON o.id=other.organization_id AND o.kind='club' AND o.federation_id=mine.federation_id
           JOIN license l ON l.profile_id=other.id AND l.organization_id=other.organization_id AND l.status='active'
          WHERE me.organization_id=$1 AND me.id=ANY($2::uuid[])
          ORDER BY me.id,l.season DESC`,
        [s.context.organization_id, former.map((p) => p.id)],
      )
    ).rows.map((r) => [r.id as string, { club: r.club as string, team: (r.team as string | null) ?? null }]),
  );
  for (const p of former) {
    if (p.departure_status === "deceased") {
      out.set(p.id, { kind: "deceased" });
      continue;
    }
    const other = elsewhere.get(p.id);
    if (other) {
      out.set(p.id, { kind: "club", ...other });
      continue;
    }
    const teams = [
      ...new Set(
        all.assignments
          .filter((a) => a.profile_id === p.id && !a.cancelled && !a.closed_at && a.starts_on <= day && (!a.ends_on || a.ends_on >= day))
          .map((a) => all.teams.find((t) => t.id === a.team_id)?.name)
          .filter((n): n is string => !!n),
      ),
    ];
    out.set(p.id, teams.length && p.status === "active" ? { kind: "team", teams } : { kind: "status", status: p.departure_status ?? "unknown" });
  }
  return out;
}
async function readPeople(s: Scope, filters: Filters) {
  const all = await records(s),
    v = visibility(s, all);
  if (
    !v.full &&
    (filters.minAge !== undefined ||
      filters.maxAge !== undefined ||
      filters.joinedBefore)
  )
    throw new AccessError("FORBIDDEN");
  const matching = all.profiles.filter((profile) => {
    if (!v.visibleProfiles.has(profile.id)) return false;
    if (filters.directoryRole) {
      const role = filters.directoryRole;
      if (
        !profile.directory_roles.includes(role) &&
        !all.assignments.some(
          (a) => a.profile_id === profile.id && a.role === role,
        )
      )
        return false;
      const former =
        profile.former_roles.includes(role) || profile.status !== "active";
      if (
        filters.former !== undefined &&
        former !== (filters.former === "true")
      )
        return false;
    }
    if (
      filters.playingPosition &&
      profile.playing_position !== filters.playingPosition
    )
      return false;
    if (filters.status !== "all" && profile.status !== filters.status)
      return false;
    if (
      !profile.full_name
        .toLocaleLowerCase()
        .includes(filters.q.toLocaleLowerCase())
    )
      return false;
    const roster = all.assignments.filter(
      (a) =>
        a.profile_id === profile.id &&
        v.visibleTeams.has(a.team_id) &&
        (!filters.directoryRole ||
          filters.former === "true" ||
          (!a.cancelled &&
            !a.closed_at &&
            a.starts_on <= today() &&
            (!a.ends_on || a.ends_on >= today()))),
    );
    if (filters.team || filters.season || filters.sportRole) {
      if (
        !roster.some(
          (a) =>
            (!filters.team || a.team_id === filters.team) &&
            (!filters.sportRole || a.role === filters.sportRole) &&
            (!filters.season ||
              all.teams.some(
                (t) => t.id === a.team_id && t.season_id === filters.season,
              )),
        )
      )
        return false;
    }
    if (
      filters.minAge !== undefined &&
      (!profile.birth_date ||
        ageOn(profile.birth_date, today()) < filters.minAge)
    )
      return false;
    if (
      filters.maxAge !== undefined &&
      (!profile.birth_date ||
        ageOn(profile.birth_date, today()) > filters.maxAge)
    )
      return false;
    if (filters.joinedBefore && profile.joined_on > filters.joinedBefore)
      return false;
    return true;
  });
  const situations = await situationsOf(s, all, matching);
  // Wave 17 (O1): « Formé », « En attente de validation » or « Non formé » for each coach.
  const coachIds = matching.filter((m) => m.directory_roles.includes("coach")).map((m) => m.id);
  const courses = coachIds.length
    ? ((
        await s.client.query(
          `SELECT q.profile_id,q.status,k.title,q.completed_on::text AS completed_on,(q.decided_at AT TIME ZONE 'Europe/Brussels')::date::text AS decided_on,q.valid_until::text AS valid_until
             FROM training_request q JOIN training_course k ON k.id=q.course_id
            WHERE q.organization_id=$1 AND q.profile_id=ANY($2::uuid[]) AND q.status IN ('approved','requested')`,
          [s.context.organization_id, coachIds],
        )
      ).rows as { profile_id: string; status: string; title: string; completed_on: string | null; decided_on: string | null; valid_until: string | null }[])
    : [];
  const profiles = matching.map((profile) => {
    const detail = v.details.has(profile.id);
    const canEdit =
      s.rights.includes("people.manage") ||
      (profile.id === v.own?.id && adult(profile)) ||
      v.authorizedRelations.some(
        (r) =>
          r.subject_profile_id === profile.id &&
          relationAllows(r, profile, true),
      );
    return {
      id: profile.id,
      directory_roles: profile.directory_roles,
      former_roles: profile.former_roles,
      playing_position: profile.playing_position,
      jersey_number: profile.jersey_number,
      full_name: profile.full_name,
      status: profile.status,
      version: profile.version,
      detailed: detail,
      can_edit: canEdit,
      has_account: !!profile.user_id,
      ...(detail
        ? {
            birth_date: profile.birth_date,
            email: profile.email ?? "",
            phone: profile.phone,
            joined_on: profile.joined_on,
          }
        : {}),
      assignments: all.assignments.filter(
        (a) => a.profile_id === profile.id && v.visibleTeams.has(a.team_id),
      ),
      departure_status: profile.departure_status,
      departure_note: detail ? profile.departure_note : "",
      situation: situations.get(profile.id) ?? null,
      training: profile.directory_roles.includes("coach")
        ? trainingState(
            courses.filter((x) => x.profile_id === profile.id),
            today(),
          )
        : null,
    };
  });
  const teamIds = new Set(
    all.teams.filter((t) => v.visibleTeams.has(t.id)).map((t) => t.id),
  );
  const seasons = (
    await s.client.query(
      "SELECT id,name,starts_on::text,ends_on::text,archived FROM season WHERE organization_id=$1 ORDER BY starts_on DESC",
      [s.context.organization_id],
    )
  ).rows.filter(
    (season) =>
      v.full ||
      s.rights.includes("teams.manage") ||
      all.teams.some((t) => teamIds.has(t.id) && t.season_id === season.id),
  );
  const managers = s.rights.includes("people.manage");
  return {
    context: {
      id: s.context.organization_id,
      name: s.context.organization_name,
      role: s.context.role,
    },
    ownProfileId: v.own?.id ?? null,
    // H10: the keys each person still holds, for those who may see them (president, equipment, members).
    keyCounts: seesAllKeys(s.context.role, s.rights) ? await keyCounts(s.client, s.context.organization_id) : null,
    // 7: the coaches' list for the president and who manages the members: roles, tasks, validated courses.
    coachExtras: coachIds.length && (s.context.role === "club_president" || s.rights.includes("mandates.manage")) ? await coachExtras(s.client, s.context.organization_id, coachIds, courses) : null,
    capabilities: {
      peopleManage: managers,
      registrationsManage: s.rights.includes("registrations.manage"),
      canExport: s.rights.includes("people.export") && v.full,
      peopleRead: v.full,
      teamsManage: s.rights.includes("teams.manage"),
      /** Wave 16 (I2): a new file can come with an invitation. */
      invite: s.rights.includes("invitations.create"),
    },
    profiles,
    teams: all.teams.filter((t) => teamIds.has(t.id)),
    seasons,
    relationships: all.relations
      .filter(
        (r) =>
          managers ||
          (v.own?.id === r.guardian_profile_id && r.kind !== "declared"),
      )
      .map((r) => ({
        ...r,
        authorization_note: managers ? r.authorization_note : "",
      })),
    accounts: managers
      ? (
          await s.client.query(
            'SELECT u.id,u.name FROM organization_membership m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.active AND u.active ORDER BY u.name',
            [s.context.organization_id],
          )
        ).rows
      : [],
    coachMandates: s.rights.includes("teams.manage")
      ? (
          await s.client.query(
            "SELECT r.id,r.team_id,u.name FROM role_assignment r JOIN \"user\" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.role='coach' AND r.revoked_at IS NULL ORDER BY u.name",
            [s.context.organization_id],
          )
        ).rows
      : [],
    transfers: managers
      ? (
          await s.client.query(
            "SELECT t.id,t.source_profile_id,t.expires_at,t.accepted_at,t.revoked_at FROM person_transfer t WHERE source_organization_id=$1 ORDER BY expires_at DESC LIMIT 50",
            [s.context.organization_id],
          )
        ).rows
      : [],
    total: profiles.length,
  };
}
/** 7: per coach, his staff roles, his open and late tasks, his validated courses (title and date). */
async function coachExtras(c: PoolClient, org: string, ids: string[], courses: { profile_id: string; status: string; title: string; completed_on: string | null; decided_on: string | null }[]) {
  const roles = (
    await c.query(
      `SELECT cp.id AS profile_id,r.id,r.name FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN role_assignment a ON a.user_id=pe.user_id AND a.organization_id=cp.organization_id
         JOIN mandate_staff_role m ON m.mandate_id=a.id JOIN staff_role r ON r.id=m.role_id AND NOT r.archived
        WHERE cp.organization_id=$1 AND cp.id=ANY($2::uuid[]) AND a.revoked_at IS NULL AND (a.valid_until IS NULL OR a.valid_until>now()) ORDER BY r.created_at`,
      [org, ids],
    )
  ).rows as { profile_id: string; id: string; name: { fr: string; nl?: string; en?: string } }[];
  const tasks = (
    await c.query(
      `SELECT p.id AS profile_id,count(DISTINCT t.id)::int AS open,count(DISTINCT t.id) FILTER (WHERE t.due_on<CURRENT_DATE)::int AS late
         FROM unnest($2::uuid[]) AS p(id) JOIN task t ON t.organization_id=$1 AND t.status<>'done'
          AND (t.responsible_id=p.id OR EXISTS(SELECT 1 FROM task_assignee a WHERE a.task_id=t.id AND a.profile_id=p.id AND a.done_on IS NULL))
        GROUP BY p.id`,
      [org, ids],
    )
  ).rows as { profile_id: string; open: number; late: number }[];
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        roles: roles.filter((r) => r.profile_id === id).map((r) => ({ id: r.id, name: r.name })),
        tasks: tasks.find((t) => t.profile_id === id) ?? { open: 0, late: 0 },
        formations: courses.filter((x) => x.profile_id === id && x.status === "approved").map((x) => ({ title: x.title, on: x.completed_on ?? x.decided_on })),
      },
    ]),
  );
}

export async function peopleView(
  db: Pool,
  p: Principal,
  filters: Filters = filterSchema.parse({}),
) {
  return transaction(db, p, false, (s) => readPeople(s, filters));
}
export async function peopleExport(
  db: Pool,
  p: Principal,
  filters: Filters,
  expectedOrganizationId: string,
) {
  const { grid } = await peopleExportGrid(
    db,
    p,
    filters,
    expectedOrganizationId,
    defaultColumns,
  );
  return csvRows(grid);
}
/** Selected columns, in the club's language or bilingual (historical CSV). */
export async function peopleExportGrid(
  db: Pool,
  p: Principal,
  filters: Filters,
  expectedOrganizationId: string,
  columns: ExportColumn[],
  locale?: "fr" | "nl" | "en",
) {
  return transaction(db, p, false, async (s) => {
    if (s.context.organization_id !== expectedOrganizationId)
      throw new AccessError("CONTEXT_CHANGED", 409);
    right(s, "people.export");
    if (
      !s.rights.includes("people.read") &&
      !s.rights.includes("people.manage")
    )
      throw new AccessError("FORBIDDEN");
    const view = await readPeople(s, filters);
    await audit(
      s.client,
      s.context.organization_id,
      p.userId,
      "people.export",
      s.context.organization_id,
    );
    const day = today();
    return {
      organization: s.context.organization_name,
      today: day,
      grid: exportGrid(
        view.profiles.map((person) => ({
          full_name: person.full_name,
          birth_date: person.birth_date ?? null,
          email: person.email ?? null,
          phone: person.phone ?? "",
          joined_on: person.joined_on ?? "",
          status: person.status,
          directory_roles: person.directory_roles ?? [],
          former_roles: person.former_roles ?? [],
          jersey_number: person.jersey_number ?? null,
          playing_position: person.playing_position ?? "",
          teams: [
            ...new Set(
              person.assignments.map(
                (a) => view.teams.find((t) => t.id === a.team_id)?.name ?? "",
              ),
            ),
          ].filter(Boolean),
        })),
        columns,
        day,
        locale,
      ),
    };
  });
}

async function profile(s: Scope, id: string) {
  const result = await s.client.query(
    "SELECT c.*,c.birth_date::text,c.joined_on::text,p.user_id FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.id=$1 AND c.organization_id=$2",
    [id, s.context.organization_id],
  );
  if (!result.rowCount) throw new AccessError("NOT_FOUND", 404);
  return result.rows[0] as Profile;
}
function validateProfile(command: {
  birthDate: string | null;
  joinedOn: string;
}) {
  if (
    (command.birthDate && command.birthDate > today()) ||
    command.joinedOn > today()
  )
    throw new AccessError("INVALID_DATE", 400);
  if (command.birthDate && command.joinedOn < command.birthDate)
    throw new AccessError("INVALID_DATE", 400);
}
/**
 * Adds a profile to a team from today (or the season start when it has not
 * begun yet). Already being on the team is not an error.
 */
async function joinTeam(
  s: Scope,
  teamId: string,
  profileId: string,
  role: "player" | "coach",
  position: string,
  day: string,
) {
  const org = s.context.organization_id;
  const season = (
    await s.client.query(
      "SELECT s.starts_on::text,s.ends_on::text FROM team t JOIN season s ON s.id=t.season_id WHERE t.id=$1 AND t.organization_id=$2 AND NOT t.archived AND NOT s.archived",
      [teamId, org],
    )
  ).rows[0];
  if (!season) throw new AccessError("NOT_FOUND", 404);
  if (season.ends_on < day) throw new AccessError("SEASON_DATES", 400);
  const startsOn = season.starts_on > day ? season.starts_on : day;
  const current = await s.client.query(
    "SELECT 1 FROM team_membership WHERE organization_id=$1 AND team_id=$2 AND profile_id=$3 AND role=$4 AND NOT cancelled AND closed_at IS NULL AND (ends_on IS NULL OR ends_on>=$5::date)",
    [org, teamId, profileId, role, startsOn],
  );
  if (current.rowCount) return;
  await s.client.query(
    "INSERT INTO team_membership(organization_id,team_id,profile_id,role,position,starts_on) VALUES($1,$2,$3,$4,$5,$6)",
    [org, teamId, profileId, role, position, startsOn],
  );
}
async function linkedPerson(s: Scope, userId: string) {
  const result = await s.client.query(
    'SELECT p.id FROM person p JOIN organization_membership m ON m.user_id=p.user_id JOIN "user" u ON u.id=p.user_id WHERE p.user_id=$1 AND m.organization_id=$2 AND m.active AND u.active',
    [userId, s.context.organization_id],
  );
  if (!result.rowCount) throw new AccessError("ACCOUNT_NOT_ELIGIBLE", 400);
  return result.rows[0].id as string;
}
export async function peopleExecute(
  db: Pool,
  p: Principal,
  command: PeopleCommand,
  expectedOrganizationId?: string,
): Promise<{
  ok: true;
  id?: string;
  token?: string;
  created?: number;
  skipped?: number;
  guardians?: number;
  unknownTeams?: number;
  /** Wave 16 (I2): invitations sent with an import. */
  invited?: number;
  /** Wave 15, C10: what to send to /api/undo to put it back. */
  undo?: string;
}> {
  return transaction(
    db,
    p,
    true,
    async (s) => {
      const org = s.context.organization_id,
        c = s.client;
      if (expectedOrganizationId && expectedOrganizationId !== org)
        throw new AccessError("CONTEXT_CHANGED", 409);
      const teamActions = [
        "gameInfo",
        "season",
        "updateSeason",
        "updateTeam",
        "seasonArchive",
        "team",
        "teamArchive",
        "assign",
        "endAssignment",
        "coachScope",
      ];
      if (command.action !== "contacts")
        right(
          s,
          teamActions.includes(command.action)
            ? "teams.manage"
            : "people.manage",
        );
      let target = "";
      let undo: string | undefined;
      const event = command.action;
      if (command.action === "gameInfo") {
        const existing = await profile(s, command.id);
        if (
          existing.status !== "active" ||
          existing.former_roles.includes("player")
        )
          throw new AccessError("PROFILE_INACTIVE", 409);
        const result = await c.query(
          "UPDATE club_person SET playing_position=$3,jersey_number=$4,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND version=$5 RETURNING id",
          [
            command.id,
            org,
            command.position,
            command.jerseyNumber,
            command.version,
          ],
        );
        if (!result.rowCount) throw new AccessError("STALE_VERSION", 409);
        target = command.id;
      } else if (command.action === "directoryRole") {
        await profile(s, command.id);
        await c.query(
          "UPDATE club_person SET directory_roles=CASE WHEN $3=ANY(directory_roles) THEN directory_roles ELSE array_append(directory_roles,$3) END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [command.id, org, command.role],
        );
        target = command.id;
      } else if (command.action === "directoryArchive") {
        const existing = await profile(s, command.id);
        if (
          !existing.directory_roles.includes(command.role) &&
          !(
            await c.query(
              "SELECT 1 FROM team_membership WHERE profile_id=$1 AND organization_id=$2 AND role=$3",
              [command.id, org, command.role],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        if (!command.archived && existing.status !== "active")
          throw new AccessError("PROFILE_INACTIVE", 409);
        // Wave 17 (J1): the reason of the departure, chosen in the departure window; cleared on return.
        await c.query(
          "UPDATE club_person SET directory_roles=CASE WHEN $3=ANY(directory_roles) THEN directory_roles ELSE array_append(directory_roles,$3) END,former_roles=CASE WHEN $4 THEN CASE WHEN $3=ANY(former_roles) THEN former_roles ELSE array_append(former_roles,$3) END ELSE array_remove(former_roles,$3) END,departure_status=CASE WHEN $4 THEN COALESCE($5,departure_status) WHEN cardinality(array_remove(former_roles,$3))=0 THEN NULL ELSE departure_status END,departure_note=CASE WHEN $4 THEN COALESCE($6,departure_note) WHEN cardinality(array_remove(former_roles,$3))=0 THEN '' ELSE departure_note END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [command.id, org, command.role, command.archived, command.departureStatus ?? null, command.departureNote ?? null],
        );
        if (command.archived)
          await c.query(
            "UPDATE team_membership SET ends_on=GREATEST(starts_on,CURRENT_DATE),cancelled=starts_on>CURRENT_DATE,closed_at=now() WHERE profile_id=$1 AND organization_id=$2 AND role=$3 AND closed_at IS NULL AND NOT cancelled AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
            [command.id, org, command.role],
          );
        // H10: leaving with keys or badges, a task « Récupérer les clés ».
        if (command.archived) await keysOnDeparture(c, org, command.id, s.p.userId);
        target = command.id;
      } else if (command.action === "departure") {
        const existing = await profile(s, command.id);
        // « Décédé » is set or lifted by the club president only, after an explicit confirmation.
        if (command.status === "deceased" || existing.departure_status === "deceased") {
          if (s.context.role !== "club_president") throw new AccessError("FORBIDDEN");
          if (!command.confirm) throw new AccessError("CONFIRM_REQUIRED", 409);
        }
        if (command.status === "deceased") {
          await c.query(
            "UPDATE club_person SET status='archived',departure_status='deceased',departure_note=$3,former_roles=directory_roles,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
            [command.id, org, command.note],
          );
          await c.query(
            "UPDATE team_membership SET ends_on=GREATEST(starts_on,CURRENT_DATE),cancelled=starts_on>CURRENT_DATE,closed_at=now() WHERE profile_id=$1 AND organization_id=$2 AND closed_at IS NULL AND NOT cancelled AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
            [command.id, org],
          );
          // Nothing leaves any more: the emails waiting for this person, or about this file, are cancelled.
          await c.query(
            "UPDATE mail_job SET state='cancelled',completed_at=now() WHERE state='pending' AND ((recipient_user_id IS NOT NULL AND recipient_user_id=(SELECT user_id FROM person WHERE id=$1)) OR (organization_id=$2 AND resource_id=$3::text))",
            [existing.person_id, org, command.id],
          );
        } else {
          const former = existing.status !== "active" || existing.former_roles.length > 0;
          if (!former && existing.departure_status !== "deceased") throw new AccessError("PROFILE_ACTIVE", 409);
          await c.query(
            "UPDATE club_person SET departure_status=$3,departure_note=$4,status=CASE WHEN departure_status='deceased' THEN 'inactive' ELSE status END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
            [command.id, org, command.status, command.note],
          );
        }
        await keysOnDeparture(c, org, command.id, s.p.userId);
        target = command.id;
      } else if (command.action === "updateSeason") {
        if (!orderedDates(command.startsOn, command.endsOn))
          throw new AccessError("INVALID_DATE", 400);
        const outside = await c.query(
          "SELECT a.id FROM team_membership a JOIN team t ON t.id=a.team_id WHERE a.organization_id=$1 AND t.season_id=$2 AND (a.starts_on<$3::date OR a.starts_on>$4::date OR a.ends_on>$4::date) LIMIT 1",
          [org, command.id, command.startsOn, command.endsOn],
        );
        if (outside.rowCount) throw new AccessError("SEASON_DATES", 400);
        const changed = await c.query(
          "UPDATE season SET name=$3,starts_on=$4,ends_on=$5 WHERE id=$1 AND organization_id=$2 RETURNING id",
          [command.id, org, command.name, command.startsOn, command.endsOn],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        target = command.id;
      } else if (command.action === "updateTeam") {
        const changed = await c.query(
          "UPDATE team SET name=$3,category=$4,level=$5,home_location=$6 WHERE id=$1 AND organization_id=$2 RETURNING id",
          [
            command.id,
            org,
            command.name,
            command.category,
            command.level,
            command.homeLocation,
          ],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        target = command.id;
      } else if (command.action === "createPerson") {
        validateProfile(command);
        if (command.invite) right(s, "invitations.create");
        const personId = command.accountUserId
          ? await linkedPerson(s, command.accountUserId)
          : (await c.query("INSERT INTO person DEFAULT VALUES RETURNING id"))
              .rows[0].id;
        target = (
          await c.query(
            "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,phone,joined_on,directory_roles) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            [
              org,
              personId,
              command.fullName,
              command.birthDate,
              command.email || null,
              command.phone,
              command.joinedOn,
              command.directoryRoles ?? [],
            ],
          )
        ).rows[0].id;
        // 8: the representatives given with the player, in the same transaction.
        const isPlayer = (command.directoryRoles ?? []).includes("player") || !(command.directoryRoles ?? []).length;
        const underage = !!command.birthDate && ageOn(command.birthDate, today()) < 18;
        const reps = command.representatives ?? [];
        if (isPlayer && command.representatives !== undefined) {
          if (underage && !reps.length) throw new AccessError("GUARDIAN_REQUIRED", 400);
          if (!underage && command.hasRepresentative && !reps.length) throw new AccessError("REPRESENTATIVE_REQUIRED", 400);
          const created = await addRepresentatives(s, target, command, reps);
          if (command.inviteRepresentatives !== false) for (const r of created) if (r.email) await inviteRepresentative(s, target, r);
        }
        // An adult player given with his representatives is invited himself too.
        if (command.invite && command.representatives !== undefined && !underage)
          await inviteWith(s, { profileId: target, role: "player", fullName: command.fullName, birthDate: command.birthDate, email: command.email });
        if (command.invite && command.representatives === undefined) {
          const role = isPlayer ? "player" : "coach";
          let guardian: { id: string; name: string; email: string } | undefined;
          const minor = underage;
          if (minor && role === "player") {
            const name = (command.guardianName ?? "").trim();
            if (name.length < 2 || !command.guardianEmail) throw new AccessError("GUARDIAN_REQUIRED", 400);
            const guardianPerson = (await c.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
            const guardianId = (
              await c.query("INSERT INTO club_person(organization_id,person_id,full_name,email,joined_on) VALUES($1,$2,$3,$4,$5) RETURNING id", [
                org,
                guardianPerson,
                name,
                command.guardianEmail,
                command.joinedOn,
              ])
            ).rows[0].id as string;
            // Declared now; the parent's acceptance turns it into a verified link.
            await c.query(
              "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'declared',false,false,$4,'',$5)",
              [org, guardianId, target, command.joinedOn, p.userId],
            );
            guardian = { id: guardianId, name, email: command.guardianEmail };
          }
          await inviteWith(s, { profileId: target, role, fullName: command.fullName, birthDate: command.birthDate, email: command.email, guardian });
        }
      } else if (
        command.action === "updatePerson" ||
        command.action === "contacts"
      ) {
        const current = await profile(s, command.id);
        if (command.action === "contacts") {
          const all = await records(s),
            v = visibility(s, all);
          if (
            !s.rights.includes("people.manage") &&
            !(v.own?.id === current.id && adult(current)) &&
            !v.authorizedRelations.some(
              (r) =>
                r.subject_profile_id === current.id &&
                relationAllows(r, current, true),
            )
          )
            throw new AccessError("FORBIDDEN");
        } else validateProfile(command);
        const changed =
          command.action === "contacts"
            ? await c.query(
                "UPDATE club_person SET email=$3,phone=$4,updated_at=now(),version=version+1 WHERE id=$1 AND organization_id=$2 AND version=$5 RETURNING id",
                [
                  command.id,
                  org,
                  command.email || null,
                  command.phone,
                  command.version,
                ],
              )
            : await c.query(
                "UPDATE club_person SET full_name=$3,birth_date=$4,email=$5,phone=$6,joined_on=$7,updated_at=now(),version=version+1 WHERE id=$1 AND organization_id=$2 AND version=$8 RETURNING id",
                [
                  command.id,
                  org,
                  command.fullName,
                  command.birthDate,
                  command.email || null,
                  command.phone,
                  command.joinedOn,
                  command.version,
                ],
              );
        if (!changed.rowCount) throw new AccessError("STALE_VERSION", 409);
        target = command.id;
      } else if (command.action === "linkAccount") {
        const current = await profile(s, command.id);
        if (current.user_id)
          throw new AccessError("ACCOUNT_ALREADY_LINKED", 409);
        const personId = await linkedPerson(s, command.userId);
        const shared = await c.query(
          "SELECT 1 FROM club_person WHERE person_id=$1 AND organization_id<>$2",
          [current.person_id, org],
        );
        if (shared.rowCount) throw new AccessError("SHARED_IDENTITY", 409);
        await c.query(
          "UPDATE club_person SET person_id=$3,updated_at=now(),version=version+1 WHERE id=$1 AND organization_id=$2",
          [command.id, org, personId],
        );
        target = command.id;
      } else if (command.action === "status") {
        const existing = await profile(s, command.id);
        if (existing.status === "transferred")
          throw new AccessError("TRANSFERRED_PROFILE", 409);
        await c.query(
          "UPDATE club_person SET status=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [command.id, org, command.status],
        );
        if (command.status !== "active")
          await c.query(
            "UPDATE team_membership SET ends_on=GREATEST(starts_on,CURRENT_DATE),cancelled=starts_on>CURRENT_DATE,closed_at=now() WHERE profile_id=$1 AND organization_id=$2 AND (ends_on IS NULL OR ends_on>CURRENT_DATE)",
            [command.id, org],
          );
        target = command.id;
      } else if (command.action === "season") {
        if (!orderedDates(command.startsOn, command.endsOn))
          throw new AccessError("INVALID_DATE", 400);
        target = (
          await c.query(
            "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING id",
            [org, command.name, command.startsOn, command.endsOn],
          )
        ).rows[0].id;
      } else if (
        command.action === "seasonArchive" ||
        command.action === "teamArchive"
      ) {
        const table = command.action === "seasonArchive" ? "season" : "team";
        const before = (await c.query(`SELECT archived FROM ${table} WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [command.id, org])).rows[0];
        if (!before) throw new AccessError("NOT_FOUND", 404);
        await c.query(`UPDATE ${table} SET archived=$3 WHERE id=$1 AND organization_id=$2`, [command.id, org, command.archived]);
        target = command.id;
        if (before.archived !== command.archived) undo = await offerUndo(c, org, p.userId, command.action, command.id, { archived: before.archived });
      } else if (command.action === "team") {
        const season = await c.query(
          "SELECT id FROM season WHERE id=$1 AND organization_id=$2 AND NOT archived",
          [command.seasonId, org],
        );
        if (!season.rowCount) throw new AccessError("NOT_FOUND", 404);
        target = (
          await c.query(
            "INSERT INTO team(organization_id,season_id,name,category,level,home_location) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              org,
              command.seasonId,
              command.name,
              command.category,
              command.level,
              command.homeLocation,
            ],
          )
        ).rows[0].id;
      } else if (command.action === "assign") {
        const person = await profile(s, command.profileId);
        if (
          person.status !== "active" ||
          person.former_roles.includes(command.role)
        )
          throw new AccessError("PROFILE_INACTIVE", 409);
        const result = await c.query(
          "SELECT s.starts_on::text,s.ends_on::text FROM team t JOIN season s ON s.id=t.season_id WHERE t.id=$1 AND t.organization_id=$2 AND NOT t.archived AND NOT s.archived",
          [command.teamId, org],
        );
        const season = result.rows[0];
        if (!season) throw new AccessError("NOT_FOUND", 404);
        if (
          !orderedDates(command.startsOn, command.endsOn) ||
          command.startsOn < season.starts_on ||
          command.startsOn > season.ends_on ||
          (command.endsOn && command.endsOn > season.ends_on)
        )
          throw new AccessError("SEASON_DATES", 400);
        const overlap = await c.query(
          "SELECT id FROM team_membership WHERE organization_id=$1 AND team_id=$2 AND profile_id=$3 AND role=$4 AND daterange(starts_on,COALESCE(ends_on,'infinity'::date),'[]') && daterange($5::date,COALESCE($6::date,'infinity'::date),'[]')",
          [
            org,
            command.teamId,
            command.profileId,
            command.role,
            command.startsOn,
            command.endsOn,
          ],
        );
        if (overlap.rowCount) throw new AccessError("DUPLICATE", 409);
        target = (
          await c.query(
            "INSERT INTO team_membership(organization_id,team_id,profile_id,role,position,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [
              org,
              command.teamId,
              command.profileId,
              command.role,
              command.position,
              command.startsOn,
              command.endsOn,
            ],
          )
        ).rows[0].id;
      } else if (command.action === "endAssignment") {
        const previous = (await c.query("SELECT ends_on::text,closed_at FROM team_membership WHERE id=$1 AND organization_id=$2 FOR UPDATE", [command.id, org])).rows[0];
        const result = await c.query(
          "UPDATE team_membership SET ends_on=$3,closed_at=CASE WHEN $3::date<=CURRENT_DATE THEN now() ELSE NULL END WHERE id=$1 AND organization_id=$2 AND starts_on<=$3 AND closed_at IS NULL AND (ends_on IS NULL OR ends_on>=$3) AND EXISTS (SELECT 1 FROM team t JOIN season s ON s.id=t.season_id WHERE t.id=team_membership.team_id AND s.ends_on>=$3) RETURNING id",
          [command.id, org, command.endsOn],
        );
        if (!result.rowCount) throw new AccessError("INVALID_DATE", 400);
        target = command.id;
        undo = await offerUndo(c, org, p.userId, "endAssignment", command.id, { ends_on: previous.ends_on, closed_at: previous.closed_at ? new Date(previous.closed_at).toISOString() : null });
      } else if (command.action === "selfCoach") {
        // Reuse the actor's own club profile when it exists, so a president who
        // also coaches appears once in every list and statistic.
        const day = today();
        const personId = (
          await c.query(
            "INSERT INTO person(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id",
            [p.userId],
          )
        ).rows[0].id as string;
        const existing = await c.query(
          "SELECT id,status FROM club_person WHERE organization_id=$1 AND person_id=$2 FOR UPDATE",
          [org, personId],
        );
        if (existing.rowCount) {
          if (existing.rows[0].status !== "active")
            throw new AccessError("PROFILE_INACTIVE", 409);
          target = existing.rows[0].id;
          await c.query(
            "UPDATE club_person SET directory_roles=CASE WHEN 'coach'=ANY(directory_roles) THEN directory_roles ELSE array_append(directory_roles,'coach') END,former_roles=array_remove(former_roles,'coach'),version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
            [target, org],
          );
        } else {
          // A profile with the same name but no account must be linked first
          // (people "linkAccount"), never silently duplicated.
          if (
            (
              await c.query(
                "SELECT 1 FROM club_person WHERE organization_id=$1 AND lower(trim(full_name))=lower(trim($2)) AND birth_date IS NULL",
                [org, s.user.name],
              )
            ).rowCount
          )
            throw new AccessError("DUPLICATE", 409);
          target = (
            await c.query(
              "INSERT INTO club_person(organization_id,person_id,full_name,email,joined_on,directory_roles) VALUES($1,$2,$3,$4,$5,ARRAY['coach']) RETURNING id",
              [org, personId, s.user.name, s.user.email ?? null, day],
            )
          ).rows[0].id;
        }
        if (command.teamId) {
          right(s, "teams.manage");
          await joinTeam(s, command.teamId, target, "coach", "", day);
        }
      } else if (command.action === "importPlayers") {
        const role = command.role ?? "player";
        const usesTeams =
          !!command.teamId || command.rows.some((r) => r.team?.trim());
        if (usesTeams) right(s, "teams.manage");
        if (command.invite) right(s, "invitations.create");
        let invited = 0;
        const day = today();
        // Team names of the file, matched case-insensitively with active teams.
        const teams = (
          await c.query(
            "SELECT t.id,lower(trim(t.name)) AS name FROM team t JOIN season se ON se.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT se.archived AND se.ends_on>=$2::date ORDER BY se.starts_on DESC",
            [org, day],
          )
        ).rows as { id: string; name: string }[];
        let created = 0,
          skipped = 0,
          guardians = 0,
          unknownTeams = 0;
        for (const row of command.rows) {
          validateProfile({
            birthDate: row.birthDate,
            joinedOn: row.joinedOn ?? day,
          });
          const duplicate = await c.query(
            "SELECT 1 FROM club_person WHERE organization_id=$1 AND lower(trim(full_name))=lower(trim($2)) AND birth_date IS NOT DISTINCT FROM $3::date",
            [org, row.fullName, row.birthDate],
          );
          if (duplicate.rowCount) {
            skipped++;
            continue;
          }
          const personId = (
            await c.query("INSERT INTO person DEFAULT VALUES RETURNING id")
          ).rows[0].id;
          const profileId = (
            await c.query(
              "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,phone,joined_on,directory_roles,playing_position,jersey_number) VALUES($1,$2,$3,$4,$5,$6,$7,ARRAY[$10],$8,$9) RETURNING id",
              [
                org,
                personId,
                row.fullName,
                row.birthDate,
                row.email || null,
                row.phone,
                row.joinedOn ?? day,
                role === "player" ? row.position : "",
                role === "player" ? row.jerseyNumber : null,
                role,
              ],
            )
          ).rows[0].id as string;
          const teamName = (row.team ?? "").trim().toLowerCase();
          const lineTeam = teamName
            ? teams.find((t) => t.name === teamName)?.id
            : undefined;
          if (teamName && !lineTeam) unknownTeams++;
          const teamId = lineTeam ?? command.teamId;
          if (teamId)
            await joinTeam(
              s,
              teamId,
              profileId,
              role,
              role === "player" ? row.position : "",
              day,
            );
          const guardianName = (row.guardianName ?? "").trim();
          let guardianLine: { id: string; name: string; email: string } | undefined;
          if (role === "player" && guardianName.length >= 2) {
            // Recorded as a declared contact: it gives no access until the club
            // verifies the relationship in the people module.
            const existing = (
              await c.query(
                "SELECT id FROM club_person WHERE organization_id=$1 AND lower(trim(full_name))=lower(trim($2)) AND birth_date IS NULL AND status='active' LIMIT 1",
                [org, guardianName],
              )
            ).rows[0]?.id as string | undefined;
            let guardianId = existing;
            if (!guardianId) {
              const guardianPerson = (
                await c.query("INSERT INTO person DEFAULT VALUES RETURNING id")
              ).rows[0].id;
              guardianId = (
                await c.query(
                  "INSERT INTO club_person(organization_id,person_id,full_name,email,phone,joined_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
                  [
                    org,
                    guardianPerson,
                    guardianName,
                    row.guardianEmail || null,
                    row.guardianPhone ?? "",
                    day,
                  ],
                )
              ).rows[0].id as string;
            }
            await c.query(
              "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'declared',false,false,$4,'',$5)",
              [org, guardianId, profileId, day, p.userId],
            );
            guardians++;
            guardianLine = { id: guardianId, name: guardianName, email: row.guardianEmail ?? "" };
          }
          if (command.invite && (await inviteWith(s, { profileId, role, fullName: row.fullName, birthDate: row.birthDate, email: row.email, teamId, guardian: guardianLine }))) invited++;
          created++;
        }
        await audit(
          c,
          org,
          p.userId,
          "people.importPlayers",
          command.teamId ?? org,
        );
        return { ok: true, created, skipped, guardians, unknownTeams, invited };
      } else if (command.action === "coachScope") {
        if (
          command.teamId &&
          !(
            await c.query(
              "SELECT 1 FROM team WHERE id=$1 AND organization_id=$2",
              [command.teamId, org],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        const result = await c.query(
          "UPDATE role_assignment SET team_id=$3 WHERE id=$1 AND organization_id=$2 AND role='coach' AND revoked_at IS NULL RETURNING id",
          [command.mandateId, org, command.teamId],
        );
        if (!result.rowCount) throw new AccessError("NOT_FOUND", 404);
        target = command.mandateId;
      } else if (command.action === "guardian") {
        const guardian = await profile(s, command.guardianId),
          subject = await profile(s, command.subjectId);
        if (
          guardian.id === subject.id ||
          guardian.status !== "active" ||
          subject.status !== "active"
        )
          throw new AccessError("INVALID_RELATION", 400);
        if (
          !orderedDates(command.startsOn, command.endsOn) ||
          (command.canEdit && !command.canView) ||
          (command.kind === "declared" && (command.canView || command.canEdit))
        )
          throw new AccessError("INVALID_RELATION", 400);
        if (
          command.canView &&
          (!adult(guardian) ||
            !subject.birth_date ||
            command.authorizationNote.trim().length < 5)
        )
          throw new AccessError("AUTHORIZATION_REQUIRED", 400);
        if (
          command.kind === "legal_verified" &&
          command.canView &&
          adult(subject)
        )
          throw new AccessError("ADULT_CONSENT", 400);
        if (
          command.kind === "delegated_aid" &&
          command.canView &&
          !command.endsOn
        )
          throw new AccessError("AUTHORIZATION_REQUIRED", 400);
        target = (
          await c.query(
            "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,ends_on,authorization_note,verified_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
            [
              org,
              guardian.id,
              subject.id,
              command.kind,
              command.canView,
              command.canEdit,
              command.startsOn,
              command.endsOn,
              command.authorizationNote,
              s.p.userId,
            ],
          )
        ).rows[0].id;
      } else if (command.action === "revokeGuardian") {
        const result = await c.query(
          "UPDATE guardian_relationship SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL RETURNING id",
          [command.id, org],
        );
        if (!result.rowCount) throw new AccessError("NOT_FOUND", 404);
        target = command.id;
      } else if (command.action === "transfer") {
        const current = await profile(s, command.id);
        if (current.status !== "active")
          throw new AccessError("PROFILE_INACTIVE", 409);
        const token = randomBytes(32).toString("hex");
        target = (
          await c.query(
            "INSERT INTO person_transfer(source_organization_id,source_profile_id,token_hash,created_by,authorization_note) VALUES($1,$2,$3,$4,$5) RETURNING id",
            [
              org,
              current.id,
              createHash("sha256").update(token).digest("hex"),
              p.userId,
              command.authorizationNote,
            ],
          )
        ).rows[0].id;
        await audit(c, org, p.userId, "people.transfer.issued", target);
        return { ok: true, id: target, token };
      } else if (command.action === "cancelTransfer") {
        const result = await c.query(
          "UPDATE person_transfer SET revoked_at=now() WHERE id=$1 AND source_organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
          [command.id, org],
        );
        if (!result.rowCount) throw new AccessError("NOT_FOUND", 404);
        target = command.id;
      } else if (command.action === "acceptTransfer") {
        const result = await c.query(
          "SELECT * FROM person_transfer WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE",
          [createHash("sha256").update(command.token).digest("hex")],
        );
        const transfer = result.rows[0];
        if (!transfer || transfer.source_organization_id === org)
          throw new AccessError("TRANSFER_INVALID", 404);
        const issuers = await c.query(
          `SELECT r.role,r.grants FROM role_assignment r JOIN organization_membership m ON m.user_id=r.user_id AND m.organization_id=r.organization_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active`,
          [transfer.source_organization_id, transfer.created_by],
        );
        if (
          !issuers.rows.some((r) =>
            permissions(r.role, r.grants).includes("people.manage"),
          )
        )
          throw new AccessError("TRANSFER_INVALID", 404);
        const moved = await moveProfile(c, { organization: transfer.source_organization_id, profile: transfer.source_profile_id }, org, p.userId);
        target = moved.target;
        const source = { id: moved.source };
        await c.query(
          "UPDATE person_transfer SET accepted_at=now(),target_organization_id=$2 WHERE id=$1",
          [transfer.id, org],
        );
        await audit(
          c,
          transfer.source_organization_id,
          p.userId,
          "people.transfer.out",
          source.id,
        );
      }
      await audit(c, org, p.userId, "people." + event, target);
      return { ok: true, id: target, ...(undo ? { undo } : {}) };
    },
    command.action === "acceptTransfer" ? command.token : undefined,
  );
}
/**
 * Moves a club profile to another club: the new club's profile (re)opens,
 * the old one is marked transferred, its team links, guardians and player
 * role close. The token transfer uses it, and so does the transfer market
 * (wave 17, J3) once the federation validates; there a player without club
 * may come from an inactive profile.
 */
export async function moveProfile(
  c: PoolClient,
  from: { organization: string; profile: string },
  org: string,
  actor: string,
  statuses: string[] = ["active"],
) {
  let target: string;
  const source = (
    await c.query(
      "SELECT c.*,p.user_id FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.id=$1 AND c.organization_id=$2 AND c.status=ANY($3::text[])",
      [from.profile, from.organization, statuses],
    )
  ).rows[0];
  if (!source) throw new AccessError("TRANSFER_INVALID", 404);
  const previous = (
    await c.query(
      "SELECT id,status FROM club_person WHERE organization_id=$1 AND person_id=$2",
      [org, source.person_id],
    )
  ).rows[0];
  if (previous?.status === "active")
    throw new AccessError("DUPLICATE", 409);
  if (previous) {
    await c.query(
      "UPDATE club_person SET status='active',full_name=$3,birth_date=$4,email=$5,phone=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
      [
        previous.id,
        org,
        source.full_name,
        source.birth_date,
        source.email,
        source.phone,
      ],
    );
    target = previous.id as string;
  } else {
    target = (
      await c.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,phone,joined_on) VALUES($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING id",
        [
          org,
          source.person_id,
          source.full_name,
          source.birth_date,
          source.email,
          source.phone,
        ],
      )
    ).rows[0].id;
  }
  await c.query(
    "UPDATE club_person SET status='transferred',version=version+1,updated_at=now() WHERE id=$1",
    [source.id],
  );
  await c.query(
    "UPDATE team_membership SET ends_on=GREATEST(starts_on,CURRENT_DATE),cancelled=starts_on>CURRENT_DATE,closed_at=now() WHERE organization_id=$1 AND profile_id=$2 AND (ends_on IS NULL OR ends_on>CURRENT_DATE)",
    [from.organization, source.id],
  );
  await c.query(
    "UPDATE guardian_relationship SET revoked_at=now() WHERE organization_id=$1 AND (subject_profile_id=$2 OR guardian_profile_id=$2) AND revoked_at IS NULL",
    [from.organization, source.id],
  );
  if (source.user_id) {
    await c.query(
      "UPDATE role_assignment SET revoked_at=now() WHERE organization_id=$1 AND user_id=$2 AND role='player' AND revoked_at IS NULL",
      [from.organization, source.user_id],
    );
    const membership = await c.query(
      "SELECT active FROM organization_membership WHERE organization_id=$1 AND user_id=$2",
      [org, source.user_id],
    );
    if (membership.rowCount && !membership.rows[0].active)
      throw new AccessError("MEMBERSHIP_DISABLED");
    await c.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [org, source.user_id],
    );
    const existing = await c.query(
      "SELECT id FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='player' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())",
      [org, source.user_id],
    );
    if (!existing.rowCount)
      await c.query(
        "INSERT INTO role_assignment(organization_id,user_id,role,created_by) VALUES($1,$2,'player',$3)",
        [org, source.user_id, actor],
      );
  }
  return { target, source: source.id as string };
}
// Shared with the player profile: one visibility model for every view of a person.
export type PeopleScope = Scope;
export {
  transaction as peopleScope,
  records as peopleRecords,
  visibility as peopleVisibility,
  relationAllows,
  adult,
  today as brusselsToday,
};

/**
 * 8: a player who turns 18 is invited to manage his own account (his
 * parent's legal access ends at 18; the player may then delegate it). Once,
 * by email, when the club has his address and he has no account yet.
 */
export async function majorityTick(db: Pool) {
  const rows = (
    await db.query(
      `SELECT cp.id,cp.organization_id,cp.full_name,cp.email,(SELECT r.user_id FROM role_assignment r WHERE r.organization_id=cp.organization_id AND r.role='club_president' AND r.revoked_at IS NULL ORDER BY r.valid_from LIMIT 1) AS actor
         FROM club_person cp JOIN person pe ON pe.id=cp.person_id
        WHERE cp.status='active' AND 'player'=ANY(cp.directory_roles) AND pe.user_id IS NULL AND COALESCE(cp.email,'')<>''
          AND cp.birth_date<=CURRENT_DATE-interval '18 years' AND cp.birth_date>CURRENT_DATE-interval '18 years'-interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM invitation i WHERE i.organization_id=cp.organization_id AND i.profile_id=cp.id AND i.role='player')`,
    )
  ).rows as { id: string; organization_id: string; full_name: string; email: string; actor: string | null }[];
  let sent = 0;
  for (const r of rows) {
    if (!r.actor) continue;
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await inviteProfile(c, r.organization_id, r.actor, { email: r.email, role: "player", profileId: r.id, greeting: r.full_name.trim().split(/\s+/)[0] ?? "" });
      await c.query("COMMIT");
      sent++;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}
