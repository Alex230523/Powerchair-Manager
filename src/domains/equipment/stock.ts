import { categoryFor } from "./extras";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, audit } from "../access/service";
import { permissions } from "../access/policy";
import { brusselsToday } from "../people/service";
import type { Scope } from "./service";
import { storageIn } from "./storage";
import { expiryState, type Command } from "./schema";

/**
 * Small material (balls, first-aid kits, batteries, chargers) with where it is
 * kept and its expiry date, and purchase wishes: a coach or the equipment
 * manager proposes, the president or the treasurer validates, the equipment
 * manager notes the purchase.
 */
function rights(s: Scope) {
  const mfa = mfaSatisfied(s.a.twoFactorEnabled);
  const r = permissions(s.a.role, s.a.grants);
  return {
    mfa,
    items: s.manage,
    see: s.manage || (mfa && s.a.role === "coach"),
    propose: s.manage || (mfa && s.a.role === "coach"),
    decide: mfa && (s.a.role === "club_president" || r.includes("dues.manage")),
  };
}

export async function stockView(s: Scope) {
  const can = rights(s);
  const org = s.a.organization_id;
  const today = brusselsToday();
  const items = can.see
    ? (
        await s.c.query(
          `SELECT i.id,i.name,i.category,i.category_id,COALESCE(g.name,'') AS category_name,i.quantity,i.storage,i.storage_location_id,storage_path(i.storage_location_id) AS storage_path,i.expires_on::text AS expires_on,i.notes,i.archived,i.version,
                  (SELECT COALESCE(sum(l.quantity),0)::int FROM equipment_loan l WHERE l.item_id=i.id AND l.status='ongoing') AS lent
             FROM equipment_item i LEFT JOIN equipment_category g ON g.id=i.category_id WHERE i.organization_id=$1 ORDER BY i.archived,i.category,i.name`,
          [org],
        )
      ).rows.map((i) => ({ ...i, expiry: expiryState(i.expires_on, today) }))
    : [];
  const wishes =
    can.propose || can.decide
      ? (
          await s.c.query(
            `SELECT w.id,w.title,w.reason,w.quantity,w.estimated_cents,w.link,w.status,w.created_at,w.decided_at,w.decision_note,w.bought_on::text AS bought_on,w.version,
                    w.requested_by=$2 AS mine,ru.name AS requested_by,du.name AS decided_by
               FROM equipment_wish w JOIN "user" ru ON ru.id=w.requested_by LEFT JOIN "user" du ON du.id=w.decided_by
              WHERE w.organization_id=$1 AND ($3 OR w.requested_by=$2) AND (w.status IN ('pending','approved') OR w.created_at>now()-interval '365 days')
              ORDER BY w.status='pending' DESC,w.status='approved' DESC,w.created_at DESC LIMIT 200`,
            [org, s.p.userId, s.manage || can.decide],
          )
        ).rows
      : [];
  return {
    items: items as {
      id: string;
      name: string;
      category: string;
      /** 11: the club's category, its name, the full place and what is lent. */
      category_id: string | null;
      category_name: string;
      quantity: number;
      storage: string;
      storage_location_id: string | null;
      storage_path: string | null;
      lent: number;
      expires_on: string | null;
      notes: string;
      archived: boolean;
      version: number;
      expiry: ReturnType<typeof expiryState>;
    }[],
    wishes: wishes as {
      id: string;
      title: string;
      reason: string;
      quantity: number;
      estimated_cents: number | null;
      link: string;
      status: string;
      created_at: string;
      decided_at: string | null;
      decision_note: string;
      bought_on: string | null;
      version: number;
      mine: boolean;
      requested_by: string;
      decided_by: string | null;
    }[],
    storages: can.see
      ? (
          await s.c.query(
            "SELECT DISTINCT storage FROM (SELECT storage FROM equipment_item WHERE organization_id=$1 UNION SELECT storage FROM equipment_chair WHERE organization_id=$1) x WHERE storage<>'' ORDER BY storage LIMIT 50",
            [org],
          )
        ).rows.map((r) => r.storage as string)
      : [],
    stockCan: {
      items: can.items,
      seeItems: can.see,
      propose: can.propose,
      decide: can.decide,
    },
  };
}

