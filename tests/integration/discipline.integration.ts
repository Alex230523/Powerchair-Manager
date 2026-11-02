import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { disciplineExecute, disciplineHistory, disciplineView, recordCards, type Card } from "../../src/domains/discipline/service";
import { journeyCommand, journeyExecute } from "../../src/domains/competitions/journey";
import { seasonOf } from "../../src/domains/finance/schema";

/**
 * 34: a series of yellows that suspends, a direct red, a player kept off the
 * sheet then free once his team has played, an appeal accepted that cancels,
 * a fine owed then paid, an old season's rules untouched, another federation
 * out of reach.
 */
const schema = "dis_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
type Who = Principal & { mandateId: string };
let fed: string, fedB: string, clubA: string, clubB: string, team: string, president: Who, presidentB: Who, clubPresident: Who, otherClub: Who, coach: Who, player: string, coachProfile: string;
const season = seasonOf(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date())).label;
const previous = `${Number(season.slice(0, 4)) - 1}-${season.slice(2, 4)}`;
const run = (p: Principal, body: Record<string, unknown>, org: string) => disciplineExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;

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
async function match(daysAgo: number, status = "played") {
  return (
    await db.query(
      `INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,venue,created_by,status,our_score,their_score) VALUES($1,$2,'Lions','league',now()-make_interval(days=>$3),'Hall',$4,$5,$6,$6) RETURNING id`,
      [clubA, team, daysAgo, president.userId, status, status === "played" ? 1 : null],
    )
  ).rows[0].id as string;
}
async function cards(list: Card[]) {
  const c = await db.connect();
  try {
    await c.query(`SET search_path=${schema},public`);
    return await recordCards(c, list);
  } finally {
    c.release();
  }
}
const proposals = async () => (await disciplineView(db, president)) as Extract<Awaited<ReturnType<typeof disciplineView>>, { kind: "federation" }>;
const clubView = async (who: Who) => (await disciplineView(db, who)) as Extract<Awaited<ReturnType<typeof disciplineView>>, { kind: "club" }>;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fedB])).rows[0].id;
  president = await member(fed, "federation_president", "Présidence");
  presidentB = await member(fedB, "federation_president", "Autre présidence");
  clubPresident = await member(clubA, "club_president", "Président A");
  otherClub = await member(clubB, "club_president", "Président B");
  coach = await member(clubA, "coach", "Coach A");
  const s = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, s])).rows[0].id;
  player = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Léa Joueuse','{player}' FROM p RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, player]);
  await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,'L-1','active',$5)", [fed, clubA, player, season, president.userId]);
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Coach A' FROM person WHERE user_id=$2 RETURNING id", [clubA, coach.userId])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, team, coachProfile]);
  // Last season: three yellows suspend; this season: two.
  await run(president, { action: "rules", season: previous, yellowThreshold: 3, yellowMatches: 1, redMatches: 1, kinds: ["league", "cup"], reset: "season", yellowFineCents: 0, redFineCents: 0, appealDays: 7 }, fed);
  await run(president, { action: "rules", season, yellowThreshold: 2, yellowMatches: 1, redMatches: 2, kinds: ["league", "cup", "tournament"], reset: "season", yellowFineCents: 0, redFineCents: 5000, appealDays: 7 }, fed);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps an old season's rules when this season's change", async () => {
  await run(president, { action: "rules", season, yellowThreshold: 2, yellowMatches: 1, redMatches: 2, kinds: ["league", "cup", "tournament"], reset: "season", yellowFineCents: 0, redFineCents: 5000, appealDays: 10 }, fed);
  const rows = (await db.query("SELECT season,version,yellow_threshold,appeal_days FROM discipline_rule WHERE federation_id=$1 ORDER BY season,version", [fed])).rows;
  expect(rows).toEqual([
    { season: previous, version: 1, yellow_threshold: 3, appeal_days: 7 },
    { season, version: 1, yellow_threshold: 2, appeal_days: 7 },
    { season, version: 2, yellow_threshold: 2, appeal_days: 10 },
  ]);
  expect((await proposals()).rule).toMatchObject({ yellowThreshold: 2, appealDays: 10 });
  // A delegate without the competence and a club cannot write them.
  await expect(run(clubPresident, { action: "rules", season, yellowThreshold: 9, yellowMatches: 1, redMatches: 1, kinds: ["league"], reset: "season", yellowFineCents: 0, redFineCents: 0, appealDays: 1 }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("suspends after a series of yellows, counted once per report", async () => {
  const m1 = await match(20),
    m2 = await match(13);
  const one: Card = { organizationId: clubA, profileId: player, kind: "yellow", competition: "league", matchId: m1, playedAt: new Date(Date.now() - 20 * 86400000) };
  expect(await cards([one])).toBe(0);
  // The same report validated again counts nothing more.
  expect(await cards([one])).toBe(0);
  expect((await proposals()).near.map((n) => n.name)).toEqual(["Léa Joueuse"]);
  // A friendly's yellow is not in the competitions concerned.
  expect(await cards([{ ...one, competition: "friendly", matchId: await match(15) }])).toBe(0);
  expect(await cards([{ ...one, matchId: m2, playedAt: new Date(Date.now() - 13 * 86400000) }])).toBe(1);
  const p = (await proposals()).proposed;
  expect(p.map((s) => [s.cause, s.matches, s.name])).toEqual([["yellows", 1, "Léa Joueuse"]]);
});

it("proposes a direct red; once confirmed, keeps the player off the sheet until his team has played", async () => {
  const m3 = await match(6);
  expect(await cards([{ organizationId: clubA, profileId: player, kind: "red", competition: "league", matchId: m3, playedAt: new Date(Date.now() - 6 * 86400000) }])).toBe(1);
  const red = (await proposals()).proposed.find((s) => s.cause === "red")!;
  expect([red.matches, red.fine_cents]).toEqual([2, 5000]);
  await expect(run(president, { action: "decide", id: red.id, decision: "modify", matches: 3 }, fed)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  await run(president, { action: "decide", id: red.id, decision: "confirm" }, fed);
  // The club, the coach and the fine.
  const club = await clubView(clubPresident);
  expect(club.sanctions.find((s) => s.id === red.id)).toMatchObject({ status: "confirmed", remaining: 2 });
  expect(club.fines.map((f) => [f.amount_cents, f.status])).toEqual([[5000, "due"]]);
  expect((await db.query("SELECT title,status FROM task WHERE organization_id=$1 AND source_kind='disciplineFine'", [clubA])).rows).toEqual([{ title: "Payer l'amende : Léa Joueuse", status: "todo" }]);
  expect(Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [coach.userId])).rows[0].n)).toBeGreaterThan(0);
  // On the sheet: refused.
  const next = await match(-3, "scheduled");
  const lineup = () => journeyExecute(db, coach, journeyCommand.parse({ action: "lineup", id: next, players: [{ profileId: player, starter: true, jerseyNumber: 9 }] }), clubA);
  await expect(lineup()).rejects.toMatchObject({ code: "PLAYER_NOT_ELIGIBLE" });
  // His team plays two league matches: the suspension is served.
  await db.query("UPDATE discipline_sanction SET decided_at=now()-interval '5 days' WHERE id=$1", [red.id]);
  await match(4);
  expect((await clubView(clubPresident)).sanctions.find((s) => s.id === red.id)!.remaining).toBe(1);
  await match(2);
  expect((await clubView(clubPresident)).sanctions.find((s) => s.id === red.id)!.remaining).toBe(0);
  await expect(lineup()).resolves.toBeTruthy();
});

