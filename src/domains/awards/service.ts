import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { account, active, audit, AccessError, validImage, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { today } from "../calendar/access";
import { ensureStorage } from "../storage/service";
import { awardCommand, bySeason, publicAward, type AwardCommand } from "./schema";
export { awardCommand, type AwardCommand };

/**
 * Hall of fame (wave 16, S1): the club's prizes. Every member of the club
 * reads them; the president and those who manage the teams write them. A
 * tournament trip that ended in the first three places is suggested, never
 * added on its own. The public page shows no prize of a person, and no photo,
 * without « Peut être publié ».
 */
type Scope = { c: PoolClient; org: string; userId: string; manage: boolean; president: boolean };
export function awardRights(a: { role: string; grants: string[] }) {
  const rights = permissions(a.role as never, a.grants as never) as string[];
  const president = a.role === "club_president" || rights.includes("mandates.manage");
  return { manage: president || rights.includes("teams.manage"), president };
}
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    if ((a.disabled_modules ?? []).includes("statistics")) throw new AccessError("MODULE_OFF");
    await account(c, p);
    const r = awardRights(a);
    if (write && !r.manage) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, ...r });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const columns = `w.id,w.season_id,s.name AS season,w.awarded_on::text AS awarded_on,w.title,w.competition,w.kind,w.place,w.team_id,t.name AS team,t.color AS team_color,
  w.profile_id,cp.full_name AS person,w.note,w.source,w.trip_id,w.publishable,(w.photo IS NOT NULL) AS has_photo,w.version`;
const joins = `FROM award w LEFT JOIN season s ON s.id=w.season_id LEFT JOIN team t ON t.id=w.team_id LEFT JOIN club_person cp ON cp.id=w.profile_id`;
export type Award = {
  id: string;
  season_id: string | null;
  season: string | null;
  awarded_on: string;
  title: string;
  competition: string;
  kind: "team" | "individual" | "club";
  place: number | null;
  team_id: string | null;
  team: string | null;
  team_color: string | null;
  profile_id: string | null;
  person: string | null;
  note: string;
  source: "manual" | "tournament";
  trip_id: string | null;
  publishable: boolean;
  has_photo: boolean;
  version: number;
};

/** Tournament trips over, in the first three places, not in the Hall of fame yet: prefilled prizes to confirm. */
async function suggestions(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT tr.id AS trip_id,tr.title,tr.final_rank AS place,tr.teams_count,tr.team_id,t.name AS team,tr.ends_on::text AS awarded_on,
              (SELECT s.id FROM season s WHERE s.organization_id=tr.organization_id AND tr.ends_on BETWEEN s.starts_on AND s.ends_on ORDER BY s.starts_on DESC LIMIT 1) AS season_id
         FROM trip tr LEFT JOIN team t ON t.id=tr.team_id
        WHERE tr.organization_id=$1 AND tr.kind='tournament' AND tr.status<>'cancelled' AND tr.ends_on<$2::date AND tr.final_rank BETWEEN 1 AND 3
          AND NOT EXISTS (SELECT 1 FROM award w WHERE w.trip_id=tr.id)
        ORDER BY tr.ends_on DESC LIMIT 20`,
      [org, today()],
    )
  ).rows as { trip_id: string; title: string; place: number; teams_count: number | null; team_id: string | null; team: string | null; awarded_on: string; season_id: string | null }[];
}

export async function awardsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const awards = (await s.c.query(`SELECT ${columns} ${joins} WHERE w.organization_id=$1 ORDER BY w.awarded_on DESC,w.created_at DESC`, [s.org])).rows as Award[];
    const widget = s.president
      ? (((await s.c.query("SELECT hall_of_fame_widget FROM organization WHERE id=$1", [s.org])).rows[0]?.hall_of_fame_widget as string | null) ?? null)
      : null;
    return {
      organization_id: s.org,
      can: { manage: s.manage, widget: s.president },
      widget,
      awards,
      suggestions: s.manage ? await suggestions(s.c, s.org) : [],
      // The form's lists, for those who write.
      seasons: s.manage ? (await s.c.query("SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE organization_id=$1 ORDER BY starts_on DESC", [s.org])).rows : [],
      teams: s.manage ? (await s.c.query("SELECT id,name,season_id FROM team WHERE organization_id=$1 ORDER BY name", [s.org])).rows : [],
      people: s.manage
        ? (await s.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' AND anonymized_at IS NULL ORDER BY full_name", [s.org])).rows
        : [],
    };
  });
}

/** The season, team and person of a prize must be the club's own. */
async function checkRefs(s: Scope, x: { seasonId: string | null; teamId: string | null; profileId: string | null }) {
  for (const [table, id] of [
    ["season", x.seasonId],
    ["team", x.teamId],
    ["club_person", x.profileId],
  ] as const)
    if (id && !(await s.c.query(`SELECT 1 FROM ${table} WHERE id=$1 AND organization_id=$2`, [id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
}

export async function awardExecute(db: Pool, p: Principal, command: AwardCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "widget") {
        if (!s.president) throw new AccessError("FORBIDDEN");
        const id = command.enabled ? randomUUID() : null;
        await s.c.query("UPDATE organization SET hall_of_fame_widget=CASE WHEN $2::boolean THEN COALESCE(hall_of_fame_widget,$3::uuid) END WHERE id=$1", [s.org, command.enabled, id]);
        await audit(s.c, s.org, s.userId, command.enabled ? "award.widgetOn" : "award.widgetOff", s.org);
        return { ok: true as const, id: s.org };
      }
      if (command.action === "create") {
        await checkRefs(s, command);
        if (command.tripId) {
          const trip = (
            await s.c.query("SELECT 1 FROM trip WHERE id=$1 AND organization_id=$2 AND kind='tournament'", [command.tripId, s.org])
          ).rowCount;
          if (!trip) throw new AccessError("NOT_FOUND", 404);
          if ((await s.c.query("SELECT 1 FROM award WHERE trip_id=$1", [command.tripId])).rowCount) throw new AccessError("AWARD_EXISTS", 409);
        }
        const id = (
          await s.c.query(
            `INSERT INTO award(organization_id,season_id,awarded_on,title,competition,kind,place,team_id,profile_id,note,source,trip_id,publishable,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
            [
              s.org,
              command.seasonId,
              command.awardedOn,
              command.title,
              command.competition,
              command.kind,
              command.place,
              command.teamId,
              command.kind === "individual" ? command.profileId : null,
              command.note,
              command.tripId ? "tournament" : "manual",
              command.tripId,
              command.publishable,
              s.userId,
            ],
          )
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "award.created", id);
        return { ok: true as const, id };
      }
      const own = (await s.c.query("SELECT id,version FROM award WHERE id=$1 AND organization_id=$2 FOR UPDATE", [command.id, s.org])).rows[0] as
        | { id: string; version: number }
        | undefined;
      if (!own) throw new AccessError("NOT_FOUND", 404);
      if (command.action === "update") {
        if (own.version !== command.expectedVersion) throw new AccessError("STALE_VERSION", 409);
        await checkRefs(s, command);
        await s.c.query(
          `UPDATE award SET season_id=$3,awarded_on=$4,title=$5,competition=$6,kind=$7,place=$8,team_id=$9,profile_id=$10,note=$11,publishable=$12,version=version+1,updated_at=now()
            WHERE id=$1 AND organization_id=$2`,
          [
            command.id,
            s.org,
            command.seasonId,
            command.awardedOn,
            command.title,
            command.competition,
            command.kind,
            command.place,
            command.teamId,
            command.kind === "individual" ? command.profileId : null,
            command.note,
            command.publishable,
          ],
        );
        await audit(s.c, s.org, s.userId, "award.updated", command.id);
      } else if (command.action === "delete") {
        await s.c.query("DELETE FROM award WHERE id=$1 AND organization_id=$2", [command.id, s.org]);
        await audit(s.c, s.org, s.userId, "award.deleted", command.id);
      } else if (command.action === "photo") {
        const bytes = Buffer.from(command.data, "base64");
        if (!validImage(command.mediaType, bytes, 1_572_864)) throw new AccessError("INVALID_FILE", 400);
        const previous = Number((await s.c.query("SELECT size_bytes FROM award WHERE id=$1", [command.id])).rows[0]?.size_bytes ?? 0);
        await ensureStorage(s.c, s.org, bytes.length, previous);
        await s.c.query("UPDATE award SET photo=$3,photo_type=$4,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [command.id, s.org, bytes, command.mediaType]);
        await audit(s.c, s.org, s.userId, "award.photo", command.id);
      } else {
        await s.c.query("UPDATE award SET photo=NULL,photo_type=NULL,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [command.id, s.org]);
      }
      return { ok: true as const, id: command.id };
    },
    expected,
  );
}

