import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { guideChapter, guideExecute, guideIndex, guideSearch } from "../../src/domains/guide/service";
import { guideImage, knowledgeExecute, knowledgeView } from "../../src/domains/guide/knowledge";
import { onboardingExecute, onboardingView } from "../../src/domains/onboarding/service";
import { draftQuizzes } from "../../src/domains/guide/drafts-more";

/**
 * Knowledge centre: the chapters filtered by role and searched; the quiz
 * passed ticks the journey's step, with no score kept; the lexicon; a photo
 * without text alternative or without image rights refused; the catalogue's
 * sheet with the federation's own suppliers; another federation sees none
 * of it.
 */
const schema = "kno_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, fedB: string, clubA: string, clubC: string, fedPresident: Principal, fedPresidentB: Principal, presidentA: Principal, coachA: Principal, parentA: Principal, presidentC: Principal, game: string, model: string;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const k = (p: Principal, body: Record<string, unknown>, org: string) => knowledgeExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;
const g = (p: Principal, body: Record<string, unknown>, org: string) => guideExecute(db, p, body as never, org) as Promise<Record<string, unknown>>;

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
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club C','club',$1) RETURNING id", [fedB])).rows[0].id;
  fedPresident = await member(fed, "federation_president", "Président fédéral", false);
  fedPresidentB = await member(fedB, "federation_president", "Autre président", false);
  presidentA = await member(clubA, "club_president", "Présidente A");
  coachA = await member(clubA, "coach", "Coach A");
  parentA = await member(clubA, "guardian", "Parent A");
  presidentC = await member(clubC, "club_president", "Président C");
  await g(fedPresident, { action: "adopt" }, fed);
  for (const c of (await guideIndex(db, fedPresident, "fr")).chapters) await g(fedPresident, { action: "publish", id: c.id }, fed);
  game = (await guideIndex(db, fedPresident, "fr")).chapters.find((c) => c.slug === "game")!.id;
  model = (await db.query("SELECT id FROM chair_model WHERE federation_id IS NULL AND name='Strike Force'")).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("filters the chapters by the reader's role and searches every published text", async () => {
  const parent = (await guideIndex(db, parentA, "fr")).chapters;
  expect(parent.filter((c) => c.forMe).map((c) => c.slug)).toEqual(["game", "chair", "who-does-what", "competitions", "classification", "safety", "parents-faq"]);
  const coach = (await guideIndex(db, coachA, "fr")).chapters;
  expect(coach.find((c) => c.slug === "parents-faq")!.forMe).toBe(false);
  const found = await guideSearch(db, coachA, "ramming", "fr");
  expect(found.chapters.map((c) => c.slug)).toEqual(["game"]);
  expect(found.chapters[0].snippet).toMatch(/ramming/i);
  expect(found.terms.map((t) => t.term)).toEqual(["Ramming"]);
  expect((await guideSearch(db, presidentC, "ramming", "fr")).chapters).toEqual([]);
  // The chapter brings the lexicon for its tips.
  expect((await guideChapter(db, coachA, "game", false)).terms.length).toBe(10);
});

