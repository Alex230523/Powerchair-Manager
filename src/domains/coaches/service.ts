import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import {
  peopleScope,
  peopleRecords,
  peopleVisibility,
  brusselsToday,
} from "../people/service";
import { ageOn } from "../people/schema";
import {
  clubCommand,
  federationCommand,
  coachAttendance,
  validUntil,
  type ClubCommand,
  type FederationCommand,
  type CoachAttendanceRow,
} from "./schema";
export { clubCommand, federationCommand };

const coachRoles = ["coach", "assistant"];

/**
 * Coach profile for the club: identity (directory staff only), teams coached,
 * upcoming sessions of those teams, attendance and courses.
 */
export async function coachProfileView(db: Pool, p: Principal, id: string) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id,
      day = brusselsToday();
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const profile = all.profiles.find((x) => x.id === id);
    if (!profile || !v.visibleProfiles.has(id))
      throw new AccessError("NOT_FOUND", 404);
    const assignments = all.assignments.filter(
      (a) => a.profile_id === id && coachRoles.includes(a.role),
    );
    if (!profile.directory_roles.includes("coach") && !assignments.length)
      throw new AccessError("NOT_FOUND", 404);
    const details = v.details.has(id) || v.own?.id === id;
    const seasons = new Map(
      (
        await c.query("SELECT id,name FROM season WHERE organization_id=$1", [
          org,
        ])
      ).rows.map((r) => [r.id as string, r.name as string]),
    );
    const teams = assignments.map((a) => {
      const team = all.teams.find((t) => t.id === a.team_id);
      return {
        id: a.id,
        team_id: a.team_id,
        team: team?.name ?? "",
        season: team ? (seasons.get(team.season_id) ?? "") : "",
        role: a.role,
        starts_on: a.starts_on,
        ends_on: a.ends_on,
        current:
          !a.cancelled &&
          !a.closed_at &&
          a.starts_on <= day &&
          (!a.ends_on || a.ends_on >= day),
      };
    });
    const currentTeams = [
      ...new Set(teams.filter((t) => t.current).map((t) => t.team_id)),
    ];
    // Upcoming sessions of the coached teams, with the coach's own answer.
    const upcoming = (
      await c.query(
        `SELECT e.id,e.title,e.kind,e.starts_at,e.local_start,t.name AS team,i.response
           FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id
           LEFT JOIN attendance_register r ON r.event_id=e.id
           LEFT JOIN attendance_invitation i ON i.register_id=r.id AND i.profile_id=$3 AND i.withdrawn_at IS NULL
          WHERE e.organization_id=$1 AND e.status='scheduled' AND e.starts_at>=now()
            AND (e.team_id=ANY($2::uuid[]) OR EXISTS (SELECT 1 FROM calendar_participant cp WHERE cp.event_id=e.id AND cp.profile_id=$3))
          ORDER BY e.starts_at LIMIT 8`,
        [org, currentTeams, id],
      )
    ).rows;
    const rows = (
      await c.query(
        `SELECT e.kind,e.status,e.team_id,i.response,i.actual,(r.closed_at IS NOT NULL) AS closed,(i.withdrawn_at IS NOT NULL) AS withdrawn
           FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
          WHERE i.organization_id=$1 AND i.profile_id=$2 AND e.starts_at<now()`,
        [org, id],
      )
    ).rows.filter(
      (r) => v.full || (r.team_id && v.visibleTeams.has(r.team_id)),
    ) as CoachAttendanceRow[];
    const mfa = mfaSatisfied(!!s.user.twoFactorEnabled);
    const canRequest = mfa && s.rights.includes("mandates.manage");
    const formations =
      details || canRequest
        ? (
            await c.query(
              `SELECT q.id,q.status,q.note,q.requested_at,q.decided_at,q.decision_note,q.completed_on::text,q.valid_until::text,
                      k.title,k.level,k.hours::float AS hours,f.name AS federation
                 FROM training_request q JOIN training_course k ON k.id=q.course_id JOIN organization f ON f.id=k.federation_id
                WHERE q.organization_id=$1 AND q.profile_id=$2 ORDER BY q.requested_at DESC`,
              [org, id],
            )
          ).rows
        : [];
    const courses = canRequest
      ? (
          await c.query(
            "SELECT k.id,k.title,k.level,k.hours::float AS hours,f.name AS federation FROM training_course k JOIN organization f ON f.id=k.federation_id WHERE k.active ORDER BY f.name,k.title",
          )
        ).rows
      : [];
    return {
      organization_id: org,
      today: day,
      coach: {
        id,
        full_name: profile.full_name,
        status: profile.status,
        former: profile.former_roles.includes("coach"),
        has_account: !!profile.user_id,
        ...(details
          ? {
              email: profile.email ?? "",
              phone: profile.phone,
              birth_date: profile.birth_date,
              age: profile.birth_date ? ageOn(profile.birth_date, day) : null,
              joined_on: profile.joined_on,
            }
          : {}),
      },
      details,
      teams,
      upcoming,
      attendance: coachAttendance(rows),
      formations,
      courses,
      can: { request: canRequest },
    };
  });
}

