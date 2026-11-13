import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { venueExecute, venuesView } from "../../src/domains/venues/service";
import { currentRates, placeCommand } from "../../src/domains/venues/schema";
import { calendarView } from "../../src/domains/calendar/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * Wave 17 (C4): a club's place stays private (contact, rates, food, notes),
 * its sharing is proposed then validated by the federation, and only the
 * name, address, category and accessibility reach the clubs of the federation.
 */
const schema = "w17pla_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string, clubC: string;
let fedPresident: Principal, presidentA: Principal, coachA: Principal, presidentB: Principal, presidentC: Principal, place: string;
const range = { from: brusselsDay(), to: brusselsDay(new Date(Date.now() + 30 * 86400000)), team: "", place: "" };

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const directory = async (p: Principal) => (await venuesView(db, p)).venues.map((v) => v.name);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [federation])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind) VALUES('Club C','club') RETURNING id")).rows[0].id;
  fedPresident = await actor(federation, "federation_president");
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach", ["calendar.read"]);
  presidentB = await actor(clubB, "club_president");
  presidentC = await actor(clubC, "club_president");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps a place's sheet private, with a contact created in the same window and dated rates", async () => {
  place = (
    (await venueExecute(
      db,
      presidentA,
      {
        action: "savePlace",
        name: "Salle Alpha",
        address: "Rue du Stade 4, Namur",
        category: "training",
        contactId: null,
        newContact: { fullName: "Marc Concierge", organizationName: "Ville de Namur", email: "", phone: "081 00 00 00" },
        capacity: 40,
        accessible: true,
        toilets: true,
        parking: false,
        storage: true,
        charging: true,
        home: true,
        foodPolicy: "Boissons seulement dans la cafétéria",
        notes: "Clé chez le concierge",
        archived: false,
      },
      clubA,
    )) as { id: string }
  ).id;
  await venueExecute(db, presidentA, { action: "addRate", placeId: place, label: "Terrain 2 h", amountCents: 4000, unit: "séance", validFrom: "2025-09-01" }, clubA);
  await venueExecute(db, presidentA, { action: "addRate", placeId: place, label: "Terrain 2 h", amountCents: 4500, unit: "séance", validFrom: "2026-01-01" }, clubA);
  const mine = (await venuesView(db, presidentA)).places.find((p) => p.id === place)!;
  expect(mine).toMatchObject({ category: "training", home: true, contact_name: "Marc Concierge", contact_phone: "081 00 00 00", food_policy: "Boissons seulement dans la cafétéria", notes: "Clé chez le concierge", share_status: "private" });
  expect(mine.rates.map((r) => r.amount_cents)).toEqual([4500, 4000]);
  expect([...currentRates(mine.rates, "2026-10-22")]).toEqual([mine.rates[0].id]);
  expect((await db.query("SELECT tags FROM contact WHERE full_name='Marc Concierge'")).rows[0].tags).toEqual(["venue"]);
  // A coach sees the place, not its private sheet.
  const seen = (await venuesView(db, coachA)).places.find((p) => p.id === place)!;
  expect(seen).toMatchObject({ contact_name: null, food_policy: "", notes: "", rates: [] });
  // Another club sees nothing of it, here or in its calendar.
  expect((await venuesView(db, presidentB)).places).toEqual([]);
  expect((await calendarView(db, presidentB, range)).places.some((p: { id: string }) => p.id === place)).toBe(false);
  await expect(venueExecute(db, presidentB, { action: "addRate", placeId: place, label: "Intrus", amountCents: 1, unit: "", validFrom: "2026-01-01" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(venueExecute(db, presidentB, { action: "proposeShare", placeId: place }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("shares a place once the federation validates it, with its public fields only", async () => {
  await venueExecute(db, presidentA, { action: "proposeShare", placeId: place }, clubA);
  expect((await venuesView(db, presidentA)).places.find((p) => p.id === place)!.share_status).toBe("pending");
  expect(await directory(presidentB)).not.toContain("Salle Alpha");
  // The federation sees the proposal: no contact, rate, food or notes.
  const proposal = (await venuesView(db, fedPresident)).proposals.find((p) => p.id === place)!;
  expect(Object.keys(proposal).sort()).toEqual(["accessible", "address", "category", "charging", "club", "id", "name", "parking", "share_requested_at", "toilets"]);
  // Only the federation decides; a refusal needs a reason.
  await expect(venueExecute(db, presidentB, { action: "decide", placeId: place, approve: true, reason: "" }, clubB)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
  await expect(venueExecute(db, fedPresident, { action: "decide", placeId: place, approve: false, reason: "" }, federation)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const { venue } = (await venueExecute(db, fedPresident, { action: "decide", placeId: place, approve: true, reason: "" }, federation)) as { venue: string };
  const shared = (await db.query("SELECT * FROM shared_venue WHERE id=$1", [venue])).rows[0];
  expect(shared).toMatchObject({ name: "Salle Alpha", address: "Rue du Stade 4, Namur", category: "training", step_free: true, adapted_toilets: true, charging: true, parking: null, notes: "", phone: "", status: "approved" });
  // « 4500 » as a whole number: a random uuid may hold those digits.
  expect(JSON.stringify(shared)).not.toMatch(/Concierge|cafétéria|(?<![0-9a-f-])4500(?![0-9a-f-])/);
  expect((await venuesView(db, presidentA)).places.find((p) => p.id === place)).toMatchObject({ share_status: "approved", shared_venue_id: venue });
  // The clubs of the federation see it, in the directory and the calendar; a club outside does not.
  expect(await directory(presidentB)).toContain("Salle Alpha");
  expect((await calendarView(db, presidentB, range)).sharedVenues.map((v: { id: string }) => v.id)).toContain(venue);
  expect(await directory(presidentC)).not.toContain("Salle Alpha");
  expect((await calendarView(db, presidentC, range)).sharedVenues.map((v: { id: string }) => v.id)).not.toContain(venue);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='funding_task' AND recipient_user_id=$1", [presidentA.userId])).rows[0].n).toBe(1);
  // The federation may take it back out.
  expect(placeCommand.safeParse({ action: "withdraw", venueId: venue, reason: "" }).success).toBe(false);
  await venueExecute(db, fedPresident, { action: "withdraw", venueId: venue, reason: "Salle fermée" }, federation);
  expect(await directory(presidentB)).not.toContain("Salle Alpha");
  expect((await venuesView(db, presidentA)).places.find((p) => p.id === place)!.share_status).toBe("private");
});

it("keeps halls shared before as validated, and lets only the federation create them directly", async () => {
  const legacy = (await db.query("INSERT INTO shared_venue(name,address,created_by,organization_id) VALUES('Hall historique','Avenue 1',$1,$2) RETURNING status", [presidentB.userId, clubB])).rows[0];
  expect(legacy.status).toBe("approved");
  expect(await directory(presidentA)).toContain("Hall historique");
  const base = { name: "Hall fédéral", address: "Place 2", city: "", phone: "", website: "", stepFree: null, adaptedToilets: null, changingRooms: null, showers: null, lift: null, hoist: null, parking: null, charging: null, doorWidthCm: null, floor: "", court: "", notes: "", checkedOn: null };
  await expect(venueExecute(db, presidentA, { action: "save", ...base })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await venueExecute(db, fedPresident, { action: "save", ...base });
  expect(await directory(presidentA)).toContain("Hall fédéral");
  expect(await directory(presidentC)).not.toContain("Hall fédéral");
});
