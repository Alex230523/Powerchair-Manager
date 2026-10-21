import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { offerUndo } from "../undo/service";
import { permissions } from "../access/policy";
import { resolveScope, seasonOptions, teamOptions } from "../scope/service";
import { teamColors, type TeamColor } from "./colors";

/**
 * Wave 12: the president's view of all teams (one card per team), a team
 * sheet (roster, staff, settings) and moving a player between teams in one
 * transaction. Reading follows the same rule as the top bar (a coach sees
 * the teams they supervise); changing needs teams.manage.
 */
export { teamColors, type TeamColor };
const text = (n: number) => z.string().trim().max(n);
export const teamsCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    seasonId: z.uuid(),
    name: text(100).min(2),
    category: text(80),
    level: text(80),
    homeLocation: text(160),
    color: z.enum(teamColors).nullable(),
    /** Places in the team (wave 16, R1); null: no limit. */
    capacity: z.number().int().min(1).max(100).nullable().default(null),
  }),
  z.object({
    action: z.literal("settings"),
    id: z.uuid(),
    name: text(100).min(2),
    category: text(80),
    level: text(80),
    homeLocation: text(160),
    color: z.enum(teamColors).nullable(),
    staffContactId: z.uuid().nullable(),
    archived: z.boolean(),
    capacity: z.number().int().min(1).max(100).nullable().default(null),
  }),
  /** Settings > Activities > Places per team: every team of the season at once. */
  z.object({
    action: z.literal("capacities"),
    items: z.array(z.object({ id: z.uuid(), capacity: z.number().int().min(1).max(100).nullable() })).min(1).max(100),
  }),
  /** Moves a player: closes the current assignment the day before, opens the new one. */
  z.object({
    action: z.literal("move"),
    profileId: z.uuid(),
    fromTeamId: z.uuid().nullable(),
    toTeamId: z.uuid(),
    effectiveOn: z.iso.date(),
    keep: z.boolean(),
  }),
]);
/** Input shape: a caller may leave out the places (no limit). */
export type TeamsCommand = z.input<typeof teamsCommand>;

type Scope = { c: PoolClient; org: string; userId: string; role: string; teamId: string | null; manage: boolean; mfa: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const staff = a.role === "club_president" || a.role === "coach" || rights.includes("people.read") || rights.includes("teams.manage");
    if (!staff) throw new AccessError("FORBIDDEN");
    if (!mfa) throw new AccessError("MFA_REQUIRED");
    const manage = rights.includes("teams.manage");
    if (write && !manage) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, role: a.role, teamId: a.team_id ?? null, manage, mfa });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    if ((e as { code?: string }).code === "23503") throw new AccessError("NOT_FOUND", 404);
    throw e;
  } finally {
    c.release();
  }
}
async function audit(s: Scope, action: string, target: string, details: unknown) {
  await s.c.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)", [
    s.org,
    s.userId,
    action,
    target,
    JSON.stringify(details),
  ]);
}

export type TeamCard = {
  id: string;
  name: string;
  season_id: string;
  category: string;
  level: string;
  home_location: string;
  color: TeamColor | null;
  archived: boolean;
  staff_contact_id: string | null;
  staff_contact_name: string | null;
  /** Places (wave 16, R1), null: no limit. */
  capacity: number | null;
  players: number;
  /** Attendance over the last 30 days on closed registers, in percent, or null. */
  attendance: number | null;
  documents_due: number;
  next_event: { id: string; title: string; kind: string; starts_at: string } | null;
  coaches: { id: string; full_name: string; role: string }[];
};
/** Current players of team t (one per person), the figure the places are compared with. */
export const playersSql = `(SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=t.id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active')`;
const cardSql = `
  SELECT t.id,t.name,t.season_id,t.category,t.level,t.home_location,t.color,t.archived,t.staff_contact_id,sc.full_name AS staff_contact_name,t.capacity,
    (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=t.id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active') AS players,
    (SELECT CASE WHEN count(*)=0 THEN NULL ELSE round(100.0*count(*) FILTER (WHERE i.actual IN ('present','late','early'))/count(*))::int END
       FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
      WHERE e.team_id=t.id AND e.status='scheduled' AND r.closed_at IS NOT NULL AND i.withdrawn_at IS NULL AND e.starts_at>=now()-interval '30 days' AND e.starts_at<=now()) AS attendance,
    (SELECT count(*)::int FROM club_document d WHERE d.organization_id=t.organization_id AND NOT d.sensitive AND d.profile_id IN (SELECT m.profile_id FROM team_membership m WHERE m.team_id=t.id AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE))
       AND (d.status IN ('missing','requested','refused','expired') OR (d.status='valid' AND d.expires_on<CURRENT_DATE))) AS documents_due,
    (SELECT json_build_object('id',e.id,'title',e.title,'kind',e.kind,'starts_at',e.starts_at) FROM calendar_event e WHERE e.team_id=t.id AND e.status='scheduled' AND e.ends_at>now() ORDER BY e.starts_at LIMIT 1) AS next_event,
    COALESCE((SELECT json_agg(json_build_object('id',cp.id,'full_name',cp.full_name,'role',m.role) ORDER BY m.role,cp.full_name) FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=t.id AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active'),'[]') AS coaches
  FROM team t LEFT JOIN club_person sc ON sc.id=t.staff_contact_id
  WHERE t.organization_id=$1`;

