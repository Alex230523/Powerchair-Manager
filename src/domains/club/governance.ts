import { cursorSchema, decodeCursor, PAGE_SIZE, pageOf } from "../../lib/cursor";
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
import { delegable, isAdmin, permissions, type Role } from "../access/policy";
import { optionalModules, type OptionalModule } from "../access/rights";
import { presenceRules, presenceRulesSchema } from "../dashboard/presence";
import { duesRules, duesRulesSchema } from "../dues/rules";

/**
 * Club governance: which modules the club uses, the rights profiles it
 * defines, and the two journals (rights changes, readings of health data).
 */
export const governanceCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("modules"),
    disabled: z.array(z.enum(optionalModules)).max(optionalModules.length),
  }),
  z.object({
    action: z.literal("saveProfile"),
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(60),
    grants: z.array(z.enum(delegable)).max(delegable.length),
  }),
  z.object({ action: z.literal("deleteProfile"), id: z.uuid() }),
  /** Presence thresholds of the dashboard (players and coaches "present"). */
  z.object({ action: z.literal("presence"), rules: presenceRulesSchema }),
  /** Automatic dues reminders (wave 11). */
  z.object({ action: z.literal("duesRules"), rules: duesRulesSchema }),
]);
export type GovernanceCommand = z.infer<typeof governanceCommand>;
export const journalQuery = z.object({
  kind: z.enum(["rights", "health"]),
  userId: z.string().max(200).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  after: cursorSchema,
});

/** Actions shown in the rights journal. */
export const rightsActions = [
  "mandate.grants",
  "mandate.revoke",
  "mandate.renew",
  "invitation.created",
  "invitation.accepted",
  "invitation.revoked",
  "membership.activated",
  "membership.deactivated",
  "modules.changed",
  "rights_profile.saved",
  "rights_profile.deleted",
];

async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: {
    c: PoolClient;
    org: string;
    role: string;
    perms: string[];
    mfa: boolean;
  }) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [a.organization_id],
    );
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const out = await fn({
      c,
      org: a.organization_id,
      role: a.role,
      perms: permissions(a.role, a.grants),
      mfa: mfaSatisfied(!!user.twoFactorEnabled),
    });
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

export async function governanceView(db: Pool, p: Principal) {
  return scope(db, p, false, async ({ c, org, role, perms, mfa }) => {
    const orgRow = (
      await c.query("SELECT disabled_modules,presence_rules,dues_rules FROM organization WHERE id=$1", [
        org,
      ])
    ).rows[0];
    const disabled = orgRow.disabled_modules as string[];
    const seeProfiles =
      mfa && (perms.includes("mandates.manage") || perms.includes("members.read"));
    return {
      organizationId: org,
      disabled,
      presence: presenceRules(orgRow.presence_rules),
      dues: duesRules(orgRow.dues_rules),
      can: {
        modules: mfa && isAdmin(role as Role),
        presence: mfa && perms.includes("mandates.manage"),
        profiles: mfa && perms.includes("mandates.manage"),
        rightsJournal: mfa && perms.includes("audit.read"),
        healthJournal: mfa && role === "club_president",
      },
      profiles: seeProfiles
        ? (
            await c.query(
              "SELECT id,name,grants FROM rights_profile WHERE organization_id=$1 ORDER BY name",
              [org],
            )
          ).rows
        : [],
    };
  });
}

export async function governanceExecute(
  db: Pool,
  p: Principal,
  command: GovernanceCommand,
  expected: string,
) {
  return scope(
    db,
    p,
    true,
    async ({ c, org, role, perms, mfa }) => {
      if (!mfa) throw new AccessError("MFA_REQUIRED");
      if (command.action === "modules") {
        if (!isAdmin(role as Role)) throw new AccessError("FORBIDDEN");
        const before = (
          await c.query("SELECT disabled_modules FROM organization WHERE id=$1", [
            org,
          ])
        ).rows[0].disabled_modules as string[];
        const after = optionalModules.filter((m) => command.disabled.includes(m));
        await c.query("UPDATE organization SET disabled_modules=$2 WHERE id=$1", [
          org,
          after,
        ]);
        await audit(c, org, p.userId, "modules.changed", org, { before, after });
        return { ok: true as const };
      }
      if (!perms.includes("mandates.manage")) throw new AccessError("FORBIDDEN");
      if (command.action === "presence") {
        const before = presenceRules(
          (await c.query("SELECT presence_rules FROM organization WHERE id=$1", [org])).rows[0].presence_rules,
        );
        await c.query("UPDATE organization SET presence_rules=$2 WHERE id=$1", [
          org,
          JSON.stringify(command.rules),
        ]);
        await audit(c, org, p.userId, "presence.rules", org, { before, after: command.rules });
        return { ok: true as const };
      }
      if (command.action === "duesRules") {
        if (!perms.includes("mandates.manage")) throw new AccessError("FORBIDDEN");
        await c.query("UPDATE organization SET dues_rules=$2 WHERE id=$1", [org, JSON.stringify(command.rules)]);
        await audit(c, org, p.userId, "dues.rules", org, command.rules);
        return { ok: true as const };
      }
      if (command.action === "saveProfile") {
        // A profile never holds more than its author may delegate.
        if (command.grants.some((g) => !perms.includes(g)))
          throw new AccessError("FORBIDDEN");
        const grants = [...new Set(command.grants)];
        const id = command.id
          ? (
              await c.query(
                "UPDATE rights_profile SET name=$3,grants=$4,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id",
                [command.id, org, command.name, grants],
              )
            ).rows[0]?.id
          : (
              await c.query(
                "INSERT INTO rights_profile(organization_id,name,grants,created_by) VALUES($1,$2,$3,$4) RETURNING id",
                [org, command.name, grants, p.userId],
              )
            ).rows[0].id;
        if (!id) throw new AccessError("NOT_FOUND", 404);
        await audit(c, org, p.userId, "rights_profile.saved", id, {
          name: command.name,
          after: grants,
        });
        return { ok: true as const, id: id as string };
      }
      const gone = await c.query(
        "DELETE FROM rights_profile WHERE id=$1 AND organization_id=$2 RETURNING name",
        [command.id, org],
      );
      if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
      await audit(c, org, p.userId, "rights_profile.deleted", command.id, {
        name: gone.rows[0].name,
      });
      return { ok: true as const };
    },
    expected,
  );
}

