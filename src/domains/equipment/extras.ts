import type { PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, audit } from "../access/service";
import type { Scope } from "./service";
import { freeFor, itemCategories, type Command } from "./schema";

/**
 * 11: the club's equipment categories and direct loans. The system
 * categories (the ones the alerts know: batteries, first aid…) are created
 * for each club, renamed if one likes, never archived nor merged away; the
 * club adds its own. A direct loan lends a chair or a quantity of small
 * material to another club of the federation or to a player of the club,
 * handed over at once, until its return.
 */
const systemNames: Record<(typeof itemCategories)[number], string> = {
  ball: "Ballons",
  cone: "Cônes et plots",
  first_aid: "Trousse de secours",
  battery: "Batteries",
  charger: "Chargeurs",
  spare_part: "Pièces de rechange",
  jersey: "Maillots",
  protection: "Protections",
  tool: "Outils",
  other: "Autre",
};
export type Category = { id: string; system_key: string | null; name: string; archived: boolean; items: number };
export async function ensureCategories(c: PoolClient, org: string) {
  for (const key of itemCategories)
    await c.query("INSERT INTO equipment_category(organization_id,system_key,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [org, key, systemNames[key]]);
}
export async function categoriesOf(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT g.id,g.system_key,g.name,g.archived,
              (SELECT count(*)::int FROM equipment_item i WHERE i.organization_id=g.organization_id AND NOT i.archived AND (i.category_id=g.id OR (i.category_id IS NULL AND i.category=g.system_key))) AS items
         FROM equipment_category g WHERE g.organization_id=$1 ORDER BY g.archived,g.system_key IS NULL,lower(g.name)`,
      [org],
    )
  ).rows as Category[];
}
/** The system key an item keeps (for the alerts) and its category row. */
export async function categoryFor(c: PoolClient, org: string, id: string | null | undefined) {
  if (!id) return null;
  const g = (await c.query("SELECT id,system_key FROM equipment_category WHERE id=$1 AND organization_id=$2 AND NOT archived", [id, org])).rows[0] as { id: string; system_key: string | null } | undefined;
  if (!g) throw new AccessError("NOT_FOUND", 404);
  return { id: g.id, key: g.system_key ?? "other" };
}
const deny = (s: Scope) => {
  throw new AccessError(mfaSatisfied(s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED");
};

export async function categoryExecute(s: Scope, input: Extract<Command, { action: "categoryCreate" | "categoryRename" | "categoryMerge" | "categoryArchive" }>) {
  if (!s.manage) deny(s);
  const org = s.a.organization_id;
  await ensureCategories(s.c, org);
  const clash = async (name: string, except: string | null) =>
    (await s.c.query("SELECT id FROM equipment_category WHERE organization_id=$1 AND lower(trim(name))=lower(trim($2)) AND NOT archived AND ($3::uuid IS NULL OR id<>$3)", [org, name, except])).rows[0]?.id as string | undefined;
  if (input.action === "categoryCreate") {
    // Typed again: the existing one is taken, never a second.
    const known = await clash(input.name, null);
    if (known) return { id: known };
    const id = (await s.c.query("INSERT INTO equipment_category(organization_id,name) VALUES($1,$2) RETURNING id", [org, input.name])).rows[0].id as string;
    await audit(s.c, org, s.p.userId, "equipment.category_created", id);
    return { id };
  }
  const g = (await s.c.query("SELECT id,system_key FROM equipment_category WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.id, org])).rows[0];
  if (!g) throw new AccessError("NOT_FOUND", 404);
  if (input.action === "categoryRename") {
    if (await clash(input.name, input.id)) throw new AccessError("DUPLICATE", 409);
    await s.c.query("UPDATE equipment_category SET name=$2 WHERE id=$1", [input.id, input.name]);
    return { id: input.id };
  }
  // A system category stays: the alerts watch it.
  if (g.system_key) throw new AccessError("SYSTEM_CATEGORY", 409);
  if (input.action === "categoryArchive") {
    await s.c.query("UPDATE equipment_category SET archived=$2 WHERE id=$1", [input.id, input.archived]);
    return { id: input.id };
  }
  const into = await categoryFor(s.c, org, input.into);
  if (!into || into.id === input.id) throw new AccessError("NOT_FOUND", 404);
  await s.c.query("UPDATE equipment_item SET category_id=$2,category=$3,version=version+1,updated_at=now() WHERE category_id=$1 AND organization_id=$4", [input.id, into.id, into.key, org]);
  await s.c.query("UPDATE equipment_category SET archived=true WHERE id=$1", [input.id]);
  await audit(s.c, org, s.p.userId, "equipment.category_merged", input.id);
  return { id: into.id };
}

export type DirectLoan = {
  id: string;
  chair_id: string | null;
  chair: string | null;
  item_id: string | null;
  item: string | null;
  quantity: number;
  borrower_id: string | null;
  borrower: string;
  profile_id: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  conditions: string;
};
/** The direct loans of the club: small material, and chairs lent to its players. */
export async function directLoansView(s: Scope) {
  if (!s.manage) return [] as DirectLoan[];
  return (
    await s.c.query(
      `SELECT l.id,l.chair_id,CASE WHEN l.chair_id IS NOT NULL THEN chair_label(l.chair_id) END AS chair,l.item_id,i.name AS item,l.quantity,l.borrower_id,
              COALESCE(o.name,p.full_name) AS borrower,l.borrower_profile_id AS profile_id,l.starts_on::text AS starts_on,l.ends_on::text AS ends_on,l.status,l.conditions
         FROM equipment_loan l LEFT JOIN equipment_item i ON i.id=l.item_id LEFT JOIN organization o ON o.id=l.borrower_id LEFT JOIN club_person p ON p.id=l.borrower_profile_id
        WHERE l.lender_id=$1 AND (l.item_id IS NOT NULL OR l.borrower_profile_id IS NOT NULL) AND (l.status='ongoing' OR l.created_at>now()-interval '365 days')
        ORDER BY l.status='ongoing' DESC,l.starts_on DESC LIMIT 300`,
      [s.a.organization_id],
    )
  ).rows as DirectLoan[];
}
/** How many of an item are out on a loan going on. */
export async function lentOut(c: PoolClient, itemId: string) {
  return Number((await c.query("SELECT COALESCE(sum(quantity),0)::int AS n FROM equipment_loan WHERE item_id=$1 AND status='ongoing'", [itemId])).rows[0].n);
}

export async function directLoanExecute(s: Scope, input: Extract<Command, { action: "lendDirect" | "returnDirect" }>) {
  if (!s.manage) deny(s);
  const org = s.a.organization_id;
  if (input.action === "returnDirect") {
    const r = await s.c.query(
      "UPDATE equipment_loan SET status='returned',returned_at=now(),condition_in=$3,version=version+1 WHERE id=$1 AND lender_id=$2 AND status='ongoing' RETURNING id,chair_id",
      [input.id, org, input.condition],
    );
    if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
    await audit(s.c, org, s.p.userId, "equipment.loan_returned", input.id);
    return { id: input.id };
  }
  if (!!input.chairId === !!input.itemId || !!input.borrowerId === !!input.profileId || input.endsOn < input.startsOn) throw new AccessError("INVALID_INPUT", 400);
  if (input.borrowerId) {
    // Another club of the same federation (or the federation itself), never one's own club.
    const ok = (
      await s.c.query("SELECT 1 FROM organization o WHERE o.id=$1 AND o.id<>$2 AND $3::uuid IS NOT NULL AND (o.id=$3 OR (o.federation_id=$3 AND o.kind='club'))", [input.borrowerId, org, s.fed])
    ).rowCount;
    if (!ok) throw new AccessError("NOT_FOUND", 404);
  } else if (!(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [input.profileId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  let quantity = 1;
  if (input.chairId) {
    const chair = (await s.c.query("SELECT id,status FROM equipment_chair WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.chairId, org])).rows[0];
    if (!chair || chair.status === "retired") throw new AccessError("NOT_FOUND", 404);
    const loans = (await s.c.query("SELECT status,starts_on::text AS starts_on,ends_on::text AS ends_on FROM equipment_loan WHERE chair_id=$1", [input.chairId])).rows;
    if (!freeFor(loans, { starts_on: input.startsOn, ends_on: input.endsOn })) throw new AccessError("CHAIR_NOT_FREE", 409);
  } else {
    const item = (await s.c.query("SELECT id,quantity FROM equipment_item WHERE id=$1 AND organization_id=$2 AND NOT archived FOR UPDATE", [input.itemId, org])).rows[0];
    if (!item) throw new AccessError("NOT_FOUND", 404);
    quantity = input.quantity;
    if (quantity > item.quantity - (await lentOut(s.c, item.id))) throw new AccessError("NOT_ENOUGH", 409);
  }
  const id = (
    await s.c.query(
      `INSERT INTO equipment_loan(chair_id,item_id,quantity,lender_id,borrower_id,borrower_profile_id,starts_on,ends_on,conditions,status,initiated_by,created_by,handed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ongoing','lender',$10,now()) RETURNING id`,
      [input.chairId ?? null, input.itemId ?? null, quantity, org, input.borrowerId ?? null, input.profileId ?? null, input.startsOn, input.endsOn, input.conditions, s.p.userId],
    )
  ).rows[0].id as string;
  await audit(s.c, org, s.p.userId, "equipment.loan_direct", id);
  return { id };
}
