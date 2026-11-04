import type { PoolClient } from "pg";
import { AccessError } from "../access/service";
import { tellTaskResponsible } from "../tasks/service";
import { driverWarnings } from "./schema";
import { licenceCovers, routeLinks, suggestStops, transportCheck, transportCosts, tripTaskDrafts, type StopKind, type VehicleKind } from "./transport";

/**
 * 3: the vehicles of a trip with their round (steps, people, route links),
 * their drivers, the chairs they carry and the load check; the tasks drawn
 * from the rounds; the costs. Every query is bound to the trip, itself
 * checked in the club by the caller.
 */
type Participant = { id: string; profile_id: string; chair: string; status: string; full_name: string };
export type Stop = {
  id: string;
  trip_vehicle_id: string;
  position: number;
  kind: StopKind;
  label: string;
  place_id: string | null;
  shared_venue_id: string | null;
  address: string;
  at: string | null;
  minutes: number | null;
  notes: string;
  place_name: string | null;
  where: string;
  people: string[];
  people_names: string[];
  task_id: string | null;
  task_status: string | null;
  route: { google: string; waze: string } | null;
};

type VehicleRow = {
  id: string;
  trip_id: string;
  vehicle_id: string | null;
  name: string;
  legs: "both" | "out" | "back";
  driver_profile_id: string | null;
  driver_phone: string;
  seats: number;
  wheelchair_places: number;
  notes: string;
  kind: VehicleKind;
  rental_contact_id: string | null;
  pickup_address: string;
  return_address: string;
  booking_ref: string;
  planned_cost_cents: number | null;
  deposit_cents: number | null;
  owner_profile_id: string | null;
  owner_contact_id: string | null;
  ramp: boolean;
  mileage: boolean;
  distance_km: number | null;
  fuel_cents: number | null;
  equipment: string;
  licence: string | null;
  insurance_until: string | null;
  inspection_until: string | null;
  ramp_or_lift: boolean | null;
  driver_name: string | null;
  phone: string | null;
  rental_name: string | null;
  rental_company: string | null;
  rental_phone: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  passengers: string[];
};

