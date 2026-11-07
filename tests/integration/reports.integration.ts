import { beforeAll, afterAll, afterEach, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { feedbackShot, feedbackSubmit, feedbackTick, feedbackView } from "../../src/domains/feedback/service";
import { setGithubFetch } from "../../src/domains/feedback/github";
import { workshopCommand, workshopExecute } from "../../src/domains/equipment/workshop";

/**
 * 19: a remark becomes an issue with its context and no visible sensitive
 * data, the token never leaves the server, ten a day, its state followed;
 * a chair reported by its QR code, taken out when unusable, the coach told
 * with a spare, the owner told of a lent chair, the reporter told at the
 * repair; two clubs.
 */
const schema = "rep_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
type Who = Principal & { mandateId: string; person: string };
let clubA: string, clubB: string, president: Who, presidentB: Who, coach: Who, parent: Who, chair: string, spare: string, lent: string, ana: string, team: string;
const calls: { url: string; method: string; body: Record<string, unknown> | null; auth: string }[] = [];
let issueClosed = false;
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => workshopExecute(db, p, workshopCommand.parse(cmd), org) as Promise<{ id: string }>;

async function member(org: string, role: string, name: string): Promise<Who> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id as string;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  return { userId, sessionId, mandateId, person };
}
const notes = async (user: string) => (await db.query("SELECT count(*)::int AS n FROM app_notification WHERE recipient_user_id=$1", [user])).rows[0].n as number;
const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(40)]).toString("base64");

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await member(clubA, "club_president", "Présidente A");
  presidentB = await member(clubB, "club_president", "Président B");
  coach = await member(clubA, "coach", "Coach A");
  parent = await member(clubA, "guardian", "Parent d'Ana");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Coach A') RETURNING id", [clubA, coach.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, team, coachProfile]);
  ana = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,'Ana','2012-01-01' FROM p RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, ana]);
  const parentProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent d''Ana') RETURNING id", [clubA, parent.person])).rows[0].id;
  await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,CURRENT_DATE-30,'Parent vérifié',$4)", [clubA, parentProfile, ana, president.userId]);
  const mk = async (org: string, name: string) => (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,$2,'available','club') RETURNING id", [org, name])).rows[0].id as string;
  chair = await mk(clubA, "Strike d'Ana");
  spare = await mk(clubA, "Fauteuil de prêt");
  lent = await mk(clubB, "Fauteuil du club B");
  await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-5,true,$4)", [clubA, chair, ana, president.userId]);
  // Ana is expected at a match in three days.
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  const event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$4,1,'Match contre les Lions','friendly','Europe/Brussels',now()+interval '3 days',now()+interval '3 days 2 hours','2026-11-05T14:00','2026-11-05T16:00',$2,$3,'organization') RETURNING id",
      [clubA, team, president.userId, series],
    )
  ).rows[0].id;
  const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '2 days') RETURNING id", [clubA, event])).rows[0].id;
  await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response) VALUES($1,$2,$3,'present')", [clubA, register, ana]);
  // Club B lends its chair to club A.
  await db.query("INSERT INTO equipment_loan(chair_id,lender_id,borrower_id,starts_on,ends_on,status,initiated_by,created_by) VALUES($1,$2,$3,CURRENT_DATE-1,CURRENT_DATE+30,'ongoing','lender',$4)", [lent, clubB, clubA, presidentB.userId]);

  process.env.PFM_FEEDBACK_GITHUB_TOKEN = "ghp_secret-test-token";
  process.env.PFM_FEEDBACK_GITHUB_REPO = "club/powerchair-manager";
  setGithubFetch(async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, auth: String((init?.headers as Record<string, string>)?.Authorization ?? "") });
    if (url.endsWith("/repos/club/powerchair-manager")) return Response.json({ private: true });
    if (url.endsWith("/issues") && init?.method === "POST") return Response.json({ number: 42, html_url: "https://github.com/club/powerchair-manager/issues/42" });
    if (url.endsWith("/issues/42")) return Response.json({ state: issueClosed ? "closed" : "open", labels: [{ name: "signalement" }, { name: "en cours" }] });
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => undefined);
afterAll(async () => {
  setGithubFetch(null);
  delete process.env.PFM_FEEDBACK_GITHUB_TOKEN;
  delete process.env.PFM_FEEDBACK_GITHUB_REPO;
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("sends a remark as an issue with its context, no name, and keeps the token on the server", async () => {
  const r = await feedbackSubmit(db, parent, {
    kind: "bug",
    description: "Le bouton « Répondre » ne réagit pas sur mon téléphone.",
    context: { page: "/fr/calendar?token=abc123#x", locale: "fr", screen: "390x844", browser: "Mobile Safari" },
    screenshot: png,
  });
  const post = calls.find((c) => c.method === "POST")!;
  expect(post.url).toBe("https://api.github.com/repos/club/powerchair-manager/issues");
  expect(post.auth).toBe("Bearer ghp_secret-test-token");
  expect(post.body!.labels).toEqual(["signalement", "bug"]);
  const body = String(post.body!.body);
  expect(body).toContain("| page | `/fr/calendar` |");
  expect(body).toContain("| role | `guardian` |");
  expect(body).not.toContain("abc123");
  expect(body).not.toContain("Parent d'Ana");
  expect(body).not.toContain("@example.test");
  // The screenshot rides along as a link (the repository is private).
  const token = (await db.query("SELECT screenshot_token FROM app_feedback WHERE id=$1", [r.id])).rows[0].screenshot_token as string;
  expect(body).toContain(`/api/feedback/shot/${token}`);
  expect((await feedbackShot(db, token)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  // What the person sees: the state, never the token nor the issue's address.
  const v = await feedbackView(db, parent);
  expect(v.mine.map((m) => m.state)).toEqual(["received"]);
  expect(JSON.stringify(v)).not.toMatch(/ghp_|github\.com/);
  // A screenshot that is not a PNG is refused.
  await expect(feedbackSubmit(db, parent, { kind: "idea", description: "Une idée en plus", screenshot: Buffer.from("GIF89a").toString("base64") })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
});

it("names the person only when she agrees, and stops at ten a day", async () => {
  calls.length = 0;
  await feedbackSubmit(db, president, { kind: "text", description: "Une faute dans le menu Réglages.", contact: true });
  expect(String(calls.find((c) => c.method === "POST")!.body!.body)).toContain("Présidente A <");
  for (let i = 0; i < 9; i++) await feedbackSubmit(db, president, { kind: "idea", description: `Idée numéro ${i}` });
  await expect(feedbackSubmit(db, president, { kind: "idea", description: "Une de trop" })).rejects.toMatchObject({ code: "TOO_MANY" });
  expect((await feedbackView(db, president)).left).toBe(0);
});

it("follows the issue's state and tells the person when it is fixed", async () => {
  await feedbackTick(db);
  expect((await feedbackView(db, parent)).mine[0].state).toBe("in_progress");
  issueClosed = true;
  await db.query("UPDATE app_feedback SET checked_at=now()-interval '2 hours'");
  const before = await notes(parent.userId);
  await feedbackTick(db);
  expect((await feedbackView(db, parent)).mine[0].state).toBe("fixed");
  expect(await notes(parent.userId)).toBe(before + 1);
  await feedbackTick(db);
  expect(await notes(parent.userId)).toBe(before + 1);
});

it("keeps a chair « à surveiller » in service, and logs it", async () => {
  await run(president, { action: "report", chairId: spare, description: "Un bruit dans la roue avant", category: "wheels", severity: "watch" });
  expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [spare])).rows[0].status).toBe("available");
  expect((await db.query("SELECT kind,diagnosis FROM chair_intervention WHERE chair_id=$1", [spare])).rows[0]).toEqual({ kind: "breakdown", diagnosis: "Roues ou pneus · à surveiller · Un bruit dans la roue avant" });
});

it("takes an unusable chair out, gives the task to the manager, tells the coach with a spare, then the reporter at the repair", async () => {
  const before = await notes(coach.userId);
  const r = await run(parent, { action: "report", chairId: chair, description: "Le joystick ne répond plus", category: "joystick", severity: "unusable" });
  expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [chair])).rows[0].status).toBe("out_of_service");
  const task = (await db.query("SELECT t.responsible_user_id FROM task t JOIN chair_report r ON r.task_id=t.id WHERE r.id=$1", [r.id])).rows[0];
  expect(task.responsible_user_id).toBe(president.userId);
  expect(await notes(coach.userId)).toBe(before + 1);
  const mail = (await db.query("SELECT title,body FROM app_notification WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 1", [coach.userId])).rows[0];
  expect(JSON.stringify(mail)).toContain("Fauteuil de prêt");
  // Repaired: the parent who reported it is told, once.
  const told = await notes(parent.userId);
  await run(president, { action: "closeReport", id: r.id });
  expect(await notes(parent.userId)).toBe(told + 1);
});

it("reports a lent chair to its owner too, and keeps another club out", async () => {
  const before = await notes(presidentB.userId);
  await run(president, { action: "report", chairId: lent, description: "La batterie ne charge plus", category: "battery", severity: "unusable" });
  expect(await notes(presidentB.userId)).toBe(before + 1);
  expect((await db.query("SELECT organization_id FROM chair_report WHERE chair_id=$1", [lent])).rows[0].organization_id).toBe(clubB);
  expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [lent])).rows[0].status).toBe("out_of_service");
  // Club B cannot report club A's own chair.
  await expect(run(presidentB, { action: "report", chairId: chair, description: "Intrusion" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
