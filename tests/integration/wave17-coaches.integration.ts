import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { filterSchema, peopleExecute, peopleView } from "../../src/domains/people/service";
import { tasksExecute, tasksView } from "../../src/domains/tasks/service";
import { licenceCopy, licenceCopyUpload, licenceExecute, licenceReminderTick, licenceView } from "../../src/domains/licences/service";
import { coachExecute, coachProfileView, coursesExecute, coursesView, requestProof } from "../../src/domains/coaches/service";
import { tutorialExecute, tutorialView } from "../../src/domains/tutorial/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * Wave 17 (O1), in two clubs: tasks by type and « Mes tâches », the
 * coach's licence seen only by the right people, « Formé » after the
 * federation's validation, the invitation of a new coach and the tour.
 */
const schema = "w17coa_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string;
let fedPresident: Principal, presidentA: Principal, coachA: Principal, otherCoachA: Principal, presidentB: Principal;
let coachProfile: string, otherProfile: string;
const day = brusselsDay();
const plus = (n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
/** The coach's own file in the club, linked to their account. */
const fileOf = async (org: string, p: Principal, name: string) =>
  (
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,id,$3,'1990-04-02','{coach}' FROM person WHERE user_id=$2 RETURNING id", [
      org,
      p.userId,
      name,
    ])
  ).rows[0].id as string;
