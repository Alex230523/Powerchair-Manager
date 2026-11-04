import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { publish } from "../notifications/queue";
import {
  peopleScope,
  peopleRecords,
  peopleVisibility,
  brusselsToday,
} from "../people/service";
import { ageOn } from "../people/schema";
import { teamResults } from "../competitions/service";
import { ensureStorage } from "../storage/service";
import { proofMaxBytes, proofType, safeName } from "../licences/schema";
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

/** The club file of the signed-in account in this club, if any. */
async function ownProfile(c: PoolClient, org: string, userId: string) {
  return (
    (await c.query("SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND pe.user_id=$2 LIMIT 1", [org, userId])).rows[0]
      ?.id as string | undefined
  );
}

const coachRoles = ["coach", "assistant"];
const statusText: Record<string, Record<"fr" | "nl" | "en", string>> = {
  requested: {
    fr: "nouvelle demande à traiter",
    nl: "nieuwe aanvraag te behandelen",
    en: "new request to review",
  },
  approved: { fr: "validée", nl: "gevalideerd", en: "approved" },
  refused: { fr: "refusée", nl: "geweigerd", en: "refused" },
};
/** In-app and email notice about a course request (no health or contact data). */
async function notifyTraining(
  c: PoolClient,
  input: {
    organizationId: string;
    userIds: string[];
    requestId: string;
    course: string;
    person: string;
    status: "requested" | "approved" | "refused";
    path: (locale: string) => string;
  },
) {
  if (!input.userIds.length) return;
  const organization = (
    await c.query("SELECT name FROM organization WHERE id=$1", [
      input.organizationId,
    ])
  ).rows[0]?.name as string;
  const users = (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(p.locale,'fr') AS locale FROM "user" u LEFT JOIN person p ON p.user_id=u.id WHERE u.id=ANY($1) AND u.active`,
      [input.userIds],
    )
  ).rows as {
    id: string;
    email: string;
    name: string;
    locale: "fr" | "nl" | "en";
  }[];
  for (const u of users)
    await publish(c, {
      organizationId: input.organizationId,
      userId: u.id,
      email: u.email,
      kind: "training_update",
      category: "administrative",
      resourceType: "training",
      resourceId: input.requestId,
      eventKey: `training:${input.requestId}:${input.status}`,
      locale: u.locale,
      variables: {
        name: u.name,
        organization,
        url: input.path(u.locale),
        course: input.course,
        person: input.person,
        status: statusText[input.status][u.locale],
      },
    });
}

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
    const self = v.own?.id === id;
    const canRequest = mfa && (s.rights.includes("mandates.manage") || self);
    // Wave 17 (O1): the licence and the « À faire » tab, for the coach and those who plan.
    const planner = mfa && (s.context.role === "club_president" || s.rights.includes("calendar.manage") || s.rights.includes("teams.manage"));
    const formations =
      details || canRequest
        ? (
            await c.query(
              `SELECT q.id,q.status,q.note,q.requested_at,q.decided_at,q.decision_note,q.completed_on::text,q.valid_until::text,q.proof_filename,
                      k.title,k.level,k.hours::float AS hours,f.name AS federation
                 FROM training_request q JOIN training_course k ON k.id=q.course_id JOIN organization f ON f.id=k.federation_id
                WHERE q.organization_id=$1 AND q.profile_id=$2 ORDER BY q.requested_at DESC`,
              [org, id],
            )
          ).rows
        : [];
    // A club only sees the courses of the federation it is affiliated with (the BPCF).
    const affiliation = (
      await c.query(
        "SELECT f.id,f.name FROM organization o JOIN organization f ON f.id=o.federation_id WHERE o.id=$1",
        [org],
      )
    ).rows[0] as { id: string; name: string } | undefined;
    const courses =
      canRequest && affiliation
        ? (
            await c.query(
              "SELECT k.id,k.title,k.level,k.hours::float AS hours,f.name AS federation FROM training_course k JOIN organization f ON f.id=k.federation_id WHERE k.active AND k.federation_id=$1 ORDER BY k.title",
              [affiliation.id],
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
      results: await teamResults(c, org, currentTeams),
      attendance: coachAttendance(rows),
      formations,
      courses,
      federation: affiliation?.name ?? null,
      can: { request: canRequest, licence: self || planner, tasks: self || planner, self },
    };
  });
}

export async function coachExecute(
  db: Pool,
  p: Principal,
  command: ClubCommand,
  expected: string,
  proof: { name: string; bytes: Uint8Array } | null = null,
) {
  return peopleScope(db, p, true, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    if (!mfaSatisfied(!!s.user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    // Wave 17 (O1): a coach may also ask for their own course to be validated.
    const self = await ownProfile(c, org, p.userId);
    const subject =
      command.action === "requestCourse"
        ? command.profileId
        : ((
            await c.query("SELECT profile_id FROM training_request WHERE id=$1 AND organization_id=$2", [command.id, org])
          ).rows[0]?.profile_id as string | undefined);
    if (!s.rights.includes("mandates.manage") && !(subject && subject === self))
      throw new AccessError("FORBIDDEN");
    let target: string;
    if (command.action === "requestCourse") {
      const coach = await c.query(
        "SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active' AND ('coach'=ANY(directory_roles) OR EXISTS (SELECT 1 FROM team_membership m WHERE m.profile_id=club_person.id AND m.role IN ('coach','assistant')))",
        [command.profileId, org],
      );
      if (!coach.rowCount) throw new AccessError("NOT_FOUND", 404);
      const course = (
        await c.query(
          "SELECT k.title,k.federation_id FROM training_course k JOIN organization o ON o.federation_id=k.federation_id WHERE k.id=$1 AND k.active AND o.id=$2",
          [command.courseId, org],
        )
      ).rows[0] as { title: string; federation_id: string } | undefined;
      if (!course) throw new AccessError("NOT_FOUND", 404);
      const open = await c.query(
        "SELECT 1 FROM training_request WHERE profile_id=$1 AND course_id=$2 AND status='requested'",
        [command.profileId, command.courseId],
      );
      if (open.rowCount) throw new AccessError("DUPLICATE", 409);
      // The certificate, when given: a PDF or a photo, counted in the club's storage.
      let proofFile: { name: string; type: string; bytes: Uint8Array } | null = null;
      if (proof) {
        const type = proofType(proof.bytes);
        if (!type || proof.bytes.length > proofMaxBytes) throw new AccessError("INVALID_FILE", 400);
        await ensureStorage(c, org, proof.bytes.length);
        proofFile = { name: safeName(proof.name, "attestation"), type, bytes: proof.bytes };
      }
      target = (
        await c.query(
          "INSERT INTO training_request(organization_id,profile_id,course_id,note,requested_by,proof_filename,proof_media_type,proof_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
          [org, command.profileId, command.courseId, command.note, p.userId, proofFile?.name ?? null, proofFile?.type ?? null, proofFile ? Buffer.from(proofFile.bytes) : null],
        )
      ).rows[0].id;
      const person = (
        await c.query("SELECT full_name FROM club_person WHERE id=$1", [
          command.profileId,
        ])
      ).rows[0].full_name as string;
      const presidents = (
        await c.query(
          "SELECT r.user_id FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id WHERE r.organization_id=$1 AND r.role='federation_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active",
          [course.federation_id],
        )
      ).rows.map((r) => r.user_id as string);
      await notifyTraining(c, {
        organizationId: course.federation_id,
        userIds: presidents,
        requestId: target,
        course: course.title,
        person: `${person} (${s.context.organization_name})`,
        status: "requested",
        path: (l) => `/${l}/federation/courses`,
      });
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
    // 32: the federation's courses belong to the « formations » competence.
    if (!fedCan(a.role, a.grants, "federation.courses")) throw new AccessError("FORBIDDEN");
    const manage = fedCan(a.role, a.grants, "federation.courses") && mfaSatisfied(!!user.twoFactorEnabled);
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
        `SELECT q.id,q.status,q.note,q.requested_at,q.decided_at,q.decision_note,q.completed_on::text,q.valid_until::text,q.proof_filename,
                k.title AS course,o.name AS club,cp.full_name AS coach,u.name AS requested_by
           FROM training_request q JOIN training_course k ON k.id=q.course_id JOIN organization o ON o.id=q.organization_id
           JOIN club_person cp ON cp.id=q.profile_id JOIN "user" u ON u.id=q.requested_by
          WHERE k.federation_id=$1 AND q.status<>'cancelled'
          ORDER BY (q.status='requested') DESC,q.requested_at DESC LIMIT 500`,
        [fed],
      )
    ).rows;
    // Affiliated clubs: public identity and headcounts only.
    const clubs = (
      await c.query(
        `SELECT o.id,o.name,COALESCE(o.contact_email,'') AS contact_email,
                (SELECT count(*)::int FROM club_person p WHERE p.organization_id=o.id AND p.status='active' AND 'player'=ANY(p.directory_roles) AND NOT 'player'=ANY(p.former_roles)) AS players,
                (SELECT count(*)::int FROM club_person p WHERE p.organization_id=o.id AND p.status='active' AND 'coach'=ANY(p.directory_roles) AND NOT 'coach'=ANY(p.former_roles)) AS coaches,
                (SELECT count(*)::int FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=o.id AND NOT t.archived AND NOT s.archived) AS teams
           FROM organization o WHERE o.federation_id=$1 AND o.kind='club' ORDER BY o.name`,
        [fed],
      )
    ).rows as {
      id: string;
      name: string;
      contact_email: string;
      players: number;
      coaches: number;
      teams: number;
    }[];
    return {
      organization_id: fed,
      today: brusselsToday(),
      can: { manage },
      courses,
      requests,
      clubs,
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
            "SELECT q.id,q.organization_id,q.profile_id,q.requested_by,k.title,k.validity_years,cp.full_name FROM training_request q JOIN training_course k ON k.id=q.course_id JOIN club_person cp ON cp.id=q.profile_id WHERE q.id=$1 AND k.federation_id=$2 AND q.status='requested' FOR UPDATE OF q",
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
        await notifyTraining(c, {
          organizationId: request.organization_id,
          userIds: [request.requested_by],
          requestId: target,
          course: request.title,
          person: request.full_name,
          status: command.decision,
          path: (l) => `/${l}/coaches/${request.profile_id}`,
        });
      }
      await audit(c, fed, p.userId, "training." + command.action, target);
      return { ok: true as const, id: target };
    },
    expected,
  );
}

/** Federation side: the certificate sent with a request, sandboxed by the route. */
export async function requestProof(db: Pool, p: Principal, id: string) {
  return federation(db, p, false, async (c, fed) => {
    const f = (
      await c.query(
        "SELECT q.proof_filename AS filename,q.proof_media_type AS media_type,q.proof_content AS content FROM training_request q JOIN training_course k ON k.id=q.course_id WHERE q.id=$1 AND k.federation_id=$2 AND q.proof_content IS NOT NULL",
        [id, fed],
      )
    ).rows[0] as { filename: string; media_type: string; content: Buffer } | undefined;
    if (!f) throw new AccessError("NOT_FOUND", 404);
    return f;
  });
}
