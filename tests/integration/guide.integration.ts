import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { guideChapter, guideExecute, guideIndex, guidePublic } from "../../src/domains/guide/service";
import { complianceSave, complianceView } from "../../src/domains/equipment/compliance";
import { onboardingExecute, onboardingView } from "../../src/domains/onboarding/service";

/**
 * Guide du powerchair football: the federation adds the drafts and
 * publishes; its clubs read the published version only; a club's note
 * stays with its members; a changed chapter tells the coaches and referees;
 * reading ticks the welcome journey's « À lire »; the public page opens only
 * when asked; a chair's « Conforme pour un match » check stays in its club.
 */
const schema = "gui_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, fedPresident: Principal, presidentA: Principal, presidentB: Principal, coachA: Principal, referee: Principal, game: string, chair: string;
const run = (p: Principal, body: Record<string, unknown>, org: string) => guideExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;

async function member(org: string, role: string, name: string, profile = true) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id as string;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  if (profile) await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,$2 FROM person WHERE user_id=$3", [org, name, userId]);
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  fedPresident = await member(fed, "federation_president", "Président fédéral", false);
  referee = await member(fed, "referee", "Arbitre", false);
  presidentA = await member(clubA, "club_president", "Présidente A");
  presidentB = await member(clubB, "club_president", "Président B");
  coachA = await member(clubA, "coach", "Coach A");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("adds the drafts for the federation only; nothing reaches the clubs before publication", async () => {
  await expect(run(presidentA, { action: "adopt" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await run(fedPresident, { action: "adopt" }, fed)).added).toBe(7);
  expect((await run(fedPresident, { action: "adopt" }, fed)).added).toBe(0);
  const mine = await guideIndex(db, fedPresident, "fr");
  expect(mine.chapters.map((c) => [c.slug, c.status]).slice(0, 2)).toEqual([
    ["game", "draft"],
    ["chair", "draft"],
  ]);
  expect(mine.chapters.every((c) => c.status === "draft")).toBe(true);
  [game, chair] = mine.chapters.map((c) => c.id);
  expect((await guideIndex(db, coachA, "fr")).chapters).toEqual([]);
  await expect(guideChapter(db, coachA, "game", false)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(coachA, { action: "read", id: game }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("publishes, then keeps readers on the published version while a new draft is written", async () => {
  await run(fedPresident, { action: "publish", id: game }, fed);
  await run(fedPresident, { action: "publish", id: chair }, fed);
  const coach = await guideIndex(db, coachA, "nl");
  expect(coach.chapters.map((c) => c.title)).toEqual(["Powerchair football op één pagina", "De wedstrijdrolstoel"]);
  expect(coach.chapters.every((c) => c.forMe)).toBe(true);
  const draft = (await guideChapter(db, fedPresident, "game", true)).chapter;
  const content = { ...draft.content, fr: { ...draft.content.fr, title: "Le jeu en une page" } };
  await run(fedPresident, { action: "save", id: game, slug: "game", audiences: ["coach", "referee", "player", "guardian"], content, sources: draft.sources }, fed);
  expect((await guideChapter(db, coachA, "game", true)).chapter.content.fr.title).toBe("Le powerchair football en une page");
  expect((await guideChapter(db, fedPresident, "game", true)).chapter.content.fr.title).toBe("Le jeu en une page");
  expect((await guideChapter(db, fedPresident, "game", true)).versions.map((v) => v.version)).toEqual([2, 1]);
  // Publishing the change tells the coaches of the clubs and the referees.
  const out = await run(fedPresident, { action: "publish", id: game }, fed);
  expect(out.told).toBe(2);
  expect((await db.query("SELECT 1 FROM notification_dispatch WHERE recipient_user_id=ANY($1)", [[coachA.userId, referee.userId]])).rowCount).toBe(2);
  expect((await guideChapter(db, coachA, "game", false)).chapter.content.fr.title).toBe("Le jeu en une page");
});

it("keeps a club's note « Chez nous » with its own members", async () => {
  await expect(run(coachA, { action: "note", id: chair, body: "Batteries au local 2." }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(presidentA, { action: "note", id: chair, body: "Batteries au local 2." }, clubA);
  expect((await guideChapter(db, coachA, "chair", false)).note).toBe("Batteries au local 2.");
  expect((await guideChapter(db, presidentB, "chair", false)).note).toBe("");
  expect((await guideChapter(db, referee, "chair", false)).note).toBe("");
  await run(presidentA, { action: "note", id: chair, body: "" }, clubA);
  expect((await guideChapter(db, coachA, "chair", false)).note).toBe("");
});

it("ticks the welcome journey's « À lire » once the chapter is read", async () => {
  const tpl = (await onboardingExecute(db, presidentA, { action: "adopt", key: "coach", locale: "fr" }, clubA)) as { id: string };
  await onboardingExecute(db, presidentA, { action: "start", templateId: tpl.id, userId: coachA.userId }, clubA);
  const before = (await onboardingView(db, coachA)).mine[0].steps.find((s) => s.key === "guide-game")!;
  expect(before.done_at).toBeNull();
  await run(coachA, { action: "read", id: game }, clubA);
  const after = (await onboardingView(db, coachA)).mine[0].steps;
  expect(after.find((s) => s.key === "guide-game")!.done_how).toBe("auto");
  expect(after.find((s) => s.key === "guide-chair")!.done_at).toBeNull();
  expect((await guideIndex(db, coachA, "fr")).chapters.find((c) => c.id === game)!.read).toBe(true);
});

it("opens the public page only when the federation asks", async () => {
  await expect(guidePublic(db, fed, "game")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await run(fedPresident, { action: "public", id: game, public: true }, fed);
  expect((await guidePublic(db, fed, "game")).content.fr.title).toBe("Le jeu en une page");
  await run(fedPresident, { action: "unpublish", id: game }, fed);
  await expect(guidePublic(db, fed, "game")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(fedPresident, { action: "public", id: game, public: true }, fed)).rejects.toMatchObject({ code: "NOT_PUBLISHED" });
  // Another federation's chapter is out of reach.
  await expect(run(fedPresident, { action: "publish", id: randomUUID() }, fed)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("records a chair's « Conforme pour un match » check in its club only", async () => {
  const chairA = (await db.query("INSERT INTO equipment_chair(organization_id,name) VALUES($1,'Fauteuil 1') RETURNING id", [clubA])).rows[0].id as string;
  await complianceSave(db, presidentA, { chairId: chairA, checkedOn: "2026-11-01", items: ["guard", "heights", "width", "belt", "number", "edges"] }, clubA);
  let v = await complianceView(db, presidentA, chairA);
  expect(v.compliant).toBe(false);
  await complianceSave(db, presidentA, { chairId: chairA, checkedOn: "2026-11-02", items: ["guard", "heights", "width", "belt", "number", "edges", "speed"] }, clubA);
  v = await complianceView(db, presidentA, chairA);
  expect(v.compliant).toBe(true);
  expect(v.checks.map((c) => c.checked_on)).toEqual(["2026-11-02", "2026-11-01"]);
  await expect(complianceView(db, presidentB, chairA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(complianceSave(db, presidentB, { chairId: chairA, checkedOn: "2026-11-02", items: [] }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(complianceSave(db, coachA, { chairId: chairA, checkedOn: "2026-11-02", items: [] }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
