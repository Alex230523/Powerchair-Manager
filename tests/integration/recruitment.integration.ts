import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { recruitmentExecute, recruitmentTick, recruitmentView, trialChairs } from "../../src/domains/recruitment/service";

/**
 * H1: a minor prospect with his parent's contact; a trial with a club chair
 * booked; the registration with nothing typed again; reminders once; the
 * indicators by source; the deletion after the delay; a coach without the
 * right sees nothing; two clubs.
 */
const schema = "rec_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coach: Principal, presidentB: Principal, chair: string, centre: string, lea: string;
async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president", "Présidente");
  coach = await actor(clubA, "coach", "Coach");
  presidentB = await actor(clubB, "club_president", "Président B");
  chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Strike 3','available','club') RETURNING id", [clubA])).rows[0].id;
  centre = (await db.query("INSERT INTO contact_organization(organization_id,name,kind) VALUES($1,'Centre de revalidation','rehab') RETURNING id", [clubA])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("takes a minor prospect only with his parent's contact, without health data", async () => {
  await expect(recruitmentExecute(db, president, { action: "create", firstName: "Léa", minor: true, source: "rehab" }, clubA)).rejects.toBeTruthy();
  lea = (
    (await recruitmentExecute(
      db,
      president,
      { action: "create", firstName: "Léa", lastName: "Martin", minor: true, approxAge: 11, parentName: "Sophie Martin", parentEmail: "sophie@example.test", source: "rehab", originOrganizationId: centre, ownChair: false, consent: true },
      clubA,
    )) as { id: string }
  ).id;
  const v = await recruitmentView(db, president);
  expect(v.prospects[0]).toMatchObject({ first_name: "Léa", parent_name: "Sophie Martin", stage: "first_contact" });
  expect(v.partners.find((x) => x.id === centre)).toMatchObject({ prospects: 1, registered: 0 });
});

it("plans a trial with a club chair booked, the invitation sent to the parent", async () => {
  expect((await trialChairs(db, president, null, inDays(5).slice(0, 10))).map((c) => c.id)).toEqual([chair]);
  const r = (await recruitmentExecute(db, president, { action: "trial", id: lea, startsAt: inDays(5), chairId: chair, bring: "une gourde" }, clubA)) as { eventId: string; sent: boolean };
  expect(r.sent).toBe(true);
  expect((await db.query("SELECT prospect_id,profile_id FROM chair_booking WHERE event_id=$1 AND status='booked'", [r.eventId])).rows).toEqual([{ prospect_id: lea, profile_id: null }]);
  // The chair is no longer free for that session.
  expect(await trialChairs(db, president, r.eventId, null)).toEqual([]);
  expect((await recruitmentView(db, president)).prospects[0]).toMatchObject({ stage: "trial_planned", trial_chair: "Strike 3" });
});

it("reminds once three days after the trial and once after 30 days of silence", async () => {
  await recruitmentExecute(db, president, { action: "stage", id: lea, stage: "trial_done" }, clubA);
  await db.query("UPDATE prospect_stage SET at=now()-interval '4 days' WHERE prospect_id=$1 AND stage='trial_done'", [lea]);
  expect(await recruitmentTick(db)).toBe(1);
  expect(await recruitmentTick(db)).toBe(0);
  await db.query("UPDATE prospect SET last_contact_at=now()-interval '31 days' WHERE id=$1", [lea]);
  expect(await recruitmentTick(db)).toBe(1);
  expect(await recruitmentTick(db)).toBe(0);
  expect((await db.query("SELECT source_kind FROM task WHERE organization_id=$1 ORDER BY source_kind", [clubA])).rows.map((r) => r.source_kind)).toEqual(["prospectCall", "prospectSilent"]);
});

it("registers the prospect as a player with her parent, nothing typed again", async () => {
  const r = (await recruitmentExecute(db, president, { action: "register", id: lea }, clubA)) as { profileId: string };
  const player = (await db.query("SELECT full_name,directory_roles,recruitment_source FROM club_person WHERE id=$1", [r.profileId])).rows[0];
  expect(player).toEqual({ full_name: "Léa Martin", directory_roles: ["player"], recruitment_source: "rehab" });
  const parent = (await db.query("SELECT cp.full_name FROM guardian_relationship g JOIN club_person cp ON cp.id=g.guardian_profile_id WHERE g.subject_profile_id=$1", [r.profileId])).rows;
  expect(parent).toEqual([{ full_name: "Sophie Martin" }]);
  await expect(recruitmentExecute(db, president, { action: "register", id: lea }, clubA)).rejects.toMatchObject({ code: "DUPLICATE" });
  const ind = (await recruitmentView(db, president)).indicators.find((x) => x.source === "rehab")!;
  expect(ind).toMatchObject({ prospects: 1, trial: 1, registered: 1, trialRate: 100, registerRate: 100 });
});

it("gives the indicators by source, and deletes after the delay while keeping the tally", async () => {
  const id = ((await recruitmentExecute(db, president, { action: "create", firstName: "Tom", source: "social" }, clubA)) as { id: string }).id;
  await db.query("UPDATE prospect SET last_contact_at=now()-interval '25 months' WHERE id=$1", [id]);
  await recruitmentTick(db);
  expect((await db.query("SELECT count(*)::int AS n FROM prospect WHERE id=$1", [id])).rows[0].n).toBe(0);
  // The registered prospect stays; the tally keeps Tom without his name.
  expect((await db.query("SELECT count(*)::int AS n FROM prospect WHERE id=$1", [lea])).rows[0].n).toBe(1);
  expect((await recruitmentView(db, president)).indicators.find((x) => x.source === "social")).toMatchObject({ prospects: 1, registered: 0 });
});

it("shows nothing to a coach without the right, nor to another club", async () => {
  await expect(recruitmentView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const b = await recruitmentView(db, presidentB);
  expect(b.prospects).toEqual([]);
  await expect(recruitmentExecute(db, presidentB, { action: "stage", id: lea, stage: "not_now" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(recruitmentExecute(db, presidentB, { action: "create", firstName: "X", source: "other", originOrganizationId: centre }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
