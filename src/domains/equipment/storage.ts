import { AccessError, audit } from "../access/service";
import { mfaSatisfied } from "../../lib/security-policy";
import type { Scope } from "./service";
import type { Command } from "./schema";

/**
 * Wave 17 (Q1): where the material is kept (the club room, a sports hall, a
 * coach's garage), and what each place holds. Chairs and small material
 * choose one of these places; the old free text was taken over by 0061.
 */
export type StoragePlace = {
  id: string;
  name: string;
  /** 11: the place it is inside, if any (two levels). */
  parent_id: string | null;
  parent_name: string | null;
  place_id: string | null;
  place_name: string | null;
  address: string;
  contact: string;
  access: string;
  notes: string;
  archived: boolean;
  version: number;
  chairs: { id: string; name: string }[];
  items: { id: string; name: string; quantity: number }[];
};

export async function storageView(s: Scope) {
  const org = s.a.organization_id;
  // Like the small material: the equipment managers, and the coaches who see it.
  const see = s.manage || (mfaSatisfied(s.a.twoFactorEnabled) && s.a.role === "coach");
  if (!see) return { places: [] as StoragePlace[], clubPlaces: [] as { id: string; name: string; address: string }[], can: false };
  const places = (
    await s.c.query(
      `SELECT l.id,l.name,l.parent_id,(SELECT pp.name FROM storage_location pp WHERE pp.id=l.parent_id) AS parent_name,l.place_id,p.name AS place_name,l.address,l.contact,l.access,l.notes,l.archived,l.version,
              COALESCE((SELECT json_agg(json_build_object('id',c.id,'name',chair_label(c.id)) ORDER BY c.name) FROM equipment_chair c WHERE c.storage_location_id=l.id AND c.status<>'retired'),'[]') AS chairs,
              COALESCE((SELECT json_agg(json_build_object('id',i.id,'name',i.name,'quantity',i.quantity) ORDER BY i.name) FROM equipment_item i WHERE i.storage_location_id=l.id AND NOT i.archived),'[]') AS items
         FROM storage_location l LEFT JOIN calendar_place p ON p.id=l.place_id
        WHERE l.organization_id=$1 ORDER BY l.archived,lower(COALESCE((SELECT pp.name FROM storage_location pp WHERE pp.id=l.parent_id),l.name)),l.parent_id IS NOT NULL,lower(l.name)`,
      [org],
    )
  ).rows as StoragePlace[];
  const clubPlaces = s.manage
    ? ((await s.c.query("SELECT id,name,address FROM calendar_place WHERE organization_id=$1 ORDER BY lower(name) LIMIT 200", [org])).rows as { id: string; name: string; address: string }[])
    : [];
  return { places, clubPlaces, can: s.manage };
}

/** A storage place of the organisation, still in use. */
export async function storageIn(s: Scope, id: string) {
  const row = (await s.c.query("SELECT id,name FROM storage_location WHERE id=$1 AND organization_id=$2 AND NOT archived", [id, s.a.organization_id])).rows[0] as
    | { id: string; name: string }
    | undefined;
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return row;
}

export async function storageExecute(s: Scope, input: Extract<Command, { action: "storage" }>) {
  if (!s.manage) throw new AccessError(mfaSatisfied(s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED");
  const org = s.a.organization_id;
  if (input.placeId && !(await s.c.query("SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2", [input.placeId, org])).rowCount)
    throw new AccessError("NOT_FOUND", 404);
  const values = [input.name, input.placeId, input.address, input.contact, input.access, input.notes, input.archived];
  // 11: inside another place of the club, two levels at most.
  if (input.parentId) {
    const parent = (await s.c.query("SELECT id,parent_id FROM storage_location WHERE id=$1 AND organization_id=$2 AND NOT archived", [input.parentId, org])).rows[0];
    if (!parent) throw new AccessError("NOT_FOUND", 404);
    if (parent.parent_id || parent.id === input.id || (input.id && (await s.c.query("SELECT 1 FROM storage_location WHERE parent_id=$1", [input.id])).rowCount))
      throw new AccessError("TOO_DEEP", 409);
  }
  let id = input.id;
  if (id) {
    const r = await s.c.query(
      "UPDATE storage_location SET name=$3,place_id=$4,address=$5,contact=$6,access=$7,notes=$8,archived=$9,version=version+1 WHERE id=$1 AND organization_id=$2 AND version=$10 RETURNING id",
      [id, org, ...values, input.expectedVersion ?? 0],
    );
    if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
    // The old text column follows the name.
    await s.c.query("UPDATE equipment_chair SET storage=left($3,120) WHERE storage_location_id=$1 AND organization_id=$2", [id, org, input.name]);
    await s.c.query("UPDATE equipment_item SET storage=left($3,120) WHERE storage_location_id=$1 AND organization_id=$2", [id, org, input.name]);
  } else
    id = (
      await s.c.query("INSERT INTO storage_location(organization_id,name,place_id,address,contact,access,notes,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [org, ...values])
    ).rows[0].id as string;
  if (input.parentId !== undefined) await s.c.query("UPDATE storage_location SET parent_id=$2 WHERE id=$1", [id, input.parentId ?? null]);
  await audit(s.c, org, s.p.userId, "equipment.storage", id!);
  return { id: id! };
}