export async function coachExecute(
  db: Pool,
  p: Principal,
  command: ClubCommand,
  expected: string,
) {
  return peopleScope(db, p, true, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    if (!mfaSatisfied(!!s.user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    if (!s.rights.includes("mandates.manage"))
      throw new AccessError("FORBIDDEN");
    let target: string;
    if (command.action === "requestCourse") {
      const coach = await c.query(
        "SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active' AND ('coach'=ANY(directory_roles) OR EXISTS (SELECT 1 FROM team_membership m WHERE m.profile_id=club_person.id AND m.role IN ('coach','assistant')))",
        [command.profileId, org],
      );
      if (!coach.rowCount) throw new AccessError("NOT_FOUND", 404);
      const course = await c.query(
        "SELECT 1 FROM training_course WHERE id=$1 AND active",
        [command.courseId],
      );
      if (!course.rowCount) throw new AccessError("NOT_FOUND", 404);
      const open = await c.query(
        "SELECT 1 FROM training_request WHERE profile_id=$1 AND course_id=$2 AND status='requested'",
        [command.profileId, command.courseId],
      );
      if (open.rowCount) throw new AccessError("DUPLICATE", 409);
      target = (
        await c.query(
          "INSERT INTO training_request(organization_id,profile_id,course_id,note,requested_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [org, command.profileId, command.courseId, command.note, p.userId],
        )
      ).rows[0].id;
    } else {
      const changed = await c.query(
        "UPDATE training_request SET status='cancelled',decided_at=now(),decided_by=$3 WHERE id=$1 AND organization_id=$2 AND status='requested' RETURNING id",
        [command.id, org, p.userId],
      );
      if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
      target = command.id;
    }
    await audit(c, org, p.userId, "training." + command.action, target);
    return { ok: true as const, id: target };
  });
}

/** Federation scope: courses belong to the federation that created them. */
async function federation<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (c: PoolClient, fed: string, manage: boolean) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [a.organization_id],
    );
    const user = await account(c, p);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    if (a.role !== "federation_president" && a.role !== "federation_worker")
      throw new AccessError("FORBIDDEN");
    const manage =
      permissions(a.role, a.grants).includes("mandates.manage") &&
      mfaSatisfied(!!user.twoFactorEnabled);
    if (write && !manage) throw new AccessError("FORBIDDEN");
    const out = await fn(c, a.organization_id, manage);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function coursesView(db: Pool, p: Principal) {
  return federation(db, p, false, async (c, fed, manage) => {
    const courses = (
      await c.query(
        `SELECT k.id,k.title,k.level,k.description,k.hours::float AS hours,k.validity_years,k.active,k.version,
                count(q.id) FILTER (WHERE q.status='approved')::int AS approved,
                count(q.id) FILTER (WHERE q.status='requested')::int AS pending
           FROM training_course k LEFT JOIN training_request q ON q.course_id=k.id
          WHERE k.federation_id=$1 GROUP BY k.id ORDER BY k.active DESC,k.title`,
        [fed],
      )
    ).rows;
    // Only what the decision needs: the coach's name and club, never contacts.
    const requests = (
      await c.query(
        `SELECT q.id,q.status,q.note,q.requested_at,q.decided_at,q.decision_note,q.completed_on::text,q.valid_until::text,
                k.title AS course,o.name AS club,cp.full_name AS coach,u.name AS requested_by
           FROM training_request q JOIN training_course k ON k.id=q.course_id JOIN organization o ON o.id=q.organization_id
           JOIN club_person cp ON cp.id=q.profile_id JOIN "user" u ON u.id=q.requested_by
          WHERE k.federation_id=$1 AND q.status<>'cancelled'
          ORDER BY (q.status='requested') DESC,q.requested_at DESC LIMIT 500`,
        [fed],
      )
    ).rows;
    return {
      organization_id: fed,
      today: brusselsToday(),
      can: { manage },
      courses,
      requests,
    };
  });
}

export async function coursesExecute(
  db: Pool,
  p: Principal,
  command: FederationCommand,
  expected: string,
) {
  return federation(
    db,
    p,
    true,
    async (c, fed) => {
      let target: string;
      const duplicate = (e: unknown) => {
        if ((e as { code?: string }).code === "23505")
          throw new AccessError("DUPLICATE", 409);
        throw e;
      };
      if (command.action === "createCourse") {
        target = (
          await c
            .query(
              "INSERT INTO training_course(federation_id,title,level,description,hours,validity_years,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
              [
                fed,
                command.title,
                command.level,
                command.description,
                command.hours,
                command.validityYears,
                p.userId,
              ],
            )
            .catch(duplicate)
        ).rows[0].id;
      } else if (command.action === "updateCourse") {
        const changed = await c
          .query(
            "UPDATE training_course SET title=$3,level=$4,description=$5,hours=$6,validity_years=$7,active=$8,version=version+1 WHERE id=$1 AND federation_id=$2 AND version=$9 RETURNING id",
            [
              command.id,
              fed,
              command.title,
              command.level,
              command.description,
              command.hours,
              command.validityYears,
              command.active,
              command.version,
            ],
          )
          .catch(duplicate);
        if (!changed.rowCount) throw new AccessError("STALE_VERSION", 409);
        target = command.id;
      } else {
        const request = (
          await c.query(
            "SELECT q.id,k.validity_years FROM training_request q JOIN training_course k ON k.id=q.course_id WHERE q.id=$1 AND k.federation_id=$2 AND q.status='requested' FOR UPDATE OF q",
            [command.id, fed],
          )
        ).rows[0];
        if (!request) throw new AccessError("NOT_FOUND", 404);
        const day = brusselsToday();
        const completed =
          command.decision === "approved" ? (command.completedOn ?? day) : null;
        if (completed && completed > day)
          throw new AccessError("INVALID_DATE", 400);
        await c.query(
          "UPDATE training_request SET status=$2,decided_by=$3,decided_at=now(),decision_note=$4,completed_on=$5,valid_until=$6 WHERE id=$1",
          [
            command.id,
            command.decision,
            p.userId,
            command.note,
            completed,
            completed ? validUntil(completed, request.validity_years) : null,
          ],
        );
        target = command.id;
      }
      await audit(c, fed, p.userId, "training." + command.action, target);
      return { ok: true as const, id: target };
    },
    expected,
  );
}
