import { visibleVenue } from "../venues/schema";
import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  AccessError,
  account,
  active,
  audit,
  type Principal,
} from "../access/service";
import { permissions, type Permission } from "../access/policy";
import { ownProfiles } from "../calendar/access";
import { cancelForTrip, requestForTrip, tripAuthorizations } from "../authorizations/service";
import { logSensitiveAccess } from "../club/governance";
import { seal, unseal } from "../notifications/crypto";
import { brusselsToday } from "../people/service";
import {
  countdown,
  defaultChecklist,
  momentOrder,
  tripDays,
  unassigned,
  tripCommand,
  type TripCommand,
} from "./schema";
import type { z } from "zod";
import { costs, drafts, proposeStops, rounds, saveTripTasks, syncStopTask, tripTasks } from "./rounds";
import { modeFor } from "./transport";
import { routeEstimator } from "./route";

/**
 * Trips: tournaments, away matches and camps. Managers (president, calendar or
 * team managers) prepare them; the coaches, staff and assistants travelling
 * see what they need to take care of the players; players and families see
 * their own practical information only.
 */
type Ctx = {
  c: PoolClient;
  org: string;
  userId: string;
  role: string;
  rights: Permission[];
  grants: string[];
  mfa: boolean;
  own: Set<string>;
  manage: boolean;
  readAll: boolean;
};
async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (x: Ctx) => Promise<T>,
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
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const own = await ownProfiles(c, {
      ...a,
      twoFactorEnabled: !!user.twoFactorEnabled,
    });
    const manage =
      mfa &&
      (a.role === "club_president" ||
        rights.includes("calendar.manage") ||
        rights.includes("teams.manage"));
    const readAll =
      manage ||
      (mfa && (rights.includes("calendar.read") || rights.includes("people.read")));
    const out = await fn({
      c,
      org: a.organization_id,
      userId: p.userId,
      role: a.role,
      rights,
      grants: a.grants,
      mfa,
      own,
      manage,
      readAll,
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    if ((e as { code?: string }).code === "23514")
      throw new AccessError("INVALID_INPUT", 400);
    throw e;
  } finally {
    c.release();
  }
}

const careAad = (id: string) => "care:" + id;
type Care = { title: string; details: string };

/** Travelling staff: the user's own profile is a non-declined coach, staff or assistant. */
async function travellingStaff(x: Ctx, tripId: string) {
  if (!x.mfa || !x.own.size) return false;
  return !!(
    await x.c.query(
      "SELECT 1 FROM trip_participant WHERE trip_id=$1 AND profile_id=ANY($2::uuid[]) AND role IN ('coach','staff','assistant') AND status<>'declined'",
      [tripId, [...x.own]],
    )
  ).rowCount;
}
async function tripRow(x: Ctx, id: string, lock = false) {
  const t = (
    await x.c.query(
      `SELECT t.*,t.starts_on::text AS starts_on,t.ends_on::text AS ends_on,
              v.name AS venue_name,concat_ws(', ',NULLIF(v.address,''),NULLIF(v.city,'')) AS venue_address,
              v.step_free,v.adapted_toilets,v.changing_rooms,v.charging,v.parking AS venue_parking,
              pl.name AS place_name,pl.address AS place_address
         FROM trip t LEFT JOIN shared_venue v ON v.id=t.shared_venue_id LEFT JOIN calendar_place pl ON pl.id=t.place_id
        WHERE t.id=$1 AND t.organization_id=$2 ${lock ? "FOR UPDATE OF t" : ""}`,
      [id, x.org],
    )
  ).rows[0];
  if (!t) throw new AccessError("NOT_FOUND", 404);
  return t;
}

/** 3: what the trip serves, with its date, hour and place. */
async function serves(x: Ctx, t: { calendar_event_id: string | null; match_id: string | null; tournament_day_id: string | null }) {
  if (t.match_id) {
    const m = (await x.c.query("SELECT m.id,m.opponent,m.starts_at,m.venue,tm.name AS team FROM match m LEFT JOIN team tm ON tm.id=m.team_id WHERE m.id=$1 AND m.organization_id=$2", [t.match_id, x.org])).rows[0];
    if (m) return { kind: "match" as const, id: m.id as string, title: (m.team ? `${m.team} · ${m.opponent}` : m.opponent) as string, starts_at: m.starts_at as string | null, place: m.venue as string };
  }
  if (t.tournament_day_id) {
    const d = (await x.c.query("SELECT d.id,d.day::text AS day,d.label,d.venue,tn.name FROM tournament_day d JOIN tournament tn ON tn.id=d.tournament_id WHERE d.id=$1", [t.tournament_day_id])).rows[0];
    if (d) return { kind: "tournamentDay" as const, id: d.id as string, title: [d.name, d.label].filter(Boolean).join(" · ") as string, starts_at: null, day: d.day as string, place: d.venue as string };
  }
  if (t.calendar_event_id) {
    const e = (await x.c.query("SELECT e.id,e.title,e.starts_at,pl.name AS place FROM calendar_event e LEFT JOIN calendar_place pl ON pl.id=e.place_id WHERE e.id=$1 AND e.organization_id=$2", [t.calendar_event_id, x.org])).rows[0];
    if (e) return { kind: "event" as const, id: e.id as string, title: e.title as string, starts_at: e.starts_at as string | null, place: (e.place ?? "") as string };
  }
  return null;
}

