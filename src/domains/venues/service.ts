import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  AccessError,
  account,
  active,
  audit,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";

/**
 * The shared hall directory. Every club and the federation read it; club
 * calendar managers and federation staff complete it. Accessibility answers
 * are yes, no or unknown (null): "unknown" is not "no", and the screen says so.
 */
const tri = z.boolean().nullable();
const text = (n: number) => z.string().trim().max(n);
export const accessFields = [
  "stepFree",
  "adaptedToilets",
  "changingRooms",
  "showers",
  "lift",
  "hoist",
  "parking",
  "charging",
] as const;
export const venueCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    name: text(120).min(2),
    address: text(500).min(2),
    city: text(120),
    phone: text(60),
    website: z.union([z.literal(""), z.url().max(300)]),
    stepFree: tri,
    adaptedToilets: tri,
    changingRooms: tri,
    showers: tri,
    lift: tri,
    hoist: tri,
    parking: tri,
    charging: tri,
    doorWidthCm: z.number().int().min(40).max(400).nullable(),
    floor: text(120),
    court: text(200),
    notes: text(2000),
    checkedOn: z.iso.date().nullable(),
  }),
  z.object({ action: z.literal("shareFromPlace"), placeId: z.uuid() }),
]);
export type VenueCommand = z.infer<typeof venueCommand>;

const columns = `id,name,address,city,phone,website,step_free,adapted_toilets,changing_rooms,showers,lift,hoist,parking,charging,door_width_cm,floor,court,notes,checked_on::text AS checked_on,updated_at,version`;

async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (x: { c: PoolClient; org: string; kind: string; edit: boolean; userId: string }) => Promise<T>,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const edit =
      mfa &&
      (a.role === "club_president" ||
        a.role === "federation_president" ||
        a.role === "federation_worker" ||
        rights.includes("calendar.manage"));
    if (write && !edit) throw new AccessError(mfa ? "FORBIDDEN" : "MFA_REQUIRED");
    const out = await fn({ c, org: a.organization_id, kind: a.kind, edit, userId: p.userId });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}

export async function venuesView(db: Pool, p: Principal) {
  return scope(db, p, false, async ({ c, org, kind, edit }) => ({
    organization_id: org,
    can: { edit },
    venues: (
      await c.query(
        `SELECT ${columns},(SELECT o.name FROM organization o WHERE o.id=v.organization_id) AS added_by FROM shared_venue v ORDER BY lower(name) LIMIT 2000`,
      )
    ).rows,
    // Our own places can be copied into the directory in one click.
    places:
      kind === "club" && edit
        ? (
            await c.query(
              "SELECT p.id,p.name,p.address,EXISTS(SELECT 1 FROM shared_venue v WHERE lower(trim(v.name))=lower(trim(p.name)) AND lower(trim(v.address))=lower(trim(p.address))) AS shared FROM calendar_place p WHERE p.organization_id=$1 AND NOT p.archived ORDER BY p.name",
              [org],
            )
          ).rows
        : [],
  }));
}

export async function venueExecute(db: Pool, p: Principal, input: VenueCommand) {
  return scope(db, p, true, async ({ c, org, userId }) => {
    if (input.action === "shareFromPlace") {
      const place = (
        await c.query(
          "SELECT * FROM calendar_place WHERE id=$1 AND organization_id=$2",
          [input.placeId, org],
        )
      ).rows[0];
      if (!place) throw new AccessError("NOT_FOUND", 404);
      if (place.address.trim().length < 2) throw new AccessError("INVALID_INPUT", 400);
      const id = (
        await c.query(
          `INSERT INTO shared_venue(name,address,created_by,organization_id,step_free,adapted_toilets,parking,charging,notes,updated_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$3) RETURNING id`,
          [
            place.name,
            place.address,
            userId,
            org,
            place.accessible || null,
            place.toilets || null,
            place.parking || null,
            place.charging || null,
            place.logistics.slice(0, 2000),
          ],
        )
      ).rows[0].id as string;
      await history(c, id, org, userId, null);
      await audit(c, org, userId, "venue.shared", id);
      return { id };
    }
    const values = [
      input.name,
      input.address,
      input.city,
      input.phone,
      input.website,
      input.stepFree,
      input.adaptedToilets,
      input.changingRooms,
      input.showers,
      input.lift,
      input.hoist,
      input.parking,
      input.charging,
      input.doorWidthCm,
      input.floor,
      input.court,
      input.notes,
      input.checkedOn,
      userId,
    ];
    if (input.id) {
      const before = (
        await c.query(`SELECT ${columns} FROM shared_venue WHERE id=$1 FOR UPDATE`, [input.id])
      ).rows[0];
      if (!before) throw new AccessError("NOT_FOUND", 404);
      if (before.version !== input.version) throw new AccessError("STALE_VERSION", 409);
      await c.query(
        `UPDATE shared_venue SET name=$2,address=$3,city=$4,phone=$5,website=$6,step_free=$7,adapted_toilets=$8,changing_rooms=$9,showers=$10,lift=$11,hoist=$12,parking=$13,charging=$14,door_width_cm=$15,floor=$16,court=$17,notes=$18,checked_on=$19,updated_by=$20,updated_at=now(),version=version+1 WHERE id=$1`,
        [input.id, ...values],
      );
      await history(c, input.id, org, userId, before);
      return { id: input.id };
    }
    const id = (
      await c.query(
        `INSERT INTO shared_venue(name,address,city,phone,website,step_free,adapted_toilets,changing_rooms,showers,lift,hoist,parking,charging,door_width_cm,floor,court,notes,checked_on,updated_by,created_by,organization_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,$20) RETURNING id`,
        [...values, org],
      )
    ).rows[0].id as string;
    await history(c, id, org, userId, null);
    return { id };
  });
}
/** Every change keeps who made it and what it replaced (the directory is shared). */
async function history(
  c: PoolClient,
  id: string,
  org: string,
  userId: string,
  before: unknown,
) {
  const after = (await c.query(`SELECT ${columns} FROM shared_venue WHERE id=$1`, [id])).rows[0];
  await c.query(
    "INSERT INTO shared_venue_history(venue_id,organization_id,actor_id,before_data,after_data) VALUES($1,$2,$3,$4,$5)",
    [id, org, userId, before ? JSON.stringify(before) : null, JSON.stringify(after)],
  );
}

/** How well a hall fits: yes answers out of known ones, and what is unknown. */
export function accessibilityScore(v: Record<string, boolean | null>) {
  const keys = ["step_free", "adapted_toilets", "changing_rooms", "parking", "charging"];
  const known = keys.filter((k) => v[k] !== null && v[k] !== undefined);
  return {
    yes: known.filter((k) => v[k] === true).length,
    known: known.length,
    unknown: keys.length - known.length,
  };
}