it("ticks the journey's step when the quiz is passed, and keeps no score", async () => {
  const tpl = (await onboardingExecute(db, presidentA, { action: "adopt", key: "coach", locale: "fr" }, clubA)) as { id: string };
  const steps = (await onboardingView(db, presidentA)).templates.find((t) => t.id === tpl.id)!.steps.map((s) => (s.key === "guide-chair" ? { ...s, link: "quiz:game" } : s));
  await onboardingExecute(db, presidentA, { action: "saveTemplate", id: tpl.id, name: "Nouveau coach", audience: "coach", trigger: "manual", steps }, clubA);
  await onboardingExecute(db, presidentA, { action: "start", templateId: tpl.id, userId: coachA.userId }, clubA);
  const right = draftQuizzes.game.map((q) => q.answer);
  const wrong = right.map((a, i) => (i < 2 ? (a + 1) % 3 : a));
  expect(await k(coachA, { action: "answerQuiz", chapterId: game, answers: wrong }, clubA)).toMatchObject({ passed: false });
  expect((await onboardingView(db, coachA)).mine[0].steps.find((s) => s.key === "guide-chair")!.done_at).toBeNull();
  expect(await k(coachA, { action: "answerQuiz", chapterId: game, answers: right }, clubA)).toMatchObject({ passed: true });
  expect((await onboardingView(db, coachA)).mine[0].steps.find((s) => s.key === "guide-chair")!.done_how).toBe("auto");
  expect((await guideChapter(db, coachA, "game", false)).passed).toBe(true);
  expect((await db.query("SELECT * FROM guide_quiz_pass")).rows.map((r) => Object.keys(r).sort())).toEqual([["chapter_id", "passed_at", "user_id"]]);
  await expect(k(presidentC, { action: "answerQuiz", chapterId: game, answers: right }, clubC)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("keeps the lexicon with the federation that writes it", async () => {
  expect((await knowledgeView(db, coachA, "lexicon", "fr")).terms.length).toBe(10);
  await expect(k(presidentA, { action: "saveTerm", term: { fr: "Bully" }, definition: { fr: "Une mise en jeu." } }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await k(fedPresident, { action: "saveTerm", term: { fr: "Gardien" }, definition: { fr: "Le joueur qui défend le but." } }, fed);
  expect((await knowledgeView(db, coachA, "lexicon", "fr")).terms.length).toBe(11);
  expect((await knowledgeView(db, presidentC, "lexicon", "fr")).terms).toEqual([]);
});

it("refuses a photo without a text alternative or without image rights; serves it to the federation's readers only", async () => {
  const image = { action: "addImage", category: "guard", conform: "no", caption: { fr: "Protection creuse" }, mediaType: "image/png", data: png };
  await expect(k(fedPresident, { ...image, alt: { fr: "" }, peopleVisible: false, imageRights: false }, fed)).rejects.toBeTruthy();
  await expect(k(fedPresident, { ...image, alt: { fr: "Une protection avant creuse" }, peopleVisible: true, imageRights: false }, fed)).rejects.toMatchObject({ code: "IMAGE_RIGHTS" });
  await expect(k(fedPresident, { ...image, alt: { fr: "Une protection avant creuse" }, peopleVisible: false, imageRights: false, data: "bm90IGFuIGltYWdl" }, fed)).rejects.toMatchObject({ code: "INVALID_FILE" });
  const id = (await k(fedPresident, { ...image, alt: { fr: "Une protection avant creuse" }, peopleVisible: false, imageRights: false }, fed)).id as string;
  expect((await knowledgeView(db, parentA, "gallery", "fr")).images.map((i) => i.id)).toEqual([id]);
  expect((await guideImage(db, coachA, id, "image")).media_type).toBe("image/png");
  await expect(guideImage(db, presidentC, id, "image")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(guideImage(db, null, id, "image")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("writes a chair model's sheet with the federation's own suppliers", async () => {
  const supplier = (await db.query("INSERT INTO contact(organization_id,full_name,organization_name,tags,created_by) VALUES($1,'Vente','Fauteuils SA','{supplier}',$2) RETURNING id", [fed, fedPresident.userId])).rows[0].id;
  const other = (await db.query("INSERT INTO contact(organization_id,full_name,created_by) VALUES($1,'Ailleurs',$2) RETURNING id", [clubA, presidentA.userId])).rows[0].id;
  const sheet = { action: "saveSheet", modelId: model, manufacturer: "Fabricant", speedKmh: 10, weightKg: 140, strengths: { fr: "Rotation rapide" }, limits: { fr: "Lourd" } };
  await expect(k(fedPresident, { ...sheet, priceCents: 900000 }, fed)).rejects.toMatchObject({ code: "PRICE_DATE" });
  await expect(k(fedPresident, { ...sheet, suppliers: [other] }, fed)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await k(fedPresident, { ...sheet, priceCents: 900000, priceOn: "2026-10-01", suppliers: [supplier] }, fed);
  await expect(k(fedPresident, { action: "addPhoto", modelId: model, alt: { fr: "" }, mediaType: "image/png", data: png }, fed)).rejects.toBeTruthy();
  await k(fedPresident, { action: "addPhoto", modelId: model, alt: { fr: "Le fauteuil de profil" }, mediaType: "image/png", data: png }, fed);
  const seen = (await knowledgeView(db, coachA, "chair", "fr", model)).model!;
  expect(seen.sheet).toMatchObject({ manufacturer: "Fabricant", price_cents: 900000, price_on: "2026-10-01" });
  expect(seen.suppliers.map((s) => s.organization_name)).toEqual(["Fauteuils SA"]);
  expect(seen.photos).toHaveLength(1);
  expect(seen.contacts).toEqual([]);
  expect((await knowledgeView(db, presidentC, "chair", "fr", model)).model!.sheet).toBeNull();
  await expect(k(presidentA, { ...sheet }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  void fedPresidentB;
});