it("accepts an appeal, which cancels the sanction", async () => {
  const yellows = (await proposals()).proposed.find((s) => s.cause === "yellows")!;
  await run(president, { action: "decide", id: yellows.id, decision: "modify", matches: 2, fineCents: 1000, reason: "Récidive" }, fed);
  await expect(run(coach, { action: "appeal", sanctionId: yellows.id, reason: "Le carton était pour un autre joueur." }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    run(clubPresident, { action: "appeal", sanctionId: yellows.id, reason: "Pièce jointe", file: { filename: "x.pdf", mediaType: "application/pdf", data: Buffer.from("pas un pdf").toString("base64") } }, clubA),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await run(clubPresident, { action: "appeal", sanctionId: yellows.id, reason: "Le carton était pour un autre joueur.", file: { filename: "video.pdf", mediaType: "application/pdf", data: Buffer.from("%PDF-1.4 x").toString("base64") } }, clubA);
  const appeal = (await proposals()).appeals[0];
  expect(appeal).toMatchObject({ who: "Léa Joueuse", file_name: "video.pdf" });
  await expect(run(president, { action: "decideAppeal", id: appeal.id, accept: false }, fed)).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  await run(president, { action: "decideAppeal", id: appeal.id, accept: true, decision: "Erreur d'identification." }, fed);
  expect((await db.query("SELECT status FROM discipline_sanction WHERE id=$1", [yellows.id])).rows[0].status).toBe("cancelled");
  expect((await db.query("SELECT status FROM discipline_fine WHERE sanction_id=$1", [yellows.id])).rows[0].status).toBe("cancelled");
});

it("lets the club pay its fine, which closes the task", async () => {
  const fine = (await clubView(clubPresident)).fines.find((f) => f.status === "due")!;
  await expect(run(coach, { action: "payFine", id: fine.id, paidOn: "2026-10-20" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(clubPresident, { action: "payFine", id: fine.id, paidOn: "2026-10-20" }, clubA);
  expect((await proposals()).fines.find((f) => f.id === fine.id)).toMatchObject({ status: "paid", paid_on: "2026-10-20" });
  expect((await db.query("SELECT status,auto_closed FROM task WHERE source_key=$1", [`discipline:fine:${fine.id}`])).rows[0]).toEqual({ status: "done", auto_closed: true });
  // 35: the club's expense and the federation's income.
  expect((await db.query("SELECT organization_id,direction,amount_cents FROM finance_transaction WHERE auto_source='fine' AND auto_ref=$1 ORDER BY direction", [fine.id])).rows).toEqual([
    { organization_id: fed, direction: "in", amount_cents: fine.amount_cents },
    { organization_id: clubA, direction: "out", amount_cents: fine.amount_cents },
  ]);
});

it("records a coach's sanction by hand, and shows the history to the club and the federation only", async () => {
  await run(president, { action: "manual", clubId: clubA, profileId: coachProfile, target: "coach", matches: 1, fineCents: 0, summary: "Propos injurieux envers l'arbitre" }, fed);
  await expect(run(president, { action: "manual", clubId: clubA, profileId: null, target: "coach", matches: 1, fineCents: 0, summary: "Sans personne" }, fed)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const history = await disciplineHistory(db, clubPresident, player);
  expect(history.sanctions.map((s) => [s.cause, s.status])).toEqual([
    ["red", "confirmed"],
    ["yellows", "cancelled"],
  ]);
  expect(history.cards).toEqual(expect.arrayContaining([{ season, kind: "yellow", n: 3 }]));
  expect((await disciplineHistory(db, president, player)).sanctions).toHaveLength(2);
  expect((await disciplineHistory(db, otherClub, player)).sanctions).toEqual([]);
});

it("keeps another federation out", async () => {
  const any = (await db.query("SELECT id FROM discipline_sanction WHERE federation_id=$1 LIMIT 1", [fed])).rows[0].id;
  await expect(run(presidentB, { action: "decide", id: any, decision: "cancel", reason: "x" }, fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "manual", clubId: clubA, profileId: null, target: "club", matches: 0, fineCents: 100, summary: "Ingérence" }, fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const v = await disciplineView(db, presidentB);
  expect(v.kind === "federation" && [v.proposed, v.running, v.appeals, v.fines, v.near]).toEqual([[], [], [], [], []]);
  expect((await disciplineHistory(db, presidentB, player)).sanctions).toEqual([]);
  expect((await clubView(otherClub)).sanctions).toEqual([]);
});
