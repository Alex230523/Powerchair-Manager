import { mfaSatisfied } from "../../lib/security-policy";
import { decodeCursor, encodeCursor, PAGE_SIZE } from "../../lib/cursor";
import { Pool, type PoolClient } from "pg";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { publish } from "../notifications/queue";
import { queuePush, urgentChange } from "../notifications/push-queue";
import { manages as managesAttendance, mayRespond } from "../attendance/access";
import { docAccess, type Doc } from "../documents/access";
import {
  manager,
  coachTeam,
  canRead,
  canWrite,
  audience,
  ownProfiles,
  type Actor,
  type Event,
} from "./access";
import {
  commandSchema,
  daysBetween,
  isMonday,
  type Command,
  type EventInput,
  type Range,
} from "./schema";
import { shiftLocal, toInstant } from "./time";
import { calendarIcs } from "./ics";
import { permissions } from "../access/policy";
import { moneyDeadlinesIn } from "../funding/service";
import { groupProfiles } from "../communication/service";
import { inviteForEvent } from "../attendance/service";
import { offerUndo } from "../undo/service";
import { visibleVenue } from "../venues/schema";
import { setProgram, programOf, type ProgramItem } from "../exercises/service";
export { commandSchema };
type Scope = { c: PoolClient; p: Principal; a: Actor; name: string };
async function tx<T>(db: Pool, fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}
async function scope<T>(
  db: Pool,
  p: Principal,
  fn: (s: Scope) => Promise<T>,
  org?: string,
) {
  return tx(db, async (c) => {
    const first = await active(c, p);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      first.organization_id,
    ]);
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const a = await active(c, p),
      u = await account(c, p);
    if (
      first.organization_id !== a.organization_id ||
      (org && org !== a.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    return fn({
      c,
      p,
      a: { ...a, twoFactorEnabled: !!u.twoFactorEnabled },
      name: a.organization_name,
    });
  });
}
function needManage(s: Scope) {
  if (!manager(s.a))
    throw new AccessError(
      mfaSatisfied(!!s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
    );
}
const eventSelect = `SELECT e.*,e.starts_at::text AS cursor_at,s.interval_days,COALESCE(v.name,NULLIF(e.free_location,''),p.name) AS place_name,COALESCE(v.address,p.address) AS place_address,t.name AS team_name,t.color AS team_color,u.name AS responsible_name,et.name AS type_name,et.color AS type_color,et.family AS type_family FROM calendar_event e JOIN calendar_series s ON s.id=e.series_id LEFT JOIN event_type et ON et.id=e.event_type_id LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id LEFT JOIN team t ON t.id=e.team_id JOIN "user" u ON u.id=e.responsible_user_id`;
async function record(s: Scope, id: string) {
  const e = (
    await s.c.query(eventSelect + " WHERE e.id=$1 AND e.organization_id=$2", [
      id,
      s.a.organization_id,
    ])
  ).rows[0] as Event | undefined;
  if (!e) throw new AccessError("NOT_FOUND", 404);
  return e;
}
async function changeLog(
  s: Scope,
  e: Event,
  before: Event | null,
  action: string,
  extra: string = "",
) {
  const snapshot = async (v: Event | null) =>
    v
      ? {
          ...v,
          participants: (
            await s.c.query(
              "SELECT profile_id FROM calendar_participant WHERE event_id=$1",
              [v.id],
            )
          ).rows.map((r) => r.profile_id),
          documents: (
            await s.c.query(
              "SELECT document_id FROM calendar_document WHERE event_id=$1",
              [v.id],
            )
          ).rows.map((r) => r.document_id),
        }
      : null;
  await s.c.query(
    "INSERT INTO calendar_history(event_id,actor_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5)",
    [
      e.id,
      s.p.userId,
      action,
      JSON.stringify(before),
      JSON.stringify({ ...(await snapshot(e)), reason: extra }),
    ],
  );
  await audit(s.c, e.organization_id, s.p.userId, "calendar." + action, e.id);
}
async function notify(s: Scope, events: Event[], created = false) {
  const users = (
    await s.c.query(
      "SELECT DISTINCT u.id,u.name,u.email,COALESCE(p.locale,'fr') AS locale FROM \"user\" u JOIN role_assignment r ON r.user_id=u.id JOIN organization_membership m ON m.user_id=u.id AND m.organization_id=r.organization_id LEFT JOIN person p ON p.user_id=u.id WHERE r.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())",
      [s.a.organization_id],
    )
  ).rows;
  const batch = randomUUID();
  for (const u of users) {
    const actors = (
      await s.c.query(
        'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
        [s.a.organization_id, u.id],
      )
    ).rows as Actor[];
    let target: Event | undefined;
    for (const e of events) {
      for (const a of actors)
        if (await canRead(s.c, a, e)) {
          target = e;
          break;
        }
      if (target) break;
    }
    if (!target) continue;
    // B4: a change reaches the phone, as urgent within 48 hours (a new event comes with its invitation).
    if (!created)
      await queuePush(s.c, {
        organizationId: s.a.organization_id,
        userId: u.id,
        topic: urgentChange(target.starts_at, null) ? "urgent" : "change",
        kind: "calendar_update",
        category: "sport",
        resourceType: "calendar",
        resourceId: target.id,
        locale: u.locale,
        eventKey: "calendar:" + batch,
        url: `/${u.locale}/calendar`,
      });
    await publish(s.c, {
      organizationId: s.a.organization_id,
      userId: u.id,
      email: u.email,
      kind: "calendar_update",
      category: "sport",
      eventKey: "calendar:" + batch,
      resourceType: "calendar",
      resourceId: target.id,
      locale: u.locale,
      variables: {
        name: u.name,
        organization: s.name,
        url: process.env.BETTER_AUTH_URL + "/" + u.locale + "/calendar",
      },
    });
  }
}
function times(input: EventInput) {
  try {
    const start = toInstant(input.localStart, input.timezone, input.fold),
      end = toInstant(input.localEnd, input.timezone, input.fold);
    if (end <= start || end.getTime() - start.getTime() > 7 * 86400000)
      throw new Error("INVALID_DATE");
    return { start, end };
  } catch (e) {
    throw new AccessError(e instanceof Error ? e.message : "INVALID_DATE", 400);
  }
}
async function validate(s: Scope, input: EventInput) {
  const org = s.a.organization_id;
  if (
    [input.placeId, input.sharedVenueId, input.freeLocation].filter(Boolean)
      .length > 1
  )
    throw new AccessError("INVALID_INPUT", 400);
  if (
    input.sharedVenueId &&
    !(
      await s.c.query(`SELECT 1 FROM shared_venue v WHERE ${visibleVenue()} AND v.id=$2`, [
        org,
        input.sharedVenueId,
      ])
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
  if (
    !(await canWrite(s.c, s.a, { organization_id: org, team_id: input.teamId }))
  )
    throw new AccessError(
      mfaSatisfied(!!s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
    );
  if (
    !manager(s.a) &&
    (input.visibility !== "team" || input.responsibleId !== s.p.userId)
  )
    throw new AccessError("FORBIDDEN");
  if (input.visibility === "team" && !input.teamId)
    throw new AccessError("INVALID_INPUT", 400);
  if (input.kind === "custom" && !input.customType)
    throw new AccessError("INVALID_INPUT", 400);
  if (
    input.teamId &&
    !(
      await s.c.query(
        "SELECT 1 FROM team t JOIN season se ON se.id=t.season_id WHERE t.id=$1 AND t.organization_id=$2 AND NOT t.archived AND NOT se.archived",
        [input.teamId, org],
      )
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
  if (
    !(
      await s.c.query(
        'SELECT 1 FROM organization_membership m JOIN "user" u ON u.id=m.user_id JOIN role_assignment r ON r.user_id=m.user_id AND r.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.user_id=$2 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
        [org, input.responsibleId],
      )
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
  const profiles = (
    await s.c.query(
      "SELECT id FROM club_person WHERE organization_id=$1 AND status='active' AND id=ANY($2::uuid[])",
      [org, input.participants],
    )
  ).rows;
  if (new Set(input.participants).size !== profiles.length)
    throw new AccessError("NOT_FOUND", 404);
  if (!manager(s.a) && input.participants.length) {
    const own = (
      await s.c.query(
        "SELECT DISTINCT profile_id FROM team_membership WHERE team_id=$1 AND organization_id=$2 AND NOT cancelled AND closed_at IS NULL AND starts_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
        [input.teamId, org],
      )
    ).rows.map((r) => r.profile_id);
    if (input.participants.some((p) => !own.includes(p)))
      throw new AccessError("FORBIDDEN");
  }
  for (const id of input.documents) {
    const d = (
      await s.c.query(
        "SELECT *,expires_on::text AS expires_on FROM club_document WHERE id=$1 AND organization_id=$2",
        [id, org],
      )
    ).rows[0] as Doc | undefined;
    if (!d || !(await docAccess(s.c, s.a, d)))
      throw new AccessError("NOT_FOUND", 404);
  }
  if (
    input.placeId &&
    !(
      await s.c.query(
        "SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2 AND NOT archived",
        [input.placeId, org],
      )
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
}
async function seasonDate(s: Scope, input: EventInput) {
  if (!input.teamId) return;
  const season = (
    await s.c.query(
      "SELECT se.starts_on::text AS starts_on,se.ends_on::text AS ends_on FROM team t JOIN season se ON se.id=t.season_id WHERE t.id=$1 AND t.organization_id=$2",
      [input.teamId, s.a.organization_id],
    )
  ).rows[0];
  if (
    !season ||
    input.localStart.slice(0, 10) < season.starts_on ||
    input.localEnd.slice(0, 10) > season.ends_on
  )
    throw new AccessError("SEASON_RANGE", 409);
}
async function conflict(
  s: Scope,
  placeId: string | null,
  start: Date,
  end: Date,
  ignored: string[],
) {
  if (
    placeId &&
    (
      await s.c.query(
        "SELECT id FROM calendar_event WHERE organization_id=$1 AND place_id=$2 AND status='scheduled' AND starts_at<$4 AND ends_at>$3 AND NOT(id=ANY($5::uuid[])) LIMIT 1",
        [s.a.organization_id, placeId, start, end, ignored],
      )
    ).rowCount
  )
    throw new AccessError("PLACE_CONFLICT", 409);
}
async function links(s: Scope, id: string, input: EventInput) {
  await s.c.query("DELETE FROM calendar_participant WHERE event_id=$1", [id]);
  for (const profile of new Set(input.participants))
    await s.c.query(
      "INSERT INTO calendar_participant(event_id,organization_id,profile_id) VALUES($1,$2,$3)",
      [id, s.a.organization_id, profile],
    );
  const preserved: string[] = [];
  for (const d of (
    await s.c.query(
      "SELECT d.*,d.expires_on::text AS expires_on FROM club_document d JOIN calendar_document l ON l.document_id=d.id WHERE l.event_id=$1",
      [id],
    )
  ).rows)
    if (!(await docAccess(s.c, s.a, d))) preserved.push(d.id);
  await s.c.query("DELETE FROM calendar_document WHERE event_id=$1", [id]);
  for (const document of new Set([...input.documents, ...preserved]))
    await s.c.query(
      "INSERT INTO calendar_document(event_id,organization_id,document_id) VALUES($1,$2,$3)",
      [id, s.a.organization_id, document],
    );
}
/* ------------------------------------------- Types and invitations (wave 16, E1) */
/** The club's type: its legacy kind fills kind, its name the free type. Archived types stay on the events that have them. */
async function withType<T extends EventInput>(s: Scope, input: T, current: string | null = null): Promise<T> {
  if (!input.eventTypeId) return input;
  const t = (await s.c.query("SELECT legacy_kind,name,archived FROM event_type WHERE id=$1 AND organization_id=$2", [input.eventTypeId, s.a.organization_id])).rows[0] as
    | { legacy_kind: EventInput["kind"]; name: string; archived: boolean }
    | undefined;
  if (!t || (t.archived && current !== input.eventTypeId)) throw new AccessError("NOT_FOUND", 404);
  return { ...input, kind: t.legacy_kind, customType: t.legacy_kind === "custom" ? t.name : input.customType };
}
type InvitePlan = { invited: string[]; guardians: string[]; groups: { kind: string; ref: string | null }[]; ask: boolean; deadline: string | null };
/**
 * Who the groups chosen in the form are, today: team members, players,
 * coaches, staff, a Communication group, people one by one; parents of the
 * invited players. A coach invites within the team only.
 */
async function resolveInvite(s: Scope, input: EventInput): Promise<InvitePlan | null> {
  const inv = input.invite;
  if (!inv) return null;
  const org = s.a.organization_id,
    boss = manager(s.a);
  const invited = new Set<string>();
  const add = (ids: string[]) => ids.forEach((id) => invited.add(id));
  for (const g of inv.groups) {
    if (["players", "coaches", "staff", "group"].includes(g.kind) && !boss) throw new AccessError("FORBIDDEN");
    if (g.kind === "team") {
      const team = (await s.c.query("SELECT t.id FROM team t JOIN season se ON se.id=t.season_id WHERE t.id=$1 AND t.organization_id=$2 AND NOT t.archived AND NOT se.archived", [g.ref, org])).rows[0];
      if (!team) throw new AccessError("NOT_FOUND", 404);
      if (!boss && !(await coachTeam(s.c, s.a, g.ref))) throw new AccessError("FORBIDDEN");
      add(await groupProfiles(s.c, org, { audiences: ["players", "coaches"], team_ids: [g.ref!], profile_ids: [] }));
    } else if (g.kind === "teamCoaches") {
      if (!input.teamId) throw new AccessError("INVALID_INPUT", 400);
      add(await groupProfiles(s.c, org, { audiences: ["coaches"], team_ids: [input.teamId], profile_ids: [] }));
    } else if (g.kind === "players" || g.kind === "coaches" || g.kind === "staff") {
      add(await groupProfiles(s.c, org, { audiences: [g.kind], team_ids: [], profile_ids: [] }));
    } else if (g.kind === "group") {
      const group = (await s.c.query("SELECT audiences,team_ids,profile_ids FROM recipient_group WHERE id=$1 AND organization_id=$2 AND NOT archived", [g.ref, org])).rows[0];
      if (!group) throw new AccessError("NOT_FOUND", 404);
      add(await groupProfiles(s.c, org, group));
    } else if (g.kind === "person") invited.add(g.ref!);
  }
  const guardians = inv.groups.some((g) => g.kind === "guardians")
    ? (
        await s.c.query(
          `SELECT DISTINCT g.guardian_profile_id AS id FROM guardian_relationship g JOIN club_person c ON c.id=g.guardian_profile_id AND c.organization_id=g.organization_id
            WHERE g.organization_id=$1 AND g.subject_profile_id=ANY($2::uuid[]) AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND c.status='active'`,
          [org, [...invited]],
        )
      ).rows.map((r) => r.id as string)
    : [];
  return { invited: [...invited], guardians: guardians.filter((id) => !invited.has(id)), groups: inv.groups, ask: inv.ask, deadline: inv.deadline };
}
/** After the event is written: parents, the groups kept, the invitations with answers, the trip. */
async function afterLinks(s: Scope, e: Event, plan: InvitePlan | null, deadlineShift: number | null, tripId: string | null | undefined, exercises?: ProgramItem[]) {
  const org = s.a.organization_id;
  // Wave 16 (E2): the training's programme.
  if (exercises !== undefined) await setProgram(s.c, org, s.p.userId, e.id, exercises);
  if (plan) {
    for (const id of plan.guardians)
      await s.c.query("INSERT INTO calendar_participant(event_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [e.id, org, id]);
    await s.c.query("DELETE FROM calendar_invite_group WHERE event_id=$1", [e.id]);
    for (const g of plan.groups)
      await s.c.query("INSERT INTO calendar_invite_group(organization_id,event_id,kind,ref) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [org, e.id, g.kind, g.ref]);
    if (plan.ask && plan.invited.length) {
      const start = new Date(e.starts_at).getTime();
      // The answer is due before the start: the date asked (same distance on a series), else two hours before.
      const deadline = new Date(deadlineShift !== null ? start - deadlineShift : start - 2 * 3600000);
      await inviteForEvent(s.c, s.p, s.a, e, plan.invited, deadline);
    }
  }
  if (tripId !== undefined) {
    await s.c.query("UPDATE trip SET calendar_event_id=NULL,version=version+1 WHERE calendar_event_id=$1 AND organization_id=$2", [e.id, org]);
    if (tripId && !(await s.c.query("UPDATE trip SET calendar_event_id=$1,version=version+1 WHERE id=$2 AND organization_id=$3 RETURNING id", [e.id, tripId, org])).rowCount)
      throw new AccessError("NOT_FOUND", 404);
  }
}
async function capacity(s: Scope, e: Event) {
  if (!e.place_id) return;
  const place = (
    await s.c.query("SELECT capacity FROM calendar_place WHERE id=$1", [
      e.place_id,
    ])
  ).rows[0];
  if (
    place.capacity !== null &&
    (await audience(s.c, e)).length > place.capacity
  )
    throw new AccessError("CAPACITY_REACHED", 409);
}
async function attendanceRows(s: Scope, e: Event) {
  const manage = await managesAttendance(s.c, s.a, e);
  const rows = (
    await s.c.query(
      `SELECT c.id,c.full_name AS name,
 CASE WHEN EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=c.id AND m.team_id=$2 AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=$3::date AND (m.ends_on IS NULL OR m.ends_on>=$3::date)) OR ('coach'=ANY(c.directory_roles) AND NOT 'coach'=ANY(c.former_roles)) THEN 'coach' ELSE 'player' END AS role,
 i.response,i.actual FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN club_person c ON c.id=i.profile_id WHERE r.event_id=$1 AND i.withdrawn_at IS NULL ORDER BY c.full_name`,
      [e.id, e.team_id, e.starts_at],
    )
  ).rows;
  const result = [];
  for (const row of rows)
    if (manage || (await mayRespond(s.c, s.a, row.id))) result.push(row);
  return result;
}
export async function calendarView(db: Pool, p: Principal, range: Range) {
  const listed = range.all === "true",
    after = listed ? decodeCursor(range.after, 2) : null;
  return scope(db, p, async (s) => {
    const rows = (
      await s.c.query(
        eventSelect +
          // 13.3: a period (month, week, day) comes whole; the list of every
          // event comes a page at a time, after the cursor of the last one shown.
          " WHERE e.organization_id=$1 AND ($6::boolean OR (e.starts_at<$3::date AND e.ends_at>$2::date)) AND ($4::uuid IS NULL OR e.team_id=$4) AND ($5::uuid IS NULL OR e.place_id=$5)" +
          " AND ($7::timestamptz IS NULL OR (e.starts_at,e.id)>($7::timestamptz,$8::uuid)) ORDER BY e.starts_at,e.id" +
          (listed ? ` LIMIT ${PAGE_SIZE + 1}` : ""),
        [
          s.a.organization_id,
          range.from,
          range.to,
          range.team || null,
          range.place || null,
          listed,
          ...(after ?? [null, null]),
        ],
      )
    ).rows as (Event & {
      cursor_at: string;
      place_name: string | null;
      place_address: string | null;
      team_name: string | null;
      team_color: string | null;
      responsible_name: string;
      type_name: string | null;
      type_color: string | null;
      type_family: string | null;
      event_type_id: string | null;
    })[];
    const events = [];
    const own = await ownProfiles(s.c, s.a);
    const shown = listed ? rows.slice(0, PAGE_SIZE) : rows;
    for (const e of shown) {
      if (!(await canRead(s.c, s.a, e))) continue;
      const staff = manager(s.a) || (await coachTeam(s.c, s.a, e.team_id));
      const docs = [];
      for (const d of (
        await s.c.query(
          "SELECT d.*,d.expires_on::text AS expires_on FROM club_document d JOIN calendar_document l ON l.document_id=d.id WHERE l.event_id=$1",
          [e.id],
        )
      ).rows) {
        if (await docAccess(s.c, s.a, d))
          docs.push({
            id: d.id,
            name: d.name,
            versionId: d.current_version_id,
          });
      }
      events.push({
        ...e,
        canEdit: await canWrite(s.c, s.a, e),
        participants: (await audience(s.c, e))
          .filter((p) => staff || own.has(p.id))
          .map((p) => ({ id: p.id, name: p.full_name })),
        explicitParticipants: staff
          ? (
              await s.c.query(
                "SELECT profile_id FROM calendar_participant WHERE event_id=$1",
                [e.id],
              )
            ).rows.map((r) => r.profile_id as string)
          : [],
        attendance: await attendanceRows(s, e),
        documents: docs,
        // Wave 16 (E2): the programme; players see titles and minutes, staff the coach's notes too.
        program: await programOf(s.c, e.id, staff),
        // Wave 16 (E1): the groups invited (to edit them), the register (to remind), the linked trip.
        inviteGroups: staff ? (await s.c.query("SELECT kind,ref FROM calendar_invite_group WHERE event_id=$1 ORDER BY kind,ref", [e.id])).rows as { kind: string; ref: string | null }[] : [],
        register: staff
          ? (((await s.c.query("SELECT id,version,deadline,closed_at IS NOT NULL AS closed,reminder_sent_at FROM attendance_register WHERE event_id=$1", [e.id])).rows[0] ?? null) as {
              id: string;
              version: number;
              deadline: string;
              closed: boolean;
              reminder_sent_at: string | null;
            } | null)
          : null,
        trip: ((
          await s.c.query(
            `SELECT t.id,t.title,t.status,t.departure_at,t.meeting_point,
                    (SELECT count(*)::int FROM trip_vehicle v WHERE v.trip_id=t.id) AS vehicles
               FROM trip t WHERE t.calendar_event_id=$1 AND t.organization_id=$2 AND t.status<>'cancelled' LIMIT 1`,
            [e.id, s.a.organization_id],
          )
        ).rows[0] ?? null) as { id: string; title: string; status: string; departure_at: string | null; meeting_point: string; vehicles: number } | null,
        history: staff
          ? (
              await s.c.query(
                'SELECT h.id,h.action,h.before_data,h.after_data,h.created_at,u.name AS actor FROM calendar_history h JOIN "user" u ON u.id=h.actor_id WHERE event_id=$1 ORDER BY h.created_at,h.id',
                [e.id],
              )
            ).rows
          : [],
      });
    }
    const teams = [];
    for (const team of (
      await s.c.query(
        "SELECT t.id,t.name,t.season_id,t.color FROM team t JOIN season se ON se.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT se.archived",
        [s.a.organization_id],
      )
    ).rows) {
      if (
        manager(s.a) ||
        (await coachTeam(s.c, s.a, team.id)) ||
        (
          await s.c.query(
            "SELECT 1 FROM team_membership WHERE team_id=$1 AND profile_id=ANY($2::uuid[]) AND NOT cancelled AND closed_at IS NULL AND starts_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
            [team.id, [...own]],
          )
        ).rowCount
      )
        teams.push({ id: team.id as string, name: team.name as string, color: (team.color ?? null) as string | null });
    }
    const canPlan =
      manager(s.a) ||
      (mfaSatisfied(!!s.a.twoFactorEnabled) &&
        teams.length > 0 &&
        s.a.role === "coach");
    const coachProfiles = new Set(
      (
        await s.c.query(
          "SELECT DISTINCT profile_id FROM team_membership WHERE team_id=ANY($1::uuid[]) AND organization_id=$2 AND NOT cancelled AND closed_at IS NULL AND starts_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
          [teams.map((t) => t.id), s.a.organization_id],
        )
      ).rows.map((r) => r.profile_id),
    );
    const documentOptions: { id: string; name: string; category: string }[] =
      [];
    if (canPlan)
      for (const d of (
        await s.c.query(
          "SELECT *,expires_on::text AS expires_on FROM club_document WHERE organization_id=$1 AND status<>'archived' ORDER BY updated_at DESC LIMIT 200",
          [s.a.organization_id],
        )
      ).rows)
        if (await docAccess(s.c, s.a, d))
          documentOptions.push({
            id: d.id,
            name: d.name,
            category: d.category,
          });
    return {
      next: listed && rows.length > PAGE_SIZE ? encodeCursor([shown[shown.length - 1].cursor_at, shown[shown.length - 1].id]) : null,
      sharedVenues: (
        await s.c.query(
          // Wave 17 (C4): the validated halls of the federation, and those this club proposed.
          `SELECT v.id,v.name,v.address,v.category FROM shared_venue v WHERE ${visibleVenue()} ORDER BY v.category,v.name,v.id`,
          [s.a.organization_id],
        )
      ).rows,
      documentOptions,
      context: {
        organization_id: s.a.organization_id,
        name: s.name,
        user_id: s.p.userId,
        role: s.a.role,
      },
      manage: manager(s.a),
      canPlan,
      // Wave 16 (E1): the club's types, Communication groups and trips to link, for the form.
      eventTypes: (
        await s.c.query(
          "SELECT id,name,family,legacy_kind,color,icon,ask_response,default_groups,register,archived,position,version,(SELECT count(*)::int FROM calendar_event e WHERE e.event_type_id=t.id) AS used FROM event_type t WHERE organization_id=$1 ORDER BY archived,position,name",
          [s.a.organization_id],
        )
      ).rows as {
        id: string;
        name: string;
        family: "training" | "match" | "meeting" | "other";
        legacy_kind: string;
        color: string;
        icon: string;
        ask_response: boolean;
        default_groups: string[];
        register: boolean;
        archived: boolean;
        position: number;
        version: number;
        used: number;
      }[],
      // Wave 16 (E2): the sheets the planner may put in a training.
      exerciseOptions: canPlan
        ? ((
            await s.c.query(
              "SELECT id,title,duration_minutes,objective FROM exercise WHERE organization_id=$1 AND NOT archived AND (shared OR author_id=$2) ORDER BY lower(title) LIMIT 300",
              [s.a.organization_id, s.p.userId],
            )
          ).rows as { id: string; title: string; duration_minutes: number; objective: string }[])
        : [],
      recipientGroups: manager(s.a)
        ? ((await s.c.query("SELECT id,name FROM recipient_group WHERE organization_id=$1 AND NOT archived ORDER BY name", [s.a.organization_id])).rows as { id: string; name: string }[])
        : [],
      trips: canPlan
        ? ((
            await s.c.query(
              "SELECT id,title,starts_on::text AS starts_on,calendar_event_id FROM trip WHERE organization_id=$1 AND status IN ('planned','confirmed') AND ends_on>=CURRENT_DATE-1 ORDER BY starts_on LIMIT 100",
              [s.a.organization_id],
            )
          ).rows as { id: string; title: string; starts_on: string; calendar_event_id: string | null }[])
        : [],
      // Modules the club switched off: the page hides their buttons (wave 11).
      offModules: (s.a as { disabled_modules?: string[] }).disabled_modules ?? [],
      range,
      events,
      teams,
      places: (
        await s.c.query(
          "SELECT * FROM calendar_place WHERE organization_id=$1 ORDER BY name",
          [s.a.organization_id],
        )
      ).rows,
      profiles: canPlan
        ? (
            await s.c.query(
              "SELECT c.id,c.full_name FROM club_person c WHERE c.organization_id=$1 AND c.status='active' ORDER BY c.full_name",
              [s.a.organization_id],
            )
          ).rows.filter((r) => manager(s.a) || coachProfiles.has(r.id))
        : [],
      responsibles: manager(s.a)
        ? (
            await s.c.query(
              'SELECT DISTINCT u.id,u.name FROM "user" u JOIN organization_membership m ON m.user_id=u.id JOIN role_assignment r ON r.user_id=u.id AND r.organization_id=m.organization_id WHERE m.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) ORDER BY u.name',
              [s.a.organization_id],
            )
          ).rows
        : [{ id: s.p.userId, name: (await account(s.c, s.p)).name }],
      // 2: the meetings of the tasks given to me in this period (« a lieu le »).
      meetings: (
        await s.c.query(
          `SELECT DISTINCT t.id,t.title,t.meeting_starts_at,t.meeting_ends_at,COALESCE(pl.name,sv.name,NULLIF(t.free_location,'')) AS place FROM task t JOIN task_assignee a ON a.task_id=t.id
             LEFT JOIN calendar_place pl ON pl.id=t.place_id LEFT JOIN shared_venue sv ON sv.id=t.shared_venue_id
            WHERE t.organization_id=$1 AND t.status<>'done' AND t.meeting_starts_at IS NOT NULL AND t.meeting_starts_at<$4::date AND COALESCE(t.meeting_ends_at,t.meeting_starts_at)>=$3::date
              AND (a.user_id=$2 OR a.profile_id=ANY($5::uuid[])) ORDER BY t.meeting_starts_at LIMIT 50`,
          [s.a.organization_id, s.p.userId, range.from, range.to, [...own]],
        )
      ).rows as { id: string; title: string; meeting_starts_at: string; meeting_ends_at: string | null; place: string | null }[],
      feeds: (
        await s.c.query(
          "SELECT id,name,team_id,only_mine,include_money,created_at,expires_at,revoked_at FROM calendar_feed WHERE organization_id=$1 AND user_id=$2 AND mandate_id=$3 ORDER BY created_at DESC",
          [s.a.organization_id, s.p.userId, s.a.id],
        )
      ).rows,
    };
  });
}
/** Settings > Activities (wave 16, E1): the club's event types. */
export async function eventTypesView(db: Pool, p: Principal) {
  return scope(db, p, async (s) => {
    needManage(s);
    return {
      organization_id: s.a.organization_id,
      types: (
        await s.c.query(
          "SELECT id,name,family,color,icon,ask_response,default_groups,register,archived,position,version,(SELECT count(*)::int FROM calendar_event e WHERE e.event_type_id=t.id) AS used FROM event_type t WHERE organization_id=$1 ORDER BY archived,position,name",
          [s.a.organization_id],
        )
      ).rows as {
        id: string;
        name: string;
        family: "training" | "match" | "meeting" | "other";
        color: string;
        icon: string;
        ask_response: boolean;
        default_groups: string[];
        register: boolean;
        archived: boolean;
        position: number;
        version: number;
        used: number;
      }[],
    };
  });
}
export async function calendarCopyWeek(
  db: Pool,
  p: Principal,
  input: Extract<Command, { action: "copyWeek" }>,
  expectedOrg: string,
) {
  return scope(db, p, (s) => copyWeek(s, input), expectedOrg);
}
export async function calendarExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expectedOrg: string,
) {
  return scope(
    db,
    p,
    async (s) => {
      // Week copies go through calendarCopyWeek (their own result).
      if (input.action === "copyWeek") throw new AccessError("INVALID_INPUT", 400);
      if (input.action === "place") {
        needManage(s);
        if (input.id) {
          const old = (
            await s.c.query(
              "SELECT * FROM calendar_place WHERE id=$1 AND organization_id=$2 FOR UPDATE",
              [input.id, s.a.organization_id],
            )
          ).rows[0];
          if (!old) throw new AccessError("NOT_FOUND", 404);
          if (old.version !== input.expectedVersion)
            throw new AccessError("STALE_VERSION", 409);
          const affected = (
            await s.c.query(
              eventSelect +
                " WHERE e.place_id=$1 AND e.status='scheduled' AND e.ends_at>now()",
              [input.id],
            )
          ).rows as Event[];
          if (input.capacity !== null)
            for (const e of affected)
              if ((await audience(s.c, e)).length > input.capacity)
                throw new AccessError("CAPACITY_REACHED", 409);
          await s.c.query(
            "UPDATE calendar_place SET name=$2,address=$3,contact=$4,capacity=$5,cost_cents=$6,accessible=$7,toilets=$8,parking=$9,storage=$10,charging=$11,logistics=$12,archived=$13,version=version+1 WHERE id=$1",
            [
              input.id,
              input.name,
              input.address,
              input.contact,
              input.capacity,
              input.costCents,
              input.accessible,
              input.toilets,
              input.parking,
              input.storage,
              input.charging,
              input.logistics,
              input.archived,
            ],
          );
          if (
            old.name !== input.name ||
            old.address !== input.address ||
            old.logistics !== input.logistics ||
            old.archived !== input.archived
          ) {
            const changed: Event[] = [];
            for (const before of affected) {
              await s.c.query(
                "UPDATE calendar_event SET version=version+1,updated_at=now() WHERE id=$1",
                [before.id],
              );
              const after = await record(s, before.id);
              await changeLog(s, after, before, "venue.updated");
              changed.push(after);
            }
            if (changed.length) await notify(s, changed);
          }
          await audit(
            s.c,
            s.a.organization_id,
            p.userId,
            "calendar.place",
            input.id,
          );
          return { id: input.id };
        }
        const r = (
          await s.c.query(
            "INSERT INTO calendar_place(organization_id,name,address,contact,capacity,cost_cents,accessible,toilets,parking,storage,charging,logistics,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
            [
              s.a.organization_id,
              input.name,
              input.address,
              input.contact,
              input.capacity,
              input.costCents,
              input.accessible,
              input.toilets,
              input.parking,
              input.storage,
              input.charging,
              input.logistics,
              input.archived,
            ],
          )
        ).rows[0];
        await audit(s.c, s.a.organization_id, p.userId, "calendar.place", r.id);
        return { id: r.id };
      }
      if (input.action === "feed") {
        if (
          input.teamId &&
          !(
            await s.c.query(
              "SELECT 1 FROM team WHERE id=$1 AND organization_id=$2",
              [input.teamId, s.a.organization_id],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        const token = randomBytes(32).toString("base64url"),
          id = (
            await s.c.query(
              "INSERT INTO calendar_feed(organization_id,user_id,mandate_id,token_hash,name,team_id,include_money,only_mine,family) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
              [
                s.a.organization_id,
                p.userId,
                s.a.id,
                createHash("sha256").update(token).digest("hex"),
                input.name,
                input.family ? null : input.teamId,
                !input.family && !!input.includeMoney,
                !!input.family || (!!input.mine && !input.teamId),
                !!input.family,
              ],
            )
          ).rows[0].id;
        await audit(s.c, s.a.organization_id, p.userId, "calendar.feed", id);
        return {
          id,
          url: process.env.BETTER_AUTH_URL + "/api/calendar/feed/" + token,
        };
      }
      if (input.action === "renewFeed") {
        // Same choices, a new secret: the old link stops at once (C9).
        const old = (
          await s.c.query(
            "UPDATE calendar_feed SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND mandate_id=$4 RETURNING name,team_id,include_money,only_mine,family",
            [input.id, s.a.organization_id, p.userId, s.a.id],
          )
        ).rows[0];
        if (!old) throw new AccessError("NOT_FOUND", 404);
        const token = randomBytes(32).toString("base64url"),
          id = (
            await s.c.query(
              "INSERT INTO calendar_feed(organization_id,user_id,mandate_id,token_hash,name,team_id,include_money,only_mine,family) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
              [s.a.organization_id, p.userId, s.a.id, createHash("sha256").update(token).digest("hex"), old.name, old.team_id, old.include_money, old.only_mine, old.family],
            )
          ).rows[0].id;
        await audit(s.c, s.a.organization_id, p.userId, "calendar.feed.renewed", id);
        return { id, url: process.env.BETTER_AUTH_URL + "/api/calendar/feed/" + token };
      }
      if (input.action === "revokeFeed") {
        const changed = await s.c.query(
          "UPDATE calendar_feed SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND mandate_id=$4 RETURNING id",
          [input.id, s.a.organization_id, p.userId, s.a.id],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(
          s.c,
          s.a.organization_id,
          p.userId,
          "calendar.feed.revoked",
          input.id,
        );
        return { id: input.id };
      }
      if (input.action === "create") {
        const previous = (
          await s.c.query(
            "SELECT organization_id,created_by FROM calendar_series WHERE id=$1",
            [input.requestId],
          )
        ).rows[0];
        if (previous) {
          if (
            previous.organization_id !== s.a.organization_id ||
            previous.created_by !== p.userId
          )
            throw new AccessError("NOT_FOUND", 404);
          return {
            id: (
              await s.c.query(
                "SELECT id FROM calendar_event WHERE series_id=$1 ORDER BY ordinal LIMIT 1",
                [input.requestId],
              )
            ).rows[0].id,
          };
        }
        if (input.intervalDays === 0 && input.occurrences !== 1)
          throw new AccessError("INVALID_INPUT", 400);
        // Wave 16 (E1): the club's type, and the people the chosen groups stand for.
        const typed = await withType(s, input);
        const plan = await resolveInvite(s, typed);
        const base = plan ? { ...typed, participants: [...new Set([...typed.participants, ...plan.invited])] } : typed;
        await validate(s, base);
        if (input.dates && (input.intervalDays !== 7 || input.dates.length !== input.occurrences || input.localEnd.slice(0, 10) !== input.localStart.slice(0, 10)))
          throw new AccessError("INVALID_INPUT", 400);
        const schedule = input.dates
          ? // H9: the days of the season plan, each at the slot's time.
            [...input.dates].sort().map((d) => ({ ...base, localStart: d + input.localStart.slice(10), localEnd: d + input.localEnd.slice(10) }))
          : Array.from({ length: input.occurrences }, (_, i) => ({
              ...base,
              localStart: shiftLocal(input.localStart, i * input.intervalDays),
              localEnd: shiftLocal(input.localEnd, i * input.intervalDays),
            }));
        for (const item of schedule) await seasonDate(s, item);
        const instants = schedule.map(times);
        for (const t of instants)
          await conflict(s, input.placeId, t.start, t.end, []);
        for (let i = 1; i < instants.length; i++)
          if (instants[i].start < instants[i - 1].end)
            throw new AccessError("PLACE_CONFLICT", 409);
        await s.c.query(
          "INSERT INTO calendar_series(id,organization_id,interval_days,occurrences,created_by) VALUES($1,$2,$3,$4,$5)",
          [
            input.requestId,
            s.a.organization_id,
            input.intervalDays,
            input.occurrences,
            p.userId,
          ],
        );
        const events: Event[] = [];
        for (const [i, item] of schedule.entries()) {
          const e = (
            await s.c.query(
              "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,custom_type,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility,equipment,instructions,shared_venue_id,free_location,highlight) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *",
              [
                s.a.organization_id,
                input.requestId,
                i,
                item.title,
                item.kind,
                item.customType,
                item.timezone,
                instants[i].start,
                instants[i].end,
                item.localStart,
                item.localEnd,
                item.teamId,
                item.placeId,
                item.responsibleId,
                item.visibility,
                item.equipment,
                item.instructions,
                item.sharedVenueId ?? null,
                item.freeLocation ?? "",
                !!input.highlight,
              ],
            )
          ).rows[0] as Event;
          if (typed.eventTypeId !== undefined) await s.c.query("UPDATE calendar_event SET event_type_id=$2 WHERE id=$1", [e.id, typed.eventTypeId]);
          await links(s, e.id, item);
          await afterLinks(s, e, plan, plan?.deadline ? instants[0].start.getTime() - Date.parse(plan.deadline) : null, i === 0 ? input.tripId : undefined, input.exercises);
          await capacity(s, e);
          await changeLog(s, e, null, "created");
          events.push(e);
        }
        await notify(s, events, true);
        return { id: events[0].id };
      }
      if (input.action === "eventType") {
        // Settings > Activities (wave 16, E1): the club's types; a used type is archived, never deleted.
        needManage(s);
        const org = s.a.organization_id;
        const legacy: Record<string, EventInput["kind"]> = { training: "training", match: "friendly", meeting: "meeting", other: "custom" };
        const values = [input.name, input.family, input.color, input.icon, input.askResponse, input.defaultGroups, input.register, input.archived];
        try {
          if (input.id) {
            const r = await s.c.query(
              `UPDATE event_type SET name=$3,family=$4,color=$5,icon=$6,ask_response=$7,default_groups=$8,register=$9,archived=$10,
                      legacy_kind=CASE WHEN family=$4 THEN legacy_kind ELSE $12 END,version=version+1
                WHERE id=$1 AND organization_id=$2 AND version=$11 RETURNING id`,
              [input.id, org, ...values, input.expectedVersion ?? 0, legacy[input.family]],
            );
            if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
            // Events keep their kind in step with the type's family.
            await s.c.query("UPDATE calendar_event SET kind=t.legacy_kind,custom_type=CASE WHEN t.legacy_kind='custom' THEN t.name ELSE '' END FROM event_type t WHERE t.id=$1 AND calendar_event.event_type_id=t.id", [input.id]);
            await audit(s.c, org, p.userId, "calendar.eventType", input.id);
            return { id: input.id };
          }
          const id = (
            await s.c.query(
              `INSERT INTO event_type(organization_id,name,family,color,icon,ask_response,default_groups,register,archived,legacy_kind,position)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT COALESCE(max(position),0)+1 FROM event_type WHERE organization_id=$1)) RETURNING id`,
              [org, ...values, legacy[input.family]],
            )
          ).rows[0].id as string;
          await audit(s.c, org, p.userId, "calendar.eventType", id);
          return { id };
        } catch (e) {
          if ((e as { code?: string }).code === "23505") throw new AccessError("TYPE_EXISTS", 409);
          throw e;
        }
      }
      if (input.action === "previewInvite") {
        if (!manager(s.a) && !(await coachTeam(s.c, s.a, input.teamId))) throw new AccessError("FORBIDDEN");
        const plan = await resolveInvite(s, { teamId: input.teamId, invite: input.invite } as EventInput);
        const ids = [...(plan?.invited ?? []), ...(plan?.guardians ?? [])];
        const people = (await s.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY full_name", [s.a.organization_id, ids])).rows as {
          id: string;
          full_name: string;
        }[];
        return { id: "preview", people: people.map((x) => x.full_name), count: people.length };
      }
      if (input.action === "createTrip") {
        const e = await record(s, input.eventId);
        if (!(await canWrite(s.c, s.a, e))) throw new AccessError("FORBIDDEN");
        if ((s.a as { disabled_modules?: string[] }).disabled_modules?.includes("trips")) throw new AccessError("MODULE_OFF");
        const day = e.local_start.slice(0, 10),
          end = e.local_end.slice(0, 10);
        const family = (e as Event & { type_family?: string }).type_family;
        const place = e as Event & { place_name?: string | null; place_address?: string | null };
        const trip = (
          await s.c.query(
            // 3: one day is a transport, several days a stay.
            "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,destination,place_id,created_by,calendar_event_id,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $5::date>$4::date THEN 'stay' ELSE 'transport' END) RETURNING id",
            [
              s.a.organization_id,
              e.title.slice(0, 120),
              e.kind === "tournament" ? "tournament" : family === "match" ? "away_match" : e.kind === "camp" ? "camp" : "other",
              day,
              end < day ? day : end,
              [place.place_name, place.place_address].filter(Boolean).join(" · ").slice(0, 300),
              e.place_id,
              p.userId,
              e.id,
            ],
          )
        ).rows[0].id as string;
        await audit(s.c, s.a.organization_id, p.userId, "trip.created", trip);
        return { id: trip };
      }
      if (input.action === "eventTypeOrder") {
        needManage(s);
        for (const [i, id] of input.ids.entries())
          await s.c.query("UPDATE event_type SET position=$3 WHERE id=$1 AND organization_id=$2", [id, s.a.organization_id, i + 1]);
        return { id: input.ids[0] };
      }
      if (input.action === "delete") {
        // Wave 16 (E1): only an event nobody answered, without attendance taken nor match; otherwise cancel it.
        const e = await record(s, input.id);
        if (!(await canWrite(s.c, s.a, e))) throw new AccessError("FORBIDDEN");
        if (e.version !== input.expectedVersion) throw new AccessError("STALE_VERSION", 409);
        const used = (
          await s.c.query(
            `SELECT EXISTS(SELECT 1 FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1 AND (i.response<>'none' OR i.actual<>'unchecked'))
                 OR EXISTS(SELECT 1 FROM attendance_register r WHERE r.event_id=$1 AND r.closed_at IS NOT NULL)
                 OR EXISTS(SELECT 1 FROM match m WHERE m.calendar_event_id=$1)
                 OR EXISTS(SELECT 1 FROM event_mail m WHERE m.event_id=$1) AS used`,
            [e.id],
          )
        ).rows[0].used as boolean;
        if (used) throw new AccessError("EVENT_IN_USE", 409);
        const register = (await s.c.query("SELECT id FROM attendance_register WHERE event_id=$1", [e.id])).rows[0]?.id;
        if (register) {
          await s.c.query("DELETE FROM attendance_history WHERE register_id=$1", [register]);
          await s.c.query("DELETE FROM attendance_invitation WHERE register_id=$1", [register]);
          await s.c.query("DELETE FROM attendance_register WHERE id=$1", [register]);
        }
        await s.c.query("UPDATE trip SET calendar_event_id=NULL,version=version+1 WHERE calendar_event_id=$1", [e.id]);
        await s.c.query("UPDATE calendar_event SET copied_from=NULL WHERE copied_from=$1", [e.id]);
        for (const table of ["calendar_invite_group", "calendar_participant", "calendar_document", "calendar_history"])
          await s.c.query(`DELETE FROM ${table} WHERE event_id=$1`, [e.id]);
        await s.c.query("DELETE FROM calendar_event WHERE id=$1 AND organization_id=$2", [e.id, s.a.organization_id]);
        await audit(s.c, s.a.organization_id, p.userId, "calendar.deleted", e.id, { title: e.title, local_start: e.local_start });
        return { id: e.id };
      }
      const anchor = await record(s, input.id);
      if (!(await canWrite(s.c, s.a, anchor)))
        throw new AccessError(
          mfaSatisfied(!!s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
        );
      if (anchor.version !== input.expectedVersion)
        throw new AccessError("STALE_VERSION", 409);
      const targets =
        input.scope === "one"
          ? [anchor]
          : ((
              await s.c.query(
                eventSelect +
                  " WHERE e.series_id=$1 AND ($2='all' OR e.ordinal>=$3) AND ($4 OR (e.status='scheduled' AND (NOT e.is_exception OR e.id=$5))) ORDER BY e.ordinal",
                [
                  anchor.series_id,
                  input.scope,
                  anchor.ordinal,
                  input.action === "cancel",
                  anchor.id,
                ],
              )
            ).rows as Event[]);
      for (const target of targets) {
        if (!(await canWrite(s.c, s.a, target)))
          throw new AccessError("FORBIDDEN");
        if (input.scope !== "one" && target.starts_at < new Date())
          throw new AccessError("PAST_SERIES", 409);
      }
      const changed: Event[] = [];
      if (input.action === "cancel") {
        for (const target of targets) {
          if (target.status === "cancelled") continue;
          const e = (
            await s.c.query(
              "UPDATE calendar_event SET status='cancelled',is_exception=CASE WHEN $2 THEN true ELSE is_exception END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [target.id, input.scope === "one"],
            )
          ).rows[0] as Event;
          await changeLog(s, e, target, "cancelled", input.reason);
          changed.push(e);
        }
        if (changed.length) {
          await notify(s, changed);
          // Undo (wave 15, C10), for 8 seconds on screen: the events come back as they were.
          const undo = await offerUndo(s.c, s.a.organization_id, p.userId, "eventCancel", anchor.id, { ids: changed.map((e) => e.id) });
          return { id: anchor.id, undo };
        }
      } else {
        if (anchor.status === "cancelled")
          throw new AccessError("INVALID_TRANSITION", 409);
        const typed = await withType(s, input, (anchor as Event & { event_type_id?: string | null }).event_type_id ?? null);
        const plan = await resolveInvite(s, typed);
        const base = plan ? { ...typed, participants: [...new Set([...typed.participants, ...plan.invited])] } : typed;
        await validate(s, base);
        const planned = targets.map((e) => ({
          e,
          input: {
            ...base,
            localStart: shiftLocal(
              input.localStart,
              (e.ordinal - anchor.ordinal) * (anchor.interval_days ?? 0),
            ),
            localEnd: shiftLocal(
              input.localEnd,
              (e.ordinal - anchor.ordinal) * (anchor.interval_days ?? 0),
            ),
          },
        }));
        const schedule = planned.map((v) => ({ ...v, time: times(v.input) }));
        for (const v of schedule) await seasonDate(s, v.input);
        for (const v of schedule)
          await conflict(
            s,
            v.input.placeId,
            v.time.start,
            v.time.end,
            targets.map((e) => e.id),
          );
        for (let i = 0; i < schedule.length; i++)
          for (let j = i + 1; j < schedule.length; j++)
            if (
              schedule[i].input.placeId &&
              schedule[i].input.placeId === schedule[j].input.placeId &&
              schedule[i].time.start < schedule[j].time.end &&
              schedule[i].time.end > schedule[j].time.start
            )
              throw new AccessError("PLACE_CONFLICT", 409);
        for (const { e: old, input: item, time } of schedule) {
          const before = {
            ...old,
            participants: (
              await s.c.query(
                "SELECT profile_id FROM calendar_participant WHERE event_id=$1",
                [old.id],
              )
            ).rows.map((r) => r.profile_id),
            documents: (
              await s.c.query(
                "SELECT document_id FROM calendar_document WHERE event_id=$1",
                [old.id],
              )
            ).rows.map((r) => r.document_id),
          };
          const e = (
            await s.c.query(
              "UPDATE calendar_event SET title=$2,kind=$3,custom_type=$4,timezone=$5,starts_at=$6,ends_at=$7,local_start=$8,local_end=$9,team_id=$10,place_id=$11,responsible_user_id=$12,visibility=$13,equipment=$14,instructions=$15,shared_venue_id=$17,free_location=$18,highlight=COALESCE($19,highlight),is_exception=CASE WHEN $16 THEN true ELSE is_exception END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [
                old.id,
                item.title,
                item.kind,
                item.customType,
                item.timezone,
                time.start,
                time.end,
                item.localStart,
                item.localEnd,
                item.teamId,
                item.placeId,
                item.responsibleId,
                item.visibility,
                item.equipment,
                item.instructions,
                input.scope === "one",
                item.sharedVenueId ?? null,
                item.freeLocation ?? "",
                input.highlight ?? null,
              ],
            )
          ).rows[0] as Event;
          if (typed.eventTypeId !== undefined) await s.c.query("UPDATE calendar_event SET event_type_id=$2 WHERE id=$1", [e.id, typed.eventTypeId]);
          await links(s, e.id, item);
          await afterLinks(s, e, plan, plan?.deadline ? time.start.getTime() - Date.parse(plan.deadline) : null, old.id === anchor.id ? input.tripId : undefined, input.exercises);
          await capacity(s, e);
          await changeLog(s, e, before, "updated");
          changed.push(e);
        }
      }
      if (changed.length) await notify(s, changed);
      return { id: anchor.id };
    },
    expectedOrg,
  );
}
/**
 * Copies a week of the calendar (wave 9). Each copied event goes through the
 * same checks as a new one; an event that cannot be copied (place taken,
 * outside the season, not yours) is skipped and reported, the others are kept.
 */
async function copyWeek(
  s: Scope,
  input: Extract<Command, { action: "copyWeek" }>,
) {
  if (!isMonday(input.fromMonday) || !isMonday(input.toMonday))
    throw new AccessError("INVALID_DATE", 400);
  const shift = daysBetween(input.fromMonday, input.toMonday);
  if (shift === 0 || Math.abs(shift) > 371)
    throw new AccessError("INVALID_DATE", 400);
  const org = s.a.organization_id;
  const done = (
    await s.c.query(
      "SELECT count(e.id)::int AS n,min(s.created_by) AS created_by FROM calendar_series s LEFT JOIN calendar_event e ON e.series_id=s.id WHERE s.copy_request=$1 AND s.organization_id=$2",
      [input.requestId, org],
    )
  ).rows[0];
  if (done.created_by) {
    if (done.created_by !== s.p.userId) throw new AccessError("NOT_FOUND", 404);
    return { created: done.n as number, skipped: [] };
  }
  const end = shiftLocal(input.fromMonday + "T00:00", 7).slice(0, 10);
  const sources = (
    await s.c.query(
      eventSelect +
        " WHERE e.organization_id=$1 AND e.status='scheduled' AND left(e.local_start,10)>=$2 AND left(e.local_start,10)<$3 AND ($4::uuid IS NULL OR e.team_id=$4) ORDER BY e.starts_at,e.id",
      [org, input.fromMonday, end, input.teamId],
    )
  ).rows as (Event & { shared_venue_id: string | null; free_location: string })[];
  if (!sources.length) throw new AccessError("NOTHING_TO_COPY", 409);
  const created: Event[] = [],
    skipped: { title: string; local_start: string; reason: string }[] = [];
  for (const [n, e] of sources.entries()) {
    if (!(await canWrite(s.c, s.a, e))) {
      skipped.push({ title: e.title, local_start: e.local_start, reason: "FORBIDDEN" });
      continue;
    }
    const documents: string[] = [];
    for (const d of (
      await s.c.query(
        "SELECT d.*,d.expires_on::text AS expires_on FROM club_document d JOIN calendar_document l ON l.document_id=d.id WHERE l.event_id=$1",
        [e.id],
      )
    ).rows)
      if (await docAccess(s.c, s.a, d)) documents.push(d.id);
    const item: EventInput = {
      title: e.title,
      kind: e.kind as EventInput["kind"],
      customType: e.custom_type,
      timezone: e.timezone,
      localStart: shiftLocal(e.local_start, shift),
      localEnd: shiftLocal(e.local_end, shift),
      fold: "earlier",
      teamId: e.team_id,
      placeId: e.place_id,
      sharedVenueId: e.shared_venue_id,
      freeLocation: e.free_location ?? "",
      responsibleId: e.responsible_user_id,
      visibility: e.visibility as EventInput["visibility"],
      equipment: e.equipment,
      instructions: e.instructions,
      participants: (
        await s.c.query(
          "SELECT p.profile_id FROM calendar_participant p JOIN club_person c ON c.id=p.profile_id WHERE p.event_id=$1 AND c.status='active'",
          [e.id],
        )
      ).rows.map((r) => r.profile_id as string),
      documents,
    };
    // Each copy is all or nothing on its own.
    await s.c.query(`SAVEPOINT copy_${n}`);
    try {
      await validate(s, item);
      await seasonDate(s, item);
      const t = times(item);
      await conflict(s, item.placeId, t.start, t.end, []);
      const series = (
        await s.c.query(
          "INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by,copy_request) VALUES($1,0,1,$2,$3) RETURNING id",
          [org, s.p.userId, input.requestId],
        )
      ).rows[0].id;
      const copy = (
        await s.c.query(
          "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,custom_type,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility,equipment,instructions,shared_venue_id,free_location,copied_from) VALUES($1,$2,0,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *",
          [
            org,
            series,
            item.title,
            item.kind,
            item.customType,
            item.timezone,
            t.start,
            t.end,
            item.localStart,
            item.localEnd,
            item.teamId,
            item.placeId,
            item.responsibleId,
            item.visibility,
            item.equipment,
            item.instructions,
            item.sharedVenueId ?? null,
            item.freeLocation ?? "",
            e.id,
          ],
        )
      ).rows[0] as Event;
      await links(s, copy.id, item);
      await capacity(s, copy);
      await changeLog(s, copy, null, "created");
      await s.c.query(`RELEASE SAVEPOINT copy_${n}`);
      created.push(copy);
    } catch (err) {
      if (!(err instanceof AccessError)) throw err;
      await s.c.query(`ROLLBACK TO SAVEPOINT copy_${n}`);
      skipped.push({ title: e.title, local_start: e.local_start, reason: err.code });
    }
  }
  if (created.length) await notify(s, created, true);
  await audit(s.c, org, s.p.userId, "calendar.copyWeek", input.requestId);
  return { created: created.length, skipped };
}
/** One of these profiles is in the event's audience (team or participant) or invited to it. */
async function concerns(c: PoolClient, e: Event, own: string[]) {
  if (!own.length) return false;
  if ((await audience(c, e)).some((x) => own.includes(x.id))) return true;
  return !!(
    await c.query(
      "SELECT 1 FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1 AND i.profile_id=ANY($2::uuid[]) AND i.withdrawn_at IS NULL LIMIT 1",
      [e.id, own],
    )
  ).rowCount;
}
/**
 * 27: the family feed. For each club where the account holds a current player
 * or guardian mandate, the events that concern one of the children (invited
 * or participant), each title prefixed with the children's first names and
 * the club's name, so a parent of two clubs reads one calendar.
 */
async function familyFeedEvents(c: PoolClient, userId: string) {
  const mandates = (
    await c.query(
      `SELECT r.*,u."twoFactorEnabled",o.name AS club FROM role_assignment r JOIN organization o ON o.id=r.organization_id AND o.kind='club'
         JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id
        WHERE r.user_id=$1 AND r.role IN ('guardian','player') AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
        ORDER BY o.name`,
      [userId],
    )
  ).rows as (Actor & { club: string })[];
  const out: (Event & { location: string })[] = [];
  const seen = new Set<string>();
  for (const a of mandates) {
    if (seen.has(a.organization_id)) continue;
    seen.add(a.organization_id);
    const own = [...(await ownProfiles(c, a))];
    if (!own.length) continue;
    const names = new Map(
      (await c.query("SELECT id,split_part(full_name,' ',1) AS first FROM club_person WHERE id=ANY($1::uuid[])", [own])).rows.map((r) => [r.id as string, r.first as string]),
    );
    const rows = (
      await c.query(
        "SELECT e.*,concat_ws(', ',COALESCE(v.name,NULLIF(e.free_location,''),p.name),COALESCE(v.address,p.address)) AS location FROM calendar_event e LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id WHERE e.organization_id=$1 AND e.starts_at>now()-interval '30 days' AND e.starts_at<now()+interval '366 days' ORDER BY starts_at",
        [a.organization_id],
      )
    ).rows as (Event & { location: string })[];
    for (const e of rows) {
      if (!(await canRead(c, a, e))) continue;
      const who = [];
      for (const id of own) if (await concerns(c, e, [id])) who.push(names.get(id) ?? "");
      if (who.length) out.push({ ...e, title: `${who.sort((x, y) => x.localeCompare(y)).join(", ")} · ${e.title} (${a.club})` });
    }
  }
  return out.sort((x, y) => +new Date(x.starts_at) - +new Date(y.starts_at));
}
export async function calendarFeed(db: Pool, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AccessError("NOT_FOUND", 404);
  return tx(db, async (c) => {
    const f = (
      await c.query(
        "SELECT * FROM calendar_feed WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
        [createHash("sha256").update(token).digest("hex")],
      )
    ).rows[0];
    if (!f) throw new AccessError("NOT_FOUND", 404);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR SHARE", [
      f.organization_id,
    ]);
    const fresh = (
      await c.query(
        "SELECT 1 FROM calendar_feed WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()",
        [f.id],
      )
    ).rowCount;
    if (!fresh) throw new AccessError("NOT_FOUND", 404);
    const a = (
      await c.query(
        'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.id=$1 AND r.user_id=$2 AND r.organization_id=$3 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
        [f.mandate_id, f.user_id, f.organization_id],
      )
    ).rows[0] as Actor | undefined;
    if (!a) throw new AccessError("NOT_FOUND", 404);
    // 27: the family feed gathers the children's events of every club where the account answers for them.
    if (f.family) return calendarIcs(await familyFeedEvents(c, f.user_id), process.env.BETTER_AUTH_URL!);
    const rows = (
      await c.query(
        "SELECT e.*,concat_ws(', ',COALESCE(v.name,NULLIF(e.free_location,''),p.name),COALESCE(v.address,p.address)) AS location FROM calendar_event e LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id WHERE e.organization_id=$1 AND e.starts_at>now()-interval '30 days' AND e.starts_at<now()+interval '366 days' AND ($2::uuid IS NULL OR e.team_id=$2) ORDER BY starts_at",
        [f.organization_id, f.team_id],
      )
    ).rows as (Event & { location: string })[];
    const allowed = [];
    // "My events" (C9): those I lead, or where one of my profiles is invited or a participant.
    const own = f.only_mine ? [...(await ownProfiles(c, a))] : [];
    for (const e of rows)
      if (await canRead(c, a, e))
        if (!f.only_mine || e.responsible_user_id === a.user_id || (await concerns(c, e, own))) allowed.push(e);
    // 2: the meetings of the tasks given to me (« a lieu le »), in my own feed only.
    if (f.only_mine) {
      const meetings = (
        await c.query(
          `SELECT DISTINCT t.id,t.title,t.meeting_starts_at AS starts_at,COALESCE(t.meeting_ends_at,t.meeting_starts_at+interval '1 hour') AS ends_at,t.updated_at,1 AS version,
                  'scheduled' AS status,concat_ws(', ',COALESCE(pl.name,sv.name,NULLIF(t.free_location,'')),COALESCE(pl.address,sv.address)) AS location
             FROM task t JOIN task_assignee a ON a.task_id=t.id LEFT JOIN calendar_place pl ON pl.id=t.place_id LEFT JOIN shared_venue sv ON sv.id=t.shared_venue_id
            WHERE t.organization_id=$1 AND t.meeting_starts_at IS NOT NULL AND t.meeting_starts_at>now()-interval '30 days' AND t.meeting_starts_at<now()+interval '366 days'
              AND (a.user_id=$2 OR a.profile_id=ANY($3::uuid[]))`,
          [f.organization_id, a.user_id, own],
        )
      ).rows as (Event & { location: string })[];
      allowed.push(...meetings.map((m) => ({ ...m, id: "task-" + m.id })));
    }
    // Wave 15: money deadlines, when asked and while the person keeps money rights.
    let days: { uid: string; date: string; title: string }[] = [];
    if (f.include_money) {
      const rights = permissions(a.role, a.grants);
      const off = (await c.query("SELECT disabled_modules FROM organization WHERE id=$1", [f.organization_id])).rows[0]?.disabled_modules ?? [];
      if (mfaSatisfied(!!a.twoFactorEnabled) && (rights.includes("dues.read") || rights.includes("dues.manage")) && !off.includes("finance")) {
        const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          to = new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10);
        days = (await moneyDeadlinesIn(c, f.organization_id, from, to, true, [])).map((d) => ({
          uid: d.id.replace(":", "-"),
          date: d.date,
          // The feed has no language: the accounts' dates carry their kind in the club's default language (French).
          title: d.source === "accounts" ? `${d.kind === "accountsAssembly" ? "Comptes annuels : assemblée générale" : "Comptes annuels : dépôt au greffe"} ${d.title}` : d.title,
        }));
      }
    }
    return calendarIcs(allowed, process.env.BETTER_AUTH_URL!, days);
  });
}
