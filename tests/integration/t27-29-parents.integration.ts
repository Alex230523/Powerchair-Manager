import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { attendanceExecute, attendanceView } from "../../src/domains/attendance/service";
import { commandSchema } from "../../src/domains/attendance/schema";
import { calendarExecute, calendarFeed } from "../../src/domains/calendar/service";
import { tripExecute, tripDetail } from "../../src/domains/trips/service";
import { tripCommand } from "../../src/domains/trips/schema";
import { documentSign } from "../../src/domains/documents/service";
import { authorizationsExecute, authorizationTick } from "../../src/domains/authorizations/service";
import { billingSplitExecute, familyChildren, familyExecute, familyView } from "../../src/domains/family/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { publicName } from "../../src/domains/integrations/public";
import { publicHallOfFame } from "../../src/domains/awards/service";

/**
 * 27 to 29: a parent of two children in two clubs (« Ma famille », nothing
 * mixed, no other child), the answer for both then changed for one, seen by
 * the other parent with its author; the family feed; an authorization asked
 * by itself when a minor joins a trip, signed and filed, a minor without it
 * shown on the trip; an image right refused that hides the name in public;
 * dues shared 50/50; each parent his own contacts and language.
 */
const schema = "t2729_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, mother: Principal, father: Principal;
let seasonA: string, teamA: string, lucas: string, emma: string, zoe: string, other: string, motherA: string, fatherA: string, motherB: string, event: string;
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("signature")]).toString("base64");

async function account(name: string, locale = "fr") {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id,locale) VALUES($1,$2) RETURNING id", [userId, locale])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { p: { userId, sessionId } as Principal, person };
}
async function mandate(p: Principal, org: string, role: string) {
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [org, p.userId]);
  return (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, p.userId, role])).rows[0].id as string;
}
const use = (p: Principal, mandateId: string) => execute(db, p, { action: "context", mandateId });
async function child(org: string, name: string, birth = "2014-05-01") {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,'{player}') RETURNING id", [org, person, name, birth])).rows[0].id as string;
}
const link = (org: string, guardian: string, subject: string, by: string) =>
  db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
    [org, guardian, subject, by],
  );
let mandates: Record<string, string> = {};

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const pa = await account("Présidente A"),
    pb = await account("Président B");
  presidentA = pa.p;
  presidentB = pb.p;
  await use(presidentA, await mandate(presidentA, clubA, "club_president"));
  await use(presidentB, await mandate(presidentB, clubB, "club_president"));
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [clubB]);
  teamA = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, seasonA])).rows[0].id;
  lucas = await child(clubA, "Lucas Peeters");
  emma = await child(clubA, "Emma Peeters");
  other = await child(clubA, "Autre Enfant");
  zoe = await child(clubB, "Zoé Peeters");
  for (const k of [lucas, emma, other]) await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, teamA, k]);
  // The mother: Lucas and Emma in club A, Zoé in club B. The father: Lucas and Emma, in Dutch.
  const m = await account("Nadia Peeters", "fr"),
    f = await account("Jan Peeters", "nl");
  mother = m.p;
  father = f.p;
  mandates = { motherA: await mandate(mother, clubA, "guardian"), motherB: await mandate(mother, clubB, "guardian"), fatherA: await mandate(father, clubA, "guardian") };
  motherA = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Nadia Peeters') RETURNING id", [clubA, m.person])).rows[0].id;
  motherB = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Nadia Peeters') RETURNING id", [clubB, m.person])).rows[0].id;
  fatherA = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Jan Peeters') RETURNING id", [clubA, f.person])).rows[0].id;
  for (const k of [lucas, emma]) {
    await link(clubA, motherA, k, presidentA.userId);
    await link(clubA, fatherA, k, presidentA.userId);
  }
  await link(clubB, motherB, zoe, presidentB.userId);
  await use(mother, mandates.motherA);
  await use(father, mandates.fatherA);
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,'Entraînement','training','Europe/Brussels',now()+interval '3 days',now()+interval '3 days 2 hours','2026-11-05T18:00','2026-11-05T20:00',$3,$4,'organization') RETURNING id",
      [clubA, series, teamA, presidentA.userId],
    )
  ).rows[0].id;
  await attendanceExecute(db, presidentA, commandSchema.parse({ action: "invite", eventId: event, expectedVersion: null, profiles: [lucas, emma, other], deadline: new Date(Date.now() + 2 * 86400000).toISOString(), minimum: 0 }), clubA);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gathers the children of both clubs, each club apart, and no other child", async () => {
  const kids = (await familyChildren(db, mother)).children;
  expect(kids.map((k) => [k.first, k.club])).toEqual([
    ["Emma", "Club A"],
    ["Lucas", "Club A"],
    ["Zoé", "Club B"],
  ]);
  const v = await familyView(db, mother);
  expect(v.clubs.map((c) => [c.name, c.children.map((k) => k.first)])).toEqual([
    ["Club A", ["Emma", "Lucas"]],
    ["Club B", ["Zoé"]],
  ]);
  const a = v.clubs[0];
  expect(a.current).toBe(true);
  expect(a.events).toHaveLength(1);
  // Only her children's lines; never « Autre Enfant ».
  expect(a.events[0].children.map((k) => k.id).sort()).toEqual([emma, lucas].sort());
  expect(JSON.stringify(v)).not.toContain(other);
  expect(v.clubs[1].events).toEqual([]);
  // The president is no parent: an empty family.
  expect((await familyView(db, presidentA)).clubs).toEqual([]);
});

