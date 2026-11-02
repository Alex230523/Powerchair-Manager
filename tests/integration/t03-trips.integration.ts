import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { roadSheet, saveCare, tripDetail as detailOf, tripExecute, tripsView } from "../../src/domains/trips/service";
import type { Round } from "../../src/domains/trips/rounds";

/**
 * 3: a rental with its pick-up and return steps, the club's vehicle without
 * an agency, a wheelchair capacity exceeded, a driver without the right
 * licence, the tasks sent once then updated (one with two people), a trip
 * serving a tournament day, the former trips taken over, a passenger's road
 * sheet without the others' health data, two clubs.
 */
const schema = "t03_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, driver: Principal, player: Principal;
let driverProfile: string, helperProfile: string, playerProfile: string, otherProfile: string, tripId: string, van: string, minibus: string;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
/** The full view (who prepares the trip): its vehicles carry their round and checks. */
const tripDetail = async (database: Pool, p: Principal, id: string) => {
  const d = await detailOf(database, p, id);
  return { ...d, vehicles: d.vehicles as Round[] };
};
const run = (p: Principal, body: Record<string, unknown>, org = clubA) => tripExecute(db, p, body as never, org) as Promise<{ id: string; vehicleId?: string; created?: number; updated?: number }>;

async function actor(org: string, role: string, name: string, roles = "{coach}") {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles,phone) VALUES($1,$2,$3,$4,'0470 00 00 01') RETURNING id", [org, person, name, roles])).rows[0].id as string;
  return { p, profile };
}
const base = (title: string, starts: string, ends = starts) => ({
  title,
  kind: "away_match",
  startsOn: starts,
  endsOn: ends,
  sharedVenueId: null,
  placeId: null,
  destination: "Sporthal Gent, Gent",
  meetingPoint: "Local du club, Namur",
  departureAt: `${starts}T08:00:00+01:00`,
  returnAt: `${starts}T18:00:00+01:00`,
  returnPoint: "",
  accommodation: "",
  accommodationAccessible: null,
  emergency: "",
  contact: "",
  notes: "",
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const d = await actor(clubA, "coach", "Chauffeur Un"),
    h = await actor(clubA, "coach", "Aide Deux"),
    pl = await actor(clubA, "player", "Joueur Fauteuil", "{player}"),
    o = await actor(clubA, "player", "Autre Joueur", "{player}");
  [driver, driverProfile, helperProfile, player, playerProfile, otherProfile] = [d.p, d.profile, h.profile, pl.p, pl.profile, o.profile];
  // The driver declared a B licence; the minibus needs D1.
  await db.query("INSERT INTO driver_licence(profile_id,organization_id,categories,updated_by,verified_on) VALUES($1,$2,'{B}',$3,CURRENT_DATE)", [driverProfile, clubA, president.userId]);
  van = (await db.query("INSERT INTO club_vehicle(organization_id,name,seats,wheelchair_places,ramp_or_lift,licence) VALUES($1,'Camionnette du club',5,1,true,'B') RETURNING id", [clubA])).rows[0].id;
  minibus = (await db.query("INSERT INTO club_vehicle(organization_id,name,seats,wheelchair_places,ramp_or_lift,licence) VALUES($1,'Minibus',8,2,true,'D1') RETURNING id", [clubA])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("takes the former trips over: several days a stay, one day a transport (twice the same)", async () => {
  await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Stage','camp',$2,$3,$4),($1,'Match','away_match',$2,$2,$4)", [clubA, day(30), day(32), president.userId]);
  await db.query("ALTER TABLE trip DROP COLUMN mode CASCADE");
  const sql = await readFile("db/migrations/0086_trip_transport.sql", "utf8");
  await db.query(sql);
  await db.query(sql);
  const rows = (await db.query("SELECT title,mode FROM trip WHERE organization_id=$1 ORDER BY title", [clubA])).rows;
  expect(rows).toEqual([
    { title: "Match", mode: "transport" },
    { title: "Stage", mode: "stay" },
  ]);
});

it("proposes a rental's pick-up and return, none for the club's vehicle", async () => {
  tripId = (await run(president, { action: "create", locale: "fr", ...base("Match à Gand", day(20)) })).id;
  expect((await db.query("SELECT mode FROM trip WHERE id=$1", [tripId])).rows[0].mode).toBe("transport");
  const common = { tripId, legs: "both", driverProfileId: null, driverPhone: "", notes: "", passengers: [] };
  const rental = await run(president, {
    action: "vehicle",
    ...common,
    vehicleId: null,
    kind: "rental",
    name: "Camionnette louée",
    seats: 8,
    wheelchairPlaces: 2,
    ramp: true,
    pickupAddress: "Agence Ucar, Namur",
    plannedCostCents: 18000,
    drivers: [{ profileId: driverProfile, legs: "both" }],
  });
  const club = await run(president, { action: "vehicle", ...common, vehicleId: van, kind: "club", name: "Camionnette du club", seats: 5, wheelchairPlaces: 1 });
  const d = await tripDetail(db, president, tripId);
  const kinds = (id: string) => d.vehicles.find((v) => v.id === id)!.stops.map((s) => s.kind);
  expect(kinds(rental.vehicleId!)).toEqual(["pickup_vehicle", "load_equipment", "pick_passengers", "arrive", "reload", "unload", "return_vehicle"]);
  expect(kinds(club.vehicleId!)).not.toContain("pickup_vehicle");
  expect(kinds(club.vehicleId!)).not.toContain("return_vehicle");
  // The return goes back to the agency, and a route link leads from the agency to the club.
  const r = d.vehicles.find((v) => v.id === rental.vehicleId)!;
  expect(r.stops.at(-1)!.where).toBe("Agence Ucar, Namur");
  expect(r.stops[1].route!.google).toContain("origin=Agence%20Ucar%2C%20Namur");
  expect(d.costs!.rental).toBe(18000);
});

it("says when the wheelchair places are exceeded, and when a driver lacks the licence", async () => {
  await run(president, { action: "addParticipants", tripId, people: [{ profileId: playerProfile, role: "player" }, { profileId: otherProfile, role: "player" }] });
  const parts = (await tripDetail(db, president, tripId)).participants;
  for (const x of parts) await run(president, { action: "participant", participantId: x.id, status: "confirmed", chair: "powerchair", needs: "" });
  const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name) VALUES($1,'Fauteuil du club 1') RETURNING id", [clubA])).rows[0].id;
  const v = await run(president, {
    action: "vehicle",
    tripId,
    vehicleId: minibus,
    kind: "club",
    name: "Minibus",
    legs: "both",
    driverProfileId: null,
    driverPhone: "",
    seats: 8,
    wheelchairPlaces: 2,
    notes: "",
    passengers: parts.map((x) => x.id),
    chairs: [chair],
    drivers: [{ profileId: driverProfile, legs: "out" }, { profileId: helperProfile, legs: "back" }],
  });
  const m = (await tripDetail(db, president, tripId)).vehicles.find((x) => x.id === v.vehicleId)!;
  expect(m.check).toMatchObject({ inChair: 2, chairs: 1, places: 3, wheelchairPlaces: 2, problems: ["wheelchair"] });
  expect(m.drivers.map((x) => [x.full_name, x.covers])).toEqual([
    ["Chauffeur Un", false],
    ["Aide Deux", false],
  ]);
  // A chair of another club is refused.
  const foreign = (await db.query("INSERT INTO equipment_chair(organization_id,name) VALUES($1,'Fauteuil B') RETURNING id", [clubB])).rows[0].id;
  await expect(run(president, { action: "vehicle", tripId, id: v.vehicleId, vehicleId: minibus, kind: "club", name: "Minibus", legs: "both", driverProfileId: null, driverPhone: "", seats: 8, wheelchairPlaces: 2, notes: "", passengers: [], chairs: [foreign] })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("sends the tasks once, then updates them; a step moved moves its task", async () => {
  let d = await tripDetail(db, president, tripId);
  const pickup = d.tasks.find((t) => t.kind === "pickup_vehicle")!;
  const book = d.tasks.find((t) => t.kind === "book")!;
  expect(book.people).toEqual([driverProfile]);
  const items = [
    { key: book.key, title: "Réserver la camionnette", dueOn: book.dueOn, time: "", people: [driverProfile] },
    { key: pickup.key, title: "Aller chercher la camionnette", dueOn: pickup.dueOn, time: pickup.time, people: [driverProfile, helperProfile] },
  ];
  expect(await run(president, { action: "tasks", tripId, items })).toMatchObject({ created: 2, updated: 0 });
  expect(await run(president, { action: "tasks", tripId, items: [{ ...items[0], title: "Réserver la camionnette chez Ucar" }, items[1]] })).toMatchObject({ created: 0, updated: 2 });
  const rows = (await db.query("SELECT id,title,category,kind,trip_id FROM task WHERE organization_id=$1 AND trip_id=$2 ORDER BY title", [clubA, tripId])).rows;
  expect(rows.map((r) => [r.title, r.category, r.kind])).toEqual([
    ["Aller chercher la camionnette", "sport", "transport"],
    ["Réserver la camionnette chez Ucar", "sport", "transport"],
  ]);
  const two = rows[0].id;
  expect((await db.query("SELECT profile_id FROM task_assignee WHERE task_id=$1 ORDER BY profile_id", [two])).rows.map((r) => r.profile_id).sort()).toEqual([driverProfile, helperProfile].sort());
  // The pick-up step moves to 07:15 two days later: its task follows, no second one.
  d = await tripDetail(db, president, tripId);
  const rental = d.vehicles.find((v) => v.kind === "rental")!;
  await run(president, {
    action: "stops",
    vehicleId: rental.id,
    stops: rental.stops.map((s) => ({ id: s.id, kind: s.kind, label: s.label, placeId: s.place_id, sharedVenueId: s.shared_venue_id, address: s.address, at: s.kind === "pickup_vehicle" ? `${day(22)}T07:15:00+01:00` : s.at, minutes: s.minutes, notes: s.notes, people: s.people })),
  });
  const moved = (await db.query("SELECT due_on::text AS due_on,count(*) OVER () AS n FROM task WHERE id=$1", [two])).rows[0];
  expect(moved.due_on).toBe(day(22));
  expect(Number((await db.query("SELECT count(*)::int AS n FROM task WHERE trip_id=$1", [tripId])).rows[0].n)).toBe(2);
  // The two people were told.
  expect(Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [driver.userId])).rows[0].n)).toBeGreaterThanOrEqual(1);
});

it("serves one tournament day, not the whole tournament; not another tournament's", async () => {
  const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé','federation') RETURNING id")).rows[0].id;
  const tour = (await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Coupe',2026,'league') RETURNING id", [fed])).rows[0].id;
  await db.query("INSERT INTO tournament_club(tournament_id,organization_id,status) VALUES($1,$2,'accepted')", [tour, clubA]);
  const [day1, day2] = (await db.query("INSERT INTO tournament_day(tournament_id,label,day,venue) VALUES($1,'Journée 1',$2,'Hall Bruges'),($1,'Journée 2',$3,'Hall Gand') RETURNING id", [tour, day(40), day(60)])).rows.map((r) => r.id);
  const other = (await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Autre',2026,'league') RETURNING id", [fed])).rows[0].id;
  const foreignDay = (await db.query("INSERT INTO tournament_day(tournament_id,label,day) VALUES($1,'J1',$2) RETURNING id", [other, day(40)])).rows[0].id;
  const list = await tripsView(db, president);
  expect(list.links.days.map((d) => d.id)).toEqual([day1, day2]);
  const t = (await run(president, { action: "create", locale: "fr", ...base("Journée 2", day(60)), tournamentDayId: day2 })).id;
  expect((await tripsView(db, president)).trips.find((x) => x.id === t)!.serves).toBe("Coupe · Journée 2");
  expect((await tripDetail(db, president, t)).serves).toMatchObject({ kind: "tournamentDay", day: day(60) });
  await expect(run(president, { action: "create", locale: "fr", ...base("Ailleurs", day(40)), tournamentDayId: foreignDay })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("gives a passenger his road sheet without the others' care; the president sees them", async () => {
  const c = await db.connect();
  try {
    await saveCare(c, clubA, president.userId, otherProfile, { moment: "before_play", time: "", title: "Sangle de sécurité", details: "Serrer la sangle", active: true });
  } finally {
    c.release();
  }
  const mine = await roadSheet(db, player, tripId);
  expect(mine.sensitive).toBe(false);
  const bus = mine.vehicles.find((v) => v.name === "Minibus")!;
  expect(bus.passengers).toEqual(["Joueur Fauteuil"]);
  expect(bus.care).toEqual([]);
  expect(bus.stops.length).toBeGreaterThan(0);
  expect(JSON.stringify(mine)).not.toContain("Sangle");
  // The rental he does not ride is not on his sheet.
  expect(mine.vehicles.map((v) => v.name)).toEqual(["Minibus"]);
  const all = await roadSheet(db, president, tripId);
  expect(all.vehicles.find((v) => v.name === "Minibus")!.care.map((x) => x.title)).toEqual(["Sangle de sécurité"]);
  // The driver sees his vehicles' passengers, not the care (no sensitive right).
  const drv = await roadSheet(db, driver, tripId);
  expect(drv.vehicles.find((v) => v.name === "Minibus")!.passengers).toHaveLength(2);
  expect(JSON.stringify(drv)).not.toContain("Sangle");
});

it("keeps two clubs apart", async () => {
  await expect(tripDetail(db, presidentB, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(roadSheet(db, presidentB, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const v = (await tripDetail(db, president, tripId)).vehicles[0];
  await expect(run(presidentB, { action: "stops", vehicleId: v.id, stops: [] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "tasks", tripId, items: [] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(president, { action: "create", locale: "fr", ...base("Profil B", day(10)), matchId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A player cannot change a round.
  await expect(run(player, { action: "stops", vehicleId: v.id, stops: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await tripsView(db, presidentB)).trips).toEqual([]);
});
