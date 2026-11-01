import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { careFor, incidentCommand, incidentFile, incidentPdf, incidentPurge, incidentsExecute, incidentsView, incidentTick } from "../../src/domains/incidents/service";
import { seal } from "../../src/domains/notifications/crypto";

/**
 * B5: incidents. A coach reports a fall of a minor with her chair damaged:
 * the parents are told, the chair's log gets an intervention, the coach
 * sees the care instructions; he sees the facts but not the health, which
 * the president reads (logged); the parent sees the facts of his child; a
 * coach of another team sees nothing; a claim past its deadline is flagged
 * and reminded once; papers and photos by right; the first-aid kit; the
 * retention; two clubs apart.
 */
const schema = "b5incidents_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, otherCoach: Principal, parent: Principal;
let team: string, other: string, ana: string, zoe: string, chair: string, incident: string;
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");

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
async function player(name: string, teamId: string, birth: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,'{player}') RETURNING id", [clubA, person, name, birth])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, teamId, id]);
  return id;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => incidentsExecute(db, p, incidentCommand.parse(cmd), org) as Promise<{ id: string; parentsTold?: number }>;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  other = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Ours') RETURNING id", [clubA, season])).rows[0].id;
  coach = (await actor(clubA, "coach", "Coach Aigles", team)).p;
  otherCoach = (await actor(clubA, "coach", "Coach Ours", other)).p;
  ana = await player("Ana Peeters", team, "2012-03-01");
  zoe = await player("Zoé Martin", other, "1995-05-05");
  chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Strike d''Ana','in_use','player') RETURNING id", [clubA])).rows[0].id;
  // Ana's care instruction (sealed like the trips do).
  const care = randomUUID();
  await db.query("INSERT INTO care_instruction(id,organization_id,profile_id,moment,ciphertext,created_by) VALUES($1,$2,$3,'as_needed',$4,$5)", [care, clubA, ana, seal({ title: "Ventoline", details: "Deux bouffées en cas de gêne" }, "care:" + care), president.userId]);
  const pa = await actor(clubA, "guardian", "Parent d'Ana");
  parent = pa.p;
  const guardian = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent d''Ana') RETURNING id", [clubA, pa.person])).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
    [clubA, guardian, ana, president.userId],
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets a coach report a minor's fall: parents told, chair logged, care shown", async () => {
  const care = await careFor(db, coach, [ana]);
  expect(care.map((c) => c.title)).toEqual(["Ventoline"]);
  expect((await db.query("SELECT count(*)::int AS n FROM sensitive_access_log WHERE kind='incident_care' AND profile_id=$1", [ana])).rows[0].n).toBe(1);
  const r = await run(coach, {
    action: "declare",
    occurredAt: today() + "T10:15",
    context: "training",
    kind: "chair_damage",
    place: "Salle du club",
    circumstances: "Chute lors d'un transfert, le repose-pied s'est plié",
    witnesses: "Coach Aigles",
    profileIds: [ana],
    chairId: chair,
    health: { injuries: "Hématome au genou", firstAid: "Glace", care: "", hospital: false },
    photos: [{ name: "genou.png", type: "image/png", data: png }],
  });
  incident = r.id;
  expect(r.parentsTold).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND resource_id=$2", [parent.userId, incident])).rows[0].n).toBe(1);
  const i = (await db.query("SELECT intervention_id,health_ciphertext,insurance_deadline::text FROM incident WHERE id=$1", [incident])).rows[0];
  expect(i.health_ciphertext).not.toContain("Hématome");
  expect(i.insurance_deadline).toBe(new Date(Date.parse(today() + "T12:00:00Z") + 8 * 86400000).toISOString().slice(0, 10));
  expect((await db.query("SELECT kind FROM chair_intervention WHERE id=$1", [i.intervention_id])).rows[0].kind).toBe("breakdown");
  expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [chair])).rows[0].status).toBe("maintenance");
  // Only for the players of his teams; never in the future.
  await expect(run(otherCoach, { action: "declare", occurredAt: today() + "T10:15", context: "training", kind: "fall", circumstances: "Chute en jouant", profileIds: [ana] })).rejects.toMatchObject({ code: "NOT_DECLARABLE" });
  await expect(run(coach, { action: "declare", occurredAt: "2099-01-01T10:00", context: "training", kind: "fall", circumstances: "Chute en jouant", profileIds: [ana] })).rejects.toMatchObject({ code: "INVALID_DATE" });
});

