import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { forecastExecute, forecastPdf, forecastTick, forecastView } from "../../src/domains/finance/forecast";
import { monthsFrom } from "../../src/domains/finance/forecast-schema";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * H4: a granted grant shows in its month, then leaves once received; a paid
 * fee leaves; a hall counts once (its invoice out of the planned cost); the
 * alert under the threshold; a simulation line never in the ledger; no
 * access for a coach; two clubs.
 */
const schema = "fc_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coach: Principal, presidentB: Principal, grant: string, fee: string, months: string[];
async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const items = async (p = president) => (await forecastView(db, p)).forecast.rows.flatMap((r) => r.items.map((i) => ({ ...i, month: r.month })));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  months = monthsFrom(brusselsToday());
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president", "Présidente");
  coach = await actor(clubA, "coach", "Coach");
  presidentB = await actor(clubB, "club_president", "Président B");
  const u = president.userId;
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,'Solde','in','other',100000,$2)", [clubA, u]);
  grant = (await db.query("INSERT INTO grant_application(organization_id,funder,status,granted_cents,starts_on,created_by) VALUES($1,'Province','granted',300000,$2,$3) RETURNING id", [clubA, months[4] + "-10", u])).rows[0].id;
  // A fee in one instalment next month.
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id", [clubA])).rows[0].id;
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Ana') RETURNING id", [clubA, person])).rows[0].id;
  const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Joueur',20000,1,CURRENT_DATE) RETURNING id", [clubA, season])).rows[0].id;
  fee = (await db.query("INSERT INTO dues_receivable(organization_id,plan_id,season_id,profile_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Joueur','{}',20000,0,$5) RETURNING id", [clubA, plan, season, profile, u])).rows[0].id;
  await db.query("INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents) VALUES($1,1,$2,20000)", [fee, months[1] + "-05"]);
  // A hall billed yearly 120000, of which 50000 already invoiced (unpaid).
  const place = (await db.query("INSERT INTO calendar_place(organization_id,name,category) VALUES($1,'Salle B','training') RETURNING id", [clubA])).rows[0].id;
  const booking = (await db.query("INSERT INTO venue_booking(organization_id,place_id,season_id,status,billing,planned_cost_cents) VALUES($1,$2,$3,'confirmed','yearly',120000) RETURNING id", [clubA, place, season])).rows[0].id;
  await db.query("INSERT INTO venue_invoice(organization_id,booking_id,amount_cents,issued_on,created_by) VALUES($1,$2,50000,CURRENT_DATE,$3)", [clubA, booking, u]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows a granted grant in its month, then not once received", async () => {
  expect((await items()).filter((i) => i.source === "grant")).toEqual([expect.objectContaining({ month: months[4], cents: 300000, certain: true, direction: "in" })]);
  await db.query("INSERT INTO grant_payment(organization_id,grant_id,received_on,amount_cents,created_by) VALUES($1,$2,CURRENT_DATE,300000,$3)", [clubA, grant, president.userId]);
  expect((await items()).filter((i) => i.source === "grant")).toEqual([]);
});

it("drops a fee once paid", async () => {
  expect((await items()).filter((i) => i.source === "dues").reduce((n, i) => n + i.cents, 0)).toBe(20000);
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by,receivable_id) VALUES($1,CURRENT_DATE,'Cotisation','in','dues',20000,$2,$3)", [clubA, president.userId, fee]);
  expect((await items()).filter((i) => i.source === "dues")).toEqual([]);
});

it("counts a hall once: its invoice, and the planned cost left", async () => {
  const hall = (await items()).filter((i) => i.source === "venue");
  expect(hall.reduce((n, i) => n + i.cents, 0)).toBe(120000);
  expect(hall.filter((i) => i.certain).map((i) => i.cents)).toEqual([50000]);
});

it("alerts under the threshold once, and keeps a simulation out of the ledger", async () => {
  const before = (await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1", [clubA])).rows[0].n;
  await forecastExecute(db, president, { action: "line", month: months[1], label: "Achat de 2 fauteuils", direction: "out", amountCents: 500000 }, clubA);
  expect((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1", [clubA])).rows[0].n).toBe(before);
  await forecastExecute(db, president, { action: "threshold", cents: 10000 }, clubA);
  const v = await forecastView(db, president);
  expect(v.forecast.alert).toMatchObject({ month: months[1] });
  expect(v.forecast.alert!.biggest[0]).toMatchObject({ label: "Achat de 2 fauteuils", cents: 500000 });
  expect(await forecastTick(db)).toBe(1);
  expect(await forecastTick(db)).toBe(0);
  expect(Buffer.from(await forecastPdf(db, president, "fr")).toString("latin1").startsWith("%PDF")).toBe(true);
});

it("refuses the coach, and another club sees only its own", async () => {
  await expect(forecastView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const b = await forecastView(db, presidentB);
  expect(b.forecast.start).toBe(0);
  expect(b.lines).toEqual([]);
  expect(b.forecast.rows.every((r) => r.items.length === 0)).toBe(true);
  const line = (await db.query("SELECT id FROM forecast_line LIMIT 1")).rows[0].id;
  await expect(forecastExecute(db, presidentB, { action: "removeLine", id: line }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
