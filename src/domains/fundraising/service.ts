import type { Pool, PoolClient } from "pg";
import { randomBytes } from "node:crypto";
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
 * Fundraising, kept apart from the club accounts. A group (support committee,
 * "new chairs 2027" project) holds pots with a goal. Gifts, sponsors and
 * actions are noted here; nothing is written in the ledger, and the treasurer
 * books the money on their side as usual.
 */
const text = (n: number) => z.string().trim().max(n);
export const movementKinds = ["donation", "sponsor", "action", "subsidy", "expense"] as const;
export const fundraisingCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("group"),
    id: z.uuid().optional(),
    name: text(120).min(2),
    description: text(2000),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("pot"),
    id: z.uuid().optional(),
    groupId: z.uuid(),
    name: text(120).min(2),
    description: text(2000),
    goalCents: z.number().int().min(100).max(1000000000),
    deadline: z.iso.date().nullable(),
    status: z.enum(["open", "closed"]),
  }),
  z.object({ action: z.literal("publish"), potId: z.uuid(), public: z.boolean() }),
  z.object({
    action: z.literal("movement"),
    potId: z.uuid(),
    occurredOn: z.iso.date(),
    kind: z.enum(movementKinds),
    label: text(160).min(2),
    amountCents: z.number().int().min(1).max(1000000000),
    donor: text(160),
    anonymous: z.boolean(),
  }),
  z.object({ action: z.literal("cancelMovement"), id: z.uuid() }),
]);
export type FundraisingCommand = z.infer<typeof fundraisingCommand>;

/** Collected = gifts, sponsors, actions and subsidies, minus expenses. */
export function potProgress(
  goalCents: number,
  movements: { kind: string; amount_cents: number; cancelled_at?: unknown }[],
) {
  const live = movements.filter((m) => !m.cancelled_at);
  const raised = live
    .filter((m) => m.kind !== "expense")
    .reduce((n, m) => n + m.amount_cents, 0);
  const spent = live
    .filter((m) => m.kind === "expense")
    .reduce((n, m) => n + m.amount_cents, 0);
  const net = raised - spent;
  return {
    raised,
    spent,
    net,
    left: Math.max(0, goalCents - net),
    percent: goalCents ? Math.min(100, Math.floor((Math.max(0, net) * 100) / goalCents)) : 0,
    reached: net >= goalCents,
  };
}

async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (x: { c: PoolClient; org: string; manage: boolean; detail: boolean; userId: string }) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [
      a.organization_id,
    ]);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const manage = mfa && rights.includes("dues.manage");
    // Donor names and the movement list: money managers and readers only.
    const detail = manage || (mfa && rights.includes("dues.read"));
    if (write && !manage) throw new AccessError(mfa ? "FORBIDDEN" : "MFA_REQUIRED");
    const out = await fn({ c, org: a.organization_id, manage, detail, userId: p.userId });
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

export async function fundraisingView(db: Pool, p: Principal) {
  return scope(db, p, false, async ({ c, org, manage, detail }) => {
    const groups = (
      await c.query(
        "SELECT id,name,description,archived FROM fundraising_group WHERE organization_id=$1 AND ($2 OR NOT archived) ORDER BY archived,name",
        [org, manage],
      )
    ).rows;
    const pots = (
      await c.query(
        "SELECT id,group_id,name,description,goal_cents,deadline::text AS deadline,status,public_token,version FROM fundraising_pot WHERE organization_id=$1 ORDER BY status,created_at DESC",
        [org],
      )
    ).rows;
    const movements = (
      await c.query(
        `SELECT m.id,m.pot_id,m.occurred_on::text AS occurred_on,m.kind,m.label,m.amount_cents,m.donor,m.anonymous,m.cancelled_at,u.name AS author
           FROM fundraising_movement m JOIN fundraising_pot p ON p.id=m.pot_id JOIN "user" u ON u.id=m.created_by
          WHERE p.organization_id=$1 ORDER BY m.occurred_on DESC,m.created_at DESC`,
        [org],
      )
    ).rows;
    return {
      organization_id: org,
      can: { manage, detail },
      groups,
      pots: pots.map((pot) => {
        const own = movements.filter((m) => m.pot_id === pot.id);
        return {
          ...pot,
          public_token: manage ? pot.public_token : null,
          progress: potProgress(pot.goal_cents, own),
          movements: detail
            ? own
            : // Members see the effort, not who gave what.
              own
                .filter((m) => !m.cancelled_at && m.kind !== "expense")
                .map((m) => ({ id: m.id, occurred_on: m.occurred_on, kind: m.kind, label: m.label })),
        };
      }),
    };
  });
}

