import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { fedCan } from "../access/policy";
import { ensureStorage } from "../storage/service";
import { exerciseRights, setDrawing, setTags } from "./service";
import { libraryCommand, type LibraryCommand, type genres, type objectives, type levels, type suitedFor } from "./schema";
import type { Drawing } from "./drawing";
export { libraryCommand };

/**
 * 4: the federal library of sheets, on the model of the validated sharing of
 * places (C4). A club proposes one of its sheets; the federation validates
 * (a snapshot is published) or refuses with a reason, and may publish its
 * own. Every club of the federation reads, searches and copies; a copy is
 * independent and keeps the creator of origin. No club to club sending.
 */
type Scope = { c: PoolClient; org: string; kind: "club" | "federation"; userId: string; federation: string | null; write: boolean; decide: boolean };
async function scope<T>(db: Pool, p: Principal, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await account(c, p);
    let s: Scope;
    if (a.kind === "federation") {
      // The courses competence (coach education) looks after the library.
      if (!fedCan(a.role, a.grants, "federation.courses")) throw new AccessError("FORBIDDEN");
      s = { c, org: a.organization_id, kind: "federation", userId: p.userId, federation: a.organization_id, write: false, decide: true };
    } else {
      const r = exerciseRights(a);
      if (!r.read) throw new AccessError("FORBIDDEN");
      const federation = ((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id ?? null) as string | null;
      s = { c, org: a.organization_id, kind: "club", userId: p.userId, federation, write: r.write, decide: false };
    }
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export type FederalSheet = {
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
  tags: string[];
  drawing: Drawing | null;
  diagram_type: string | null;
  origin_author: string;
  origin_club: string;
  published_at: string;
  copies: number;
  copied: boolean;
};
const federalColumns = `f.id,f.title,f.genre,f.objective,f.goal,f.description,f.safety,f.duration_minutes,f.players_min,f.players_max,f.level,f.suited,f.equipment,f.variants,f.video_url,f.tags,f.drawing,f.diagram_type,f.origin_author,f.origin_club,f.published_at,
  (SELECT count(*)::int FROM federal_exercise_copy fc WHERE fc.federal_exercise_id=f.id) AS copies,
  EXISTS(SELECT 1 FROM federal_exercise_copy fc WHERE fc.federal_exercise_id=f.id AND fc.organization_id=$2) AS copied`;

/** The published sheets; for the federation, the proposals waiting too. */
export async function libraryView(db: Pool, p: Principal) {
  return scope(db, p, async (s) => {
    const sheets = s.federation
      ? ((await s.c.query(`SELECT ${federalColumns} FROM federal_exercise f WHERE f.federation_id=$1 AND f.status='published' ORDER BY lower(f.title)`, [s.federation, s.org])).rows as FederalSheet[])
      : [];
    const pending =
      s.kind === "federation"
        ? ((
            await s.c.query(
              `SELECT x.id,x.title,x.genre,x.objective,x.goal,x.description,x.safety,x.duration_minutes,x.players_min,x.players_max,x.level,x.suited,x.equipment,x.variants,x.video_url,
                      u.name AS author,o.name AS club,x.federal_requested_at,(SELECT w.content FROM exercise_drawing w WHERE w.exercise_id=x.id) AS drawing,
                      COALESCE((SELECT array_agg(g.name ORDER BY lower(g.name)) FROM exercise_tag_link l JOIN exercise_tag g ON g.id=l.tag_id WHERE l.exercise_id=x.id),'{}') AS tags
                 FROM exercise x JOIN organization o ON o.id=x.organization_id JOIN "user" u ON u.id=x.author_id
                WHERE o.federation_id=$1 AND x.federal_status='pending' ORDER BY x.federal_requested_at`,
              [s.org],
            )
          ).rows as (Omit<FederalSheet, "origin_author" | "origin_club" | "published_at" | "copies" | "copied" | "diagram_type"> & { author: string; club: string; federal_requested_at: string })[])
        : [];
    return { organization_id: s.org, kind: s.kind, federation: s.federation, can: { copy: s.kind === "club" && s.write && !!s.federation, decide: s.decide }, sheets, pending };
  });
}
/** The image or PDF of a published sheet, for its federation's members. */
export async function libraryDiagram(db: Pool, p: Principal, id: string) {
  z.uuid().parse(id);
  return scope(db, p, async (s) => {
    const d = (await s.c.query("SELECT diagram_type AS media_type,diagram AS content FROM federal_exercise WHERE id=$1 AND federation_id=$2 AND status='published' AND diagram IS NOT NULL", [id, s.federation])).rows[0] as
      | { media_type: string; content: Buffer }
      | undefined;
    if (!d) throw new AccessError("NOT_FOUND", 404);
    return d;
  });
}

export async function libraryExecute(db: Pool, p: Principal, command: LibraryCommand, expected?: string) {
  return scope(
    db,
    p,
    async (s) => {
      if (command.action === "copy") {
        if (s.kind !== "club" || !s.write) throw new AccessError("FORBIDDEN");
        const f = (await s.c.query("SELECT * FROM federal_exercise WHERE id=$1 AND federation_id=$2 AND status='published'", [command.id, s.federation])).rows[0];
        if (!f) throw new AccessError("NOT_FOUND", 404);
        // An independent copy: the club's own sheet, the creator of origin kept.
        const id = (
          await s.c.query(
            `INSERT INTO exercise(organization_id,author_id,title,objective,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,shared,goal,genre,origin_exercise_id,origin_author,origin_club)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15,$16,$17,$18,$19) RETURNING id`,
            [
              s.org,
              s.userId,
              f.title,
              f.objective,
              f.description,
              f.safety,
              f.duration_minutes,
              f.players_min,
              f.players_max,
              f.level,
              f.suited,
              f.equipment,
              f.variants,
              f.video_url,
              f.goal,
              f.genre,
              f.source_exercise_id,
              f.origin_author,
              f.origin_club,
            ],
          )
        ).rows[0].id as string;
        await setTags(s.c, s.org, s.userId, id, f.tags);
        if (f.drawing) await setDrawing(s.c, s.org, s.userId, id, f.drawing);
        if (f.diagram) {
          await ensureStorage(s.c, s.org, (f.diagram as Buffer).length, 0);
          await s.c.query("INSERT INTO exercise_diagram(exercise_id,organization_id,media_type,content,updated_by) VALUES($1,$2,$3,$4,$5)", [id, s.org, f.diagram_type, f.diagram, s.userId]);
        }
        await s.c.query("INSERT INTO federal_exercise_copy(federal_exercise_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [f.id, s.org]);
        await audit(s.c, s.org, s.userId, "exercise.copied", id);
        return { ok: true as const, id };
      }
      if (!s.decide) throw new AccessError("FORBIDDEN");
      if (command.action === "decide") {
        const x = (
          await s.c.query(
            `SELECT x.*,u.name AS author_name,o.name AS club_name FROM exercise x JOIN organization o ON o.id=x.organization_id JOIN "user" u ON u.id=x.author_id
              WHERE x.id=$1 AND o.federation_id=$2 AND x.federal_status='pending' FOR UPDATE OF x`,
            [command.exerciseId, s.org],
          )
        ).rows[0];
        if (!x) throw new AccessError("NOT_FOUND", 404);
        if (!command.approve) {
          if (command.reason.length < 3) throw new AccessError("REASON_REQUIRED", 400);
          await s.c.query("UPDATE exercise SET federal_status='refused',federal_reason=$2,federal_decided_at=now(),federal_decided_by=$3 WHERE id=$1", [x.id, command.reason, s.userId]);
          await audit(s.c, s.org, s.userId, "exercise.refused", x.id);
          return { ok: true as const, id: x.id };
        }
        const tags = (await s.c.query("SELECT g.name FROM exercise_tag_link l JOIN exercise_tag g ON g.id=l.tag_id WHERE l.exercise_id=$1 ORDER BY lower(g.name) LIMIT 10", [x.id])).rows.map((r) => r.name as string);
        const drawing = (await s.c.query("SELECT content FROM exercise_drawing WHERE exercise_id=$1", [x.id])).rows[0]?.content ?? null;
        const diagram = (await s.c.query("SELECT media_type,content FROM exercise_diagram WHERE exercise_id=$1", [x.id])).rows[0];
        // A snapshot: later edits of the club's sheet do not change the library.
        const id = (
          await s.c.query(
            `INSERT INTO federal_exercise(federation_id,source_exercise_id,title,genre,objective,goal,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,tags,drawing,diagram_type,diagram,origin_author,origin_club,published_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
             ON CONFLICT (source_exercise_id) DO UPDATE SET title=EXCLUDED.title,genre=EXCLUDED.genre,objective=EXCLUDED.objective,goal=EXCLUDED.goal,description=EXCLUDED.description,safety=EXCLUDED.safety,
               duration_minutes=EXCLUDED.duration_minutes,players_min=EXCLUDED.players_min,players_max=EXCLUDED.players_max,level=EXCLUDED.level,suited=EXCLUDED.suited,equipment=EXCLUDED.equipment,variants=EXCLUDED.variants,
               video_url=EXCLUDED.video_url,tags=EXCLUDED.tags,drawing=EXCLUDED.drawing,diagram_type=EXCLUDED.diagram_type,diagram=EXCLUDED.diagram,status='published',published_by=EXCLUDED.published_by,published_at=now()
             RETURNING id`,
            [
              s.org,
              x.id,
              x.title,
              x.genre,
              x.objective,
              x.goal,
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
              tags,
              drawing ? JSON.stringify(drawing) : null,
              diagram?.media_type ?? null,
              diagram?.content ?? null,
              x.origin_author || x.author_name,
              x.origin_club || x.club_name,
              s.userId,
            ],
          )
        ).rows[0].id as string;
        await s.c.query("UPDATE exercise SET federal_status='published',federal_reason='',federal_decided_at=now(),federal_decided_by=$2 WHERE id=$1", [x.id, s.userId]);
        await audit(s.c, s.org, s.userId, "exercise.published", id);
        return { ok: true as const, id };
      }
      if (command.action === "publish") {
        if (command.playersMin > command.playersMax) throw new AccessError("INVALID_INPUT", 400);
        const who = (await s.c.query('SELECT u.name,o.name AS federation FROM "user" u, organization o WHERE u.id=$1 AND o.id=$2', [s.userId, s.org])).rows[0];
        const id = (
          await s.c.query(
            `INSERT INTO federal_exercise(federation_id,title,genre,objective,goal,description,safety,duration_minutes,players_min,players_max,level,suited,equipment,variants,video_url,tags,drawing,origin_author,origin_club,published_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
            [
              s.org,
              command.title,
              command.genre,
              command.objective,
              command.goal,
              command.description,
              command.safety,
              command.durationMinutes,
              command.playersMin,
              command.playersMax,
              command.level,
              command.suited,
              command.equipment,
              command.variants,
              command.videoUrl,
              [...new Map(command.tags.map((t) => [t.toLowerCase(), t])).values()],
              command.drawing ? JSON.stringify(command.drawing) : null,
              who.name,
              who.federation,
              s.userId,
            ],
          )
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "exercise.published", id);
        return { ok: true as const, id };
      }
      const f = (await s.c.query("UPDATE federal_exercise SET status='withdrawn' WHERE id=$1 AND federation_id=$2 AND status='published' RETURNING source_exercise_id", [command.id, s.org])).rows[0];
      if (!f) throw new AccessError("NOT_FOUND", 404);
      if (f.source_exercise_id) await s.c.query("UPDATE exercise SET federal_status='private' WHERE id=$1", [f.source_exercise_id]);
      await audit(s.c, s.org, s.userId, "exercise.withdrawn", command.id);
      return { ok: true as const, id: command.id };
    },
    expected,
  );
}
