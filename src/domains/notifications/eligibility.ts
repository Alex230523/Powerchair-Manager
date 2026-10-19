import { notificationAllowed as attendanceAllowed } from "../attendance/access";
import { notificationAllowed as calendarAllowed } from "../calendar/access";
import { notificationAllowed } from "../documents/access";
import type { Db, Category, ResourceType, Envelope } from "./queue";
import {
  permissions,
  isAdmin,
  type Role,
  type Permission,
} from "../access/policy";
import { ageOn } from "../people/schema";
export type Target = {
  organization_id: string | null;
  recipient_user_id: string | null;
  resource_type: ResourceType;
  resource_id: string;
  kind: string;
  category: Category;
};
export async function allowed(
  db: Db,
  target: Target,
  envelope?: Envelope,
): Promise<boolean> {
  if (target.resource_type === "invitation") {
    const result = await db.query(
      "SELECT * FROM invitation WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND (valid_until IS NULL OR valid_until>now())",
      [target.resource_id, target.organization_id],
    );
    const invite = result.rows[0];
    if (
      !invite ||
      !envelope ||
      invite.email.toLowerCase() !== envelope.email.toLowerCase()
    )
      return false;
    const issuers = await db.query(
      `SELECT r.role,r.grants FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active`,
      [target.organization_id, invite.created_by],
    );
    return issuers.rows.some(
      (r) =>
        permissions(r.role, r.grants).includes("invitations.create") &&
        (!isAdmin(invite.role) || isAdmin(r.role)) &&
        invite.grants.every((g: string) =>
          permissions(r.role, r.grants).includes(g as Permission),
        ),
    );
  }
  const result = await db.query(
    'SELECT id,email,active,"emailVerified" FROM "user" WHERE id=$1',
    [target.recipient_user_id],
  );
  const user = result.rows[0];
  if (
    !user?.active ||
    (envelope && envelope.email.toLowerCase() !== user.email.toLowerCase())
  )
    return false;
  if (target.kind === "auth_verify") return false;
  if (target.resource_type === "auth") {
    if (!envelope) return false;
    const token = new URL(envelope.url).pathname.split("/").pop();
    return !!(
      await db.query(
        'SELECT 1 FROM verification WHERE identifier=$1 AND value=$2 AND "expiresAt">now()',
        ["reset-password:" + token, user.id],
      )
    ).rowCount;
  }
  if (!target.organization_id) return false;
  if (target.resource_type === "attendance")
    return attendanceAllowed(db, user.id, target.resource_id);
  if (target.resource_type === "calendar")
    return calendarAllowed(db, user.id, target.resource_id);
  if (target.resource_type === "document")
    return notificationAllowed(db, user.id, target.resource_id);
  if (target.resource_type === "registration")
    return !!(
      await db.query(
        "SELECT 1 FROM registration_application WHERE id=$1 AND organization_id=$2 AND applicant_user_id=$3 AND status<>'draft'",
        [target.resource_id, target.organization_id, user.id],
      )
    ).rowCount;
  const roles = await db.query(
    `SELECT r.role FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`,
    [target.organization_id, user.id],
  );
  if (!roles.rowCount) return false;
  if (target.resource_type === "membership") return true;
  if (target.resource_type === "team") {
    return !!(
      await db.query(
        "SELECT 1 FROM team_membership a JOIN club_person c ON c.id=a.profile_id AND c.organization_id=a.organization_id JOIN person p ON p.id=c.person_id WHERE a.id=$1 AND a.organization_id=$2 AND p.user_id=$3 AND c.status='active'",
        [target.resource_id, target.organization_id, user.id],
      )
    ).rowCount;
  }
  if (target.resource_type === "family") {
    if (!roles.rows.some((r) => (r.role as Role) === "guardian")) return false;
    const relationship = (
      await db.query(
        "SELECT r.*,c.birth_date::text FROM guardian_relationship r JOIN club_person g ON g.id=r.guardian_profile_id AND g.organization_id=r.organization_id JOIN person p ON p.id=g.person_id JOIN club_person c ON c.id=r.subject_profile_id AND c.organization_id=r.organization_id WHERE r.id=$1 AND r.organization_id=$2 AND p.user_id=$3 AND g.status='active' AND c.status='active' AND r.can_view AND r.kind<>'declared' AND r.revoked_at IS NULL AND r.starts_on<=CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on>=CURRENT_DATE)",
        [target.resource_id, target.organization_id, user.id],
      )
    ).rows[0];
    return (
      !!relationship?.birth_date &&
      (relationship.kind !== "legal_verified" ||
        ageOn(
          relationship.birth_date,
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Brussels",
          }).format(new Date()),
        ) < 18)
    );
  }
  return false;
}