export async function tripsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    const trips = (
      await x.c.query(
        `SELECT t.id,t.title,t.kind,t.status,t.mode,t.starts_on::text AS starts_on,t.ends_on::text AS ends_on,t.team_id,tm.name AS team_name,tm.color AS team_color,
                -- 3: the day served, the departure and the arrival of the rounds.
                COALESCE(t.departure_at,(SELECT min(s.at) FROM trip_stop s JOIN trip_vehicle v ON v.id=s.trip_vehicle_id WHERE v.trip_id=t.id)) AS departure_at,
                (SELECT min(s.at) FROM trip_stop s JOIN trip_vehicle v ON v.id=s.trip_vehicle_id WHERE v.trip_id=t.id AND s.kind='arrive') AS arrival_at,
                COALESCE(ev.title,CASE WHEN mt.id IS NOT NULL THEN mt.opponent END,NULLIF(concat_ws(' · ',tn.name,NULLIF(td.label,'')),'')) AS serves,
                (SELECT count(*)::int FROM trip_vehicle v WHERE v.trip_id=t.id) AS vehicles,
                COALESCE(v.name,pl.name,NULLIF(t.destination,'')) AS destination,
                count(tp.id) FILTER (WHERE tp.status<>'declined')::int AS travelling,
                count(tp.id) FILTER (WHERE tp.status='confirmed')::int AS confirmed,
                count(tp.id) FILTER (WHERE tp.status<>'declined' AND tp.chair IN ('powerchair','both'))::int AS powerchairs
           FROM trip t LEFT JOIN shared_venue v ON v.id=t.shared_venue_id LEFT JOIN calendar_place pl ON pl.id=t.place_id
           LEFT JOIN trip_participant tp ON tp.trip_id=t.id LEFT JOIN team tm ON tm.id=t.team_id
           LEFT JOIN calendar_event ev ON ev.id=t.calendar_event_id AND ev.organization_id=t.organization_id
           LEFT JOIN match mt ON mt.id=t.match_id AND mt.organization_id=t.organization_id
           LEFT JOIN tournament_day td ON td.id=t.tournament_day_id LEFT JOIN tournament tn ON tn.id=td.tournament_id
          WHERE t.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM trip_participant o WHERE o.trip_id=t.id AND o.profile_id=ANY($3::uuid[])))
          GROUP BY t.id,v.name,pl.name,tm.name,tm.color,ev.title,mt.id,mt.opponent,tn.name,td.label ORDER BY t.starts_on DESC LIMIT 200`,
        [x.org, x.readAll, [...x.own]],
      )
    ).rows;
    const today = brusselsToday();
    return {
      organization_id: x.org,
      today,
      can: { manage: x.manage },
      trips: trips.map((t) => ({ ...t, countdown: countdown(t.starts_on, today) })),
      fleet: x.readAll
        ? (
            await x.c.query(
              "SELECT *,insurance_until::text AS insurance_until,inspection_until::text AS inspection_until FROM club_vehicle WHERE organization_id=$1 ORDER BY archived,name",
              [x.org],
            )
          ).rows
        : [],
      drivers: x.manage
        ? (
            await x.c.query(
              "SELECT d.profile_id,cp.full_name,d.categories,d.valid_until::text AS valid_until,d.obtained_on::text AS obtained_on,d.verified_on IS NOT NULL AS verified FROM driver_licence d JOIN club_person cp ON cp.id=d.profile_id WHERE d.organization_id=$1 ORDER BY cp.full_name",
              [x.org],
            )
          ).rows
        : [],
      people: x.manage
        ? (
            await x.c.query(
              "SELECT id,full_name,directory_roles FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name",
              [x.org],
            )
          ).rows
        : [],
      venues: x.manage
        ? (
            await x.c.query(
              // Wave 17 (C4): the federation's validated halls only.
              `SELECT v.id,v.name,v.city FROM shared_venue v WHERE ${visibleVenue()} ORDER BY v.name LIMIT 500`,
              [x.org],
            )
          ).rows
        : [],
      places: x.manage
        ? (
            await x.c.query(
              "SELECT id,name FROM calendar_place WHERE organization_id=$1 AND NOT archived ORDER BY name",
              [x.org],
            )
          ).rows
        : [],
      // 3: what a trip may serve: an event, a match, a tournament day (coming ones).
      links: x.manage ? await linkOptions(x) : { events: [], matches: [], days: [] },
      // 5: the chairs of Matériel (club's and players'), for the load.
      chairs: x.manage
        ? ((
            await x.c.query(
              "SELECT ch.id,chair_label(ch.id) AS name,ch.ownership FROM equipment_chair ch WHERE ch.organization_id=$1 AND ch.status<>'retired' ORDER BY ch.ownership,ch.name",
              [x.org],
            )
          ).rows as { id: string; name: string; ownership: string }[])
        : [],
      mileageRateCents: (await x.c.query("SELECT mileage_rate_cents FROM organization WHERE id=$1", [x.org])).rows[0]?.mileage_rate_cents as number | null,
      // Teams of the open seasons, for the trip's team (wave 15).
      teams: x.manage
        ? ((await x.c.query("SELECT id,name,color FROM team WHERE organization_id=$1 AND NOT archived ORDER BY name", [x.org])).rows as { id: string; name: string; color: string | null }[])
        : [],
    };
  });
}

/** 3: the coming events, matches and tournament days of the club, to link a trip to one of them. */
async function linkOptions(x: Ctx) {
  const events = (
    await x.c.query(
      `SELECT e.id,e.title,e.starts_at,e.ends_at,e.local_start,e.place_id,pl.name AS place_name,pl.address AS place_address
         FROM calendar_event e LEFT JOIN calendar_place pl ON pl.id=e.place_id
        WHERE e.organization_id=$1 AND e.status<>'cancelled' AND e.starts_at>=now()-interval '1 day' AND e.starts_at<now()+interval '180 days' ORDER BY e.starts_at LIMIT 150`,
      [x.org],
    )
  ).rows as { id: string; title: string; starts_at: string; ends_at: string; local_start: string; place_id: string | null; place_name: string | null; place_address: string | null }[];
  const matches = (
    await x.c.query(
      `SELECT m.id,m.opponent,m.home,m.starts_at,m.venue,m.calendar_event_id,tm.name AS team
         FROM match m LEFT JOIN team tm ON tm.id=m.team_id
        WHERE m.organization_id=$1 AND m.status='scheduled' AND m.starts_at>=now()-interval '1 day' ORDER BY m.starts_at LIMIT 100`,
      [x.org],
    )
  ).rows as { id: string; opponent: string; home: boolean; starts_at: string; venue: string; calendar_event_id: string | null; team: string | null }[];
  const days = (
    await x.c.query(
      `SELECT d.id,d.day::text AS day,d.label,d.venue,tn.name AS tournament
         FROM tournament_day d JOIN tournament tn ON tn.id=d.tournament_id
        WHERE d.day>=CURRENT_DATE-1 AND (tn.organization_id=$1 OR EXISTS(SELECT 1 FROM tournament_club c WHERE c.tournament_id=tn.id AND c.organization_id=$1 AND c.status<>'declined'))
        ORDER BY d.day LIMIT 100`,
      [x.org],
    )
  ).rows as { id: string; day: string; label: string; venue: string; tournament: string }[];
  return { events, matches, days };
}

