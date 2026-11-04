import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { answerByToken, pollByToken, pollsExecute, pollsTick, pollsView } from "../../src/domains/polls/service";

/**
 * H3: a date poll becomes the event (yes invited); the personal link answers
 * once; anonymity on the creator's side; one relaunch; another club's people
 * are never asked.
 */
const schema = "poll_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, team: string, president: Principal, ana: Principal, anaProfile: string, parent: Principal, outsider: Principal;
/** The personal links travel in the message (and its in-app twin). */
const links = async (q: string) =>
  (await db.query("SELECT n.href FROM app_notification n WHERE n.href LIKE '%/sondage/%' AND n.title LIKE $1", ["%" + q + "%"])).rows.map((r) => r.href.split("/sondage/")[1] as string);
async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const a = await actor(clubA, "player", "Ana");
  ana = a.p;
  anaProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Ana','2012-01-01','{player}') RETURNING id", [clubA, a.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, anaProfile]);
  const pa = await actor(clubA, "guardian", "Parent d'Ana");
  parent = pa.p;
  const gp = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent d''Ana') RETURNING id", [clubA, pa.person])).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)",
    [clubA, gp, anaProfile, president.userId],
  );
  // Another club's player, on a team of the same name: never asked.
  const o = await actor(clubB, "player", "Autre");
  outsider = o.p;
  const sB = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubB])).rows[0].id;
  const tB = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubB, sB])).rows[0].id;
  const pB = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Autre','{player}') RETURNING id", [clubB, o.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubB, tB, pB]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("turns a date poll into the event, those who said yes invited", async () => {
  const { id, recipients } = await pollsExecute(
    db,
    president,
    { action: "create", kind: "dates", question: "Quand jouer le match amical ?", audience: "team", teamId: team, closesAt: inDays(3), options: [{ label: "Samedi", startsAt: inDays(10) }, { label: "Dimanche", startsAt: inDays(11) }] },
    clubA,
  );
  expect(recipients).toBe(1);
  const mine = (await pollsView(db, ana)).toAnswer.find((p) => p.id === id)!;
  await pollsExecute(db, ana, { action: "answer", recipientId: mine.recipient_id, answers: [{ optionId: mine.options[0].id, value: "yes" }, { optionId: mine.options[1].id, value: "no" }] }, clubA);
  const created = (await pollsView(db, president)).created.find((p) => p.id === id)!;
  expect(created.results.leading).toBe(mine.options[0].id);
  expect(created.results.people!.map((x) => x.name)).toEqual(["Ana"]);
  await expect(pollsExecute(db, president, { action: "outcome", id, optionId: mine.options[0].id }, clubA)).rejects.toMatchObject({ code: "POLL_OPEN" });
  await pollsExecute(db, president, { action: "close", id }, clubA);
  const out = await pollsExecute(db, president, { action: "outcome", id, optionId: mine.options[0].id }, clubA);
  expect(out).toMatchObject({ invited: 1 });
  const e = (await db.query("SELECT kind,team_id FROM calendar_event WHERE id=$1", [(out as { eventId: string }).eventId])).rows[0];
  expect(e).toMatchObject({ kind: "meeting", team_id: team });
  expect((await db.query("SELECT count(*)::int AS n FROM attendance_invitation r JOIN attendance_register g ON g.id=r.register_id WHERE g.event_id=$1 AND r.profile_id=$2", [(out as { eventId: string }).eventId, anaProfile])).rows[0].n).toBe(1);
});

it("answers once by the personal link, without signing in", async () => {
  await pollsExecute(
    db,
    president,
    { action: "create", kind: "single", question: "Quel maillot ?", audience: "team_parents", teamId: team, perChild: true, closesAt: inDays(5), options: [{ label: "Bleu" }, { label: "Rouge" }] },
    clubA,
  );
  const [link] = await links("Quel maillot");
  expect(await links("Quel maillot")).toHaveLength(1);
  const view = await pollByToken(db, link);
  expect(view).toMatchObject({ child: "Ana", used: false, open: true });
  await expect(answerByToken(db, link, { answers: [{ optionId: view.options[0].id, value: "yes" }, { optionId: view.options[1].id, value: "yes" }] })).rejects.toMatchObject({ code: "INVALID_ANSWER" });
  await answerByToken(db, link, { answers: [{ optionId: view.options[1].id, value: "yes" }] });
  expect((await pollByToken(db, link)).used).toBe(true);
  await expect(answerByToken(db, link, { answers: [{ optionId: view.options[0].id, value: "yes" }] })).rejects.toMatchObject({ code: "LINK_USED" });
  // The parent answered for the child; the child is not asked for his parent.
  expect((await pollsView(db, ana)).toAnswer.some((p) => p.question === "Quel maillot ?")).toBe(false);
  expect((await pollsView(db, parent)).toAnswer.find((p) => p.question === "Quel maillot ?")).toMatchObject({ child: "Ana" });
});

it("keeps names from the creator of an anonymous poll", async () => {
  const { id } = await pollsExecute(
    db,
    president,
    { action: "create", kind: "multiple", question: "Quelles activités ?", anonymous: true, audience: "members", closesAt: inDays(4), options: [{ label: "Barbecue" }, { label: "Tournoi" }] },
    clubA,
  );
  const mine = (await pollsView(db, ana)).toAnswer.find((p) => p.id === id)!;
  await pollsExecute(db, ana, { action: "answer", recipientId: mine.recipient_id, answers: [{ optionId: mine.options[0].id, value: "yes" }, { optionId: mine.options[1].id, value: "yes" }] }, clubA);
  const created = (await pollsView(db, president)).created.find((p) => p.id === id)!;
  expect(created.results.people).toBeNull();
  expect(created.results.tally.map((t) => t.yes)).toEqual([1, 1]);
  expect(JSON.stringify(created)).not.toContain("Ana");
});

it("relaunches once, 24 hours before closing, who has not answered", async () => {
  const { id } = await pollsExecute(db, president, { action: "create", kind: "single", question: "Repas après le match ?", audience: "team", teamId: team, closesAt: new Date(Date.now() + 20 * 3600000).toISOString(), options: [{ label: "Oui" }, { label: "Non" }] }, clubA);
  expect(await pollsTick(db)).toBeGreaterThanOrEqual(1);
  expect(await pollsTick(db)).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM poll_recipient WHERE poll_id=$1 AND reminded_at IS NOT NULL", [id])).rows[0].n).toBe(1);
});

it("never asks another club's people, nor lets them see or act", async () => {
  expect((await pollsView(db, outsider)).toAnswer).toHaveLength(0);
  const any = (await pollsView(db, president)).created[0];
  await expect(pollsExecute(db, outsider, { action: "close", id: any.id }, clubB)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const r = (await db.query("SELECT id FROM poll_recipient LIMIT 1")).rows[0].id;
  await expect(pollsExecute(db, outsider, { action: "answer", recipientId: r, answers: [{ optionId: randomUUID(), value: "yes" }] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A team of another club cannot be the audience.
  const tB = (await db.query("SELECT id FROM team WHERE organization_id=$1", [clubB])).rows[0].id;
  await expect(pollsExecute(db, president, { action: "create", kind: "single", question: "Test", audience: "team", teamId: tB, closesAt: inDays(2), options: [{ label: "A" }, { label: "B" }] }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
