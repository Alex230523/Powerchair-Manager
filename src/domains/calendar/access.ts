import { mfaSatisfied } from "../../lib/security-policy";
import type { Pool, PoolClient } from "pg";
import { permissions, type Mandate } from "../access/policy";
import { ageOn } from "../people/schema";
export type Db = Pool | PoolClient;
export type Actor = Mandate & { twoFactorEnabled: boolean };
export type Event = {
  id: string;
  organization_id: string;
  series_id: string;
  ordinal: number;
  title: string;
  kind: string;
  custom_type: string;
  timezone: string;
  local_start: string;
  local_end: string;
  starts_at: Date;
  ends_at: Date;
  team_id: string | null;
  place_id: string | null;
  responsible_user_id: string;
  visibility: string;
  equipment: string;
  instructions: string;
  status: string;
  is_exception: boolean;
  version: number;
  updated_at: Date;
  interval_days?: number;
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function manager(a: Actor) {
  return (
    mfaSatisfied(!!a.twoFactorEnabled) &&
    permissions(a.role, a.grants).includes("calendar.manage")
  );
}
export async function coachTeam(db: Db, a: Actor, teamId: string | null) {
  if (a.role !== "coach" || !teamId) return false;
  if (a.team_id) return a.team_id === teamId;
  return !!(
    await db.query(
      "SELECT 1 FROM team_membership m JOIN club_person c ON c.id=m.profile_id AND c.organization_id=m.organization_id JOIN person p ON p.id=c.person_id WHERE m.team_id=$1 AND m.organization_id=$2 AND p.user_id=$3 AND c.status='active' AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)",
      [teamId, a.organization_id, a.user_id],
    )
  ).rowCount;
}
export async function ownProfiles(db: Db, a: Actor) {
  const profiles = (
    await db.query(
      "SELECT c.id,p.user_id,c.birth_date::text AS birth_date FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 AND c.status='active'",
      [a.organization_id],
    )
  ).rows;
  const own = new Set(
    profiles.filter((p) => p.user_id === a.user_id).map((p) => p.id as string),
  );
  if (a.role === "guardian") {
    const links = (
      await db.query(
        "SELECT r.* FROM guardian_relationship r JOIN club_person g ON g.id=r.guardian_profile_id AND g.organization_id=r.organization_id JOIN person p ON p.id=g.person_id WHERE r.organization_id=$1 AND p.user_id=$2 AND g.status='active' AND r.can_view AND r.kind<>'declared' AND r.revoked_at IS NULL AND r.starts_on<=CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on>=CURRENT_DATE)",
        [a.organization_id, a.user_id],
      )
    ).rows;
    for (const r of links) {
      const subject = profiles.find((p) => p.id === r.subject_profile_id);
      if (
        subject?.birth_date &&
        (r.kind !== "legal_verified" || ageOn(subject.birth_date, today()) < 18)
      )
        own.add(subject.id);
    }
  }
  return own;
}
export async function audience(db: Db, e: Event) {
  return (
    await db.query(
      "SELECT DISTINCT c.id,c.full_name,p.user_id FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 AND c.status='active' AND (EXISTS(SELECT 1 FROM calendar_participant q WHERE q.event_id=$2 AND q.profile_id=c.id) OR EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=c.id AND m.organization_id=c.organization_id AND m.team_id=$3 AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)))",
      [e.organization_id, e.id, e.team_id],
    )
  ).rows as { id: string; full_name: string; user_id: string | null }[];
}
export async function canRead(db: Db, a: Actor, e: Event) {
  if (e.organization_id !== a.organization_id) return false;
  if (
    manager(a) ||
    (mfaSatisfied(!!a.twoFactorEnabled) &&
      permissions(a.role, a.grants).includes("calendar.read"))
  )
    return true;
  if (e.responsible_user_id === a.user_id) return true;
  if (e.visibility === "staff") return false;
  if (e.visibility === "organization") return true;
  if (await coachTeam(db, a, e.team_id)) return true;
  const own = await ownProfiles(db, a);
  return (await audience(db, e)).some((p) => own.has(p.id));
}
export async function canWrite(
  db: Db,
  a: Actor,
  e: Pick<Event, "organization_id" | "team_id">,
) {
  return (
    a.organization_id === e.organization_id &&
    (manager(a) ||
      (mfaSatisfied(!!a.twoFactorEnabled) &&
        (await coachTeam(db, a, e.team_id))))
  );
}
export async function notificationAllowed(
  db: Db,
  userId: string,
  eventId: string,
) {
  const e = (
    await db.query("SELECT * FROM calendar_event WHERE id=$1", [eventId])
  ).rows[0] as Event | undefined;
  if (!e) return false;
  const actors = (
    await db.query(
      'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
      [e.organization_id, userId],
    )
  ).rows as Actor[];
  for (const a of actors) if (await canRead(db, a, e)) return true;
  return false;
}