export async function rounds(c: PoolClient, org: string, trip: { id: string; ends_on: string; starts_on: string }, participants: Participant[]) {
  const rows = (
    await c.query(
      `SELECT tv.*,cv.licence,cv.insurance_until::text AS insurance_until,cv.inspection_until::text AS inspection_until,cv.ramp_or_lift,
              d.full_name AS driver_name,COALESCE(NULLIF(tv.driver_phone,''),d.phone) AS phone,
              rc.full_name AS rental_name,rc.organization_name AS rental_company,rc.phone AS rental_phone,
              COALESCE(op.full_name,oc.full_name) AS owner_name,COALESCE(NULLIF(op.phone,''),oc.phone) AS owner_phone,
              COALESCE((SELECT array_agg(participant_id) FROM trip_passenger WHERE trip_vehicle_id=tv.id),'{}') AS passengers
         FROM trip_vehicle tv LEFT JOIN club_vehicle cv ON cv.id=tv.vehicle_id AND cv.organization_id=$2
         LEFT JOIN club_person d ON d.id=tv.driver_profile_id AND d.organization_id=$2
         LEFT JOIN contact rc ON rc.id=tv.rental_contact_id AND rc.organization_id=$2
         LEFT JOIN club_person op ON op.id=tv.owner_profile_id AND op.organization_id=$2
         LEFT JOIN contact oc ON oc.id=tv.owner_contact_id AND oc.organization_id=$2
        WHERE tv.trip_id=$1 ORDER BY tv.legs,tv.name`,
      [trip.id, org],
    )
  ).rows as VehicleRow[];
  const ids = rows.map((v) => v.id as string);
  const drivers = (
    await c.query(
      `SELECT d.trip_vehicle_id,d.profile_id,d.legs,cp.full_name,cp.phone,dl.categories,dl.valid_until::text AS valid_until,dl.verified_on IS NOT NULL AS verified
         FROM trip_vehicle_driver d JOIN club_person cp ON cp.id=d.profile_id AND cp.organization_id=$2 LEFT JOIN driver_licence dl ON dl.profile_id=d.profile_id AND dl.organization_id=$2
        WHERE d.trip_vehicle_id=ANY($1::uuid[]) ORDER BY CASE d.legs WHEN 'both' THEN 0 WHEN 'out' THEN 1 ELSE 2 END,cp.full_name`,
      [ids, org],
    )
  ).rows as { trip_vehicle_id: string; profile_id: string; legs: string; full_name: string; phone: string; categories: string[] | null; valid_until: string | null; verified: boolean }[];
  const chairs = (
    await c.query(
      `SELECT vc.trip_vehicle_id,ch.id,chair_label(ch.id) AS name,ch.ownership FROM trip_vehicle_chair vc JOIN equipment_chair ch ON ch.id=vc.chair_id AND ch.organization_id=$2
        WHERE vc.trip_vehicle_id=ANY($1::uuid[]) ORDER BY ch.name`,
      [ids, org],
    )
  ).rows as { trip_vehicle_id: string; id: string; name: string; ownership: string }[];
  const stops = (
    await c.query(
      `SELECT s.id,s.trip_vehicle_id,s.position,s.kind,s.label,s.place_id,s.shared_venue_id,s.address,s.at,s.minutes,s.notes,
              COALESCE(pl.name,v.name) AS place_name,
              COALESCE(NULLIF(s.address,''),NULLIF(pl.address,''),NULLIF(concat_ws(', ',NULLIF(v.address,''),NULLIF(v.city,'')),''),pl.name,v.name,'') AS "where",
              COALESCE((SELECT array_agg(sp.profile_id ORDER BY cp.full_name) FROM trip_stop_person sp JOIN club_person cp ON cp.id=sp.profile_id WHERE sp.stop_id=s.id),'{}') AS people,
              COALESCE((SELECT array_agg(cp.full_name ORDER BY cp.full_name) FROM trip_stop_person sp JOIN club_person cp ON cp.id=sp.profile_id WHERE sp.stop_id=s.id),'{}') AS people_names,
              t.id AS task_id,t.status AS task_status
         FROM trip_stop s LEFT JOIN calendar_place pl ON pl.id=s.place_id AND pl.organization_id=$3 LEFT JOIN shared_venue v ON v.id=s.shared_venue_id
         LEFT JOIN task t ON t.organization_id=$3 AND t.source_key='trip:'||$2::text||':stop:'||s.id
        WHERE s.trip_vehicle_id=ANY($1::uuid[]) ORDER BY s.trip_vehicle_id,s.position,s.at NULLS LAST`,
      [ids, trip.id, org],
    )
  ).rows as Omit<Stop, "route">[];
  const vehicles = rows.map((v) => {
    const own = drivers.filter((d) => d.trip_vehicle_id === v.id);
    const carried = chairs.filter((ch) => ch.trip_vehicle_id === v.id);
    const round = stops.filter((s) => s.trip_vehicle_id === v.id).map((s, i, all): Stop => ({ ...s, at: s.at ? new Date(s.at).toISOString() : null, route: s.kind === "pick_passengers" && i === 0 ? null : i > 0 ? routeLinks(all[i - 1].where, s.where) : null }));
    const driverIds = new Set(own.map((d) => d.profile_id));
    const riders = participants.filter((r) => v.passengers.includes(r.id) && !driverIds.has(r.profile_id));
    const need = v.vehicle_id ? (v.licence ?? "B") : "B";
    const ramp = v.kind === "club" && v.vehicle_id ? !!v.ramp_or_lift || !!v.ramp : !!v.ramp;
    const check = transportCheck({ seats: v.seats, wheelchairPlaces: v.wheelchair_places, ramp }, riders.map((r) => ({ inChair: r.chair === "powerchair" || r.chair === "both" })), carried.length, true);
    const first = own[0];
    return {
      ...v,
      need,
      has_ramp: ramp,
      drivers: own.map((d) => ({ ...d, covers: !!d.categories && licenceCovers(need, d.categories, d.valid_until, trip.ends_on) })),
      chairs: carried,
      stops: round,
      check,
      // The former view keeps its shape: seats and chairs used, and what is over.
      load: { seated: check.seated, chairs: check.places, seatsOver: Math.max(0, check.seated - check.seats), chairsOver: Math.max(0, check.places - check.wheelchairPlaces) },
      warnings: driverWarnings(
        v.vehicle_id ? { licence: v.licence ?? "B", insurance_until: v.insurance_until, inspection_until: v.inspection_until } : null,
        first?.categories ? { categories: first.categories, valid_until: first.valid_until } : null,
        trip.ends_on,
      ),
    };
  });
  return vehicles;
}
export type Round = Awaited<ReturnType<typeof rounds>>[number];

