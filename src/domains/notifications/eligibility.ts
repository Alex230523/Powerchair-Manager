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
import { emailHash } from "../communication/hash";

/** The account is the person's own, or a current representative of them. */
async function speaksFor(db: Db, org: string, profileId: string, userId: string) {
  return !!(
    await db.query(
      `SELECT 1 FROM club_person c JOIN person p ON p.id=c.person_id
        WHERE c.id=$1 AND c.organization_id=$2 AND c.status='active' AND p.user_id=$3
       UNION ALL
       SELECT 1 FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person p ON p.id=gp.person_id JOIN club_person c ON c.id=g.subject_profile_id
        WHERE g.subject_profile_id=$1 AND g.organization_id=$2 AND c.status='active' AND gp.status='active' AND p.user_id=$3
          AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)`,
      [profileId, org, userId],
    )
  ).rowCount;
}
/** Club news: the delivery exists, the address did not unsubscribe. */
async function newsletterAllowed(db: Db, target: Target, envelope?: Envelope) {
  if (!envelope || !target.organization_id) return false;
  return !!(
    await db.query(
      `SELECT 1 FROM newsletter_delivery d JOIN organization o ON o.id=d.organization_id
        WHERE d.id::text=$1 AND d.organization_id=$2 AND d.email_hash=$3 AND NOT ('messages'=ANY(o.disabled_modules))
          AND NOT EXISTS(SELECT 1 FROM mail_unsubscribe u WHERE u.organization_id=d.organization_id AND u.email_hash=d.email_hash)`,
      [target.resource_id, target.organization_id, emailHash(envelope.email)],
    )
  ).rowCount;
}
/** A prepared event mail goes out only while the event still takes place. */
async function eventMailAllowed(db: Db, target: Target, userId: string | null, envelope?: Envelope) {
  if (!target.organization_id || !envelope) return false;
  const live = (
    await db.query(
      "SELECT 1 FROM event_mail m JOIN calendar_event e ON e.id=m.event_id WHERE m.id::text=$1 AND m.organization_id=$2 AND m.status<>'cancelled' AND e.status='scheduled'",
      [target.resource_id, target.organization_id],
    )
  ).rowCount;
  if (!live) return false;
  // Still connected to the club: an active member account, or an address on an active profile.
  return !!(
    await db.query(
      userId
        ? `SELECT 1 FROM organization_membership WHERE organization_id=$1 AND user_id=$2 AND active
           UNION ALL SELECT 1 FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 AND p.user_id=$2 AND c.status='active'`
        : "SELECT 1 FROM club_person WHERE organization_id=$1 AND status='active' AND lower(email)=lower($2)",
      [target.organization_id, userId ?? envelope.email],
    )
  ).rowCount;
}
/** Mails sent to the address recorded by the club, for people without an account. */
async function addressAllowed(db: Db, target: Target, envelope?: Envelope) {
  if (!envelope || !target.organization_id) return false;
  if (target.kind === "dues_reminder" || target.kind === "document_reminder")
    return !!(
      await db.query(
        "SELECT 1 FROM club_person WHERE id::text=$1 AND organization_id=$2 AND status='active' AND lower(email)=lower($3)",
        [target.resource_id, target.organization_id, envelope.email],
      )
    ).rowCount;
  if (target.resource_type === "newsletter")
    return newsletterAllowed(db, target, envelope);
  if (target.resource_type === "event_mail")
    return eventMailAllowed(db, target, null, envelope);
  return false;
}
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
  if (!target.recipient_user_id) return addressAllowed(db, target, envelope);
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
  // Reminders point at the person concerned (resource = their profile).
  if (target.kind === "dues_reminder" || target.kind === "document_reminder")
    return speaksFor(db, target.organization_id, target.resource_id, user.id);
  if (target.resource_type === "newsletter")
    return newsletterAllowed(db, target, envelope);
  if (target.resource_type === "event_mail")
    return eventMailAllowed(db, target, user.id, envelope);
  if (target.resource_type === "attendance")
    return attendanceAllowed(db, user.id, target.resource_id);
  if (target.resource_type === "calendar")
    return calendarAllowed(db, user.id, target.resource_id);
  if (target.resource_type === "document")
    return notificationAllowed(db, user.id, target.resource_id);
  if (target.resource_type === "registration")
    return !!(
      await db.query(
        target.kind === "registration_link"
          ? // Link sent to someone registering without a password.
            "SELECT 1 FROM registration_guest_link l JOIN registration_form f ON f.id=l.form_id WHERE l.id::text=$1 AND f.organization_id=$2 AND l.user_id=$3 AND l.expires_at>now()"
          : "SELECT 1 FROM registration_application WHERE id::text=$1 AND organization_id=$2 AND applicant_user_id=$3 AND status<>'draft'",
        [target.resource_id, target.organization_id, user.id],
      )
    ).rowCount;
  // The weekly digest (wave 15, C7): built for a club manager who still holds the mandate.
  if (target.resource_type === "digest")
    return !!(
      await db.query(
        `SELECT 1 FROM digest_send s JOIN role_assignment r ON r.organization_id=s.organization_id AND r.user_id=s.user_id
           JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id
          WHERE s.id::text=$1 AND s.organization_id=$2 AND s.user_id=$3 AND r.role IN ('club_president','coach') AND m.active
            AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`,
        [target.resource_id, target.organization_id, user.id],
      )
    ).rowCount;
  const roles = await db.query(
    `SELECT r.role FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`,
    [target.organization_id, user.id],
  );
  if (!roles.rowCount) return false;
  // Membership news, federation follow-ups (courses, matches, licences) and the
  // sponsor and grant task reminders (wave 15) go to accounts that still hold a current mandate in the organisation.
  if (
    ["membership", "training", "match", "license", "funding"].includes(target.resource_type)
  )
    return true;
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
