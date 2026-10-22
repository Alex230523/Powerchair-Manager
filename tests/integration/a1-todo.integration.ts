import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { tasksExecute, tasksView } from "../../src/domains/tasks/service";
import { taskSourcesTick } from "../../src/domains/tasks/sources";
import { taskCommand } from "../../src/domains/tasks/schema";
import { fundingTaskTick } from "../../src/domains/funding/service";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * A1: the central to-do. A grant's deadline makes a task that closes by
 * itself once the file is filed, never twice; a player sees only the task
 * given to him; a recurring task comes back; the yearly model is applied
 * once; the reminders J-7 and J-1; the federation and two clubs apart.
 */
const schema = "a1todo_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, fed: string;
let presidentA: Principal, presidentB: Principal, player: Principal, fedPresident: Principal, fedWorker: Principal;
let playerProfile: string;
const today = brusselsToday();
const plus = (n: number) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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
const run = (p: Principal, org: string, cmd: Record<string, unknown>) => tasksExecute(db, p, taskCommand.parse(cmd), org) as Promise<{ ok: true; ids?: string[]; next?: string | null }>;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  player = await actor(clubA, "player", "Joueur");
  fedPresident = await actor(fed, "federation_president", "Président fédéral");
  fedWorker = await actor(fed, "federation_worker", "Secrétaire fédérale");
  playerProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Joueur','{player}' FROM person WHERE user_id=$2 RETURNING id", [clubA, player.userId])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("creates a task from a grant's deadline, once, and closes it when the file is filed", async () => {
  const grant = (await db.query("INSERT INTO grant_application(organization_id,funder,program,deadline_on,created_by) VALUES($1,'Région','Sport adapté',$2,$3) RETURNING id", [clubA, plus(20), presidentA.userId])).rows[0].id;
  const auto = (await tasksView(db, presidentA)).tasks.filter((t) => t.grant_id === grant);
  expect(auto.map((t) => [t.category, t.source_kind, t.due_on, t.status])).toEqual([["grants", "grantDeadline", plus(20), "todo"]]);
  expect(auto[0].source_params.about).toBe("Région · Sport adapté");
  // The daily run and a second view add nothing.
  await taskSourcesTick(db);
  await tasksView(db, presidentA);
  expect((await db.query("SELECT count(*)::int AS n FROM funding_task WHERE grant_id=$1", [grant])).rows[0].n).toBe(1);
  // An automatic task cannot be deleted by hand.
  await expect(run(presidentA, clubA, { action: "delete", id: auto[0].id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Filed: the task closes by itself.
  await db.query("UPDATE grant_application SET status='submitted',submitted_on=CURRENT_DATE WHERE id=$1", [grant]);
  const closed = (await tasksView(db, presidentA)).tasks.find((t) => t.id === auto[0].id)!;
  expect([closed.status, closed.auto_closed]).toEqual(["done", true]);
  // A grant with its own check-list (wave 15) keeps only those steps.
  const other = (await db.query("INSERT INTO grant_application(organization_id,funder,deadline_on,created_by) VALUES($1,'Commune',$2,$3) RETURNING id", [clubA, plus(40), presidentA.userId])).rows[0].id;
  expect((await tasksView(db, presidentA)).tasks.filter((t) => t.grant_id === other).map((t) => t.source_kind)).toEqual(["grantDeadline"]);
  await db.query("INSERT INTO funding_task(organization_id,grant_id,kind,title,origin,created_by) VALUES($1,$2,'grant','Déposer le dossier','template',$3)", [clubA, other, presidentA.userId]);
  expect((await tasksView(db, presidentA)).tasks.filter((t) => t.grant_id === other).map((t) => t.title)).toEqual(["Déposer le dossier"]);
  // The other club's view never touches it, and gets none.
  expect((await tasksView(db, presidentB)).tasks.some((t) => t.grant_id === grant)).toBe(false);
});

it("shows a player only the task given to him, which he works on", async () => {
  const [given] = (await run(presidentA, clubA, { action: "create", category: "sport", title: "Renvoyer la licence signée", dueOn: plus(5), responsibleId: playerProfile })).ids!;
  await run(presidentA, clubA, { action: "create", category: "admin", title: "Préparer l'assemblée", dueOn: plus(30) });
  // He hears it at once.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='funding_task' AND recipient_user_id=$1", [player.userId])).rows[0].n).toBe(1);
  const mine = await tasksView(db, player);
  expect(mine.can.manage).toBe(false);
  expect(mine.tasks.map((t) => t.title)).toEqual(["Renvoyer la licence signée"]);
  await run(player, clubA, { action: "status", id: given, status: "doing" });
  await run(player, clubA, { action: "addItem", id: given, text: "Faire signer le médecin" });
  await run(player, clubA, { action: "check", id: given, index: 0, done: true });
  await run(player, clubA, { action: "comment", id: given, body: "Envoyée par la poste." });
  const seen = (await tasksView(db, presidentA)).tasks.find((t) => t.id === given)!;
  expect(seen.status).toBe("doing");
  expect(seen.checklist).toEqual([{ text: "Faire signer le médecin", done: true }]);
  expect(seen.comments.map((k) => [k.author, k.body])).toEqual([["Joueur", "Envoyée par la poste."]]);
  // Nothing for somebody else, nothing he may not see.
  const other = (await tasksView(db, presidentA)).tasks.find((t) => t.title === "Préparer l'assemblée")!;
  await expect(run(player, clubA, { action: "done", id: other.id, done: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(player, clubA, { action: "create", category: "admin", title: "Pour tout le club" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("brings a recurring task back for its next date, and the yearly model once", async () => {
  const [monthly] = (await run(presidentA, clubA, { action: "create", category: "admin", title: "Relevé bancaire", dueOn: "2026-01-31", recurrence: "monthly" })).ids!;
  const { next } = await run(presidentA, clubA, { action: "done", id: monthly, done: true });
  expect((await db.query("SELECT title,due_on::text AS due,recurrence,status FROM funding_task WHERE id=$1", [next])).rows[0]).toEqual({ title: "Relevé bancaire", due: "2026-02-28", recurrence: "monthly", status: "todo" });
  // The yearly model: applied twice, kept once; done, next year's comes.
  const items = [
    { key: "assembly", title: "Assemblée générale", dueOn: "2026-06-30" },
    { key: "ubo", title: "Registre UBO", dueOn: "2026-07-30" },
  ];
  expect((await run(presidentA, clubA, { action: "applyYear", year: 2026, items })).ids).toHaveLength(2);
  expect((await run(presidentA, clubA, { action: "applyYear", year: 2026, items })).ids).toHaveLength(0);
  const ubo = (await db.query("SELECT id FROM funding_task WHERE organization_id=$1 AND source_key='year:2026:ubo'", [clubA])).rows[0].id;
  await run(presidentA, clubA, { action: "done", id: ubo, done: true });
  expect((await db.query("SELECT due_on::text AS due,category FROM funding_task WHERE organization_id=$1 AND source_key='year:2027:ubo'", [clubA])).rows).toEqual([{ due: "2027-07-30", category: "admin" }]);
  // Only those who plan apply it.
  await expect(run(player, clubA, { action: "applyYear", year: 2026, items })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("reminds the person in charge 7 days and 1 day before, once each", async () => {
  const [soon] = (await run(presidentA, clubA, { action: "create", category: "equipment", title: "Charger les batteries", dueOn: plus(1), responsibleId: playerProfile })).ids!;
  const [week] = (await run(presidentA, clubA, { action: "create", category: "events", title: "Réserver le bus", dueOn: plus(7), responsibleId: playerProfile })).ids!;
  await fundingTaskTick(db);
  await fundingTaskTick(db);
  const keys = (await db.query("SELECT resource_id FROM mail_job WHERE kind='funding_task' AND recipient_user_id=$1 AND resource_id=ANY($2::text[])", [player.userId, [soon, week]])).rows.map((r) => r.resource_id);
  // One at creation and one reminder for each.
  expect(keys.filter((k) => k === soon)).toHaveLength(2);
  expect(keys.filter((k) => k === week)).toHaveLength(2);
});

it("keeps the federation's to-do and the clubs' apart", async () => {
  const fedView = await tasksView(db, fedPresident);
  expect(fedView.federation).toBe(true);
  expect(fedView.people.map((p) => p.full_name)).toEqual(expect.arrayContaining(["Président fédéral", "Secrétaire fédérale"]));
  const [id] = (await run(fedPresident, fed, { action: "create", category: "fed_licences", title: "Valider les licences", dueOn: plus(10), responsibleUserId: fedWorker.userId })).ids!;
  // A club category is refused at the federation, and the reverse.
  await expect(run(fedPresident, fed, { action: "create", category: "grants", title: "Subside" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(run(presidentA, clubA, { action: "create", category: "fed_admin", title: "Fédéral" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  // The worker sees and ticks it; the clubs never see it.
  expect((await tasksView(db, fedWorker)).tasks.map((t) => t.id)).toContain(id);
  await run(fedWorker, fed, { action: "done", id, done: true });
  expect((await tasksView(db, presidentA)).tasks.some((t) => t.id === id)).toBe(false);
  expect((await tasksView(db, fedPresident)).tasks.every((t) => t.category.startsWith("fed_"))).toBe(true);
  await expect(run(presidentA, clubA, { action: "status", id, status: "todo" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("keeps two clubs apart", async () => {
  const a = (await tasksView(db, presidentA)).tasks.find((t) => !t.source_kind)!;
  await expect(run(presidentB, clubB, { action: "status", id: a.id, status: "done" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "comment", id: a.id, body: "Bonjour" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "create", category: "sport", title: "Pour un joueur d'ailleurs", responsibleId: playerProfile })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await tasksView(db, presidentB)).tasks.filter((t) => !t.source_kind)).toEqual([]);
});
