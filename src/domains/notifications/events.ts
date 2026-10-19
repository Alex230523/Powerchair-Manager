import type { Db, Publication } from "./queue";
import { publish } from "./queue";
import { labels, type Role } from "../access/policy";
async function recipient(db: Db, userId: string) {
  return (
    await db.query(
      "SELECT u.id,u.name,u.email,COALESCE(p.locale,'fr') AS locale FROM \"user\" u LEFT JOIN person p ON p.user_id=u.id WHERE u.id=$1 AND u.active",
      [userId],
    )
  ).rows[0];
}
export async function publishInvitation(
  db: Db,
  org: string,
  id: string,
  token: string,
) {
  const row = (
    await db.query(
      "SELECT i.*,o.name AS organization FROM invitation i JOIN organization o ON o.id=i.organization_id WHERE i.id=$1 AND i.organization_id=$2",
      [id, org],
    )
  ).rows[0];
  const user = (
    await db.query(
      'SELECT u.id,u.name,p.locale FROM "user" u JOIN person p ON p.user_id=u.id WHERE lower(u.email)=lower($1)',
      [row.email],
    )
  ).rows[0];
  const locale = (user?.locale ?? "fr") as "fr" | "nl" | "en";
  return publish(db, {
    organizationId: org,
    userId: user?.id ?? null,
    email: row.email,
    kind: "invitation",
    category: "security",
    resourceType: "invitation",
    resourceId: id,
    eventKey: "invitation:" + id,
    locale,
    inApp: false,
    variables: {
      name: user?.name ?? "",
      organization: row.organization,
      role: labels[row.role as Role][locale],
      url:
        process.env.BETTER_AUTH_URL +
        "/" +
        locale +
        "/access#invitation=" +
        token,
    },
  });
}
export async function publishAuditEvent(
  db: Db,
  org: string,
  action: string,
  target: string,
  eventId: string,
) {
  let userId: string | undefined,
    kind: Publication["kind"] | undefined,
    resourceType: Publication["resourceType"] = "membership",
    resourceId = target;
  if (
    ["mandate.revoke", "mandate.renew", "invitation.accepted"].includes(action)
  ) {
    const row = (
      await db.query(
        "SELECT user_id FROM role_assignment WHERE id=$1 AND organization_id=$2",
        [target, org],
      )
    ).rows[0];
    userId = row?.user_id;
    kind = "access_changed";
  } else if (
    ["membership.activated", "membership.deactivated"].includes(action)
  ) {
    userId = target;
    kind = "access_changed";
  } else if (["people.assign", "people.endAssignment"].includes(action)) {
    const row = (
      await db.query(
        "SELECT p.user_id FROM team_membership a JOIN club_person c ON c.id=a.profile_id AND c.organization_id=a.organization_id JOIN person p ON p.id=c.person_id WHERE a.id=$1 AND a.organization_id=$2",
        [target, org],
      )
    ).rows[0];
    userId = row?.user_id;
    kind = "team_assignment";
    resourceType = "team";
  } else if (["people.guardian", "people.revokeGuardian"].includes(action)) {
    const row = (
      await db.query(
        "SELECT p.user_id FROM guardian_relationship r JOIN club_person c ON c.id=r.guardian_profile_id AND c.organization_id=r.organization_id JOIN person p ON p.id=c.person_id WHERE r.id=$1 AND r.organization_id=$2",
        [target, org],
      )
    ).rows[0];
    userId = row?.user_id;
    kind = "family_access";
    resourceType = "family";
  }
  if (!userId || !kind) return;
  const user = await recipient(db, userId);
  if (!user) return;
  const orgName = (
    await db.query("SELECT name FROM organization WHERE id=$1", [org])
  ).rows[0]?.name;
  if (!orgName) return;
  const locale = user.locale as "fr" | "nl" | "en";
  if (resourceType === "membership") resourceId = userId;
  await publish(db, {
    organizationId: org,
    userId,
    email: user.email,
    kind,
    category:
      kind === "access_changed"
        ? "security"
        : kind === "team_assignment"
          ? "sport"
          : "administrative",
    resourceType,
    resourceId,
    eventKey: eventId,
    locale,
    variables: {
      name: user.name,
      organization: orgName,
      url:
        process.env.BETTER_AUTH_URL +
        "/" +
        locale +
        (kind === "access_changed" ? "/access" : "/club"),
    },
  });
}
