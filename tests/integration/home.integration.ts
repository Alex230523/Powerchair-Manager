import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { duesTotals } from "../../src/domains/dues/schema";
import { financeExecute } from "../../src/domains/finance/service";
import { calendarExecute } from "../../src/domains/calendar/service";
import { brusselsDay } from "../../src/lib/today";

/** Wave 14: the president's home card of money and the week view, under the same rules as the pages. */
const schema = "home_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, seasonA: string, teamA: string, presidentA: Principal, presidentB: Principal, coachA: Principal, parentA: Principal, emma: string;
const inDays = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

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

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [clubB]);
  teamA = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe A','teal') RETURNING id", [clubA, seasonA])).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  coachA = await actor(clubA, "coach", ["calendar.read", "people.read"]);
  parentA = await actor(clubA, "guardian");
  const person = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  emma = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Emma Peeters','2010-01-01','{player}') RETURNING id", [clubA, person])).rows[0].id;
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

it("names the season and tells the Créer menu what the actor may do", async () => {
  const home = await dashboardView(db, presidentA);
  expect(home.season).toEqual({ id: seasonA, name: "2026-27" });
  expect(home.can).toEqual({ event: true, player: true, operation: true, mail: true });
  expect((await dashboardView(db, coachA)).can).toEqual({ event: false, player: false, operation: false, mail: false });
});

it("shows the money card to the people trusted with money only, with the dues page's own totals", async () => {
  const { id: planId } = await duesExecute(db, presidentA, { action: "plan", seasonId: seasonA, category: "Joueur", amountCents: 25000, maxInstallments: 4, firstDue: inDays(10) }, clubA);
  await duesExecute(db, presidentA, { action: "issue", planId, profileId: emma, discountCents: 0, reason: "", installments: 4, firstDue: "2020-01-31" }, clubA);
  const receivable = (await db.query("SELECT id FROM dues_receivable WHERE profile_id=$1", [emma])).rows[0].id;
  await duesExecute(db, presidentA, { action: "pay", id: receivable, amountCents: 10000, method: "transfer", occurredOn: inDays(-1), reference: "" }, clubA);
  await financeExecute(
    db,
    presidentA,
    { action: "record", occurredOn: inDays(-2), label: "Subside", direction: "in", category: "subsidy", amountCents: 80000, method: "transfer", counterparty: "", reference: "", notes: "" },
    clubA,
  );
  const home = await dashboardView(db, presidentA);
  expect(home.scopes).toContain("money");
  expect(home.finance).toBeDefined();
  // Treasury: the subsidy plus the dues payment written in the ledger; income of the season the same.
  expect(home.finance?.treasury).toBe(90000);
  expect(home.finance?.income).toBe(90000);
  expect(home.finance?.expenses).toBe(0);
  // The dues rate is exactly what the dues page computes from its own rows.
  const page = await duesView(db, presidentA);
  const expected = duesTotals(page.debts.filter((d) => d.season_id === seasonA), inDays(0));
  expect(home.finance?.dues).toEqual(expected);
  expect(expected).toMatchObject({ due: 25000, collected: 10000, rate: 40, playersLate: 1 });
  expect(home.todos.find((x) => x.key === "duesLate")?.count).toBe(1);
  // The other club's president sees only their own (empty) figures; a coach without money rights and a parent never get the card.
  expect((await dashboardView(db, presidentB)).finance).toEqual({ treasury: 0, income: 0, expenses: 0, dues: { due: 0, collected: 0, late: 0, playersLate: 0, rate: null } });
  expect((await dashboardView(db, coachA)).finance).toBeUndefined();
  expect((await dashboardView(db, parentA)).finance).toBeUndefined();
  // Modules switched off: no card at all, or the dues part only.
  await db.query("UPDATE organization SET disabled_modules='{finance}' WHERE id=$1", [clubA]);
  const noFinance = await dashboardView(db, presidentA);
  expect(noFinance.finance?.treasury).toBeNull();
  expect(noFinance.finance?.dues?.rate).toBe(40);
  await db.query("UPDATE organization SET disabled_modules='{finance,dues}' WHERE id=$1", [clubA]);
  expect((await dashboardView(db, presidentA)).finance).toBeUndefined();
  await db.query("UPDATE organization SET disabled_modules='{}' WHERE id=$1", [clubA]);
});

it("lists the events of the week asked for, under the calendar's visibility and the team in view", async () => {
  const monday = (() => {
    const d = new Date(inDays(0) + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const day = (n: number) => {
    const d = new Date(monday + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const create = (title: string, dayIso: string, teamId: string | null, visibility: "organization" | "team") =>
    calendarExecute(
      db,
      presidentA,
      {
        action: "create",
        title,
        kind: "training",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: `${dayIso}T18:00`,
        localEnd: `${dayIso}T19:30`,
        fold: "reject",
        teamId,
        placeId: null,
        freeLocation: "Salle",
        responsibleId: presidentA.userId,
        visibility,
        equipment: "",
        instructions: "",
        participants: [],
        documents: [],
        intervalDays: 0,
        occurrences: 1,
        requestId: randomUUID(),
      },
      clubA,
    );
  await create("Mardi équipe A", day(1), teamA, "team");
  await create("Jeudi club", day(3), null, "organization");
  await create("Semaine suivante", day(8), null, "organization");
  const week = (await dashboardView(db, presidentA, { week: monday })).week;
  expect(week?.from).toBe(monday);
  expect(week?.to).toBe(day(6));
  expect(week?.events.map((e) => [e.title, e.teamColor])).toEqual([
    ["Mardi équipe A", "teal"],
    ["Jeudi club", null],
  ]);
  // A malformed week asks for nothing; the other club sees none of it.
  expect((await dashboardView(db, presidentA, { week: "lundi" })).week).toBeUndefined();
  expect((await dashboardView(db, presidentB, { week: monday })).week?.events).toEqual([]);
  // A parent without any link to the team only sees the club-wide session.
  expect((await dashboardView(db, parentA, { week: monday })).week?.events.map((e) => e.title)).toEqual(["Jeudi club"]);
});
