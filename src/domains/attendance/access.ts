import type { Pool, PoolClient } from "pg";
import { permissions } from "../access/policy";
import {
  coachTeam,
  canRead,
  ownProfiles,
  type Actor,
  type Event,
} from "../calendar/access";
import { ageOn } from "../people/schema";
import { today } from "../calendar/access";
import { mfaSatisfied } from "../../lib/security-policy";
export type Db = Pool | PoolClient;
export async function manages(db: Db, a: Actor, e: Event) {
  return (
    e.organization_id === a.organization_id &&
    mfaSatisfied(a.twoFactorEnabled) &&
    (permissions(a.role, a.grants).includes("attendance.manage") ||
      (await coachTeam(db, a, e.team_id)))
  );
}
export async function mayRespond(
  db: Db,
  a: Actor,
  profile: string,
  edit = false,
) {
  if (!(await ownProfiles(db, a)).has(profile)) return false;
  const self = await db.query(
    "SELECT 1 FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.id=$1 AND p.user_id=$2",
    [profile, a.user_id],
  );
  if (self.rowCount || !edit) return true;
  const links = (
    await db.query(
      "SELECT r.kind,c.birth_date::text FROM guardian_relationship r JOIN club_person g ON g.id=r.guardian_profile_id JOIN person p ON p.id=g.person_id JOIN club_person c ON c.id=r.subject_profile_id WHERE r.subject_profile_id=$1 AND r.organization_id=$2 AND p.user_id=$3 AND r.can_edit AND r.can_view AND r.kind<>'declared' AND r.revoked_at IS NULL AND r.starts_on<=CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on>=CURRENT_DATE) AND g.status='active' AND c.status='active'",
      [profile, a.organization_id, a.user_id],
    )
  ).rows;
  return links.some(
    (r) =>
      r.birth_date &&
      (r.kind !== "legal_verified" || ageOn(r.birth_date, today()) < 18),
  );
}
export async function visible(db: Db, a: Actor, e: Event, profile: string) {
  return (
    (await manages(db, a, e)) ||
    ((await canRead(db, a, e)) && (await mayRespond(db, a, profile)))
  );
}
export async function notificationAllowed(
  db: Db,
  userId: string,
  invitationId: string,
) {
  const r = (
    await db.query(
      "SELECT i.profile_id,i.withdrawn_at,e.* FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id WHERE i.id=$1",
      [invitationId],
    )
  ).rows[0];
  if (!r || r.withdrawn_at || r.status === "cancelled") return false;
  const actors = (
    await db.query(
      'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
      [r.organization_id, userId],
    )
  ).rows as Actor[];
  for (const a of actors)
    if (await visible(db, a, r, r.profile_id)) return true;
  return false;
}
