import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { messagingArchive, messagingRetirementTick } from "../../src/domains/messaging-archive/service";
import { myTaskCount } from "../../src/domains/tasks/service";
import { assertModule } from "../../src/domains/club/governance";

/**
 * 22 and 24: the tasks given to a player counted for his menu; the old
 * exchanges told to the presidents once, kept as a PDF for them alone, the
 * module « messages » become « communication »; two clubs apart.
 */
const schema = "t2224_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string;
let presidentA: Principal, presidentB: Principal, coachA: Principal, player: Principal;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  const files = (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  // A club that had switched the old module off, before the migration that renames it.
  for (const f of files) {
    if (f === "0079_messaging_retired.sql") {
      clubB = (await db.query("INSERT INTO organization(name,kind,disabled_modules) VALUES('Club B','club','{messages,finance}') RETURNING id")).rows[0].id;
    }
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  }
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  coachA = await actor(clubA, "coach", "Coach A");
  player = await actor(clubA, "player", "Joueur A");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("renames the switched-off module and keeps the club's Communication behind it", async () => {
  expect((await db.query("SELECT disabled_modules FROM organization WHERE id=$1", [clubB])).rows[0].disabled_modules).toEqual(["communication", "finance"]);
  await expect(assertModule(db, presidentB, "communication")).rejects.toMatchObject({ code: "MODULE_OFF" });
  await expect(assertModule(db, presidentA, "communication")).resolves.toBeUndefined();
});

it("counts the open tasks given to the player, late ones apart, and only his", async () => {
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Joueur A','{player}' FROM person WHERE user_id=$2 RETURNING id", [clubA, player.userId])).rows[0].id;
  // His profile was linked after he chose his context: choose it again.
  const mandate = (await db.query("SELECT id FROM role_assignment WHERE user_id=$1", [player.userId])).rows[0].id;
  await execute(db, player, { action: "context", mandateId: mandate });
  for (const [due, status, who] of [
    ["CURRENT_DATE-2", "todo", profile],
    ["CURRENT_DATE+5", "doing", profile],
    ["CURRENT_DATE-9", "done", profile],
    ["CURRENT_DATE-1", "todo", null],
  ] as const)
    await db.query(`INSERT INTO task(organization_id,title,kind,status,due_on,done_on,responsible_id,created_by) VALUES($1,'Tâche','other',$2,${due},${status === "done" ? "CURRENT_DATE" : "NULL"},$3,$4)`, [clubA, status, who, presidentA.userId]);
  expect(await myTaskCount(db, player)).toEqual({ open: 2, late: 1 });
  expect(await myTaskCount(db, presidentB)).toEqual({ open: 0, late: 0 });
});

it("tells each club's presidents once about their old exchanges, and gives the PDF to them alone", async () => {
  const thread = (await db.query("INSERT INTO message_thread(organization_id,subject) VALUES($1,'Organisation du tournoi') RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO message_participant(thread_id,organization_id,user_id) VALUES($1,$2,$3)", [thread, clubA, coachA.userId]);
  await db.query("INSERT INTO internal_message(id,thread_id,organization_id,sender_id,body) VALUES($1,$2,$3,$4,'Rendez-vous samedi')", [randomUUID(), thread, clubA, coachA.userId]);
  expect(await messagingRetirementTick(db)).toBe(1);
  expect(await messagingRetirementTick(db)).toBe(0);
  const notice = (await db.query("SELECT organization_id,delete_after-CURRENT_DATE AS days FROM messaging_retirement")).rows;
  expect(notice).toEqual([{ organization_id: clubA, days: 14 }]);
  const mail = (await db.query("SELECT recipient_user_id FROM mail_job WHERE resource_id=$1", [`messaging-retirement:${clubA}`])).rows.map((r) => r.recipient_user_id);
  expect(mail).toEqual([presidentA.userId]);
  const { bytes, filename } = await messagingArchive(db, presidentA, "fr");
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  expect(Buffer.from(bytes).toString("latin1")).toContain("Rendez-vous samedi");
  expect(filename).toBe("messagerie-club-a.pdf");
  await expect(messagingArchive(db, coachA, "fr")).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Club B's president gets his own club's (empty) exchanges, never A's.
  expect(Buffer.from((await messagingArchive(db, presidentB, "fr")).bytes).toString("latin1")).not.toContain("Rendez-vous samedi");
});
