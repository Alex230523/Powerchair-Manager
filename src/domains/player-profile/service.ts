import type { Pool } from "pg";
import { duesAccount } from "../bank/service";
import { mfaSatisfied } from "../../lib/security-policy";
import { audit, AccessError, type Principal } from "../access/service";
import {
  peopleScope,
  peopleRecords,
  peopleVisibility,
  relationAllows,
  adult,
  brusselsToday,
  type PeopleScope,
} from "../people/service";
import { ageOn } from "../people/schema";
import { docAccess, type Doc } from "../documents/access";
import { chairsFor } from "../equipment/service";
import { playerMatchStats } from "../competitions/service";
import { seal, unseal } from "../notifications/crypto";
import { logSensitiveAccess } from "../club/governance";
import { careFor, saveCare } from "../trips/service";
import {
  attendanceSummary,
  commandSchema,
  type AttendanceRow,
  type Command,
} from "./schema";
export { commandSchema };

type Records = Awaited<ReturnType<typeof peopleRecords>>;
type Visibility = ReturnType<typeof peopleVisibility>;
type Confidential = { impairment: string; medical_notes: string };
const aad = (profileId: string) => "player-health:" + profileId;

/**
 * Who may see or change each part of a player profile.
 *
 * - Identity and contacts: the person, an authorised representative, directory staff.
 * - Support needs (accompaniment, safety, emergency contact): the same people plus
 *   the player's coaches, who need them to run a session safely.
 * - Impairment and medical notes: the person, an authorised representative, and
 *   staff holding the explicit people.sensitive grant. Never shown in lists.
 * - Sport profile: everyone who can see the player; edited by team managers and
 *   the player's current coaches.
 */
function rightsFor(s: PeopleScope, all: Records, v: Visibility, id: string) {
  const profile = all.profiles.find((p) => p.id === id);
  if (!profile || !v.visibleProfiles.has(id))
    throw new AccessError("NOT_FOUND", 404);
  const mfa = mfaSatisfied(!!s.user.twoFactorEnabled);
  const own = v.own?.id === id;
  const relation = v.authorizedRelations.find(
    (r) => r.subject_profile_id === id,
  );
  const guardianEdit = !!relation && relationAllows(relation, profile, true);
  const selfAdult = own && adult(profile);
  const peopleManage = mfa && s.rights.includes("people.manage");
  const sensitive = mfa && s.context.grants.includes("people.sensitive");
  const day = brusselsToday();
  const coachOf =
    mfa &&
    s.context.role === "coach" &&
    all.assignments.some(
      (a) =>
        a.profile_id === id &&
        v.visibleTeams.has(a.team_id) &&
        !a.cancelled &&
        !a.closed_at &&
        a.starts_on <= day &&
        (!a.ends_on || a.ends_on >= day),
    );
  return {
    profile,
    own,
    guardian: !!relation,
    coachOf,
    details: v.details.has(id),
    viewSupport: v.details.has(id) || coachOf,
    editSupport: peopleManage || selfAdult || guardianEdit,
    viewConfidential: own || !!relation || (sensitive && v.full),
    editConfidential: selfAdult || guardianEdit || (sensitive && peopleManage),
    editSport:
      (mfa &&
        (s.rights.includes("teams.manage") ||
          s.rights.includes("people.manage"))) ||
      coachOf,
    editPosition: mfa && s.rights.includes("teams.manage"),
    /** Wave 17 (J1): the identity is edited in the single sheet too. */
    managePeople: peopleManage,
    viewMoney:
      own ||
      !!relation ||
      (mfa && (s.rights.includes("dues.manage") || s.rights.includes("dues.read"))),
  };
}

