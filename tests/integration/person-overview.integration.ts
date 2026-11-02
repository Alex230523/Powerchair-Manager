import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { personOverview } from "../../src/domains/player-profile/service";

/**
 * 40: each block absent without its right; the coach sees neither money nor
 * health; the parent sees his child's overview without the club's notes;
 * what blocks the player; another club gets nothing.
 */
const schema = "ovw_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, president: Principal, coach: Principal, parent: Principal, presidentB: Principal, ana: string, user: string, guardianProfile: string;
async function actor(org: string, role: string, name: string, teamId: string | null = null, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,team_id,grants) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, userId, role, teamId, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const pr = await actor(clubA, "club_president", "Présidente");
  president = pr.p;
  user = pr.p.userId;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const c = await actor(clubA, "coach", "Coach Aigles", team);
  coach = c.p;
  const coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Aigles','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, team, coachProfile]);
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  ana = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Ana','2012-01-01','{player}') RETURNING id", [clubA, person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, ana]);
  // No licence; a fee late since last month; a missing document; a broken chair; health notes.
  const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Joueur',25000,1,CURRENT_DATE-40) RETURNING id", [clubA, season])).rows[0].id;
  const fee = (await db.query("INSERT INTO dues_receivable(organization_id,plan_id,season_id,profile_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Joueur','{}',25000,0,$5) RETURNING id", [clubA, plan, season, ana, user])).rows[0].id;
  await db.query("INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents) VALUES($1,1,CURRENT_DATE-40,25000)", [fee]);
  await db.query("INSERT INTO club_document(organization_id,profile_id,season_id,name,category,status) VALUES($1,$2,$3,'Assurance','insurance','missing')", [clubA, ana, season]);
  const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status) VALUES($1,'Strike 9','maintenance') RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-5,true,$4)", [clubA, chair, ana, user]);
  await db.query("INSERT INTO player_support_profile(organization_id,profile_id,support_needs,safety_notes) VALUES($1,$2,'Aide au transfert','Sangle')", [clubA, ana]);
  const pa = await actor(clubA, "guardian", "Parent d'Ana");
  parent = pa.p;
  guardianProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent d''Ana') RETURNING id", [clubA, pa.person])).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)",
    [clubA, guardianProfile, ana, user],
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives the presidency every block (its role holds people.sensitive), the overview first, and what blocks", async () => {
  const o = await personOverview(db, president, ana);
  expect(o.overviewFirst).toBe(true);
  expect(Object.keys(o.blocks).sort()).toEqual(["attendance", "authorizations", "chairs", "children", "documents", "dues", "guardians", "health", "licence", "mandates", "next", "tasks", "teams"]);
  expect(o.blocks.dues).toMatchObject({ due: 25000, paid: 0, late: 25000 });
  expect(o.blocking.map((b) => b.key).sort()).toEqual(["chairBroken", "documentsMissing", "duesLate", "licence"]);
  expect(o.blocks.guardians!.map((g) => g.full_name)).toEqual(["Parent d'Ana"]);
});

it("gives the coach the sport, never money nor health, and his own tab first", async () => {
  const o = await personOverview(db, coach, ana);
  expect(o.overviewFirst).toBe(false);
  expect(o.blocks.dues).toBeUndefined();
  expect(o.blocks.health).toBeUndefined();
  expect(o.blocks.mandates).toBeUndefined();
  expect(o.blocks.documents).toBeTruthy();
  expect(o.blocking.map((b) => b.key)).not.toContain("duesLate");
});

it("gives the parent his child's overview, with the fee, without the club's notes", async () => {
  const o = await personOverview(db, parent, ana);
  expect(o.blocks.dues).toMatchObject({ late: 25000 });
  expect(o.blocks.health).toBeUndefined();
  expect(o.email).toBeNull();
  expect(JSON.stringify(o)).not.toMatch(/Aide au transfert|Sangle/);
  // And his own sheet lists his child.
  expect((await personOverview(db, parent, guardianProfile)).blocks.children!.map((c) => c.full_name)).toEqual(["Ana"]);
});

it("gives another club nothing", async () => {
  await expect(personOverview(db, presidentB, ana)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
