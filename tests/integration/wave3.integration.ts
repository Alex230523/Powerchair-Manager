import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  matchesView,
  matchDetail,
  matchExecute,
  designationsView,
  designationExecute,
  refereeView,
  refereeExecute,
} from "../../src/domains/competitions/service";
import { playerProfileView } from "../../src/domains/player-profile/service";

const schema = "wave3_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  federation: string,
  season: string,
  team: string,
  otherTeam: string,
  president: Principal,
  coach: Principal,
  fedPresident: Principal,
  referee: Principal,
  playerA: string,
  playerB: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, "Test " + role, userId + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [org, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
      [org, userId, role, grants],
    )
  ).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function member(name: string, birth: string | null, roles = "{player}") {
  const person = (
    await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")
  ).rows[0].id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [club, person, name, birth, roles],
    )
  ).rows[0].id as string;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );
const ago = (days: number) => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('BPCF test','federation') RETURNING id",
    )
  ).rows[0].id;
  club = (
    await db.query(
      "INSERT INTO organization(name,kind,federation_id) VALUES('Club vague 3','club',$1) RETURNING id",
      [federation],
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison test',CURRENT_DATE-120,CURRENT_DATE+240) RETURNING id",
      [club],
    )
  ).rows[0].id;
  [team, otherTeam] = await Promise.all(
    ["Équipe A", "Équipe B"].map(
      async (name) =>
        (
          await db.query(
            "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,$3) RETURNING id",
            [club, season, name],
          )
        ).rows[0].id as string,
    ),
  );
  president = await actor(club, "club_president");
  coach = await actor(club, "coach");
  await db.query("UPDATE role_assignment SET team_id=$2 WHERE user_id=$1", [
    coach.userId,
    team,
  ]);
  const coachPerson = (
    await db.query("SELECT id FROM person WHERE user_id=$1", [coach.userId])
  ).rows[0].id;
  const coachProfile = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach A','{coach}') RETURNING id",
      [club, coachPerson],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)",
    [club, team, coachProfile],
  );
  fedPresident = await actor(federation, "federation_president");
  referee = await actor(federation, "referee");
  playerA = await member("Joueur A", "2005-01-01");
  playerB = await member("Joueur B", "2006-01-01");
  for (const p of [playerA, playerB])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)",
      [club, team, p],
    );
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

const fixture = (extra: Record<string, unknown> = {}) => ({
  action: "create" as const,
  teamId: team,
  opponent: "Adversaire Test",
  home: true,
  kind: "league" as const,
  competition: "Championnat test",
  startsAt: ago(7) + "T14:00",
  venue: "",
  calendarEventId: null,
  notes: "",
  ...extra,
});

it("records a line-up and a result, and shows the statistics on the player profile", async () => {
  const { id } = await matchExecute(db, coach, fixture(), club);
  await matchExecute(
    db,
    coach,
    {
      action: "lineup",
      id,
      players: [
        {
          profileId: playerA,
          starter: true,
          position: "Attaquant",
          jerseyNumber: 9,
        },
        {
          profileId: playerB,
          starter: false,
          position: "",
          jerseyNumber: null,
        },
      ],
    },
    club,
  );
  await expect(
    matchExecute(
      db,
      coach,
      {
        action: "result",
        id,
        version: 1,
        ourScore: 1,
        theirScore: 0,
        stats: [
          {
            profileId: playerA,
            minutes: 40,
            goals: 2,
            assists: 0,
            yellowCards: 0,
            redCard: false,
          },
        ],
      },
      club,
    ),
  ).rejects.toMatchObject({ code: "GOALS_EXCEED_SCORE" });
  await matchExecute(
    db,
    coach,
    {
      action: "result",
      id,
      version: 1,
      ourScore: 2,
      theirScore: 1,
      stats: [
        {
          profileId: playerA,
          minutes: 40,
          goals: 2,
          assists: 0,
          yellowCards: 1,
          redCard: false,
        },
        {
          profileId: playerB,
          minutes: 10,
          goals: 0,
          assists: 1,
          yellowCards: 0,
          redCard: false,
        },
      ],
    },
    club,
  );
  const view = await matchesView(db, president);
  expect(view.teams.find((t) => t.id === team)?.record).toMatchObject({
    played: 1,
    won: 1,
    points: 3,
  });
  expect((await matchDetail(db, president, id)).lineup).toHaveLength(2);
  const profile = await playerProfileView(db, president, playerA);
  expect(profile.matches.totals).toMatchObject({
    matches: 1,
    starts: 1,
    minutes: 40,
    goals: 2,
    yellow: 1,
  });
  // A coach cannot schedule matches for another team.
  await expect(
    matchExecute(db, coach, fixture({ teamId: otherTeam }), club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("lets the federation designate a referee who accepts and reports the official score", async () => {
  const official = await matchExecute(
    db,
    president,
    fixture({ opponent: "Officiel", home: false }),
    club,
  );
  await matchExecute(
    db,
    president,
    fixture({ opponent: "Amical", kind: "friendly" }),
    club,
  );
  const designations = await designationsView(db, fedPresident);
  expect(designations.matches.map((m) => m.opponent)).toContain("Officiel");
  expect(designations.matches.map((m) => m.opponent)).not.toContain("Amical");
  await designationExecute(
    db,
    fedPresident,
    {
      action: "assign",
      matchId: official.id,
      refereeId: referee.userId,
      role: "main",
    },
    federation,
  );
  await expect(
    refereeExecute(
      db,
      referee,
      {
        action: "report",
        matchId: official.id,
        homeScore: 1,
        awayScore: 0,
        incidents: "",
      },
      federation,
    ),
  ).rejects.toMatchObject({ code: "NOT_ACCEPTED" });
  await refereeExecute(
    db,
    referee,
    { action: "answer", matchId: official.id, accept: true },
    federation,
  );
  await refereeExecute(
    db,
    referee,
    {
      action: "report",
      matchId: official.id,
      homeScore: 4,
      awayScore: 2,
      incidents: "RAS",
    },
    federation,
  );
  // Away match: the club reads 2-4.
  const club3 = (await matchesView(db, president)).matches.find(
    (m) => m.id === official.id,
  )!;
  expect([club3.status, club3.our_score, club3.their_score]).toEqual([
    "played",
    2,
    4,
  ]);
  const mine = await refereeView(db, referee);
  expect(mine.assignments[0]).toMatchObject({ status: "accepted" });
  await expect(designationsView(db, referee)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    refereeExecute(
      db,
      referee,
      {
        action: "availability",
        days: [{ day: ago(1), available: true, note: "" }],
      },
      federation,
    ),
  ).rejects.toMatchObject({ code: "INVALID_DATE" });
  const notified = await db.query(
    "SELECT count(*)::int AS n FROM app_notification WHERE recipient_user_id=$1",
    [referee.userId],
  );
  expect(notified.rows[0].n).toBeGreaterThan(0);
});
