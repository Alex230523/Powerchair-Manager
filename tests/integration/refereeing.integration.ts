import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { designationEvents, expensesCsv, refereeingExecute, refereeingTick, refereeingView } from "../../src/domains/referees/service";
import { warnings } from "../../src/domains/referees/schema";

/**
 * 25 and 36 to 39: the tournament referees taken over; a day off and a
 * club conflict flagged; only the accepted designation in the feed; a
 * single reminder; a report contested then confirmed (the stats follow); a
 * claim approved then paid; a training validated; another federation's
 * referee out of reach.
 */
const schema = "ref_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
type Who = Principal & { mandateId: string };
let fed: string, fedB: string, clubA: string, clubB: string, team: string, president: Who, presidentB: Who, r1: Who, r2: Who, coach: Who;
let future: string, played: string, tmatch: string, dayId: string, player: string, day: string;
const run = (p: Principal, body: Record<string, unknown>, org: string) => refereeingExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;

async function member(org: string, role: string, name: string): Promise<Who> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id as string;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  return { userId, sessionId, mandateId };
}
const migrations = async () => {
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
};

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await migrations();
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  president = await member(fed, "federation_president", "Présidence");
  presidentB = await member(fedB, "federation_president", "Autre présidence");
  r1 = await member(fed, "referee", "Arbitre Un");
  r2 = await member(fed, "referee", "Arbitre Deux");
  // Arbitre Deux is also a coach of Club A.
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, r2.userId]);
  await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'coach')", [clubA, r2.userId]);
  coach = await member(clubA, "coach", "Coach A");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Coach A' FROM person WHERE user_id=$2 RETURNING id", [clubA, coach.userId])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, team, coachProfile]);
  player = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Joueur Buteur' FROM p RETURNING id", [clubA])).rows[0].id;
  future = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,venue,created_by) VALUES($1,$2,'Lions','league',now()+interval '3 days','Hall de Namur',$3) RETURNING id", [clubA, team, president.userId])).rows[0].id;
  day = (await db.query("SELECT ((now()+interval '3 days') AT TIME ZONE 'Europe/Brussels')::date::text AS d")).rows[0].d;
  played = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,venue,created_by) VALUES($1,$2,'Tigres','league',now()-interval '2 hours','Hall de Gand',$3) RETURNING id", [clubA, team, president.userId])).rows[0].id;
  await db.query("INSERT INTO match_player(match_id,organization_id,profile_id,starter) VALUES($1,$2,$3,true)", [played, clubA, player]);
  // A tournament of the federation, its match with the old single « arbitre » field.
  const t = (await db.query("INSERT INTO tournament(organization_id,name,year,format,created_by) VALUES($1,'Coupe',2026,'league',$2) RETURNING id", [fed, president.userId])).rows[0].id;
  for (const o of [clubA, clubB]) await db.query("INSERT INTO tournament_club(tournament_id,organization_id,status) VALUES($1,$2,'accepted')", [t, o]);
  dayId = (await db.query("INSERT INTO tournament_day(tournament_id,day,venue) VALUES($1,CURRENT_DATE+10,'Salle de Liège') RETURNING id", [t])).rows[0].id;
  tmatch = (await db.query("INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,home_organization_id,away_organization_id,referee_user_id) VALUES($1,$2,'14:00','league',$3,$4,$5) RETURNING id", [t, dayId, clubA, clubB, r1.userId])).rows[0].id;
  // The refereeing migration again: it takes the referee over, and changes nothing the second time.
  const sql = await readFile("db/migrations/0095_refereeing.sql", "utf8");
  await db.query(sql);
  await db.query(sql);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("takes the tournaments' referees over as accepted designations", async () => {
  const rows = (await db.query("SELECT referee_id,status,role FROM tournament_referee_assignment WHERE tournament_match_id=$1", [tmatch])).rows;
  expect(rows).toEqual([{ referee_id: r1.userId, status: "accepted", role: "main" }]);
});

it("flags a day off and a club conflict, and keeps the feed to accepted designations", async () => {
  await run(r1, { action: "answer", target: { kind: "tournament", id: tmatch }, accept: true }, fed);
  await db.query("INSERT INTO referee_availability(federation_id,user_id,day,available) VALUES($1,$2,$3,false)", [fed, r1.userId, day]);
  const v = await refereeingView(db, president);
  const m = v.matches.find((x) => x.id === future)!;
  const one = v.referees.find((r) => r.id === r1.userId)!;
  const two = v.referees.find((r) => r.id === r2.userId)!;
  expect(warnings({ day: m.day, startsAt: new Date(m.starts_at).toISOString(), clubs: m.clubs }, one)).toEqual(["unavailable"]);
  expect(warnings({ day: m.day, startsAt: new Date(m.starts_at).toISOString(), clubs: m.clubs }, two)).toEqual(["club"]);
  await run(president, { action: "designate", target: { kind: "match", id: future }, refereeId: r2.userId, role: "main" }, fed);
  const c = await db.connect();
  try {
    await c.query(`SET search_path=${schema},public`);
    expect((await designationEvents(c, fed, r2.userId)).map((e) => e.id)).toEqual([]);
    expect((await designationEvents(c, fed, r1.userId)).map((e) => e.id)).toEqual([`designation-tournament-${tmatch}`]);
  } finally {
    c.release();
  }
  // Another federation can neither see these matches nor designate its own referee there.
  await expect(run(presidentB, { action: "designate", target: { kind: "match", id: future }, refereeId: r1.userId, role: "main" }, fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await refereeingView(db, presidentB)).matches).toEqual([]);
});

