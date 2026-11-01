import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  AccessError,
  account,
  active,
  audit,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import { ownProfiles } from "../calendar/access";
import { absenceReasons } from "../attendance/schema";
import { applyAbsences } from "../attendance/service";
import { brusselsToday } from "../people/service";

/**
 * Absences announced in advance by a player, a family or the staff: every
 * session of the period is answered "absent" with the reason, including the
 * sessions planned later. Cancelling the announcement reopens those answers.
 */
export const absenceCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("declare"),
    profileId: z.uuid(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    reason: z.enum(absenceReasons),
    comment: z.string().trim().max(500),
  }),
  z.object({ action: z.literal("cancel"), id: z.uuid() }),
]);
export type AbsenceCommand = z.infer<typeof absenceCommand>;

async function scope<T>(
  db: Pool,
  p: Principal,
  fn: (x: {
    c: PoolClient;
    org: string;
    own: Set<string>;
    staff: boolean;
    coachTeams: string[] | null;
  }) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const own = await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled });
    const manager =
      mfa && (a.role === "club_president" || rights.includes("attendance.manage"));
    // A coach without the attendance right sees the absences of their teams.
    let coachTeams: string[] | null = null;
    if (!manager && mfa && a.role === "coach")
      coachTeams = (
        await c.query(
          `SELECT DISTINCT m.team_id FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id JOIN person pe ON pe.id=cp.person_id
            WHERE m.organization_id=$1 AND pe.user_id=$2 AND m.role IN ('coach','assistant') AND NOT m.cancelled AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)
           UNION SELECT team_id FROM role_assignment WHERE id=$3 AND team_id IS NOT NULL`,
          [a.organization_id, p.userId, a.id],
        )
      ).rows.map((r) => r.team_id as string);
    const out = await fn({
      c,
      org: a.organization_id,
      own,
      staff: manager,
      coachTeams,
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function absencesView(db: Pool, p: Principal) {
  return scope(db, p, async ({ c, org, own, staff, coachTeams }) => {
    const rows = (
      await c.query(
        `SELECT a.id,a.profile_id,cp.full_name,a.starts_on::text AS starts_on,a.ends_on::text AS ends_on,a.reason,a.comment,u.name AS declared_by,a.created_at
           FROM absence_period a JOIN club_person cp ON cp.id=a.profile_id JOIN "user" u ON u.id=a.declared_by
          WHERE a.organization_id=$1 AND a.cancelled_at IS NULL AND a.ends_on>=CURRENT_DATE-1
            AND ($2 OR a.profile_id=ANY($3::uuid[])
                 OR ($4::uuid[] IS NOT NULL AND EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=a.profile_id AND m.team_id=ANY($4::uuid[]) AND NOT m.cancelled AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE))))
          ORDER BY a.starts_on,cp.full_name LIMIT 300`,
        [org, staff, [...own], coachTeams],
      )
    ).rows;
    return {
      organization_id: org,
      today: brusselsToday(),
      can: { staff: staff || !!coachTeams?.length },
      absences: rows,
      // People one may announce an absence for.
      profiles: (
        await c.query(
          "SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' AND ($2 OR id=ANY($3::uuid[])) ORDER BY full_name",
          [org, staff, [...own]],
        )
      ).rows as { id: string; full_name: string }[],
    };
  });
}

export async function absenceExecute(
  db: Pool,
  p: Principal,
  cmd: AbsenceCommand,
  expected: string,
) {
  return scope(
    db,
    p,
    async ({ c, org, own, staff }) => {
      if (cmd.action === "declare") {
        if (!staff && !own.has(cmd.profileId)) throw new AccessError("FORBIDDEN");
        if (cmd.endsOn < cmd.startsOn) throw new AccessError("INVALID_DATE", 400);
        if (cmd.endsOn < brusselsToday()) throw new AccessError("INVALID_DATE", 400);
        const id = (
          await c.query(
            "INSERT INTO absence_period(organization_id,profile_id,starts_on,ends_on,reason,comment,declared_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [org, cmd.profileId, cmd.startsOn, cmd.endsOn, cmd.reason, cmd.comment, p.userId],
          )
        ).rows[0].id as string;
        await applyAbsences(c, org, null, cmd.profileId);
        await audit(c, org, p.userId, "absence.declared", id);
        return { id };
      }
      const row = (
        await c.query(
          "SELECT * FROM absence_period WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL FOR UPDATE",
          [cmd.id, org],
        )
      ).rows[0];
      if (!row) throw new AccessError("NOT_FOUND", 404);
      if (!staff && !own.has(row.profile_id) && row.declared_by !== p.userId)
        throw new AccessError("FORBIDDEN");
      await c.query("UPDATE absence_period SET cancelled_at=now() WHERE id=$1", [cmd.id]);
      // Answers given by the announcement reopen for sessions still to come.
      await c.query(
        `UPDATE attendance_invitation i SET response='none',absence_reason='',absence_period_id=NULL,comment='',responded_at=NULL,responded_by=NULL,
               actual=CASE WHEN i.actual='excused' THEN 'unchecked' ELSE i.actual END,version=i.version+1
           FROM attendance_register r JOIN calendar_event e ON e.id=r.event_id
          WHERE i.register_id=r.id AND i.absence_period_id=$1 AND r.closed_at IS NULL AND e.starts_at>now()`,
        [cmd.id],
      );
      await audit(c, org, p.userId, "absence.cancelled", cmd.id);
      return { id: cmd.id };
    },
    expected,
  );
}