/** The tasks already sent to the to-do from this trip's rounds, by key. */
export async function tripTasks(c: PoolClient, org: string, tripId: string) {
  return (
    await c.query(
      `SELECT t.id,substr(t.source_key,length('trip:'||$2::text||':')+1) AS key,t.title,t.status,t.due_on::text AS due_on,
              COALESCE((SELECT array_agg(a.profile_id) FROM task_assignee a WHERE a.task_id=t.id AND a.profile_id IS NOT NULL),'{}') AS people
         FROM task t WHERE t.organization_id=$1 AND t.trip_id=$2::uuid AND t.source_key LIKE 'trip:'||$2::text||':%' ORDER BY t.due_on NULLS LAST,t.title`,
      [org, tripId],
    )
  ).rows as { id: string; key: string; title: string; status: string; due_on: string | null; people: string[] }[];
}

/** The drafts of the « Créer les tâches » list: from the rounds, with what was already sent. */
export function drafts(tripDay: string, vehicles: Round[], sent: Awaited<ReturnType<typeof tripTasks>>) {
  return tripTaskDrafts(
    tripDay,
    vehicles.map((v) => ({ id: v.id, kind: v.kind, drivers: v.drivers.map((d) => d.profile_id), stops: v.stops.map((s) => ({ id: s.id, kind: s.kind, at: s.at, people: s.people })) })),
  ).map((d) => {
    const done = sent.find((t) => t.key === d.key);
    return { ...d, task: done ?? null };
  });
}

export const costs = (vehicles: Round[], rate: number | null) => transportCosts(vehicles, rate);

/** Inserts the steps proposed for a vehicle's kind, when it has none. */
export async function proposeStops(c: PoolClient, vehicleId: string) {
  if ((await c.query("SELECT 1 FROM trip_stop WHERE trip_vehicle_id=$1 LIMIT 1", [vehicleId])).rowCount) return;
  const v = (
    await c.query(
      `SELECT tv.kind,tv.pickup_address,tv.return_address,t.meeting_point,t.return_point,t.departure_at,t.return_at,
              COALESCE(NULLIF(t.destination,''),concat_ws(', ',NULLIF(sv.address,''),NULLIF(sv.city,'')),pl.address,'') AS destination
         FROM trip_vehicle tv JOIN trip t ON t.id=tv.trip_id LEFT JOIN shared_venue sv ON sv.id=t.shared_venue_id LEFT JOIN calendar_place pl ON pl.id=t.place_id
        WHERE tv.id=$1`,
      [vehicleId],
    )
  ).rows[0];
  if (!v) return;
  const list = suggestStops(
    v.kind,
    { meetingPoint: v.meeting_point, destination: v.destination ?? "", returnPoint: v.return_point, departureAt: v.departure_at ? new Date(v.departure_at).toISOString() : null, returnAt: v.return_at ? new Date(v.return_at).toISOString() : null },
    { pickupAddress: v.pickup_address, returnAddress: v.return_address },
  );
  for (const [i, s] of list.entries())
    await c.query("INSERT INTO trip_stop(trip_vehicle_id,position,kind,address,at) VALUES($1,$2,$3,$4,$5)", [vehicleId, i, s.kind, s.address.slice(0, 300), s.at]);
}

/**
 * 7: the tasks of the « Créer les tâches » list go to the to-do, category
 * Sport, kind transport, linked to the trip. The key makes each one exist
 * once: saving again updates it (title, day, hour, people); a line removed
 * deletes its task when it is still open.
 */
