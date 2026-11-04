import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { gameStatistics } from "../../src/domains/statistics/game";
import { matchesView } from "../../src/domains/competitions/service";

/** Wave 16 (S2): the « Jeu » tab, two clubs, a coach limited to his team, only played matches. */
const schema = "w16game_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, guardian: Principal, lions: string, eagles: string, ana: string, ben: string;

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
const person = async (org: string, name: string, user: string | null = null) =>
  (
    await db.query(
      "WITH p AS (INSERT INTO person(user_id) VALUES($3) ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,p.id,$2,'{player}' FROM p RETURNING id",
      [org, name, user],
    )
  ).rows[0].id as string;
async function match(org: string, team: string, days: number, our: number | null, their: number | null, opts: { status?: string; kind?: string; opponent?: string } = {}) {
  return (
    await db.query(
      "INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,$3,$4,now()-($5::int||' days')::interval,$6,$7,$8,$9) RETURNING id",
      [org, team, opts.opponent ?? "Gand", opts.kind ?? "league", days, opts.status ?? "played", our, their, president.userId],
    )
  ).rows[0].id as string;
}
const line = (org: string, m: string, p: string, x: { starter?: boolean; minutes?: number; goals?: number; assists?: number; yellow?: number; red?: boolean }) =>
  db.query("INSERT INTO match_player(match_id,organization_id,profile_id,starter,minutes,goals,assists,yellow_cards,red_card) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    m,
    org,
    p,
    x.starter ?? false,
    x.minutes ?? 0,
    x.goals ?? 0,
    x.assists ?? 0,
    x.yellow ?? 0,
    x.red ?? false,
  ]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  coach = await actor(clubA, "coach");
  guardian = await actor(clubA, "guardian");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-100,CURRENT_DATE+230) RETURNING id", [clubA])).rows[0].id;
  lions = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [clubA, season])).rows[0].id;
  eagles = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Aigles','amber') RETURNING id", [clubA, season])).rows[0].id;
  ana = await person(clubA, "Ana");
  ben = await person(clubA, "Ben");
  // The coach leads the Lions (his own profile is their coach).
  const coachProfile = await person(clubA, "Coach", coach.userId);
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-10)", [clubA, lions, coachProfile]);
  // Lions: won 3-1 (league), drew 2-2 (cup), lost 0-1 (league); Aigles won 4-0 (friendly).
  const m1 = await match(clubA, lions, 30, 3, 1);
  const m2 = await match(clubA, lions, 20, 2, 2, { kind: "cup", opponent: "Liège" });
  const m3 = await match(clubA, lions, 10, 0, 1, { opponent: " Gand " });
  const m4 = await match(clubA, eagles, 5, 4, 0, { kind: "friendly", opponent: "Namur" });
  // Never counted: cancelled, postponed, scheduled.
  const cancelled = await match(clubA, lions, 15, null, null, { status: "cancelled" });
  await match(clubA, lions, 12, null, null, { status: "postponed" });
  await match(clubA, eagles, -3, null, null, { status: "scheduled" });
  await line(clubA, m1, ana, { starter: true, minutes: 40, goals: 2, assists: 1, yellow: 1 });
  await line(clubA, m1, ben, { minutes: 20, goals: 1 });
  await line(clubA, m2, ana, { starter: true, minutes: 40, goals: 1, red: true });
  await line(clubA, m3, ben, { starter: true, minutes: 40, assists: 2 });
  await line(clubA, m4, ben, { starter: true, minutes: 40, goals: 4, yellow: 1 });
  await line(clubA, cancelled, ana, { minutes: 40, goals: 9 });
  // Club B: one match, never seen by club A.
  const seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-100,CURRENT_DATE+230) RETURNING id", [clubB])).rows[0].id;
  const others = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Autres') RETURNING id", [clubB, seasonB])).rows[0].id;
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,our_score,their_score,created_by) VALUES($1,$2,'Bruges','league',now()-interval '3 days','played',9,9,$3)", [
    clubB,
    others,
    presidentB.userId,
  ]);
  await db.query(
    "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,team_id,final_rank,teams_count,created_by) VALUES($1,'Tournoi de Gand','tournament',CURRENT_DATE-40,CURRENT_DATE-39,$2,1,6,$3),($1,'Tournoi annulé','tournament',CURRENT_DATE-40,CURRENT_DATE-39,$2,2,6,$3)",
    [clubA, lions, president.userId],
  );
  await db.query("UPDATE trip SET status='cancelled' WHERE title='Tournoi annulé'");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

type R = { name: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; difference: number; form: string[] };

it("adds up the played matches only: tiles, record per team with the form", async () => {
  const s = (await gameStatistics(db, president, "summary", {})) as { tiles: Record<string, number | null> };
  expect(s.tiles).toEqual({ played: 4, won: 2, winRate: 50, goalsFor: 9, goalsAgainst: 4, difference: 5 });
  const t = (await gameStatistics(db, president, "teams", {})) as { teams: R[]; colors: Record<string, string> };
  expect(t.teams).toEqual([
    { name: "Aigles", played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 4, goalsAgainst: 0, difference: 4, winRate: 100, form: ["W"] },
    { name: "Lions", played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 4, difference: 1, winRate: 33, form: ["W", "D", "L"] },
  ]);
  expect(t.colors).toEqual({ Lions: "blue", Aigles: "amber" });
  const g = (await gameStatistics(db, president, "goals", {})) as { matches: { our: number; their: number; opponent: string }[] };
  expect(g.matches.map((m) => [m.our, m.their])).toEqual([
    [3, 1],
    [2, 2],
    [0, 1],
    [4, 0],
  ]);
});

