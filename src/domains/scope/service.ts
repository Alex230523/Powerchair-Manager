import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { resolve } from "./resolve";

/**
 * The season and team a club member is looking at (wave 12). The choice
 * travels in the URL (?season=&team=) and is remembered in the browser; the
 * server never trusts it: a season or team that is not the organisation's,
 * or that a coach does not supervise, falls back silently to the current
 * season and "all teams".
 */
export type Db = Pool | PoolClient;
export type ScopeActor = {
  organization_id: string;
  role: string;
  user_id: string;
  team_id?: string | null;
};
export type Scope = { seasonId: string | null; teamId: string | null };
export type SeasonOption = { id: string; name: string; starts_on: string; ends_on: string; archived: boolean; current: boolean };
export type TeamOption = { id: string; name: string; season_id: string; color: string | null; archived: boolean };

const rawSchema = z.object({
  season: z.uuid().optional(),
  team: z.uuid().optional(),
});
/** Reads ?season= and ?team= leniently: anything odd becomes "no choice". */
export function parseScope(params: URLSearchParams | Record<string, string | undefined>) {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) ?? undefined : params[k]);
  const parsed = rawSchema.safeParse({ season: get("season") || undefined, team: get("team") || undefined });
  return parsed.success ? parsed.data : {};
}

/** Seasons of the organisation, the current one flagged, archived ones last. */
export async function seasonOptions(db: Db, org: string): Promise<SeasonOption[]> {
  return (
    await db.query(
      "SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on,archived,(CURRENT_DATE BETWEEN starts_on AND ends_on AND NOT archived) AS current FROM season WHERE organization_id=$1 ORDER BY archived,starts_on DESC",
      [org],
    )
  ).rows as SeasonOption[];
}
/**
 * Teams the actor may pick: every team of the organisation for the staff,
 * only the supervised ones for a coach (the mandate's team, or the teams
 * where the coach's own profile is coach or assistant).
 */
export async function teamOptions(db: Db, a: ScopeActor): Promise<TeamOption[]> {
  if (a.role === "player" || a.role === "guardian") return [];
  const all = (
    await db.query(
      "SELECT t.id,t.name,t.season_id,t.color,t.archived FROM team t WHERE t.organization_id=$1 ORDER BY t.archived,t.name",
      [a.organization_id],
    )
  ).rows as TeamOption[];
  if (a.role !== "coach") return all;
  const mine = new Set<string>();
  if (a.team_id) mine.add(a.team_id);
  for (const r of (
    await db.query(
      "SELECT m.team_id FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id JOIN person pe ON pe.id=cp.person_id WHERE m.organization_id=$1 AND pe.user_id=$2 AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)",
      [a.organization_id, a.user_id],
    )
  ).rows)
    mine.add(r.team_id as string);
  return all.filter((t) => mine.has(t.id));
}
/**
 * Validates a raw choice against what the actor may see. Returns the season
 * and team ids to use; an invalid value falls back without an error.
 */
export async function resolveScope(db: Db, a: ScopeActor, raw: { season?: string; team?: string }): Promise<Scope> {
  return resolve(await seasonOptions(db, a.organization_id), await teamOptions(db, a), raw);
}
/** Profile ids currently in a team (players and staff), for indirect filters. */
export async function teamMembers(db: Db, org: string, teamId: string) {
  return (
    await db.query(
      "SELECT DISTINCT profile_id FROM team_membership WHERE organization_id=$1 AND team_id=$2 AND NOT cancelled AND closed_at IS NULL AND starts_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
      [org, teamId],
    )
  ).rows.map((r) => r.profile_id as string);
}