export async function saveTripTasks(
  c: PoolClient,
  org: string,
  userId: string,
  trip: { id: string; title: string; match_id: string | null },
  items: { key: string; title: string; dueOn: string; time: string; people: string[]; remove: boolean }[],
) {
  // Every key names a vehicle or a step of this trip.
  for (const i of items) {
    const [kind, ref] = i.key.split(":");
    const ok =
      kind === "book"
        ? (await c.query("SELECT 1 FROM trip_vehicle WHERE id=$1 AND trip_id=$2", [ref, trip.id])).rowCount
        : (await c.query("SELECT 1 FROM trip_stop s JOIN trip_vehicle v ON v.id=s.trip_vehicle_id WHERE s.id=$1 AND v.trip_id=$2", [ref, trip.id])).rowCount;
    if (!ok) throw new AccessError("NOT_FOUND", 404);
  }
  const people = [...new Set(items.flatMap((i) => i.people))];
  if (people.length && (await c.query("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND status='active' AND id=ANY($2::uuid[])", [org, people])).rows[0].n !== people.length)
    throw new AccessError("NOT_FOUND", 404);
  let created = 0,
    updated = 0;
  for (const i of items) {
    const key = `trip:${trip.id}:${i.key}`;
    const existing = (await c.query("SELECT id,status FROM task WHERE organization_id=$1 AND source_key=$2 FOR UPDATE", [org, key])).rows[0] as { id: string; status: string } | undefined;
    if (i.remove) {
      if (existing && existing.status !== "done") await c.query("DELETE FROM task WHERE id=$1 AND organization_id=$2", [existing.id, org]);
      continue;
    }
    const meeting = i.time ? `${i.dueOn} ${i.time}` : null;
    let id = existing?.id;
    if (id) {
      await c.query(
        `UPDATE task SET title=$3,due_on=$4,meeting_starts_at=CASE WHEN $5::text IS NULL THEN NULL ELSE ($5::timestamp AT TIME ZONE 'Europe/Brussels') END,meeting_ends_at=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2`,
        [id, org, i.title, i.dueOn, meeting],
      );
      updated++;
    } else {
      id = (
        await c.query(
          `INSERT INTO task(organization_id,kind,category,title,detail,due_on,trip_id,match_id,origin,created_by,source_key,source_kind,meeting_starts_at,completion)
           VALUES($1,'transport','sport',$2,$3,$4,$5,$6,'template',$7,$8,'tripStep',CASE WHEN $9::text IS NULL THEN NULL ELSE ($9::timestamp AT TIME ZONE 'Europe/Brussels') END,'any') RETURNING id`,
          [org, i.title, trip.title.slice(0, 160), i.dueOn, trip.id, trip.match_id, userId, key, meeting],
        )
      ).rows[0].id as string;
      created++;
    }
    const before = (await c.query("SELECT profile_id FROM task_assignee WHERE task_id=$1 AND profile_id IS NOT NULL", [id])).rows.map((r) => r.profile_id as string);
    await c.query("UPDATE task SET responsible_id=$3 WHERE id=$1 AND organization_id=$2", [id, org, i.people[0] ?? null]);
    await c.query("DELETE FROM task_assignee WHERE task_id=$1 AND organization_id=$2 AND NOT (profile_id=ANY($3::uuid[]))", [id, org, i.people]);
    for (const pid of i.people) await c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [id, org, pid]);
    if (i.people.some((pid) => !before.includes(pid))) await tellTaskResponsible(c, org, userId, id);
  }
  return { created, updated };
}

/**
 * 7: a step changed (its day, hour or people) updates the task already sent
 * for it, never a second one.
 */
export async function syncStopTask(c: PoolClient, org: string, tripId: string, stopId: string) {
  const s = (await c.query("SELECT at FROM trip_stop WHERE id=$1", [stopId])).rows[0] as { at: Date | null } | undefined;
  const t = (await c.query("SELECT id FROM task WHERE organization_id=$1 AND source_key=$2 AND status<>'done'", [org, `trip:${tripId}:stop:${stopId}`])).rows[0] as { id: string } | undefined;
  if (!s || !t) return;
  if (s.at)
    await c.query(
      "UPDATE task SET due_on=($3::timestamptz AT TIME ZONE 'Europe/Brussels')::date,meeting_starts_at=$3,updated_at=now() WHERE id=$1 AND organization_id=$2",
      [t.id, org, s.at],
    );
  const people = (await c.query("SELECT profile_id FROM trip_stop_person WHERE stop_id=$1", [stopId])).rows.map((r) => r.profile_id as string);
  if (people.length) {
    await c.query("UPDATE task SET responsible_id=$3 WHERE id=$1 AND organization_id=$2", [t.id, org, people[0]]);
    await c.query("DELETE FROM task_assignee WHERE task_id=$1 AND organization_id=$2 AND NOT (profile_id=ANY($3::uuid[]))", [t.id, org, people]);
    for (const pid of people) await c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [t.id, org, pid]);
  }
}