export async function playerProfileView(db: Pool, p: Principal, id: string) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all),
      can = rightsFor(s, all, v, id),
      profile = can.profile,
      day = brusselsToday();
    const seasons = new Map(
      (
        await c.query("SELECT id,name FROM season WHERE organization_id=$1", [
          org,
        ])
      ).rows.map((r) => [r.id as string, r.name as string]),
    );
    const teams = all.assignments
      .filter((a) => a.profile_id === id && v.visibleTeams.has(a.team_id))
      .map((a) => {
        const team = all.teams.find((t) => t.id === a.team_id);
        return {
          id: a.id,
          team_id: a.team_id,
          team: team?.name ?? "",
          team_color: (team as { color?: string | null } | undefined)?.color ?? null,
          season_id: team?.season_id ?? null,
          season: team ? (seasons.get(team.season_id) ?? "") : "",
          role: a.role,
          position: a.position,
          starts_on: a.starts_on,
          ends_on: a.ends_on,
          current:
            !a.cancelled &&
            !a.closed_at &&
            a.starts_on <= day &&
            (!a.ends_on || a.ends_on >= day),
          closed: !!a.closed_at || a.cancelled,
        };
      });
    const guardians = can.details
      ? all.relations
          .filter(
            (r) =>
              r.subject_profile_id === id &&
              !r.revoked_at &&
              (!r.ends_on || r.ends_on >= day),
          )
          .map((r) => ({
            id: r.id,
            name:
              all.profiles.find((x) => x.id === r.guardian_profile_id)
                ?.full_name ?? "",
            kind: r.kind,
            can_view: r.can_view,
            can_edit: r.can_edit,
            starts_on: r.starts_on,
          }))
      : [];

    // Attendance: coaches see only their teams' events.
    const attendance = (
      await c.query(
        `SELECT e.id,e.title,e.kind,e.status,e.team_id,e.starts_at,i.response,i.actual,(r.closed_at IS NOT NULL) AS closed,(i.withdrawn_at IS NOT NULL) AS withdrawn
           FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
          WHERE i.organization_id=$1 AND i.profile_id=$2 ORDER BY e.starts_at DESC LIMIT 400`,
        [org, id],
      )
    ).rows.filter(
      (r) =>
        v.full ||
        can.own ||
        can.guardian ||
        (r.team_id && v.visibleTeams.has(r.team_id)),
    ) as (AttendanceRow & {
      id: string;
      title: string;
      starts_at: Date;
    })[];
    const byKind = [...new Set(attendance.map((r) => r.kind))].map((kind) => ({
      kind,
      ...attendanceSummary(attendance.filter((r) => r.kind === kind)),
    }));

    const sport = (
      await c.query(
        "SELECT classification,classification_valid_until::text,control,sport_notes,version,classification_status,classification_note FROM player_sport_profile WHERE profile_id=$1 AND organization_id=$2",
        [id, org],
      )
    ).rows[0] ?? {
      classification: "not_classified",
      classification_valid_until: null,
      control: "",
      sport_notes: "",
      version: 0,
      classification_status: "unverified",
      classification_note: "",
    };
    const supportRow = (
      await c.query(
        "SELECT support_needs,safety_notes,emergency_contact,confidential_ciphertext,version FROM player_support_profile WHERE profile_id=$1 AND organization_id=$2",
        [id, org],
      )
    ).rows[0];
    const confidential: Confidential | null = can.viewConfidential
      ? supportRow?.confidential_ciphertext
        ? unseal<Confidential>(supportRow.confidential_ciphertext, aad(id))
        : { impairment: "", medical_notes: "" }
      : null;
    // Staff reading someone else's health data leaves a line in the journal.
    if (
      can.viewConfidential &&
      supportRow?.confidential_ciphertext &&
      !can.own &&
      !can.guardian
    )
      await logSensitiveAccess(c, org, s.p.userId, id, "player_health");

    const actor ={ ...s.context, twoFactorEnabled: !!s.user.twoFactorEnabled };
    const documents = [];
    for (const d of (
      await c.query(
        "SELECT *,expires_on::text AS expires_on FROM club_document WHERE organization_id=$1 AND profile_id=$2 AND status<>'archived' ORDER BY name",
        [org, id],
      )
    ).rows as Doc[])
      if (await docAccess(c, actor, d))
        documents.push({
          id: d.id,
          name: d.name,
          status: d.status,
          expires_on: d.expires_on,
          sensitive: d.sensitive,
        });

    // Care instructions travel with the support needs (coaches need them on the pitch).
    const care = can.viewSupport ? await careFor(c, org, id) : null;
    if (care?.length && !can.own && !can.guardian)
      await logSensitiveAccess(c, org, s.p.userId, id, "player_health");

    const dues = can.viewMoney
      ? (
          await c.query(
            `SELECT d.id,d.category,d.net_cents,d.status,d.reference,
                    (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents,
                    COALESCE((SELECT json_agg(json_build_object('due_on',i.due_on::text,'amount_cents',i.amount_cents,'reference',i.reference) ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id),'[]') AS installments
               FROM dues_receivable d WHERE d.organization_id=$1 AND d.profile_id=$2 AND d.status='open' ORDER BY d.created_at DESC`,
            [org, id],
          )
        ).rows
      : [];

    // B1: the club's dues account, for the transfer QR (never a proof of payment).
    const payment = dues.length ? await duesAccount(c, org) : null;
    return {
      today: day,
      payment: payment && { iban: payment.iban, bic: payment.bic, holder: payment.holder || s.context.organization_name },
      context: {
        id: org,
        name: s.context.organization_name,
        role: s.context.role,
      },
      player: {
        id,
        full_name: profile.full_name,
        status: profile.status,
        directory_roles: profile.directory_roles,
        former_roles: profile.former_roles,
        playing_position: profile.playing_position,
        jersey_number: profile.jersey_number,
        has_account: !!profile.user_id,
        version: profile.version,
        departure_status: (profile as { departure_status?: string | null }).departure_status ?? null,
        ...(can.details
          ? {
              birth_date: profile.birth_date,
              age: profile.birth_date ? ageOn(profile.birth_date, day) : null,
              email: profile.email ?? "",
              phone: profile.phone,
              joined_on: profile.joined_on,
            }
          : {}),
      },
      can: {
        details: can.details,
        viewSupport: can.viewSupport,
        editSupport: can.editSupport,
        viewConfidential: can.viewConfidential,
        editConfidential: can.editConfidential,
        editSport: can.editSport,
        editPosition: can.editPosition,
        managePeople: can.managePeople,
        viewMoney: can.viewMoney,
      },
      teams,
      // Open teams of the club, for "move to…" (wave 12): those who manage teams only.
      otherTeams: can.editPosition
        ? all.teams
            .filter((t) => !t.archived && !t.season_archived)
            .map((t) => {
              const x = t as { color?: string | null; capacity?: number | null; players?: number };
              return { id: t.id, name: t.name, season_id: t.season_id, color: x.color ?? null, capacity: x.capacity ?? null, players: x.players ?? 0 };
            })
        : [],
      guardians,
      matches: await playerMatchStats(c, org, id),
      license: ((
        await c.query(
          "SELECT status,season,number FROM license WHERE profile_id=$1 AND organization_id=$2 AND status<>'refused' ORDER BY season DESC,requested_at DESC LIMIT 1",
          [id, org],
        )
      ).rows[0] ?? null) as {
        status: string;
        season: string;
        number: string | null;
      } | null,
      attendance: {
        total: attendanceSummary(attendance),
        byKind,
        recent: attendance.slice(0, 8).map((r) => ({
          id: r.id,
          title: r.title,
          kind: r.kind,
          status: r.status,
          starts_at: r.starts_at,
          response: r.response,
          actual: r.actual,
          closed: r.closed,
          withdrawn: r.withdrawn,
        })),
      },
      sport,
      support: can.viewSupport
        ? {
            support_needs: supportRow?.support_needs ?? "",
            safety_notes: supportRow?.safety_notes ?? "",
            emergency_contact: supportRow?.emergency_contact ?? "",
          }
        : null,
      supportVersion: supportRow?.version ?? 0,
      care,
      confidential,
      chairs: await chairsFor(c, org, [id]),
      documents,
      dues,
    };
  });
}

