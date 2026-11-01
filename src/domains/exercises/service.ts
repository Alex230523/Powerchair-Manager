import { ensureStorage } from "../storage/service";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";

/**
 * Wave 16 (E2): the exercise sheets of the club's coaches. Read by the
 * president, the coaches and the calendar people; written by the president
 * and those with the calendar right. A private sheet is its author's only.
 */
import { exerciseCommand, type ExerciseCommand, type objectives, type levels, type suitedFor } from "./schema";
export { exerciseCommand, type ExerciseCommand };

type Scope = { c: PoolClient; org: string; userId: string; write: boolean };
/** Who may read and write the sheets, from the active mandate. */
export function exerciseRights(a: { role: string; grants: string[] }) {
  const rights = permissions(a.role as never, a.grants as never) as string[];
  const write = a.role === "club_president" || rights.includes("calendar.manage");
  return { read: write || a.role === "coach" || rights.includes("calendar.read"), write };
}
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    const r = exerciseRights(a);
    if (!r.read || (write && !r.write)) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, write: r.write });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** Shared with the club's coaches, or the reader's own. */
export const visibleTo = (alias: string, param: string) => `(${alias}.shared OR ${alias}.author_id=${param})`;
const columns = `x.id,x.title,x.objective,x.description,x.safety,x.duration_minutes,x.players_min,x.players_max,x.level,x.suited,x.equipment,x.variants,x.video_url,x.tags,x.shared,x.archived,x.version,x.author_id,u.name AS author,
  EXISTS(SELECT 1 FROM exercise_diagram d WHERE d.exercise_id=x.id) AS has_diagram,(SELECT d.media_type FROM exercise_diagram d WHERE d.exercise_id=x.id) AS diagram_type,
  (SELECT count(DISTINCT l.event_id)::int FROM calendar_event_exercise l WHERE l.exercise_id=x.id) AS uses`;
export type Exercise = {
  id: string;
  title: string;
  objective: (typeof objectives)[number];
  description: string;
  safety: string;
  duration_minutes: number;
  players_min: number;
  players_max: number;
  level: (typeof levels)[number];
  suited: (typeof suitedFor)[number];
  equipment: string;
  variants: string;
  video_url: string;
  tags: string[];
  shared: boolean;
  archived: boolean;
  version: number;
  author_id: string;
  author: string;
  has_diagram: boolean;
  diagram_type: string | null;
  uses: number;
};

export async function exercisesView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(`SELECT ${columns} FROM exercise x JOIN "user" u ON u.id=x.author_id WHERE x.organization_id=$1 AND ${visibleTo("x", "$2")} ORDER BY x.archived,lower(x.title)`, [s.org, s.userId])
    ).rows as Exercise[];
    return { organization_id: s.org, user_id: s.userId, can: { write: s.write }, exercises: rows };
  });
}
/** One sheet and the trainings it was used in. */
export async function exerciseDetail(db: Pool, p: Principal, id: string) {
  z.uuid().parse(id);
  return scope(db, p, false, async (s) => {
    const x = (await s.c.query(`SELECT ${columns} FROM exercise x JOIN "user" u ON u.id=x.author_id WHERE x.id=$1 AND x.organization_id=$2 AND ${visibleTo("x", "$3")}`, [id, s.org, s.userId])).rows[0] as
      | Exercise
      | undefined;
    if (!x) throw new AccessError("NOT_FOUND", 404);
    const used = (
      await s.c.query(
        `SELECT e.id,e.title,e.starts_at,t.name AS team FROM calendar_event_exercise l JOIN calendar_event e ON e.id=l.event_id LEFT JOIN team t ON t.id=e.team_id
          WHERE l.exercise_id=$1 AND e.organization_id=$2 ORDER BY e.starts_at DESC LIMIT 50`,
        [id, s.org],
      )
    ).rows as { id: string; title: string; starts_at: string; team: string | null }[];
    return { organization_id: s.org, can: { write: s.write }, exercise: x, used };
  });
}
/** The diagram, for a reader who sees the sheet. */
export async function exerciseDiagram(db: Pool, p: Principal, id: string) {
  z.uuid().parse(id);
  return scope(db, p, false, async (s) => {
    const d = (
      await s.c.query(
        `SELECT d.media_type,d.content FROM exercise_diagram d JOIN exercise x ON x.id=d.exercise_id WHERE d.exercise_id=$1 AND x.organization_id=$2 AND ${visibleTo("x", "$3")}`,
        [id, s.org, s.userId],
      )
    ).rows[0] as { media_type: string; content: Buffer } | undefined;
    if (!d) throw new AccessError("NOT_FOUND", 404);
    return d;
  });
}
/** Checks the file signature, not only the declared type. */
export function validDiagram(type: string, b: Buffer) {
  if (!b.length || b.length > 2097152) return false;
  if (type === "image/png") return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/webp") return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return b.subarray(0, 5).toString() === "%PDF-";
}