type StockCommand = Extract<
  Command,
  { action: "item" | "wish" | "decideWish" | "boughtWish" | "cancelWish" }
>;
export async function stockExecute(s: Scope, input: StockCommand) {
  const can = rights(s);
  const org = s.a.organization_id;
  const deny = () => {
    throw new AccessError(can.mfa ? "FORBIDDEN" : "MFA_REQUIRED");
  };
  if (input.action === "item") {
    if (!can.items) deny();
    // Wave 17 (Q1): a storage place of the club; the text follows its name.
    const place = input.storageLocationId ? await storageIn(s, input.storageLocationId) : null;
    // 11: a club category; a system one gives its key to the alerts, the others are « other ».
    const chosen = await categoryFor(s.c, org, input.categoryId);
    const values = [
      input.name,
      chosen?.key ?? input.category,
      input.quantity,
      place ? place.name.slice(0, 120) : input.storage,
      input.expiresOn,
      input.notes,
      input.archived,
      place?.id ?? null,
    ];
    let id = input.id;
    if (id) {
      const r = await s.c.query(
        "UPDATE equipment_item SET name=$3,category=$4,quantity=$5,storage=CASE WHEN $12 THEN storage ELSE $6 END,expires_on=$7,notes=$8,archived=$9,storage_location_id=CASE WHEN $12 THEN storage_location_id ELSE $10 END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND version=$11 RETURNING id",
        // Without a place in the command (an older screen), the place stays.
        [id, org, ...values, input.expectedVersion ?? 0, input.storageLocationId === undefined],
      );
      if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
    } else
      id = (
        await s.c.query(
          "INSERT INTO equipment_item(organization_id,name,category,quantity,storage,expires_on,notes,archived,storage_location_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
          [org, ...values],
        )
      ).rows[0].id as string;
    if (input.categoryId !== undefined) await s.c.query("UPDATE equipment_item SET category_id=$2 WHERE id=$1", [id, chosen?.id ?? null]);
    await audit(s.c, org, s.p.userId, "equipment.item", id!);
    return { id: id! };
  }
  if (input.action === "wish") {
    if (!can.propose) deny();
    const id = (
      await s.c.query(
        "INSERT INTO equipment_wish(organization_id,title,reason,quantity,estimated_cents,link,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [
          org,
          input.title,
          input.reason,
          input.quantity,
          input.estimatedCents,
          input.link,
          s.p.userId,
        ],
      )
    ).rows[0].id as string;
    await audit(s.c, org, s.p.userId, "equipment.wish", id);
    return { id };
  }
  const w = (
    await s.c.query(
      "SELECT * FROM equipment_wish WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [input.id, org],
    )
  ).rows[0];
  if (!w) throw new AccessError("NOT_FOUND", 404);
  if (input.action === "cancelWish") {
    if (w.requested_by !== s.p.userId) deny();
    if (w.status !== "pending") throw new AccessError("INVALID_TRANSITION", 409);
    await s.c.query(
      "UPDATE equipment_wish SET status='cancelled',version=version+1 WHERE id=$1",
      [w.id],
    );
    await audit(s.c, org, s.p.userId, "equipment.wish.cancelled", w.id);
    return { id: w.id as string };
  }
  if (w.version !== input.expectedVersion)
    throw new AccessError("STALE_VERSION", 409);
  if (input.action === "decideWish") {
    if (!can.decide) deny();
    if (w.status !== "pending") throw new AccessError("INVALID_TRANSITION", 409);
    await s.c.query(
      "UPDATE equipment_wish SET status=$2,decided_by=$3,decided_at=now(),decision_note=$4,version=version+1 WHERE id=$1",
      [w.id, input.decision, s.p.userId, input.note],
    );
    await audit(s.c, org, s.p.userId, "equipment.wish." + input.decision, w.id);
    return { id: w.id as string };
  }
  if (!can.items && !can.decide) deny();
  if (w.status !== "approved") throw new AccessError("INVALID_TRANSITION", 409);
  await s.c.query(
    "UPDATE equipment_wish SET status='bought',bought_on=$2,version=version+1 WHERE id=$1",
    [w.id, input.boughtOn],
  );
  await audit(s.c, org, s.p.userId, "equipment.wish.bought", w.id);
  return { id: w.id as string };
}
