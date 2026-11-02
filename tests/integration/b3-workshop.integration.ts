import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { chairReport, workshopCommand, workshopExecute, workshopView } from "../../src/domains/equipment/workshop";
import { chairReportPdf } from "../../src/domains/equipment/chair-report";
import { workshopCopy } from "../../src/components/workshop-copy";

/**
 * B3: the chairs' workshop. A breakdown reported by a parent the day before
 * a match (the chair out of service, its booking released, a task, the
 * managers told, the player shown without a chair); the same club chair
 * asked for two players; a battery replaced; a subsidised chair with its
 * repair invoice and its report; a loan not given back; speed checks; a
 * coach limited to his team; two clubs apart.
 */
const schema = "b3workshop_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, otherCoach: Principal, parent: Principal;
let team: string, other: string, event: string, ana: string, bilal: string, own: string, spare: string, spare2: string, user: string;

async function actor(org: string, role: string, name: string, teamId: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, teamId])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(name: string, teamId: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2012-01-01','{player}') RETURNING id", [clubA, person, name])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, teamId, id]);
  return id;
}
async function chair(name: string, status = "available", org = clubA) {
  return (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,$2,$3,'club') RETURNING id", [org, name, status])).rows[0].id as string;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => workshopExecute(db, p, workshopCommand.parse(cmd), org) as Promise<{ id: string }>;
const status = async (id: string) => (await db.query("SELECT status FROM equipment_chair WHERE id=$1", [id])).rows[0].status as string;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  user = president.userId;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  other = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Ours') RETURNING id", [clubA, season])).rows[0].id;
  coach = (await actor(clubA, "coach", "Coach Aigles", team)).p;
  otherCoach = (await actor(clubA, "coach", "Coach Ours", other)).p;
  ana = await player("Ana", team);
  bilal = await player("Bilal", team);
  // Ana plays in her own chair; two club chairs are free.
  own = await chair("Strike d'Ana", "in_use");
  await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-5,true,$4)", [clubA, own, ana, user]);
  spare = await chair("Club 1");
  spare2 = await chair("Club 2");
  // Tomorrow's match, both invited.
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, user])).rows[0].id;
  event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,'Match contre les Lions','friendly','Europe/Brussels',now()+interval '1 day',now()+interval '1 day 2 hours','2026-11-02T14:00','2026-11-02T16:00',$3,$4,'organization') RETURNING id",
      [clubA, series, team, user],
    )
  ).rows[0].id;
  const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '12 hours') RETURNING id", [clubA, event])).rows[0].id;
  for (const p of [ana, bilal]) await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response) VALUES($1,$2,$3,'present')", [clubA, register, p]);
  // Ana's parent.
  const pa = await actor(clubA, "guardian", "Parent d'Ana");
  parent = pa.p;
  const guardian = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent d''Ana') RETURNING id", [clubA, pa.person])).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)",
    [clubA, guardian, ana, user],
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows who lacks a chair and books a club chair, once per chair and player", async () => {
  const v = await workshopView(db, president);
  const e = v.availability.find((x) => x.id === event)!;
  expect(e.missing).toEqual([bilal]);
  expect(e.free.map((c) => c.name)).toEqual(["Club 1", "Club 2"]);
  await run(president, { action: "book", chairId: spare, eventId: event, profileId: bilal });
  // The same chair for Ana: refused, never moved.
  await expect(run(president, { action: "book", chairId: spare, eventId: event, profileId: ana })).rejects.toMatchObject({ code: "CHAIR_TAKEN" });
  const after = (await workshopView(db, president)).availability.find((x) => x.id === event)!;
  expect(after.missing).toEqual([]);
  expect(after.free.map((c) => c.name)).toEqual(["Club 2"]);
  // The coach of the team sees it; the other coach does not, and may not book.
  expect((await workshopView(db, coach)).availability.map((x) => x.id)).toEqual([event]);
  expect((await workshopView(db, otherCoach)).availability).toEqual([]);
  await expect(run(otherCoach, { action: "book", chairId: spare2, eventId: event, profileId: ana })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("takes a chair out of service at once when a parent reports a breakdown the day before", async () => {
  const photo = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
  const r = await run(parent, { action: "report", chairId: own, description: "Le moteur gauche ne répond plus", photo: { type: "image/png", data: photo } });
  expect(await status(own)).toBe("out_of_service");
  const report = (await db.query("SELECT status,task_id,photo_type FROM chair_report WHERE id=$1", [r.id])).rows[0];
  expect(report).toMatchObject({ status: "open", photo_type: "image/png" });
  expect((await db.query("SELECT title FROM task WHERE id=$1", [report.task_id])).rows[0].title).toBe("Panne : Strike d'Ana");
  // The president is told in the application and by e-mail.
  expect((await db.query("SELECT count(*)::int AS n FROM app_notification WHERE recipient_user_id=$1 AND resource_id=$2", [user, r.id])).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND resource_id=$2", [user, r.id])).rows[0].n).toBe(1);
  // Ana now lacks a chair for tomorrow; the alert is there.
  const v = await workshopView(db, president);
  expect(v.availability.find((x) => x.id === event)!.missing).toEqual([ana]);
  expect(v.alerts.filter((a) => a.kind === "report").map((a) => a.chair)).toEqual([own]);
  // A fake photo is refused; another club's chair is not found for the parent.
  await expect(run(parent, { action: "report", chairId: own, description: "Encore", photo: { type: "image/jpeg", data: photo } })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  await expect(run(parent, { action: "report", chairId: spare2, description: "Pas mon fauteuil" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The repair gives it back, and closes the report.
  await run(president, { action: "intervention", chairId: own, occurredOn: new Date().toISOString().slice(0, 10), kind: "repair", diagnosis: "Connecteur", costCents: 8000, daysOut: 1, backInService: true });
  expect(await status(own)).toBe("in_use");
  expect((await db.query("SELECT status FROM chair_report WHERE id=$1", [r.id])).rows[0].status).toBe("closed");
});

it("releases the bookings of a chair that breaks down", async () => {
  await run(president, { action: "report", chairId: spare, description: "Batterie gonflée" });
  expect((await db.query("SELECT status,released_reason FROM chair_booking WHERE chair_id=$1", [spare])).rows[0]).toEqual({ status: "released", released_reason: "breakdown" });
  expect((await workshopView(db, president)).availability.find((x) => x.id === event)!.missing).toEqual([bilal]);
});

it("replaces a battery and logs it", async () => {
  const b = await run(president, { action: "component", kind: "battery", label: "Lithium 24 V", serial: "B-1", inServiceOn: "2024-09-01", chairId: own });
  const n = await run(president, { action: "replaceComponent", id: b.id, on: "2026-10-30", label: "Lithium 24 V (neuve)", serial: "B-2" });
  const rows = (await db.query("SELECT id,retired_on::text,replaced_by FROM chair_component WHERE chair_id=$1 ORDER BY created_at", [own])).rows;
  expect(rows).toEqual([
    { id: b.id, retired_on: "2026-10-30", replaced_by: n.id },
    { id: n.id, retired_on: null, replaced_by: null },
  ]);
  expect((await db.query("SELECT parts FROM chair_intervention WHERE chair_id=$1 AND kind='battery'", [own])).rows[0].parts).toBe("Lithium 24 V → Lithium 24 V (neuve)");
});

it("follows a subsidised chair, its repair invoice and its cost report", async () => {
  const grant = (await db.query("INSERT INTO grant_application(organization_id,funder,program,status,created_by) VALUES($1,'Province','Sport adapté','granted',$2) RETURNING id", [clubA, user])).rows[0].id;
  await run(president, { action: "chairExtras", chairId: spare2, warrantyUntil: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), purchaseValueCents: 450000, grantId: grant, partnerId: null, potId: null });
  const invoice = (await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE-2,'Facture atelier 12','out','equipment',15000,$2) RETURNING id", [clubA, user])).rows[0].id;
  expect((await workshopView(db, president, spare2)).choices!.expenses.map((x) => x.id)).toContain(invoice);
  await run(president, { action: "intervention", chairId: spare2, occurredOn: "2026-10-28", kind: "repair", diagnosis: "Moteur", transactionId: invoice, daysOut: 4 });
  // The invoice is linked once: it leaves the choices, and a second link fails.
  const v = await workshopView(db, president, spare2);
  expect(v.choices!.expenses.map((x) => x.id)).not.toContain(invoice);
  await expect(run(president, { action: "intervention", chairId: spare2, occurredOn: "2026-10-28", kind: "repair", transactionId: invoice })).rejects.toBeTruthy();
  expect(v.chair!.cost).toMatchObject({ purchase: 450000, upkeep: 15000, total: 465000, daysOut: 4 });
  expect(v.chair!.funding.grant).toBe("Province");
  expect(v.alerts.some((a) => a.kind === "warranty" && a.chair === spare2)).toBe(true);
  const report = await chairReport(db, president, spare2);
  expect(report.chair.grant).toBe("Province");
  expect(report.lines.map((l) => l.invoice)).toEqual(["Facture atelier 12"]);
  expect(Buffer.from(chairReportPdf(report, workshopCopy.fr, "fr")).subarray(0, 5).toString()).toBe("%PDF-");
  // A cancelled line leaves the cost.
  const line = (await db.query("SELECT id FROM chair_intervention WHERE chair_id=$1", [spare2])).rows[0].id;
  await run(president, { action: "cancelIntervention", id: line, reason: "Saisie en double" });
  expect((await workshopView(db, president, spare2)).chair!.cost!.upkeep).toBe(0);
  // Only the material managers see the report.
  await expect(chairReport(db, coach, spare2)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("checks speeds against the club's rule", async () => {
  await run(president, { action: "intervention", chairId: spare2, occurredOn: "2026-10-30", kind: "speed_check", speedKmh: 10.4, checker: "Arbitre" });
  let v = await workshopView(db, president, spare2);
  expect(v.chair!.speed.state).toBe("over");
  expect(v.alerts.find((a) => a.kind === "speed" && a.chair === spare2)!.detail).toBe("over");
  await run(president, { action: "speedRules", limitKmh: 10.5, checkDays: 90 });
  v = await workshopView(db, president, spare2);
  expect(v.chair!.speed.state).toBe("ok");
  expect(v.rules).toEqual({ limit: 10.5, days: 90 });
  await expect(run(coach, { action: "speedRules", limitKmh: 15, checkDays: 90 })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("flags a chair lent to another club and not given back", async () => {
  await db.query(
    "INSERT INTO equipment_loan(chair_id,lender_id,borrower_id,starts_on,ends_on,status,initiated_by,created_by) VALUES($1,$2,$3,CURRENT_DATE-10,CURRENT_DATE-1,'ongoing','lender',$4)",
    [spare, clubA, clubB, user],
  );
  const alert = (await workshopView(db, president)).alerts.find((a) => a.kind === "loan")!;
  expect(alert).toMatchObject({ chair: spare, about: "Club 1" });
  expect(alert.detail).toContain("Club B");
});

it("keeps two clubs apart", async () => {
  await expect(workshopView(db, presidentB, own)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "intervention", chairId: own, occurredOn: "2026-10-30", kind: "service" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "report", chairId: own, description: "Pas chez nous" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(chairReport(db, presidentB, own)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const b = await workshopView(db, presidentB);
  expect(b.alerts).toEqual([]);
  expect(b.availability).toEqual([]);
  // The other club's context is refused for a writer of club A.
  await expect(run(president, { action: "speedRules", limitKmh: 9, checkDays: 90 }, clubB)).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});
