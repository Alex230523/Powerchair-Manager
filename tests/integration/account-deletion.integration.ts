import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { deletionExecute, deletionTick, deletionView } from "../../src/domains/account/deletion";
import type { Transport } from "../../src/domains/notifications/transport";

/**
 * 12/11/2026, deleting one's account, on the real database. Club A has two
 * presidents and a coach, club B one president: a coach asks with the wrong
 * address (refused), then the right one (30 days, an e-mail); cancels, asks
 * again; before the day nothing happens, on the day the account is
 * anonymised (no sign-in, no session, no mandate, no name), club A's files
 * stay; club B's only president cannot leave it empty.
 */
const schema = "accdel_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, coach: Principal & { email: string }, presidentA1: Principal & { email: string }, presidentB: Principal & { email: string };
const sent: { email: string; subject: string }[] = [];
const transport: Transport = {
  mode: "local",
  async send(_id, e) {
    sent.push({ email: e.email, subject: e.subject ?? "" });
    return "local";
  },
};

async function member(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    email = `${userId}@example.test`;
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query('INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,\'hash\')', [randomUUID(), userId]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId, email };
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA1 = await member(clubA, "club_president", "Présidente A1");
  await member(clubA, "club_president", "Président A2");
  coach = await member(clubA, "coach", "Coach A");
  presidentB = await member(clubB, "club_president", "Président B");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("asks for the address, waits 30 days, can be cancelled and asked again", async () => {
  await expect(deletionExecute(db, coach, { action: "request", confirmEmail: "other@example.test" }, {}, transport)).rejects.toMatchObject({ code: "CONFIRMATION_MISMATCH", status: 400 });
  const r = await deletionExecute(db, coach, { action: "request", confirmEmail: coach.email.toUpperCase() }, {}, transport);
  expect((await db.query("SELECT ($1::date-(now() AT TIME ZONE 'Europe/Brussels')::date) AS d", [r.dueOn])).rows[0].d).toBe(30);
  expect(sent).toEqual([{ email: coach.email, subject: "Suppression de votre compte demandée" }]);
  expect((await deletionView(db, coach)).pending?.due_on).toBe(r.dueOn);
  await deletionExecute(db, coach, { action: "cancel" }, {}, transport);
  expect((await deletionView(db, coach)).pending).toBeNull();
  await expect(deletionExecute(db, coach, { action: "cancel" }, {}, transport)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await deletionExecute(db, coach, { action: "request", confirmEmail: coach.email }, {}, transport);
  // Before the day: nothing.
  expect(await deletionTick(db)).toBe(0);
  expect((await db.query('SELECT active FROM "user" WHERE id=$1', [coach.userId])).rows[0].active).toBe(true);
});

it("never leaves a presidency empty; one of two presidents may leave", async () => {
  expect((await deletionView(db, presidentB)).sole.map((o) => o.name)).toEqual(["Club B"]);
  await expect(deletionExecute(db, presidentB, { action: "request", confirmEmail: presidentB.email }, {}, transport)).rejects.toMatchObject({ code: "SOLE_PRESIDENT", status: 409 });
  expect((await deletionView(db, presidentA1)).sole).toEqual([]);
  await deletionExecute(db, presidentA1, { action: "request", confirmEmail: presidentA1.email }, {}, transport);
});

it("anonymises the account on the day: no sign-in, no session, no mandate; the club's files stay", async () => {
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status) VALUES($1,(SELECT id FROM person WHERE user_id=$2),'Coach A','1990-01-01','{coach}','active') RETURNING id", [clubA, coach.userId])).rows[0].id;
  await db.query("UPDATE account_deletion SET due_on=CURRENT_DATE-1 WHERE user_id=$1", [coach.userId]);
  expect(await deletionTick(db)).toBe(1);
  const u = (await db.query('SELECT name,email,active,image FROM "user" WHERE id=$1', [coach.userId])).rows[0];
  expect(u).toEqual({ name: "Compte supprimé", email: `deleted-${coach.userId}@deleted.invalid`, active: false, image: null });
  for (const [table, col] of [["session", '"userId"'], ["account", '"userId"'], ["active_context", "user_id"]] as const)
    expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${col}=$1`, [coach.userId])).rows[0].n, table).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM role_assignment WHERE user_id=$1 AND revoked_at IS NULL", [coach.userId])).rows[0].n).toBe(0);
  expect((await db.query("SELECT full_name FROM club_person WHERE id=$1", [profile])).rows[0].full_name).toBe("Coach A");
  expect((await db.query("SELECT completed_at IS NOT NULL AS done FROM account_deletion WHERE user_id=$1", [coach.userId])).rows[0].done).toBe(true);
  // The other accounts are untouched.
  expect((await db.query('SELECT active FROM "user" WHERE id=$1', [presidentB.userId])).rows[0].active).toBe(true);
});

it("keeps an account whose person became the only president meanwhile", async () => {
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE organization_id=$1 AND role='club_president' AND user_id<>$2", [clubA, presidentA1.userId]);
  await db.query("UPDATE account_deletion SET due_on=CURRENT_DATE-1 WHERE user_id=$1", [presidentA1.userId]);
  expect(await deletionTick(db)).toBe(0);
  expect((await db.query('SELECT active FROM "user" WHERE id=$1', [presidentA1.userId])).rows[0].active).toBe(true);
});
