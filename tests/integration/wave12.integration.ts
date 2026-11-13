import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { resolveScope, teamOptions } from "../../src/domains/scope/service";
import { teamsExecute, teamsView, teamDetail } from "../../src/domains/teams/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { financeExecute, financeView, financeReport } from "../../src/domains/finance/service";
import { duesExecute } from "../../src/domains/dues/service";
import { calendarExecute, calendarView } from "../../src/domains/calendar/service";
import { seasonOf } from "../../src/domains/finance/schema";
import { brusselsDay } from "../../src/lib/today";

const schema = "wave12_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let clubA: string, clubB: string, seasonA: string, seasonB: string, teamA1: string, teamA2: string, teamB1: string;
let presidentA: Principal, presidentB: Principal, coachA: Principal, coachPerson: string, emma: string, lucas: string;

async function actor(org: string, role: string, grants: string[] = [], teamId: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants,team_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, userId, role, grants, teamId])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(org: string, name: string, team: string) {
  const person = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  const id = (
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2010-01-01','{player}') RETURNING id", [org, person, name])
  ).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [org, team, id]);
  return id;
}
const inDays = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));
const label = seasonOf(inDays(0)).label;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
  teamA1 = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe A','blue') RETURNING id", [clubA, seasonA])).rows[0].id;
  teamA2 = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Équipe B','coral') RETURNING id", [clubA, seasonA])).rows[0].id;
  teamB1 = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe B1') RETURNING id", [clubB, seasonB])).rows[0].id;
  presidentA = (await actor(clubA, "club_president")).p;
  presidentB = (await actor(clubB, "club_president")).p;
  const c = await actor(clubA, "coach", ["calendar.read", "people.read"], teamA2);
  coachA = c.p;
  coachPerson = c.person;
  emma = await player(clubA, "Emma Peeters", teamA1);
  lucas = await player(clubA, "Lucas Peeters", teamA1);
  await player(clubA, "Yanis El Amrani", teamA2);
  await player(clubB, "Sam Janssens", teamB1);
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

it("offers the club's own seasons and teams, and only the supervised ones to a coach", async () => {
  const ws = await workspace(db, presidentA);
  expect(ws.seasons.map((s) => [s.name, s.current])).toEqual([["2026-27", true]]);
  expect(ws.teams.map((t) => t.name).sort()).toEqual(["Équipe A", "Équipe B"]);
  const coach = await workspace(db, coachA);
  expect(coach.teams.map((t) => t.name)).toEqual(["Équipe B"]);
  // A coach profile coaching another team through the roster sees it too.
  const coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Karim','{coach}') RETURNING id", [clubA, coachPerson])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-10)", [clubA, teamA1, coachProfile]);
  expect((await teamOptions(db, { organization_id: clubA, role: "coach", user_id: coachA.userId, team_id: teamA2 })).map((t) => t.name).sort()).toEqual(["Équipe A", "Équipe B"]);
  await db.query("UPDATE team_membership SET cancelled=true WHERE profile_id=$1", [coachProfile]);
});

