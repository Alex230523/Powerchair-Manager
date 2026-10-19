import { mfaSatisfied } from "../../lib/security-policy";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  account,
  active,
  audit,
  requirePermission,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import { allowed } from "./eligibility";
import { publish, templateFor } from "./queue";
import { editableKinds, validateTemplate, renderTemplate } from "./templates";
export const notificationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.uuid() }),
  z.object({ action: z.literal("readAll") }),
  z.object({
    action: z.literal("preferences"),
    category: z.enum(["administrative", "sport"]),
    email: z.boolean(),
    inApp: z.boolean(),
  }),
  z.object({ action: z.literal("testSelf") }),
  z.object({ action: z.literal("pause"), paused: z.boolean() }),
  z.object({
    action: z.literal("retry"),
    id: z.uuid(),
    confirmUncertain: z.boolean().default(false),
  }),
  z.object({ action: z.literal("cancel"), id: z.uuid() }),
  z.object({
    action: z.literal("template"),
    kind: z.enum(editableKinds),
    locale: z.enum(["fr", "nl", "en"]),
    subject: z.string(),
    body: z.string(),
    expectedVersion: z.number().int().min(0),
  }),
]);
type Command = z.infer<typeof notificationCommand>;
type Scope = {
  c: PoolClient;
  p: Principal;
  user: Awaited<ReturnType<typeof account>>;
  context: Awaited<ReturnType<typeof active>>;
  manage: boolean;
};
async function transaction<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  callback: (scope: Scope) => Promise<T>,
  expectedOrg?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const initial = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [initial.organization_id],
    );
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const user = await account(c, p),
      context = await active(c, p);
    if (
      context.organization_id !== initial.organization_id ||
      (expectedOrg && expectedOrg !== context.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    const manage =
      permissions(context.role, context.grants).includes(
        "notifications.manage",
      ) && mfaSatisfied(!!user.twoFactorEnabled);
    const result = await callback({ c, p, user, context, manage });
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function visible(scope: Scope) {
  const rows = (
    await scope.c.query(
      "SELECT id,organization_id,recipient_user_id,kind,category,resource_type,resource_id,title,body,href,read_at,created_at FROM app_notification WHERE organization_id=$1 AND recipient_user_id=$2 ORDER BY created_at DESC LIMIT 100",
      [scope.context.organization_id, scope.p.userId],
    )
  ).rows;
  const result = [];
  for (const row of rows) if (await allowed(scope.c, row)) result.push(row);
  return result;
}
export async function notificationView(db: Pool, p: Principal) {
  return transaction(db, p, false, async (s) => {
    const inbox = await visible(s),
      org = s.context.organization_id;
    const saved = (
      await s.c.query(
        "SELECT category,email_enabled,in_app_enabled FROM notification_preference WHERE organization_id=$1 AND user_id=$2",
        [org, p.userId],
      )
    ).rows;
    const globalEnabled =
      (
        await s.c.query(
          "SELECT notifications_enabled FROM person WHERE user_id=$1",
          [p.userId],
        )
      ).rows[0]?.notifications_enabled ?? true;
    const templates = [];
    if (s.manage)
      for (const kind of editableKinds)
        for (const locale of ["fr", "nl", "en"] as const)
          templates.push({
            kind,
            locale,
            ...(await templateFor(s.c, org, kind, locale)),
          });
    const jobs = s.manage
      ? (
          await s.c.query(
            'SELECT j.id,j.kind,j.locale,j.state,j.attempts,j.template_version,j.transport_mode,j.error_code,j.created_at,j.available_at,j.completed_at,u.name AS recipient_name FROM mail_job j LEFT JOIN "user" u ON u.id=j.recipient_user_id WHERE j.organization_id=$1 ORDER BY j.created_at DESC,j.id LIMIT 50',
            [org],
          )
        ).rows
      : [];
    const attempts =
      s.manage && jobs.length
        ? (
            await s.c.query(
              "SELECT id,job_id,started_at,finished_at,outcome,error_code FROM mail_attempt WHERE job_id=ANY($1::uuid[]) ORDER BY started_at DESC",
              [jobs.map((j) => j.id)],
            )
          ).rows
        : [];
    return {
      context: {
        id: org,
        name: s.context.organization_name,
        role: s.context.role,
      },
      inbox,
      unread: inbox.filter((n) => !n.read_at).length,
      preferences: ["administrative", "sport"].map((category) => ({
        category,
        email:
          saved.find((v) => v.category === category)?.email_enabled ?? true,
        inApp:
          saved.find((v) => v.category === category)?.in_app_enabled ?? true,
      })),
      globalEnabled,
      manage: s.manage,
      paused: !!(
        await s.c.query(
          "SELECT paused FROM notification_setting WHERE organization_id=$1",
          [org],
        )
      ).rows[0]?.paused,
      transport: process.env.MAIL_TRANSPORT ?? "local",
      templates,
      jobs,
      attempts,
    };
  });
}
export async function notificationExecute(
  db: Pool,
  p: Principal,
  command: Command,
  expectedOrg: string,
) {
  return transaction(
    db,
    p,
    true,
    async (s) => {
      const org = s.context.organization_id;
      if (command.action === "read" || command.action === "readAll") {
        const ids = (await visible(s))
          .filter(
            (row) => command.action === "readAll" || row.id === command.id,
          )
          .map((row) => row.id);
        if (command.action === "read" && !ids.length)
          throw new AccessError("NOT_FOUND", 404);
        if (ids.length)
          await s.c.query(
            "UPDATE app_notification SET read_at=COALESCE(read_at,now()) WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND recipient_user_id=$3",
            [ids, org, p.userId],
          );
      } else if (command.action === "preferences") {
        await s.c.query(
          "INSERT INTO notification_preference(organization_id,user_id,category,email_enabled,in_app_enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,user_id,category) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,in_app_enabled=EXCLUDED.in_app_enabled",
          [org, p.userId, command.category, command.email, command.inApp],
        );
      } else if (command.action === "testSelf") {
        const locale =
          (
            await s.c.query("SELECT locale FROM person WHERE user_id=$1", [
              p.userId,
            ])
          ).rows[0]?.locale ?? "fr";
        await publish(s.c, {
          organizationId: org,
          userId: p.userId,
          email: s.user.email,
          kind: "test_self",
          category: "administrative",
          resourceType: "membership",
          resourceId: p.userId,
          eventKey: "test:" + p.userId + ":" + Math.floor(Date.now() / 60000),
          locale,
          variables: {
            name: s.user.name,
            organization: s.context.organization_name,
            url: process.env.BETTER_AUTH_URL + "/" + locale + "/notifications",
          },
        });
      } else {
        requirePermission(
          s.context.role,
          s.context.grants,
          "notifications.manage",
          mfaSatisfied(!!s.user.twoFactorEnabled),
        );
        if (command.action === "pause")
          await s.c.query(
            "INSERT INTO notification_setting(organization_id,paused) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET paused=EXCLUDED.paused",
            [org, command.paused],
          );
        else if (command.action === "template") {
          try {
            validateTemplate(command.kind, command);
          } catch {
            throw new AccessError("INVALID_TEMPLATE", 400);
          }
          const latest = await templateFor(
            s.c,
            org,
            command.kind,
            command.locale,
          );
          if (latest.version !== command.expectedVersion)
            throw new AccessError("STALE_VERSION", 409);
          await s.c.query(
            "INSERT INTO notification_template(organization_id,kind,locale,version,subject,body,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              org,
              command.kind,
              command.locale,
              latest.version + 1,
              command.subject.trim(),
              command.body.trim(),
              p.userId,
            ],
          );
        } else {
          const job = (
            await s.c.query(
              "SELECT id,state FROM mail_job WHERE id=$1 AND organization_id=$2 FOR UPDATE",
              [command.id, org],
            )
          ).rows[0];
          if (!job) throw new AccessError("NOT_FOUND", 404);
          if (command.action === "cancel") {
            if (!["pending", "failed", "uncertain"].includes(job.state))
              throw new AccessError("JOB_STATE", 409);
            await s.c.query(
              "UPDATE mail_job SET state='cancelled',completed_at=now(),error_code='ADMIN_CANCELLED' WHERE id=$1",
              [job.id],
            );
          } else {
            if (!["failed", "uncertain"].includes(job.state))
              throw new AccessError("JOB_STATE", 409);
            if (job.state === "uncertain" && !command.confirmUncertain)
              throw new AccessError("UNCERTAIN_CONFIRM", 409);
            await s.c.query(
              "UPDATE mail_job SET state='pending',attempts=0,available_at=now(),completed_at=NULL,dispatch_started_at=NULL,error_code=NULL WHERE id=$1",
              [job.id],
            );
          }
        }
        await audit(
          s.c,
          org,
          p.userId,
          "notifications." + command.action,
          "id" in command ? command.id : org,
        );
      }
      return { ok: true };
    },
    expectedOrg,
  );
}
export async function templatePreview(
  db: Pool,
  p: Principal,
  input: {
    kind: (typeof editableKinds)[number];
    subject: string;
    body: string;
    locale: "fr" | "nl" | "en";
    organizationId: string;
  },
) {
  return transaction(
    db,
    p,
    false,
    async (s) => {
      requirePermission(
        s.context.role,
        s.context.grants,
        "notifications.manage",
        mfaSatisfied(!!s.user.twoFactorEnabled),
      );
      try {
        validateTemplate(input.kind, input);
      } catch {
        throw new AccessError("INVALID_TEMPLATE", 400);
      }
      return renderTemplate(input, {
        name: input.locale === "fr" ? "Personne exemple" : "Voorbeeldpersoon",
        organization: s.context.organization_name,
        role: input.locale === "fr" ? "Joueur" : "Speler",
        url: process.env.BETTER_AUTH_URL + "/" + input.locale + "/access",
      });
    },
    input.organizationId,
  );
}