const pdf = new TextEncoder().encode("%PDF-1.7\nattestation");

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [federation])).rows[0].id;
  fedPresident = await actor(federation, "federation_president");
  presidentA = await actor(clubA, "club_president");
  coachA = await actor(clubA, "coach", ["attendance.manage", "people.read"]);
  otherCoachA = await actor(clubA, "coach", ["attendance.manage", "people.read"]);
  presidentB = await actor(clubB, "club_president");
  coachProfile = await fileOf(clubA, coachA, "Camille Coach");
  otherProfile = await fileOf(clubA, otherCoachA, "Noé Adjoint");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps tasks by type, gives a coach their own, and stays inside the club", async () => {
  await tasksExecute(db, presidentA, { action: "create", kind: "transport", title: "Réserver la camionnette", detail: "", dueOn: plus(10), responsibleId: coachProfile } as never, clubA);
  await tasksExecute(db, presidentA, { action: "create", kind: "training", title: "Confirmer la salle", detail: "", dueOn: plus(3), responsibleId: otherProfile } as never, clubA);
  await tasksExecute(db, presidentA, { action: "create", kind: "documents", title: "Rassembler les certificats", detail: "", dueOn: null, responsibleId: null } as never, clubA);
  // A template: every task due so many days before the date.
  const tpl = (
    await tasksExecute(db, presidentA, { action: "saveTemplate", kind: "transport", name: "Transport vers un match", items: [{ title: "Trouver un conducteur", detail: "", daysBefore: 10 }, { title: "Prévoir les chargeurs", detail: "", daysBefore: 2 }] } as never, clubA)
  ) as { id: string };
  const made = (await tasksExecute(db, presidentA, { action: "fromTemplate", templateId: tpl.id, date: "2026-12-12", responsibleId: coachProfile, eventId: null, matchId: null, tripId: null, obligationId: null, chairId: null } as never, clubA)) as { ids: string[] };
  expect(made.ids).toHaveLength(2);
  const all = await tasksView(db, presidentA);
  expect(all.tasks.filter((t) => t.kind === "transport").map((t) => [t.title, t.due_on])).toEqual(
    expect.arrayContaining([
      ["Trouver un conducteur", "2026-12-02"],
      ["Prévoir les chargeurs", "2026-12-10"],
    ]),
  );
  // A1: the application's own tasks (the annual accounts) come on top.
  expect(new Set(all.tasks.filter((t) => !t.source_kind).map((t) => t.kind))).toEqual(new Set(["transport", "training", "documents"]));
  // The coach sees only the tasks given to them, and ticks them.
  const mine = await tasksView(db, coachA);
  expect(mine.can.manage).toBe(false);
  expect(mine.tasks.map((t) => t.title).sort()).toEqual(["Prévoir les chargeurs", "Réserver la camionnette", "Trouver un conducteur"]);
  const van = mine.tasks.find((t) => t.title === "Réserver la camionnette")!;
  await tasksExecute(db, coachA, { action: "done", id: van.id, done: true } as never, clubA);
  expect((await tasksView(db, presidentA)).tasks.find((t) => t.id === van.id)!.status).toBe("done");
  // Not someone else's, and nothing for somebody else.
  const room = all.tasks.find((t) => t.title === "Confirmer la salle")!;
  await expect(tasksExecute(db, coachA, { action: "done", id: room.id, done: true } as never, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(tasksExecute(db, coachA, { action: "create", kind: "transport", title: "Pour Noé", detail: "", dueOn: null, responsibleId: otherProfile } as never, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await tasksExecute(db, coachA, { action: "create", kind: "training", title: "Préparer mes fiches", detail: "", dueOn: null, responsibleId: coachProfile } as never, clubA);
  // Club B sees none of club A's tasks and cannot touch them.
  expect((await tasksView(db, presidentB)).tasks.filter((t) => !t.source_kind)).toEqual([]);
  await expect(tasksExecute(db, presidentB, { action: "delete", id: room.id } as never, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("shows the licence only to the coach, the president and trip organisers, declared then checked", async () => {
  await licenceExecute(db, coachA, { action: "save", profileId: coachProfile, categories: ["B", "BE"], validUntil: plus(20) }, clubA);
  await licenceCopyUpload(db, coachA, coachProfile, { name: "permis.pdf", bytes: pdf }, clubA);
  const seen = await licenceView(db, presidentA, coachProfile);
  expect(seen.licence).toMatchObject({ categories: ["B", "BE"], declared_by_self: true, verified_on: null, copy_filename: "permis.pdf" });
  expect(seen.can.verify).toBe(true);
  expect((await licenceCopy(db, presidentA, coachProfile)).media_type).toBe("application/pdf");
  // Another coach of the club, the other club: nothing.
  await expect(licenceView(db, otherCoachA, coachProfile)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(licenceCopy(db, otherCoachA, coachProfile)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(licenceView(db, presidentB, coachProfile)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Someone who plans the club's trips (calendar.manage) checks it; the coach cannot.
  const planner = await actor(clubA, "coach", ["calendar.manage"]);
  await licenceExecute(db, planner, { action: "verify", profileId: coachProfile, verified: true }, clubA);
  expect((await licenceView(db, coachA, coachProfile)).licence!.verified_on).toBe(day);
  await expect(licenceExecute(db, coachA, { action: "verify", profileId: coachProfile, verified: false }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // A change by the coach sends it back to « Déclaré ».
  await licenceExecute(db, coachA, { action: "save", profileId: coachProfile, categories: ["B"], validUntil: plus(20) }, clubA);
  expect((await licenceView(db, coachA, coachProfile)).licence!.verified_on).toBeNull();
  // Coach profile: the licence and the « À faire » tab for the coach and the president, not for another coach.
  expect((await coachProfileView(db, coachA, coachProfile)).can).toMatchObject({ licence: true, tasks: true, self: true, request: true });
  expect((await coachProfileView(db, presidentA, coachProfile)).can).toMatchObject({ licence: true, tasks: true, self: false });
  expect((await coachProfileView(db, otherCoachA, coachProfile)).can).toMatchObject({ licence: false, tasks: false, request: false });
});

it("reminds the coach once, 30 days before the licence expires", async () => {
  await db.query("DELETE FROM mail_job WHERE kind='funding_task'");
  expect(await licenceReminderTick(db)).toBe(1);
  const mail = (await db.query("SELECT recipient_user_id,resource_type,resource_id FROM mail_job WHERE kind='funding_task'")).rows;
  expect(mail).toEqual([{ recipient_user_id: coachA.userId, resource_type: "license", resource_id: coachProfile }]);
  expect(await licenceReminderTick(db)).toBe(0);
});

it("shows « Formé » once the federation validates the course the coach asked for", async () => {
  const course = (await coursesExecute(db, fedPresident, { action: "createCourse", title: "Coach niveau 1", level: "1", description: "", hours: 12, validityYears: null }, federation)) as { id: string };
  const status = async () => {
    const v = await peopleView(db, presidentA, filterSchema.parse({ status: "all", directoryRole: "coach" }));
    return (v.profiles.find((p) => p.id === coachProfile) as { training: unknown }).training;
  };
  expect(await status()).toEqual({ status: "none" });
  // The coach asks for their own course, with a certificate; not for a colleague.
  const asked = (await coachExecute(db, coachA, { action: "requestCourse", profileId: coachProfile, courseId: course.id, note: "Suivie en juin" }, clubA, { name: "attestation.pdf", bytes: pdf })) as { id: string };
  await expect(coachExecute(db, coachA, { action: "requestCourse", profileId: otherProfile, courseId: course.id, note: "" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await status()).toEqual({ status: "pending", title: "Coach niveau 1" });
  const request = (await coursesView(db, fedPresident)).requests.find((r) => r.id === asked.id)!;
  expect(request.proof_filename).toBe("attestation.pdf");
  expect((await requestProof(db, fedPresident, asked.id)).media_type).toBe("application/pdf");
  await coursesExecute(db, fedPresident, { action: "decide", id: asked.id, decision: "approved", note: "", completedOn: "2026-06-20" }, federation);
  expect(await status()).toEqual({ status: "trained", title: "Coach niveau 1", on: "2026-06-20" });
});

it("invites a new coach by email", async () => {
  const created = (await peopleExecute(
    db,
    presidentA,
    { action: "createPerson", fullName: "Lou Nouvelle", birthDate: "1988-09-09", email: "lou@example.test", phone: "", joinedOn: day, directoryRoles: ["coach"], invite: true } as never,
    clubA,
  )) as { id: string };
  const invitation = (await db.query("SELECT id,role,profile_id FROM invitation WHERE organization_id=$1 AND email='lou@example.test'", [clubA])).rows;
  expect(invitation).toEqual([{ id: expect.any(String), role: "coach", profile_id: created.id }]);
  // The mail is queued for the address given (its content is encrypted).
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='invitation' AND resource_id=$1", [invitation[0].id])).rows[0].n).toBe(1);
});

it("shows the coach's tour once, then again on demand", async () => {
  expect(await tutorialView(db, coachA)).toEqual({ audience: "coach", seen: false });
  await tutorialExecute(db, coachA, { action: "seen" });
  expect(await tutorialView(db, coachA)).toEqual({ audience: "coach", seen: true });
  await tutorialExecute(db, coachA, { action: "reset" });
  expect(await tutorialView(db, coachA)).toEqual({ audience: "coach", seen: false });
  // Each account its own; nothing for a president today.
  expect(await tutorialView(db, otherCoachA)).toEqual({ audience: "coach", seen: false });
  expect(await tutorialView(db, presidentA)).toEqual({ audience: null, seen: true });
});
