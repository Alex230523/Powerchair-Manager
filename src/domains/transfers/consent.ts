import type { PoolClient } from "pg";
import { adultOn } from "./schema";

/**
 * Wave 17 (J3): who may tick « Visible par les autres clubs de la
 * fédération »: the player when adult, a parent (a current guardian, not a
 * delegated aid) when minor. Never the club in their place. An unknown
 * birth date counts as a minor.
 */
export async function canDecide(c: PoolClient, userId: string, person: string, today: string) {
  const self = (await c.query("SELECT user_id FROM person WHERE id=$1", [person])).rows[0]?.user_id === userId;
  const birth = (await c.query("SELECT birth_date::text AS b FROM club_person WHERE person_id=$1 AND birth_date IS NOT NULL ORDER BY updated_at DESC LIMIT 1", [person])).rows[0]?.b ?? null;
  if (adultOn(birth, today)) return self;
  return !!(
    await c.query(
      `SELECT 1 FROM guardian_relationship g JOIN club_person subj ON subj.id=g.subject_profile_id JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person gpe ON gpe.id=gp.person_id
        WHERE subj.person_id=$1 AND gpe.user_id=$2 AND g.revoked_at IS NULL AND g.kind<>'delegated_aid' AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)`,
      [person, userId],
    )
  ).rowCount;
}

/** Records the choice when this account may make it; false otherwise (nothing changes). */
export async function setVisibility(c: PoolClient, userId: string, person: string, visible: boolean, today: string) {
  if (!(await canDecide(c, userId, person, today))) return false;
  await c.query(
    "INSERT INTO transfer_visibility(person_id,visible,decided_by) VALUES($1,$2,$3) ON CONFLICT (person_id) DO UPDATE SET visible=EXCLUDED.visible,decided_by=EXCLUDED.decided_by,decided_at=now()",
    [person, visible, userId],
  );
  return true;
}