it("reminds an unanswered proposal once", async () => {
  await db.query("UPDATE referee_assignment SET assigned_at=now()-interval '4 days' WHERE match_id=$1", [future]);
  const before = Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [r2.userId])).rows[0].n);
  await refereeingTick(db);
  await refereeingTick(db);
  expect(Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [r2.userId])).rows[0].n)).toBe(before + 1);
});

it("takes a report contested, then confirmed: the stats follow", async () => {
  await run(president, { action: "designate", target: { kind: "match", id: played }, refereeId: r1.userId, role: "main" }, fed);
  await run(r1, { action: "answer", target: { kind: "match", id: played }, accept: true }, fed);
  expect((await refereeingView(db, r1)).mine!.toReport[0].lineup).toEqual([{ id: player, name: "Joueur Buteur", number: null }]);
  await run(
    r1,
    { action: "report", matchId: played, homeScore: 2, awayScore: 1, events: [{ kind: "goal", side: "home", player: "Joueur Buteur", profileId: player, minute: 12 }, { kind: "red", side: "home", player: "", profileId: player, minute: 40 }, { kind: "yellow", side: "away", player: "N° 7", minute: 30 }], reserves: "" },
    fed,
  );
  await run(coach, { action: "review", matchId: played, decision: "contested", comment: "Le but est à notre numéro 9." }, clubA);
  expect((await db.query("SELECT validated_at FROM match_report WHERE match_id=$1", [played])).rows[0].validated_at).toBeNull();
  await run(coach, { action: "review", matchId: played, decision: "confirmed" }, clubA);
  expect((await db.query("SELECT goals,red_card FROM match_player WHERE match_id=$1 AND profile_id=$2", [played, player])).rows[0]).toEqual({ goals: 1, red_card: true });
  // Validated, it no longer changes: the goal would count twice.
  await expect(run(r1, { action: "report", matchId: played, homeScore: 3, awayScore: 1, events: [] }, fed)).rejects.toMatchObject({ code: "REPORT_VALIDATED" });
  expect((await db.query("SELECT goals FROM match_player WHERE match_id=$1 AND profile_id=$2", [played, player])).rows[0].goals).toBe(1);
  // Another coach's club cannot review it.
  const other = await member(clubB, "club_president", "Président B");
  await expect(run(other, { action: "review", matchId: played, decision: "confirmed" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("approves a claim, then pays it; validates a training", async () => {
  await run(president, { action: "settings", levels: ["Débutant", "Régional", "National"], flatCents: 1000, kmRateCents: 30 }, fed);
  const id = (await run(r1, { action: "expense", target: { kind: "match", id: played }, km: 20, extraCents: 500, note: "Parking" }, fed)).id as string;
  expect((await db.query("SELECT amount_cents FROM referee_expense WHERE id=$1", [id])).rows[0].amount_cents).toBe(2100);
  await expect(run(r1, { action: "expense", target: { kind: "match", id: future }, km: 5, extraCents: 0 }, fed)).rejects.toBeTruthy();
  await expect(run(president, { action: "decideExpense", id, approve: false, reason: "" }, fed)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  await run(president, { action: "decideExpense", id, approve: true }, fed);
  expect(await expensesCsv(db, president)).toContain("Arbitre Un;20;21.00;Parking");
  await run(president, { action: "paid", ids: [id] }, fed);
  expect((await db.query("SELECT status FROM referee_expense WHERE id=$1", [id])).rows[0].status).toBe("paid");
  // 35: an expense in the federation's books, written once.
  await run(president, { action: "paid", ids: [id] }, fed);
  expect((await db.query("SELECT organization_id,direction,amount_cents,label FROM finance_transaction WHERE auto_source='refereeExpense' AND auto_ref=$1", [id])).rows).toEqual([
    { organization_id: fed, direction: "out", amount_cents: 2100, label: "Note de frais d'arbitrage · Arbitre Un" },
  ]);
  const training = (await run(r1, { action: "training", title: "Formation d'arbitre régional", doneOn: "2026-10-01", proof: null }, fed)).id as string;
  await expect(run(r1, { action: "decideTraining", id: training, approve: true }, fed)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(president, { action: "decideTraining", id: training, approve: true }, fed);
  await run(president, { action: "level", userId: r1.userId, level: 1 }, fed);
  const mine = (await refereeingView(db, r1)).mine!;
  expect(mine.levelName).toBe("Régional");
  expect(mine.trainings[0].status).toBe("approved");
  expect(mine.expenses[0].status).toBe("paid");
});

it("keeps the tournament's « arbitre » field and the designations in step", async () => {
  // Arbitre Un declines: the field empties; he accepts again: it comes back.
  await run(r1, { action: "answer", target: { kind: "tournament", id: tmatch }, accept: false }, fed);
  expect((await db.query("SELECT referee_user_id FROM tournament_match WHERE id=$1", [tmatch])).rows[0].referee_user_id).toBeNull();
  await run(r1, { action: "answer", target: { kind: "tournament", id: tmatch }, accept: true }, fed);
  expect((await db.query("SELECT referee_user_id FROM tournament_match WHERE id=$1", [tmatch])).rows[0].referee_user_id).toBe(r1.userId);
  // The organiser picks Arbitre Deux in the tournament editor: he becomes the main referee, Arbitre Un is withdrawn.
  const c = await db.connect();
  try {
    await c.query(`SET search_path=${schema},public`);
    const { designateFromTournament } = await import("../../src/domains/referees/mirror");
    await designateFromTournament(c, tmatch, r2.userId, president.userId);
  } finally {
    c.release();
  }
  expect((await db.query("SELECT referee_id,status FROM tournament_referee_assignment WHERE tournament_match_id=$1 ORDER BY status", [tmatch])).rows).toEqual([
    { referee_id: r2.userId, status: "accepted" },
    { referee_id: r1.userId, status: "withdrawn" },
  ]);
  expect(dayId).toBeTruthy();
});
