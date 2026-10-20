import { mfaSatisfied } from "../../lib/security-policy";
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
const eventSelect = `SELECT e.*,s.interval_days,COALESCE(v.name,NULLIF(e.free_location,''),p.name) AS place_name,COALESCE(v.address,p.address) AS place_address,t.name AS team_name,u.name AS responsible_name FROM calendar_event e JOIN calendar_series s ON s.id=e.series_id LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id LEFT JOIN team t ON t.id=e.team_id JOIN "user" u ON u.id=e.responsible_user_id`;
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
async function notify(s: Scope, events: Event[]) {
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
      await s.c.query("SELECT 1 FROM shared_venue WHERE id=$1", [
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
  return scope(db, p, async (s) => {
    const rows = (
      await s.c.query(
        eventSelect +
          " WHERE e.organization_id=$1 AND ($6::boolean OR (e.starts_at<$3::date AND e.ends_at>$2::date)) AND ($4::uuid IS NULL OR e.team_id=$4) AND ($5::uuid IS NULL OR e.place_id=$5) ORDER BY e.starts_at,e.id LIMIT 101 OFFSET $7",
        [
          s.a.organization_id,
          range.from,
          range.to,
          range.team || null,
          range.place || null,
          range.all === "true",
          range.offset ?? 0,
        ],
      )
    ).rows as (Event & {
      place_name: string | null;
      place_address: string | null;
      team_name: string | null;
      responsible_name: string;
    })[];
    const events = [];
    const own = await ownProfiles(s.c, s.a);
    for (const e of rows.slice(0, 100)) {
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
        "SELECT t.id,t.name,t.season_id FROM team t JOIN season se ON se.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT se.archived",
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
        teams.push({ id: team.id as string, name: team.name as string });
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
      hasMore: rows.length > 100,
      sharedVenues: (
        await s.c.query(
          "SELECT id,name,address FROM shared_venue ORDER BY name,id",
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
      feeds: (
        await s.c.query(
          "SELECT id,name,team_id,created_at,expires_at,revoked_at FROM calendar_feed WHERE organization_id=$1 AND user_id=$2 AND mandate_id=$3 ORDER BY created_at DESC",
          [s.a.organization_id, s.p.userId, s.a.id],
        )
      ).rows,
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
      if (input.action === "sharedVenue") {
        needManage(s);
        const row = (
          await s.c.query(
            "INSERT INTO shared_venue(name,address,created_by,organization_id) VALUES($1,$2,$3,$4) RETURNING id",
            [input.name, input.address, p.userId, s.a.organization_id],
          )
        ).rows[0];
        await audit(
          s.c,
          s.a.organization_id,
          p.userId,
          "calendar.sharedVenue",
          row.id,
        );
        return { id: row.id as string };
      }
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
              "INSERT INTO calendar_feed(organization_id,user_id,mandate_id,token_hash,name,team_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
              [
                s.a.organization_id,
                p.userId,
                s.a.id,
                createHash("sha256").update(token).digest("hex"),
                input.name,
                input.teamId,
              ],
            )
          ).rows[0].id;
        await audit(s.c, s.a.organization_id, p.userId, "calendar.feed", id);
        return {
          id,
          url: process.env.BETTER_AUTH_URL + "/api/calendar/feed/" + token,
        };
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
        await validate(s, input);
        const schedule = Array.from({ length: input.occurrences }, (_, i) => ({
          ...input,
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
              "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,custom_type,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility,equipment,instructions,shared_venue_id,free_location) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *",
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
              ],
            )
          ).rows[0] as Event;
          await links(s, e.id, item);
          await capacity(s, e);
          await changeLog(s, e, null, "created");
          events.push(e);
        }
        await notify(s, events);
        return { id: events[0].id };
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
      } else {
        if (anchor.status === "cancelled")
          throw new AccessError("INVALID_TRANSITION", 409);
        await validate(s, input);
        const planned = targets.map((e) => ({
          e,
          input: {
            ...input,
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
              "UPDATE calendar_event SET title=$2,kind=$3,custom_type=$4,timezone=$5,starts_at=$6,ends_at=$7,local_start=$8,local_end=$9,team_id=$10,place_id=$11,responsible_user_id=$12,visibility=$13,equipment=$14,instructions=$15,shared_venue_id=$17,free_location=$18,is_exception=CASE WHEN $16 THEN true ELSE is_exception END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
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
              ],
            )
          ).rows[0] as Event;
          await links(s, e.id, item);
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
  if (created.length) await notify(s, created);
  await audit(s.c, org, s.p.userId, "calendar.copyWeek", input.requestId);
  return { created: created.length, skipped };
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
    const rows = (
      await c.query(
        "SELECT e.*,concat_ws(', ',COALESCE(v.name,NULLIF(e.free_location,''),p.name),COALESCE(v.address,p.address)) AS location FROM calendar_event e LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id WHERE e.organization_id=$1 AND e.starts_at>now()-interval '30 days' AND e.starts_at<now()+interval '366 days' AND ($2::uuid IS NULL OR e.team_id=$2) ORDER BY starts_at LIMIT 1000",
        [f.organization_id, f.team_id],
      )
    ).rows as (Event & { location: string })[];
    const allowed = [];
    for (const e of rows) if (await canRead(c, a, e)) allowed.push(e);
    return calendarIcs(allowed, process.env.BETTER_AUTH_URL!);
  });
}
