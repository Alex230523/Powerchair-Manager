import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { isLocale } from "../../lib/locale";
import { keysTaskTitle } from "./keys-copy";

/**
 * H10: « Clés et badges » in the profile of a coach (and any member of
 * staff): a label, the day it was handed over, a note. Seen by the person,
 * the club's president and those who manage the equipment or the members;
 * written by the latter. When the person leaves, « Récupérer les clés ».
 */
export const keyCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), profileId: z.uuid(), label: z.string().trim().min(2).max(120), handedOn: z.iso.date().nullable(), note: z.string().trim().max(300) }),
  z.object({ action: z.literal("returned"), id: z.uuid(), on: z.iso.date() }),
  z.object({ action: z.literal("remove"), id: z.uuid() }),
]);
export type KeyCommand = z.infer<typeof keyCommand>;

type Ctx = { c: PoolClient; org: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query(write ? "BEGIN" : "BEGIN READ ONLY");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const rights = permissions(a.role, a.grants);
    const manage = mfaSatisfied(!!user.twoFactorEnabled) && (a.role === "club_president" || rights.includes("equipment.manage") || rights.includes("mandates.manage") || rights.includes("people.manage"));
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
async function own(c: PoolClient, org: string, userId: string, profileId: string) {
  return !!(await c.query("SELECT 1 FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND cp.organization_id=$2 AND pe.user_id=$3", [profileId, org, userId])).rowCount;
}

export async function keysView(db: Pool, p: Principal, profileId: string) {
  z.uuid().parse(profileId);
  return scope(db, p, false, async (x) => {
    if (!x.manage && !(await own(x.c, x.org, x.userId, profileId))) throw new AccessError("FORBIDDEN");
    if (!(await x.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [profileId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    return {
      can: { edit: x.manage },
      keys: (
        await x.c.query(
          "SELECT id,label,handed_on::text AS handed_on,note,returned_on::text AS returned_on FROM staff_key WHERE organization_id=$1 AND profile_id=$2 ORDER BY returned_on IS NOT NULL,label",
          [x.org, profileId],
        )
      ).rows as { id: string; label: string; handed_on: string | null; note: string; returned_on: string | null }[],
    };
  });
}

/** The number of keys each person still holds, for the coaches' list (only for those who may see them). */
export async function keyCounts(c: PoolClient, org: string): Promise<Record<string, number>> {
  return Object.fromEntries(
    (await c.query("SELECT profile_id,count(*)::int AS n FROM staff_key WHERE organization_id=$1 AND returned_on IS NULL GROUP BY profile_id", [org])).rows.map((r) => [r.profile_id, r.n]),
  );
}
/** May this account see the keys of everyone (president, equipment or members)? */
export function seesAllKeys(role: string, rights: readonly string[]) {
  return role === "club_president" || rights.includes("equipment.manage") || rights.includes("mandates.manage") || rights.includes("people.manage");
}

export async function keysExecute(db: Pool, p: Principal, cmd: KeyCommand) {
  return scope(db, p, true, async (x) => {
    if (!x.manage) throw new AccessError("FORBIDDEN");
    if (cmd.action === "add") {
      if (!(await x.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.profileId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      const id = (
        await x.c.query("INSERT INTO staff_key(organization_id,profile_id,label,handed_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
          x.org,
          cmd.profileId,
          cmd.label,
          cmd.handedOn,
          cmd.note,
          x.userId,
        ])
      ).rows[0].id as string;
      await audit(x.c, x.org, x.userId, "keys.handed", id);
      return { id };
    }
    const r =
      cmd.action === "returned"
        ? await x.c.query("UPDATE staff_key SET returned_on=$3 WHERE id=$1 AND organization_id=$2 RETURNING id", [cmd.id, x.org, cmd.on])
        : await x.c.query("DELETE FROM staff_key WHERE id=$1 AND organization_id=$2 RETURNING id", [cmd.id, x.org]);
    if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
    await audit(x.c, x.org, x.userId, cmd.action === "returned" ? "keys.returned" : "keys.removed", cmd.id);
    return { id: cmd.id };
  });
}

/** When a person leaves: a task « Récupérer les clés » if they still hold some (once). */
export async function keysOnDeparture(c: PoolClient, org: string, profileId: string, userId: string) {
  const held = (await c.query("SELECT label FROM staff_key WHERE organization_id=$1 AND profile_id=$2 AND returned_on IS NULL ORDER BY label", [org, profileId])).rows.map((r) => r.label as string);
  if (!held.length) return false;
  const who = (await c.query("SELECT full_name FROM club_person WHERE id=$1", [profileId])).rows[0]?.full_name ?? "";
  const lang = (await c.query("SELECT locale FROM person WHERE user_id=$1", [userId])).rows[0]?.locale;
  const title = keysTaskTitle[isLocale(lang) ? lang : "fr"].replace("{name}", who).slice(0, 200);
  await c.query(
    "INSERT INTO task(organization_id,kind,category,title,detail,due_on,origin,created_by,source_key,source_kind) VALUES($1,'other','equipment',$2,$3,CURRENT_DATE+7,'manual',$4,$5,'keys') ON CONFLICT DO NOTHING",
    [org, title, held.join(", ").slice(0, 2000), userId, `keys:${profileId}`],
  );
  return true;
}
