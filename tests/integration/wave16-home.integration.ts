import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { clubExecute } from "../../src/domains/club/service";
import { obligationsView, obligationsExecute } from "../../src/domains/club/obligations";

/** Wave 16 (A): the president's home and the club status, in two clubs. */
const schema = "w16home_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, coachA: Principal, presidentB: Principal, season: string;
const year = new Date().getFullYear();

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id,locale) VALUES($1,'fr')", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const player = async (org: string, name: string) =>
  (
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2010-01-01','{player}' FROM p RETURNING id",
      [org, name],
    )
  ).rows[0].id as string;
const join = (org: string, team: string, profile: string, role = "player") =>
  db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-1)", [org, team, profile, role]);
const board = async (p: Principal) => (await dashboardView(db, p)).board!;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("proposes the obligations of the club's form, in its own club only", async () => {
  await clubExecute(db, presidentA, { action: "identity", name: "Club A", contactEmail: "", legalForm: "asbl" }, clubA);
  const view = await obligationsView(db, presidentA);
  expect(view.legalForm).toBe("asbl");
  expect(view.rows.map((r) => r.template_key)).toEqual(["federation", "sportea", "insurance", "assembly", "accountsApproved", "accountsFiled", "ubo", "board", "members"]);
  expect(view.rows[0].title).toBe("Affiliation fédération (BPCF) payée");
  expect((await obligationsView(db, presidentB)).rows).toEqual([]);
  await expect(obligationsView(db, coachA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(obligationsExecute(db, presidentB, { action: "archive", id: view.rows[0].id }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Proposing again adds nothing twice; another form adds only what is missing.
  expect(await obligationsExecute(db, presidentA, { action: "propose", year, locale: "fr" }, clubA)).toMatchObject({ added: 0 });
});

it("ticks the accounts lines from the annual accounts and shows the club status square", async () => {
  await db.query(
    "INSERT INTO annual_accounts(organization_id,year_start,year_end,status,snapshot,approved_on,created_by) VALUES($1,$2,$3,'approved','{}',CURRENT_DATE,$4)",
    [clubA, `${year - 1}-01-01`, `${year - 1}-12-31`, presidentA.userId],
  );
  const view = await obligationsView(db, presidentA);
  expect(view.rows.find((r) => r.template_key === "accountsApproved")).toMatchObject({ automatic: true, state: "done" });
  expect(view.rows.find((r) => r.template_key === "accountsFiled")?.state).not.toBe("done");
  const square = (await board(presidentA)).squares.find((s) => s.key === "clubStatus");
  expect(square).toMatchObject({ count: 8, status: { done: 1, total: 9 } });
  expect(square!.status!.next).toHaveLength(2);
  // All done: the square turns green (0 left).
  for (const r of view.rows.filter((r) => r.state !== "done"))
    await obligationsExecute(db, presidentA, { action: "update", id: r.id, version: r.version, title: r.title, description: "", periodicity: "annual", dueOn: null, doneOn: `${year}-01-15`, proofUrl: "", responsibleId: null }, clubA);
  expect((await board(presidentA)).squares.find((s) => s.key === "clubStatus")?.count).toBe(0);
  // The other club's home knows nothing of it.
  expect((await board(presidentB)).squares.find((s) => s.key === "clubStatus")).toMatchObject({ status: { total: 0 } });
});

it("prepares next year: yearly lines again, unticked, one year later", async () => {
  const first = (await obligationsView(db, presidentA)).rows[0];
  await obligationsExecute(db, presidentA, { action: "update", id: first.id, version: first.version, title: first.title, description: "", periodicity: "annual", dueOn: `${year}-03-31`, doneOn: `${year}-01-15`, proofUrl: "https://example.org/preuve", responsibleId: null }, clubA);
  await obligationsExecute(db, presidentA, { action: "add", year, title: "Rénovation des statuts", description: "", periodicity: "once", dueOn: null, doneOn: null, proofUrl: "", responsibleId: null }, clubA);
  expect(await obligationsExecute(db, presidentA, { action: "nextYear", year }, clubA)).toMatchObject({ added: 9 });
  const next = await obligationsView(db, presidentA, { year: year + 1 });
  expect(next.rows).toHaveLength(9);
  expect(next.rows[0]).toMatchObject({ due_on: `${year + 1}-03-31`, proof_url: "", state: "todo" });
  // The automatic line is ticked again only by next year's accounts.
  expect(next.rows.find((r) => r.template_key === "accountsApproved")?.done_on).toBeNull();
});

it("keeps six squares, replaces one whose module is off, and counts each player and match once", async () => {
  let squares = (await board(presidentA)).squares.map((s) => s.key);
  expect(squares.slice(0, 6)).toEqual(["documents", "registersToClose", "registrationsReview", "duesLate", "moneyTasks", "clubStatus"]);
  await db.query("UPDATE organization SET disabled_modules='{dues}' WHERE id=$1", [clubA]);
  squares = (await board(presidentA)).squares.map((s) => s.key);
  expect(squares).not.toContain("duesLate");
  expect(squares).toHaveLength(6);
  await db.query("UPDATE organization SET disabled_modules='{}' WHERE id=$1", [clubA]);

  const lions = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  const tigers = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Tigres') RETURNING id", [clubA, season])).rows[0].id;
  const zoe = await player(clubA, "Zoé"),
    yanis = await player(clubA, "Yanis"),
    coach = await player(clubA, "Coach");
  await join(clubA, lions, zoe);
  await join(clubA, tigers, zoe);
  await join(clubA, tigers, yanis);
  await join(clubA, lions, coach, "coach");
  await join(clubA, tigers, coach, "assistant");
  for (const day of [1, 2]) await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Adverse','tournament',now()-$3::int*interval '1 day','played',2,1,$4)", [clubA, lions, day, presidentA.userId]);
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,created_by) VALUES($1,$2,'Plus tard','league',now()+interval '3 days','scheduled',$3)", [clubA, lions, presidentA.userId]);
  for (const [title, kind, ago] of [
    ["Entraînement", "training", 2],
    ["Journée", "tournament", 1],
  ] as const) {
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,$3,$4,'Europe/Brussels',now()-$5::int*interval '1 day',now()-$5::int*interval '1 day'+interval '1 hour','2026-10-19T18:30','2026-10-19T19:30',$6,$7,'organization')",
      [clubA, series, title, kind, ago, lions, presidentA.userId],
    );
  }
  const metrics = Object.fromEntries((await dashboardView(db, presidentA)).metrics.map((m) => [m.key, m.value]));
  expect(metrics).toMatchObject({ seasonPlayers: 2, seasonTeams: 2, seasonCoaches: 1, trainingsDone: 1, matchesPlayed: 2 });
  // Not for the coach.
  expect((await dashboardView(db, coachA)).metrics.some((m) => m.key === "seasonPlayers")).toBe(false);
});
