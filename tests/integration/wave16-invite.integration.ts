import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { inviteProfile, welcomeView, welcomeComplete, welcomeDispute, hashToken } from "../../src/domains/access/invite";
import { peopleExecute } from "../../src/domains/people/service";
import { registrationExecute } from "../../src/domains/registrations/service";

/** Wave 16 (I2): invitations tied to a file and the guided account creation, in two clubs. */
const schema = "w16inv_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, coachA: Principal, presidentB: Principal, season: string;
const day = new Date().toISOString().slice(0, 10);
const yearsAgo = (n: number) => `${new Date().getFullYear() - n}-01-15`;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
/** An account as the guided creation makes it (better-auth runs on the route). */
async function account(email: string) {
  const id = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)', [id, "x", email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [id]);
  return id;
}
async function invite(org: string, by: Principal, i: Parameters<typeof inviteProfile>[3]) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = await inviteProfile(c, org, by.userId, i);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const create = (org: string, by: Principal, fields: Record<string, unknown>) =>
  peopleExecute(db, by, { action: "createPerson", birthDate: null, email: "", phone: "", joinedOn: day, directoryRoles: ["player"], ...fields } as never, org);
const base = { action: "create" as const, birthDate: null, phone: "", locale: "fr" as const, password: "un-mot-de-passe-solide", privacy: true as const, classification: null, chair: null, care: "" };

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach");
  presidentB = await actor(clubB, "club_president");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("sends the invitation with a new adult file, and the parent's for a minor", async () => {
  const adult = (await create(clubA, presidentA, { fullName: "Inès Adulte", birthDate: yearsAgo(25), email: "ines@example.test", invite: true })).id!;
  expect((await db.query("SELECT role,profile_id,greeting FROM invitation WHERE organization_id=$1 AND email='ines@example.test'", [clubA])).rows).toEqual([
    { role: "player", profile_id: adult, greeting: "Inès" },
  ]);
  // A minor needs the parent's address; the parent's file and a declared link are created.
  await expect(create(clubA, presidentA, { fullName: "Léo Mineur", birthDate: yearsAgo(12), invite: true })).rejects.toMatchObject({ code: "GUARDIAN_REQUIRED" });
  const child = (await create(clubA, presidentA, { fullName: "Léo Mineur", birthDate: yearsAgo(12), invite: true, guardianName: "Sarah Parent", guardianEmail: "sarah@example.test" })).id!;
  const row = (await db.query("SELECT role,guardian_of,profile_id FROM invitation WHERE email='sarah@example.test'")).rows[0];
  expect(row).toMatchObject({ role: "guardian", guardian_of: child });
  expect((await db.query("SELECT kind FROM guardian_relationship WHERE guardian_profile_id=$1 AND subject_profile_id=$2", [row.profile_id, child])).rows).toEqual([{ kind: "declared" }]);
  // Without the box ticked, nothing leaves.
  await create(clubA, presidentA, { fullName: "Sans Invitation", email: "sans@example.test" });
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE email='sans@example.test'")).rows[0].n).toBe(0);
});

