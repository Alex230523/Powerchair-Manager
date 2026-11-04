import { mfaSatisfied } from "../../lib/security-policy";
import type { Pool, PoolClient } from "pg";
import { permissions, type Mandate } from "../access/policy";
import { ageOn } from "../people/schema";
export type Doc = {
  id: string;
  organization_id: string;
  profile_id: string | null;
  sensitive: boolean;
  status: string;
  current_version_id: string | null;
  expires_on: string | null;
  season_id: string;
  name: string;
  version: number;
  category: string;
  /** 10: the free folder it is kept in, if any. */
  folder_id?: string | null;
};
export type Actor = Mandate & { twoFactorEnabled: boolean };
type Db = Pool | PoolClient;
export const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function manages(a: Actor) {
  return (
    mfaSatisfied(!!a.twoFactorEnabled) &&
    permissions(a.role, a.grants).includes("documents.manage")
  );
}
/**
 * 10: who sees a free folder. « Présidence »: the president and those who
 * manage the documents; « Staff »: every mandate but players and parents;
 * « Tous les membres »: everyone in the club.
 */
export function folderAllows(visibility: string, a: Actor) {
  if (visibility === "members") return true;
  if (visibility === "staff") return a.role !== "player" && a.role !== "guardian";
  return a.role === "club_president" || manages(a);
}
export async function docAccess(db: Db, a: Actor, d: Doc, write = false) {
  if (d.sensitive && !mfaSatisfied(!!a.twoFactorEnabled)) return false;
  // 10: a folder narrows, never widens: outside its circle nothing in it is seen.
  // Inside, the club's own document (no owner, not sensitive, with a file) is read by that circle.
  if (d.folder_id && d.organization_id === a.organization_id) {
    const f = (await db.query("SELECT visibility FROM document_folder WHERE id=$1 AND organization_id=$2", [d.folder_id, d.organization_id])).rows[0];
    if (!f || !folderAllows(f.visibility, a)) return false;
    if (!write && !d.profile_id && !d.sensitive && ["uploaded", "review", "valid"].includes(d.status)) return true;
  }
  if (d.organization_id !== a.organization_id) {
    if (
      write ||
      !mfaSatisfied(!!a.twoFactorEnabled) ||
      !permissions(a.role, a.grants).includes("documents.read") ||
      (d.sensitive && !a.grants.includes("documents.sensitive"))
    )
      return false;
    return !!(
      await db.query(
        "SELECT 1 FROM document_share s JOIN organization o ON o.id=s.federation_id WHERE s.document_id=$1 AND s.federation_id=$2 AND o.kind='federation' AND s.revoked_at IS NULL AND s.expires_on>=CURRENT_DATE AND s.version_id=$3 AND $4='valid' AND ($5::date IS NULL OR $5::date>=CURRENT_DATE)",
        [d.id, a.organization_id, d.current_version_id, d.status, d.expires_on],
      )
    ).rowCount;
  }
  if (
    (manages(a) ||
      (!write &&
        mfaSatisfied(!!a.twoFactorEnabled) &&
        permissions(a.role, a.grants).includes("documents.read"))) &&
    (!d.sensitive || a.grants.includes("documents.sensitive"))
  )
    return true;
  if (!d.profile_id) return false;
  const p = (
    await db.query(
      "SELECT p.user_id,c.birth_date::text AS birth_date FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.id=$1 AND c.organization_id=$2 AND c.status='active'",
      [d.profile_id, a.organization_id],
    )
  ).rows[0];
  if (!p) return false;
  if (p.user_id === a.user_id) return true;
  if (a.role !== "guardian") return false;
  const links = (
    await db.query(
      "SELECT r.* FROM guardian_relationship r JOIN club_person c ON c.id=r.guardian_profile_id AND c.organization_id=r.organization_id JOIN person p ON p.id=c.person_id WHERE r.subject_profile_id=$1 AND r.organization_id=$2 AND p.user_id=$3 AND c.status='active' AND r.kind<>'declared' AND r.can_view AND r.revoked_at IS NULL AND r.starts_on<=CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on>=CURRENT_DATE)",
      [d.profile_id, a.organization_id, a.user_id],
    )
  ).rows;
  return links.some(
    (r) =>
      (!write || r.can_edit) &&
      !!p.birth_date &&
      (r.kind !== "legal_verified" || ageOn(p.birth_date, day()) < 18),
  );
}
export async function notificationAllowed(
  db: Db,
  userId: string,
  documentId: string,
) {
  const d = (
    await db.query(
      "SELECT *,expires_on::text AS expires_on FROM club_document WHERE id=$1",
      [documentId],
    )
  ).rows[0];
  if (!d) return false;
  const actors = (
    await db.query(
      'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.user_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
      [userId],
    )
  ).rows;
  for (const a of actors) if (await docAccess(db, a, d)) return true;
  return false;
}