export async function playerProfileExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expectedOrg: string,
) {
  return peopleScope(db, p, true, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    if (org !== expectedOrg) throw new AccessError("CONTEXT_CHANGED", 409);
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all),
      can = rightsFor(s, all, v, input.id);
    const forbidden = () =>
      new AccessError(
        mfaSatisfied(!!s.user.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
      );
    if (input.action === "care") {
      if (!can.editSupport) throw forbidden();
      const careId = await saveCare(c, org, p.userId, input.id, {
        id: input.careId,
        moment: input.moment,
        time: input.time,
        title: input.title,
        details: input.details,
        active: input.active,
      });
      await audit(c, org, p.userId, "player.care", input.id);
      return { id: input.id, careId };
    }
    let saved;
    if (input.action === "sport") {
      if (!can.editSport) throw forbidden();
      const values = [
        input.id,
        org,
        input.classification,
        input.classificationValidUntil,
        input.control,
        input.sportNotes,
        p.userId,
      ];
      saved =
        input.version === 0
          ? await c.query(
              "INSERT INTO player_sport_profile(profile_id,organization_id,classification,classification_valid_until,control,sport_notes,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(profile_id) DO NOTHING RETURNING version",
              values,
            )
          : await c.query(
              "UPDATE player_sport_profile SET classification_status=CASE WHEN classification IS DISTINCT FROM $3 OR classification_valid_until IS DISTINCT FROM $4::date THEN 'unverified' ELSE classification_status END,classification=$3,classification_valid_until=$4,control=$5,sport_notes=$6,updated_by=$7,version=version+1,updated_at=now() WHERE profile_id=$1 AND organization_id=$2 AND version=$8 RETURNING version",
              [...values, input.version],
            );
    } else if (input.action === "support") {
      if (!can.editSupport) throw forbidden();
      const values = [
        input.id,
        org,
        input.supportNeeds,
        input.safetyNotes,
        input.emergencyContact,
        p.userId,
      ];
      saved =
        input.version === 0
          ? await c.query(
              "INSERT INTO player_support_profile(profile_id,organization_id,support_needs,safety_notes,emergency_contact,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(profile_id) DO NOTHING RETURNING version",
              values,
            )
          : await c.query(
              "UPDATE player_support_profile SET support_needs=$3,safety_notes=$4,emergency_contact=$5,updated_by=$6,version=version+1,updated_at=now() WHERE profile_id=$1 AND organization_id=$2 AND version=$7 RETURNING version",
              [...values, input.version],
            );
    } else {
      if (!can.editConfidential) throw forbidden();
      const sealed = seal(
        { impairment: input.impairment, medical_notes: input.medicalNotes },
        aad(input.id),
      );
      saved =
        input.version === 0
          ? await c.query(
              "INSERT INTO player_support_profile(profile_id,organization_id,confidential_ciphertext,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(profile_id) DO NOTHING RETURNING version",
              [input.id, org, sealed, p.userId],
            )
          : await c.query(
              "UPDATE player_support_profile SET confidential_ciphertext=$3,updated_by=$4,version=version+1,updated_at=now() WHERE profile_id=$1 AND organization_id=$2 AND version=$5 RETURNING version",
              [input.id, org, sealed, p.userId, input.version],
            );
    }
    if (!saved.rowCount) throw new AccessError("STALE_VERSION", 409);
    // The audit records who changed which part, never the content.
    await audit(c, org, p.userId, "player." + input.action, input.id);
    return { id: input.id, version: saved.rows[0].version as number };
  });
}
