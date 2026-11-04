import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { staffRolesExecute, staffRolesView } from "../../src/domains/access/staff-roles";
import { peopleView } from "../../src/domains/people/service";
import { filterSchema } from "../../src/domains/people/service";

/**
 * 7: a role gives exactly its rights; a person's own adjustment survives a
 * change to the role; a right taken away by the role is confirmed first and
 * journaled; no sensitive right by default; « its teams only » gives nothing
 * club-wide; an invitation brings its role; a coach does not see the others'
 * tasks; two clubs.
 */
const schema = "stf_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coach: Principal & { mandateId: string }, coachTwo: Principal & { mandateId: string };
const run = (p: Principal, body: Record<string, unknown>, org: string) => staffRolesExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;
const grantsOf = async (mandate: string) => ((await db.query("SELECT grants FROM role_assignment WHERE id=$1", [mandate])).rows[0].grants as string[]).sort();

async function member(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    email = userId + "@example.test";
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id as string;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,$2,$4 FROM person WHERE user_id=$3", [org, name, userId, role === "coach" ? "{coach}" : "{}"]);
  return { userId, sessionId, mandateId, email };
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await member(clubA, "club_president", "Présidente A");
  presidentB = await member(clubB, "club_president", "Président B");
  coach = await member(clubA, "coach", "Coach Trésorier");
  coachTwo = await member(clubA, "coach", "Coach Deux");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

const roleId = async (key: string, org = clubA) => (await db.query("SELECT id FROM staff_role WHERE organization_id=$1 AND key=$2", [org, key])).rows[0].id as string;

it("creates the eight roles for each club, with no sensitive right", async () => {
  const a = await staffRolesView(db, presidentA);
  expect(a.roles.map((r) => r.key)).toEqual(["head-coach", "assistant-coach", "team-manager", "equipment-manager", "transport-manager", "treasurer", "secretary", "recruitment"]);
  expect(a.roles.flatMap((r) => r.grants).some((g) => ["people.sensitive", "documents.sensitive", "people.export"].includes(g))).toBe(false);
  expect((await staffRolesView(db, presidentB)).roles).toHaveLength(8);
  expect((await staffRolesView(db, coach)).can.manage).toBe(false);
});

it("gives exactly the role's rights, and nothing club-wide for « its teams only »", async () => {
  await run(presidentA, { action: "assign", mandateId: coach.mandateId, roleIds: [await roleId("treasurer")] }, clubA);
  expect(await grantsOf(coach.mandateId)).toEqual(["dues.manage", "dues.read"]);
  await run(presidentA, { action: "assign", mandateId: coachTwo.mandateId, roleIds: [await roleId("head-coach")] }, clubA);
  expect(await grantsOf(coachTwo.mandateId)).toEqual([]);
  // Another club's role, or another club's person, is out of reach.
  await expect(run(presidentB, { action: "assign", mandateId: coach.mandateId, roleIds: [await roleId("treasurer", clubB)] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentA, { action: "assign", mandateId: coachTwo.mandateId, roleIds: [await roleId("treasurer", clubB)] }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(coach, { action: "assign", mandateId: coachTwo.mandateId, roleIds: [] }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("keeps a person's own adjustment when the role changes, after a confirmation that is journaled", async () => {
  // The rights grid saved by hand: equipment added for this person only.
  await execute(db, presidentA, { action: "grants", id: coach.mandateId, grants: ["dues.manage", "dues.read", "equipment.manage"] });
  const view = await staffRolesView(db, presidentA);
  expect(view.staff.find((s) => s.id === coach.mandateId)).toMatchObject({ custom: true, grants_added: ["equipment.manage"] });
  const treasurer = view.roles.find((r) => r.key === "treasurer")!;
  const body = { action: "save", id: treasurer.id, name: treasurer.name, description: treasurer.description, grants: ["dues.manage"], scope: "all" };
  const preview = await run(presidentA, body, clubA);
  expect(preview).toMatchObject({ confirmed: false, changes: [{ name: "Coach Trésorier", gained: [], lost: ["dues.read"] }] });
  expect(await grantsOf(coach.mandateId)).toEqual(["dues.manage", "dues.read", "equipment.manage"]);
  await run(presidentA, { ...body, confirm: true }, clubA);
  expect(await grantsOf(coach.mandateId)).toEqual(["dues.manage", "equipment.manage"]);
  const journal = (await db.query("SELECT details FROM audit_log WHERE organization_id=$1 AND action='mandate.grants' AND target_id=$2 ORDER BY created_at DESC LIMIT 1", [clubA, coach.mandateId])).rows[0];
  expect(journal.details).toMatchObject({ before: ["dues.manage", "dues.read", "equipment.manage"], after: ["dues.manage", "equipment.manage"] });
});

it("brings the role chosen with the invitation", async () => {
  const email = randomUUID() + "@example.test";
  const r = (await execute(db, presidentA, { action: "invite", email, role: "coach", grants: ["equipment.manage", "calendar.read"], validUntil: null, staffRoleIds: [await roleId("equipment-manager")] })) as { token: string };
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Nouveau matériel", email]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await execute(db, { userId, sessionId }, { action: "accept", token: r.token });
  const mandate = (await db.query("SELECT id,grants,grants_added,grants_removed FROM role_assignment WHERE user_id=$1", [userId])).rows[0];
  expect(mandate.grants.sort()).toEqual(["calendar.read", "equipment.manage"]);
  expect([mandate.grants_added, mandate.grants_removed]).toEqual([[], []]);
  expect((await db.query("SELECT 1 FROM mandate_staff_role WHERE mandate_id=$1", [mandate.id])).rowCount).toBe(1);
  // A role is for a coach or member of staff only.
  await expect(execute(db, presidentA, { action: "invite", email: randomUUID() + "@example.test", role: "player", grants: [], validUntil: null, staffRoleIds: [await roleId("treasurer")] })).rejects.toMatchObject({ code: "INVALID_ROLE" });
});

it("shows the roles, tasks and courses to the president, not to a coach", async () => {
  await db.query("INSERT INTO task(organization_id,title,kind,due_on,responsible_id,created_by) SELECT $1,'En retard','other',CURRENT_DATE-2,cp.id,$2 FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE pe.user_id=$3", [clubA, presidentA.userId, coach.userId]);
  const filters = filterSchema.parse({ directoryRole: "coach" });
  const president = await peopleView(db, presidentA, filters);
  const profile = president.profiles.find((x) => x.full_name === "Coach Trésorier")!;
  expect(president.coachExtras?.[profile.id]).toMatchObject({ roles: [{ name: { fr: "Trésorier" } }], tasks: { open: 1, late: 1 }, formations: [] });
  expect((await peopleView(db, coachTwo, filters)).coachExtras).toBeNull();
});
