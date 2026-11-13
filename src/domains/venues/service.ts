import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
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
import { publish } from "../notifications/queue";
import { placeCommand, publicFields, visibleVenue, type PlaceCommand, type PlaceRow } from "./schema";
import { brusselsDay } from "../../lib/today";
export { visibleVenue };
export { placeCommand };

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
    // Security (07/11/2026), XSS: a web address only, never `javascript:` nor `data:`.
    website: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(300)]),
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
  fn: (x: { c: PoolClient; org: string; kind: string; edit: boolean; userId: string; federation: string | null }) => Promise<T>,
  expected?: string,
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
        (a.kind === "federation" && fedCan(a.role, a.grants, "federation.competitions")) ||
        rights.includes("calendar.manage"));
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (write && !edit) throw new AccessError(mfa ? "FORBIDDEN" : "MFA_REQUIRED");
    // The directory belongs to a federation: its clubs and itself.
    const federation =
      a.kind === "federation"
        ? a.organization_id
        : (((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id as string | null) ?? null);
    const out = await fn({ c, org: a.organization_id, kind: a.kind, edit, userId: p.userId, federation });
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

const placeColumns = `p.id,p.name,p.address,p.category,p.contact,p.contact_id,c.full_name AS contact_name,c.phone AS contact_phone,c.email AS contact_email,p.capacity,p.accessible,p.toilets,p.parking,p.storage,p.charging,p.home,p.booking_needed,p.food_policy,p.logistics AS notes,p.archived,p.version,p.share_status,p.share_reason,p.shared_venue_id`;

export async function venuesView(db: Pool, p: Principal) {
  return scope(db, p, false, async ({ c, org, kind, edit, federation }) => {
    const places =
      kind === "club"
        ? ((await c.query(`SELECT ${placeColumns} FROM calendar_place p LEFT JOIN contact c ON c.id=p.contact_id AND c.organization_id=p.organization_id WHERE p.organization_id=$1 ORDER BY p.archived,lower(p.name)`, [org])).rows as Record<string, unknown>[])
        : [];
    // Rates are the club's own: never in the shared directory.
    const rates =
      places.length && edit
        ? (
            await c.query(
              `SELECT r.id,r.place_id,r.label,r.amount_cents,r.unit,r.valid_from::text AS valid_from,r.created_at::text AS created_at,u.name AS created_by_name
                 FROM venue_rate r JOIN "user" u ON u.id=r.created_by WHERE r.organization_id=$1 ORDER BY r.valid_from DESC,r.created_at DESC`,
              [org],
            )
          ).rows
        : [];
    return {
      organization_id: org,
      kind,
      federation,
      today: brusselsDay(),
      can: { edit, decide: kind === "federation" && edit },
      venues: (
        await c.query(
          `SELECT ${columns},category,status,v.organization_id=$1 AS own,(SELECT o.name FROM organization o WHERE o.id=v.organization_id) AS added_by FROM shared_venue v WHERE ${visibleVenue()} ORDER BY lower(name) LIMIT 2000`,
          [org],
        )
      ).rows,
      // The club's places, with their private sheet (contact, rates, notes) for those who manage them.
      places: places.map((x) => ({
        ...x,
        ...(edit ? {} : { contact: "", contact_id: null, contact_name: null, contact_phone: null, contact_email: null, food_policy: "", notes: "" }),
        rates: rates.filter((r) => r.place_id === x.id),
      })) as PlaceRow[],
      contacts:
        kind === "club" && edit
          ? (await c.query("SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY full_name LIMIT 1000", [org])).rows
          : [],
      // Federation: proposals of its clubs, public fields only.
      proposals:
        kind === "federation"
          ? (
              await c.query(
                `SELECT p.id,p.name,p.address,p.category,p.accessible,p.toilets,p.parking,p.charging,p.share_requested_at,o.name AS club
                   FROM calendar_place p JOIN organization o ON o.id=p.organization_id
                  WHERE o.federation_id=$1 AND p.share_status='pending' ORDER BY p.share_requested_at`,
                [org],
              )
            ).rows
          : [],
    };
  });
}

export async function venueExecute(db: Pool, p: Principal, input: VenueCommand | PlaceCommand, expected?: string) {
  return scope(db, p, true, async ({ c, org, kind, userId, federation }) => {
    if (input.action !== "save" && input.action !== "shareFromPlace") return placeExecute(c, org, kind, userId, input);
    if (input.action === "shareFromPlace") {
      // Wave 17 (C4): sharing goes through the federation's validation.
      if (kind !== "club") throw new AccessError("CLUB_ONLY");
      return placeExecute(c, org, kind, userId, { action: "proposeShare", placeId: input.placeId });
    }
    // Wave 17 (C4): the federation writes the directory; a club only edits the halls it proposed.
    if (!input.id && kind !== "federation") throw new AccessError("FORBIDDEN");
    if (input.id) {
      const owner = (
        await c.query("SELECT v.organization_id,o.federation_id FROM shared_venue v JOIN organization o ON o.id=v.organization_id WHERE v.id=$1", [input.id])
      ).rows[0] as { organization_id: string; federation_id: string | null } | undefined;
      if (!owner) throw new AccessError("NOT_FOUND", 404);
      const fedOk = kind === "federation" && (owner.organization_id === org || owner.federation_id === federation);
      if (!fedOk && owner.organization_id !== org) throw new AccessError("FORBIDDEN");
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
  }, expected);
}
type Db = PoolClient;
/** Wave 17 (C4): the club's places, their rates and their sharing; the federation's decisions. */
async function placeExecute(c: Db, org: string, kind: string, userId: string, input: PlaceCommand) {
  if (input.action === "decide" || input.action === "withdraw") {
    if (kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    if (input.action === "withdraw") {
      const changed = await c.query(
        "UPDATE shared_venue v SET status='withdrawn',withdrawn_at=now(),withdrawn_by=$3,withdraw_reason=$4,version=version+1 FROM organization o WHERE v.id=$1 AND o.id=v.organization_id AND (o.federation_id=$2 OR o.id=$2) AND v.status='approved' RETURNING v.id",
        [input.venueId, org, userId, input.reason],
      );
      if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
      await c.query("UPDATE calendar_place SET share_status='private',shared_venue_id=NULL WHERE shared_venue_id=$1", [input.venueId]);
      await audit(c, org, userId, "venue.withdrawn", input.venueId, { reason: input.reason });
      return { id: input.venueId };
    }
    const place = (
      await c.query(
        "SELECT p.*,o.name AS club FROM calendar_place p JOIN organization o ON o.id=p.organization_id WHERE p.id=$1 AND o.federation_id=$2 AND p.share_status='pending' FOR UPDATE OF p",
        [input.placeId, org],
      )
    ).rows[0];
    if (!place) throw new AccessError("NOT_FOUND", 404);
    if (!input.approve && input.reason.length < 3) throw new AccessError("INVALID_INPUT", 400);
    let venue: string | null = null;
    if (input.approve) {
      const pub = publicFields(place);
      // The same hall proposed twice joins the existing line.
      venue =
        ((
          await c.query("SELECT id FROM shared_venue WHERE lower(trim(name))=lower(trim($1)) AND lower(trim(address))=lower(trim($2))", [pub.name, pub.address])
        ).rows[0]?.id as string | undefined) ?? null;
      if (venue)
        await c.query("UPDATE shared_venue SET status='approved',withdrawn_at=NULL,withdrawn_by=NULL,withdraw_reason='',category=$2,updated_by=$3,updated_at=now(),version=version+1 WHERE id=$1", [
          venue,
          pub.category,
          userId,
        ]);
      else
        venue = (
          await c.query(
            `INSERT INTO shared_venue(name,address,category,step_free,adapted_toilets,parking,charging,created_by,updated_by,organization_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING id`,
            [pub.name, pub.address, pub.category, pub.step_free, pub.adapted_toilets, pub.parking, pub.charging, userId, place.organization_id],
          )
        ).rows[0].id as string;
      await history(c, venue, place.organization_id, userId, null);
    }
    await c.query(
      "UPDATE calendar_place SET share_status=$2,share_reason=$3,share_decided_at=now(),share_decided_by=$4,shared_venue_id=$5 WHERE id=$1",
      [place.id, input.approve ? "approved" : "refused", input.approve ? "" : input.reason, userId, venue],
    );
    await audit(c, org, userId, input.approve ? "venue.approved" : "venue.refused", place.id, { club: place.organization_id });
    await tellClub(c, place.organization_id, place.name, input.approve, input.reason);
    return { id: place.id, venue };
  }
  if (kind !== "club") throw new AccessError("CLUB_ONLY");
  if (input.action === "savePlace") {
    let contact = input.contactId;
    if (contact && !(await c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [contact, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    if (input.newContact)
      contact = (
        await c.query("INSERT INTO contact(organization_id,full_name,organization_name,email,phone,tags,created_by) VALUES($1,$2,$3,$4,$5,'{venue}',$6) RETURNING id", [
          org,
          input.newContact.fullName,
          input.newContact.organizationName,
          input.newContact.email,
          input.newContact.phone,
          userId,
        ])
      ).rows[0].id as string;
    const values = [input.name, input.address, input.category, contact, input.capacity, input.accessible, input.toilets, input.parking, input.storage, input.charging, input.home, input.foodPolicy, input.notes, input.archived, input.bookingNeeded ?? (!input.home && input.category === "training")];
    if (input.id) {
      const before = (await c.query("SELECT * FROM calendar_place WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.id, org])).rows[0];
      if (!before) throw new AccessError("NOT_FOUND", 404);
      if (input.expectedVersion !== undefined && before.version !== input.expectedVersion) throw new AccessError("STALE_VERSION", 409);
      await c.query(
        `UPDATE calendar_place SET name=$3,address=$4,category=$5,contact_id=$6,capacity=$7,accessible=$8,toilets=$9,parking=$10,storage=$11,charging=$12,home=$13,food_policy=$14,logistics=$15,archived=$16,
                booking_needed=CASE WHEN $18::boolean THEN $17 ELSE booking_needed END,version=version+1 WHERE id=$1 AND organization_id=$2`,
        [input.id, org, ...values, input.bookingNeeded !== undefined],
      );
      await audit(c, org, userId, "place.updated", input.id);
      return { id: input.id };
    }
    const id = (
      await c.query(
        `INSERT INTO calendar_place(organization_id,name,address,category,contact_id,capacity,accessible,toilets,parking,storage,charging,home,food_policy,logistics,archived,booking_needed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [org, ...values],
      )
    ).rows[0].id as string;
    await audit(c, org, userId, "place.created", id);
    return { id };
  }
  if (input.action === "addRate") {
    if (!(await c.query("SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2", [input.placeId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    const id = (
      await c.query("INSERT INTO venue_rate(organization_id,place_id,label,amount_cents,unit,valid_from,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
        org,
        input.placeId,
        input.label,
        input.amountCents,
        input.unit,
        input.validFrom,
        userId,
      ])
    ).rows[0].id as string;
    await audit(c, org, userId, "place.rate", input.placeId, { label: input.label, amountCents: input.amountCents });
    return { id };
  }
  // proposeShare
  const club = (await c.query("SELECT federation_id FROM organization WHERE id=$1", [org])).rows[0]?.federation_id as string | null;
  if (!club) throw new AccessError("NO_FEDERATION", 409);
  const place = (await c.query("SELECT id,address,share_status FROM calendar_place WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.placeId, org])).rows[0];
  if (!place) throw new AccessError("NOT_FOUND", 404);
  if (place.address.trim().length < 2) throw new AccessError("ADDRESS_REQUIRED", 400);
  if (!["private", "refused"].includes(place.share_status)) throw new AccessError("DUPLICATE", 409);
  await c.query("UPDATE calendar_place SET share_status='pending',share_reason='',share_requested_at=now() WHERE id=$1", [place.id]);
  await audit(c, org, userId, "place.proposed", place.id);
  return { id: place.id };
}
/** The club's presidents hear the decision in their inbox. */
async function tellClub(c: Db, club: string, name: string, approved: boolean, reason: string) {
  const presidents = (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id
         LEFT JOIN person pe ON pe.user_id=u.id WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active`,
      [club],
    )
  ).rows;
  const words = {
    fr: approved ? `Lieu validé pour l'annuaire partagé : ${name}` : `Lieu refusé pour l'annuaire partagé : ${name} (${reason})`,
    nl: approved ? `Locatie gevalideerd voor de gedeelde gids: ${name}` : `Locatie geweigerd voor de gedeelde gids: ${name} (${reason})`,
    en: approved ? `Place validated for the shared directory: ${name}` : `Place refused for the shared directory: ${name} (${reason})`,
  };
  for (const u of presidents) {
    const locale = (["fr", "nl", "en"].includes(u.locale) ? u.locale : "fr") as "fr" | "nl" | "en";
    await publish(c, {
      organizationId: club,
      userId: u.id,
      email: u.email,
      kind: "funding_task",
      category: "administrative",
      resourceType: "calendar",
      resourceId: name,
      eventKey: `venue_decision:${club}:${name}:${approved}:${Date.now()}`,
      locale,
      inApp: true,
      variables: { name: u.name, organization: "Powerchair Football Manager", url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/venues`, title: words[locale], due: "" },
    });
  }
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
