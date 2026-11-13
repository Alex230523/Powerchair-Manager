import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { answerCommand, answerExecute, nationalCare, nationalCommand, nationalCount, nationalExecute, nationalEventsFor, nationalView, playerNational } from "../../src/domains/national/service";
import { seal } from "../../src/domains/notifications/crypto";
import { seasonOf } from "../../src/domains/finance/schema";
import { brusselsToday } from "../../src/domains/people/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * 6: national teams. Only the federation creates one; a player of another
 * federation cannot be found; the club and the parents are told; an
 * unavailability is kept; no health data without consent, then only during
 * its period; an international tournament with a foreign team in free text;
 * the player's sheet updated; the club sees the gathering, read only.
 */
const schema = "nat_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, fed2: string, club: string, other: string, federation: Principal, president: Principal, parent: Principal, physio: Principal, presidentOther: Principal;
let lea: string, tom: string, far: string, team: string, season: string;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(org: string, name: string, birth: string, classification: string, licensed = true) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,'{player}') RETURNING id", [org, person, name, birth])).rows[0].id as string;
  await db.query("INSERT INTO player_sport_profile(profile_id,organization_id,classification) VALUES($1,$2,$3)", [id, org, classification]);
  const f = (await db.query("SELECT federation_id FROM organization WHERE id=$1", [org])).rows[0].federation_id;
  if (licensed) await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,$5,'active',$6)", [f, org, id, season, "L-" + name, federation.userId]);
  return id;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = fed) => nationalExecute(db, p, nationalCommand.parse(cmd), org) as Promise<Record<string, unknown>>;
const answer = (p: Principal, cmd: Record<string, unknown>) => answerExecute(db, p, answerCommand.parse(cmd)) as Promise<Record<string, unknown>>;
const day = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  season = seasonOf(brusselsToday()).label;
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé belge','federation') RETURNING id")).rows[0].id;
  fed2 = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé voisine','federation') RETURNING id")).rows[0].id;
  club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  other = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club voisin','club',$1) RETURNING id", [fed2])).rows[0].id;
  federation = (await actor(fed, "federation_president", "Présidente fédérale")).p;
  president = (await actor(club, "club_president", "Président A")).p;
  presidentOther = (await actor(other, "club_president", "Président voisin")).p;
  lea = await player(club, "Léa Martin", "2010-03-01", "PF1");
  tom = await player(club, "Tom Peeters", "2001-05-01", "PF2");
  far = await player(other, "Ana Voisine", "2002-01-01", "PF1");
  const pa = await actor(club, "guardian", "Sophie Martin");
  parent = pa.p;
  const gp = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Sophie Martin') RETURNING id", [club, pa.person])).rows[0].id;
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié',$4)", [
    club,
    gp,
    lea,
    president.userId,
  ]);
  physio = (await actor(fed, "federation_worker", "Kiné national")).p;
  const careId = randomUUID();
  await db.query("INSERT INTO care_instruction(id,organization_id,profile_id,moment,ciphertext,created_by) VALUES($1,$2,$3,'before_play',$4,$5)", [
    careId,
    club,
    lea,
    seal({ title: "Sangle thoracique", details: "Vérifier avant chaque match" }, "care:" + careId),
    president.userId,
  ]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets only the federation create a national team, with its staff", async () => {
  await expect(nationalExecute(db, president, nationalCommand.parse({ action: "team", name: "Belgique U18", category: "u18", season }), club)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
  team = String((await run(federation, { action: "team", name: "Belgique U18", category: "u18", season, maxPf2: 1 })).id);
  await run(federation, { action: "staffAdd", teamId: team, role: "physio", userId: physio.userId });
  const v = await nationalView(db, federation);
  expect(v.teams[0]).toMatchObject({ name: "Belgique U18", category: "u18", max_pf2: 1 });
  expect(v.teams[0].staff.map((x: { name: string; role: string }) => [x.name, x.role])).toEqual([["Kiné national", "physio"]]);
});

