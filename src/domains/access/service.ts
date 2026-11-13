import { seasonOptions, teamOptions, type SeasonOption, type TeamOption } from "../scope/service";
import { limit } from "../../lib/rate-limit";
import { mfaSatisfied } from "../../lib/security-policy";
import { createHash, randomBytes } from "node:crypto";
import { acceptInvitation, liveInvitation, resendInvitation } from "./invite";
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
    /** 7: the staff roles chosen first (their rights prefill the grants). */
    staffRoleIds: z.array(uuid).max(10).optional(),
  }),
  z.object({
    action: z.literal("accept"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("cancelInvitation"), id: uuid }),
  z.object({ action: z.literal("resendInvitation"), id: uuid }),
  z.object({ action: z.literal("revoke"), id: uuid }),
  z.object({
    action: z.literal("grants"),
    id: uuid,
    grants: z.array(z.enum(delegable)).max(delegable.length),
  }),
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
  /** Profile photo (wave 11): PNG, JPEG or WebP, 256 KB at most, base64. */
  z.object({
    action: z.literal("avatar"),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    data: z.string().max(360000),
  }),
  z.object({ action: z.literal("removeAvatar") }),
]);
export type Command = z.infer<typeof commandSchema>;
type Db = Pool | PoolClient;
/** Checks the file signature, not only the declared type. */
export function validImage(type: string, b: Buffer, max: number) {
  if (!b.length || b.length > max) return false;
  if (type === "image/png") return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/webp")
    return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return false;
}
/** The signed-in account's photo, or null. */
export async function userAvatar(db: Db, p: Principal) {
  await account(db, p);
  return (await db.query("SELECT media_type,content FROM user_avatar WHERE user_id=$1", [p.userId])).rows[0] as
    | { media_type: string; content: Buffer }
    | undefined;
}
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
    `SELECT r.*,o.name AS organization_name,o.kind,o.federation_id,o.disabled_modules,o.tax_approved,o.suspended_at,o.suspended_reason FROM active_context c JOIN role_assignment r ON r.id=c.mandate_id AND r.user_id=c.user_id AND r.organization_id=c.organization_id JOIN organization o ON o.id=r.organization_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE c.session_id=$1 AND c.user_id=$2 AND ${current}`,
    [p.sessionId, p.userId],
  );
  if (!result.rowCount) throw new AccessError("CONTEXT_REQUIRED");
  return result.rows[0] as Mandate & {
    organization_name: string;
    kind: "club" | "federation";
    /** 12/11/2026: null for a club without a federation (its federal modules stay out of the menu). */
    federation_id: string | null;
    disabled_modules: string[];
    /** B8: the club is approved for tax receipts (the module shows only then). */
    tax_approved: boolean;
    /** Console, step 3: suspended by the platform (read only for its members), with the reason. */
    suspended_at: string | null;
    suspended_reason: string;
  };
}
/** A mandate's context without a session (wave 15, C7: the weekly digest), with the same validity checks as active(). */
async function mandateContext(db: Db, mandateId: string) {
  const result = await db.query(
    `SELECT r.*,o.name AS organization_name,o.kind,o.federation_id,o.disabled_modules,o.tax_approved,o.suspended_at,o.suspended_reason FROM role_assignment r JOIN organization o ON o.id=r.organization_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.id=$1 AND ${current}`,
    [mandateId],
  );
  return (result.rows[0] ?? null) as Awaited<ReturnType<typeof active>> | null;
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
  details?: Record<string, unknown>,
) {
  const event = await db.query(
    "INSERT INTO audit_log(organization_id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [org, actor, action, target, details ? JSON.stringify(details) : null],
  );
  const { publishAuditEvent } = await import("../notifications/events");
  await publishAuditEvent(db, org, action, target, event.rows[0].id);
}
/**
 * Security (07/11/2026), badly defined permissions: a platform operator's
 * support access (console « Ouvrir comme président ») is a presidency for a
 * few minutes, to look and to fix. It never changes who holds the club (an
 * invitation, rights, a mandate, a membership, the presidency), never leaves
 * a key or a webhook behind, never changes where the money goes (an IBAN).
 */
