import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { answerCommand, answerExecute, isNationalStaff, nationalCare, nationalCommand, nationalExecute, nationalStaffView, playerNational } from "../../src/domains/national/service";
import { seal } from "../../src/domains/notifications/crypto";
import { seasonOf } from "../../src/domains/finance/schema";
import { brusselsDay } from "../../src/lib/today";

/**
 * 13/11/2026, two federations: « Mon équipe nationale », the national staff's
 * page. A club's coach on the staff sees his team (players, answers,
 * gatherings, who shares care instructions); the mechanic does not read the
 * care instructions; each reading is journaled in the player's club; nobody
 * outside the staff, nor the other federation, sees anything.
 */
const schema = "natstaff_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, fed2: string, club: string, club2: string, federation: Principal, federation2: Principal, coach: Principal, mechanic: Principal, president: Principal, parent: Principal;
let lea: string, tom: string, team: string, season: string, coachProfile: string;

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
async function player(org: string, name: string, birth: string, classification: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,'{player}') RETURNING id", [org, person, name, birth])).rows[0].id as string;
  await db.query("INSERT INTO player_sport_profile(profile_id,organization_id,classification) VALUES($1,$2,$3)", [id, org, classification]);
  await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,$5,'active',$6)", [fed, org, id, season, "L-" + name, federation.userId]);
  return id;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = fed) => nationalExecute(db, p, nationalCommand.parse(cmd), org) as Promise<Record<string, unknown>>;
const day = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  season = seasonOf(brusselsDay()).label;
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé belge','federation') RETURNING id")).rows[0].id;
  fed2 = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé voisine','federation') RETURNING id")).rows[0].id;
  club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  club2 = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club voisin','club',$1) RETURNING id", [fed2])).rows[0].id;
  federation = (await actor(fed, "federation_president", "Présidente fédérale")).p;
  federation2 = (await actor(fed2, "federation_president", "Président voisin")).p;
  president = (await actor(club, "club_president", "Président A")).p;
  mechanic = (await actor(fed, "federation_worker", "Mécanicien national")).p;
  // The coach of Club A, on the staff by his club sheet.
  const c = await actor(club, "coach", "Coach Léo");
  coach = c.p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Léo','{coach}') RETURNING id", [club, c.person])).rows[0].id;
  lea = await player(club, "Léa Martin", "2010-03-01", "PF1");
  tom = await player(club, "Tom Peeters", "2001-05-01", "PF2");
  const pa = await actor(club, "guardian", "Sophie Martin");
  parent = pa.p;
  const gp = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Sophie Martin') RETURNING id", [club, pa.person])).rows[0].id;
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié',$4)", [club, gp, lea, president.userId]);
  const careId = randomUUID();
  await db.query("INSERT INTO care_instruction(id,organization_id,profile_id,moment,ciphertext,created_by) VALUES($1,$2,$3,'before_play',$4,$5)", [
    careId,
    club,
    lea,
    seal({ title: "Sangle thoracique", details: "Vérifier avant chaque match" }, "care:" + careId),
    president.userId,
  ]);

  team = String((await run(federation, { action: "team", name: "Belgique U18", category: "u18", season })).id);
  await run(federation, { action: "staffAdd", teamId: team, role: "head_coach", profileId: coachProfile });
  await run(federation, { action: "staffAdd", teamId: team, role: "mechanic", userId: mechanic.userId });
  await run(federation, { action: "select", teamId: team, profileId: lea, status: "selected" });
  await run(federation, { action: "select", teamId: team, profileId: tom, status: "reserve" });
  await run(federation, { action: "gathering", teamId: team, kind: "camp", title: "Stage de Toussaint", startsAt: `${day(10)}T09:00:00+01:00`, endsAt: `${day(12)}T17:00:00+01:00`, place: "Bruxelles" });
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows the coach his national team: the staff, the players, the gathering and who comes", async () => {
  expect(await isNationalStaff(db, coach.userId)).toBe(true);
  expect((await workspace(db, coach)).nationalStaff).toBe(true);
  const v = await nationalStaffView(db, coach);
  expect(v.teams).toHaveLength(1);
  const t = v.teams[0];
  expect(t).toMatchObject({ name: "Belgique U18", federation: "Fédé belge", roles: ["head_coach"], readsCare: true });
  expect(t.staff.map((s: { name: string; role: string }) => [s.name, s.role])).toEqual([
    ["Coach Léo", "head_coach"],
    ["Mécanicien national", "mechanic"],
  ]);
  expect(t.players.map((x: { full_name: string; status: string; classification: string }) => [x.full_name, x.status, x.classification])).toEqual([
    ["Tom Peeters", "reserve", "PF2"],
    ["Léa Martin", "selected", "PF1"],
  ]);
  // Sporting data only: nothing of health in the page itself.
  expect(JSON.stringify(t.players)).not.toMatch(/Sangle|ciphertext|birth/i);
  // The player answers the gathering; the staff sees who comes.
  const sel = (await playerNational(db, parent, lea)).selections[0];
  const g = t.gatherings[0];
  await answerExecute(db, parent, answerCommand.parse({ action: "gathering", gatheringId: g.id, selectionId: sel.id, response: "present" }));
  const again = (await nationalStaffView(db, coach)).teams[0].gatherings[0];
  expect(again.answers).toEqual([
    { name: "Léa Martin", response: "present" },
    { name: "Tom Peeters", response: "none" },
  ]);
});