it("never lets a president pick another club's team: the choice falls back silently", async () => {
  const scope = await resolveScope(db, { organization_id: clubA, role: "club_president", user_id: presidentA.userId }, { season: seasonB, team: teamB1 });
  expect(scope).toEqual({ seasonId: seasonA, teamId: null });
  const dash = await dashboardView(db, presidentB, { team: teamA1 });
  expect(dash.metrics.find((m) => m.key === "activePlayers")?.value).toBe(1);
  await expect(teamDetail(db, presidentB, teamA1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    teamsExecute(db, presidentB, { action: "move", profileId: emma, fromTeamId: null, toTeamId: teamB1, effectiveOn: inDays(0), keep: false }, clubB),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("changes the dashboard figures with the chosen team", async () => {
  const all = await dashboardView(db, presidentA);
  expect(all.metrics.find((m) => m.key === "activePlayers")?.value).toBe(3);
  expect(all.metrics.find((m) => m.key === "activeTeams")?.value).toBe(2);
  const only = await dashboardView(db, presidentA, { team: teamA1 });
  expect(only.metrics.find((m) => m.key === "activePlayers")?.value).toBe(2);
  expect(only.metrics.find((m) => m.key === "activeTeams")?.value).toBe(1);
  // Events of the other team leave the agenda; club-wide events stay.
  for (const [title, team] of [["Entraînement A", teamA1], ["Entraînement B", teamA2], ["Assemblée", null]] as const)
    await calendarExecute(
      db,
      presidentA,
      {
        action: "create",
        title,
        kind: team ? "training" : "meeting",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: `${inDays(2)}T18:00`,
        localEnd: `${inDays(2)}T19:30`,
        fold: "reject",
        teamId: team,
        placeId: null,
        freeLocation: "Salle",
        responsibleId: presidentA.userId,
        visibility: "organization",
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
  const agenda = (await dashboardView(db, presidentA, { team: teamA2 })).agenda.map((e) => e.title).sort();
  expect(agenda).toEqual(["Assemblée", "Entraînement B"]);
  // The calendar carries each team's colour for the board.
  const cal = await calendarView(db, presidentA, { from: inDays(0), to: inDays(7), team: "", place: "" });
  expect(cal.events.find((e) => e.title === "Entraînement B")?.team_color).toBe("coral");
  expect(cal.teams.find((t) => t.name === "Équipe A")?.color).toBe("blue");
});

it("shows one card per team with its figures and the team sheet", async () => {
  const view = await teamsView(db, presidentA);
  expect(view.teams.map((t) => [t.name, t.players, t.color])).toEqual([["Équipe A", 2, "blue"], ["Équipe B", 1, "coral"]]);
  expect(view.teams[0].next_event?.title).toBe("Entraînement A");
  expect(view.teams[0].attendance).toBeNull();
  const sheet = await teamDetail(db, presidentA, teamA1);
  expect(sheet.roster.map((r) => r.full_name)).toEqual(["Emma Peeters", "Lucas Peeters"]);
  expect(sheet.others.map((t) => t.name)).toEqual(["Équipe B"]);
  // A coach sees their team's sheet, not the other one.
  expect((await teamsView(db, coachA)).teams.map((t) => t.name)).toEqual(["Équipe B"]);
  await expect(teamDetail(db, coachA, teamA1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(teamsExecute(db, coachA, { action: "settings", id: teamA2, name: "B", category: "", level: "", homeLocation: "", color: "plum", staffContactId: null, archived: false }, clubA)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("moves a player in one transaction: the old assignment closes the day before, the new one opens, with an audit line", async () => {
  await teamsExecute(db, presidentA, { action: "move", profileId: emma, fromTeamId: teamA1, toTeamId: teamA2, effectiveOn: inDays(0), keep: false }, clubA);
  const rows = (await db.query("SELECT t.name,m.starts_on::text AS starts_on,m.ends_on::text AS ends_on,m.cancelled FROM team_membership m JOIN team t ON t.id=m.team_id WHERE m.profile_id=$1 ORDER BY m.starts_on", [emma])).rows;
  expect(rows).toEqual([
    { name: "Équipe A", starts_on: inDays(-30), ends_on: inDays(-1), cancelled: false },
    { name: "Équipe B", starts_on: inDays(0), ends_on: null, cancelled: false },
  ]);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action='team.move' AND target_id=$2", [clubA, emma])).rows[0].n).toBe(1);
  expect((await teamsView(db, presidentA)).teams.map((t) => t.players)).toEqual([1, 2]);
  // Keeping the player in both teams leaves the first assignment open.
  await teamsExecute(db, presidentA, { action: "move", profileId: lucas, fromTeamId: teamA1, toTeamId: teamA2, effectiveOn: inDays(0), keep: true }, clubA);
  expect((await db.query("SELECT count(*)::int AS n FROM team_membership WHERE profile_id=$1 AND ends_on IS NULL AND NOT cancelled", [lucas])).rows[0].n).toBe(2);
  // Same team twice, or a team of another club: refused.
  await expect(teamsExecute(db, presidentA, { action: "move", profileId: emma, fromTeamId: teamA2, toTeamId: teamA2, effectiveOn: inDays(0), keep: false }, clubA)).rejects.toMatchObject({ code: "DUPLICATE" });
  await expect(teamsExecute(db, presidentA, { action: "move", profileId: emma, fromTeamId: teamA2, toTeamId: teamB1, effectiveOn: inDays(0), keep: false }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("sets the colour and the contact of a team, refusing a contact of another club", async () => {
  await teamsExecute(db, presidentA, { action: "settings", id: teamA1, name: "Équipe A", category: "Seniors", level: "D1", homeLocation: "Hall du Parc", color: "plum", staffContactId: lucas, archived: false }, clubA);
  const sheet = await teamDetail(db, presidentA, teamA1);
  expect(sheet.team).toMatchObject({ color: "plum", category: "Seniors", staff_contact_name: "Lucas Peeters" });
  const foreign = (await db.query("SELECT id FROM club_person WHERE organization_id=$1 LIMIT 1", [clubB])).rows[0].id;
  await expect(teamsExecute(db, presidentA, { action: "settings", id: teamA1, name: "Équipe A", category: "", level: "", homeLocation: "", color: "plum", staffContactId: foreign, archived: false }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const { id } = await teamsExecute(db, presidentA, { action: "create", seasonId: seasonA, name: "Équipe C", category: "", level: "", homeLocation: "", color: "sand" }, clubA);
  expect((await teamsView(db, presidentA)).teams.map((t) => t.name)).toContain("Équipe C");
  await expect(teamsExecute(db, presidentA, { action: "create", seasonId: seasonB, name: "Équipe X", category: "", level: "", homeLocation: "", color: null }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await teamsExecute(db, presidentA, { action: "settings", id, name: "Équipe C", category: "", level: "", homeLocation: "", color: "sand", staffContactId: null, archived: true }, clubA);
});

it("books money by team and keeps the whole club apart in the report", async () => {
  const base = { action: "record" as const, occurredOn: inDays(0), direction: "out" as const, category: "equipment" as const, amountCents: 10000, method: "transfer" as const, counterparty: "", reference: "", notes: "" };
  await financeExecute(db, presidentA, { ...base, label: "Ballons équipe A", teamId: teamA1 }, clubA);
  await financeExecute(db, presidentA, { ...base, label: "Assurance club", amountCents: 50000, category: "insurance" }, clubA);
  await expect(financeExecute(db, presidentA, { ...base, label: "Ailleurs", teamId: teamB1 }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await financeExecute(db, presidentA, { action: "budget", season: label, teamId: teamA1, lines: [{ direction: "out", category: "equipment", amountCents: 30000 }] }, clubA);
  await financeExecute(db, presidentA, { action: "budget", season: label, lines: [{ direction: "out", category: "insurance", amountCents: 60000 }] }, clubA);
  const whole = await financeView(db, presidentA);
  expect(whole.entries.map((e) => e.team_name)).toEqual([null, "Équipe A"]);
  expect(whole.budget).toEqual([{ direction: "out", category: "insurance", amount_cents: 60000 }]);
  const team = await financeView(db, presidentA, { team: teamA1 });
  expect(team.entries.map((e) => e.label)).toEqual(["Ballons équipe A"]);
  expect(team.budget).toEqual([{ direction: "out", category: "equipment", amount_cents: 30000 }]);
  const report = await financeReport(db, presidentA, label, { team: teamA1 });
  expect(report.summary.expenses).toBe(10000);
  expect(report.byTeam.map((r) => [r.name, r.expenses])).toEqual([[null, 50000], ["Équipe A", 10000]]);
  // A rate by team, refused for a team of another season or club.
  await duesExecute(db, presidentA, { action: "plan", seasonId: seasonA, category: "Cotisation A", amountCents: 20000, maxInstallments: 2, firstDue: inDays(10), teamId: teamA1 }, clubA);
  await expect(duesExecute(db, presidentA, { action: "plan", seasonId: seasonA, category: "Cotisation X", amountCents: 20000, maxInstallments: 2, firstDue: inDays(10), teamId: teamB1 }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
