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
  driverWarnings,
  momentOrder,
  tripDays,
  unassigned,
  vehicleLoad,
  type TripCommand,
} from "./schema";

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

export async function tripsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    const trips = (
      await x.c.query(
        `SELECT t.id,t.title,t.kind,t.status,t.starts_on::text AS starts_on,t.ends_on::text AS ends_on,t.team_id,tm.name AS team_name,tm.color AS team_color,
                COALESCE(v.name,pl.name,NULLIF(t.destination,'')) AS destination,
                count(tp.id) FILTER (WHERE tp.status<>'declined')::int AS travelling,
                count(tp.id) FILTER (WHERE tp.status='confirmed')::int AS confirmed,
                count(tp.id) FILTER (WHERE tp.status<>'declined' AND tp.chair IN ('powerchair','both'))::int AS powerchairs
           FROM trip t LEFT JOIN shared_venue v ON v.id=t.shared_venue_id LEFT JOIN calendar_place pl ON pl.id=t.place_id
           LEFT JOIN trip_participant tp ON tp.trip_id=t.id LEFT JOIN team tm ON tm.id=t.team_id
          WHERE t.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM trip_participant o WHERE o.trip_id=t.id AND o.profile_id=ANY($3::uuid[])))
          GROUP BY t.id,v.name,pl.name,tm.name,tm.color ORDER BY t.starts_on DESC LIMIT 200`,
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
              "SELECT d.profile_id,cp.full_name,d.categories,d.valid_until::text AS valid_until FROM driver_licence d JOIN club_person cp ON cp.id=d.profile_id WHERE d.organization_id=$1 ORDER BY cp.full_name",
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
      // Teams of the open seasons, for the trip's team (wave 15).
      teams: x.manage
        ? ((await x.c.query("SELECT id,name,color FROM team WHERE organization_id=$1 AND NOT archived ORDER BY name", [x.org])).rows as { id: string; name: string; color: string | null }[])
        : [],
    };
  });
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
    const vehicles = (
      await x.c.query(
        `SELECT tv.*,cv.licence,cv.insurance_until::text AS insurance_until,cv.inspection_until::text AS inspection_until,cv.ramp_or_lift,
                d.full_name AS driver_name,COALESCE(NULLIF(tv.driver_phone,''),d.phone) AS phone,
                dl.categories AS driver_categories,dl.valid_until::text AS driver_valid_until,
                COALESCE((SELECT array_agg(participant_id) FROM trip_passenger WHERE trip_vehicle_id=tv.id),'{}') AS passengers
           FROM trip_vehicle tv LEFT JOIN club_vehicle cv ON cv.id=tv.vehicle_id
           LEFT JOIN club_person d ON d.id=tv.driver_profile_id LEFT JOIN driver_licence dl ON dl.profile_id=tv.driver_profile_id
          WHERE tv.trip_id=$1 ORDER BY tv.legs,tv.name`,
        [id],
      )
    ).rows.map((v) => {
      const riders = participantsAll.filter((r) => v.passengers.includes(r.id));
      const driverTravels = participantsAll.some(
        (r) => r.profile_id === v.driver_profile_id,
      );
      return {
        ...v,
        load: vehicleLoad(
          { seats: v.seats, wheelchair_places: v.wheelchair_places, driver: true },
          riders
            .filter((r) => r.profile_id !== v.driver_profile_id || !driverTravels)
            .map((r) => ({ wheelchair: r.chair === "powerchair" || r.chair === "both" })),
        ),
        warnings: driverWarnings(
          v.vehicle_id
            ? {
                licence: v.licence,
                insurance_until: v.insurance_until,
                inspection_until: v.inspection_until,
              }
            : null,
          // No licence on file reads as "not recorded", not as a wrong category.
          v.driver_profile_id && v.driver_categories
            ? {
                categories: v.driver_categories,
                valid_until: v.driver_valid_until,
              }
            : null,
          t.ends_on,
        ),
      };
    });
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
            legs: v.legs,
            driver_name: v.driver_name,
            phone: v.phone,
            passengers: v.passengers.filter((pid: string) => ids.has(pid)),
          })),
        authorizations: { ...auth, people: auth.people.filter((q) => x.own.has(q.id)), missing: 0 },
        checklist: [],
        budget: null,
        documents: [],
        support: [],
        care: null,
        unassigned: { out: [], back: [] },
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
      // A driver who is also a participant travels in their own vehicle.
      unassigned: unassigned(
        participantsAll,
        vehicles.map((v) => ({
          legs: v.legs,
          passengers: [
            ...v.passengers,
            ...participantsAll
              .filter((r) => r.profile_id === v.driver_profile_id)
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
  input: TripCommand,
  expected: string,
) {
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
          await sameClubPeople(x, [input.driverProfileId]);
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
          const ok = (
            await x.c.query(
              "SELECT count(*)::int AS n FROM trip_participant WHERE trip_id=$1 AND id=ANY($2::uuid[])",
              [input.tripId, input.passengers],
            )
          ).rows[0].n;
          if (ok !== new Set(input.passengers).size)
            throw new AccessError("NOT_FOUND", 404);
          const values = [
            input.vehicleId,
            input.name,
            input.legs,
            input.driverProfileId,
            input.driverPhone,
            input.seats,
            input.wheelchairPlaces,
            input.notes,
          ];
          let vid = input.id;
          if (vid) {
            const changed = await x.c.query(
              "UPDATE trip_vehicle SET vehicle_id=$3,name=$4,legs=$5,driver_profile_id=$6,driver_phone=$7,seats=$8,wheelchair_places=$9,notes=$10 WHERE id=$1 AND trip_id=$2",
              [vid, input.tripId, ...values],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await x.c.query("DELETE FROM trip_passenger WHERE trip_vehicle_id=$1", [vid]);
          } else
            vid = (
              await x.c.query(
                "INSERT INTO trip_vehicle(trip_id,vehicle_id,name,legs,driver_profile_id,driver_phone,seats,wheelchair_places,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
                [input.tripId, ...values],
              )
            ).rows[0].id as string;
          for (const pid of new Set(input.passengers))
            await x.c.query(
              "INSERT INTO trip_passenger(trip_vehicle_id,participant_id) VALUES($1,$2)",
              [vid, pid],
            );
          return { id: input.tripId };
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
              "INSERT INTO driver_licence(profile_id,organization_id,categories,valid_until,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(profile_id) DO UPDATE SET categories=EXCLUDED.categories,valid_until=EXCLUDED.valid_until,updated_by=EXCLUDED.updated_by,updated_at=now()",
              [input.profileId, x.org, [...new Set(input.categories)], input.validUntil, x.userId],
            );
          return { id: input.profileId };
        }
      }
    },
    expected,
  );
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