/** One card per team of the chosen season (archived teams last). */
export async function teamsView(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}) {
  return scope(db, p, false, async (s) => {
    const seasons = await seasonOptions(s.c, s.org);
    const chosen = await resolveScope(s.c, { organization_id: s.org, role: s.role, user_id: s.userId, team_id: s.teamId }, raw);
    const allowed = new Set((await teamOptions(s.c, { organization_id: s.org, role: s.role, user_id: s.userId, team_id: s.teamId })).map((t) => t.id));
    const teams = ((await s.c.query(cardSql + " AND t.season_id=$2 ORDER BY t.archived,t.name", [s.org, chosen.seasonId])).rows as TeamCard[]).filter((t) =>
      allowed.has(t.id),
    );
    return {
      organization_id: s.org,
      can: { manage: s.manage },
      seasonId: chosen.seasonId,
      season: seasons.find((x) => x.id === chosen.seasonId) ?? null,
      teams,
      people: s.manage
        ? ((await s.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name", [s.org])).rows as { id: string; full_name: string }[])
        : [],
    };
  });
}

export type RosterRow = {
  membership_id: string;
  profile_id: string;
  full_name: string;
  jersey_number: number | null;
  position: string;
  playing_position: string;
  chair: string | null;
  documents_due: number;
  attendance: number | null;
};
/** The team sheet: roster, staff and settings, with the other teams for a move. */
export async function teamDetail(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (s) => {
    const allowed = new Set((await teamOptions(s.c, { organization_id: s.org, role: s.role, user_id: s.userId, team_id: s.teamId })).map((t) => t.id));
    const team = (await s.c.query(cardSql + " AND t.id=$2", [s.org, id])).rows[0] as TeamCard | undefined;
    if (!team || !allowed.has(team.id)) throw new AccessError("NOT_FOUND", 404);
    const roster = (
      await s.c.query(
        `SELECT m.id AS membership_id,cp.id AS profile_id,cp.full_name,cp.jersey_number,m.position,cp.playing_position,
           (SELECT ch.name FROM equipment_chair_assignment ea JOIN equipment_chair ch ON ch.id=ea.chair_id WHERE ea.profile_id=cp.id AND ea.ends_on IS NULL ORDER BY ea.is_primary DESC,ea.starts_on DESC LIMIT 1) AS chair,
           (SELECT count(*)::int FROM club_document d WHERE d.profile_id=cp.id AND NOT d.sensitive AND (d.status IN ('missing','requested','refused','expired') OR (d.status='valid' AND d.expires_on<CURRENT_DATE))) AS documents_due,
           (SELECT CASE WHEN count(*)=0 THEN NULL ELSE round(100.0*count(*) FILTER (WHERE i.actual IN ('present','late','early'))/count(*))::int END
              FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
             WHERE i.profile_id=cp.id AND e.team_id=$2 AND r.closed_at IS NOT NULL AND i.withdrawn_at IS NULL AND e.starts_at>=now()-interval '90 days') AS attendance
         FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id
        WHERE m.organization_id=$1 AND m.team_id=$2 AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active'
        ORDER BY cp.jersey_number NULLS LAST,cp.full_name`,
        [s.org, id],
      )
    ).rows as RosterRow[];
    const staff = (
      await s.c.query(
        "SELECT m.id AS membership_id,cp.id AS profile_id,cp.full_name,m.role,m.starts_on::text AS starts_on FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.organization_id=$1 AND m.team_id=$2 AND m.role IN ('coach','assistant','volunteer') AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active' ORDER BY m.role,cp.full_name",
        [s.org, id],
      )
    ).rows as { membership_id: string; profile_id: string; full_name: string; role: string; starts_on: string }[];
    const others = (
      await s.c.query(
        `SELECT t.id,t.name,t.color,t.capacity,${playersSql} AS players FROM team t WHERE t.organization_id=$1 AND t.season_id=$2 AND t.id<>$3 AND NOT t.archived ORDER BY t.name`,
        [s.org, team.season_id, id],
      )
    ).rows as { id: string; name: string; color: TeamColor | null; capacity: number | null; players: number }[];
    const people = s.manage
      ? ((await s.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name", [s.org])).rows as { id: string; full_name: string }[])
      : [];
    return { organization_id: s.org, can: { manage: s.manage }, team, roster, staff, others: others.filter((t) => allowed.has(t.id)), people };
  });
}

export async function teamsExecute(db: Pool, p: Principal, cmd: TeamsCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      switch (cmd.action) {
        case "create": {
          if (!(await s.c.query("SELECT 1 FROM season WHERE id=$1 AND organization_id=$2 AND NOT archived", [cmd.seasonId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const id = (
            await s.c.query(
              "INSERT INTO team(organization_id,season_id,name,category,level,home_location,color,capacity) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
              [s.org, cmd.seasonId, cmd.name, cmd.category, cmd.level, cmd.homeLocation, cmd.color, cmd.capacity ?? null],
            )
          ).rows[0].id as string;
          await audit(s, "team.create", id, { name: cmd.name, color: cmd.color });
          return { id };
        }
        case "settings": {
          if (cmd.staffContactId && !(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.staffContactId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const changed = await s.c.query(
            "UPDATE team SET name=$3,category=$4,level=$5,home_location=$6,color=$7,staff_contact_id=$8,archived=$9,capacity=$10 WHERE id=$1 AND organization_id=$2",
            [cmd.id, s.org, cmd.name, cmd.category, cmd.level, cmd.homeLocation, cmd.color, cmd.staffContactId, cmd.archived, cmd.capacity ?? null],
          );
          if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s, "team.settings", cmd.id, { name: cmd.name, color: cmd.color, archived: cmd.archived, capacity: cmd.capacity ?? null });
          return { id: cmd.id };
        }
        case "capacities": {
          for (const item of cmd.items) {
            const changed = await s.c.query("UPDATE team SET capacity=$3 WHERE id=$1 AND organization_id=$2", [item.id, s.org, item.capacity]);
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          }
          await audit(s, "team.capacities", s.org, { items: cmd.items });
          return { id: s.org };
        }
        case "move": {
          // Destination: a team of this club, open, in the same season as the current one.
          const to = (await s.c.query("SELECT id,season_id FROM team WHERE id=$1 AND organization_id=$2 AND NOT archived", [cmd.toTeamId, s.org])).rows[0];
          if (!to) throw new AccessError("NOT_FOUND", 404);
          const current = cmd.fromTeamId
            ? (
                await s.c.query(
                  "SELECT m.id,m.team_id,m.position,t.season_id,m.ends_on::text,m.closed_at,m.cancelled FROM team_membership m JOIN team t ON t.id=m.team_id WHERE m.organization_id=$1 AND m.team_id=$2 AND m.profile_id=$3 AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=$4::date) FOR UPDATE",
                  [s.org, cmd.fromTeamId, cmd.profileId, cmd.effectiveOn],
                )
              ).rows[0]
            : undefined;
          if (cmd.fromTeamId && !current) throw new AccessError("NOT_FOUND", 404);
          if (current && current.season_id !== to.season_id) throw new AccessError("SEASON_DATES", 400);
          if (current && current.team_id === to.id) throw new AccessError("DUPLICATE", 409);
          if (!(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [cmd.profileId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          if (current && !cmd.keep) {
            // Closed the day before the move; a move on the first day of the assignment cancels it instead.
            const closed = await s.c.query(
              "UPDATE team_membership SET ends_on=($2::date-1),closed_at=CASE WHEN $2::date<=CURRENT_DATE THEN now() ELSE NULL END WHERE id=$1 AND starts_on<$2::date RETURNING id",
              [current.id, cmd.effectiveOn],
            );
            if (!closed.rowCount) await s.c.query("UPDATE team_membership SET cancelled=true,closed_at=now() WHERE id=$1", [current.id]);
          }
          const id = (
            await s.c.query(
              "INSERT INTO team_membership(organization_id,team_id,profile_id,role,position,starts_on) VALUES($1,$2,$3,'player',$4,$5) RETURNING id",
              [s.org, to.id, cmd.profileId, current?.position ?? "", cmd.effectiveOn],
            )
          ).rows[0].id as string;
          await audit(s, "team.move", cmd.profileId, { from: cmd.fromTeamId, to: to.id, effectiveOn: cmd.effectiveOn, keep: cmd.keep });
          // Over its places after the move (wave 16, R1): said, never blocked.
          const fill = (await s.c.query(`SELECT t.capacity,${playersSql} AS players FROM team t WHERE t.id=$1`, [to.id])).rows[0] as { capacity: number | null; players: number };
          const undo = await offerUndo(s.c, s.org, s.userId, "move", cmd.profileId, {
            created: id,
            previous:
              current && !cmd.keep
                ? { id: current.id, ends_on: current.ends_on, closed_at: current.closed_at ? new Date(current.closed_at).toISOString() : null, cancelled: current.cancelled }
                : null,
          });
          return { id, undo, over: fill.capacity !== null && fill.players > fill.capacity };
        }
      }
    },
    expected,
  );
}
