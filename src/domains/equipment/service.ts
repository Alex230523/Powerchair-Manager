import type { Pool, PoolClient } from "pg";
import { resolveScope, teamMembers } from "../scope/service";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { offerUndo } from "../undo/service";
import { permissions } from "../access/policy";
import { ownProfiles, type Actor } from "../calendar/access";
import { commandSchema, type Command } from "./schema";
import { stockExecute, stockView } from "./stock";
import { modelsView, resolveModel, decideModel } from "./models";
import { storageView, storageExecute, storageIn } from "./storage";
import { loansView, loanExecute } from "./loans";
export { commandSchema };

/**
 * `fed`: the federation the organisation belongs to (itself for a
 * federation), the family within which chairs are lent (wave 17, Q1).
 */
export type Scope = { c: PoolClient; p: Principal; a: Actor; manage: boolean; kind: "club" | "federation"; fed: string | null; orgName: string };
export type Chair = {
  id: string;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
  ownership: string;
  status: string;
  max_speed_kmh: string | null;
  battery: string;
  acquired_on: string | null;
  last_service_on: string | null;
  next_service_on: string | null;
  notes: string;
  storage: string;
  version: number;
  model_id: string | null;
  storage_location_id: string | null;
  lendable: boolean;
  created_at: string;
  model_brand: string | null;
  model_name: string | null;
  model_status: "validated" | "proposed" | "refused" | null;
  storage_name: string | null;
  /** A4: the supplier, a contact of the club's book. */
  supplier_contact_id: string | null;
  supplier_name: string | null;
};
export type ChairLink = {
  id: string;
  chair_id: string;
  profile_id: string;
  full_name: string;
  is_primary: boolean;
  starts_on: string;
  ends_on: string | null;
};
const chairColumns =
  "c.id,c.name,c.brand,c.model,c.serial_number,c.ownership,c.status,c.max_speed_kmh::text,c.battery,c.acquired_on::text,c.last_service_on::text,c.next_service_on::text,c.notes,c.storage,c.version,c.model_id,c.storage_location_id,c.lendable,c.created_at,c.supplier_contact_id";
/** Reads: the model and the storage place by name (wave 17, Q1). */
const chairSelect = `${chairColumns},cm.brand AS model_brand,cm.name AS model_name,cm.status AS model_status,sl.name AS storage_name,sup.full_name AS supplier_name
  FROM equipment_chair c LEFT JOIN chair_model cm ON cm.id=c.model_id LEFT JOIN storage_location sl ON sl.id=c.storage_location_id
  LEFT JOIN contact sup ON sup.id=c.supplier_contact_id AND sup.organization_id=c.organization_id`;
const linkColumns =
  "l.id,l.chair_id,l.profile_id,p.full_name,l.is_primary,l.starts_on::text,l.ends_on::text";

