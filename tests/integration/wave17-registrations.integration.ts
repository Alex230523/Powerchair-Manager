import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { publicForm, registrationExecute, registrationView } from "../../src/domains/registrations/service";
import { undoExecute } from "../../src/domains/undo/service";
import { platformTemplate } from "../../src/domains/registrations/templates";

/**
 * Wave 17 (F1): forms open to the public between optional dates, archived,
 * saved as club templates; a decision is undone completely within the
 * window, and nothing is emailed meanwhile. Two clubs.
 */
const schema = "w17reg_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, candidate: Principal, season: string, team: string;
const yearsAgo = (n: number) => `${new Date().getFullYear() - n}-01-15`;
const brussels = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400000));

async function actor(org: string | null, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Julie Famille " + role, userId + "@example.test"]);
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
async function form(org: string, by: Principal, published = true) {
  const t = platformTemplate("player", "fr");
  return (await registrationExecute(db, by, { action: "form", seasonId: season, title: "Inscriptions 2026-27", description: t.description, fields: [], published, capacity: null }, org)).id!;
}
async function submitted(formId: string, name: string) {
  return (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,answers,status,submitted_at,subject_kind) VALUES($1,$2,$3,$4,$5,$6,'fr',$7,$8,'submitted',now(),'represented') RETURNING id,version",
      [
        clubA,
        formId,
        candidate.userId,
        season,
        name,
        yearsAgo(11),
        JSON.stringify({ title: "Inscriptions", fields: platformTemplate("player", "fr").fields }),
        JSON.stringify({ email: "famille@example.test", phone: "+32 470 00 00 00", emergency: "Papa, 0470 11 11 11", jersey_size: "M", joystick: ["Main droite"] }),
      ],
    )
  ).rows[0] as { id: string; version: number };
}
const decide = (a: { id: string; version: number }, status: string, more: Record<string, unknown> = {}) =>
  registrationExecute(db, presidentA, { action: "decision", id: a.id, expectedVersion: a.version, status, message: "", confirmDuplicate: false, acceptOverCapacity: false, ...more } as never, clubA);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  candidate = await actor(null, "parent");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("opens a form to the public between its dates, and never once archived", async () => {
  const id = await form(clubA, presidentA, false);
  await expect(publicForm(db, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await registrationExecute(db, presidentA, { action: "publish", id, published: true, opensOn: null, closesOn: null }, clubA);
  expect((await publicForm(db, id)).title).toBe("Inscriptions 2026-27");
  // Closed since yesterday, then opening tomorrow: the public sees nothing.
  await registrationExecute(db, presidentA, { action: "publish", id, published: true, opensOn: brussels(-10), closesOn: brussels(-1) }, clubA);
  await expect(publicForm(db, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    registrationExecute(db, candidate, { action: "draft", formId: id, subjectKind: "represented", subjectName: "Tom Test", birthDate: yearsAgo(10), locale: "fr", answers: {}, website: "" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await registrationExecute(db, presidentA, { action: "publish", id, published: true, opensOn: brussels(1), closesOn: null }, clubA);
  await expect(publicForm(db, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(registrationExecute(db, presidentA, { action: "publish", id, published: true, opensOn: brussels(5), closesOn: brussels(1) }, clubA)).rejects.toMatchObject({
    code: "INVALID_DATES",
  });
  await registrationExecute(db, presidentA, { action: "publish", id, published: true, opensOn: brussels(0), closesOn: brussels(0) }, clubA);
  expect((await publicForm(db, id)).id).toBe(id);
  // Archived: closed, and listed last as such.
  await registrationExecute(db, presidentA, { action: "archive", id, archived: true }, clubA);
  await expect(publicForm(db, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const listed = (await registrationView(db, presidentA, true)).forms!.find((f: { id: string }) => f.id === id) as { archived: boolean; open: boolean; applications: number };
  expect(listed).toMatchObject({ archived: true, open: false, applications: 0 });
  // Another club cannot touch it.
  await expect(registrationExecute(db, presidentB, { action: "archive", id, archived: false }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(registrationExecute(db, presidentB, { action: "publish", id, published: false, opensOn: null, closesOn: null }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("saves a form as a template of the club only", async () => {
  const id = await form(clubA, presidentA);
  const tpl = (await registrationExecute(db, presidentA, { action: "saveTemplate", formId: id, name: "Notre inscription" }, clubA)).id;
  const mine = (await registrationView(db, presidentA, true)).templates as { id: string; name: string }[];
  expect(mine.map((t) => t.name)).toEqual(["Notre inscription"]);
  expect((await registrationView(db, presidentB, true)).templates).toEqual([]);
  await expect(registrationExecute(db, presidentB, { action: "saveTemplate", formId: id, name: "Copie" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(registrationExecute(db, presidentB, { action: "deleteTemplate", id: tpl }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await registrationExecute(db, presidentA, { action: "deleteTemplate", id: tpl }, clubA);
  expect((await registrationView(db, presidentA, true)).templates).toEqual([]);
});

it("accepts, emails nothing during the window, and the undo puts everything back", async () => {
  const id = await form(clubA, presidentA);
  const a = await submitted(id, "Lucas Martin");
  const done = (await decide(a, "accepted", { teamId: team })) as { id: string; undo: string };
  expect(done.undo).toBeTruthy();
  const accepted = (await db.query("SELECT status,profile_id FROM registration_application WHERE id=$1", [a.id])).rows[0];
  expect(accepted.status).toBe("accepted");
  const profile = accepted.profile_id;
  expect((await db.query("SELECT count(*)::int AS n FROM team_membership WHERE profile_id=$1", [profile])).rows[0].n).toBe(1);
  // The invitation of the parent and the email to the applicant wait for the end of the window.
  const invitations = (await db.query("SELECT id FROM invitation WHERE organization_id=$1", [clubA])).rows;
  expect(invitations).toHaveLength(1);
  const mails = (await db.query("SELECT state,available_at>now()+interval '60 seconds' AS later FROM mail_job WHERE organization_id=$1", [clubA])).rows;
  expect(mails.length).toBeGreaterThan(0);
  expect(mails.every((m) => m.state === "pending" && m.later)).toBe(true);
  // Another club cannot undo it.
  await expect(undoExecute(db, presidentB, { id: done.undo }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await undoExecute(db, presidentA, { id: done.undo }, clubA);
  const back = (await db.query("SELECT status,profile_id,decided_at FROM registration_application WHERE id=$1", [a.id])).rows[0];
  expect(back).toEqual({ status: "submitted", profile_id: null, decided_at: null });
  expect((await db.query("SELECT count(*)::int AS n FROM club_person WHERE id=$1", [profile])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM team_membership WHERE organization_id=$1", [clubA])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1", [clubA])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM registration_followup WHERE application_id=$1", [a.id])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND state<>'cancelled'", [clubA])).rows[0].n).toBe(0);
  // Only the parent's file of the invitation was created: removed too.
  expect((await db.query("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1", [clubA])).rows[0].n).toBe(0);
  const history = (await db.query("SELECT status FROM registration_history WHERE application_id=$1 ORDER BY created_at,id", [a.id])).rows.map((r) => r.status);
  expect(history.slice(-2)).toEqual(["accepted", "undone"]);
  // Once only.
  await expect(undoExecute(db, presidentA, { id: done.undo }, clubA)).rejects.toMatchObject({ code: "UNDO_USED" });
  // The application can be decided again.
  const again = (await db.query("SELECT id,version FROM registration_application WHERE id=$1", [a.id])).rows[0];
  await decide(again, "accepted", { teamId: team });
  expect((await db.query("SELECT status FROM registration_application WHERE id=$1", [a.id])).rows[0].status).toBe("accepted");
});

it("refuses with an optional reason, undoes, and keeps an existing file as it was", async () => {
  const id = await form(clubA, presidentA);
  const a = await submitted(id, "Emma Durand");
  const refused = (await decide(a, "refused", { message: "Plus de place cette saison" })) as { undo: string };
  expect((await db.query("SELECT message FROM registration_history WHERE application_id=$1 AND status='refused'", [a.id])).rows[0].message).toBe("Plus de place cette saison");
  await undoExecute(db, presidentA, { id: refused.undo }, clubA);
  expect((await db.query("SELECT status FROM registration_application WHERE id=$1", [a.id])).rows[0].status).toBe("submitted");
  // Accepting onto an existing file then undoing leaves the file as it was.
  const existing = (
    await db.query(
      "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,status,email) SELECT $1,p.id,'Emma Durand',$2,'inactive',NULL FROM p RETURNING id",
      [clubA, yearsAgo(11)],
    )
  ).rows[0].id;
  const v = (await db.query("SELECT id,version FROM registration_application WHERE id=$1", [a.id])).rows[0];
  const accepted = (await decide(v, "accepted", { profileId: existing })) as { undo: string };
  expect((await db.query("SELECT status,email FROM club_person WHERE id=$1", [existing])).rows[0]).toEqual({ status: "active", email: "famille@example.test" });
  await undoExecute(db, presidentA, { id: accepted.undo }, clubA);
  expect((await db.query("SELECT status,email,directory_roles FROM club_person WHERE id=$1", [existing])).rows[0]).toEqual({ status: "inactive", email: null, directory_roles: [] });
  expect((await db.query("SELECT count(*)::int AS n FROM player_sport_profile WHERE profile_id=$1", [existing])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM player_support_profile WHERE profile_id=$1", [existing])).rows[0].n).toBe(0);
});
