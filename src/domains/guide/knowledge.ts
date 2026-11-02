import type { Pool } from "pg";
import type { Locale } from "../../lib/locale";
import { AccessError, audit, type Principal } from "../access/service";
import { validDiagram } from "../exercises/service";
import { draftTerms } from "./drafts-more";
import { guideScope, terms } from "./service";
import { knowledgeCommand, quizPassed, quizSchema, t3, type KnowledgeCommand, type Quiz, type Text3 } from "./schema";
import type { z } from "zod";

/**
 * Knowledge centre around the guide: the lexicon (G12), the gallery of
 * photos and annotated diagrams (G5), the quizzes (G7) and the catalogue of
 * chairs (G4). The federation writes; the members of its clubs, its
 * referees and its staff read.
 */
type Image = { id: string; category: string; conform: string | null; alt: Text3; caption: Partial<Text3>; people_visible: boolean; created_at: string };
type Sheet = {
  manufacturer: string;
  price_cents: number | null;
  price_on: string | null;
  speed_kmh: string | null;
  weight_kg: string | null;
  protections: Partial<Text3>;
  strengths: Partial<Text3>;
  limits: Partial<Text3>;
  updated_at: string;
};

/** The models a federation's members see: the shared ones and its own, once validated. */
const visibleModels = "m.status='validated' AND (m.federation_id IS NULL OR m.federation_id=$1)";

export async function knowledgeView(db: Pool, p: Principal, part: "lexicon" | "gallery" | "chairs" | "chair", locale: Locale, id?: string) {
  return guideScope(db, p, false, async (x) => {
    const base = { organization_id: x.org, can: { manage: x.manage }, federation: !!x.fed };
    if (!x.fed) return { ...base, terms: [], images: [], models: [], model: null };
    if (part === "lexicon") return { ...base, terms: await terms(x.c, x.fed), images: [], models: [], model: null };
    if (part === "gallery") {
      const images = (
        await x.c.query("SELECT id,category,conform,alt,caption,people_visible,created_at FROM guide_image WHERE federation_id=$1 ORDER BY category,created_at DESC LIMIT 300", [x.fed])
      ).rows as Image[];
      return { ...base, terms: [], images, models: [], model: null };
    }
    if (part === "chairs") {
      const models = (
        await x.c.query(
          `SELECT m.id,m.brand,m.name,s.manufacturer,s.price_cents,s.price_on::text AS price_on,s.speed_kmh::text AS speed_kmh,
                  (SELECT ph.id FROM chair_model_photo ph WHERE ph.model_id=m.id AND ph.federation_id=$1 ORDER BY ph.position,ph.created_at LIMIT 1) AS photo,
                  (SELECT ph.alt FROM chair_model_photo ph WHERE ph.model_id=m.id AND ph.federation_id=$1 ORDER BY ph.position,ph.created_at LIMIT 1) AS photo_alt
             FROM chair_model m LEFT JOIN chair_model_sheet s ON s.model_id=m.id AND s.federation_id=$1 WHERE ${visibleModels} ORDER BY m.brand,m.name`,
          [x.fed],
        )
      ).rows as { id: string; brand: string; name: string; manufacturer: string | null; price_cents: number | null; price_on: string | null; speed_kmh: string | null; photo: string | null; photo_alt: Text3 | null }[];
      return { ...base, terms: [], images: [], models, model: null };
    }
    const model = (await x.c.query(`SELECT m.id,m.brand,m.name FROM chair_model m WHERE m.id=$2 AND ${visibleModels}`, [x.fed, id])).rows[0] as { id: string; brand: string; name: string } | undefined;
    if (!model) throw new AccessError("NOT_FOUND", 404);
    const sheet = (
      await x.c.query(
        "SELECT manufacturer,price_cents,price_on::text AS price_on,speed_kmh::text AS speed_kmh,weight_kg::text AS weight_kg,protections,strengths,limits,updated_at FROM chair_model_sheet WHERE model_id=$1 AND federation_id=$2",
        [model.id, x.fed],
      )
    ).rows[0] as Sheet | undefined;
    const photos = (await x.c.query("SELECT id,alt FROM chair_model_photo WHERE model_id=$1 AND federation_id=$2 ORDER BY position,created_at", [model.id, x.fed])).rows as { id: string; alt: Text3 }[];
    const suppliers = (
      await x.c.query(
        "SELECT c.id,c.full_name,c.organization_name,c.email,c.phone FROM chair_model_supplier s JOIN contact c ON c.id=s.contact_id AND c.organization_id=s.federation_id WHERE s.model_id=$1 AND s.federation_id=$2 AND NOT c.archived ORDER BY c.organization_name,c.full_name",
        [model.id, x.fed],
      )
    ).rows as { id: string; full_name: string; organization_name: string; email: string; phone: string }[];
    // The federation picks the suppliers in its own contact book.
    const contacts = x.manage
      ? ((await x.c.query("SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY organization_name,full_name LIMIT 500", [x.org])).rows as { id: string; full_name: string; organization_name: string }[])
      : [];
    return { ...base, terms: [], images: [], models: [], model: { ...model, sheet: sheet ?? null, photos, suppliers, contacts, title: [model.brand, model.name].filter(Boolean).join(" ") || t3({ fr: model.name }, locale) } };
  });
}

