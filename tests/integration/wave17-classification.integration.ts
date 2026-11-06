import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { classificationExecute, classificationTextsView, classificationView } from "../../src/domains/classification/service";
import { federationTeamsView } from "../../src/domains/federation/clubs";
import { defaultTexts } from "../../src/domains/classification/schema";

/**
 * Wave 17 (J4): a classification day between two clubs of a federation. The
 * federation creates it and invites the clubs; each club registers only its
 * own players until the deadline; the named classifier marks and decides;
 * publishing updates the sport profiles, the history and the audit log and
 * tells the president, the coaches and the player or the parents. A club not
 * invited, another federation and the club roles cannot touch it.
 */
const schema = "w17cls_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, otherFed: string, clubA: string, clubB: string, clubC: string, clubX: string;
let fedPresident: Principal, classifier: Principal, otherReferee: Principal, presidentA: Principal, presidentB: Principal, presidentC: Principal, presidentX: Principal;
let coachA: Principal, playerUser: Principal, parentUser: Principal;
let a1: string, a2: string, b1: string, today: string, session: string;

async function actor(org: string, role: string | null, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const p = { userId, sessionId };
  if (role) {
    const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
    await execute(db, p, { action: "context", mandateId });
  }
  return p;
}
/** A club profile, linked to an account when `user` is given. */
async function profile(org: string, name: string, roles: string[], user?: Principal) {
  const person = user
    ? (await db.query("SELECT id FROM person WHERE user_id=$1", [user.userId])).rows[0].id
    : (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2010-05-01',$4) RETURNING id", [org, person, name, roles])).rows[0]
    .id as string;
}
const run = (p: Principal, org: string, command: Record<string, unknown>) => classificationExecute(db, p, command as never, org) as Promise<{ ok: true; id?: string; added?: number }>;
const create = (fields: Record<string, unknown> = {}, p = fedPresident, org = federation) =>
  run(p, org, { action: "create", day: today, registrationDeadline: today, sharedVenueId: null, venue: "Salle fédérale, Namur", notes: "", clubIds: [clubA, clubB], classifierIds: [classifier.userId], ...fields });
const mark = (id: string, present: boolean | null, decision: string | null, p = classifier) => run(p, federation, { action: "mark", id, present, decision, comment: "" });
const told = async (key: string) => (await db.query("SELECT recipient_user_id FROM mail_job WHERE kind='license_update' AND resource_id LIKE $1", [`${key}%`])).rows.map((r) => r.recipient_user_id);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  today = (await db.query("SELECT (now() AT TIME ZONE 'Europe/Brussels')::date::text AS d")).rows[0].d;
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  otherFed = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre','federation') RETURNING id")).rows[0].id;
  const club = async (name: string, fed: string) => (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES($1,'club',$2) RETURNING id", [name, fed])).rows[0].id as string;
  clubA = await club("Club A", federation);
  clubB = await club("Club B", federation);
  clubC = await club("Club C", federation);
  clubX = await club("Club X", otherFed);
  fedPresident = await actor(federation, "federation_president", "Fédé");
  classifier = await actor(federation, "referee", "Clara Classificatrice");
  otherReferee = await actor(federation, "referee", "Autre arbitre");
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Président B");
  presidentC = await actor(clubC, "club_president", "Président C");
  presidentX = await actor(clubX, "club_president", "Président X");
  coachA = await actor(clubA, "coach", "Coach A");
  playerUser = await actor(clubA, null, "Ana Joueuse");
  parentUser = await actor(clubA, null, "Parent de Bilal");
  a1 = await profile(clubA, "Ana Joueuse", ["player"], playerUser);
  a2 = await profile(clubA, "Bilal Haddad", ["player"]);
  b1 = await profile(clubB, "Chloé B", ["player"]);
  const coachProfile = await profile(clubA, "Coach A", ["coach"], coachA);
  const parentProfile = await profile(clubA, "Parent de Bilal", [], parentUser);
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,verified_by) VALUES($1,$2,$3,'declared',$4)", [clubA, parentProfile, a2, presidentA.userId]);
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  for (const [id, role] of [[a1, "player"], [a2, "player"], [coachProfile, "coach"]])
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-30)", [clubA, team, id, role]);
  await db.query("INSERT INTO player_sport_profile(profile_id,organization_id,classification,classification_status) VALUES($1,$2,'PF1','validated')", [a2, clubA]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("lets only the federation create a day, for its own clubs, and tells the invited presidents", async () => {
  await expect(create({}, classifier)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(create({}, presidentA, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(create({ clubIds: [clubA, clubX] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(create({ classifierIds: [presidentA.userId] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(create({ registrationDeadline: "2020-01-01" })).rejects.toMatchObject({ code: "CLASSIFICATION_DATES" });
  await expect(create({ venue: "" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  session = (await create()).id!;
  expect(await told(`${session}:invited`)).toEqual(expect.arrayContaining([presidentA.userId, presidentB.userId]));
  expect(await told(`${session}:invited`)).toHaveLength(2);
  const view = await classificationView(db, fedPresident);
  expect(view.mode).toBe("federation");
  expect(view.sessions[0]).toMatchObject({ id: session, status: "open", registrationOpen: true, clubs: [{ name: "Club A" }, { name: "Club B" }], classifiers: [{ name: "Clara Classificatrice" }] });
  expect(view.options?.clubs.map((c) => c.name)).toEqual(["Club A", "Club B", "Club C"]);
});

it("lets each invited club register only its own players, until the deadline", async () => {
  expect((await run(presidentA, clubA, { action: "register", sessionId: session, profileIds: [a1, a2] })).added).toBe(2);
  await expect(run(presidentA, clubA, { action: "register", sessionId: session, profileIds: [b1] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentC, clubC, { action: "register", sessionId: session, profileIds: [] as string[] })).rejects.toThrow();
  await expect(run(presidentX, clubX, { action: "register", sessionId: session, profileIds: [a1] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await run(presidentB, clubB, { action: "register", sessionId: session, profileIds: [b1] });
  // Club C, not invited, does not even see the day.
  expect((await classificationView(db, presidentC)).sessions).toEqual([]);
  // Club A sees its own players only, and no decision yet.
  const a = await classificationView(db, presidentA);
  expect(a.mode).toBe("club");
  expect(a.sessions[0].players.map((l) => l.full_name)).toEqual(["Ana Joueuse", "Bilal Haddad"]);
  expect(a.eligible.map((p) => p.full_name)).toEqual(["Ana Joueuse", "Bilal Haddad"]);
  // The federation reads sporting information only.
  const fed = await classificationView(db, fedPresident);
  expect(Object.keys(fed.sessions[0].players[0]).sort()).toEqual(
    ["birth_year", "classification", "club", "club_id", "comment", "decision", "full_name", "id", "present", "profile_id", "session_id", "status"].sort(),
  );
  // Unregister then register again; after the deadline nothing moves.
  await run(presidentA, clubA, { action: "unregister", sessionId: session, profileId: a1 });
  await run(presidentA, clubA, { action: "register", sessionId: session, profileIds: [a1] });
  const late = (await create({ clubIds: [clubA] })).id!;
  await db.query("UPDATE classification_session SET registration_deadline=day-1,day=day WHERE id=$1", [late]);
  await expect(run(presidentA, clubA, { action: "register", sessionId: late, profileIds: [a1] })).rejects.toMatchObject({ code: "CLASSIFICATION_CLOSED" });
  await run(fedPresident, federation, { action: "cancel", id: late });
  expect(await told(`${late}:cancelled`)).toEqual([presidentA.userId]);
});

it("lets the named classifier mark and decide, nobody else", async () => {
  const lines = Object.fromEntries((await classificationView(db, classifier)).sessions.find((s) => s.id === session)!.players.map((l) => [l.profile_id, l.id]));
  expect((await classificationView(db, otherReferee)).sessions).toEqual([]);
  await expect(mark(lines[a1], true, "PF2", otherReferee)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(presidentA, clubA, { action: "mark", id: lines[a1], present: true, decision: "PF2", comment: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await mark(lines[a1], true, "PF2");
  // Not everyone marked yet: publishing is refused, nothing changes.
  await expect(run(fedPresident, federation, { action: "publish", id: session })).rejects.toMatchObject({ code: "CLASSIFICATION_INCOMPLETE" });
  await expect(run(classifier, federation, { action: "publish", id: session })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await mark(lines[a2], true, "review");
  await mark(lines[b1], false, "PF1");
  const view = (await classificationView(db, fedPresident)).sessions.find((s) => s.id === session)!;
  expect(view.progress).toMatchObject({ ok: true, decided: 2 });
  expect(view.players.find((l) => l.profile_id === b1)).toMatchObject({ present: false, decision: null });
  // The club does not see decisions before publication.
  expect((await classificationView(db, presidentA)).sessions[0].players.every((l) => l.decision === null)).toBe(true);
  expect((await db.query("SELECT 1 FROM player_sport_profile WHERE profile_id=$1", [a1])).rowCount).toBe(0);
});

it("publishes: profiles, history, audit, and the people around each player told", async () => {
  await run(fedPresident, federation, { action: "publish", id: session });
  const sport = Object.fromEntries(
    (await db.query("SELECT profile_id,classification,classification_status,classification_note FROM player_sport_profile WHERE profile_id=ANY($1::uuid[])", [[a1, a2, b1]])).rows.map((r) => [r.profile_id, r]),
  );
  expect(sport[a1]).toMatchObject({ classification: "PF2", classification_status: "validated" });
  expect(sport[a2]).toMatchObject({ classification: "PF1", classification_status: "refused", classification_note: "À revoir" });
  expect(sport[b1]).toBeUndefined();
  expect((await db.query("SELECT classification,status FROM classification_history WHERE profile_id=$1 AND valid_to IS NULL", [a1])).rows).toEqual([{ classification: "PF2", status: "validated" }]);
  // International, step 3: the PF2 decision is in the person's registry, by this federation, from this day; the review (refused) is not.
  expect((await db.query("SELECT r.classification,r.source,r.session_id FROM classification_record r JOIN club_person cp ON cp.person_id=r.person_id WHERE cp.id=ANY($1::uuid[]) ORDER BY r.classification", [[a1, a2]])).rows).toEqual([{ classification: "PF2", source: "session", session_id: session }]);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='classification.session.decision' AND organization_id=$1", [clubA])).rows[0].n).toBe(2);
  expect(await told(`${session}:${a1}`)).toEqual(expect.arrayContaining([presidentA.userId, coachA.userId, playerUser.userId]));
  expect(await told(`${session}:${a2}`)).toEqual(expect.arrayContaining([presidentA.userId, coachA.userId, parentUser.userId]));
  expect(await told(`${session}:${a1}`)).not.toContain(presidentB.userId);
  expect(await told(`${session}:${b1}`)).toEqual([]);
  // The club now reads the results; the day is closed.
  const a = (await classificationView(db, presidentA)).sessions.find((s) => s.id === session)!;
  expect(a.players.map((l) => [l.full_name, l.decision])).toEqual([
    ["Ana Joueuse", "PF2"],
    ["Bilal Haddad", "review"],
  ]);
  const lineA = a.players[0].id;
  await expect(mark(lineA, true, "PF1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(fedPresident, federation, { action: "publish", id: session })).rejects.toMatchObject({ code: "CLASSIFICATION_CLOSED" });
});

it("shows the federation's own PF1/PF2 texts to its clubs, the defaults elsewhere", async () => {
  expect((await classificationTextsView(db, presidentA)).texts).toEqual(defaultTexts);
  const texts = { PF1: { fr: "Un", nl: "Een", en: "One" }, PF2: { fr: "Deux", nl: "Twee", en: "Two" } };
  await expect(run(presidentA, clubA, { action: "texts", texts })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(fedPresident, federation, { action: "texts", texts });
  expect((await classificationTextsView(db, presidentA)).texts).toEqual(texts);
  expect((await classificationTextsView(db, classifier)).texts).toEqual(texts);
  expect((await classificationTextsView(db, presidentX)).texts).toEqual(defaultTexts);
});

it("gives the federation each team's players, sporting information only", async () => {
  const view = await federationTeamsView(db, fedPresident);
  expect(view.players.map((p) => [p.full_name, p.classification, p.license_status])).toEqual([
    ["Ana Joueuse", "PF2", null],
    ["Bilal Haddad", "PF1", null],
  ]);
  expect(Object.keys(view.players[0]).sort()).toEqual(["age", "classification", "classification_status", "full_name", "id", "license_number", "license_status", "team_id"]);
  expect(view.players[0].age).toBe("16to18");
  await expect(federationTeamsView(db, presidentA)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
});
