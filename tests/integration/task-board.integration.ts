import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { tasksExecute, tasksView } from "../../src/domains/tasks/service";
import { syncSources, tellAssignedTick } from "../../src/domains/tasks/sources";
import { taskCommand } from "../../src/domains/tasks/schema";
import { presets } from "../../src/domains/tasks/presets";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * 12/11/2026, the task board, on the real database. Club A and club B: the
 * order chosen by dragging, a task dropped into another category or into a
 * list of the club's own, the order of the groups; people in charge and
 * material from the row; the ready-made lists; a match within two weeks
 * gives its preparation to the team's coaches, who are told once, like the
 * people of a match's checklist; a yearly grant that reopens; the season
 * that ends. Club B never sees nor moves club A's tasks.
 */
const schema = "taskboard_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coach: Principal & { profile: string }, player: Principal, team: string;
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
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, org: string, cmd: Record<string, unknown>) => tasksExecute(db, p, taskCommand.parse(cmd), org) as Promise<{ ok: true; ids?: string[]; id?: string }>;
const titles = async (org: string, where: string) => (await db.query(`SELECT title FROM task WHERE organization_id=$1 AND ${where} ORDER BY board_position NULLS LAST,title`, [org])).rows.map((r) => r.title as string);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  const c = await actor(clubA, "coach", "Coach A");
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Coach A','{coach}' FROM person WHERE user_id=$2 RETURNING id", [clubA, c.userId])).rows[0].id;
  coach = { ...c, profile };
  player = await actor(clubA, "player", "Joueur A");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',$2,$3) RETURNING id", [clubA, plus(-300), plus(30)])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id", [clubA, season])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'coach')", [clubA, team, profile]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps the order chosen by dragging, moves a task to another category or a list, and orders the groups", async () => {
  const [a] = (await run(presidentA, clubA, { action: "create", category: "equipment", title: "Gonfler les pneus" })).ids!;
  const [b] = (await run(presidentA, clubA, { action: "create", category: "equipment", title: "Acheter des batteries" })).ids!;
  const [c] = (await run(presidentA, clubA, { action: "create", category: "admin", title: "Assurance" })).ids!;
  await run(presidentA, clubA, { action: "reorder", group: "cat:equipment", ids: [a, b] });
  expect(await titles(clubA, "category='equipment'")).toEqual(["Gonfler les pneus", "Acheter des batteries"]);
  // « Assurance » dropped between the two: it changes category.
  await run(presidentA, clubA, { action: "reorder", group: "cat:equipment", ids: [a, c, b] });
  expect(await titles(clubA, "category='equipment'")).toEqual(["Gonfler les pneus", "Assurance", "Acheter des batteries"]);
  // A list of the club's own; a task dropped into it.
  const list = (await run(presidentA, clubA, { action: "saveList", name: "Buvette" })).id!;
  await run(presidentA, clubA, { action: "reorder", group: `list:${list}`, ids: [c] });
  expect((await db.query("SELECT category,list_id FROM task WHERE id=$1", [c])).rows[0]).toEqual({ category: "other", list_id: list });
  const [d] = (await run(presidentA, clubA, { action: "create", category: "other", listId: list, title: "Commander les boissons" })).ids!;
  expect((await db.query("SELECT list_id FROM task WHERE id=$1", [d])).rows[0].list_id).toBe(list);
  await expect(run(presidentA, clubA, { action: "deleteList", id: list })).rejects.toMatchObject({ code: "LIST_NOT_EMPTY" });
  await run(presidentA, clubA, { action: "groupOrder", order: [`list:${list}`, "cat:equipment"] });
  const view = await tasksView(db, presidentA);
  expect(view.lists).toEqual([{ id: list, name: "Buvette" }]);
  expect(view.groupOrder).toEqual([`list:${list}`, "cat:equipment"]);
  // Club B: nothing of club A, and no move of it.
  expect((await tasksView(db, presidentB)).tasks.map((x) => x.id)).not.toEqual(expect.arrayContaining([a]));
  expect((await tasksView(db, presidentB)).lists).toEqual([]);
  await expect(run(presidentB, clubB, { action: "reorder", group: "cat:equipment", ids: [a] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "reorder", group: `list:${list}`, ids: [a] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Who does not plan cannot reorder.
  await expect(run(player, clubA, { action: "reorder", group: "cat:equipment", ids: [a, b] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("gives a task to someone and lists its material from the row", async () => {
  const [x] = (await run(presidentA, clubA, { action: "create", category: "sport", title: "Préparer les maillots" })).ids!;
  await run(presidentA, clubA, { action: "assign", id: x, assignees: [coach.profile] });
  const mine = (await tasksView(db, coach)).tasks.find((t) => t.id === x)!;
  expect(mine.assignees.map((a) => a.name)).toEqual(["Coach A"]);
  // Told at once, once.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_id=$1", [x])).rows[0].n).toBe(1);
  expect((await db.query("SELECT told_at IS NOT NULL AS told FROM task_assignee WHERE task_id=$1", [x])).rows[0].told).toBe(true);
  await run(coach, clubA, { action: "materials", id: x, items: ["Maillots", "Shorts", "Maillots"] });
  expect((await db.query("SELECT materials FROM task WHERE id=$1", [x])).rows[0].materials).toEqual(["Maillots", "Shorts"]);
  // A player who is not in charge: neither sees nor changes it.
  await expect(run(player, clubA, { action: "materials", id: x, items: ["Rien"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("applies a ready-made list in the club's language, or copies it into the templates", async () => {
  const home = presets.find((p) => p.key === "matchHome")!;
  const r = await run(presidentA, clubA, { action: "fromPreset", preset: "matchHome", locale: "nl", date: plus(30), excluded: [0] });
  expect(r.ids).toHaveLength(home.items.length - 1);
  expect(await titles(clubA, `id=ANY('{${r.ids!.join(",")}}'::uuid[])`)).toContain("De scheidsrechters bevestigen");
  expect((await db.query("SELECT due_on::text AS d FROM task WHERE title='De scheidsrechters bevestigen'")).rows[0].d).toBe(plus(16));
  const t = (await run(presidentA, clubA, { action: "copyPreset", preset: "assembly", locale: "fr", name: "Assemblée générale" })).id!;
  expect((await db.query("SELECT items->0->>'title' AS first FROM task_template WHERE id=$1", [t])).rows[0].first).toBe("Arrêter les comptes de l'année");
  await expect(run(presidentA, clubA, { action: "fromPreset", preset: "inconnu", date: plus(3) })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(coach, clubA, { action: "fromPreset", preset: "matchHome", date: plus(3) })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("prepares a match two weeks ahead for the team's coaches, who are told once; a grant that reopens; the season that ends", async () => {
  const match = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,created_by) VALUES($1,$2,'Les Aigles','league',($3::date+10)::timestamptz+interval '14 hours',$4) RETURNING id", [clubA, team, today, presidentA.userId])).rows[0].id;
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,created_by) VALUES($1,$2,'Trop loin','league',($3::date+40)::timestamptz,$4)", [clubA, team, today, presidentA.userId]);
  const old = (await db.query("INSERT INTO grant_application(organization_id,funder,program,status,opens_on,deadline_on,created_by) VALUES($1,'Province','Sport adapté','paid',$2::date-interval '1 year'+interval '10 days',$2::date-interval '1 year'+interval '60 days',$3) RETURNING id", [clubA, today, presidentA.userId])).rows[0].id;
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await syncSources(c, clubA);
    await c.query("COMMIT");
  } finally {
    c.release();
  }
  const prep = (await db.query("SELECT id,title,responsible_id,match_id,due_on::text AS due FROM task WHERE organization_id=$1 AND source_kind='matchPrep'", [clubA])).rows;
  expect(prep).toHaveLength(1);
  expect(prep[0]).toMatchObject({ responsible_id: coach.profile, match_id: match, due: plus(8) });
  expect((await tasksView(db, coach)).tasks.map((t) => t.id)).toContain(prep[0].id);
  // Told by the hourly task, once.
  expect(await tellAssignedTick(db)).toBeGreaterThanOrEqual(1);
  expect(await tellAssignedTick(db)).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_id=$1", [prep[0].id])).rows[0].n).toBe(1);
  // A match's checklist given to the coach: told too (it was forgotten before).
  await db.query("INSERT INTO task(organization_id,kind,category,title,responsible_id,match_id,origin,created_by) VALUES($1,'equipment','sport','Charger les batteries',$2,$3,'template',$4)", [clubA, coach.profile, match, presidentA.userId]);
  expect(await tellAssignedTick(db)).toBe(1);
  // The grant of last year reopens; a new file for it closes the task.
  const reopen = (await db.query("SELECT status,grant_id FROM task WHERE organization_id=$1 AND source_kind='grantReopen'", [clubA])).rows;
  expect(reopen).toEqual([{ status: "todo", grant_id: old }]);
  await db.query("INSERT INTO grant_application(organization_id,funder,program,created_by) VALUES($1,'Province','Sport adapté',$2)", [clubA, presidentA.userId]);
  const c2 = await db.connect();
  try {
    await c2.query("BEGIN");
    await syncSources(c2, clubA);
    await c2.query("COMMIT");
  } finally {
    c2.release();
  }
  expect((await db.query("SELECT status,auto_closed FROM task WHERE organization_id=$1 AND source_kind='grantReopen'", [clubA])).rows).toEqual([{ status: "done", auto_closed: true }]);
  // The season ends within 45 days and no next one exists.
  expect((await db.query("SELECT count(*)::int AS n FROM task WHERE organization_id=$1 AND source_kind='seasonNext'", [clubA])).rows[0].n).toBe(1);
  // Club B: none of it.
  expect((await db.query("SELECT count(*)::int AS n FROM task WHERE organization_id=$1 AND source_kind IN ('matchPrep','grantReopen','seasonNext')", [clubB])).rows[0].n).toBe(0);
});
