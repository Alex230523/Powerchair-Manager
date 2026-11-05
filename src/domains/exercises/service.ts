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
import { exerciseCommand, type ExerciseCommand, type objectives, type levels, type suitedFor, type genres, type tagColors } from "./schema";
import { drawing as drawingSchema, type Drawing } from "./drawing";
export { exerciseCommand, type ExerciseCommand };

type Scope = { c: PoolClient; org: string; userId: string; write: boolean; president: boolean };
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
    const out = await fn({ c, org: a.organization_id, userId: p.userId, write: r.write, president: a.role === "club_president" });
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
const columns = `x.id,x.title,x.genre,x.objective,x.goal,x.description,x.safety,x.duration_minutes,x.players_min,x.players_max,x.level,x.suited,x.equipment,x.variants,x.video_url,x.shared,x.archived,x.version,x.author_id,u.name AS author,
  COALESCE(NULLIF(x.origin_author,''),u.name) AS creator,COALESCE(NULLIF(x.origin_club,''),(SELECT o.name FROM organization o WHERE o.id=x.organization_id)) AS creator_club,x.origin_exercise_id,
  x.federal_status,x.federal_reason,
  COALESCE((SELECT json_agg(json_build_object('id',g.id,'name',g.name,'color',g.color) ORDER BY lower(g.name)) FROM exercise_tag_link tl JOIN exercise_tag g ON g.id=tl.tag_id WHERE tl.exercise_id=x.id),'[]'::json) AS tags,
  EXISTS(SELECT 1 FROM exercise_diagram d WHERE d.exercise_id=x.id) AS has_diagram,(SELECT d.media_type FROM exercise_diagram d WHERE d.exercise_id=x.id) AS diagram_type,
  EXISTS(SELECT 1 FROM exercise_drawing w WHERE w.exercise_id=x.id) AS has_drawing,
  (SELECT count(DISTINCT l.event_id)::int FROM calendar_event_exercise l WHERE l.exercise_id=x.id) AS uses,
  (SELECT count(DISTINCT mt.match_id)::int FROM match_tactic mt WHERE mt.exercise_id=x.id) AS matches`;
