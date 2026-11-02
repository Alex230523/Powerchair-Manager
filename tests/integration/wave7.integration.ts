import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  tripDetail,
  tripExecute,
  tripsView,
} from "../../src/domains/trips/service";
import type { Round } from "../../src/domains/trips/rounds";
import { playerProfileExecute } from "../../src/domains/player-profile/service";
import { financeExecute } from "../../src/domains/finance/service";
import { venueExecute, venuesView } from "../../src/domains/venues/service";

const schema = "wave7_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  president: Principal,
  coach: Principal,
  player: Principal,
  lea: string,
  coachProfile: string,
  hugo: string;

async function actor(role: string, grants: string[] = [], name?: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, name ?? "Test " + role, userId + "@example.test"],
  );
  const person = (
    await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])
  ).rows[0].id as string;
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [club, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
      [club, userId, role, grants],
    )
  ).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function profile(person: string | null, name: string, roles: string) {
  const pid =
    person ??
    (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,phone) VALUES($1,$2,$3,'2008-01-01',$4,'0470 00 00 00') RETURNING id",
      [club, pid, name, roles],
    )
  ).rows[0].id as string;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const inDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const tripFields = {
  title: "Tournoi de Gand",
  kind: "tournament" as const,
  startsOn: inDays(10),
  endsOn: inDays(11),
  sharedVenueId: null,
  placeId: null,
  destination: "Gand",
  meetingPoint: "Parking du club",
  departureAt: null,
  returnAt: null,
  returnPoint: "",
  accommodation: "Hôtel accessible",
  accommodationAccessible: true,
  emergency: "112",
  contact: "Sophie",
  notes: "",
};

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club vague 7','club') RETURNING id",
    )
  ).rows[0].id;
  president = (await actor("club_president", ["people.sensitive"])).p;
  const c = await actor("coach", [], "Coach Marc");
  coach = c.p;
  coachProfile = await profile(c.person, "Coach Marc", "{coach}");
  const pl = await actor("player", [], "Léa Joueuse");
  player = pl.p;
  lea = await profile(pl.person, "Léa Joueuse", "{player}");
  hugo = await profile(null, "Hugo Joueur", "{player}");
});
beforeEach(() => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("prepares a trip with participants, an adapted vehicle and care, each role seeing its part", async () => {
  const { id } = await tripExecute(
    db,
    president,
    { action: "create", locale: "fr", ...tripFields },
    club,
  );
  await tripExecute(
    db,
    president,
    {
      action: "addParticipants",
      tripId: id,
      people: [
        { profileId: lea, role: "player" },
        { profileId: hugo, role: "player" },
        { profileId: coachProfile, role: "coach" },
      ],
    },
    club,
  );
  let detail = await tripDetail(db, president, id);
  expect(detail.checklist).toHaveLength(9);
  const leaRow = detail.participants.find((p) => p.profile_id === lea)!;
  const hugoRow = detail.participants.find((p) => p.profile_id === hugo)!;
  await tripExecute(
    db,
    president,
    { action: "participant", participantId: leaRow.id, status: "confirmed", chair: "powerchair", needs: "Chargeur" },
    club,
  );
  const bus = await tripExecute(
    db,
    president,
    {
      action: "fleet",
      name: "Minibus adapté",
      kind: "Minibus",
      plate: "1-ABC-123",
      owner: "Club",
      seats: 8,
      wheelchairPlaces: 1,
      rampOrLift: true,
      licence: "D1",
      insuranceUntil: inDays(365),
      inspectionUntil: inDays(365),
      notes: "",
      archived: false,
    },
    club,
  );
  await tripExecute(
    db,
    president,
    {
      action: "vehicle",
      tripId: id,
      vehicleId: bus.id,
      name: "Minibus adapté",
      legs: "both",
      driverProfileId: coachProfile,
      driverPhone: "",
      seats: 8,
      wheelchairPlaces: 1,
      notes: "",
      passengers: [leaRow.id],
    },
    club,
  );
  detail = await tripDetail(db, president, id);
  expect((detail.vehicles as Round[])[0].load).toMatchObject({ chairs: 1, chairsOver: 0 });
  expect((detail.vehicles as Round[])[0].warnings).toEqual(["noLicence"]);
  // The coach drives: only Hugo still needs a seat.
  expect(detail.unassigned.out).toEqual([hugoRow.id]);
  await tripExecute(
    db,
    president,
    { action: "licence", profileId: coachProfile, categories: ["B", "D1"], validUntil: inDays(1000) },
    club,
  );
  expect(((await tripDetail(db, president, id)).vehicles as Round[])[0].warnings).toEqual([]);

  // Care instruction on Léa's profile, then ticked by the travelling coach.
  const saved = await playerProfileExecute(
    db,
    president,
    { action: "care", id: lea, moment: "morning", time: "08:00", title: "Transfert au lève-personne", details: "À deux", active: true },
    club,
  );
  const careId = (saved as { careId: string }).careId;
  const byCoach = await tripDetail(db, coach, id);
  expect(byCoach.can).toMatchObject({ staff: true, manage: false, full: true });
  expect(byCoach.care?.instructions.map((c) => c.title)).toEqual(["Transfert au lève-personne"]);
  await tripExecute(
    db,
    coach,
    { action: "care", tripId: id, instructionId: careId, day: tripFields.startsOn, done: true, note: "" },
    club,
  );
  await tripExecute(db, coach, { action: "tick", itemId: byCoach.checklist[0].id, done: true }, club);
  await expect(
    tripExecute(db, coach, { action: "removeVehicle", id: byCoach.vehicles[0].id }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const after = await tripDetail(db, president, id);
  expect(after.care?.done).toMatchObject([{ instruction_id: careId, done_by: "Coach Marc" }]);
  expect(after.checklist[0].done_by).toBe("Coach Marc");

  // The player sees their own place only, and answers for themselves.
  const mine = await tripDetail(db, player, id);
  expect(mine.can.full).toBe(false);
  expect(mine.participants.map((p) => p.full_name)).toEqual(["Léa Joueuse"]);
  expect(mine.vehicles.map((v) => v.driver_name)).toEqual(["Coach Marc"]);
  expect(mine.care).toBeNull();
  await tripExecute(
    db,
    player,
    { action: "participant", participantId: leaRow.id, status: "declined", chair: "none", needs: "" },
    club,
  );
  const declined = (await tripDetail(db, president, id)).participants.find((p) => p.id === leaRow.id)!;
  expect(declined).toMatchObject({ status: "declined", chair: "powerchair", needs: "Chargeur" });
  expect((await tripsView(db, player)).trips).toHaveLength(1);

  // The care instructions read for the trip are logged (the offline book was removed in wave 17).
  const kinds = (
    await db.query("SELECT kind FROM sensitive_access_log WHERE resource_id=$1", [id])
  ).rows.map((r) => r.kind);
  expect(kinds).toContain("trip_care");
});

it("keeps a trip with ledger lines: cancel, not delete", async () => {
  const { id } = await tripExecute(
    db,
    president,
    { action: "create", locale: "nl", ...tripFields, title: "Stage" },
    club,
  );
  await financeExecute(
    db,
    president,
    {
      action: "record",
      occurredOn: today(),
      label: "Location minibus",
      direction: "out",
      category: "other",
      amountCents: 12000,
      method: "transfer",
      counterparty: "",
      reference: "",
      notes: "",
      tripId: id,
    },
    club,
  );
  expect((await tripDetail(db, president, id)).budget?.spent).toBe(12000);
  await expect(
    tripExecute(db, president, { action: "delete", id }, club),
  ).rejects.toMatchObject({ code: "HAS_FINANCE" });
  await tripExecute(db, president, { action: "status", id, status: "cancelled" }, club);
});

it("shares halls with their accessibility, with history and stale-version protection", async () => {
  const fields = {
    name: "Sporthal Gent",
    address: "Rue du Sport 1",
    city: "Gent",
    phone: "",
    website: "",
    stepFree: true,
    adaptedToilets: null,
    changingRooms: false,
    showers: null,
    lift: null,
    hoist: null,
    parking: true,
    charging: true,
    doorWidthCm: 90,
    floor: "Parquet",
    court: "",
    notes: "",
    checkedOn: today(),
  };
  // Wave 17 (C4): a club proposes its halls, it no longer writes the directory directly.
  await expect(venueExecute(db, president, { action: "save", ...fields })).rejects.toMatchObject({ code: "FORBIDDEN" });
  // A hall the club proposed and the federation validated: the club still completes it.
  const id = (
    await db.query("INSERT INTO shared_venue(name,address,created_by,organization_id) VALUES('Sporthal Gent','Rue du Sport 1',$1,$2) RETURNING id", [president.userId, club])
  ).rows[0].id as string;
  await venueExecute(db, president, { action: "save", id, version: 1, ...fields });
  const view = await venuesView(db, coach);
  const hall = view.venues.find((v) => v.id === id)!;
  expect(hall).toMatchObject({ step_free: true, adapted_toilets: null, charging: true, added_by: "Club vague 7" });
  expect(view.can.edit).toBe(false);
  await expect(
    venueExecute(db, coach, { action: "shareFromPlace", placeId: randomUUID() }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    venueExecute(db, president, { action: "save", id, version: hall.version + 1, ...fields, adaptedToilets: true, checkedOn: null }),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
  expect(
    (await db.query("SELECT count(*)::int AS n FROM shared_venue_history WHERE venue_id=$1", [id]))
      .rows[0].n,
  ).toBe(1);
});