export async function exerciseExecute(db: Pool, p: Principal, command: ExerciseCommand, expected?: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const own = async (id: string) => {
        const x = (await s.c.query(`SELECT * FROM exercise x WHERE x.id=$1 AND x.organization_id=$2 AND ${visibleTo("x", "$3")} FOR UPDATE`, [id, s.org, s.userId])).rows[0];
        if (!x) throw new AccessError("NOT_FOUND", 404);
        return x;
      };
      const values = (c: Extract<ExerciseCommand, { action: "create" | "update" }>) => {
        if (c.playersMin > c.playersMax) throw new AccessError("INVALID_INPUT", 400);
        const tags = [...new Set(c.tags.map((t) => t.toLowerCase()))];
        return [c.title, c.objective, c.description, c.safety, c.durationMinutes, c.playersMin, c.playersMax, c.level, c.suited, c.equipment, c.variants, c.videoUrl, tags, c.shared];
      };
      if (command.action === "create") {
        const id = (
          await s.c.query(
            `INSERT INTO exercise(organization_id,author_id,title,objective,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,tags,shared)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
            [s.org, s.userId, ...values(command)],
          )
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "exercise.created", id);
        return { ok: true as const, id };
      }
      if (command.action === "update") {
        await own(command.id);
        const r = await s.c.query(
          `UPDATE exercise SET title=$3,objective=$4,description=$5,safety=$6,duration_minutes=$7,players_min=$8,players_max=$9,level=$10,suited=$11,equipment=$12,variants=$13,video_url=$14,tags=$15,shared=$16,version=version+1,updated_at=now()
            WHERE id=$1 AND organization_id=$2 AND version=$17 RETURNING id`,
          [command.id, s.org, ...values(command), command.version],
        );
        if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
        await audit(s.c, s.org, s.userId, "exercise.updated", command.id);
        return { ok: true as const, id: command.id };
      }
      if (command.action === "duplicate") {
        const x = await own(command.id);
        const id = (
          await s.c.query(
            `INSERT INTO exercise(organization_id,author_id,title,objective,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,tags,shared)
             VALUES($1,$2,left($3,120),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
            [s.org, s.userId, `${x.title} (2)`, x.objective, x.description, x.safety, x.duration_minutes, x.players_min, x.players_max, x.level, x.suited, x.equipment, x.variants, x.video_url, x.tags, x.shared],
          )
        ).rows[0].id as string;
        await s.c.query(
          "INSERT INTO exercise_diagram(exercise_id,organization_id,media_type,content,updated_by) SELECT $1,organization_id,media_type,content,$3 FROM exercise_diagram WHERE exercise_id=$2",
          [id, command.id, s.userId],
        );
        await audit(s.c, s.org, s.userId, "exercise.created", id);
        return { ok: true as const, id };
      }
      if (command.action === "archive") {
        await own(command.id);
        await s.c.query("UPDATE exercise SET archived=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [command.id, s.org, command.archived]);
        await audit(s.c, s.org, s.userId, command.archived ? "exercise.archived" : "exercise.restored", command.id);
        return { ok: true as const, id: command.id };
      }
      if (command.action === "diagram") {
        await own(command.id);
        const bytes = Buffer.from(command.data, "base64");
        if (!validDiagram(command.mediaType, bytes)) throw new AccessError("INVALID_FILE", 400);
        const previous = Number((await s.c.query("SELECT size_bytes FROM exercise_diagram WHERE exercise_id=$1", [command.id])).rows[0]?.size_bytes ?? 0);
        await ensureStorage(s.c, s.org, bytes.length, previous);
        await s.c.query(
          `INSERT INTO exercise_diagram(exercise_id,organization_id,media_type,content,updated_by) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(exercise_id) DO UPDATE SET media_type=EXCLUDED.media_type,content=EXCLUDED.content,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [command.id, s.org, command.mediaType, bytes, s.userId],
        );
        return { ok: true as const, id: command.id };
      }
      await own(command.id);
      await s.c.query("DELETE FROM exercise_diagram WHERE exercise_id=$1 AND organization_id=$2", [command.id, s.org]);
      return { ok: true as const, id: command.id };
    },
    expected,
  );
}

/* ------------------------------------------------- The programme of a training */
export type ProgramItem = { exerciseId: string; minutes: number; notes: string };
/** Writes the programme of an event; a sheet must be visible, an archived one only if already there. */
export async function setProgram(c: PoolClient, org: string, userId: string, eventId: string, items: ProgramItem[]) {
  const before = new Set((await c.query("SELECT exercise_id FROM calendar_event_exercise WHERE event_id=$1", [eventId])).rows.map((r) => r.exercise_id as string));
  for (const item of items) {
    const x = (await c.query(`SELECT archived FROM exercise x WHERE x.id=$1 AND x.organization_id=$2 AND ${visibleTo("x", "$3")}`, [item.exerciseId, org, userId])).rows[0];
    if (!x || (x.archived && !before.has(item.exerciseId))) throw new AccessError("NOT_FOUND", 404);
  }
  await c.query("DELETE FROM calendar_event_exercise WHERE event_id=$1", [eventId]);
  for (const [i, item] of items.entries())
    await c.query("INSERT INTO calendar_event_exercise(event_id,organization_id,exercise_id,position,planned_minutes,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [
      eventId,
      org,
      item.exerciseId,
      i + 1,
      item.minutes,
      item.notes,
    ]);
}
/** The programme as a reader sees it: titles and minutes for everyone, the coach's notes for staff. */
export async function programOf(c: PoolClient, eventId: string, staff: boolean) {
  return (
    await c.query(
      "SELECT l.exercise_id AS id,x.title,l.planned_minutes AS minutes,l.notes,x.archived FROM calendar_event_exercise l JOIN exercise x ON x.id=l.exercise_id WHERE l.event_id=$1 ORDER BY l.position",
      [eventId],
    )
  ).rows.map((r) => ({ id: r.id as string, title: r.title as string, minutes: r.minutes as number, archived: r.archived as boolean, ...(staff ? { notes: r.notes as string } : {}) }));
}
/** « Imprimer le programme »: every sheet of the session, for staff who see them. */
export async function programPrint(db: Pool, p: Principal, eventId: string) {
  z.uuid().parse(eventId);
  return scope(db, p, false, async (s) => {
    const e = (await s.c.query("SELECT e.id,e.title,e.starts_at,e.ends_at,t.name AS team FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id WHERE e.id=$1 AND e.organization_id=$2", [eventId, s.org])).rows[0];
    if (!e) throw new AccessError("NOT_FOUND", 404);
    const items = (
      await s.c.query(
        `SELECT ${columns},l.planned_minutes,l.notes FROM calendar_event_exercise l JOIN exercise x ON x.id=l.exercise_id JOIN "user" u ON u.id=x.author_id WHERE l.event_id=$1 AND ${visibleTo("x", "$2")} ORDER BY l.position`,
        [eventId, s.userId],
      )
    ).rows as (Exercise & { planned_minutes: number; notes: string })[];
    return { event: e as { id: string; title: string; starts_at: string; ends_at: string; team: string | null }, items };
  });
}