export type Exercise = {
  id: string;
  title: string;
  genre: (typeof genres)[number];
  objective: (typeof objectives)[number];
  goal: string;
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
  tags: Tag[];
  shared: boolean;
  archived: boolean;
  version: number;
  author_id: string;
  author: string;
  /** 4: « Créée par ‹nom› (‹club›) », kept after a duplication or a copy. */
  creator: string;
  creator_club: string;
  origin_exercise_id: string | null;
  federal_status: "private" | "pending" | "published" | "refused";
  federal_reason: string;
  has_diagram: boolean;
  diagram_type: string | null;
  has_drawing: boolean;
  uses: number;
  matches: number;
};
/** A sheet another club sent, waiting for the presidency. */
export type Offer = { id: string; title: string; genre: string; club: string; sender: string; message: string; created_at: string };
export type Tag = { id: string; name: string; color: (typeof tagColors)[number] };
/** 4: the club's tags and how many sheets carry each. */
async function clubTags(c: PoolClient, org: string) {
  return (
    await c.query(
      "SELECT g.id,g.name,g.color,(SELECT count(*)::int FROM exercise_tag_link l WHERE l.tag_id=g.id) AS sheets FROM exercise_tag g WHERE g.organization_id=$1 ORDER BY lower(g.name)",
      [org],
    )
  ).rows as (Tag & { sheets: number })[];
}
/** 4: links the sheet to its tags by name, creating the club's missing ones. */
export async function setTags(c: PoolClient, org: string, userId: string, exerciseId: string, names: string[]) {
  const unique = [...new Map(names.map((n) => [n.trim().toLowerCase(), n.trim()])).values()].filter(Boolean).slice(0, 10);
  const ids: string[] = [];
  for (const name of unique) {
    const count = Number((await c.query("SELECT count(*)::int AS n FROM exercise_tag WHERE organization_id=$1", [org])).rows[0].n);
    await c.query("INSERT INTO exercise_tag(organization_id,name,color,created_by) VALUES($1,$2,$3,$4) ON CONFLICT (organization_id,lower(name)) DO NOTHING", [org, name, `c${(count % 8) + 1}`, userId]);
    ids.push((await c.query("SELECT id FROM exercise_tag WHERE organization_id=$1 AND lower(name)=lower($2)", [org, name])).rows[0].id);
  }
  await c.query("DELETE FROM exercise_tag_link WHERE exercise_id=$1 AND organization_id=$2 AND NOT (tag_id=ANY($3::uuid[]))", [exerciseId, org, ids]);
  for (const id of ids) await c.query("INSERT INTO exercise_tag_link(exercise_id,tag_id,organization_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [exerciseId, id, org]);
}
/** 4: writes (or removes) the drawn pitch, at most 256 kB. */
export async function setDrawing(c: PoolClient, org: string, userId: string, exerciseId: string, d: Drawing | null) {
  if (!d) {
    await c.query("DELETE FROM exercise_drawing WHERE exercise_id=$1 AND organization_id=$2", [exerciseId, org]);
    return;
  }
  const json = JSON.stringify(drawingSchema.parse(d));
  if (json.length > 262144) throw new AccessError("INVALID_INPUT", 400);
  await c.query(
    `INSERT INTO exercise_drawing(exercise_id,organization_id,content,updated_by) VALUES($1,$2,$3::jsonb,$4)
     ON CONFLICT(exercise_id) DO UPDATE SET content=EXCLUDED.content,updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [exerciseId, org, json, userId],
  );
}
const drawingOf = async (c: PoolClient, id: string) => ((await c.query("SELECT content FROM exercise_drawing WHERE exercise_id=$1", [id])).rows[0]?.content ?? null) as Drawing | null;

export async function exercisesView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(`SELECT ${columns} FROM exercise x JOIN "user" u ON u.id=x.author_id WHERE x.organization_id=$1 AND ${visibleTo("x", "$2")} ORDER BY x.archived,lower(x.title)`, [s.org, s.userId])
    ).rows as Exercise[];
    const federation = ((await s.c.query("SELECT federation_id FROM organization WHERE id=$1", [s.org])).rows[0]?.federation_id ?? null) as string | null;
    // 04/11/2026: the clubs of the same federation a sheet can be sent to, and the sheets received.
    const clubs = federation && s.write
      ? ((await s.c.query("SELECT id,name FROM organization WHERE kind='club' AND federation_id=$1 AND id<>$2 ORDER BY lower(name)", [federation, s.org])).rows as { id: string; name: string }[])
      : [];
    const offers = s.president
      ? ((
          await s.c.query(
            `SELECT f.id,x.title,x.genre,o.name AS club,u.name AS sender,f.message,f.created_at::text AS created_at FROM exercise_offer f
               JOIN exercise x ON x.id=f.exercise_id JOIN organization o ON o.id=f.from_organization_id JOIN "user" u ON u.id=f.sent_by
              WHERE f.to_organization_id=$1 AND f.status='pending' ORDER BY f.created_at`,
            [s.org],
          )
        ).rows as Offer[])
      : [];
    return { organization_id: s.org, user_id: s.userId, can: { write: s.write, propose: s.write && !!federation, decide: s.president }, exercises: rows, tags: await clubTags(s.c, s.org), clubs, offers };
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
    // 4: the matches it was attached to as a tactic.
    const matches = (
      await s.c.query(
        `SELECT m.id,m.opponent,m.starts_at,t.name AS team FROM match_tactic mt JOIN match m ON m.id=mt.match_id JOIN team t ON t.id=m.team_id
          WHERE mt.exercise_id=$1 AND m.organization_id=$2 ORDER BY m.starts_at DESC LIMIT 50`,
        [id, s.org],
      )
    ).rows as { id: string; opponent: string; starts_at: string; team: string }[];
    const federation = ((await s.c.query("SELECT federation_id FROM organization WHERE id=$1", [s.org])).rows[0]?.federation_id ?? null) as string | null;
    return {
      organization_id: s.org,
      can: { write: s.write, propose: s.write && !!federation },
      // 04/11/2026: the clubs of the federation the sheet can be sent to.
      clubs: federation && s.write
        ? ((await s.c.query("SELECT id,name FROM organization WHERE kind='club' AND federation_id=$1 AND id<>$2 ORDER BY lower(name)", [federation, s.org])).rows as { id: string; name: string }[])
        : [],
      exercise: x,
      drawing: await drawingOf(s.c, id),
      used,
      matches,
      tags: await clubTags(s.c, s.org),
    };
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
        return [c.title, c.objective, c.description, c.safety, c.durationMinutes, c.playersMin, c.playersMax, c.level, c.suited, c.equipment, c.variants, c.videoUrl, c.shared, c.goal ?? "", c.genre ?? "exercise"];
      };
      if (command.action === "create") {
        const id = (
          await s.c.query(
            `INSERT INTO exercise(organization_id,author_id,title,objective,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,shared,goal,genre)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
            [s.org, s.userId, ...values(command)],
          )
        ).rows[0].id as string;
        await setTags(s.c, s.org, s.userId, id, command.tags);
        await audit(s.c, s.org, s.userId, "exercise.created", id);
        return { ok: true as const, id };
      }
      if (command.action === "update") {
        await own(command.id);
        const r = await s.c.query(
          `UPDATE exercise SET title=$3,objective=$4,description=$5,safety=$6,duration_minutes=$7,players_min=$8,players_max=$9,level=$10,suited=$11,equipment=$12,variants=$13,video_url=$14,shared=$15,goal=$16,genre=$17,version=version+1,updated_at=now()
            WHERE id=$1 AND organization_id=$2 AND version=$18 RETURNING id`,
          [command.id, s.org, ...values(command), command.version],
        );
        if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
        await setTags(s.c, s.org, s.userId, command.id, command.tags);
        await audit(s.c, s.org, s.userId, "exercise.updated", command.id);
        return { ok: true as const, id: command.id };
      }
      if (command.action === "duplicate") {
        const x = await own(command.id);
        // 4: the creator of the original stays the creator of the copy.
        const origin = (
          await s.c.query(
            `SELECT COALESCE(NULLIF(x.origin_author,''),u.name) AS author,COALESCE(NULLIF(x.origin_club,''),o.name) AS club FROM exercise x JOIN "user" u ON u.id=x.author_id JOIN organization o ON o.id=x.organization_id WHERE x.id=$1`,
            [command.id],
          )
        ).rows[0] as { author: string; club: string };
        const id = (
          await s.c.query(
            `INSERT INTO exercise(organization_id,author_id,title,objective,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,shared,goal,genre,origin_exercise_id,origin_author,origin_club)
             VALUES($1,$2,left($3,120),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
            [
              s.org,
              s.userId,
              `${x.title} (2)`,
              x.objective,
              x.description,
              x.safety,
              x.duration_minutes,
              x.players_min,
              x.players_max,
              x.level,
              x.suited,
              x.equipment,
              x.variants,
              x.video_url,
              x.shared,
              x.goal,
              x.genre,
              x.origin_exercise_id ?? x.id,
              origin.author,
              origin.club,
            ],
          )
        ).rows[0].id as string;
        await s.c.query(
          "INSERT INTO exercise_diagram(exercise_id,organization_id,media_type,content,updated_by) SELECT $1,organization_id,media_type,content,$3 FROM exercise_diagram WHERE exercise_id=$2",
          [id, command.id, s.userId],
        );
        await s.c.query("INSERT INTO exercise_drawing(exercise_id,organization_id,content,updated_by) SELECT $1,organization_id,content,$3 FROM exercise_drawing WHERE exercise_id=$2", [id, command.id, s.userId]);
        await s.c.query("INSERT INTO exercise_tag_link(exercise_id,tag_id,organization_id) SELECT $1,tag_id,organization_id FROM exercise_tag_link WHERE exercise_id=$2", [id, command.id]);
        await audit(s.c, s.org, s.userId, "exercise.created", id);
        return { ok: true as const, id };
      }
      if (command.action === "drawing") {
        await own(command.id);
        await setDrawing(s.c, s.org, s.userId, command.id, command.drawing);
        return { ok: true as const, id: command.id };
      }
      if (command.action === "tagRename" || command.action === "tagColor" || command.action === "tagMerge" || command.action === "tagDelete") {
        const tag = (await s.c.query("SELECT id FROM exercise_tag WHERE id=$1 AND organization_id=$2 FOR UPDATE", [command.tagId, s.org])).rows[0];
        if (!tag) throw new AccessError("NOT_FOUND", 404);
        if (command.action === "tagRename") {
          const clash = (await s.c.query("SELECT 1 FROM exercise_tag WHERE organization_id=$1 AND lower(name)=lower($2) AND id<>$3", [s.org, command.name, command.tagId])).rowCount;
          if (clash) throw new AccessError("DUPLICATE", 409);
          await s.c.query("UPDATE exercise_tag SET name=$2 WHERE id=$1", [command.tagId, command.name]);
        } else if (command.action === "tagColor") await s.c.query("UPDATE exercise_tag SET color=$2 WHERE id=$1", [command.tagId, command.color]);
        else {
          if (command.action === "tagMerge") {
            if (command.into === command.tagId || !(await s.c.query("SELECT 1 FROM exercise_tag WHERE id=$1 AND organization_id=$2", [command.into, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
            await s.c.query("INSERT INTO exercise_tag_link(exercise_id,tag_id,organization_id) SELECT exercise_id,$2,organization_id FROM exercise_tag_link WHERE tag_id=$1 ON CONFLICT DO NOTHING", [command.tagId, command.into]);
          }
          await s.c.query("DELETE FROM exercise_tag WHERE id=$1", [command.tagId]);
        }
        await audit(s.c, s.org, s.userId, `exercise.${command.action}`, command.tagId);
        return { ok: true as const, id: command.tagId };
      }
      if (command.action === "tacticAdd" || command.action === "tacticRemove") {
        if (!(await s.c.query("SELECT 1 FROM match WHERE id=$1 AND organization_id=$2", [command.matchId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
        if (command.action === "tacticRemove") {
          await s.c.query("DELETE FROM match_tactic WHERE match_id=$1 AND exercise_id=$2 AND organization_id=$3", [command.matchId, command.exerciseId, s.org]);
          return { ok: true as const, id: command.exerciseId };
        }
        const x = await own(command.exerciseId);
        if (x.archived) throw new AccessError("NOT_FOUND", 404);
        await s.c.query(
          `INSERT INTO match_tactic(match_id,organization_id,exercise_id,position,notes,added_by)
           VALUES($1,$2,$3,(SELECT COALESCE(max(position),0)+1 FROM match_tactic WHERE match_id=$1),$4,$5)
           ON CONFLICT(match_id,exercise_id) DO UPDATE SET notes=EXCLUDED.notes`,
          [command.matchId, s.org, command.exerciseId, command.notes, s.userId],
        );
        await audit(s.c, s.org, s.userId, "exercise.tactic", command.exerciseId);
        return { ok: true as const, id: command.exerciseId };
      }
      if (command.action === "propose" || command.action === "unpropose") {
        const x = await own(command.id);
        if (command.action === "unpropose") {
          if (x.federal_status !== "pending") throw new AccessError("NOT_FOUND", 404);
          await s.c.query("UPDATE exercise SET federal_status='private',federal_requested_at=NULL WHERE id=$1", [command.id]);
          return { ok: true as const, id: command.id };
        }
        if (!(await s.c.query("SELECT federation_id FROM organization WHERE id=$1", [s.org])).rows[0]?.federation_id) throw new AccessError("NO_FEDERATION", 409);
        if (!["private", "refused"].includes(x.federal_status)) throw new AccessError("DUPLICATE", 409);
        await s.c.query("UPDATE exercise SET federal_status='pending',federal_reason='',federal_requested_at=now() WHERE id=$1", [command.id]);
        await audit(s.c, s.org, s.userId, "exercise.proposed", command.id);
        return { ok: true as const, id: command.id };
      }
      if (command.action === "archive") {
        await own(command.id);
        await s.c.query("UPDATE exercise SET archived=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [command.id, s.org, command.archived]);
        await audit(s.c, s.org, s.userId, command.archived ? "exercise.archived" : "exercise.restored", command.id);
        return { ok: true as const, id: command.id };
      }
      if (command.action === "send") {
        const x = await own(command.id);
        const ok = (
          await s.c.query(
            "SELECT 1 FROM organization t JOIN organization me ON me.id=$2 WHERE t.id=$1 AND t.kind='club' AND t.id<>me.id AND me.federation_id IS NOT NULL AND t.federation_id=me.federation_id",
            [command.clubId, s.org],
          )
        ).rowCount;
        if (!ok) throw new AccessError("NOT_FOUND", 404);
        const sent = await s.c.query(
          `INSERT INTO exercise_offer(exercise_id,from_organization_id,to_organization_id,sent_by,message) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT (exercise_id,to_organization_id) WHERE status='pending' DO NOTHING RETURNING id`,
          [x.id, s.org, command.clubId, s.userId, command.message],
        );
        if (!sent.rowCount) throw new AccessError("ALREADY_SENT", 409);
        await audit(s.c, s.org, s.userId, "exercise.sent", x.id, { to: command.clubId });
        return { ok: true as const, id: sent.rows[0].id as string };
      }
      if (command.action === "offerDecide") {
        // The presidency of the receiving club only.
        if (!s.president) throw new AccessError("FORBIDDEN");
        const f = (await s.c.query("SELECT * FROM exercise_offer WHERE id=$1 AND to_organization_id=$2 AND status='pending' FOR UPDATE", [command.offerId, s.org])).rows[0];
        if (!f) throw new AccessError("NOT_FOUND", 404);
        let copy: string | null = null;
        if (command.accept) {
          const x = (await s.c.query("SELECT * FROM exercise WHERE id=$1", [f.exercise_id])).rows[0];
          // Its creator stays its creator, with the club it came from.
          const origin = (
            await s.c.query(
              `SELECT COALESCE(NULLIF(x.origin_author,''),u.name) AS author,COALESCE(NULLIF(x.origin_club,''),o.name) AS club FROM exercise x JOIN "user" u ON u.id=x.author_id JOIN organization o ON o.id=x.organization_id WHERE x.id=$1`,
              [x.id],
            )
          ).rows[0] as { author: string; club: string };
          copy = (
            await s.c.query(
              `INSERT INTO exercise(organization_id,author_id,title,objective,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,shared,goal,genre,origin_exercise_id,origin_author,origin_club)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15,$16,$17,$18,$19) RETURNING id`,
              [s.org, s.userId, x.title, x.objective, x.description, x.safety, x.duration_minutes, x.players_min, x.players_max, x.level, x.suited, x.equipment, x.variants, x.video_url, x.goal, x.genre, x.origin_exercise_id ?? x.id, origin.author, origin.club],
            )
          ).rows[0].id as string;
          const size = Number((await s.c.query("SELECT COALESCE(octet_length(content),0) AS n FROM exercise_diagram WHERE exercise_id=$1", [x.id])).rows[0]?.n ?? 0);
          if (size) await ensureStorage(s.c, s.org, size, 0);
          await s.c.query("INSERT INTO exercise_diagram(exercise_id,organization_id,media_type,content,updated_by) SELECT $1,$3,media_type,content,$4 FROM exercise_diagram WHERE exercise_id=$2", [copy, x.id, s.org, s.userId]);
          await s.c.query("INSERT INTO exercise_drawing(exercise_id,organization_id,content,updated_by) SELECT $1,$3,content,$4 FROM exercise_drawing WHERE exercise_id=$2", [copy, x.id, s.org, s.userId]);
          await audit(s.c, s.org, s.userId, "exercise.created", copy);
        }
        await s.c.query("UPDATE exercise_offer SET status=$2,decided_by=$3,decided_at=now(),copy_id=$4 WHERE id=$1", [f.id, command.accept ? "accepted" : "refused", s.userId, copy]);
        await audit(s.c, s.org, s.userId, command.accept ? "exercise.offer.accepted" : "exercise.offer.refused", f.id);
        return { ok: true as const, id: copy ?? f.id };
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
    // 4: the drawn pitch of each sheet is printed with it.
    const drawings = new Map<string, Drawing | null>();
    for (const x of items) drawings.set(x.id, x.has_drawing ? await drawingOf(s.c, x.id) : null);
    return { drawings: Object.fromEntries(drawings), event: e as { id: string; title: string; starts_at: string; ends_at: string; team: string | null }, items };
  });
}

/* ------------------------------------------------- 4: the tactics of a match */
export type MatchTactic = {
  id: string;
  title: string;
  genre: string;
  goal: string;
  description: string;
  safety: string;
  has_diagram: boolean;
  diagram_type: string | null;
  drawing: Drawing | null;
  notes?: string;
};
/** The sheets attached to a match; the coach's notes only for the staff. */
export async function tacticsOf(c: PoolClient, org: string, matchId: string, staff: boolean) {
  return (
    await c.query(
      `SELECT x.id,x.title,x.genre,x.goal,x.description,x.safety,mt.notes,
              EXISTS(SELECT 1 FROM exercise_diagram d WHERE d.exercise_id=x.id) AS has_diagram,(SELECT d.media_type FROM exercise_diagram d WHERE d.exercise_id=x.id) AS diagram_type,
              (SELECT w.content FROM exercise_drawing w WHERE w.exercise_id=x.id) AS drawing
         FROM match_tactic mt JOIN exercise x ON x.id=mt.exercise_id WHERE mt.match_id=$1 AND mt.organization_id=$2 ORDER BY mt.position`,
      [matchId, org],
    )
  ).rows.map(({ notes, ...r }) => ({ ...r, ...(staff ? { notes } : {}) })) as MatchTactic[];
}
/** The sheets a coach may attach: shared or his own, not archived. */
export async function tacticOptions(c: PoolClient, org: string, userId: string) {
  return (await c.query(`SELECT x.id,x.title,x.genre FROM exercise x WHERE x.organization_id=$1 AND NOT x.archived AND ${visibleTo("x", "$2")} ORDER BY x.genre DESC,lower(x.title) LIMIT 300`, [org, userId])).rows as {
    id: string;
    title: string;
    genre: string;
  }[];
}
