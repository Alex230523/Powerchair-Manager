import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { finesExecute, finesView } from "../../src/domains/fines/service";

/** Point 10 (04/11/2026): the federation's fines; each club sees its own, never another club's. */
const schema = "fines_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, other: string, clubA: string, clubB: string, fedPresident: Principal, otherFed: Principal, presidentA: Principal, presidentB: Principal, coachA: Principal;
const today = new Date().toISOString().slice(0, 10);

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  other = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  fedPresident = await actor(fed, "federation_president");
  otherFed = await actor(other, "federation_president");
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  coachA = await actor(clubA, "coach");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets the federation fine its clubs, each club seeing only its own", async () => {
  const late = { action: "create" as const, clubId: clubA, kind: "late" as const, amountCents: 2500, issuedOn: today, reason: "Arrivée à 14 h 20" };
  await expect(finesExecute(db, presidentA, late, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(finesExecute(db, otherFed, late, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const a = (await finesExecute(db, fedPresident, late, fed)).id;
  await finesExecute(db, fedPresident, { ...late, clubId: clubB, kind: "forfeit", amountCents: 5000, reason: "" }, fed);
  expect((await finesView(db, fedPresident)).fines).toHaveLength(2);
  const mine = await finesView(db, presidentA);
  expect(mine.fines.map((f) => [f.club, f.kind, f.amount_cents, f.state])).toEqual([["Club A", "late", 2500, "open"]]);
  expect(mine).toMatchObject({ mode: "club", canManage: false, clubs: [], open: 2500 });
  expect((await finesView(db, presidentB)).fines.map((f) => f.club)).toEqual(["Club B"]);
  expect((await finesView(db, otherFed)).fines).toEqual([]);
  await expect(finesView(db, coachA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Paid, then the other cancelled; a cancelled fine stays as it is.
  await finesExecute(db, fedPresident, { action: "paid", id: a, paid: true }, fed);
  expect((await finesView(db, presidentA)).fines[0].state).toBe("paid");
  const b = (await finesView(db, presidentB)).fines[0].id;
  await expect(finesExecute(db, otherFed, { action: "cancel", id: b }, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await finesExecute(db, fedPresident, { action: "cancel", id: b }, fed);
  expect((await finesView(db, presidentB)).open).toBe(0);
  await expect(finesExecute(db, fedPresident, { action: "paid", id: b, paid: true }, fed)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});