it("shows the facts to the coach and the parent, the health only to the authorised", async () => {
  const c = (await incidentsView(db, coach)).incidents.find((x) => x.id === incident)!;
  expect(c.circumstances).toContain("transfert");
  expect(c.health).toBeNull();
  expect(c.insurance).toBeNull();
  await expect(incidentFile(db, coach, (await db.query("SELECT id FROM incident_file WHERE incident_id=$1", [incident])).rows[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const pa = (await incidentsView(db, parent)).incidents;
  expect(pa.map((x) => x.id)).toEqual([incident]);
  expect(pa[0].health).toBeNull();
  expect((await incidentsView(db, otherCoach)).incidents).toEqual([]);
  const before = (await db.query("SELECT count(*)::int AS n FROM sensitive_access_log WHERE kind='incident_health'")).rows[0].n;
  const p = (await incidentsView(db, president)).incidents.find((x) => x.id === incident)!;
  expect(p.health?.value).toEqual({ injuries: "Hématome au genou", firstAid: "Glace", care: "", hospital: false });
  expect(p.health?.photos.map((f) => f.name)).toEqual(["genou.png"]);
  expect(p.people).toEqual([{ id: ana, full_name: "Ana Peeters", minor: true }]);
  expect((await db.query("SELECT count(*)::int AS n FROM sensitive_access_log WHERE kind='incident_health'")).rows[0].n).toBe(before + 1);
  const photo = await incidentFile(db, president, p.health!.photos[0].id);
  expect(photo.type).toBe("image/png");
  // The coach may not write the health part afterwards.
  await expect(run(coach, { action: "health", id: incident, health: { injuries: "x" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("flags a claim past its deadline and reminds the managers once", async () => {
  await db.query("UPDATE incident SET occurred_at=now()-interval '10 days',insurance_deadline=CURRENT_DATE-2 WHERE id=$1", [incident]);
  const v = await incidentsView(db, president);
  expect(v.incidents.find((x) => x.id === incident)!.insurance).toMatchObject({ status: "to_declare", state: "overdue" });
  expect(await incidentTick(db)).toBe(1);
  expect(await incidentTick(db)).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND resource_id=$2", [president.userId, incident])).rows[0].n).toBe(1);
  const version = v.incidents.find((x) => x.id === incident)!.version;
  await expect(run(coach, { action: "insurance", id: incident, expectedVersion: version, status: "sent", claimReference: "", sentOn: null, claimedCents: null, reimbursedCents: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(president, { action: "insurance", id: incident, expectedVersion: version, status: "sent", claimReference: "SIN-2026-14", sentOn: null, claimedCents: 12000, reimbursedCents: null });
  const after = (await incidentsView(db, president)).incidents.find((x) => x.id === incident)!.insurance!;
  expect(after).toMatchObject({ status: "sent", state: "done", claim_reference: "SIN-2026-14", sent_on: today(), claimed_cents: 12000 });
  const paper = await run(president, { action: "file", id: incident, kind: "piece", name: "certificat.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.7 test").toString("base64") });
  expect((await incidentFile(db, president, paper.id)).name).toBe("certificat.pdf");
  await expect(incidentFile(db, coach, paper.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(Buffer.from(await incidentPdf(db, president, incident)).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(incidentPdf(db, coach, incident)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("reminds the first-aid kit, counts without names, and keeps the club's settings", async () => {
  await db.query("INSERT INTO equipment_item(organization_id,name,category,expires_on) VALUES($1,'Compresses stériles','first_aid',CURRENT_DATE-1)", [clubA]);
  const v = await incidentsView(db, president);
  expect(v.firstAid.map((x) => x.name)).toEqual(["Compresses stériles"]);
  await incidentTick(db);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1 AND kind='automation' AND resource_id IN (SELECT id::text FROM equipment_item)", [president.userId])).rows[0].n).toBe(1);
  expect(v.stats).toMatchObject({ total: 1, minors: 1, byKind: { chair_damage: 1 }, byContext: { training: 1 } });
  expect((await incidentsView(db, coach)).stats).toBeNull();
  await run(president, { action: "settings", insurerName: "Ethias", insurerPolicy: "45.123.456", insurerEmail: "sinistres@example.test", days: 10 });
  expect((await incidentsView(db, president)).settings).toEqual({ insurer_name: "Ethias", insurer_policy: "45.123.456", insurer_email: "sinistres@example.test", days: 10 });
  await expect(run(coach, { action: "settings", insurerName: "X", insurerPolicy: "", insurerEmail: "", days: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  // An adult involved: no parent to tell.
  expect((await run(otherCoach, { action: "declare", occurredAt: today() + "T09:00", context: "match", kind: "malaise", circumstances: "Malaise à la mi-temps", profileIds: [zoe] })).parentsTold).toBe(0);
});

it("keeps two clubs apart", async () => {
  expect((await incidentsView(db, presidentB)).incidents).toEqual([]);
  await expect(run(presidentB, { action: "insurance", id: incident, expectedVersion: 1, status: "refused", claimReference: "", sentOn: null, claimedCents: null, reimbursedCents: null }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(incidentPdf(db, presidentB, incident)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "declare", occurredAt: today() + "T09:00", context: "match", kind: "fall", circumstances: "Pas chez nous", profileIds: [ana] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(careFor(db, presidentB, [ana])).resolves.toEqual([]);
});

it("erases the health part after 5 years and the incident after 10", async () => {
  await db.query("UPDATE incident SET occurred_at=now()-interval '6 years' WHERE id=$1", [incident]);
  await incidentPurge(db);
  expect((await db.query("SELECT health_ciphertext FROM incident WHERE id=$1", [incident])).rows[0].health_ciphertext).toBeNull();
  expect((await db.query("SELECT kind FROM incident_file WHERE incident_id=$1", [incident])).rows.map((r) => r.kind)).toEqual(["piece"]);
  await db.query("UPDATE incident SET occurred_at=now()-interval '11 years' WHERE id=$1", [incident]);
  await incidentPurge(db);
  expect((await db.query("SELECT count(*)::int AS n FROM incident WHERE id=$1", [incident])).rows[0].n).toBe(0);
});
