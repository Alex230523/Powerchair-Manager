import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import { seal } from "./crypto";
import { pushCopy, type PushTopic } from "../../components/push-copy";

/**
 * B4: what goes into the phone queue. A line is queued per person and event
 * only when the person has a device, has not switched the topic off and is
 * a member of the club. The text never carries a sensitive detail: the
 * club, the kind of news, a child's first name.
 */
type Db = Pool | PoolClient;
type Locale = "fr" | "nl" | "en";
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  urgent?: boolean;
  /** An invitation answered from the notification (« Présent » / « Absent »). */
  invitation?: { id: string; organizationId: string; present: string; absent: string; answered: string; closed: string };
};

/** The phone topic of a notification kind; null when it never goes to the phone. */
export function topicOfKind(kind: string): PushTopic | null {
  if (kind === "match_update" || kind === "training_update") return "change";
  if (kind === "dues_issued" || kind === "dues_reminder") return "dues";
  if (kind === "document_update" || kind === "document_reminder") return "document";
  if (kind === "automation") return "message";
  if (["registration_update", "team_assignment", "family_access", "license_update", "funding_task", "access_changed"].includes(kind)) return "other";
  // Attendance and calendar send their own (one per child, urgent within 48 h); sign-in, digest, tax, club mails never.
  return null;
}
/** Within 48 hours (before or after the change): a cancellation or a move is urgent. Pure. */
export function urgentChange(startsAt: Date | string, previousStart: Date | string | null, now = new Date()) {
  const within = (d: Date | string) => {
    const t = new Date(d).getTime() - now.getTime();
    return t > -3600000 && t < 48 * 3600000;
  };
  return within(startsAt) || (previousStart !== null && within(previousStart));
}
/** Several waiting notifications of one club become one. Pure. */
export function groupPayload(payloads: PushPayload[], locale: Locale, organization: string): PushPayload {
  if (payloads.length === 1) return payloads[0];
  return {
    title: organization,
    body: pushCopy[locale].messages.grouped.replace("{n}", String(payloads.length)),
    url: `/${locale}/settings/notifications`,
    tag: "pfm-group",
    urgent: payloads.some((p) => p.urgent),
  };
}
/** A first name only: the phone shows no surname. Pure. */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";

export type PushInput = {
  organizationId: string;
  userId: string;
  topic: PushTopic;
  kind: string;
  category: string;
  resourceType: string;
  resourceId: string;
  locale: Locale;
  eventKey: string;
  /** The path to open (same origin). */
  url: string;
  child?: string;
  invitationId?: string;
};

/** Queues one phone notification, if the person has a device and wants this topic from this club. */
export async function queuePush(c: Db, input: PushInput) {
  const ready = (
    await c.query(
      `SELECT o.name,
              EXISTS(SELECT 1 FROM push_subscription s WHERE s.user_id=$2) AS device,
              COALESCE((SELECT enabled FROM push_preference WHERE organization_id=$1 AND user_id=$2 AND topic=$3),true) AS wanted,
              COALESCE((SELECT notifications_enabled FROM person WHERE user_id=$2),false) AS global,
              EXISTS(SELECT 1 FROM organization_membership WHERE organization_id=$1 AND user_id=$2 AND active) AS member
         FROM organization o WHERE o.id=$1`,
      [input.organizationId, input.userId, input.topic],
    )
  ).rows[0];
  if (!ready?.device || !ready.wanted || !ready.global || !ready.member) return null;
  const t = pushCopy[input.locale].messages;
  const payload: PushPayload = {
    title: ready.name,
    body: input.topic === "invitation" && input.child ? t.invitationFor.replace("{child}", firstName(input.child)) : t[input.topic],
    url: input.url,
    tag: `${input.topic}:${input.resourceId}`,
    ...(input.topic === "urgent" ? { urgent: true } : {}),
    ...(input.invitationId ? { invitation: { id: input.invitationId, organizationId: input.organizationId, present: t.present, absent: t.absent, answered: t.answered, closed: t.closed } } : {}),
  };
  const key = createHash("sha256").update(["push", input.organizationId, input.userId, input.eventKey].join("|")).digest("hex");
  const r = await c.query(
    "INSERT INTO push_job(organization_id,recipient_user_id,topic,kind,category,resource_type,resource_id,payload_ciphertext,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
    [input.organizationId, input.userId, input.topic, input.kind, input.category, input.resourceType, input.resourceId, seal({ ...payload, locale: input.locale }, key), key],
  );
  return (r.rows[0]?.id as string | undefined) ?? null;
}