export async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: Scope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const initial = await active(c, p);
    // Writes serialise per organisation like every module; reads only share the lock.
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [initial.organization_id],
    );
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const a = {
      ...(await active(c, p)),
      twoFactorEnabled: !!(await account(c, p)).twoFactorEnabled,
    };
    if (
      a.organization_id !== initial.organization_id ||
      (expected && expected !== a.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    // Wave 17 (Q1): the federation keeps its own fleet with the same screens.
    const federation = a.kind === "federation";
    const fed = federation
      ? a.organization_id
      : ((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id ?? null);
    const out = await fn({
      c,
      p,
      a,
      kind: federation ? "federation" : "club",
      fed,
      orgName: a.organization_name,
      manage:
        mfaSatisfied(a.twoFactorEnabled) &&
        (federation
          ? ["federation_president", "federation_worker"].includes(a.role)
          : permissions(a.role, a.grants).includes("equipment.manage")),
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new AccessError("DUPLICATE", 409);
    if (code === "23514") throw new AccessError("INVALID_INPUT", 400);
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Profiles whose chairs this actor may see without equipment.manage:
 * their own (or represented child's) profiles, and for a coach the
 * players of the teams they currently coach.
 */
/** A4: the chair's supplier, a contact of the same club (absent: unchanged). */
async function setSupplier(c: PoolClient, org: string, chairId: string, contactId: string | null | undefined) {
  if (contactId === undefined) return;
  if (contactId && !(await c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [contactId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  await c.query("UPDATE equipment_chair SET supplier_contact_id=$3 WHERE id=$1 AND organization_id=$2", [chairId, org, contactId]);
}

export async function readableProfiles(c: PoolClient, a: Actor) {
  const visible = await ownProfiles(c, a);
  if (a.role === "coach" && mfaSatisfied(a.twoFactorEnabled)) {
    const teams = a.team_id
      ? [a.team_id]
      : (
          await c.query(
            "SELECT m.team_id FROM team_membership m JOIN club_person c ON c.id=m.profile_id AND c.organization_id=m.organization_id JOIN person p ON p.id=c.person_id WHERE m.organization_id=$1 AND p.user_id=$2 AND c.status='active' AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)",
            [a.organization_id, a.user_id],
          )
        ).rows.map((r) => r.team_id as string);
    for (const r of (
      await c.query(
        "SELECT DISTINCT m.profile_id FROM team_membership m JOIN club_person c ON c.id=m.profile_id WHERE m.organization_id=$1 AND m.team_id=ANY($2::uuid[]) AND c.status='active' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)",
        [a.organization_id, teams],
      )
    ).rows)
      visible.add(r.profile_id);
  }
  return visible;
}

/** Chairs linked (now) to the given profiles, with only the visible links. */
export async function chairsFor(
  c: PoolClient,
  org: string,
  profiles: string[],
  includeAll = false,
) {
  const chairs = (
    await c.query(
      `SELECT ${chairSelect} WHERE c.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM equipment_chair_assignment l WHERE l.chair_id=c.id AND l.ends_on IS NULL AND l.profile_id=ANY($3::uuid[]))) ORDER BY c.status='retired',c.name`,
      [org, includeAll, profiles],
    )
  ).rows as Chair[];
  const links = (
    await c.query(
      `SELECT ${linkColumns} FROM equipment_chair_assignment l JOIN club_person p ON p.id=l.profile_id WHERE l.organization_id=$1 AND l.chair_id=ANY($2::uuid[]) ORDER BY l.ends_on IS NOT NULL,l.is_primary DESC,p.full_name`,
      [org, chairs.map((x) => x.id)],
    )
  ).rows as ChairLink[];
  const allowed = new Set(profiles);
  return chairs.map((chair) => {
    const mine = links.filter((l) => l.chair_id === chair.id);
    const shown = includeAll
      ? mine
      : mine.filter((l) => !l.ends_on && allowed.has(l.profile_id));
    return {
      ...chair,
      links: shown,
      // Other current users are counted, never named, for non-managers.
      others: includeAll
        ? 0
        : mine.filter((l) => !l.ends_on && !allowed.has(l.profile_id)).length,
    };
  });
}

export async function equipmentView(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}) {
  return scope(db, p, false, async (s) => {
    const org = s.a.organization_id;
    const visible = s.manage ? [] : [...(await readableProfiles(s.c, s.a))];
    // The top bar's team (wave 12): chairs used by its members, plus the unassigned ones.
    const chosen = await resolveScope(s.c, { organization_id: org, role: s.a.role, user_id: p.userId, team_id: s.a.team_id }, raw);
    const members = chosen.teamId ? new Set(await teamMembers(s.c, org, chosen.teamId)) : null;
    const chairs = (await chairsFor(s.c, org, visible, s.manage)).filter(
      (ch) => !members || !ch.links.some((l) => !l.ends_on) || ch.links.some((l) => !l.ends_on && members.has(l.profile_id)),
    );
    return {
      context: { organization_id: org, role: s.a.role },
      manage: s.manage,
      chairs,
      players: s.manage
        ? (
            await s.c.query(
              "SELECT c.id,c.full_name FROM club_person c WHERE c.organization_id=$1 AND c.status='active' AND ('player'=ANY(c.directory_roles) OR EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=c.id AND m.role='player' AND NOT m.cancelled)) ORDER BY c.full_name",
              [org],
            )
          ).rows
        : [],
      ...(await stockView(s)),
      history: (s.manage
        ? (
            await s.c.query(
              'SELECT h.chair_id,h.action,h.created_at,u.name AS actor,h.after_data AS details FROM equipment_history h JOIN "user" u ON u.id=h.actor_id WHERE h.organization_id=$1 ORDER BY h.created_at DESC LIMIT 500',
              [org],
            )
          ).rows
        : []) as { chair_id: string; action: string; created_at: string; actor: string; details: Record<string, unknown> | null }[],
      // Wave 17 (Q1).
      kind: s.kind,
      models: await modelsView(s),
      storage: await storageView(s),
      loans: await loansView(s),
    };
  });
}

export async function log(
  s: Scope,
  chairId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await s.c.query(
    "INSERT INTO equipment_history(organization_id,chair_id,actor_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)",
    [
      s.a.organization_id,
      chairId,
      s.p.userId,
      action,
      before === null ? null : JSON.stringify(before),
      JSON.stringify(after),
    ],
  );
  await audit(
    s.c,
    s.a.organization_id,
    s.p.userId,
    "equipment." + action,
    chairId,
  );
}

export async function equipmentExecute(
  db: Pool,
  p: Principal,
  input: Command,
  org: string,
) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (
        input.action === "item" ||
        input.action === "wish" ||
        input.action === "decideWish" ||
        input.action === "boughtWish" ||
        input.action === "cancelWish"
      )
        return stockExecute(s, input);
      if (input.action === "storage") return storageExecute(s, input);
      if (input.action === "decideModel") return decideModel(s, input);
      if (
        input.action === "lend" ||
        input.action === "requestLoan" ||
        input.action === "decideLoan" ||
        input.action === "handOver" ||
        input.action === "returnLoan" ||
        input.action === "cancelLoan"
      )
        return loanExecute(s, input);
      if (!s.manage)
        throw new AccessError(
          mfaSatisfied(s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
        );
      const o = s.a.organization_id;
      if (input.action === "service") {
        const before = (await s.c.query(`SELECT ${chairColumns} FROM equipment_chair c WHERE c.id=$1 AND c.organization_id=$2 FOR UPDATE`, [input.chairId, o])).rows[0];
        if (!before) throw new AccessError("NOT_FOUND", 404);
        if (before.version !== input.expectedVersion) throw new AccessError("STALE_VERSION", 409);
        if (input.nextOn && input.nextOn < input.doneOn) throw new AccessError("INVALID_DATE", 400);
        await s.c.query(
          "UPDATE equipment_chair SET last_service_on=$3,next_service_on=$4,status=CASE WHEN status='maintenance' THEN 'available' ELSE status END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [input.chairId, o, input.doneOn, input.nextOn],
        );
        await log(s, input.chairId, "service", { last: before.last_service_on, next: before.next_service_on }, { last: input.doneOn, next: input.nextOn, note: input.note });
        return { id: input.chairId };
      }
      if (input.action === "chair") {
        for (const [a, b] of [
          [input.acquiredOn, input.lastServiceOn],
          [input.lastServiceOn, input.nextServiceOn],
        ])
          if (a && b && b < a) throw new AccessError("INVALID_DATE", 400);
        // Wave 17 (Q1): the model and the purchase date are required; the
        // free-text columns follow the model and the storage place.
        if (!input.acquiredOn) throw new AccessError("ACQUIRED_REQUIRED", 400);
        const model = await resolveModel(s, input.modelId ?? null, input.newModel ?? null);
        const place = input.storageLocationId ? await storageIn(s, input.storageLocationId) : null;
        const values = [
          input.name,
          model.brand || input.brand,
          model.name,
          input.serialNumber,
          input.ownership,
          input.status,
          input.maxSpeedKmh,
          input.battery,
          input.acquiredOn,
          input.lastServiceOn,
          input.nextServiceOn,
          input.notes,
          place ? place.name.slice(0, 120) : (input.storage ?? ""),
          model.id,
          place?.id ?? null,
          input.lendable ?? false,
        ];
        if (!input.id) {
          const row = (
            await s.c.query(
              `INSERT INTO equipment_chair(organization_id,name,brand,model,serial_number,ownership,status,max_speed_kmh,battery,acquired_on,last_service_on,next_service_on,notes,storage,model_id,storage_location_id,lendable) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING ${chairColumns.replaceAll("c.", "")}`,
              [o, ...values],
            )
          ).rows[0];
          await log(s, row.id, "create", null, row);
          await setSupplier(s.c, o, row.id as string, input.supplierContactId);
          return { id: row.id as string };
        }
        const before = (
          await s.c.query(
            `SELECT ${chairColumns} FROM equipment_chair c WHERE c.id=$1 AND c.organization_id=$2 FOR UPDATE`,
            [input.id, o],
          )
        ).rows[0];
        if (!before) throw new AccessError("NOT_FOUND", 404);
        if (before.version !== input.expectedVersion)
          throw new AccessError("STALE_VERSION", 409);
        const after = (
          await s.c.query(
            `UPDATE equipment_chair SET name=$3,brand=$4,model=$5,serial_number=$6,ownership=$7,status=$8,max_speed_kmh=$9,battery=$10,acquired_on=$11,last_service_on=$12,next_service_on=$13,notes=$14,storage=CASE WHEN $19 THEN storage ELSE $15 END,model_id=$16,storage_location_id=CASE WHEN $19 THEN storage_location_id ELSE $17 END,lendable=CASE WHEN $20 THEN lendable ELSE $18 END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING ${chairColumns.replaceAll("c.", "")}`,
            // A command without a place or the « Prêtable » flag keeps them.
            [input.id, o, ...values, input.storageLocationId === undefined, input.lendable === undefined],
          )
        ).rows[0];
        await setSupplier(s.c, o, input.id, input.supplierContactId);
        // Retiring a chair closes its current links; the history stays.
        const closed =
          input.status === "retired"
            ? (
                await s.c.query(
                  "UPDATE equipment_chair_assignment SET ends_on=GREATEST(starts_on,CURRENT_DATE) WHERE chair_id=$1 AND ends_on IS NULL RETURNING id",
                  [input.id],
                )
              ).rows.map((r) => r.id as string)
            : [];
        await log(s, input.id, "update", before, after);
        // Wave 15, C10: retiring can be undone for two minutes.
        const undo =
          input.status === "retired" && before.status !== "retired"
            ? await offerUndo(s.c, o, s.p.userId, "chairRetire", input.id, { status: before.status, links: closed })
            : undefined;
        return { id: input.id, ...(undo ? { undo } : {}) };
      }
      if (input.action === "assign") {
        const chair = (
          await s.c.query(
            "SELECT id,status FROM equipment_chair WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [input.chairId, o],
          )
        ).rows[0];
        if (!chair) throw new AccessError("NOT_FOUND", 404);
        if (chair.status === "retired")
          throw new AccessError("INVALID_TRANSITION", 409);
        const person = (
          await s.c.query(
            "SELECT id FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'",
            [input.profileId, o],
          )
        ).rows[0];
        if (!person) throw new AccessError("NOT_FOUND", 404);
        if (input.primary)
          await s.c.query(
            "UPDATE equipment_chair_assignment SET is_primary=false WHERE organization_id=$1 AND profile_id=$2 AND ends_on IS NULL",
            [o, input.profileId],
          );
        const link = (
          await s.c.query(
            "INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,is_primary,starts_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              o,
              input.chairId,
              input.profileId,
              input.primary,
              input.startsOn,
              s.p.userId,
            ],
          )
        ).rows[0];
        if (chair.status === "available")
          await s.c.query(
            "UPDATE equipment_chair SET status='in_use',version=version+1,updated_at=now() WHERE id=$1",
            [input.chairId],
          );
        await log(s, input.chairId, "assign", null, {
          profileId: input.profileId,
          primary: input.primary,
          startsOn: input.startsOn,
        });
        return { id: link.id as string };
      }
      const link = (
        await s.c.query(
          "SELECT l.*,l.starts_on::text FROM equipment_chair_assignment l WHERE l.id=$1 AND l.organization_id=$2 AND l.ends_on IS NULL FOR UPDATE",
          [input.id, o],
        )
      ).rows[0];
      if (!link) throw new AccessError("NOT_FOUND", 404);
      if (input.endsOn < link.starts_on)
        throw new AccessError("INVALID_DATE", 400);
      await s.c.query(
        "UPDATE equipment_chair_assignment SET ends_on=$2,is_primary=false WHERE id=$1",
        [input.id, input.endsOn],
      );
      await s.c.query(
        "UPDATE equipment_chair SET status='available',version=version+1,updated_at=now() WHERE id=$1 AND status='in_use' AND NOT EXISTS(SELECT 1 FROM equipment_chair_assignment WHERE chair_id=$1 AND ends_on IS NULL)",
        [link.chair_id],
      );
      await log(s, link.chair_id, "unassign", null, {
        profileId: link.profile_id,
        endsOn: input.endsOn,
      });
      return { id: input.id };
    },
    org,
  );
}