export async function fundraisingExecute(
  db: Pool,
  p: Principal,
  cmd: FundraisingCommand,
  expected: string,
) {
  return scope(
    db,
    p,
    true,
    async ({ c, org, userId }) => {
      const pot = async (id: string) => {
        const row = (
          await c.query("SELECT * FROM fundraising_pot WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, org])
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
        return row;
      };
      switch (cmd.action) {
        case "group": {
          if (cmd.id) {
            const changed = await c.query(
              "UPDATE fundraising_group SET name=$3,description=$4,archived=$5 WHERE id=$1 AND organization_id=$2",
              [cmd.id, org, cmd.name, cmd.description, cmd.archived],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: cmd.id };
          }
          const id = (
            await c.query(
              "INSERT INTO fundraising_group(organization_id,name,description,created_by) VALUES($1,$2,$3,$4) RETURNING id",
              [org, cmd.name, cmd.description, userId],
            )
          ).rows[0].id as string;
          await audit(c, org, userId, "fundraising.group", id);
          return { id };
        }
        case "pot": {
          if (
            !(await c.query("SELECT 1 FROM fundraising_group WHERE id=$1 AND organization_id=$2", [cmd.groupId, org]))
              .rowCount
          )
            throw new AccessError("NOT_FOUND", 404);
          const values = [cmd.groupId, cmd.name, cmd.description, cmd.goalCents, cmd.deadline, cmd.status];
          if (cmd.id) {
            await pot(cmd.id);
            await c.query(
              "UPDATE fundraising_pot SET group_id=$3,name=$4,description=$5,goal_cents=$6,deadline=$7,status=$8,version=version+1 WHERE id=$1 AND organization_id=$2",
              [cmd.id, org, ...values],
            );
            return { id: cmd.id };
          }
          const id = (
            await c.query(
              "INSERT INTO fundraising_pot(organization_id,group_id,name,description,goal_cents,deadline,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
              [org, ...values, userId],
            )
          ).rows[0].id as string;
          await audit(c, org, userId, "fundraising.pot", id);
          return { id };
        }
        case "publish": {
          await pot(cmd.potId);
          // The public page shows the goal and the progress, never the donors.
          await c.query("UPDATE fundraising_pot SET public_token=$2 WHERE id=$1", [
            cmd.potId,
            cmd.public ? randomBytes(18).toString("base64url") : null,
          ]);
          return { id: cmd.potId };
        }
        case "movement": {
          await pot(cmd.potId);
          const id = (
            await c.query(
              "INSERT INTO fundraising_movement(pot_id,occurred_on,kind,label,amount_cents,donor,anonymous,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
              [cmd.potId, cmd.occurredOn, cmd.kind, cmd.label, cmd.amountCents, cmd.donor, cmd.anonymous, userId],
            )
          ).rows[0].id as string;
          return { id };
        }
        case "cancelMovement": {
          const changed = await c.query(
            "UPDATE fundraising_movement m SET cancelled_at=now(),cancelled_by=$3 FROM fundraising_pot p WHERE m.id=$1 AND p.id=m.pot_id AND p.organization_id=$2 AND m.cancelled_at IS NULL",
            [cmd.id, org, userId],
          );
          if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}

/** Public progress page of a pot (no account needed, no donor). */
export async function publicPot(db: Pool, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new AccessError("NOT_FOUND", 404);
  const pot = (
    await db.query(
      `SELECT p.id,p.name,p.description,p.goal_cents,p.deadline::text AS deadline,p.status,o.name AS club,g.name AS group_name
         FROM fundraising_pot p JOIN organization o ON o.id=p.organization_id JOIN fundraising_group g ON g.id=p.group_id
        WHERE p.public_token=$1 AND NOT ('fundraising'=ANY(o.disabled_modules))`,
      [token],
    )
  ).rows[0];
  if (!pot) throw new AccessError("NOT_FOUND", 404);
  const movements = (
    await db.query(
      "SELECT kind,amount_cents,cancelled_at FROM fundraising_movement WHERE pot_id=$1",
      [pot.id],
    )
  ).rows;
  const { id: _id, ...rest } = pot;
  void _id;
  return { ...rest, progress: potProgress(pot.goal_cents, movements) };
}
