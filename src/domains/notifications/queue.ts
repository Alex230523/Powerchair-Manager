import { Pool, type PoolClient } from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { seal } from "./crypto";
import {
  builtin,
  renderTemplate,
  type Kind,
  type Variables,
} from "./templates";
export type Db = Pool | PoolClient;
/** "digest": the weekly digest (wave 15, C7), switched on and off on its own. */
export type Category = "security" | "administrative" | "sport" | "digest";
export type ResourceType =
  | "auth"
  | "funding"
  | "digest"
  | "invitation"
  | "membership"
  | "team"
  | "family"
  | "registration"
  | "document"
  | "calendar"
  | "attendance"
  | "dues"
  | "training"
  | "match"
  | "license"
  | "newsletter"
  | "event_mail"
  | "automation"
  | "tax";
export type Envelope = {
  email: string;
  url: string;
  subject: string;
  text: string;
  html: string;
  /** Display name of the sender (the club) and where replies go. */
  fromName?: string;
  replyTo?: string;
};
export type Publication = {
  organizationId: string | null;
  userId: string | null;
  email: string;
  kind: Kind;
  category: Category;
  eventKey: string;
  resourceType: ResourceType;
  resourceId: string;
  locale: "fr" | "nl" | "en";
  variables: Variables;
  inApp?: boolean;
  /** Ready HTML for club-written mails (already escaped by its builder). */
  html?: string;
  /** B7: an automation that only notifies in the application, without an email. */
  skipEmail?: boolean;
};
/** Display name and reply address chosen by the club (wave 9). */
export async function senderOf(db: Db, org: string | null) {
  if (!org) return {};
  const row = (
    await db.query(
      "SELECT name,mail_sender_name,COALESCE(mail_reply_to,contact_email) AS reply_to FROM organization WHERE id=$1",
      [org],
    )
  ).rows[0] as
    | { name: string; mail_sender_name: string; reply_to: string | null }
    | undefined;
  if (!row) return {};
  return {
    fromName: (row.mail_sender_name || row.name).replace(/[\r\n<>"]/g, "").slice(0, 80),
    ...(row.reply_to ? { replyTo: row.reply_to } : {}),
  };
}
export async function preferences(
  db: Db,
  org: string,
  userId: string,
  category: Category,
) {
  if (category === "security") return { email: true, inApp: true };
  // The digest's own switch is read when it is built; only the global switch applies here.
  if (category === "digest") {
    const row = (await db.query("SELECT notifications_enabled FROM person WHERE user_id=$1", [userId])).rows[0];
    return { email: !!row?.notifications_enabled, inApp: false };
  }
  const result = await db.query(
    "SELECT p.notifications_enabled,COALESCE(n.email_enabled,true) AS email,COALESCE(n.in_app_enabled,true) AS app FROM person p LEFT JOIN notification_preference n ON n.user_id=p.user_id AND n.organization_id=$2 AND n.category=$3 WHERE p.user_id=$1",
    [userId, org, category],
  );
  const row = result.rows[0];
  return {
    email: !!row?.notifications_enabled && row.email,
    inApp: !!row?.notifications_enabled && row.app,
  };
}
export async function templateFor(
  db: Db,
  org: string | null,
  kind: Kind,
  locale: "fr" | "nl" | "en",
) {
  const custom = org
    ? (
        await db.query(
          "SELECT id,subject,body,version FROM notification_template WHERE organization_id=$1 AND kind=$2 AND locale=$3 ORDER BY version DESC LIMIT 1",
          [org, kind, locale],
        )
      ).rows[0]
    : undefined;
  return custom ?? { id: null, version: 0, ...builtin[kind][locale] };
}
async function insert(client: PoolClient, input: Publication) {
  z.email().parse(input.email);
  // Wave 17 (J1): nothing more for a person who has died (only account recovery stays possible).
  if (input.userId && input.resourceType !== "auth" && (await deceasedUser(client, input.userId))) return undefined;
  const base = new URL(process.env.BETTER_AUTH_URL!),
    url = new URL(input.variables.url, base);
  if (url.origin !== base.origin) throw new Error("INVALID_MAIL_URL");
  const key = createHash("sha256")
    .update(
      [
        input.organizationId ?? "account",
        input.email.toLowerCase(),
        input.eventKey,
      ].join("|"),
    )
    .digest("hex");
  const dispatch = await client.query(
    "INSERT INTO notification_dispatch(organization_id,recipient_user_id,dedupe_key) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
    [input.organizationId, input.userId, key],
  );
  if (!dispatch.rowCount)
    return (
      await client.query("SELECT id FROM mail_job WHERE dedupe_key=$1", [key])
    ).rows[0]?.id as string | undefined;
  const template = await templateFor(
      client,
      input.organizationId,
      input.kind,
      input.locale,
    ),
    rendered = renderTemplate(template, input.variables);
  if (input.html) rendered.html = input.html;
  const pref =
    input.organizationId && input.userId
      ? await preferences(
          client,
          input.organizationId,
          input.userId,
          input.category,
        )
      : { email: true, inApp: false };
  let jobId: string | undefined;
  if (pref.email && !input.skipEmail)
    jobId = (
      await client.query(
        "INSERT INTO mail_job(dispatch_id,organization_id,recipient_user_id,kind,category,resource_type,resource_id,locale,template_id,template_version,payload_ciphertext,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
        [
          dispatch.rows[0].id,
          input.organizationId,
          input.userId,
          input.kind,
          input.category,
          input.resourceType,
          input.resourceId,
          input.locale,
          template.id,
          template.version,
          seal(
            {
              email: input.email,
              url: input.variables.url,
              ...rendered,
              ...(input.category === "security"
                ? {}
                : await senderOf(client, input.organizationId)),
            },
            key,
          ),
          key,
        ],
      )
    ).rows[0].id;
  if (
    pref.inApp &&
    input.inApp !== false &&
    input.organizationId &&
    input.userId
  ) {
    const member = await client.query(
      "SELECT 1 FROM organization_membership WHERE organization_id=$1 AND user_id=$2 AND active",
      [input.organizationId, input.userId],
    );
    if (member.rowCount)
      await client.query(
        "INSERT INTO app_notification(dispatch_id,organization_id,recipient_user_id,kind,category,resource_type,resource_id,title,body,href) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          dispatch.rows[0].id,
          input.organizationId,
          input.userId,
          input.kind,
          input.category,
          input.resourceType,
          input.resourceId,
          rendered.subject,
          rendered.text,
          url.pathname.startsWith("/api/")
            ? "/" + input.locale + "/access"
            : url.pathname,
        ],
      );
  }
  return jobId;
}
export async function publish(db: Db, input: Publication) {
  if (!(db instanceof Pool)) return insert(db, input);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await insert(client, input);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function publishAuth(
  pool: Pool,
  user: { id: string; email: string; name: string },
  url: string,
  kind: "auth_verify" | "auth_reset",
) {
  const callback = new URL(url).searchParams.get("callbackURL");
  const language = new URL(
    callback ?? "/fr/access",
    process.env.BETTER_AUTH_URL,
  ).pathname.split("/")[1];
  const hint = language === "en" || language === "nl" ? language : "fr";
  const locale = ((
    await pool.query("SELECT locale FROM person WHERE user_id=$1", [user.id])
  ).rows[0]?.locale ?? hint) as "fr" | "nl" | "en";
  return publish(pool, {
    organizationId: null,
    userId: user.id,
    email: user.email,
    kind,
    category: "security",
    eventKey: kind + ":" + createHash("sha256").update(url).digest("hex"),
    resourceType: "auth",
    resourceId: user.id,
    locale,
    inApp: false,
    variables: { name: user.name, organization: "", url },
  });
}

/** Wave 17 (J1): the account belongs to a person whose file says « Décédé ». */
export async function deceasedUser(client: Pick<PoolClient, "query">, userId: string) {
  return !!(
    await client.query("SELECT 1 FROM club_person c JOIN person p ON p.id=c.person_id WHERE p.user_id=$1 AND c.departure_status='deceased' LIMIT 1", [userId])
  ).rowCount;
}
