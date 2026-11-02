import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { friendlyMatchExecute, matchExecute, matchesView } from "../../src/domains/competitions/service";

/**
 * Wave 17 (C5): a friendly between two clubs (invitation, acceptance, both
 * sides, score proposed then confirmed), automatic acceptance within one
 * club, the full line (answers, transport at home), transport tasks from the
 * template, the federal tournament matches, and clubs kept apart.
 */
const schema = "w17mat_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string, clubC: string;
let presidentA: Principal, presidentB: Principal, presidentC: Principal;
let aigles: string, lions: string, ours: string, loups: string, homeHall: string;
const future = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10) + "T14:00";
};

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function team(org: string, name: string) {
  const season =
    (await db.query("SELECT id FROM season WHERE organization_id=$1", [org])).rows[0]?.id ??
    (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [org])).rows[0].id;
  return (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,$3) RETURNING id", [org, season, name])).rows[0].id as string;
}
async function member(org: string, teamId: string, name: string, role = "player") {
  const id = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$2,'2008-01-01' FROM p RETURNING id", [org, name])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-30)", [org, teamId, id, role]);
  return id as string;
}
const friendly = (p: Principal, org: string, fields: Record<string, unknown>) =>
  friendlyMatchExecute(db, p, { action: "friendly", opponentTeamId: null, opponentName: "", home: true, startsAt: future(10), placeId: null, venue: "", message: "", ...fields } as never, org);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [federation])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind) VALUES('Club C','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  presidentC = await actor(clubC, "club_president");
  aigles = await team(clubA, "Aigles");
  lions = await team(clubA, "Lions");
  ours = await team(clubB, "Ours");
  loups = await team(clubC, "Loups");
  await member(clubA, aigles, "Ana");
  await member(clubA, aigles, "Bilal");
  await member(clubA, aigles, "Coach Aigles", "coach");
  await member(clubB, ours, "Coach Ours", "coach");
  await member(clubB, ours, "Dina");
  homeHall = (await db.query("INSERT INTO calendar_place(organization_id,name,address,home) VALUES($1,'Salle du club','Rue 1',true) RETURNING id", [clubA])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

let mineA: string, mineB: string;
it("invites a team of another club of the federation, which accepts: both clubs have the match and the event", async () => {
  // Club C, outside the federation, cannot see nor invite club B's teams.
  expect((await matchesView(db, presidentC)).opponents.map((o) => o.name)).toEqual(["Loups"]);
  await expect(friendly(presidentC, clubC, { teamId: loups, opponentTeamId: ours })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const opponents = (await matchesView(db, presidentA)).opponents.map((o) => `${o.club} · ${o.name}`);
  expect(opponents).toEqual(expect.arrayContaining(["Club A · Lions", "Club B · Ours"]));
  expect(opponents).not.toContain("Club C · Loups");

  mineA = ((await friendly(presidentA, clubA, { teamId: aigles, opponentTeamId: ours, placeId: homeHall, message: "Match de préparation" })) as { id: string }).id;
  const viewA = await matchesView(db, presidentA);
  const m = viewA.matches.find((x) => x.id === mineA)!;
  expect(m).toMatchObject({ opponent: "Club B · Ours", kind: "friendly", invitation: { status: "sent" } });
  // The full line: invited players and coaches, transport at home.
  expect(m.line).toMatchObject({ players: { coming: 0, invited: 2, waiting: ["Ana", "Bilal"] }, coaches: { coming: 0, invited: 1 }, transport: "home" });
  // Club B sees the invitation, not the match yet; club C sees nothing.
  const viewB = await matchesView(db, presidentB);
  expect(viewB.invitations).toHaveLength(1);
  expect(viewB.invitations[0]).toMatchObject({ club: "Club A", team: "Aigles", invited_team: "Ours", message: "Match de préparation" });
  expect(viewB.matches).toEqual([]);
  expect((await matchesView(db, presidentC)).invitations).toEqual([]);
  await expect(friendlyMatchExecute(db, presidentC, { action: "answerInvitation", id: viewB.invitations[0].id, accept: true, answer: "" }, clubC)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='match_update' AND recipient_user_id=$1", [presidentB.userId])).rows[0].n).toBe(1);

  await friendlyMatchExecute(db, presidentB, { action: "answerInvitation", id: viewB.invitations[0].id, accept: true, answer: "Avec plaisir" }, clubB);
  const after = await matchesView(db, presidentB);
  const theirs = after.matches[0];
  mineB = theirs.id;
  expect(theirs).toMatchObject({ opponent: "Club A · Aigles", home: false, linked_match_id: mineA });
  expect((await db.query("SELECT kind,team_id FROM calendar_event WHERE id=$1 AND organization_id=$2", [theirs.calendar_event_id, clubB])).rows[0]).toEqual({ kind: "friendly", team_id: ours });
  expect((await matchesView(db, presidentA)).matches.find((x) => x.id === mineA)).toMatchObject({ linked_match_id: mineB, invitation: { status: "accepted", answer: "Avec plaisir" } });
});

it("organises the transport from the Transport template, for the team's coach", async () => {
  const before = (await matchesView(db, presidentB)).matches.find((x) => x.id === mineB)!;
  expect(before.line).toMatchObject({ transport: "todo", transportTasks: 0 });
  const out = (await friendlyMatchExecute(db, presidentB, { action: "organizeTransport", id: mineB }, clubB)) as { tasks: number };
  expect(out.tasks).toBe(5);
  const tasks = (
    await db.query("SELECT t.title,t.due_on::text AS due,cp.full_name FROM task t JOIN club_person cp ON cp.id=t.responsible_id WHERE t.match_id=$1 AND t.kind='transport' ORDER BY t.due_on,t.title", [mineB])
  ).rows;
  expect(tasks.map((t) => t.full_name)).toEqual(Array(5).fill("Coach Ours"));
  expect(tasks[0].title).toBe("Réserver la camionnette");
  expect(tasks.every((t) => t.due < future(10).slice(0, 10))).toBe(true);
  // Club A cannot organise club B's match.
  await expect(friendlyMatchExecute(db, presidentA, { action: "organizeTransport", id: mineB }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("proposes the score from one club and has the other confirm it", async () => {
  await db.query("UPDATE match SET starts_at=now()-interval '2 hours' WHERE id=ANY($1::uuid[])", [[mineA, mineB]]);
  const version = (await db.query("SELECT version FROM match WHERE id=$1", [mineA])).rows[0].version;
  await matchExecute(db, presidentA, { action: "result", id: mineA, version, ourScore: 3, theirScore: 1, stats: [] }, clubA);
  const b = (await matchesView(db, presidentB)).matches.find((x) => x.id === mineB)!;
  expect(b).toMatchObject({ status: "played", our_score: 1, their_score: 3, score_status: "proposed", score_ours: false });
  expect((await matchesView(db, presidentA)).matches.find((x) => x.id === mineA)).toMatchObject({ score_status: "proposed", score_ours: true });
  // The club that proposed cannot confirm its own score.
  await expect(friendlyMatchExecute(db, presidentA, { action: "confirmScore", id: mineA }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await friendlyMatchExecute(db, presidentB, { action: "confirmScore", id: mineB }, clubB);
  expect((await db.query("SELECT score_status FROM match WHERE id=ANY($1::uuid[])", [[mineA, mineB]])).rows.map((r) => r.score_status)).toEqual(["confirmed", "confirmed"]);
});

it("accepts at once between two teams of the same club", async () => {
  const id = ((await friendly(presidentA, clubA, { teamId: aigles, opponentTeamId: lions })) as { id: string }).id;
  const pair = (await db.query("SELECT team_id,opponent,linked_match_id FROM match WHERE id=$1 OR linked_match_id=$1 ORDER BY (id=$1) DESC", [id])).rows;
  expect(pair).toHaveLength(2);
  expect(pair.map((r) => r.opponent)).toEqual(["Lions", "Aigles"]);
  expect((await db.query("SELECT status FROM match_invitation WHERE match_id=$1", [id])).rows[0].status).toBe("accepted");
});

it("lists the federal tournament matches of the club by day", async () => {
  const t = (await db.query("INSERT INTO tournament(organization_id,name,year,format) VALUES($1,'Coupe BPCF',2026,'league') RETURNING id", [federation])).rows[0].id;
  for (const org of [clubA, clubB]) await db.query("INSERT INTO tournament_club(tournament_id,organization_id,status) VALUES($1,$2,'accepted')", [t, org]);
  const d1 = (await db.query("INSERT INTO tournament_day(tournament_id,label,day,venue) VALUES($1,'Journée 1',CURRENT_DATE+20,'Namur') RETURNING id", [t])).rows[0].id;
  const d2 = (await db.query("INSERT INTO tournament_day(tournament_id,label,day,venue) VALUES($1,'Journée 2',CURRENT_DATE+40,'Gand') RETURNING id", [t])).rows[0].id;
  for (const [day, kickoff] of [[d2, "10:00"], [d1, "14:00"], [d1, "10:00"]])
    await db.query("INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,home_organization_id,away_organization_id) VALUES($1,$2,$3,'league',$4,$5)", [t, day, kickoff, clubA, clubB]);
  const groups = (await matchesView(db, presidentA)).tournament;
  expect(groups.map((g) => [g.label, g.matches.map((m) => m.kickoff)])).toEqual([
    ["Journée 1", ["10:00", "14:00"]],
    ["Journée 2", ["10:00"]],
  ]);
  expect((await matchesView(db, presidentC)).tournament).toEqual([]);
});