it("refuses the invitation to a profile that may not invite", async () => {
  await expect(create(clubA, coachA, { fullName: "Par Le Coach", email: "coach-invite@example.test", invite: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("guides the account creation and links the account to the file", async () => {
  const file = (await create(clubA, presidentA, { fullName: "Noah Joueur", birthDate: yearsAgo(20) })).id!;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  const { token } = await invite(clubA, presidentA, { email: "noah@example.test", role: "player", profileId: file, teamId: team, greeting: "Noah" });
  const view = await welcomeView(db, token);
  expect(view).toMatchObject({ state: "valid", organization: "Club A", role: "player", team: "Lions", email: "noah@example.test", existing: "none", sport: true });
  const userId = await account("noah@example.test");
  await welcomeComplete(db, token, userId, { ...base, firstName: "Noah", lastName: "Joueur", birthDate: yearsAgo(20), classification: "PF1", chair: "own", care: "Aide au transfert" });
  expect((await db.query("SELECT role FROM role_assignment WHERE organization_id=$1 AND user_id=$2", [clubA, userId])).rows).toEqual([{ role: "player" }]);
  expect((await db.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [userId])).rows[0].emailVerified).toBe(true);
  expect((await db.query("SELECT p.user_id FROM club_person cp JOIN person p ON p.id=cp.person_id WHERE cp.id=$1", [file])).rows[0].user_id).toBe(userId);
  expect((await db.query("SELECT classification FROM player_sport_profile WHERE profile_id=$1", [file])).rows[0].classification).toBe("PF1");
  expect((await db.query("SELECT count(*)::int AS n FROM equipment_chair_assignment WHERE profile_id=$1", [file])).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM care_instruction WHERE profile_id=$1", [file])).rows[0].n).toBe(1);
  // The link works once.
  expect(await welcomeView(db, token)).toEqual({ state: "used" });
  await expect(welcomeComplete(db, token, userId, { ...base, firstName: "Noah", lastName: "Joueur" })).rejects.toMatchObject({ code: "INVITATION_INVALID" });
});

it("turns the parent's declared link into a verified one", async () => {
  const child = (await create(clubA, presidentA, { fullName: "Lina Enfant", birthDate: yearsAgo(10) })).id!;
  const parent = (await create(clubA, presidentA, { fullName: "Marc Parent", directoryRoles: [] })).id!;
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,verified_by) VALUES($1,$2,$3,'declared',$4)", [clubA, parent, child, presidentA.userId]);
  const { token } = await invite(clubA, presidentA, { email: "marc@example.test", role: "guardian", profileId: parent, guardianOf: child });
  expect(await welcomeView(db, token)).toMatchObject({ child: "Lina Enfant", role: "guardian" });
  const userId = await account("marc@example.test");
  await welcomeComplete(db, token, userId, { ...base, firstName: "Marc", lastName: "Parent", classification: "PF2" });
  expect((await db.query("SELECT kind,can_view,can_edit FROM guardian_relationship WHERE guardian_profile_id=$1 AND subject_profile_id=$2 AND revoked_at IS NULL", [parent, child])).rows).toEqual([
    { kind: "legal_verified", can_view: true, can_edit: true },
  ]);
  // The club information concerns the child.
  expect((await db.query("SELECT classification FROM player_sport_profile WHERE profile_id=$1", [child])).rows[0].classification).toBe("PF2");
});

it("lets the person say it is not their role, and the club send it again", async () => {
  const file = (await create(clubA, presidentA, { fullName: "Eva Erreur" })).id!;
  const { id, token } = await invite(clubA, presidentA, { email: "eva@example.test", role: "player", profileId: file });
  await welcomeDispute(db, token, "Je suis la maman, pas la joueuse");
  expect(await welcomeView(db, token)).toEqual({ state: "disputed" });
  expect((await db.query("SELECT disputed_note FROM invitation WHERE id=$1", [id])).rows[0].disputed_note).toBe("Je suis la maman, pas la joueuse");
  // Another club cannot touch it; the club itself sends a new link and the old one stops.
  await expect(execute(db, presidentB, { action: "resendInvitation", id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(execute(db, coachA, { action: "resendInvitation", id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await execute(db, presidentA, { action: "resendInvitation", id });
  const rows = (await db.query("SELECT id,revoked_at IS NOT NULL AS revoked,resent_from,profile_id FROM invitation WHERE email='eva@example.test' ORDER BY created_at")).rows;
  expect(rows).toEqual([
    { id, revoked: true, resent_from: null, profile_id: file },
    expect.objectContaining({ revoked: false, resent_from: id, profile_id: file }),
  ]);
  expect(await welcomeView(db, token)).toEqual({ state: "invalid" });
});

it("refuses a link from another club's token or a broken one", async () => {
  expect(await welcomeView(db, "nope")).toEqual({ state: "invalid" });
  expect(await welcomeView(db, "a".repeat(64))).toEqual({ state: "invalid" });
  const file = (await create(clubB, presidentB, { fullName: "Club B Joueur" })).id!;
  const { token } = await invite(clubB, presidentB, { email: "b@example.test", role: "player", profileId: file });
  expect(await welcomeView(db, token)).toMatchObject({ organization: "Club B" });
  // A file of club A can never be named in club B's invitation.
  const foreign = (await create(clubA, presidentA, { fullName: "Secret Club A" })).id!;
  await expect(invite(clubB, presidentB, { email: "x@example.test", role: "player", profileId: foreign })).rejects.toBeTruthy();
  expect((await db.query("SELECT token_hash FROM invitation WHERE token_hash=$1", [hashToken(token)])).rowCount).toBe(1);
});

it("sends one invitation per line with an address when importing", async () => {
  const r = await peopleExecute(
    db,
    presidentA,
    {
      action: "importPlayers",
      teamId: null,
      invite: true,
      rows: [
        { fullName: "Import Adulte", birthDate: yearsAgo(30), email: "imp1@example.test", phone: "", joinedOn: null, position: "", jerseyNumber: null },
        { fullName: "Import Enfant", birthDate: yearsAgo(9), email: "", phone: "", joinedOn: null, position: "", jerseyNumber: null, guardianName: "Parent Import", guardianEmail: "imp-parent@example.test" },
        { fullName: "Import Sans", birthDate: yearsAgo(30), email: "", phone: "", joinedOn: null, position: "", jerseyNumber: null },
      ],
    },
    clubA,
  );
  expect(r.invited).toBe(2);
  expect((await db.query("SELECT role FROM invitation WHERE email IN ('imp1@example.test','imp-parent@example.test') ORDER BY email")).rows.map((x) => x.role)).toEqual(["guardian", "player"]);
});

it("invites the applicant when a registration is accepted", async () => {
  const applicantId = await account("famille@example.test");
  await db.query('UPDATE "user" SET name=$2 WHERE id=$1', [applicantId, "Julie Famille"]);
  const form = (await db.query("INSERT INTO registration_form(organization_id,season_id,title,published) VALUES($1,$2,'Inscriptions',true) RETURNING id", [clubA, season])).rows[0].id;
  const application = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,status,submitted_at,subject_kind) VALUES($1,$2,$3,$4,'Tom Famille',$5,'fr','{\"fields\":[]}','review',now(),'represented') RETURNING id,version",
      [clubA, form, applicantId, season, yearsAgo(11)],
    )
  ).rows[0];
  await registrationExecute(
    db,
    presidentA,
    { action: "decision", id: application.id, expectedVersion: application.version, status: "accepted", message: "", confirmDuplicate: false, acceptOverCapacity: false },
    clubA,
  );
  const sent = (await db.query("SELECT role,guardian_of FROM invitation WHERE email='famille@example.test'")).rows;
  const child = (await db.query("SELECT profile_id FROM registration_application WHERE id=$1", [application.id])).rows[0].profile_id;
  expect(sent).toEqual([{ role: "guardian", guardian_of: child }]);
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1 AND email='famille@example.test'", [clubB])).rows[0].n).toBe(0);
});