it("reads the care instructions with the consent only, journaled in the player's club; never the mechanic", async () => {
  expect(await nationalCare(db, coach, team)).toEqual([]);
  const sel = (await playerNational(db, parent, lea)).selections[0];
  const k = await answerExecute(db, parent, answerCommand.parse({ action: "consent", selectionId: sel.id, startsOn: day(0), endsOn: day(5) }));
  expect((await nationalStaffView(db, coach)).teams[0].players.find((x: { full_name: string }) => x.full_name === "Léa Martin")).toMatchObject({ care_shared: true });
  const care = await nationalCare(db, coach, team);
  expect(care.map((x) => [x.full_name, x.title, x.moment, x.shared_until])).toEqual([["Léa Martin", "Sangle thoracique", "before_play", day(5)]]);
  const log = (await db.query("SELECT organization_id,actor_id,profile_id,kind,resource_id FROM sensitive_access_log WHERE kind='national_care'")).rows;
  expect(log).toEqual([{ organization_id: club, actor_id: coach.userId, profile_id: lea, kind: "national_care", resource_id: team }]);
  // The mechanic is on the staff, but does not read health data.
  expect((await nationalStaffView(db, mechanic)).teams[0]).toMatchObject({ roles: ["mechanic"], readsCare: false });
  await expect(nationalCare(db, mechanic, team)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await answerExecute(db, parent, answerCommand.parse({ action: "revoke", consentId: String((k as { id: string }).id) }));
  expect(await nationalCare(db, coach, team)).toEqual([]);
});

it("shows nothing to who is not on the staff, nor to the other federation", async () => {
  for (const p of [president, parent, federation2]) {
    expect((await nationalStaffView(db, p)).teams).toEqual([]);
    expect((await workspace(db, p)).nationalStaff).toBe(false);
    await expect(nationalCare(db, p, team)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  // The federation builds the team in its own page, it is not on the staff.
  expect((await nationalStaffView(db, federation)).teams).toEqual([]);
  expect(club2).toBeTruthy();
});

it("hides an archived team from its staff, care instructions included", async () => {
  await db.query("UPDATE national_team SET archived=true WHERE id=$1", [team]);
  expect((await nationalStaffView(db, coach)).teams).toEqual([]);
  expect(await isNationalStaff(db, coach.userId)).toBe(false);
  await expect(nationalCare(db, coach, team)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
