import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { majorityTick, peopleExecute } from "../../src/domains/people/service";
import { peopleCommand } from "../../src/domains/people/schema";
import { myChecks, seasonCheckExecute, seasonCheckView, seasonCheckTick } from "../../src/domains/season-check/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * 8: a player added with his representatives (required for a minor, asked
 * for an adult, a sibling's parent reused, one invitation each); the
 * invitation at 18; the start-of-season check for a parent of two children
 * (postponed once, back after the delay), the club's follow-up; two clubs.
 */
const schema = "t08_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal;
const joined = brusselsDay();
const born = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
};

async function actor(org: string, role: string, name: string, email = randomUUID() + "@example.test") {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const add = (p: Principal, body: Record<string, unknown>) =>
  peopleExecute(db, p, peopleCommand.parse({ action: "createPerson", email: "", phone: "", joinedOn: joined, directoryRoles: ["player"], ...body }));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Présidente A");
  presidentB = await actor(clubB, "club_president", "Président B");
  for (const org of [clubA, clubB]) await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-5,CURRENT_DATE+300)", [org]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("refuses a minor without a representative, never imposes one on an autonomous adult", async () => {
  await expect(add(presidentA, { fullName: "Lucas Peeters", birthDate: born(12), representatives: [] })).rejects.toMatchObject({ code: "GUARDIAN_REQUIRED" });
  const adult = await add(presidentA, { fullName: "Adulte Autonome", birthDate: born(30), representatives: [] });
  expect((await db.query("SELECT count(*)::int AS n FROM guardian_relationship WHERE subject_profile_id=$1", [adult.id])).rows[0].n).toBe(0);
  await expect(add(presidentA, { fullName: "Adulte Aidé", birthDate: born(25), hasRepresentative: true, representatives: [] })).rejects.toMatchObject({ code: "REPRESENTATIVE_REQUIRED" });
});

it("adds a minor with his parent in one go, then his sister reuses the same parent; one invitation each", async () => {
  const lucas = await add(presidentA, {
    fullName: "Lucas Peeters",
    birthDate: born(12),
    representatives: [{ fullName: "Nadia Peeters", relation: "mother", email: "nadia@example.test", phone: "0470", locale: "nl", rights: "legal" }],
    inviteRepresentatives: true,
  });
  const nadia = (await db.query("SELECT g.guardian_profile_id AS id,g.kind,g.authorization_note FROM guardian_relationship g WHERE g.subject_profile_id=$1", [lucas.id])).rows[0];
  expect([nadia.kind, nadia.authorization_note]).toEqual(["declared", "Lien : mère, donné à l'ajout du joueur"]);
  expect((await db.query("SELECT pe.locale FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1", [nadia.id])).rows[0].locale).toBe("nl");
  const emma = await add(presidentA, { fullName: "Emma Peeters", birthDate: born(10), representatives: [{ existingId: nadia.id, relation: "mother", email: "nadia@example.test", rights: "legal" }], inviteRepresentatives: true });
  expect((await db.query("SELECT guardian_profile_id FROM guardian_relationship WHERE subject_profile_id=$1", [emma.id])).rows[0].guardian_profile_id).toBe(nadia.id);
  // One live invitation for the parent's file, whatever the number of children.
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE profile_id=$1 AND role='guardian'", [nadia.id])).rows[0].n).toBe(1);
  // A person of the other club cannot be reused.
  const other = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,p.id,'Autre parent' FROM p RETURNING id", [clubB])).rows[0].id;
  await expect(add(presidentA, { fullName: "Zoé", birthDate: born(9), representatives: [{ existingId: other, relation: "mother", rights: "legal" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("adds an adult with his administrator as a delegated carer, seeing until the end of the season", async () => {
  const adult = await add(presidentA, { fullName: "Adulte Aidé", birthDate: born(25), hasRepresentative: true, representatives: [{ fullName: "Marc Admin", relation: "administrator", email: "", rights: "aid" }], inviteRepresentatives: false });
  const g = (await db.query("SELECT kind,can_view,can_edit,ends_on::text AS ends_on FROM guardian_relationship WHERE subject_profile_id=$1", [adult.id])).rows[0];
  expect([g.kind, g.can_view, g.can_edit, !!g.ends_on]).toEqual(["delegated_aid", true, false, true]);
});

it("invites a player who turns 18 to his own account, once", async () => {
  const p = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,directory_roles) SELECT $1,p.id,'Tom Majeur',$2,'tom@example.test','{player}' FROM p RETURNING id", [clubA, born(18)])).rows[0].id;
  expect(await majorityTick(db)).toBeGreaterThanOrEqual(1);
  await majorityTick(db);
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE profile_id=$1 AND role='player'", [p])).rows[0].n).toBe(1);
});

it("asks a parent of two children to check each one, postponed once, followed by the club", async () => {
  expect(await seasonCheckTick(db)).toBe(1); // club A has players, club B none
  const parent = await actor(clubA, "guardian", "Sara Parent");
  const me = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Sara Parent' FROM person WHERE user_id=$2 RETURNING id", [clubA, parent.userId])).rows[0].id;
  const kids: string[] = [];
  for (const name of ["Léo Martin", "Mia Martin"]) {
    const kid = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,$3,'{player}' FROM p RETURNING id", [clubA, name, born(11)])).rows[0].id;
    kids.push(kid);
    await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)", [clubA, me, kid, presidentA.userId]);
  }
  await db.query("INSERT INTO player_support_profile(organization_id,profile_id,support_needs,emergency_contact) VALUES($1,$2,'Sangle thoracique','Papa 0470')", [clubA, kids[0]]);
  const first = await myChecks(db, parent);
  expect(first.show).toBe(true);
  expect(first.people.map((x) => x.name)).toEqual(["Léo Martin", "Mia Martin"]);
  expect(first.people[0]).toMatchObject({ emergency: "Papa 0470", care: { needs: "Sangle thoracique" } });
  await seasonCheckExecute(db, parent, { action: "postpone" });
  expect((await myChecks(db, parent)).show).toBe(false);
  await expect(seasonCheckExecute(db, parent, { action: "postpone" })).rejects.toMatchObject({ code: "ALREADY_POSTPONED" });
  // After the delay, back at each sign-in.
  await db.query("UPDATE season_check SET launched_at=now()-interval '15 days' WHERE organization_id=$1", [clubA]);
  expect((await myChecks(db, parent)).show).toBe(true);
  await seasonCheckExecute(db, parent, { action: "confirm", profileId: kids[0] });
  expect((await myChecks(db, parent)).people.map((x) => x.name)).toEqual(["Mia Martin"]);
  // Not one of hers: refused.
  await expect(seasonCheckExecute(db, parent, { action: "confirm", profileId: me })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const follow = await seasonCheckView(db, presidentA);
  expect(follow.players.filter((x) => x.verifiedAt).map((x) => x.name)).toEqual(["Léo Martin"]);
  await expect(seasonCheckView(db, parent)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Club B sees none of club A's players.
  expect((await seasonCheckView(db, presidentB)).players).toEqual([]);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='seasonCheck.verified' AND target_id=$1", [kids[0]])).rows[0].n).toBe(1);
});