it("answers for both at once, then changes one; the other parent sees who answered", async () => {
  const kids = (await familyView(db, mother)).clubs[0].events[0].children;
  await attendanceExecute(
    db,
    mother,
    commandSchema.parse({ action: "respondMany", items: kids.map((k) => ({ id: k.invitation!.id, expectedVersion: k.invitation!.version })), response: "present", comment: "" }),
    clubA,
  );
  const lucasInv = (await familyView(db, mother)).clubs[0].events[0].children.find((k) => k.id === lucas)!.invitation!;
  await attendanceExecute(db, mother, commandSchema.parse({ action: "respond", id: lucasInv.id, expectedVersion: lucasInv.version, response: "absent", comment: "Malade", absenceReason: "illness" }), clubA);
  const seen = (await familyView(db, father)).clubs[0].events[0].children;
  expect(seen.map((k) => [k.id === lucas ? "Lucas" : "Emma", k.invitation!.response, k.invitation!.respondedBy]).sort()).toEqual([
    ["Emma", "present", "Nadia Peeters"],
    ["Lucas", "absent", "Nadia Peeters"],
  ]);
  const inv = (await attendanceView(db, father, "2000-01-01", "2100-01-01")).events[0].invitations;
  expect(inv.map((i) => i.responded_by_name)).toEqual(["Nadia Peeters", "Nadia Peeters"]);
  // The other child's invitation cannot be answered with hers.
  const theirs = (await db.query("SELECT id,version FROM attendance_invitation WHERE profile_id=$1", [other])).rows[0];
  await expect(
    attendanceExecute(db, mother, commandSchema.parse({ action: "respondMany", items: [{ id: theirs.id, expectedVersion: theirs.version }], response: "present", comment: "" }), clubA),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("sends the invitations to both parents, each in his own language", async () => {
  const rows = (await db.query("SELECT recipient_user_id,locale FROM mail_job WHERE kind='attendance_update' AND recipient_user_id=ANY($1::text[])", [[mother.userId, father.userId]])).rows;
  const by = new Map(rows.map((r) => [r.recipient_user_id, r.locale]));
  expect(by.get(mother.userId)).toBe("fr");
  expect(by.get(father.userId)).toBe("nl");
});

it("keeps one's own contacts per club, never another's", async () => {
  await familyExecute(db, father, { action: "contacts", organizationId: clubA, email: "jan@example.test", phone: "0470", address: "Rue du Moulin 2, 5000 Namur" });
  expect((await db.query("SELECT postal_address,email FROM club_person WHERE id=$1", [fatherA])).rows[0]).toEqual({ postal_address: "Rue du Moulin 2, 5000 Namur", email: "jan@example.test" });
  expect((await db.query("SELECT postal_address FROM club_person WHERE id=$1", [motherA])).rows[0].postal_address).toBe("");
  await expect(familyExecute(db, father, { action: "contacts", organizationId: clubB, email: "", phone: "", address: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("gives a family calendar feed across both clubs, with the first names", async () => {
  const feed = await calendarExecute(db, mother, { action: "feed", name: "Agenda familial", teamId: null, family: true }, clubA);
  const ics = await calendarFeed(db, (feed as { url: string }).url.split("/").pop()!);
  expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Emma\\, Lucas · Entraînement (Club A)");
  expect(ics).not.toContain("Autre");
});

it("asks the authorization when a minor joins a trip; signed, it is filed for the season", async () => {
  await authorizationsExecute(db, presidentA, {
    action: "save",
    kind: "travel",
    validity: "event",
    onTrips: true,
    texts: { fr: "J'autorise {name} à voyager avec {organization} pendant la saison {season}.", nl: "Ik geef {name} toestemming om met {organization} te reizen.", en: "" },
  });
  const trip = (await db.query("INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Tournoi de Namur','tournament',CURRENT_DATE+10,CURRENT_DATE+11,$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  await tripExecute(db, presidentA, tripCommand.parse({ action: "addParticipants", tripId: trip, people: [{ profileId: lucas, role: "player" }, { profileId: emma, role: "player" }] }), clubA);
  const asked = (await db.query("SELECT r.id,r.kind,r.profile_id,r.document_id,d.category,d.season_id,d.status FROM authorization_request r JOIN club_document d ON d.id=r.document_id WHERE r.trip_id=$1 ORDER BY r.profile_id", [trip])).rows;
  expect(asked).toHaveLength(2);
  expect(asked.every((r) => r.kind === "travel" && r.category === "consent" && r.season_id === seasonA && r.status === "requested")).toBe(true);
  // Both parents are told (a notice each, in their language).
  const told = (await db.query("SELECT recipient_user_id,locale FROM mail_job WHERE resource_id=$1", ["authorization:" + asked[0].id])).rows;
  expect(told.map((r) => r.locale).sort()).toEqual(["fr", "nl"]);
  // A minor without authorization is shown on the trip (a warning, not a block).
  expect((await tripDetail(db, presidentA, trip)).authorizations.missing).toBe(2);
  const lucasDoc = asked.find((r) => r.profile_id === lucas)!;
  const version = (await db.query("SELECT version FROM club_document WHERE id=$1", [lucasDoc.document_id])).rows[0].version;
  await documentSign(db, father, lucasDoc.document_id, { expectedVersion: version, signerName: "Jan Peeters", signature: png, accept: true }, clubA);
  expect((await db.query("SELECT status,answered_by FROM authorization_request WHERE id=$1", [lucasDoc.id])).rows[0]).toEqual({ status: "signed", answered_by: father.userId });
  expect((await db.query("SELECT count(*)::int AS n FROM document_signature WHERE document_id=$1", [lucasDoc.document_id])).rows[0].n).toBe(1);
  const detail = await tripDetail(db, presidentA, trip);
  expect(detail.authorizations.missing).toBe(1);
  expect(detail.authorizations.people.map((p) => [p.name, p.items[0].status])).toEqual([
    ["Emma Peeters", "requested"],
    ["Lucas Peeters", "signed"],
  ]);
  // The mother sees what is left to sign in Ma famille.
  expect((await familyView(db, mother)).clubs[0].authorizations.map((r) => [r.profile_id === lucas ? "Lucas" : "Emma", r.status]).sort()).toEqual([
    ["Emma", "requested"],
    ["Lucas", "signed"],
  ]);
  // After three days without answer, a reminder leaves by itself, once.
  await db.query("UPDATE authorization_request SET requested_at=now()-interval '4 days' WHERE trip_id=$1", [trip]);
  expect(await authorizationTick(db)).toBe(1);
  expect(await authorizationTick(db)).toBe(0);
  // Club B cannot remind club A's requests.
  expect(await authorizationsExecute(db, presidentB, { action: "remind", ids: [asked[0].id] })).toEqual({ sent: 0 });
});

it("hides the name in public when the image right is refused", async () => {
  await authorizationsExecute(db, presidentA, {
    action: "save",
    kind: "image",
    validity: "season",
    onTrips: false,
    texts: { fr: "J'autorise le club {organization} à publier le nom et l'image de {name}.", nl: "", en: "" },
  });
  await db.query("UPDATE club_person SET public_name_consent=true WHERE id=$1", [emma]);
  expect(await authorizationsExecute(db, presidentA, { action: "requestAll", kind: "image" })).toEqual({ sent: 2 });
  const r = (await db.query("SELECT id FROM authorization_request WHERE profile_id=$1 AND kind='image'", [emma])).rows[0];
  // Another family cannot refuse for Emma.
  await expect(authorizationsExecute(db, presidentB, { action: "refuse", id: r.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await authorizationsExecute(db, mother, { action: "refuse", id: r.id });
  const e = (await db.query("SELECT full_name,birth_date::text AS birth_date,public_name_consent FROM club_person WHERE id=$1", [emma])).rows[0];
  expect(publicName(e.full_name, e.birth_date, e.public_name_consent, new Date().toISOString().slice(0, 10))).toBeNull();
  // Her individual prize leaves the public Hall of fame.
  await db.query("INSERT INTO award(organization_id,awarded_on,title,kind,profile_id,publishable,created_by) VALUES($1,CURRENT_DATE,'Meilleure joueuse','individual',$2,true,$3)", [clubA, emma, presidentA.userId]);
  const widget = (await db.query("UPDATE organization SET hall_of_fame_widget=gen_random_uuid() WHERE id=$1 RETURNING hall_of_fame_widget::text AS w", [clubA])).rows[0].w;
  const hall = await publicHallOfFame(db, widget, "Sans saison");
  expect(JSON.stringify(hall)).not.toContain("Emma");
});

it("shares the dues 50/50: each parent sees his share and only his payments", async () => {
  const plan = (
    await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Jeunes',20000,1,CURRENT_DATE+30) RETURNING id", [clubA, seasonA])
  ).rows[0].id;
  const receivable = (
    await db.query(
      "INSERT INTO dues_receivable(organization_id,profile_id,season_id,plan_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Jeunes','{}',20000,0,$5) RETURNING id",
      [clubA, lucas, seasonA, plan, presidentA.userId],
    )
  ).rows[0].id;
  await db.query("INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents) VALUES($1,1,CURRENT_DATE+30,20000)", [receivable]);
  await expect(billingSplitExecute(db, presidentA, { subjectId: lucas, shares: [{ guardianId: motherA, percent: 50 }, { guardianId: fatherA, percent: 40 }] })).rejects.toMatchObject({ code: "SPLIT_TOTAL" });
  await billingSplitExecute(db, presidentA, { subjectId: lucas, shares: [{ guardianId: motherA, percent: 50 }, { guardianId: fatherA, percent: 50 }] });
  // Another club's president cannot set it.
  await expect(billingSplitExecute(db, presidentB, { subjectId: lucas, shares: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await duesExecute(db, presidentA, { action: "pay", id: receivable, amountCents: 10000, method: "transfer", occurredOn: new Date().toISOString().slice(0, 10), reference: "", payerProfileId: fatherA }, clubA);
  const forFather = (await familyView(db, father)).clubs[0].dues.find((d) => d.id === receivable)!;
  const forMother = (await familyView(db, mother)).clubs[0].dues.find((d) => d.id === receivable)!;
  expect([forFather.percent, forFather.shareCents, forFather.paid_by_me_cents]).toEqual([50, 10000, 10000]);
  expect([forMother.percent, forMother.shareCents, forMother.paid_by_me_cents]).toEqual([50, 10000, 0]);
  expect((await duesView(db, father)).debts.find((d: { id: string }) => d.id === receivable).myPercent).toBe(50);
  // Mother alone: the father no longer receives Lucas's dues.
  await billingSplitExecute(db, presidentA, { subjectId: lucas, shares: [{ guardianId: motherA, percent: 100 }] });
  expect((await familyView(db, father)).clubs[0].dues.find((d) => d.id === receivable)).toBeUndefined();
  expect((await duesView(db, father)).debts.find((d: { id: string }) => d.id === receivable)).toBeUndefined();
});
