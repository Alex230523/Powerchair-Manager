import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { equipmentExecute, equipmentView } from "../../src/domains/equipment/service";
import { equipmentLoanTick } from "../../src/domains/equipment/loans";

/**
 * Wave 17 (Q1): chair models proposed then validated by the federation,
 * storage places, loans between two clubs of a federation (request,
 * acceptance, hand-over, return, reminder), the federation's own fleet
 * offered to the clubs, and clubs kept apart outside a loan.
 */
const schema = "w17eq_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string, clubC: string;
let fed: Principal, presidentA: Principal, presidentB: Principal, presidentC: Principal, coachA: Principal;
let today: string, chairA: string, chairA2: string, placeA: string, loan: string;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, role, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, org: string, command: Record<string, unknown>) => equipmentExecute(db, p, command as never, org) as Promise<{ id: string }>;
const chair = (fields: Record<string, unknown>) => ({
  action: "chair",
  name: "Fauteuil",
  brand: "",
  model: "",
  serialNumber: "",
  ownership: "club",
  status: "available",
  maxSpeedKmh: 10,
  battery: "",
  acquiredOn: "2024-03-01",
  lastServiceOn: null,
  nextServiceOn: null,
  notes: "",
  modelId: null,
  newModel: null,
  storageLocationId: null,
  lendable: false,
  ...fields,
});
const day = (n: number) => (db.query(`SELECT ((now() AT TIME ZONE 'Europe/Brussels')::date + ${n})::text AS d`).then((r) => r.rows[0].d as string));
const view = (p: Principal) => equipmentView(db, p);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  today = await day(0);
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  const other = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre fédération','federation') RETURNING id")).rows[0].id;
  const club = async (name: string, f: string) => (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES($1,'club',$2) RETURNING id", [name, f])).rows[0].id as string;
  clubA = await club("Club A", federation);
  clubB = await club("Club B", federation);
  clubC = await club("Club C", other);
  fed = await actor(federation, "federation_president");
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  presidentC = await actor(clubC, "club_president");
  coachA = await actor(clubA, "coach");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("requires a model and a purchase date; a new model waits for the federation", async () => {
  await expect(run(presidentA, clubA, chair({ acquiredOn: null, newModel: { brand: "Acme", name: "Viper" } }))).rejects.toMatchObject({ code: "ACQUIRED_REQUIRED" });
  await expect(run(presidentA, clubA, chair({}))).rejects.toMatchObject({ code: "MODEL_REQUIRED" });
  chairA = (await run(presidentA, clubA, chair({ name: "Rouge", newModel: { brand: "Acme", name: "Viper" } }))).id;
  const a = await view(presidentA);
  expect(a.chairs[0]).toMatchObject({ name: "Rouge", model_name: "Viper", model_brand: "Acme", model_status: "proposed", acquired_on: "2024-03-01", brand: "Acme", model: "Viper" });
  expect(a.models.list.map((m) => [m.name, m.status])).toEqual(expect.arrayContaining([["Viper", "proposed"], ["Equalizer", "validated"], ["Storm", "validated"], ["Strike Force", "validated"]]));
  // Club B does not see A's proposal; the shared list only.
  expect((await view(presidentB)).models.list.map((m) => m.name)).not.toContain("Viper");
  // The federation decides; a club cannot.
  const f = await view(fed);
  expect(f.kind).toBe("federation");
  const viper = f.models.list.find((m) => m.name === "Viper")!;
  expect(viper).toMatchObject({ status: "proposed", club: "Club A", chairs: 1 });
  await expect(run(presidentA, clubA, { action: "decideModel", id: viper.id, decision: "validated", note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(fed, federation, { action: "decideModel", id: viper.id, decision: "validated", note: "" });
  expect((await view(presidentA)).chairs[0].model_status).toBe("validated");
  expect((await view(presidentB)).models.list.find((m) => m.name === "Viper")?.status).toBe("validated");
  // A shared model by its id.
  const storm = (await view(presidentA)).models.list.find((m) => m.name === "Storm")!;
  chairA2 = (await run(presidentA, clubA, chair({ name: "Bleu", modelId: storm.id }))).id;
  expect((await db.query("SELECT model,model_id FROM equipment_chair WHERE id=$1", [chairA2])).rows[0]).toEqual({ model: "Storm", model_id: storm.id });
});

it("stores chairs and small material by place, each club its own places", async () => {
  placeA = (await run(presidentA, clubA, { action: "storage", name: "Local d'Uccle", placeId: null, address: "Rue du Doyenné 1", contact: "", access: "Clé chez le coach", notes: "", archived: false })).id;
  const rouge = (await view(presidentA)).chairs.find((c) => c.id === chairA)!;
  await run(presidentA, clubA, { ...chair({ name: "Rouge", modelId: rouge.model_id, storageLocationId: placeA }), id: chairA, expectedVersion: rouge.version });
  await run(presidentA, clubA, { action: "item", name: "Cônes", category: "cone", quantity: 20, storage: "", expiresOn: null, notes: "", archived: false, storageLocationId: placeA });
  const places = (await view(presidentA)).storage.places;
  expect(places).toHaveLength(1);
  expect(places[0]).toMatchObject({ name: "Local d'Uccle", chairs: [{ name: "Rouge · Acme Viper" }], items: [{ name: "Cônes", quantity: 20 }] });
  expect((await db.query("SELECT storage FROM equipment_chair WHERE id=$1", [chairA])).rows[0].storage).toBe("Local d'Uccle");
  // Another club cannot use it; the coach reads the places, cannot change them.
  await expect(run(presidentB, clubB, chair({ name: "Vert", modelId: rouge.model_id, storageLocationId: placeA }))).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await view(coachA)).storage.places).toHaveLength(1);
  await expect(run(coachA, clubA, { action: "storage", name: "Garage", placeId: null, address: "", contact: "", access: "", notes: "", archived: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("keeps clubs apart; a lendable chair is offered to the federation's clubs only", async () => {
  expect((await view(presidentB)).chairs).toEqual([]);
  expect((await view(presidentB)).loans.available).toEqual([]);
  const rouge = (await view(presidentA)).chairs.find((c) => c.id === chairA)!;
  await run(presidentA, clubA, { ...chair({ name: "Rouge", modelId: rouge.model_id, storageLocationId: placeA, lendable: true }), id: chairA, expectedVersion: rouge.version });
  const offered = (await view(presidentB)).loans.available;
  expect(offered.map((c) => [c.name, c.owner, c.model_name, c.storage_name])).toEqual([["Rouge", "Club A", "Viper", "Local d'Uccle"]]);
  expect(Object.keys(offered[0]).sort()).toEqual(["busy", "id", "max_speed_kmh", "model_brand", "model_name", "model_status", "name", "owner", "owner_id", "owner_kind", "storage_name"]);
  expect((await view(presidentC)).loans.available).toEqual([]);
  await expect(run(presidentC, clubC, { action: "requestLoan", chairId: chairA, startsOn: today, endsOn: today, message: "" })).rejects.toThrow();
  // The chair stays out of club B's own list.
  expect((await view(presidentB)).chairs).toEqual([]);
});

it("lends between two clubs: request, acceptance, hand-over, return", async () => {
  const [from, to] = [await day(2), await day(10)];
  await expect(run(presidentB, clubB, { action: "requestLoan", chairId: chairA, startsOn: await day(-1), endsOn: to, message: "" })).rejects.toMatchObject({ code: "LOAN_DATES" });
  loan = (await run(presidentB, clubB, { action: "requestLoan", chairId: chairA, startsOn: from, endsOn: to, message: "Pour le tournoi" })).id;
  expect((await db.query("SELECT DISTINCT recipient_user_id FROM mail_job WHERE resource_id=$1", [loan])).rows.map((r) => r.recipient_user_id)).toEqual([presidentA.userId]);
  const lent = (await view(presidentA)).loans.lent;
  expect(lent[0]).toMatchObject({ id: loan, status: "requested", borrower: "Club B", message: "Pour le tournoi" });
  // Only the lender decides and hands over.
  await expect(run(presidentB, clubB, { action: "decideLoan", id: loan, decision: "accepted", note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(presidentC, clubC, { action: "decideLoan", id: loan, decision: "accepted", note: "" })).rejects.toThrow();
  await run(presidentA, clubA, { action: "decideLoan", id: loan, decision: "accepted", note: "D'accord" });
  // The dates are now taken.
  await expect(run(presidentB, clubB, { action: "requestLoan", chairId: chairA, startsOn: await day(5), endsOn: await day(12), message: "" })).rejects.toMatchObject({ code: "LOAN_OVERLAP" });
  await run(presidentA, clubA, { action: "handOver", id: loan, condition: "Batteries chargées, pneus neufs" });
  const borrowed = (await view(presidentB)).loans.borrowed[0];
  expect(borrowed).toMatchObject({ status: "ongoing", lender: "Club A", chair: "Rouge · Acme Viper", condition_out: "Batteries chargées, pneus neufs", storage_name: "Local d'Uccle" });
  expect((await view(presidentB)).loans.available[0].busy).toEqual([{ starts_on: from, ends_on: to, status: "ongoing" }]);
  // Reminder seven days before the end, once, to both clubs.
  await db.query("UPDATE equipment_loan SET ends_on=$2 WHERE id=$1", [loan, await day(5)]);
  expect(await equipmentLoanTick(db)).toBe(1);
  expect(await equipmentLoanTick(db)).toBe(0);
  const told = (await db.query("SELECT recipient_user_id FROM mail_job WHERE resource_id=$1 AND dedupe_key IS NOT NULL", [loan])).rows.map((r) => r.recipient_user_id);
  expect(told).toEqual(expect.arrayContaining([presidentA.userId, presidentB.userId]));
  await expect(run(presidentB, clubB, { action: "returnLoan", id: loan, condition: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(presidentA, clubA, { action: "returnLoan", id: loan, condition: "Rayure sur le garde-boue" });
  expect((await view(presidentB)).loans.borrowed[0]).toMatchObject({ status: "returned", condition_in: "Rayure sur le garde-boue" });
  const history = (await view(presidentA)).history.filter((h) => h.chair_id === chairA).map((h) => h.action);
  expect(history).toEqual(expect.arrayContaining(["loan.request", "loan.accept", "loan.handOver", "loan.return"]));
});

it("lends directly to a club of the federation, never outside it", async () => {
  await expect(run(presidentA, clubA, { action: "lend", chairId: chairA2, borrowerId: clubC, startsOn: today, endsOn: today, conditions: "", depositCents: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const id = (await run(presidentA, clubA, { action: "lend", chairId: chairA2, borrowerId: clubB, startsOn: today, endsOn: await day(3), conditions: "Rendre chargé", depositCents: 15000 })).id;
  expect((await view(presidentB)).loans.borrowed.find((l) => l.id === id)).toMatchObject({ status: "accepted", initiated_by: "lender", deposit_cents: 15000 });
  await run(presidentB, clubB, { action: "cancelLoan", id });
  expect((await db.query("SELECT status FROM equipment_loan WHERE id=$1", [id])).rows[0].status).toBe("cancelled");
});

it("offers the federation's own fleet to its clubs", async () => {
  const storm = (await view(fed)).models.list.find((m) => m.name === "Storm")!;
  await run(fed, federation, chair({ name: "Fédé 1", modelId: storm.id, lendable: true }));
  expect((await view(fed)).chairs.map((c) => c.name)).toEqual(["Fédé 1"]);
  const offered = (await view(presidentA)).loans.available;
  expect(offered.find((c) => c.name === "Fédé 1")).toMatchObject({ owner: "BPCF", owner_kind: "federation" });
  expect((await view(presidentC)).loans.available).toEqual([]);
});