export async function supportAccess(db: Db, mandateId: string) {
  return !!(await db.query("SELECT 1 FROM platform_borrow WHERE mandate_id=$1 AND ended_at IS NULL", [mandateId])).rowCount;
}
export async function refuseSupport(db: Db, mandateId: string) {
  if (await supportAccess(db, mandateId)) throw new AccessError("SUPPORT_LIMITED");
}
async function protectLastAdmin(db: Db, org: string) {
  const result = await db.query(
    `SELECT 1 FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.role IN ('club_president','federation_president') AND r.valid_until IS NULL AND ${current} LIMIT 1`,
    [org],
  );
  if (!result.rowCount) throw new AccessError("LAST_ADMIN", 409);
}
async function readWorkspace(db: Db, p: Principal, brief = false) {
  const user = await account(db, p);
  const contexts = await db.query(
    `SELECT r.id,r.role,r.organization_id,o.name,o.kind FROM role_assignment r JOIN organization o ON o.id=r.organization_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.user_id=$1 AND ${current} ORDER BY o.name,r.role`,
    [p.userId],
  );
  let selected:
    | (Awaited<ReturnType<typeof active>> & { logo_version: string | null })
    | undefined;
  try {
    const context = await active(db, p);
    // The logo version lets the shell show the club logo and refresh it after a change.
    const logo = await db.query(
      "SELECT extract(epoch FROM updated_at)::bigint::text AS v FROM organization_logo WHERE organization_id=$1",
      [context.organization_id],
    );
    selected = { ...context, logo_version: logo.rows[0]?.v ?? null };
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
  }
  const prefs = await db.query(
    "SELECT locale,notifications_enabled FROM person WHERE user_id=$1",
    [p.userId],
  );
  const result: {
    user: typeof user;
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
    fundraisingOpen: boolean;
    /** 13/11/2026: on the staff of a national team in use (« Sélection nationale » in the menu, whatever the profile). */
    nationalStaff: boolean;
    /** Changes with every new photo: the menu refreshes its picture. */
    avatarVersion: string | null;
    /** Seasons and teams the top bar offers (wave 12), already filtered for the actor. */
    seasons: SeasonOption[];
    teams: TeamOption[];
  } = {
    user,
    avatarVersion:
      (
        await db.query(
          "SELECT extract(epoch FROM updated_at)::bigint::text AS v FROM user_avatar WHERE user_id=$1",
          [p.userId],
        )
      ).rows[0]?.v ?? null,
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
    fundraisingOpen: false,
    nationalStaff: !!(
      await db.query(
        `SELECT 1 FROM national_team_staff st JOIN national_team t ON t.id=st.team_id AND NOT t.archived
           LEFT JOIN club_person cp ON cp.id=st.profile_id LEFT JOIN person pe ON pe.id=cp.person_id
          WHERE st.user_id=$1 OR pe.user_id=$1 LIMIT 1`,
        [p.userId],
      )
    ).rowCount,
    seasons: [],
    teams: [],
  };
  if (selected && selected.kind === "club") {
    result.seasons = await seasonOptions(db, selected.organization_id);
    result.teams = await teamOptions(db, {
      organization_id: selected.organization_id,
      role: selected.role,
      user_id: p.userId,
      team_id: selected.team_id,
    });
  }
  // Members see "Levée de fonds" only while a pot open to the players exists.
  if (selected && selected.kind === "club")
    result.fundraisingOpen =
      (
        await db.query(
          "SELECT 1 FROM fundraising_pot WHERE organization_id=$1 AND status='open' AND players_join LIMIT 1",
          [selected.organization_id],
        )
      ).rows.length > 0;
  // 13/11/2026: the menu's read (brief) leaves out the members, invitations and journal of the settings.
  if (selected && !brief && mfaSatisfied(!!user.twoFactorEnabled)) {
    if (result.permissions.includes("members.read"))
      result.members = (
        await db.query(
          'SELECT r.id,r.user_id,u.name,r.role,r.grants,r.team_id,r.valid_from,r.valid_until,r.revoked_at,m.active FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization_membership m ON m.user_id=r.user_id AND m.organization_id=r.organization_id WHERE r.organization_id=$1 ORDER BY u.name,r.created_at',
          [selected.organization_id],
        )
      ).rows;
    if (result.permissions.includes("invitations.create"))
      result.invitations = (
        await db.query(
          "SELECT id,email,role,expires_at,accepted_at,revoked_at,disputed_at,disputed_note FROM invitation WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50",
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
export async function workspace(db: Pool, p: Principal, options: { brief?: boolean } = {}) {
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
    const result = await readWorkspace(client, p, !!options.brief);
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
  // Security (07/11/2026): an invitation is an e-mail to an address typed by someone; counted per account.
  if (command.action === "invite" || command.action === "resendInvitation") await limit(db, "user-invite", p.userId);
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
    } else if (command.action === "avatar") {
      const bytes = Buffer.from(command.data, "base64");
      if (!validImage(command.mediaType, bytes, 262144))
        throw new AccessError("INVALID_IMAGE", 400);
      await client.query(
        "INSERT INTO user_avatar(user_id,media_type,content) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET media_type=EXCLUDED.media_type,content=EXCLUDED.content,updated_at=now()",
        [p.userId, command.mediaType, bytes],
      );
    } else if (command.action === "removeAvatar") {
      await client.query("DELETE FROM user_avatar WHERE user_id=$1", [p.userId]);
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
      // Wave 16 (I2): shared with the guided account creation (invite.ts).
      const invite = await liveInvitation(client, command.token, true);
      if (!invite) throw new AccessError("INVITATION_INVALID", 404);
      await acceptInvitation(client, invite, { id: p.userId, email: user.email });
    } else {
      let context = await active(client, p);
      await client.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
        context.organization_id,
      ]);
      context = await active(client, p); // Re-evaluate after the lock: revocation takes effect immediately.
      const permission =
        command.action === "invite" || command.action === "resendInvitation" ? "invitations.create" : "mandates.manage";
      requirePermission(
        context.role,
        context.grants,
        permission,
        mfaSatisfied(!!user.twoFactorEnabled),
      );
      // Security (07/11/2026): a support access opens the club, never its mandates.
      await refuseSupport(client, context.id);
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
        const staffRoleIds = [...new Set(command.staffRoleIds ?? [])];
        if (staffRoleIds.length) {
          if (command.role !== (context.kind === "federation" ? "federation_worker" : "coach")) throw new AccessError("INVALID_ROLE", 400);
          const found = await client.query("SELECT id,grants FROM staff_role WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND NOT archived", [context.organization_id, staffRoleIds]);
          if (found.rowCount !== staffRoleIds.length) throw new AccessError("NOT_FOUND", 404);
          // Security (07/11/2026): a staff role hands out its rights on acceptance; never more than the inviter holds.
          const mine = permissions(context.role, context.grants) as string[];
          if (found.rows.some((r) => (r.grants as string[]).some((g) => !mine.includes(g)))) throw new AccessError("FORBIDDEN");
        }
        const created = await client.query(
          "INSERT INTO invitation(organization_id,email,role,grants,token_hash,expires_at,valid_until,created_by,valid_from,staff_role_ids) VALUES($1,lower($2),$3,$4,$5,now()+interval '7 days',$6,$7,$8,$9) RETURNING id",
          [
            context.organization_id,
            command.email,
            command.role,
            command.grants,
            createHash("sha256").update(token).digest("hex"),
            command.validUntil,
            p.userId,
            validFrom,
            staffRoleIds,
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
      } else if (command.action === "resendInvitation") {
        // « Renvoyer »: a fresh link for the same person, the old one stops working.
        const old = (await client.query("SELECT role,grants,issued_by_federation FROM invitation WHERE id=$1 AND organization_id=$2", [command.id, context.organization_id])).rows[0] as
          | { role: Role; grants: Permission[]; issued_by_federation: string | null }
          | undefined;
        if (!old) throw new AccessError("NOT_FOUND", 404);
        // The federation's own invitations (a club's president) stay the federation's to handle.
        if (old.issued_by_federation) throw new AccessError("FORBIDDEN");
        // Never hand out again what this profile could not hand out itself.
        const mine = permissions(context.role, context.grants);
        if ((isAdmin(old.role) && !isAdmin(context.role)) || !old.grants.every((g) => mine.includes(g))) throw new AccessError("FORBIDDEN");
        await resendInvitation(client, context.organization_id, p.userId, command.id);
      } else if (command.action === "cancelInvitation") {
        const changed = await client.query(
          "UPDATE invitation SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND issued_by_federation IS NULL RETURNING id",
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
      } else if (command.action === "grants") {
        // Delegation from the settings page: an administrator adjusts what a
        // non-administrator mandate may do, never beyond their own permissions.
        const target = (
          await client.query(
            "SELECT id,user_id,role,grants FROM role_assignment WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL FOR UPDATE",
            [command.id, context.organization_id],
          )
        ).rows[0];
        if (!target) throw new AccessError("NOT_FOUND", 404);
        if (isAdmin(target.role) || target.user_id === p.userId)
          throw new AccessError("FORBIDDEN");
        const own = permissions(context.role, context.grants);
        if (command.grants.some((g) => !own.includes(g)))
          throw new AccessError("FORBIDDEN");
        // B8: tax.identity is given from the tax receipts page, never shown here: the
        // rights screen keeps it as it was unless it names it.
        const kept = target.grants.includes("tax.identity") && !command.grants.includes("tax.identity") ? ["tax.identity"] : [];
        await client.query(
          "UPDATE role_assignment SET grants=$3 WHERE id=$1 AND organization_id=$2",
          [command.id, context.organization_id, [...new Set([...command.grants, ...kept])]],
        );
        // 7: a grid saved by hand is read as additions and removals against the person's staff roles (« personnalisé »).
        const { rememberAdjustments } = await import("./staff-roles");
        await rememberAdjustments(client, command.id, [...new Set(command.grants)]);
        // The rights journal shows what changed, not only that something did.
        await audit(
          client,
          context.organization_id,
          p.userId,
          "mandate.grants",
          command.id,
          {
            userId: target.user_id,
            role: target.role,
            before: target.grants ?? [],
            after: [...new Set(command.grants)],
          },
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
          // The new end, for the rights journal (« jusqu'à nouvel ordre » when null).
          command.action === "renew" ? { validUntil: command.validUntil ?? null } : undefined,
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

export { account, active, mandateContext, audit, requirePermission };
