import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { account, active, audit, AccessError, refuseSupport, type Principal } from "./service";
import { inviteProfile } from "./invite";

/**
 * Wave 17 (G1): Settings > Members > « Transmettre la présidence ». The
 * president invites the next one (a member with an account, or a new
 * address); nothing changes until the invitation is accepted, and the
 * outgoing president may cancel it meanwhile. The change itself is
 * applySuccession (invite.ts), shared with the federation's (I3).
 */
import { keepRoles } from "./presidency-schema";
export { keepRoles };
export const presidencyCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("handOver"),
    userId: z.string().min(1).max(200).nullable(),
    email: z.email().max(254).nullable(),
    name: z.string().trim().max(120).default(""),
    effectiveOn: z.iso.date().nullable(),
    keep: z.enum(keepRoles),
    message: z.string().trim().max(1000).default(""),
  }),
  z.object({ action: z.literal("cancel"), id: z.uuid() }),
]);
export type PresidencyCommand = z.infer<typeof presidencyCommand>;

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (c: PoolClient, org: string, president: boolean) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    const president = a.kind === "club" && a.role === "club_president" && mfaSatisfied(!!user.twoFactorEnabled);
    if (write && !president) throw new AccessError("FORBIDDEN");
    // Security (07/11/2026): a support access never hands the presidency over.
    if (write) await refuseSupport(c, a.id);
    const out = await fn(c, a.organization_id, president);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const pendingSql = `SELECT i.id,i.email,i.greeting,i.valid_from,i.outgoing_role,i.message,i.created_at,i.disputed_at IS NOT NULL AS disputed
  FROM invitation i WHERE i.organization_id=$1 AND i.role='club_president' AND i.succession AND i.issued_by_federation IS NULL
   AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() ORDER BY i.created_at DESC LIMIT 1`;

export async function presidencyView(db: Pool, p: Principal) {
  return scope(db, p, false, async (c, org, president) => {
    if (!president) return { organization_id: org, can: false, candidates: [], pending: null };
    const candidates = (
      await c.query(
        `SELECT DISTINCT u.id AS user_id,u.name,u.email FROM organization_membership m JOIN "user" u ON u.id=m.user_id
          WHERE m.organization_id=$1 AND m.active AND u.active AND u.id<>$2 ORDER BY u.name LIMIT 500`,
        [org, p.userId],
      )
    ).rows as { user_id: string; name: string; email: string }[];
    return { organization_id: org, can: true, candidates, pending: (await c.query(pendingSql, [org])).rows[0] ?? null };
  });
}

export async function presidencyExecute(db: Pool, p: Principal, command: PresidencyCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (c, org) => {
      if (command.action === "cancel") {
        const changed = await c.query(
          "UPDATE invitation SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND succession AND issued_by_federation IS NULL AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
          [command.id, org],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(c, org, p.userId, "presidency.cancelled", command.id);
        return { ok: true as const };
      }
      const me = (await c.query('SELECT email FROM "user" WHERE id=$1', [p.userId])).rows[0].email as string;
      let email = command.email,
        greeting = command.name;
      if (command.userId) {
        const member = (
          await c.query(`SELECT u.email,u.name FROM organization_membership m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND u.active`, [org, command.userId])
        ).rows[0] as { email: string; name: string } | undefined;
        if (!member) throw new AccessError("NOT_FOUND", 404);
        email = member.email;
        greeting = greeting || member.name;
      }
      if (!email) throw new AccessError("INVALID_INPUT", 400);
      if (email.toLowerCase() === me.toLowerCase()) throw new AccessError("INVALID_INPUT", 400);
      const effective = command.effectiveOn
        ? ((await c.query("SELECT ($1::date)::timestamp AT TIME ZONE 'Europe/Brussels' AS t", [command.effectiveOn])).rows[0].t as Date)
        : null;
      if (effective && effective.getTime() < Date.now() - 86400000) throw new AccessError("INVALID_DATE", 400);
      // One handover at a time: an earlier link stops.
      await c.query(
        "UPDATE invitation SET revoked_at=now() WHERE organization_id=$1 AND role='club_president' AND succession AND issued_by_federation IS NULL AND accepted_at IS NULL AND revoked_at IS NULL",
        [org],
      );
      const { id } = await inviteProfile(c, org, p.userId, {
        email,
        role: "club_president",
        profileId: null,
        greeting: greeting.trim().split(/\s+/)[0] ?? "",
        succession: true,
        effectiveFrom: effective ? effective.toISOString() : null,
        outgoing: { userId: p.userId, role: command.keep },
        message: command.message,
      });
      await audit(c, org, p.userId, "presidency.offered", id, { keep: command.keep, effective: command.effectiveOn });
      return { ok: true as const, id };
    },
    expected,
  );
}
