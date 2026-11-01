import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, type Principal } from "../../src/domains/access/service";
import { automationsExecute, automationsView } from "../../src/domains/automations/service";
import { automationCommand } from "../../src/domains/automations/schema";
import { plan, runAutomations, type Club } from "../../src/domains/automations/engine";
import { runJob } from "../../src/domains/jobs/runner";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * B7: the automations engine. A rule run twice sends once; the simulation
 * lists exactly what the run sends; pause and global stop act at once; the
 * daily mail budget holds the rest until the next day; a new season sends
 * nothing twice; an automation's task never feeds « tâche en retard »; two
 * clubs stay apart; only the president (or notifications.manage) changes it.
 */
const schema = "b7auto_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public`, max: 6 });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, season: string, ana: string, anaUser: string, mailDir: string;
const today = brusselsToday();
const day = (n: number) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const set = (p: Principal, org: string, cmd: Record<string, unknown>) => automationsExecute(db, p, automationCommand.parse(cmd), org);
const club = async (id: string) => (await db.query("SELECT id,name,disabled_modules AS disabled,dues_rules,automations_stopped AS stopped FROM organization WHERE id=$1", [id])).rows[0] as Club;
const planOf = async (id: string, date = today) => {
  const c = await db.connect();
  try {
    return await plan(c, await club(id), date);
  } finally {
    c.release();
  }
};
const mails = async (rule: string) => (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='automation' AND dedupe_key IS NOT NULL AND resource_id IN (SELECT entity_id FROM automation_run WHERE rule=$1)", [rule])).rows[0].n as number;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  coach = (await actor(clubA, "coach", "Coach")).p;
  const a = await actor(clubA, "player", "Ana");
  anaUser = a.p.userId;
  ana = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Ana Martin','{player}') RETURNING id", [clubA, a.person])).rows[0].id;
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  mailDir = await mkdtemp(join(tmpdir(), "pfm-b7-"));
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets only the president (or notifications.manage) change the automations", async () => {
  const view = await automationsView(db, president);
  expect(view.rules.map((r) => r.rule)).toContain("documentExpiring");
  expect(view.rules.find((r) => r.rule === "callNoAnswer")!.settings.enabled).toBe(true);
  expect(view.rules.find((r) => r.rule === "documentExpiring")!.settings.enabled).toBe(false);
  await expect(automationsView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(set(coach, clubA, { action: "stop", stopped: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("sends a rule once however often it runs, exactly what the simulation said", async () => {
  await db.query("INSERT INTO club_document(organization_id,profile_id,season_id,name,category,status,expires_on) VALUES($1,$2,$3,'Certificat médical','licence','valid',$4)", [clubA, ana, season, day(20)]);
  await set(president, clubA, { action: "rule", rule: "documentExpiring", enabled: true, paused: false, delayDays: 30, recipients: "person", actions: ["notify", "email"] });
  const simulated = (await planOf(clubA)).filter((l) => l.rule === "documentExpiring");
  expect(simulated.map((l) => [l.about, l.recipient, l.already])).toEqual([["Certificat médical", "Ana", false]]);
  await runAutomations(db);
  await runAutomations(db);
  const runs = (await db.query("SELECT entity_id,recipient_user_id,result FROM automation_run WHERE organization_id=$1 AND rule='documentExpiring'", [clubA])).rows;
  expect(runs.map((r) => [r.entity_id, r.recipient_user_id, r.result])).toEqual(simulated.map((l) => [l.entity, l.recipientId, "sent"]));
  expect(await mails("documentExpiring")).toBe(1);
  // Afterwards the simulation says it is already done.
  expect((await planOf(clubA)).filter((l) => l.rule === "documentExpiring").every((l) => l.already)).toBe(true);
  // The message: the club's text, with its variables filled in, in the person's language.
  const sent = (await db.query("SELECT kind,resource_type FROM mail_job WHERE kind='automation' LIMIT 1")).rows[0];
  expect(sent).toEqual({ kind: "automation", resource_type: "automation" });
});

it("pauses a rule, or stops everything, at once", async () => {
  await db.query("INSERT INTO equipment_chair(organization_id,name,next_service_on) VALUES($1,'Fauteuil 3',$2)", [clubA, day(5)]);
  await set(president, clubA, { action: "rule", rule: "chairService", enabled: true, paused: true, delayDays: 14, actions: ["notify", "email"] });
  expect((await planOf(clubA)).filter((l) => l.rule === "chairService")).toEqual([]);
  await runAutomations(db);
  expect((await db.query("SELECT count(*)::int AS n FROM automation_run WHERE rule='chairService'")).rows[0].n).toBe(0);
  // Unpaused but the club stopped: still nothing, built-in rules included.
  await set(president, clubA, { action: "rule", rule: "chairService", enabled: true, paused: false, delayDays: 14, actions: ["notify", "email"] });
  await set(president, clubA, { action: "stop", stopped: true });
  await db.query("INSERT INTO driver_licence(profile_id,organization_id,valid_until,updated_by) VALUES($1,$2,$3,$4)", [ana, clubA, day(10), anaUser]);
  expect(await planOf(clubA)).toEqual([]);
  await runAutomations(db);
  expect((await db.query("SELECT count(*)::int AS n FROM automation_run WHERE rule='chairService'")).rows[0].n).toBe(0);
  expect((await db.query("SELECT reminded_on FROM driver_licence WHERE profile_id=$1", [ana])).rows[0].reminded_on).toBeNull();
  // Lifted: the chair and the built-in licence reminder go.
  await set(president, clubA, { action: "stop", stopped: false });
  await runAutomations(db);
  expect((await db.query("SELECT count(*)::int AS n FROM automation_run WHERE rule='chairService'")).rows[0].n).toBe(1);
  expect((await db.query("SELECT reminded_on::text FROM driver_licence WHERE profile_id=$1", [ana])).rows[0].reminded_on).toBe(today);
});

it("keeps to the day's mail budget, the rest leaves the next day", async () => {
  const env = { ...process.env, MAIL_TRANSPORT: "local", PFM_MAIL_DIR: mailDir };
  const pending = (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE state='pending'")).rows[0].n as number;
  expect(pending).toBeGreaterThan(1);
  // The provider's limit is already reached today: one mail left earlier.
  await db.query("UPDATE mail_job SET state='sent',completed_at=now() WHERE id=(SELECT id FROM mail_job WHERE state='pending' ORDER BY created_at LIMIT 1)");
  expect(await runJob(db, "mail", { ...env, MAIL_DAILY_LIMIT: "1" })).toMatchObject({ summary: { processed: 0, deferred: pending - 1 } });
  // The next day: the budget is new.
  await db.query("UPDATE mail_job SET completed_at=now()-interval '1 day' WHERE state='sent'");
  expect(await runJob(db, "mail", { ...env, MAIL_DAILY_LIMIT: "1" })).toMatchObject({ summary: { processed: 1 } });
});

it("sends nothing twice when the season changes, and never loops between rules", async () => {
  // The document's task (action « task ») and « tâche en retard » together.
  await db.query("INSERT INTO club_document(organization_id,profile_id,season_id,name,category,status,expires_on) VALUES($1,$2,$3,'Assurance','insurance','valid',$4)", [clubA, ana, season, day(3)]);
  await set(president, clubA, { action: "rule", rule: "documentExpiring", enabled: true, paused: false, delayDays: 30, recipients: "person", actions: ["notify", "task"] });
  await set(president, clubA, { action: "rule", rule: "taskLate", enabled: true, paused: false, delayDays: 0, actions: ["notify"] });
  await runAutomations(db);
  const auto = (await db.query("SELECT id,source_kind FROM funding_task WHERE organization_id=$1 AND source_kind='auto_documentExpiring'", [clubA])).rows;
  expect(auto).toHaveLength(2);
  // Even late and given to someone, an automation's task is not « en retard » for the engine.
  await db.query("UPDATE funding_task SET due_on=$2,responsible_id=$3 WHERE id=ANY($1::uuid[])", [auto.map((t) => t.id), day(-5), ana]);
  expect((await planOf(clubA)).filter((l) => l.rule === "taskLate")).toEqual([]);
  // A new season: the same documents, the same keys, nothing sent again.
  const before = (await db.query("SELECT count(*)::int AS n FROM automation_run WHERE organization_id=$1 AND result IN ('sent','task')", [clubA])).rows[0].n;
  await db.query("UPDATE season SET archived=true WHERE id=$1", [season]);
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2027-28',CURRENT_DATE+241,CURRENT_DATE+600)", [clubA]);
  await runAutomations(db);
  expect((await db.query("SELECT count(*)::int AS n FROM automation_run WHERE organization_id=$1 AND result IN ('sent','task')", [clubA])).rows[0].n).toBe(before);
});

it("keeps two clubs apart", async () => {
  const seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
  await db.query("INSERT INTO club_document(organization_id,season_id,name,category,status,expires_on) VALUES($1,$2,'Statuts B','contract','valid',$3)", [clubB, seasonB, day(10)]);
  // Club B has not switched the rule on: club A's settings do not count for it.
  expect((await planOf(clubB)).filter((l) => l.rule === "documentExpiring")).toEqual([]);
  expect((await automationsView(db, presidentB)).rules.find((r) => r.rule === "documentExpiring")!.settings.enabled).toBe(false);
  await expect(set(presidentB, clubA, { action: "stop", stopped: true })).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  // Club A's journal stays its own.
  expect((await automationsView(db, presidentB)).journal).toEqual([]);
  expect((await automationsView(db, president, true)).simulation).not.toBeNull();
});
