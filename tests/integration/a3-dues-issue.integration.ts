import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { registrationExecute, registrationView } from "../../src/domains/registrations/service";
import { platformTemplate } from "../../src/domains/registrations/templates";
import { undoExecute } from "../../src/domains/undo/service";

/**
 * A3: « Émettre des cotisations ». A club without any rate issues from the
 * wizard; a whole team with the sibling discount; a person already covered
 * is left out; the fee is issued by itself when a registration is accepted
 * (and cancelled when the acceptance is undone); without dues.manage, no
 * issue; two clubs.
 */
const schema = "a3dues_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coach: Principal, parent: Principal, season: string, seasonB: string, team: string;
let ana: string, bilal: string, chloe: string, plan: string;

async function actor(org: string | null, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  if (org) {
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
    const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
    await execute(db, p, { action: "context", mandateId });
  }
  return p;
}
async function player(name: string, birth: string, user?: Principal) {
  const person = user ? (await db.query("SELECT id FROM person WHERE user_id=$1", [user.userId])).rows[0].id : (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,'{player}') RETURNING id", [clubA, person, name, birth])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
  return id as string;
}
const run = (p: Principal, org: string, cmd: Record<string, unknown>) => duesExecute(db, p, cmd as never, org) as Promise<Record<string, unknown>>;
const owed = async (profile: string) =>
  (await db.query("SELECT net_cents,discount_cents,status FROM dues_receivable WHERE profile_id=$1 ORDER BY created_at", [profile])).rows as { net_cents: number; discount_cents: number; status: string }[];

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Président B");
  coach = await actor(clubA, "coach", "Coach");
  parent = await actor(clubA, "guardian", "Parent");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  seasonB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  ana = await player("Ana", "2010-01-01");
  bilal = await player("Bilal", "2012-01-01");
  chloe = await player("Chloé", "2000-01-01");
  // Ana and Bilal share a parent: siblings.
  const parentProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Parent' FROM person WHERE user_id=$2 RETURNING id", [clubA, parent.userId])).rows[0].id;
  for (const child of [ana, bilal])
    await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,verified_by) VALUES($1,$2,$3,'declared',$4)", [clubA, parentProfile, child, presidentA.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives the president the issue right, and only to those with dues.manage", async () => {
  expect((await duesView(db, presidentA)).manage).toBe(true);
  expect((await duesView(db, coach)).manage).toBe(false);
  await expect(run(coach, clubA, { action: "preview", planId: randomUUID(), target: { kind: "season" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("issues to a whole team from a club without any rate, with the sibling discount", async () => {
  expect((await duesView(db, presidentA)).plans).toEqual([]);
  plan = (await run(presidentA, clubA, { action: "plan", seasonId: season, category: "Joueur", amountCents: 25000, maxInstallments: 4, firstDue: "2026-11-01" })).id as string;
  await run(presidentA, clubA, { action: "siblingRule", planId: plan, secondPercent: 50, nextPercent: 50 });
  const { lines } = (await run(presidentA, clubA, { action: "preview", planId: plan, target: { kind: "team", teamId: team } })) as { lines: { full_name: string; net: number; covered: boolean }[] };
  expect(lines.map((l) => [l.full_name, l.net, l.covered])).toEqual([
    ["Ana", 25000, false],
    ["Bilal", 12500, false],
    ["Chloé", 25000, false],
  ]);
  const done = await run(presidentA, clubA, {
    action: "issueMany",
    planId: plan,
    target: { kind: "team", teamId: team },
    installments: 4,
    firstDue: "2026-11-01",
    exemptions: [{ profileId: chloe, reason: "Situation familiale" }],
    excluded: [],
    notify: true,
  });
  expect(done).toMatchObject({ issued: 3, skipped: 0 });
  expect(await owed(ana)).toEqual([{ net_cents: 25000, discount_cents: 0, status: "open" }]);
  expect(await owed(bilal)).toEqual([{ net_cents: 12500, discount_cents: 12500, status: "open" }]);
  expect(await owed(chloe)).toEqual([{ net_cents: 0, discount_cents: 25000, status: "open" }]);
  // 250 € in 4 payments of 62,50 €: one receivable, four instalments.
  expect((await db.query("SELECT amount_cents FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.profile_id=$1 ORDER BY ordinal", [ana])).rows.map((r) => r.amount_cents)).toEqual([
    6250, 6250, 6250, 6250,
  ]);
  // The parent hears it once per child with a fee to pay.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='dues_issued' AND recipient_user_id=$1", [parent.userId])).rows[0].n).toBe(2);
});

it("leaves out the people already covered", async () => {
  const { lines } = (await run(presidentA, clubA, { action: "preview", planId: plan, target: { kind: "season" } })) as { lines: { covered: boolean; included: boolean }[] };
  expect(lines.every((l) => l.covered && !l.included)).toBe(true);
  const again = await run(presidentA, clubA, { action: "issueMany", planId: plan, target: { kind: "season" }, installments: 1, firstDue: "2026-11-01", exemptions: [], excluded: [], notify: false });
  expect(again).toMatchObject({ issued: 0, skipped: 3 });
  // An exemption without a real reason is refused by the schema.
  await expect(
    run(presidentA, clubA, { action: "issueMany", planId: plan, target: { kind: "season" }, installments: 1, firstDue: "2026-11-01", exemptions: [{ profileId: ana, reason: "x" }], excluded: [], notify: false }),
  ).rejects.toThrow();
});

it("issues the fee by itself when a registration is accepted, and undoes it with the decision", async () => {
  await run(presidentA, clubA, { action: "autoIssue", planId: plan });
  expect((await duesView(db, presidentA)).autoPlanId).toBe(plan);
  const t = platformTemplate("player", "fr");
  const form = (await registrationExecute(db, presidentA, { action: "form", seasonId: season, title: "Inscriptions", description: t.description, fields: [], published: true, capacity: null }, clubA)).id!;
  const a = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,answers,status,submitted_at,subject_kind) VALUES($1,$2,$3,$4,'Dina','2011-05-05','fr',$5,$6,'submitted',now(),'represented') RETURNING id,version",
      [clubA, form, parent.userId, season, JSON.stringify({ title: "Inscriptions", fields: t.fields }), JSON.stringify({ email: "famille@example.test", phone: "+32 470 00 00 00" })],
    )
  ).rows[0];
  const decided = (await registrationExecute(db, presidentA, { action: "decision", id: a.id, expectedVersion: a.version, status: "accepted", message: "", confirmDuplicate: false, acceptOverCapacity: false } as never, clubA)) as { undo?: string };
  const profile = (await db.query("SELECT profile_id FROM registration_application WHERE id=$1", [a.id])).rows[0].profile_id;
  expect(await owed(profile)).toEqual([{ net_cents: 25000, discount_cents: 0, status: "open" }]);
  expect((await db.query("SELECT state FROM registration_followup WHERE application_id=$1 AND kind='dues'", [a.id])).rows[0].state).toBe("processed");
  await undoExecute(db, presidentA, { id: decided.undo! }, clubA);
  expect((await owed(profile)).map((d) => d.status)).toEqual(["cancelled"]);
  void registrationView;
});

it("keeps two clubs apart", async () => {
  await expect(run(presidentB, clubB, { action: "preview", planId: plan, target: { kind: "season" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "autoIssue", planId: plan })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const own = (await run(presidentB, clubB, { action: "plan", seasonId: seasonB, category: "Joueur", amountCents: 10000, maxInstallments: 1, firstDue: "2026-11-01" })).id;
  await expect(run(presidentB, clubB, { action: "issueMany", planId: own, target: { kind: "person", profileId: ana }, installments: 1, firstDue: "2026-11-01", exemptions: [], excluded: [], notify: false })).resolves.toMatchObject({
    issued: 0,
  });
  expect((await duesView(db, presidentB)).debts).toEqual([]);
});