/** The photo of a prize, for a member of the club. */
export async function awardPhoto(db: Pool, p: Principal, id: string) {
  z.uuid().parse(id);
  return scope(db, p, false, async (s) => {
    const r = (await s.c.query("SELECT photo,photo_type FROM award WHERE id=$1 AND organization_id=$2 AND photo IS NOT NULL", [id, s.org])).rows[0] as
      | { photo: Buffer; photo_type: string }
      | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return r;
  });
}

/** The club of a public Hall of fame page, while it is switched on and Statistics is on. */
async function widgetClub(db: Pool | PoolClient, widget: string) {
  if (!z.uuid().safeParse(widget).success) return null;
  return ((
    await db.query(
      "SELECT o.id,o.name,extract(epoch FROM l.updated_at)::bigint::text AS logo_version FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id WHERE o.hall_of_fame_widget=$1 AND o.kind='club' AND NOT ('statistics'=ANY(o.disabled_modules))",
      [widget],
    )
  ).rows[0] ?? null) as { id: string; name: string; logo_version: string | null } | null;
}

/** The public Hall of fame (no account): team and club prizes, a person's prize only when it may be published. */
export async function publicHallOfFame(db: Pool, widget: string, none: string) {
  const club = await widgetClub(db, widget);
  if (!club) return null;
  const awards = ((await db.query(`SELECT ${columns} ${joins} WHERE w.organization_id=$1 ORDER BY w.awarded_on DESC`, [club.id])).rows as Award[])
    .map((a) => publicAward(a))
    .filter((a): a is Award => a !== null)
    // Nothing a visitor should not read: no note, no ids of people.
    .map((a) => ({ ...a, note: "", profile_id: null }));
  return { club: { name: club.name, logo_version: club.logo_version }, seasons: bySeason(awards, none) };
}
/** A published photo on the public page. */
export async function publicAwardPhoto(db: Pool, widget: string, id: string) {
  const club = await widgetClub(db, widget);
  if (!club || !z.uuid().safeParse(id).success) return null;
  return ((await db.query("SELECT photo,photo_type FROM award WHERE id=$1 AND organization_id=$2 AND photo IS NOT NULL AND publishable", [id, club.id])).rows[0] ??
    null) as { photo: Buffer; photo_type: string } | null;
}
/** The club's logo on the public page. */
export async function publicHallLogo(db: Pool, widget: string) {
  const club = await widgetClub(db, widget);
  if (!club) return null;
  return ((await db.query("SELECT media_type,content FROM organization_logo WHERE organization_id=$1", [club.id])).rows[0] ?? null) as { media_type: string; content: Buffer } | null;
}
