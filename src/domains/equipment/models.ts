import { AccessError, audit } from "../access/service";
import type { Scope } from "./service";
import type { Command } from "./schema";

/**
 * Wave 17 (Q1): chair models. A shared validated list (Equalizer, Storm,
 * Strike Force to start), the models a federation validated, and those a
 * club proposed: shown on its chairs with « En attente de validation » until
 * the federation decides.
 */
export type Model = { id: string; brand: string; name: string; status: "validated" | "proposed" | "refused"; shared: boolean; mine: boolean; club: string | null; chairs: number };

export async function modelsView(s: Scope) {
  const org = s.a.organization_id;
  const list = (
    await s.c.query(
      `SELECT m.id,m.brand,m.name,m.status,m.federation_id IS NULL AS shared,m.proposed_by_org IS NOT DISTINCT FROM $1 AS mine,o.name AS club,
              (SELECT count(*)::int FROM equipment_chair c WHERE c.model_id=m.id AND c.status<>'retired') AS chairs
         FROM chair_model m LEFT JOIN organization o ON o.id=m.proposed_by_org
        WHERE (m.status='validated' AND (m.federation_id IS NULL OR m.federation_id=$2))
           OR (m.proposed_by_org=$1 AND m.status<>'validated')
           OR ($3 AND m.federation_id=$2)
        ORDER BY m.status='proposed' DESC,lower(m.name),lower(m.brand)`,
      [org, s.fed, s.kind === "federation"],
    )
  ).rows as Model[];
  // The chairs counted are the club's own, except for the federation deciding.
  return {
    list: s.kind === "federation" ? list : list.map((m) => ({ ...m, chairs: 0 })),
    canDecide: s.kind === "federation" && s.manage,
  };
}

/** The model of a chair: one the club may choose, or a new one proposed to its federation. */
export async function resolveModel(s: Scope, id: string | null, proposed: { brand: string; name: string } | null) {
  const org = s.a.organization_id;
  if (id) {
    const row = (
      await s.c.query(
        `SELECT id,brand,name FROM chair_model WHERE id=$1 AND ((status='validated' AND (federation_id IS NULL OR federation_id=$3)) OR proposed_by_org=$2 OR (federation_id=$3 AND status='proposed')
            OR EXISTS (SELECT 1 FROM equipment_chair c WHERE c.model_id=chair_model.id AND c.organization_id=$2))`,
        [id, org, s.fed],
      )
    ).rows[0] as { id: string; brand: string; name: string } | undefined;
    if (!row) throw new AccessError("NOT_FOUND", 404);
    return row;
  }
  if (!proposed) throw new AccessError("MODEL_REQUIRED", 400);
  const brand = proposed.brand.trim(),
    name = proposed.name.trim();
  // The same name already in the list, shared or of the federation: reuse it.
  const existing = (
    await s.c.query(
      `SELECT id,brand,name FROM chair_model WHERE lower(trim(name))=lower($1) AND (lower(trim(brand))=lower($2) OR (federation_id IS NULL AND status='validated'))
          AND status<>'refused' AND (federation_id IS NULL OR federation_id IS NOT DISTINCT FROM $3)
        ORDER BY (federation_id IS NULL) DESC,(status='validated') DESC LIMIT 1`,
      [name, brand, s.fed],
    )
  ).rows[0] as { id: string; brand: string; name: string } | undefined;
  if (existing) return existing;
  // A federation adding to its own list validates at once.
  const own = s.kind === "federation";
  const row = (
    await s.c.query(
      `INSERT INTO chair_model(federation_id,brand,name,status,proposed_by_org,proposed_by,decided_by,decided_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (COALESCE(federation_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(trim(brand)),lower(trim(name))) DO UPDATE SET status=CASE WHEN chair_model.status='refused' THEN 'proposed' ELSE chair_model.status END,proposed_by_org=EXCLUDED.proposed_by_org,proposed_by=EXCLUDED.proposed_by
       RETURNING id,brand,name`,
      [s.fed, brand, name, own ? "validated" : "proposed", org, s.p.userId, own ? s.p.userId : null, own ? new Date() : null],
    )
  ).rows[0] as { id: string; brand: string; name: string };
  await audit(s.c, org, s.p.userId, "equipment.model.propose", row.id, { brand, name });
  return row;
}

/** The federation validates or refuses a model proposed by one of its clubs. */
export async function decideModel(s: Scope, input: Extract<Command, { action: "decideModel" }>) {
  if (s.kind !== "federation" || !s.manage) throw new AccessError("FORBIDDEN");
  const row = (
    await s.c.query(
      "UPDATE chair_model SET status=$3,note=$4,decided_by=$5,decided_at=now() WHERE id=$1 AND federation_id=$2 AND status<>$3 RETURNING id",
      [input.id, s.fed, input.decision, input.note, s.p.userId],
    )
  ).rows[0];
  if (!row) throw new AccessError("NOT_FOUND", 404);
  await audit(s.c, s.a.organization_id, s.p.userId, "equipment.model." + input.decision, input.id);
  return { id: input.id };
}
