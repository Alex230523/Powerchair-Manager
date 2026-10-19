import { mfaSatisfied, mfaRequired } from "../../lib/security-policy";
import { createHash, randomBytes } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  roles,
  delegable,
  roleAllowed,
  isAdmin,
  permissions,
  type Mandate,
  type Permission,
  type Role,
} from "./policy";
export class AccessError extends Error {
  constructor(
    public code: string,
    public status = 403,
  ) {
    super(code);
  }
}
export type Principal = { userId: string; sessionId: string };
const uuid = z.uuid();
const expiry = z.iso.datetime({ offset: true }).nullable();
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("context"), mandateId: uuid }),
  z.object({
    action: z.literal("saveProfile"),
    mandateId: uuid,
    name: z.string().trim().min(2).max(80),
    isDefault: z.boolean(),
  }),
  z.object({ action: z.literal("deleteProfile"), id: uuid }),
  z.object({
    action: z.literal("invite"),
    email: z.email().max(254),
    role: z.enum(roles),
    grants: z.array(z.enum(delegable)).max(delegable.length),
    validUntil: expiry,
    validFrom: z.iso.datetime({ offset: true }).optional(),
  }),
  z.object({
    action: z.literal("accept"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("cancelInvitation"), id: uuid }),
  z.object({ action: z.literal("revoke"), id: uuid }),
  z.object({ action: z.literal("renew"), id: uuid, validUntil: expiry }),
  z.object({
    action: z.literal("membership"),
    userId: z.string().min(1).max(200),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("preferences"),
    locale: z.enum(["fr", "nl", "en"]),
    notificationsEnabled: z.boolean(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
type Db = Pool | PoolClient;
const current = `r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active`;
async function account(db: Db, p: Principal) {
  const result = await db.query(
    'SELECT u.id,u.name,u.email,u."emailVerified",u."twoFactorEnabled" FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND s.id=$2 AND u.active AND s."expiresAt">now()',
    [p.userId, p.sessionId],
  );
  if (!result.rowCount) throw new AccessError("UNAUTHENTICATED", 401);
  return result.rows[0];
}
async function active(db: Db, p: Principal) {
  const result = await db.query(
    `SELECT r.*,o.name AS organization_name,o.kind FROM active_context c JOIN role_assignment r ON r.id=c.mandate_id AND r.user_id=c.user_id AND r.organization_id=c.organization_id JOIN organization o ON o.id=r.organization_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE c.session_id=$1 AND c.user_id=$2 AND ${current}`,
    [p.sessionId, p.userId],
  );
  if (!result.rowCount) throw new AccessError("CONTEXT_REQUIRED");
  return result.rows[0] as Mandate & {
    organization_name: string;
    kind: "club" | "federation";
  };
}
function requirePermission(
  role: Role,
  grants: string[],
  permission: Permission,
  mfa: boolean,
) {
  if (!permissions(role, grants).includes(permission))
    throw new AccessError("FORBIDDEN");
  if (permission !== "organization.read" && !mfaSatisfied(mfa))
    throw new AccessError("MFA_REQUIRED");
}
async function audit(
  db: Db,
  org: string,
  actor: string,
  action: string,
  target: string,
) {
  const event = await db.query(
    "INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,$3,$4) RETURNING id",
    [org, actor, action, target],
  );
  const { publishAuditEvent } = await import("../notifications/events");
  await publishAuditEvent(db, org, action, target, event.rows[0].id);
}
async function protectLastAdmin(db: Db, org: string) {
  const result = await db.query(
    `SELECT 1 FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.role IN ('club_president','federation_president') AND r.valid_until IS NULL AND ${current} LIMIT 1`,
    [org],
  );
  if (!result.rowCount) throw new AccessError("LAST_ADMIN", 409);
}
async function readWorkspace(db: Db, p: Principal) {
  const user = await account(db, p);
  const contexts = await db.query(
    `SELECT r.id,r.role,r.organization_id,o.name,o.kind FROM role_assignment r JOIN organization o ON o.id=r.organization_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.user_id=$1 AND ${current} ORDER BY o.name,r.role`,
    [p.userId],
  );
  let selected;
  try {
    selected = await active(db, p);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
  }
  const prefs = await db.query(
    "SELECT locale,notifications_enabled FROM person WHERE user_id=$1",
    [p.userId],
  );
  const result: {
    user: typeof user;
    mfaRequired: boolean;
    contexts: unknown[];
    profiles: {
      id: string;
      mandate_id: string;
      name: string;
      is_default: boolean;
    }[];
    selected: typeof selected;
    preferences: unknown;
    permissions: Permission[];
    members: unknown[];
    invitations: unknown[];
    audit: unknown[];
  } = {
    user,
    mfaRequired: mfaRequired(),
    contexts: contexts.rows,
    profiles: (
      await db.query(
        "SELECT id,mandate_id,name,is_default FROM user_profile WHERE user_id=$1 ORDER BY name",
        [p.userId],
      )
    ).rows,
    selected,
    preferences: prefs.rows[0],
    permissions: selected ? permissions(selected.role, selected.grants) : [],
    members: [],
    invitations: [],
    audit: [],
  };
  if (selected && mfaSatisfied(!!user.twoFactorEnabled)) {
    if (result.permissions.includes("members.read"))
      result.members = (
        await db.query(
          'SELECT r.id,r.user_id,u.name,r.role,r.grants,r.valid_from,r.valid_until,r.revoked_at,m.active FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization_membership m ON m.user_id=r.user_id AND m.organization_id=r.organization_id WHERE r.organization_id=$1 ORDER BY u.name,r.created_at',
          [selected.organization_id],
        )
      ).rows;
    if (result.permissions.includes("invitations.create"))
      result.invitations = (
        await db.query(
          "SELECT id,email,role,expires_at,accepted_at,revoked_at FROM invitation WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50",
          [selected.organization_id],
        )
      ).rows;
    if (result.permissions.includes("audit.read"))
      result.audit = (
        await db.query(
          'SELECT a.id,a.action,a.created_at,u.name FROM audit_log a JOIN "user" u ON u.id=a.actor_id WHERE organization_id=$1 ORDER BY a.created_at DESC LIMIT 50',
          [selected.organization_id],
        )
      ).rows;
  }
  return result;
}
export async function workspace(db: Pool, p: Principal) {
  const saved = (
    await db.query(
      `SELECT f.mandate_id FROM user_profile f JOIN role_assignment r ON r.id=f.mandate_id AND r.user_id=f.user_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE f.user_id=$1 AND f.is_default AND ${current} AND NOT EXISTS(SELECT 1 FROM active_context WHERE session_id=$2 AND user_id=$1)`,
      [p.userId, p.sessionId],
    )
  ).rows[0];
  if (saved) {
    try {
      await execute(
        db,
        p,
        { action: "context", mandateId: saved.mandate_id },
        true,
      );
    } catch (e) {
      if (!(e instanceof AccessError)) throw e;
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Reads and access mutations share the organization lock; switching the same
    // session context waits until its current read has completed.
    await client.query(
      "SELECT o.id FROM active_context c JOIN organization o ON o.id=c.organization_id WHERE c.session_id=$1 AND c.user_id=$2 FOR SHARE OF o,c",
      [p.sessionId, p.userId],
    );
    const result = await readWorkspace(client, p);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    client.release();
  }
}
export async function execute(
  db: Pool,
  p: Principal,
  command: Command,
  onlyIfMissing = false,
): Promise<{ ok: true } | { token: string }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const user = await account(client, p);
    if (command.action === "saveProfile") {
      await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
        p.userId,
      ]);
      const allowed = await client.query(
        `SELECT r.id FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.id=$1 AND r.user_id=$2 AND ${current}`,
        [command.mandateId, p.userId],
      );
      if (!allowed.rowCount) throw new AccessError("FORBIDDEN");
      if (command.isDefault)
        await client.query(
          "UPDATE user_profile SET is_default=false WHERE user_id=$1",
          [p.userId],
        );
      await client.query(
        "INSERT INTO user_profile(user_id,mandate_id,name,is_default) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,mandate_id) DO UPDATE SET name=EXCLUDED.name,is_default=EXCLUDED.is_default,updated_at=now()",
        [p.userId, command.mandateId, command.name, command.isDefault],
      );
    } else if (command.action === "deleteProfile") {
      await client.query(
        "DELETE FROM user_profile WHERE id=$1 AND user_id=$2",
        [command.id, p.userId],
      );
    } else if (command.action === "preferences") {
      await client.query(
        "UPDATE person SET locale=$2,notifications_enabled=$3 WHERE user_id=$1",
        [p.userId, command.locale, command.notificationsEnabled],
      );
    } else if (command.action === "context") {
      const mandate = await client.query(
        `SELECT r.organization_id FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.id=$1 AND r.user_id=$2 AND ${current}`,
        [command.mandateId, p.userId],
      );
      if (!mandate.rowCount) throw new AccessError("FORBIDDEN");
      await client.query(
        `INSERT INTO active_context(session_id,user_id,organization_id,mandate_id) VALUES($1,$2,$3,$4) ON CONFLICT(session_id) ${onlyIfMissing ? "DO NOTHING" : "DO UPDATE SET organization_id=EXCLUDED.organization_id,mandate_id=EXCLUDED.mandate_id"}`,
        [
          p.sessionId,
          p.userId,
          mandate.rows[0].organization_id,
          command.mandateId,
        ],
      );
      await audit(
        client,
        mandate.rows[0].organization_id,
        p.userId,
        "context.changed",
        command.mandateId,
      );
    } else if (command.action === "accept") {
      const hash = createHash("sha256").update(command.token).digest("hex");
      // Lock order is always organization then invitation, matching administrator operations.
      const preliminary = await client.query(
        "SELECT organization_id FROM invitation WHERE token_hash=$1",
        [hash],
      );
      if (!preliminary.rowCount)
        throw new AccessError("INVITATION_INVALID", 404);
      await client.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
        preliminary.rows[0].organization_id,
      ]);
      const query = await client.query(
        "SELECT i.*,o.kind FROM invitation i JOIN organization o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.expires_at>now() AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND (i.valid_until IS NULL OR i.valid_until>now()) FOR UPDATE OF i",
        [hash],
      );
      const invite = query.rows[0];
      if (!invite || invite.email.toLowerCase() !== user.email.toLowerCase())
        throw new AccessError("INVITATION_INVALID", 404);
      // A revoked or demoted issuer cannot leave usable privileged invitations behind.
      const issuers = await client.query(
        `SELECT r.role,r.grants FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND ${current}`,
        [invite.organization_id, invite.created_by],
      );
      if (
        !issuers.rows.some(
          (r) =>
            permissions(r.role, r.grants).includes("invitations.create") &&
            (!isAdmin(invite.role) || isAdmin(r.role)) &&
            invite.grants.every((g: Permission) =>
              permissions(r.role, r.grants).includes(g),
            ),
        )
      )
        throw new AccessError("INVITATION_INVALID", 404);
      if (!roleAllowed(invite.role, invite.kind))
        throw new AccessError("INVALID_ROLE", 400);
      const membership = await client.query(
        "SELECT active FROM organization_membership WHERE organization_id=$1 AND user_id=$2",
        [invite.organization_id, p.userId],
      );
      if (membership.rowCount && !membership.rows[0].active)
        throw new AccessError("MEMBERSHIP_DISABLED");
      await client.query(
        "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [invite.organization_id, p.userId],
      );
      const added = await client.query(
        "INSERT INTO role_assignment(organization_id,user_id,role,grants,valid_until,created_by,valid_from) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [
          invite.organization_id,
          p.userId,
          invite.role,
          invite.grants,
          invite.valid_until,
          invite.created_by,
          invite.valid_from,
        ],
      );
      await client.query(
        "UPDATE invitation SET accepted_at=now() WHERE id=$1",
        [invite.id],
      );
      await audit(
        client,
        invite.organization_id,
        p.userId,
        "invitation.accepted",
        added.rows[0].id,
      );
    } else {
      let context = await active(client, p);
      await client.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
        context.organization_id,
      ]);
      context = await active(client, p); // Re-evaluate after the lock: revocation takes effect immediately.
      const permission =
        command.action === "invite" ? "invitations.create" : "mandates.manage";
      requirePermission(
        context.role,
        context.grants,
        permission,
        mfaSatisfied(!!user.twoFactorEnabled),
      );
      if (command.action === "invite") {
        if (!roleAllowed(command.role, context.kind))
          throw new AccessError("INVALID_ROLE", 400);
        if (isAdmin(command.role) && !isAdmin(context.role))
          throw new AccessError("FORBIDDEN");
        if (
          command.grants.some(
            (g) => !permissions(context.role, context.grants).includes(g),
          )
        )
          throw new AccessError("FORBIDDEN");
        if (command.validUntil && new Date(command.validUntil) <= new Date())
          throw new AccessError("INVALID_DATE", 400);
        if (
          context.valid_until &&
          (!command.validUntil ||
            new Date(command.validUntil) > new Date(context.valid_until))
        )
          throw new AccessError("INVALID_DATE", 400);
        const validFrom = command.validFrom ?? new Date().toISOString();
        if (
          command.validUntil &&
          new Date(command.validUntil) <= new Date(validFrom)
        )
          throw new AccessError("INVALID_DATE", 400);
        const token = randomBytes(32).toString("hex");
        const created = await client.query(
          "INSERT INTO invitation(organization_id,email,role,grants,token_hash,expires_at,valid_until,created_by,valid_from) VALUES($1,lower($2),$3,$4,$5,now()+interval '7 days',$6,$7,$8) RETURNING id",
          [
            context.organization_id,
            command.email,
            command.role,
            command.grants,
            createHash("sha256").update(token).digest("hex"),
            command.validUntil,
            p.userId,
            validFrom,
          ],
        );
        await audit(
          client,
          context.organization_id,
          p.userId,
          "invitation.created",
          created.rows[0].id,
        );
        const { publishInvitation } = await import("../notifications/events");
        await publishInvitation(
          client,
          context.organization_id,
          created.rows[0].id,
          token,
        );
        await client.query("COMMIT");
        return { token };
      } else if (command.action === "cancelInvitation") {
        const changed = await client.query(
          "UPDATE invitation SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
          [command.id, context.organization_id],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(
          client,
          context.organization_id,
          p.userId,
          "invitation.revoked",
          command.id,
        );
      } else if (command.action === "membership") {
        const changed = await client.query(
          "UPDATE organization_membership SET active=$3 WHERE organization_id=$1 AND user_id=$2 RETURNING user_id",
          [context.organization_id, command.userId, command.active],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await protectLastAdmin(client, context.organization_id);
        await audit(
          client,
          context.organization_id,
          p.userId,
          command.active ? "membership.activated" : "membership.deactivated",
          command.userId,
        );
      } else {
        if (
          command.action === "renew" &&
          command.validUntil &&
          new Date(command.validUntil) <= new Date()
        )
          throw new AccessError("INVALID_DATE", 400);
        const changed =
          command.action === "revoke"
            ? await client.query(
                "UPDATE role_assignment SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL RETURNING id",
                [command.id, context.organization_id],
              )
            : await client.query(
                "UPDATE role_assignment SET valid_until=$3 WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL RETURNING id",
                [command.id, context.organization_id, command.validUntil],
              );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await protectLastAdmin(client, context.organization_id);
        await audit(
          client,
          context.organization_id,
          p.userId,
          "mandate." + command.action,
          command.id,
        );
      }
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    client.release();
  }
}

export { account, active, audit, requirePermission };
