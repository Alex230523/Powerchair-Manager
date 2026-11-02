import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { financeOperations, financeView } from "../../src/domains/finance/service";
import { calendarView } from "../../src/domains/calendar/service";
import { journalView } from "../../src/domains/club/governance";

/**
 * Technical fixes (13): the table task under its real name, with the old
 * names still answering for one version; a club of 10 000 operations and
 * 5 000 events read a page at a time, with totals over everything; two
 * clubs apart.
 */
const schema = "t13_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string;
let presidentA: Principal, presidentB: Principal;

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
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
}, 240000);
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("renames funding_task to task without losing a row, the old names still answering", async () => {
  const kinds = (await db.query("SELECT relname,relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND relname IN ('task','task_proof','funding_task','funding_task_proof','org_task') ORDER BY relname", [schema])).rows;
  expect(kinds.map((r) => `${r.relname}:${r.relkind}`)).toEqual(["funding_task:v", "funding_task_proof:v", "org_task:v", "task:r", "task_proof:r"]);
  // An older deployment writes through the old name: the row lands in task, its category set by the trigger.
  const id = (await db.query("INSERT INTO funding_task(organization_id,title,kind,created_by) VALUES($1,'Ancien code','other',$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  expect((await db.query("SELECT title,category FROM task WHERE id=$1", [id])).rows[0]).toEqual({ title: "Ancien code", category: "other" });
  expect((await db.query("SELECT count(*)::int AS n FROM org_task WHERE id=$1", [id])).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM funding_task WHERE id=$1", [id])).rows[0].n).toBe(1);
  // Constraints, indexes and the trigger carry the new name.
  const names = (await db.query("SELECT conname AS n FROM pg_constraint WHERE conrelid=$1::regclass UNION ALL SELECT indexname FROM pg_indexes WHERE schemaname=$2 AND tablename='task' UNION ALL SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal", [`${schema}.task`, schema])).rows.map((r) => r.n as string);
  expect(names.length).toBeGreaterThan(10);
  expect(names.filter((n) => n.startsWith("funding_task"))).toEqual([]);
  expect(names).toContain("task_category");
});

it("pages 10 000 operations newest first, with the totals of all of them and the filters on the server", async () => {
  await db.query(
    `INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by)
     SELECT $1,CURRENT_DATE-(i%300),'Opération '||i,CASE WHEN i%4=0 THEN 'out' ELSE 'in' END,CASE WHEN i%4=0 THEN 'equipment' ELSE 'dues' END,100,$2 FROM generate_series(1,10000) i`,
    [clubA, presidentA.userId],
  );
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,'Autre club','in','dues',999,$2)", [clubB, presidentB.userId]);
  const view = await financeView(db, presidentA);
  expect(view.entries).toHaveLength(100);
  expect(view.entriesNext).toBeTruthy();
  // The figures come from every line of the season, not from the page.
  const season = (await db.query("SELECT count(*) FILTER (WHERE direction='in')::int AS i,count(*) FILTER (WHERE direction='out')::int AS o FROM finance_transaction WHERE organization_id=$1 AND occurred_on BETWEEN $2 AND $3", [clubA, view.season.from, view.season.to])).rows[0];
  expect([view.summary.income, view.summary.expenses]).toEqual([season.i * 100, season.o * 100]);
  // Every page in turn: no line twice, none missing, newest first.
  const seen = new Set<string>();
  let next: string | null = null,
    last = "9999-12-31",
    pages = 0;
  do {
    const page: Awaited<ReturnType<typeof financeOperations>> = await financeOperations(db, presidentA, {}, { after: next ?? undefined });
    for (const e of page.items) {
      expect(seen.has(e.id)).toBe(false);
      expect(e.occurred_on <= last).toBe(true);
      last = e.occurred_on;
      seen.add(e.id);
    }
    next = page.next;
    pages++;
  } while (next);
  expect([seen.size, pages]).toEqual([10000, 100]);
  // Filters run on the server, over everything.
  const out = await financeOperations(db, presidentA, {}, { direction: "out" });
  expect(out.items.every((e) => e.direction === "out")).toBe(true);
  const found = await financeOperations(db, presidentA, {}, { q: "Opération 9999" });
  expect(found.items.map((e) => e.label)).toEqual(["Opération 9999"]);
  // A wildcard typed in the search is a plain character.
  expect((await financeOperations(db, presidentA, {}, { q: "%" })).items).toEqual([]);
  // The other club sees only its own line.
  expect((await financeOperations(db, presidentB, {}, {})).items.map((e) => e.label)).toEqual(["Autre club"]);
  // An altered cursor is refused.
  await expect(financeOperations(db, presidentA, {}, { after: "bm90LWEtY3Vyc29y" })).rejects.toThrow();
}, 240000);

it("shows a whole month of a busy calendar, and the list of 5 000 events a page at a time", async () => {
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  await db.query(
    `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility)
     SELECT $1,$2,i,'Séance '||i,'training','Europe/Brussels',t,t+interval '1 hour',to_char(t AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((t+interval '1 hour') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$3,'organization'
       FROM generate_series(1,5000) i, LATERAL (SELECT timestamptz '2027-01-01 09:00+01'+(i/20)*interval '1 day'+(i%20)*interval '30 minutes' AS t) x`,
    [clubA, series, presidentA.userId],
  );
  // January 2027: 31 days of 20 sessions, all of them (the old view stopped at 100).
  const month = await calendarView(db, presidentA, { from: "2027-01-01", to: "2027-02-01", team: "", place: "", all: "false" });
  const january = (await db.query("SELECT count(*)::int AS n FROM calendar_event WHERE organization_id=$1 AND starts_at<'2027-02-01' AND ends_at>'2027-01-01'", [clubA])).rows[0].n;
  expect([month.events.length, month.next]).toEqual([january, null]);
  expect(january).toBeGreaterThan(100);
  // The list of every event: pages of 100, in order, none twice.
  const seen = new Set<string>();
  let next: string | null = null,
    pages = 0;
  do {
    const page = await calendarView(db, presidentA, { from: "2027-01-01", to: "2027-02-01", team: "", place: "", all: "true", after: next ?? undefined });
    for (const e of page.events) seen.add(e.id);
    next = page.next;
    pages++;
  } while (next && pages < 60);
  expect([seen.size, pages]).toEqual([5000, 50]);
  // The other club sees none of them.
  expect((await calendarView(db, presidentB, { from: "2027-01-01", to: "2027-02-01", team: "", place: "", all: "true" })).events).toEqual([]);
}, 600000);

it("pages the rights journal, newest first", async () => {
  await db.query(
    "INSERT INTO audit_log(organization_id,actor_id,action,target_id) SELECT $1,$2,'mandate.revoke',gen_random_uuid()::text FROM generate_series(1,250)",
    [clubA, presidentA.userId],
  );
  const first = await journalView(db, presidentA, { kind: "rights" });
  expect(first.rows).toHaveLength(100);
  const second = await journalView(db, presidentA, { kind: "rights", after: first.next ?? undefined });
  const third = await journalView(db, presidentA, { kind: "rights", after: second.next ?? undefined });
  expect(third.next).toBeNull();
  const ids = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.length).toBeGreaterThanOrEqual(250);
  expect((await journalView(db, presidentB, { kind: "rights" })).rows.some((r) => ids.includes(r.id))).toBe(false);
});
