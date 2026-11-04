import type { PoolClient } from "pg";
import { publish } from "./queue";

/**
 * Point 13 (04/11/2026): a short notice in the application, by mail and on
 * the phone (as the person chose), with a link to where to act. Written in
 * the three languages; each person gets it in their own.
 */
export type NoticeText = Record<"fr" | "nl" | "en", { title: string; message: string }>;
type Person = { user_id: string; email: string; name: string; locale: string | null };

/** The active presidents of a club, with their account. */
export async function presidentsOf(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT DISTINCT u.id AS user_id,u.email,u.name,pe.locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`,
      [org],
    )
  ).rows as Person[];
}
/** One account, when it still belongs to the club. */
export async function accountIn(c: PoolClient, org: string, userId: string) {
  return (
    await c.query(
      `SELECT u.id AS user_id,u.email,u.name,pe.locale FROM "user" u JOIN organization_membership m ON m.user_id=u.id AND m.organization_id=$1 LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$2 AND u.active`,
      [org, userId],
    )
  ).rows as Person[];
}

export async function notice(c: PoolClient, org: string, people: Person[], text: NoticeText, path: string, key: string, category: "sport" | "administrative" = "sport") {
  const base = process.env.BETTER_AUTH_URL ?? "";
  const club = ((await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0]?.name as string) ?? "";
  let sent = 0;
  for (const p of people) {
    if (!p.email) continue;
    const locale = (["fr", "nl", "en"].includes(p.locale ?? "") ? p.locale : "fr") as "fr" | "nl" | "en";
    await publish(c, {
      organizationId: org,
      userId: p.user_id,
      email: p.email,
      kind: "automation",
      category,
      resourceType: "automation",
      resourceId: key,
      eventKey: `notice:${key}:${p.user_id}`,
      locale,
      variables: { name: p.name, organization: club, url: `${base}/${locale}${path}`, title: text[locale].title, message: text[locale].message },
    });
    sent++;
  }
  return sent;
}