it("finds the licensed players of its own clubs only, and tells the club and the parents", async () => {
  const v = await nationalView(db, federation);
  expect(v.candidates.map((x) => x.full_name).sort()).toEqual(["Léa Martin", "Tom Peeters"]);
  expect(JSON.stringify(v.candidates)).not.toMatch(/care|health|santé/i);
  await expect(run(federation, { action: "select", teamId: team, profileId: far, status: "preselected" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const r = await run(federation, { action: "select", teamId: team, profileId: lea, status: "preselected" });
  expect(r.told).toBeGreaterThanOrEqual(2);
  const told = (await db.query("SELECT recipient_user_id FROM app_notification WHERE resource_id=$1", [`national:${r.id}`])).rows.map((x) => x.recipient_user_id);
  expect(told).toEqual(expect.arrayContaining([parent.userId, president.userId]));
  await run(federation, { action: "select", teamId: team, profileId: lea, status: "selected" });
  await run(federation, { action: "select", teamId: team, profileId: tom, status: "selected" });
  // One PF2 at most here: a second would break the rule (only one exists, so the rule holds).
  expect((await nationalView(db, federation)).teams[0].players.filter((x: { status: string }) => x.status === "selected")).toHaveLength(2);
});

it("records an unavailability given by the parent, never by the club for him", async () => {
  const sel = (await playerNational(db, parent, lea)).selections[0];
  await expect(answer(president, { action: "availability", selectionId: sel.id, availability: "available" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await answer(parent, { action: "availability", selectionId: sel.id, availability: "unavailable", note: "Examens" });
  expect((await nationalView(db, federation)).teams[0].players.find((x: { profile_id: string }) => x.profile_id === lea)).toMatchObject({ availability: "unavailable", availability_note: "Examens" });
});

it("shares no care instruction without consent, then only during its period", async () => {
  expect(await nationalCare(db, physio, team)).toEqual([]);
  await expect(nationalCare(db, president, team)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const sel = (await playerNational(db, parent, lea)).selections[0];
  const k = await answer(parent, { action: "consent", selectionId: sel.id, startsOn: day(3), endsOn: day(6) });
  expect(await nationalCare(db, physio, team)).toEqual([]);
  await db.query("UPDATE national_care_consent SET starts_on=CURRENT_DATE WHERE id=$1", [k.id]);
  expect((await nationalCare(db, physio, team)).map((x) => [x.full_name, x.title])).toEqual([["Léa Martin", "Sangle thoracique"]]);
  await answer(parent, { action: "revoke", consentId: String(k.id) });
  expect(await nationalCare(db, physio, team)).toEqual([]);
});

it("plans a gathering the club sees read only, and an international tournament with a foreign team", async () => {
  await run(federation, { action: "gathering", teamId: team, kind: "camp", title: "Stage de Toussaint", startsAt: `${day(10)}T09:00:00+01:00`, endsAt: `${day(12)}T17:00:00+01:00`, place: "Bruxelles" });
  const c = await db.connect();
  try {
    const seen = await nationalEventsFor(c, club, null);
    expect(seen.map((g) => [g.title, g.team, g.players.sort()])).toEqual([["Stage de Toussaint", "Belgique U18", ["Léa Martin", "Tom Peeters"]]]);
    expect(await nationalEventsFor(c, other, null)).toEqual([]);
    expect(await nationalCount(c, club, season)).toBe(2);
  } finally {
    c.release();
  }
  const gathering = (await playerNational(db, parent, lea)).selections[0].gatherings[0];
  await answer(parent, { action: "gathering", gatheringId: gathering.id, selectionId: (await playerNational(db, parent, lea)).selections[0].id, response: "absent" });
  const tournament = (await db.query("INSERT INTO tournament(organization_id,name,year,format,created_by) VALUES($1,'Euro Cup',2026,'league',$2) RETURNING id", [fed, federation.userId])).rows[0].id;
  const ours = String((await run(federation, { action: "enterTournament", tournamentId: tournament, teamId: team })).id);
  const france = String((await run(federation, { action: "guestTeam", tournamentId: tournament, name: "France U18" })).id);
  expect((await db.query("SELECT kind FROM organization WHERE id=$1", [france])).rows[0].kind).toBe("guest");
  const dayId = (await db.query("INSERT INTO tournament_day(tournament_id,day) VALUES($1,CURRENT_DATE) RETURNING id", [tournament])).rows[0].id;
  const match = (
    await db.query("INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,home_organization_id,away_organization_id) VALUES($1,$2,'14:00','league',$3,$4) RETURNING id", [tournament, dayId, ours, france])
  ).rows[0].id;
  const selections = (await nationalView(db, federation)).teams[0].players as { id: string; profile_id: string }[];
  await run(federation, { action: "lineup", matchId: match, teamId: team, players: [{ selectionId: selections.find((x) => x.profile_id === tom)!.id, starter: true, goals: 2, assists: 0 }] });
  await run(federation, { action: "award", teamId: team, title: "Euro Cup U18", competition: "Euro Cup", place: 2, awardedOn: day(0) });
  // The player's sheet: caps, goals, honours.
  const sheet = await playerNational(db, president, tom);
  expect(sheet.selections[0]).toMatchObject({ team: "Belgique U18", status: "selected", caps: 1, goals: 2 });
  expect(sheet.selections[0].honours.map((h: { title: string }) => h.title)).toEqual(["Euro Cup U18"]);
  // Another club sees nothing of it.
  await expect(playerNational(db, presidentOther, tom)).resolves.toMatchObject({ selections: [] });
});
