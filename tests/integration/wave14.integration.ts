import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { notificationBrief, notificationExecute } from "../../src/domains/notifications/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { duesExecute } from "../../src/domains/dues/service";

/** Wave 14: the bell's brief and the sidebar counters (late dues), isolated per club. */
const schema = "wave14_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, seasonA: string, presidentA: Principal, presidentB: Principal, emma: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function player(org: string, name: string) {
  const person = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2010-01-01','{player}') RETURNING id", [org, person, name])).rows[0]
    .id as string;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [clubB]);
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  emma = await player(clubA, "Emma Peeters");
  await player(clubA, "Lucas Peeters");
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

it("gives the bell an unread count and the latest notifications of the person's own club only", async () => {
  expect(await notificationBrief(db, presidentA)).toEqual({ unread: 0, latest: [] });
  await notificationExecute(db, presidentA, { action: "testSelf" }, clubA);
  const brief = await notificationBrief(db, presidentA);
  expect(brief.unread).toBe(1);
  expect(brief.latest).toHaveLength(1);
  expect(brief.latest[0].read_at).toBeNull();
  expect((await notificationBrief(db, presidentB)).unread).toBe(0);
  await notificationExecute(db, presidentA, { action: "read", id: brief.latest[0].id }, clubA);
  expect((await notificationBrief(db, presidentA)).unread).toBe(0);
  // The test message is one per person: asking again adds nothing.
  await notificationExecute(db, presidentA, { action: "testSelf" }, clubA);
  expect((await notificationBrief(db, presidentA)).latest).toHaveLength(1);
});

it("counts the players late with their dues for the sidebar, from the same totals as the dues page", async () => {
  const before = await dashboardView(db, presidentA);
  expect(before.todos.find((x) => x.key === "duesLate")).toBeUndefined();
  const { id: planId } = await duesExecute(db, presidentA, { action: "plan", seasonId: seasonA, category: "Joueur", amountCents: 25000, maxInstallments: 4, firstDue: "2026-01-31" }, clubA);
  await duesExecute(db, presidentA, { action: "issue", planId, profileId: emma, discountCents: 0, reason: "", installments: 4, firstDue: "2020-01-31" }, clubA);
  const after = await dashboardView(db, presidentA);
  expect(after.todos.find((x) => x.key === "duesLate")).toMatchObject({ count: 1, href: "/dues?state=late", tone: "danger" });
  // The other club sees nothing of it.
  expect((await dashboardView(db, presidentB)).todos.find((x) => x.key === "duesLate")).toBeUndefined();
  // Paid in full: no longer late.
  await duesExecute(db, presidentA, { action: "pay", id: (await db.query("SELECT id FROM dues_receivable WHERE profile_id=$1", [emma])).rows[0].id, amountCents: 25000, method: "transfer", occurredOn: "2026-10-01", reference: "" }, clubA);
  expect((await dashboardView(db, presidentA)).todos.find((x) => x.key === "duesLate")).toBeUndefined();
});