it("ranks scorers and assisters, adds minutes, starts and cards, never from an unplayed match", async () => {
  const p = (await gameStatistics(db, president, "players", {})) as {
    scorers: { name: string; total: number; average: number; matches: number }[];
    assisters: { name: string; total: number }[];
    minutes: { name: string; minutes: number; starts: number; matches: number }[];
    discipline: { players: { name: string; yellow: number; red: number }[]; teams: { name: string; yellow: number; red: number }[] };
  };
  expect(p.scorers.map((x) => [x.name, x.total, x.matches, x.average])).toEqual([
    ["Ben", 5, 3, 1.67],
    ["Ana", 3, 2, 1.5],
  ]);
  expect(p.assisters.map((x) => [x.name, x.total])).toEqual([
    ["Ben", 2],
    ["Ana", 1],
  ]);
  expect(p.minutes.map((x) => [x.name, x.minutes, x.starts, x.matches])).toEqual([
    ["Ben", 100, 2, 3],
    ["Ana", 80, 2, 2],
  ]);
  expect(p.discipline.players).toEqual([expect.objectContaining({ name: "Ana", yellow: 1, red: 1 }), expect.objectContaining({ name: "Ben", yellow: 1, red: 0 })]);
  expect(p.discipline.teams).toEqual([
    { name: "Aigles", yellow: 1, red: 0 },
    { name: "Lions", yellow: 1, red: 1 },
  ]);
});

it("splits by competition and by opponent, lists the tournament places", async () => {
  const c = (await gameStatistics(db, president, "competitions", {})) as { kinds: R[] };
  expect(c.kinds.map((k) => [k.name, k.played, k.won, k.drawn, k.lost])).toEqual([
    ["league", 2, 1, 0, 1],
    ["cup", 1, 0, 1, 0],
    ["tournament", 0, 0, 0, 0],
    ["friendly", 1, 1, 0, 0],
  ]);
  const o = (await gameStatistics(db, president, "opponents", {})) as { opponents: R[] };
  // « Gand » and « Gand » with spaces are one opponent.
  expect(o.opponents.map((x) => [x.name, x.played, x.won, x.lost, x.goalsFor, x.goalsAgainst])).toEqual([
    ["Gand", 2, 1, 1, 3, 2],
    ["Liège", 1, 0, 0, 2, 2],
    ["Namur", 1, 1, 0, 4, 0],
  ]);
  const t = (await gameStatistics(db, president, "tournaments", {})) as { tournaments: { title: string; final_rank: number; season: string; awarded: boolean }[] };
  expect(t.tournaments).toEqual([expect.objectContaining({ title: "Tournoi de Gand", final_rank: 1, season: "2026-27", awarded: false })]);
});

it("keeps each club to itself, a coach to his teams, a parent out", async () => {
  expect(JSON.stringify(await gameStatistics(db, president, "goals", {}))).not.toContain("Bruges");
  expect(((await gameStatistics(db, presidentB, "summary", {})) as { tiles: { played: number } }).tiles.played).toBe(1);
  const c = (await gameStatistics(db, coach, "teams", {})) as { teams: R[] };
  expect(c.teams.map((x) => x.name)).toEqual(["Lions"]);
  const p = (await gameStatistics(db, coach, "players", {})) as { scorers: { name: string; total: number }[] };
  expect(p.scorers.map((x) => [x.name, x.total])).toEqual([
    ["Ana", 3],
    ["Ben", 1],
  ]);
  // The coach may look at another team through the address: it falls back to his own.
  expect(((await gameStatistics(db, coach, "summary", { team: eagles })) as { tiles: { played: number } }).tiles.played).toBe(3);
  await expect(gameStatistics(db, guardian, "summary", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(gameStatistics(db, president, "nope", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("5: keeps a score not confirmed out of the figures, and gives each team its card (a coach his teams only)", async () => {
  const before = ((await gameStatistics(db, president, "summary", {})) as { tiles: Record<string, number | null> }).tiles;
  const proposed = await match(clubA, lions, 2, 9, 0, { opponent: "Mons" });
  await db.query("UPDATE match SET score_status='proposed' WHERE id=$1", [proposed]);
  expect(((await gameStatistics(db, president, "summary", {})) as { tiles: Record<string, number | null> }).tiles).toEqual(before);
  const v = await matchesView(db, president);
  const card = v.teams.find((t) => t.id === lions)!;
  expect(card).toMatchObject({ color: "blue", form: ["win", "draw", "loss"] });
  expect(card.record.played).toBe(3);
  expect(v.teams.find((t) => t.id === eagles)!.next).toMatchObject({ opponent: "Gand" });
  expect(v.matches.find((m) => m.id === proposed)).toMatchObject({ score_status: "proposed", team_color: "blue" });
  // The coach of the Lions sees the Lions only.
  const c = await matchesView(db, coach);
  expect([...new Set(c.matches.map((m) => m.team_id))]).toEqual([lions]);
  expect(c.teams.map((t) => t.id)).toEqual([lions]);
});