export async function journalView(
  db: Pool,
  p: Principal,
  q: z.infer<typeof journalQuery>,
) {
  return scope(db, p, false, async ({ c, org, role, perms, mfa }) => {
    if (!mfa) throw new AccessError("MFA_REQUIRED");
    const from = q.from ?? null,
      to = q.to ?? null,
      who = q.userId ?? null,
      // 13.3: newest first, a page at a time.
      [afterAt, afterId] = decodeCursor(q.after, 2) ?? [null, null],
      page = <T extends { id: string; cursor_at: string }>(rows: T[]) => pageOf(rows, PAGE_SIZE, (r) => [r.cursor_at, r.id]);
    if (q.kind === "rights") {
      if (!perms.includes("audit.read")) throw new AccessError("FORBIDDEN");
      const rows = (
        await c.query(
          `SELECT a.id,a.action,a.created_at,a.created_at::text AS cursor_at,a.details,actor.name AS actor,a.actor_id,
                  COALESCE(target.name,subject.name) AS subject,COALESCE(ra.user_id,a.details->>'userId') AS subject_id,
                  (ra.id IS NOT NULL) AS mandate,
                  CASE WHEN a.action='mandate.renew' AND a.details ? 'validUntil' THEN a.details->>'validUntil' ELSE ra.valid_until::text END AS valid_until
             FROM audit_log a JOIN "user" actor ON actor.id=a.actor_id
             LEFT JOIN role_assignment ra ON ra.id::text=a.target_id
             LEFT JOIN "user" target ON target.id=ra.user_id
             LEFT JOIN "user" subject ON subject.id=a.details->>'userId'
            WHERE a.organization_id=$1 AND a.action=ANY($2)
              AND ($3::date IS NULL OR a.created_at>=$3::date)
              AND ($4::date IS NULL OR a.created_at<$4::date+1)
              AND ($5::text IS NULL OR a.actor_id=$5 OR ra.user_id=$5 OR a.details->>'userId'=$5)
              AND ($6::timestamptz IS NULL OR (a.created_at,a.id::text)<($6::timestamptz,$7::text))
            ORDER BY a.created_at DESC,a.id::text DESC LIMIT ${PAGE_SIZE + 1}`,
          [org, rightsActions, from, to, who, afterAt, afterId],
        )
      ).rows;
      const { items, next } = page(rows);
      return { kind: "rights" as const, rows: items, next, people: await people(c, org) };
    }
    if (role !== "club_president") throw new AccessError("FORBIDDEN");
    const rows = (
      await c.query(
        `SELECT l.id,l.kind,l.created_at,l.created_at::text AS cursor_at,u.name AS actor,l.actor_id,cp.full_name AS subject
           FROM sensitive_access_log l JOIN "user" u ON u.id=l.actor_id
           LEFT JOIN club_person cp ON cp.id=l.profile_id
          WHERE l.organization_id=$1
            AND ($2::date IS NULL OR l.created_at>=$2::date)
            AND ($3::date IS NULL OR l.created_at<$3::date+1)
            AND ($4::text IS NULL OR l.actor_id=$4)
            AND ($5::timestamptz IS NULL OR (l.created_at,l.id::text)<($5::timestamptz,$6::text))
          ORDER BY l.created_at DESC,l.id::text DESC LIMIT ${PAGE_SIZE + 1}`,
        [org, from, to, who, afterAt, afterId],
      )
    ).rows;
    const { items, next } = page(rows);
    return { kind: "health" as const, rows: items, next, people: await people(c, org) };
  });
}
async function people(c: PoolClient, org: string) {
  return (
    await c.query(
      'SELECT DISTINCT u.id,u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 ORDER BY u.name',
      [org],
    )
  ).rows as { id: string; name: string }[];
}

/** Routes of a switched-off module refuse with MODULE_OFF (no data is touched). */
export async function assertModule(
  db: Pool,
  p: Principal,
  module: OptionalModule,
) {
  const row = (
    await db.query(
      "SELECT o.kind,o.disabled_modules FROM active_context c JOIN organization o ON o.id=c.organization_id WHERE c.session_id=$1 AND c.user_id=$2",
      [p.sessionId, p.userId],
    )
  ).rows[0] as { kind: string; disabled_modules: string[] } | undefined;
  if (row?.kind === "club" && row.disabled_modules.includes(module))
    throw new AccessError("MODULE_OFF");
}

/**
 * One line per reading of confidential data by someone other than the person
 * and their representatives. Called inside the reading transaction.
 */
export async function logSensitiveAccess(
  c: PoolClient,
  org: string,
  actorId: string,
  profileId: string | null,
  kind:
    | "player_health"
    | "registration_confidential"
    | "sensitive_document"
    | "offline_book"
    | "trip_care"
    | "incident_health"
    | "incident_care"
    | "national_care",
  resourceId: string | null = null,
) {
  await c.query(
    "INSERT INTO sensitive_access_log(organization_id,actor_id,profile_id,kind,resource_id) VALUES($1,$2,$3,$4,$5)",
    [org, actorId, profileId, kind, resourceId],
  );
}
