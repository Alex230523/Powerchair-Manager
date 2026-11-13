import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { duesTotals } from "../../src/domains/dues/schema";
import { remindersView } from "../../src/domains/reminders/service";
import { tripExecute, tripsView } from "../../src/domains/trips/service";
import { financeExecute, financeView } from "../../src/domains/finance/service";
import { fundraisingExecute, fundraisingView } from "../../src/domains/fundraising/service";
import { brusselsDay } from "../../src/lib/today";

/** Wave 15 (1.C): dues, trips and pots follow the team in view, with the same figures everywhere. */
const schema = "w15team_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, seasonA: string, teamA1: string, teamA2: string, teamB1: string;
let president: Principal, presidentB: Principal, emmaUser: Principal, lucasUser: Principal;
let emma: string, lucas: string, noah: string;
const inDays = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(org: string, name: string, person?: string) {
  const pid = person ?? (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2008-01-01','{player}') RETURNING id", [org, pid, name])).rows[0].id as string;
}
const member = (team: string, profile: string, org = clubA) =>
  db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)", [org, team, profile]);
const trip = (title: string, teamId: string | null | undefined) => ({
  action: "create" as const,
  title,
  kind: "tournament" as const,
  startsOn: inDays(20),
  endsOn: inDays(21),
  sharedVenueId: null,
  placeId: null,
  destination: "Gand",
  meetingPoint: "",
  departureAt: null,
  returnAt: null,
  returnPoint: "",
  accommodation: "",
  accommodationAccessible: null,
  emergency: "",
  contact: "",
  notes: "",
  locale: "fr" as const,
  ...(teamId === undefined ? {} : { teamId }),
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  const seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
  teamA1 = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe A','blue') RETURNING id", [clubA, seasonA])).rows[0].id;
  teamA2 = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe B','coral') RETURNING id", [clubA, seasonA])).rows[0].id;
  teamB1 = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Autre club') RETURNING id", [clubB, seasonB])).rows[0].id;
  president = (await actor(clubA, "club_president")).p;
  presidentB = (await actor(clubB, "club_president")).p;
  const e = await actor(clubA, "player");
  const l = await actor(clubA, "player");
  emmaUser = e.p;
  lucasUser = l.p;
  emma = await player(clubA, "Emma Peeters", e.person);
  lucas = await player(clubA, "Lucas Janssens", l.person);
  noah = await player(clubA, "Noah Dubois");
  await member(teamA1, emma);
  await member(teamA2, lucas);
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

it("gives each dues line its teams and the same totals on the dues page, the home card and the menu counter", async () => {
  const { id: club } = await duesExecute(db, president, { action: "plan", seasonId: seasonA, category: "Joueur", amountCents: 20000, maxInstallments: 2, firstDue: inDays(10) }, clubA);
  const { id: forB } = await duesExecute(db, president, { action: "plan", seasonId: seasonA, category: "Équipe B", amountCents: 8000, maxInstallments: 1, firstDue: inDays(10), teamId: teamA2 }, clubA);
  // Late lines: Emma (team A) and Lucas (team B) on the whole-club rate, Noah (no team) on team B's rate.
  for (const [plan, profile] of [[club, emma], [club, lucas], [forB, noah]] as const)
    await duesExecute(db, president, { action: "issue", planId: plan, profileId: profile, discountCents: 0, reason: "", installments: 1, firstDue: "2020-01-31" }, clubA);
  const page = await duesView(db, president);
  const teamsOf = Object.fromEntries(page.debts.map((d) => [d.full_name, d.team_ids]));
  expect(teamsOf).toEqual({ "Emma Peeters": [teamA1], "Lucas Janssens": [teamA2], "Noah Dubois": [teamA2] });
  expect(page.teams.map((t) => [t.name, t.color])).toEqual([
    ["Équipe A", "blue"],
    ["Équipe B", "coral"],
  ]);
  const today = inDays(0);
  for (const [team, playersLate, due] of [
    [teamA1, 1, 20000],
    [teamA2, 2, 28000],
    [null, 3, 48000],
  ] as const) {
    const fromPage = duesTotals(page.debts.filter((d) => d.season_id === seasonA), today, team);
    const home = await dashboardView(db, president, { team: team ?? undefined });
    expect(fromPage).toMatchObject({ playersLate, due });
    expect(home.finance?.dues).toEqual(fromPage);
    expect(home.todos.find((x) => x.key === "duesLate")?.count).toBe(playersLate);
  }
  // The reminders page gets the same teams, to tick the late payers of one team only.
  const reminders = await remindersView(db, president);
  expect(Object.fromEntries(reminders.dues.map((r) => [r.full_name, r.team_ids]))).toEqual(teamsOf);
  // The other club sees none of it.
  expect((await dashboardView(db, presidentB)).finance?.dues?.due).toBe(0);
});

it("keeps a trip's team inside the club and counts its money for that team", async () => {
  const { id: tripA } = await tripExecute(db, president, trip("Tournoi de Gand", teamA1), clubA);
  await tripExecute(db, president, trip("Fête du club", null), clubA);
  await expect(tripExecute(db, president, trip("Intrus", teamB1), clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const list = await tripsView(db, president);
  expect(list.teams.map((t) => t.name)).toEqual(["Équipe A", "Équipe B"]);
  expect(list.trips.map((t) => [t.title, t.team_name])).toEqual(
    expect.arrayContaining([
      ["Tournoi de Gand", "Équipe A"],
      ["Fête du club", null],
    ]),
  );
  // Editing without the field keeps the team; choosing "whole club" clears it.
  const version = (await db.query("SELECT version FROM trip WHERE id=$1", [tripA])).rows[0].version;
  const { action: _a, locale: _l, teamId: _t, ...fields } = trip("Tournoi de Gand", null);
  await tripExecute(db, president, { action: "update", id: tripA, version, ...fields }, clubA);
  expect((await db.query("SELECT team_id FROM trip WHERE id=$1", [tripA])).rows[0].team_id).toBe(teamA1);
  // An expense recorded on the trip, without a team, belongs to the trip's team.
  await financeExecute(
    db,
    president,
    { action: "record", occurredOn: inDays(-1), label: "Location minibus", direction: "out", category: "travel", amountCents: 12000, method: "transfer", counterparty: "", reference: "", notes: "", tripId: tripA },
    clubA,
  );
  const forA = await financeView(db, president, { team: teamA1 });
  expect(forA.entries.map((e) => [e.label, e.team_name])).toEqual([["Location minibus", "Équipe A"]]);
  expect((await financeView(db, president, { team: teamA2 })).entries).toEqual([]);
});

it("offers a team pot to that team's players only, and ranks only them", async () => {
  const { id: group } = await fundraisingExecute(db, president, { action: "group", name: "Tournois", description: "", archived: false }, clubA);
  const { id: pot } = await fundraisingExecute(
    db,
    president,
    { action: "pot", groupId: group, name: "Tournoi de Gand", description: "", goalCents: 100000, deadline: inDays(30), status: "open", playersJoin: true, teamId: teamA1 },
    clubA,
  );
  await expect(
    fundraisingExecute(db, president, { action: "pot", groupId: group, name: "Intrus", description: "", goalCents: 1000, deadline: null, status: "open", teamId: teamB1 }, clubA),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Emma (team A) sees it and collects; Lucas (team B) neither sees it nor may collect for it.
  expect((await fundraisingView(db, emmaUser)).pots.map((p) => p.name)).toEqual(["Tournoi de Gand"]);
  expect((await fundraisingView(db, lucasUser)).pots).toEqual([]);
  await fundraisingExecute(db, emmaUser, { action: "collect", potId: pot, profileId: emma, occurredOn: inDays(0), kind: "action", label: "Gaufres", amountCents: 3000, donor: "" }, clubA);
  await expect(
    fundraisingExecute(db, lucasUser, { action: "collect", potId: pot, profileId: lucas, occurredOn: inDays(0), kind: "action", label: "Gaufres", amountCents: 3000, donor: "" }, clubA),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  // A manager cannot credit a player of another team either.
  await expect(
    fundraisingExecute(db, president, { action: "movement", potId: pot, occurredOn: inDays(0), kind: "donation", label: "Don", amountCents: 500, donor: "", anonymous: false, profileId: lucas }, clubA),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const managed = await fundraisingView(db, president);
  const shown = managed.pots.find((p) => p.id === pot)!;
  expect(shown.team_name).toBe("Équipe A");
  expect(shown.team_members).toEqual([emma]);
  expect(shown.collectors.map((c) => c.name)).toEqual(["Emma Peeters"]);
  // The other club never sees the pot.
  expect((await fundraisingView(db, presidentB)).pots).toEqual([]);
});