/** 3: a link given by a command belongs to the club (or to a tournament it plays in). */
async function checkLinks(x: Ctx, i: { calendarEventId?: string | null; matchId?: string | null; tournamentDayId?: string | null }) {
  if (i.calendarEventId && !(await x.c.query("SELECT 1 FROM calendar_event WHERE id=$1 AND organization_id=$2", [i.calendarEventId, x.org])).rowCount)
    throw new AccessError("NOT_FOUND", 404);
  if (i.matchId && !(await x.c.query("SELECT 1 FROM match WHERE id=$1 AND organization_id=$2", [i.matchId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  if (
    i.tournamentDayId &&
    !(
      await x.c.query(
        "SELECT 1 FROM tournament_day d JOIN tournament tn ON tn.id=d.tournament_id WHERE d.id=$1 AND (tn.organization_id=$2 OR EXISTS(SELECT 1 FROM tournament_club c WHERE c.tournament_id=tn.id AND c.organization_id=$2 AND c.status<>'declined'))",
        [i.tournamentDayId, x.org],
      )
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
}

export async function tripDetail(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (x) => {
    const t = await tripRow(x, id);
    const staff = await travellingStaff(x, id);
    const participantsAll = (
      await x.c.query(
        `SELECT tp.id,tp.profile_id,tp.role,tp.status,tp.chair,tp.needs,cp.full_name,cp.phone,cp.directory_roles
           FROM trip_participant tp JOIN club_person cp ON cp.id=tp.profile_id
          WHERE tp.trip_id=$1 ORDER BY CASE tp.role WHEN 'player' THEN 0 WHEN 'coach' THEN 1 ELSE 2 END,cp.full_name`,
        [id],
      )
    ).rows;
    const mine = participantsAll.filter((r) => x.own.has(r.profile_id));
    const full = x.readAll || staff;
    if (!full && !mine.length) throw new AccessError("NOT_FOUND", 404);
    const today = brusselsToday();
    // 3: each vehicle with its kind, drivers, chairs, round and load check.
    const vehicles = await rounds(x.c, x.org, t, participantsAll);
    const schedule = (
      await x.c.query(
        "SELECT id,day::text AS day,time,title,place,notes FROM trip_schedule_item WHERE trip_id=$1 ORDER BY day,time,title",
        [id],
      )
    ).rows;
    // 28: the authorizations of the travelling minors, signed or missing (each family sees its own).
    const auth = await tripAuthorizations(x.c, x.org, id);
    const base = {
      organization_id: x.org,
      today,
      trip: t,
      serves: await serves(x, t),
      countdown: countdown(t.starts_on, today),
      schedule,
      can: { manage: x.manage, staff, full },
    };
    if (!full) {
      // A player or a family sees their own place and the journey, not the others.
      const ids = new Set(mine.map((r) => r.id));
      return {
        ...base,
        participants: mine,
        vehicles: vehicles
          .filter((v) => v.passengers.some((pid: string) => ids.has(pid)))
          .map((v) => ({
            id: v.id,
            name: v.name,
            kind: v.kind,
            legs: v.legs,
            driver_name: v.driver_name,
            phone: v.phone,
            drivers: v.drivers.map((d) => ({ profile_id: d.profile_id, full_name: d.full_name, phone: d.phone, legs: d.legs })),
            passengers: v.passengers.filter((pid: string) => ids.has(pid)),
            // Their round: where and when, without the people in charge of each step.
            stops: v.stops.map((st) => ({ id: st.id, kind: st.kind, label: st.label, where: st.where, at: st.at, minutes: st.minutes, route: st.route })),
          })),
        authorizations: { ...auth, people: auth.people.filter((q) => x.own.has(q.id)), missing: 0 },
        checklist: [],
        budget: null,
        documents: [],
        support: [],
        care: null,
        unassigned: { out: [], back: [] },
        tasks: [],
        costs: null,
        estimate: false,
      };
    }
    const checklist = (
      await x.c.query(
        'SELECT i.id,i.label,i.position,i.done_at,u.name AS done_by FROM trip_checklist_item i LEFT JOIN "user" u ON u.id=i.done_by WHERE i.trip_id=$1 ORDER BY i.position,i.label',
        [id],
      )
    ).rows;
    const money =
      x.mfa && (x.rights.includes("dues.manage") || x.rights.includes("dues.read"));
    const budget = money
      ? {
          lines: (
            await x.c.query(
              "SELECT id,label,planned_cents FROM trip_budget_line WHERE trip_id=$1 ORDER BY label",
              [id],
            )
          ).rows,
          spent: Number(
            (
              await x.c.query(
                "SELECT COALESCE(sum(amount_cents),0) AS n FROM finance_transaction WHERE trip_id=$1 AND direction='out' AND cancelled_at IS NULL",
                [id],
              )
            ).rows[0].n,
          ),
          received: Number(
            (
              await x.c.query(
                "SELECT COALESCE(sum(amount_cents),0) AS n FROM finance_transaction WHERE trip_id=$1 AND direction='in' AND cancelled_at IS NULL",
                [id],
              )
            ).rows[0].n,
          ),
        }
      : null;
    // Documents of the travellers that are not in order before the return date.
    const docRights =
      x.mfa &&
      (x.rights.includes("documents.read") || x.rights.includes("documents.manage"));
    const documents = docRights
      ? (
          await x.c.query(
            `SELECT d.id,d.profile_id,d.name,d.status,d.expires_on::text AS expires_on,cp.full_name
               FROM club_document d JOIN trip_participant tp ON tp.profile_id=d.profile_id AND tp.trip_id=$1 AND tp.status<>'declined'
               JOIN club_person cp ON cp.id=d.profile_id
              WHERE d.organization_id=$2 AND (NOT d.sensitive OR $4)
                AND (d.status IN ('missing','requested','refused','uploaded','review','expired') OR (d.status='valid' AND d.expires_on<$3::date))
              ORDER BY cp.full_name,d.name`,
            [id, x.org, t.ends_on, x.grants.includes("documents.sensitive")],
          )
        ).rows
      : [];
    // Support needs and care instructions: travelling staff and readers of the directory.
    const travelling = participantsAll
      .filter((r) => r.status !== "declined")
      .map((r) => r.profile_id);
    const support = (
      await x.c.query(
        "SELECT profile_id,support_needs,safety_notes,emergency_contact FROM player_support_profile WHERE organization_id=$1 AND profile_id=ANY($2::uuid[])",
        [x.org, travelling],
      )
    ).rows;
    const instructions = (
      await x.c.query(
        "SELECT id,profile_id,moment,time,ciphertext FROM care_instruction WHERE organization_id=$1 AND active AND profile_id=ANY($2::uuid[])",
        [x.org, travelling],
      )
    ).rows.map(({ ciphertext, ...r }) => ({
      ...r,
      ...unseal<Care>(ciphertext, careAad(r.id)),
    }));
    instructions.sort(
      (a, b) =>
        (momentOrder[a.moment] ?? 9) - (momentOrder[b.moment] ?? 9) ||
        a.time.localeCompare(b.time),
    );
    if (instructions.length)
      await logSensitiveAccess(x.c, x.org, x.userId, null, "trip_care", id);
    const done = (
      await x.c.query(
        'SELECT d.instruction_id,d.day::text AS day,d.done_at,d.note,u.name AS done_by FROM trip_care_done d JOIN "user" u ON u.id=d.done_by WHERE d.trip_id=$1',
        [id],
      )
    ).rows;
    return {
      ...base,
      participants: participantsAll,
      vehicles,
      authorizations: auth,
      checklist,
      budget,
      documents,
      support,
      care: { days: tripDays(t.starts_on, t.ends_on), instructions, done },
      // 7: the tasks drawn from the rounds, with those already in the to-do.
      tasks: x.manage ? drafts(t.starts_on, vehicles, await tripTasks(x.c, x.org, id)) : [],
      // 10: rentals, fuel and mileage allowances, planned.
      costs: money ? costs(vehicles, (await x.c.query("SELECT mileage_rate_cents FROM organization WHERE id=$1", [x.org])).rows[0]?.mileage_rate_cents ?? null) : null,
      estimate: x.manage && !!routeEstimator(),
      // A driver who is also a participant travels in their own vehicle.
      unassigned: unassigned(
        participantsAll,
        vehicles.map((v) => ({
          legs: v.legs,
          passengers: [
            ...v.passengers,
            ...participantsAll
              .filter((r) => r.profile_id === v.driver_profile_id || v.drivers.some((d) => d.profile_id === r.profile_id))
              .map((r) => r.id),
          ],
        })),
      ),
    };
  });
}

const insertChecklist = async (
  c: PoolClient,
  tripId: string,
  labels: string[],
) => {
  for (const [i, label] of labels.entries())
    await c.query(
      "INSERT INTO trip_checklist_item(trip_id,label,position) VALUES($1,$2,$3)",
      [tripId, label, i],
    );
};
async function tripOfItem(x: Ctx, table: string, id: string) {
  const row = (
    await x.c.query(
      `SELECT i.trip_id FROM ${table} i JOIN trip t ON t.id=i.trip_id WHERE i.id=$1 AND t.organization_id=$2`,
      [id, x.org],
    )
  ).rows[0];
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return row.trip_id as string;
}
async function sameClubPeople(x: Ctx, ids: (string | null)[]) {
  const list = ids.filter(Boolean) as string[];
  if (!list.length) return;
  const n = (
    await x.c.query(
      "SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND id=ANY($2::uuid[])",
      [x.org, list],
    )
  ).rows[0].n;
  if (n !== new Set(list).size) throw new AccessError("NOT_FOUND", 404);
}

export async function tripExecute(
  db: Pool,
  p: Principal,
  raw: z.input<typeof tripCommand>,
  expected: string,
) {
  // The defaults of the newer fields (3) apply to the former callers too.
  const input: TripCommand = tripCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (!x.mfa && input.action !== "participant")
        throw new AccessError("MFA_REQUIRED");
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      const fields = (i: Extract<TripCommand, { action: "create" | "update" }>) => {
        if (i.endsOn < i.startsOn) throw new AccessError("INVALID_DATE", 400);
        return [
          i.title,
          i.kind,
          i.startsOn,
          i.endsOn,
          i.sharedVenueId,
          i.placeId,
          i.destination,
          i.meetingPoint,
          i.departureAt,
          i.returnAt,
          i.returnPoint,
          i.accommodation,
          i.accommodationAccessible,
          i.emergency,
          i.contact,
          i.notes,
        ];
      };
      const checkPlace = async (i: { placeId: string | null }) => {
        if (
          i.placeId &&
          !(
            await x.c.query(
              "SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2",
              [i.placeId, x.org],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
      };
      // A team of the same club only (the foreign key says so too; this gives a clean 404).
      const checkTeam = async (i: { teamId?: string | null }) => {
        if (i.teamId && !(await x.c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2", [i.teamId, x.org])).rowCount)
          throw new AccessError("NOT_FOUND", 404);
      };
      // 3: the mode (from the dates when absent on creation) and what the trip serves (absent: unchanged).
      const more = async (id: string, i: Extract<TripCommand, { action: "create" | "update" }>, creating: boolean) => {
        await checkLinks(x, i);
        await x.c.query(
          `UPDATE trip SET mode=COALESCE($3,mode),
                  calendar_event_id=CASE WHEN $4::boolean THEN $5::uuid ELSE calendar_event_id END,
                  match_id=CASE WHEN $6::boolean THEN $7::uuid ELSE match_id END,
                  tournament_day_id=CASE WHEN $8::boolean THEN $9::uuid ELSE tournament_day_id END
            WHERE id=$1 AND organization_id=$2`,
          [
            id,
            x.org,
            i.mode ?? (creating ? modeFor(i.startsOn, i.endsOn) : null),
            i.calendarEventId !== undefined,
            i.calendarEventId ?? null,
            i.matchId !== undefined,
            i.matchId ?? null,
            i.tournamentDayId !== undefined,
            i.tournamentDayId ?? null,
          ],
        );
      };
      switch (input.action) {
        case "create": {
          need();
          await checkPlace(input);
          await checkTeam(input);
          const id = (
            await x.c.query(
              `INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,shared_venue_id,place_id,destination,meeting_point,departure_at,return_at,return_point,accommodation,accommodation_accessible,emergency,contact,notes,created_by,team_id,final_rank,teams_count,result_note)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
              [x.org, ...fields(input), x.userId, input.teamId ?? null, input.finalRank ?? null, input.teamsCount ?? null, input.resultNote ?? ""],
            )
          ).rows[0].id as string;
          await more(id, input, true);
          await insertChecklist(x.c, id, defaultChecklist[input.locale]);
          await audit(x.c, x.org, x.userId, "trip.created", id);
          return { id };
        }
        case "update": {
          need();
          await checkPlace(input);
          await checkTeam(input);
          const changed = await x.c.query(
            `UPDATE trip SET title=$3,kind=$4,starts_on=$5,ends_on=$6,shared_venue_id=$7,place_id=$8,destination=$9,meeting_point=$10,departure_at=$11,return_at=$12,return_point=$13,accommodation=$14,accommodation_accessible=$15,emergency=$16,contact=$17,notes=$18,team_id=CASE WHEN $20::boolean THEN $21::uuid ELSE team_id END,
                   final_rank=CASE WHEN $22::boolean THEN $23::int ELSE final_rank END,teams_count=CASE WHEN $22::boolean THEN $24::int ELSE teams_count END,result_note=COALESCE($25,result_note),version=version+1
              WHERE id=$1 AND organization_id=$2 AND version=$19 RETURNING id`,
            [input.id, x.org, ...fields(input), input.version, input.teamId !== undefined, input.teamId ?? null, input.finalRank !== undefined, input.finalRank ?? null, input.teamsCount ?? null, input.resultNote ?? null],
          );
          if (!changed.rowCount) {
            await tripRow(x, input.id);
            throw new AccessError("STALE_VERSION", 409);
          }
          await more(input.id, input, false);
          return { id: input.id };
        }
        case "status": {
          need();
          await tripRow(x, input.id, true);
          await x.c.query("UPDATE trip SET status=$2,version=version+1 WHERE id=$1", [
            input.id,
            input.status,
          ]);
          await audit(x.c, x.org, x.userId, "trip." + input.status, input.id);
          return { id: input.id };
        }
        case "delete": {
          need();
          await tripRow(x, input.id, true);
          // A trip with ledger lines is cancelled, never deleted.
          if (
            (
              await x.c.query("SELECT 1 FROM finance_transaction WHERE trip_id=$1 LIMIT 1", [
                input.id,
              ])
            ).rowCount
          )
            throw new AccessError("HAS_FINANCE", 409);
          await x.c.query("DELETE FROM trip_care_done WHERE trip_id=$1", [input.id]);
          await x.c.query("DELETE FROM trip WHERE id=$1", [input.id]);
          await audit(x.c, x.org, x.userId, "trip.deleted", input.id);
          return { id: input.id };
        }
        case "addParticipants": {
          need();
          await tripRow(x, input.tripId, true);
          await sameClubPeople(x, input.people.map((q) => q.profileId));
          for (const q of input.people)
            await x.c.query(
              "INSERT INTO trip_participant(trip_id,profile_id,role) VALUES($1,$2,$3) ON CONFLICT(trip_id,profile_id) DO UPDATE SET role=EXCLUDED.role",
              [input.tripId, q.profileId, q.role],
            );
          // 28: the minors' families receive the authorizations the club asks on trips.
          await requestForTrip(x.c, x.org, x.userId, input.tripId);
          return { id: input.tripId };
        }
        case "participant": {
          const row = (
            await x.c.query(
              "SELECT tp.* FROM trip_participant tp JOIN trip t ON t.id=tp.trip_id WHERE tp.id=$1 AND t.organization_id=$2 FOR UPDATE OF tp",
              [input.participantId, x.org],
            )
          ).rows[0];
          if (!row) throw new AccessError("NOT_FOUND", 404);
          if (x.manage) {
            await x.c.query(
              "UPDATE trip_participant SET status=$2,chair=$3,needs=$4 WHERE id=$1",
              [input.participantId, input.status, input.chair, input.needs],
            );
          } else if (x.own.has(row.profile_id)) {
            // A player or a family answers for themselves: coming or not.
            await x.c.query("UPDATE trip_participant SET status=$2 WHERE id=$1", [
              input.participantId,
              input.status === "invited" ? row.status : input.status,
            ]);
          } else throw new AccessError("FORBIDDEN");
          // 28: declining withdraws what was asked for this trip; coming back asks again.
          const now = (await x.c.query("SELECT status FROM trip_participant WHERE id=$1", [input.participantId])).rows[0].status;
          if (now === "declined") await cancelForTrip(x.c, row.trip_id, row.profile_id);
          else if (row.status === "declined") await requestForTrip(x.c, x.org, x.userId, row.trip_id);
          return { id: row.trip_id };
        }
        case "removeParticipant": {
          need();
          const tripId = await tripOfItem(x, "trip_participant", input.participantId);
          const gone = (
            await x.c.query("DELETE FROM trip_participant WHERE id=$1 RETURNING profile_id", [
              input.participantId,
            ])
          ).rows[0];
          if (gone) await cancelForTrip(x.c, tripId, gone.profile_id);
          return { id: tripId };
        }
        case "vehicle": {
          need();
          await tripRow(x, input.tripId, true);
          // 6: several drivers; the first one stays in driver_profile_id for the former readers.
          const drivers = input.drivers ?? (input.driverProfileId ? [{ profileId: input.driverProfileId, legs: input.legs }] : []);
          await sameClubPeople(x, [...drivers.map((d) => d.profileId), input.ownerProfileId]);
          if (
            input.vehicleId &&
            !(
              await x.c.query(
                "SELECT 1 FROM club_vehicle WHERE id=$1 AND organization_id=$2",
                [input.vehicleId, x.org],
              )
            ).rowCount
          )
            throw new AccessError("NOT_FOUND", 404);
          const contacts = [input.rentalContactId, input.ownerContactId].filter(Boolean) as string[];
          if (contacts.length && (await x.c.query("SELECT count(*)::int AS n FROM contact WHERE organization_id=$1 AND id=ANY($2::uuid[])", [x.org, contacts])).rows[0].n !== new Set(contacts).size)
            throw new AccessError("NOT_FOUND", 404);
          if (input.chairs.length && (await x.c.query("SELECT count(*)::int AS n FROM equipment_chair WHERE organization_id=$1 AND id=ANY($2::uuid[])", [x.org, input.chairs])).rows[0].n !== new Set(input.chairs).size)
            throw new AccessError("NOT_FOUND", 404);
          const ok = (
            await x.c.query(
              "SELECT count(*)::int AS n FROM trip_participant WHERE trip_id=$1 AND id=ANY($2::uuid[])",
              [input.tripId, input.passengers],
            )
          ).rows[0].n;
          if (ok !== new Set(input.passengers).size)
            throw new AccessError("NOT_FOUND", 404);
          const rental = input.kind === "rental",
            own = input.kind === "private";
          const values = [
            input.kind === "club" ? input.vehicleId : null,
            input.name,
            input.legs,
            drivers[0]?.profileId ?? null,
            input.driverPhone,
            input.seats,
            input.wheelchairPlaces,
            input.notes,
            input.kind,
            rental ? input.rentalContactId : null,
            rental ? input.pickupAddress : "",
            rental ? input.returnAddress : "",
            rental ? input.bookingRef : "",
            rental ? input.plannedCostCents : null,
            rental ? input.depositCents : null,
            own ? input.ownerProfileId : null,
            own ? input.ownerContactId : null,
            input.ramp,
            own && input.mileage,
            input.distanceKm,
            input.fuelCents,
            input.equipment,
          ];
          let vid = input.id;
          if (vid) {
            const changed = await x.c.query(
              `UPDATE trip_vehicle SET vehicle_id=$3,name=$4,legs=$5,driver_profile_id=$6,driver_phone=$7,seats=$8,wheelchair_places=$9,notes=$10,kind=$11,rental_contact_id=$12,pickup_address=$13,return_address=$14,
                      booking_ref=$15,planned_cost_cents=$16,deposit_cents=$17,owner_profile_id=$18,owner_contact_id=$19,ramp=$20,mileage=$21,distance_km=$22,fuel_cents=$23,equipment=$24 WHERE id=$1 AND trip_id=$2`,
              [vid, input.tripId, ...values],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await x.c.query("DELETE FROM trip_passenger WHERE trip_vehicle_id=$1", [vid]);
            await x.c.query("DELETE FROM trip_vehicle_driver WHERE trip_vehicle_id=$1", [vid]);
            await x.c.query("DELETE FROM trip_vehicle_chair WHERE trip_vehicle_id=$1", [vid]);
          } else
            vid = (
              await x.c.query(
                `INSERT INTO trip_vehicle(trip_id,vehicle_id,name,legs,driver_profile_id,driver_phone,seats,wheelchair_places,notes,kind,rental_contact_id,pickup_address,return_address,booking_ref,planned_cost_cents,deposit_cents,owner_profile_id,owner_contact_id,ramp,mileage,distance_km,fuel_cents,equipment)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
                [input.tripId, ...values],
              )
            ).rows[0].id as string;
          for (const pid of new Set(input.passengers))
            await x.c.query(
              "INSERT INTO trip_passenger(trip_vehicle_id,participant_id) VALUES($1,$2)",
              [vid, pid],
            );
          for (const d of drivers) await x.c.query("INSERT INTO trip_vehicle_driver(trip_vehicle_id,profile_id,legs) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [vid, d.profileId, d.legs]);
          for (const ch of new Set(input.chairs)) await x.c.query("INSERT INTO trip_vehicle_chair(trip_vehicle_id,chair_id) VALUES($1,$2)", [vid, ch]);
          // 4: a new vehicle gets the round of its kind, to adjust.
          if (!input.id) await proposeStops(x.c, vid);
          return { id: input.tripId, vehicleId: vid };
        }
        case "stops": {
          need();
          const tripId = await tripOfItem(x, "trip_vehicle", input.vehicleId);
          await tripRow(x, tripId, true);
          const people = [...new Set(input.stops.flatMap((st) => st.people))];
          await sameClubPeople(x, people);
          for (const st of input.stops) await checkPlace(st);
          const keep = input.stops.map((st) => st.id).filter(Boolean) as string[];
          if (keep.length && (await x.c.query("SELECT count(*)::int AS n FROM trip_stop WHERE trip_vehicle_id=$1 AND id=ANY($2::uuid[])", [input.vehicleId, keep])).rows[0].n !== new Set(keep).size)
            throw new AccessError("NOT_FOUND", 404);
          // A step removed takes its open task with it.
          const gone = (await x.c.query("DELETE FROM trip_stop WHERE trip_vehicle_id=$1 AND NOT (id=ANY($2::uuid[])) RETURNING id", [input.vehicleId, keep])).rows.map((r) => r.id as string);
          if (gone.length) await x.c.query("DELETE FROM task WHERE organization_id=$1 AND status<>'done' AND source_key=ANY($2::text[])", [x.org, gone.map((g) => `trip:${tripId}:stop:${g}`)]);
          for (const [position, st] of input.stops.entries()) {
            const v = [position, st.kind, st.label, st.placeId, st.sharedVenueId, st.address, st.at, st.minutes, st.notes];
            const sid = st.id
              ? (await x.c.query("UPDATE trip_stop SET position=$2,kind=$3,label=$4,place_id=$5,shared_venue_id=$6,address=$7,at=$8,minutes=$9,notes=$10 WHERE id=$1 RETURNING id", [st.id, ...v])).rows[0].id
              : (await x.c.query("INSERT INTO trip_stop(trip_vehicle_id,position,kind,label,place_id,shared_venue_id,address,at,minutes,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id", [input.vehicleId, ...v])).rows[0].id;
            await x.c.query("DELETE FROM trip_stop_person WHERE stop_id=$1", [sid]);
            for (const pid of new Set(st.people)) await x.c.query("INSERT INTO trip_stop_person(stop_id,profile_id) VALUES($1,$2)", [sid, pid]);
            // 7: its task, already sent, follows the step.
            await syncStopTask(x.c, x.org, tripId, sid);
          }
          return { id: tripId };
        }
        case "suggestStops": {
          need();
          const tripId = await tripOfItem(x, "trip_vehicle", input.vehicleId);
          await tripRow(x, tripId, true);
          await proposeStops(x.c, input.vehicleId);
          return { id: tripId };
        }
        case "tasks": {
          need();
          const t = await tripRow(x, input.tripId, true);
          return { id: input.tripId, ...(await saveTripTasks(x.c, x.org, x.userId, t, input.items)) };
        }
        case "estimate":
          // The estimate reaches outside: it runs apart (estimateStop), never inside a transaction.
          throw new AccessError("INVALID_INPUT", 400);
        case "importInvited": {
          need();
          const t = await tripRow(x, input.tripId, true);
          if (!t.calendar_event_id) throw new AccessError("NO_EVENT", 409);
          // 5: those invited to the linked event (not withdrawn, not absent), with their role in the team.
          const added = await x.c.query(
            `INSERT INTO trip_participant(trip_id,profile_id,role)
             SELECT $1,i.profile_id,
                    CASE WHEN EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=i.profile_id AND m.organization_id=$2 AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL) THEN 'coach'
                         WHEN EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=i.profile_id AND m.organization_id=$2 AND m.role IN ('assistant','volunteer') AND NOT m.cancelled AND m.closed_at IS NULL) THEN 'assistant'
                         ELSE 'player' END
               FROM attendance_register r JOIN attendance_invitation i ON i.register_id=r.id AND i.withdrawn_at IS NULL
               JOIN club_person cp ON cp.id=i.profile_id AND cp.organization_id=$2
              WHERE r.event_id=$3 AND r.organization_id=$2 AND i.response<>'absent'
             ON CONFLICT(trip_id,profile_id) DO NOTHING`,
            [input.tripId, x.org, t.calendar_event_id],
          );
          await requestForTrip(x.c, x.org, x.userId, input.tripId);
          return { id: input.tripId, added: added.rowCount ?? 0 };
        }
        case "settings": {
          if (!(x.mfa && (x.role === "club_president" || x.rights.includes("mandates.manage")))) throw new AccessError("FORBIDDEN");
          await x.c.query("UPDATE organization SET mileage_rate_cents=$2 WHERE id=$1", [x.org, input.mileageRateCents]);
          await audit(x.c, x.org, x.userId, "trip.mileage_rate", x.org);
          return { id: x.org };
        }
        case "removeVehicle": {
          need();
          const tripId = await tripOfItem(x, "trip_vehicle", input.id);
          await x.c.query("DELETE FROM trip_vehicle WHERE id=$1", [input.id]);
          return { id: tripId };
        }
        case "schedule": {
          need();
          const t = await tripRow(x, input.tripId, true);
          if (input.day < t.starts_on || input.day > t.ends_on)
            throw new AccessError("INVALID_DATE", 400);
          const v = [input.day, input.time, input.title, input.place, input.notes];
          if (input.id) {
            const changed = await x.c.query(
              "UPDATE trip_schedule_item SET day=$3,time=$4,title=$5,place=$6,notes=$7 WHERE id=$1 AND trip_id=$2",
              [input.id, input.tripId, ...v],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          } else
            await x.c.query(
              "INSERT INTO trip_schedule_item(trip_id,day,time,title,place,notes) VALUES($1,$2,$3,$4,$5,$6)",
              [input.tripId, ...v],
            );
          return { id: input.tripId };
        }
        case "removeSchedule": {
          need();
          const tripId = await tripOfItem(x, "trip_schedule_item", input.id);
          await x.c.query("DELETE FROM trip_schedule_item WHERE id=$1", [input.id]);
          return { id: tripId };
        }
        case "checklist": {
          need();
          await tripRow(x, input.tripId, true);
          const next = (
            await x.c.query(
              "SELECT COALESCE(max(position),-1)+1 AS n FROM trip_checklist_item WHERE trip_id=$1",
              [input.tripId],
            )
          ).rows[0].n;
          await x.c.query(
            "INSERT INTO trip_checklist_item(trip_id,label,position) VALUES($1,$2,$3)",
            [input.tripId, input.label, next],
          );
          return { id: input.tripId };
        }
        case "tick": {
          const tripId = await tripOfItem(x, "trip_checklist_item", input.itemId);
          if (!x.manage && !(await travellingStaff(x, tripId)))
            throw new AccessError("FORBIDDEN");
          await x.c.query(
            "UPDATE trip_checklist_item SET done_at=CASE WHEN $2 THEN now() END,done_by=CASE WHEN $2 THEN $3 END WHERE id=$1",
            [input.itemId, input.done, x.userId],
          );
          return { id: tripId };
        }
        case "removeChecklist": {
          need();
          const tripId = await tripOfItem(x, "trip_checklist_item", input.itemId);
          await x.c.query("DELETE FROM trip_checklist_item WHERE id=$1", [input.itemId]);
          return { id: tripId };
        }
        case "budget": {
          need();
          if (!x.rights.includes("dues.manage") && x.role !== "club_president")
            throw new AccessError("FORBIDDEN");
          await tripRow(x, input.tripId, true);
          await x.c.query("DELETE FROM trip_budget_line WHERE trip_id=$1", [input.tripId]);
          for (const l of input.lines)
            await x.c.query(
              "INSERT INTO trip_budget_line(trip_id,label,planned_cents) VALUES($1,$2,$3)",
              [input.tripId, l.label, l.plannedCents],
            );
          await x.c.query(
            "UPDATE trip SET budget_cents=$2 WHERE id=$1",
            [input.tripId, input.lines.reduce((n, l) => n + l.plannedCents, 0)],
          );
          return { id: input.tripId };
        }
        case "care": {
          const t = await tripRow(x, input.tripId);
          if (!x.manage && !(await travellingStaff(x, input.tripId)))
            throw new AccessError("FORBIDDEN");
          if (input.day < t.starts_on || input.day > t.ends_on)
            throw new AccessError("INVALID_DATE", 400);
          const ok = await x.c.query(
            "SELECT 1 FROM care_instruction ci JOIN trip_participant tp ON tp.profile_id=ci.profile_id AND tp.trip_id=$2 WHERE ci.id=$1 AND ci.organization_id=$3",
            [input.instructionId, input.tripId, x.org],
          );
          if (!ok.rowCount) throw new AccessError("NOT_FOUND", 404);
          if (input.done)
            await x.c.query(
              "INSERT INTO trip_care_done(trip_id,instruction_id,day,done_by,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT(trip_id,instruction_id,day) DO UPDATE SET done_at=now(),done_by=EXCLUDED.done_by,note=EXCLUDED.note",
              [input.tripId, input.instructionId, input.day, x.userId, input.note],
            );
          else
            await x.c.query(
              "DELETE FROM trip_care_done WHERE trip_id=$1 AND instruction_id=$2 AND day=$3",
              [input.tripId, input.instructionId, input.day],
            );
          return { id: input.tripId };
        }
        case "fleet": {
          need();
          const v = [
            input.name,
            input.kind,
            input.plate,
            input.owner,
            input.seats,
            input.wheelchairPlaces,
            input.rampOrLift,
            input.licence,
            input.insuranceUntil,
            input.inspectionUntil,
            input.notes,
            input.archived,
          ];
          if (input.id) {
            const changed = await x.c.query(
              "UPDATE club_vehicle SET name=$3,kind=$4,plate=$5,owner=$6,seats=$7,wheelchair_places=$8,ramp_or_lift=$9,licence=$10,insurance_until=$11,inspection_until=$12,notes=$13,archived=$14 WHERE id=$1 AND organization_id=$2",
              [input.id, x.org, ...v],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: input.id };
          }
          const id = (
            await x.c.query(
              "INSERT INTO club_vehicle(organization_id,name,kind,plate,owner,seats,wheelchair_places,ramp_or_lift,licence,insurance_until,inspection_until,notes,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
              [x.org, ...v],
            )
          ).rows[0].id as string;
          return { id };
        }
        case "licence": {
          need();
          await sameClubPeople(x, [input.profileId]);
          if (!input.categories.length)
            await x.c.query("DELETE FROM driver_licence WHERE profile_id=$1", [
              input.profileId,
            ]);
          else
            await x.c.query(
              "INSERT INTO driver_licence(profile_id,organization_id,categories,valid_until,updated_by,obtained_on) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(profile_id) DO UPDATE SET categories=EXCLUDED.categories,valid_until=EXCLUDED.valid_until,obtained_on=EXCLUDED.obtained_on,updated_by=EXCLUDED.updated_by,updated_at=now()",
              [input.profileId, x.org, [...new Set(input.categories)], input.validUntil, x.userId, input.obtainedOn ?? null],
            );
          return { id: input.profileId };
        }
      }
    },
    expected,
  );
}

/**
 * 8: the driving time from the previous step, when an estimator is on. The
 * call reaches outside: the addresses are read, the estimate made, then the
 * duration written, each apart.
 */
export async function estimateStop(db: Pool, p: Principal, stopId: string, expected: string) {
  const ask = await scope(
    db,
    p,
    false,
    async (x) => {
      if (!x.manage) throw new AccessError("FORBIDDEN");
      const tripId = (
        await x.c.query("SELECT v.trip_id FROM trip_stop s JOIN trip_vehicle v ON v.id=s.trip_vehicle_id JOIN trip t ON t.id=v.trip_id WHERE s.id=$1 AND t.organization_id=$2", [stopId, x.org])
      ).rows[0]?.trip_id as string | undefined;
      if (!tripId) throw new AccessError("NOT_FOUND", 404);
      const t = await tripRow(x, tripId);
      const participants = (await x.c.query("SELECT tp.id,tp.profile_id,tp.chair,tp.status,cp.full_name FROM trip_participant tp JOIN club_person cp ON cp.id=tp.profile_id WHERE tp.trip_id=$1", [tripId])).rows;
      for (const v of await rounds(x.c, x.org, t, participants)) {
        const i = v.stops.findIndex((st) => st.id === stopId);
        if (i > 0) return { from: v.stops[i - 1].where, to: v.stops[i].where };
        if (i === 0) throw new AccessError("NO_PREVIOUS", 409);
      }
      throw new AccessError("NOT_FOUND", 404);
    },
    expected,
  );
  const estimator = routeEstimator();
  if (!estimator) throw new AccessError("ESTIMATOR_OFF", 409);
  if (!ask.from.trim() || !ask.to.trim()) throw new AccessError("NO_ADDRESS", 409);
  const minutes = await estimator.minutes(ask.from, ask.to).catch(() => null);
  if (minutes === null) throw new AccessError("ESTIMATE_FAILED", 502);
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (!x.manage) throw new AccessError("FORBIDDEN");
      const done = await x.c.query(
        "UPDATE trip_stop s SET minutes=$3 FROM trip_vehicle v JOIN trip t ON t.id=v.trip_id WHERE s.id=$1 AND v.id=s.trip_vehicle_id AND t.organization_id=$2 RETURNING v.trip_id",
        [stopId, x.org, Math.min(minutes, 2000)],
      );
      if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
      return { id: done.rows[0].trip_id as string, minutes };
    },
    expected,
  );
}

/**
 * 9: the road sheet, printable and readable on a phone. Each driver and
 * passenger sees his vehicle, its steps and hours, the useful phones; who
 * prepares the trip sees every vehicle. The passengers' care instructions
 * appear only for who holds the sensitive right, and are logged.
 */
export async function roadSheet(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (x) => {
    const t = await tripRow(x, id);
    const staff = await travellingStaff(x, id);
    const participants = (
      await x.c.query("SELECT tp.id,tp.profile_id,tp.role,tp.chair,tp.status,cp.full_name FROM trip_participant tp JOIN club_person cp ON cp.id=tp.profile_id WHERE tp.trip_id=$1 ORDER BY cp.full_name", [id])
    ).rows as { id: string; profile_id: string; role: string; chair: string; status: string; full_name: string }[];
    const all = await rounds(x.c, x.org, t, participants);
    const mineIds = new Set(participants.filter((r) => x.own.has(r.profile_id)).map((r) => r.id));
    const mine = (v: (typeof all)[number]) =>
      v.passengers.some((pid: string) => mineIds.has(pid)) ||
      v.drivers.some((d) => x.own.has(d.profile_id)) ||
      v.stops.some((st) => st.people.some((pid) => x.own.has(pid)));
    const wide = x.readAll || staff;
    const vehicles = all.filter((v) => wide || mine(v));
    if (!vehicles.length && !wide && !mineIds.size) throw new AccessError("NOT_FOUND", 404);
    const drives = (v: (typeof all)[number]) => wide || v.drivers.some((d) => x.own.has(d.profile_id));
    const sensitive = x.mfa && (x.rights.includes("people.sensitive") || x.grants.includes("people.sensitive"));
    const riders = [...new Set(vehicles.flatMap((v) => v.passengers as string[]))];
    const riderProfiles = participants.filter((r) => riders.includes(r.id)).map((r) => r.profile_id);
    const care =
      sensitive && riderProfiles.length
        ? (
            await x.c.query("SELECT id,profile_id,moment,time,ciphertext FROM care_instruction WHERE organization_id=$1 AND active AND profile_id=ANY($2::uuid[])", [x.org, riderProfiles])
          ).rows.map(({ ciphertext, ...r }) => ({ ...r, ...unseal<Care>(ciphertext, careAad(r.id)) }))
        : [];
    if (care.length) await logSensitiveAccess(x.c, x.org, x.userId, null, "trip_care", id);
    const name = (pid: string) => participants.find((r) => r.id === pid)?.full_name ?? "";
    return {
      organization_id: x.org,
      trip: { id: t.id, title: t.title, starts_on: t.starts_on as string, ends_on: t.ends_on as string, contact: t.contact as string, emergency: t.emergency as string, destination: (t.venue_name ?? t.place_name ?? t.destination) as string },
      serves: await serves(x, t),
      sensitive,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        kind: v.kind,
        booking_ref: drives(v) ? v.booking_ref : "",
        phones: [
          ...v.drivers.map((d) => ({ who: d.full_name, phone: d.phone, role: "driver" as const })),
          ...(v.rental_phone ? [{ who: v.rental_company || v.rental_name, phone: v.rental_phone, role: "rental" as const }] : []),
          ...(v.owner_phone && drives(v) ? [{ who: v.owner_name, phone: v.owner_phone, role: "owner" as const }] : []),
        ].filter((q) => q.phone),
        // Who rides: all of them for drivers and staff, only oneself for a passenger.
        passengers: (v.passengers as string[]).filter((pid) => drives(v) || mineIds.has(pid)).map(name),
        stops: v.stops.map((st) => ({ id: st.id, kind: st.kind, label: st.label, where: st.where, at: st.at, minutes: st.minutes, notes: st.notes, people: st.people_names, route: st.route })),
        care: care
          .filter((c) => participants.some((r) => r.profile_id === c.profile_id && (v.passengers as string[]).includes(r.id)))
          .map((c) => ({ id: c.id, who: participants.find((r) => r.profile_id === c.profile_id)?.full_name ?? "", moment: c.moment, time: c.time, title: c.title, details: c.details })),
      })),
    };
  });
}

/** Care instructions of one player, for their profile page. */
export async function careFor(c: PoolClient, org: string, profileId: string) {
  return (
    await c.query(
      "SELECT id,moment,time,ciphertext,active,updated_at FROM care_instruction WHERE organization_id=$1 AND profile_id=$2 ORDER BY active DESC,updated_at DESC",
      [org, profileId],
    )
  ).rows.map(({ ciphertext, ...r }) => ({
    ...r,
    ...unseal<Care>(ciphertext, careAad(r.id)),
  }));
}
export async function saveCare(
  c: PoolClient,
  org: string,
  userId: string,
  profileId: string,
  i: { id?: string; moment: string; time: string; title: string; details: string; active: boolean },
) {
  if (i.id) {
    const changed = await c.query(
      "UPDATE care_instruction SET moment=$4,time=$5,ciphertext=$6,active=$7,updated_at=now() WHERE id=$1 AND organization_id=$2 AND profile_id=$3",
      [i.id, org, profileId, i.moment, i.time, seal({ title: i.title, details: i.details }, careAad(i.id)), i.active],
    );
    if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
    return i.id;
  }
  // The id is chosen first: it is part of the sealed data's authentication.
  const id = (await c.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
  await c.query(
    "INSERT INTO care_instruction(id,organization_id,profile_id,moment,time,ciphertext,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, org, profileId, i.moment, i.time, seal({ title: i.title, details: i.details }, careAad(id)), i.active, userId],
  );
  return id;
}
