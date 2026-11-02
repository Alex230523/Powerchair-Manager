import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { newsExecute, newsView } from "../../src/domains/news/service";

/** 20: read or not per account, the role's filter, the window shown once, then switched off. */
const schema = "news_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
/** The day the first entries are a fortnight old at most. */
const day = "2026-11-02";
let coach: Principal, otherCoach: Principal, player: Principal;
async function member(org: string, role: string, name: string): Promise<Principal> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id as string;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  return { userId, sessionId };
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club','club') RETURNING id")).rows[0].id;
  coach = await member(club, "coach", "Coach");
  otherCoach = await member(club, "coach", "Autre coach");
  player = await member(club, "player", "Joueur");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("filters on the role, and shows every entry on demand", async () => {
  const v = await newsView(db, coach, false, day);
  expect(v.role).toBe("coach");
  expect(v.entries.every((e) => e.roles.includes("coach") || e.roles.includes("all"))).toBe(true);
  expect((await newsView(db, coach, true, day)).entries.length).toBeGreaterThan(v.entries.length);
  expect((await newsView(db, player, false, day)).entries.some((e) => e.id.endsWith("fiches-exercices"))).toBe(false);
});

it("keeps read per account: the window once, the badges gone once read", async () => {
  const first = await newsView(db, coach, false, day);
  expect(first.popup).not.toBeNull();
  await newsExecute(db, coach, { action: "read", ids: [first.popup!.id] });
  const second = await newsView(db, coach, false, day);
  expect(second.popup?.id).not.toBe(first.popup!.id);
  // Reading the page's entries clears the badges.
  await newsExecute(db, coach, { action: "read", ids: second.entries.map((e) => e.id) });
  const third = await newsView(db, coach, false, day);
  expect([third.badges, third.popup]).toEqual([[], null]);
  // Another account keeps its own state; an unknown id is ignored.
  expect((await newsView(db, otherCoach, false, day)).popup).not.toBeNull();
  expect(await newsExecute(db, otherCoach, { action: "read", ids: ["2020-01-01-inconnu"] })).toEqual({ read: 0 });
});

it("switches the window off from the settings", async () => {
  await newsExecute(db, otherCoach, { action: "popup", off: true });
  const v = await newsView(db, otherCoach, false, day);
  expect([v.popupOff, v.popup]).toEqual([true, null]);
  expect(v.badges.length).toBeGreaterThan(0);
});