/** A gallery image or a model's photo, for a reader of the federation (or anyone, when a public chapter shows it). */
export async function guideImage(db: Pool, p: Principal | null, id: string, kind: "image" | "photo") {
  const row = (
    await db.query(kind === "photo" ? "SELECT federation_id,media_type,content FROM chair_model_photo WHERE id=$1" : "SELECT federation_id,media_type,content FROM guide_image WHERE id=$1", [id])
  ).rows[0] as { federation_id: string; media_type: string; content: Buffer } | undefined;
  if (!row) throw new AccessError("NOT_FOUND", 404);
  if (p) {
    const allowed = await guideScope(db, p, false, async (x) => x.fed === row.federation_id);
    if (allowed) return row;
  }
  // Without an account: only an image shown by a public, published chapter.
  const shown =
    kind === "image" &&
    (
      await db.query(
        "SELECT 1 FROM guide_chapter g JOIN guide_version v ON v.chapter_id=g.id AND v.version=g.published_version WHERE g.federation_id=$1 AND g.public AND g.status='published' AND v.content::text LIKE $2",
        [row.federation_id, `%[[image:${id}]]%`],
      )
    ).rowCount;
  if (!shown) throw new AccessError("NOT_FOUND", 404);
  return row;
}

export async function knowledgeExecute(db: Pool, p: Principal, raw: z.input<typeof knowledgeCommand>, expected: string) {
  const cmd: KnowledgeCommand = knowledgeCommand.parse(raw);
  return guideScope(
    db,
    p,
    true,
    async (x) => {
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      const image = (data: string, mediaType: string) => {
        const bytes = Buffer.from(data, "base64");
        if (!validDiagram(mediaType, bytes)) throw new AccessError("INVALID_FILE", 400);
        return bytes;
      };
      switch (cmd.action) {
        case "adoptTerms": {
          need();
          let added = 0;
          for (const [i, t] of draftTerms.entries())
            added += (
              await x.c.query("INSERT INTO guide_term(federation_id,term,definition,position,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [x.org, JSON.stringify(t.term), JSON.stringify(t.definition), i, x.userId])
            ).rowCount ?? 0;
          return { id: x.org, added };
        }
        case "saveTerm": {
          need();
          if (cmd.id) {
            const r = await x.c.query("UPDATE guide_term SET term=$3,definition=$4,updated_by=$5,updated_at=now() WHERE id=$1 AND federation_id=$2", [cmd.id, x.org, JSON.stringify(cmd.term), JSON.stringify(cmd.definition), x.userId]);
            if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: cmd.id };
          }
          const position = Number((await x.c.query("SELECT COALESCE(max(position),0)+1 AS n FROM guide_term WHERE federation_id=$1", [x.org])).rows[0].n);
          const id = (await x.c.query("INSERT INTO guide_term(federation_id,term,definition,position,updated_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [x.org, JSON.stringify(cmd.term), JSON.stringify(cmd.definition), position, x.userId])).rows[0].id as string;
          return { id };
        }
        case "deleteTerm": {
          need();
          if (!(await x.c.query("DELETE FROM guide_term WHERE id=$1 AND federation_id=$2", [cmd.id, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "saveQuiz": {
          need();
          if (!(await x.c.query("SELECT 1 FROM guide_chapter WHERE id=$1 AND federation_id=$2", [cmd.chapterId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          await x.c.query(
            "INSERT INTO guide_quiz(chapter_id,questions,updated_by) VALUES($1,$2,$3) ON CONFLICT (chapter_id) DO UPDATE SET questions=EXCLUDED.questions,updated_by=EXCLUDED.updated_by,updated_at=now()",
            [cmd.chapterId, JSON.stringify(cmd.questions), x.userId],
          );
          return { id: cmd.chapterId };
        }
        case "answerQuiz": {
          const q = (
            await x.c.query("SELECT q.questions FROM guide_quiz q JOIN guide_chapter g ON g.id=q.chapter_id WHERE q.chapter_id=$1 AND g.federation_id=$2 AND g.status='published'", [cmd.chapterId, x.fed])
          ).rows[0]?.questions as Quiz | undefined;
          if (!q) throw new AccessError("NOT_FOUND", 404);
          const quiz = quizSchema.parse(q);
          const passed = quizPassed(quiz, cmd.answers);
          // Kept only to tick a welcome journey's step: no score is stored or shown to anyone.
          if (passed) await x.c.query("INSERT INTO guide_quiz_pass(chapter_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [cmd.chapterId, x.userId]);
          return { id: cmd.chapterId, passed, right: quiz.map((qq, i) => qq.answer === cmd.answers[i]) };
        }
        case "addImage": {
          need();
          // 5: a person visible in the picture needs his image rights.
          if (cmd.peopleVisible && !cmd.imageRights) throw new AccessError("IMAGE_RIGHTS", 400);
          const bytes = image(cmd.data, cmd.mediaType);
          const id = (
            await x.c.query(
              "INSERT INTO guide_image(federation_id,category,conform,alt,caption,people_visible,image_rights,media_type,content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
              [x.org, cmd.category, cmd.conform, JSON.stringify(cmd.alt), JSON.stringify(cmd.caption), cmd.peopleVisible, cmd.imageRights, cmd.mediaType, bytes, x.userId],
            )
          ).rows[0].id as string;
          await audit(x.c, x.org, x.userId, "guide.image", id);
          return { id };
        }
        case "deleteImage": {
          need();
          if (!(await x.c.query("DELETE FROM guide_image WHERE id=$1 AND federation_id=$2", [cmd.id, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "saveSheet": {
          need();
          if (!(await x.c.query(`SELECT 1 FROM chair_model m WHERE m.id=$2 AND ${visibleModels}`, [x.org, cmd.modelId])).rowCount) throw new AccessError("NOT_FOUND", 404);
          if (cmd.priceCents !== null && !cmd.priceOn) throw new AccessError("PRICE_DATE", 400);
          await x.c.query(
            `INSERT INTO chair_model_sheet(model_id,federation_id,manufacturer,price_cents,price_on,speed_kmh,weight_kg,protections,strengths,limits,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (model_id,federation_id) DO UPDATE SET manufacturer=EXCLUDED.manufacturer,price_cents=EXCLUDED.price_cents,price_on=EXCLUDED.price_on,speed_kmh=EXCLUDED.speed_kmh,weight_kg=EXCLUDED.weight_kg,
               protections=EXCLUDED.protections,strengths=EXCLUDED.strengths,limits=EXCLUDED.limits,updated_by=EXCLUDED.updated_by,updated_at=now()`,
            [cmd.modelId, x.org, cmd.manufacturer, cmd.priceCents, cmd.priceOn, cmd.speedKmh, cmd.weightKg, JSON.stringify(cmd.protections), JSON.stringify(cmd.strengths), JSON.stringify(cmd.limits), x.userId],
          );
          // Suppliers: contacts of the federation's own book only.
          const own = (await x.c.query("SELECT id FROM contact WHERE organization_id=$1 AND id=ANY($2::uuid[])", [x.org, cmd.suppliers])).rows.map((r) => r.id as string);
          if (own.length !== new Set(cmd.suppliers).size) throw new AccessError("NOT_FOUND", 404);
          await x.c.query("DELETE FROM chair_model_supplier WHERE model_id=$1 AND federation_id=$2", [cmd.modelId, x.org]);
          for (const c of own) await x.c.query("INSERT INTO chair_model_supplier(model_id,federation_id,contact_id) VALUES($1,$2,$3)", [cmd.modelId, x.org, c]);
          return { id: cmd.modelId };
        }
        case "addPhoto": {
          need();
          if (!(await x.c.query(`SELECT 1 FROM chair_model m WHERE m.id=$2 AND ${visibleModels}`, [x.org, cmd.modelId])).rowCount) throw new AccessError("NOT_FOUND", 404);
          const bytes = image(cmd.data, cmd.mediaType);
          const position = Number((await x.c.query("SELECT COALESCE(max(position),0)+1 AS n FROM chair_model_photo WHERE model_id=$1 AND federation_id=$2", [cmd.modelId, x.org])).rows[0].n);
          const id = (
            await x.c.query("INSERT INTO chair_model_photo(model_id,federation_id,alt,media_type,content,position,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              cmd.modelId,
              x.org,
              JSON.stringify(cmd.alt),
              cmd.mediaType,
              bytes,
              position,
              x.userId,
            ])
          ).rows[0].id as string;
          return { id };
        }
        case "deletePhoto": {
          need();
          if (!(await x.c.query("DELETE FROM chair_model_photo WHERE id=$1 AND federation_id=$2", [cmd.id, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}
