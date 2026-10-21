import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  fundingExecute,
  fundingTasksView,
  fundingTaskTick,
  fundingView,
  moneyDeadlines,
  partnerReport,
  partnerReportProof,
  taskProofUpload,
} from "../../src/domains/funding/service";
import { dashboardView } from "../../src/domains/dashboard/service";

/** Wave 15 (C1): packages and conditions of each club, partner tasks, payment, report, deadlines. */
const schema = "w15sp_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, seasonA: string, president: Principal, presidentB: Principal, coach: Principal, otherCoach: Principal, coachProfile: string;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const plus = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const partner = (name: string, extra: Record<string, unknown> = {}) => ({
  action: "partner" as const,
  name,
  kind: "sponsor" as const,
  status: "active" as const,
  amountCents: 100000,
  inKind: "",
  counterpart: "",
  startsOn: null,
  endsOn: null,
  nextActionOn: null,
  nextAction: "",
  contactId: null,
  notes: "",
  ...extra,
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  president = (await actor(clubA, "club_president")).p;
  presidentB = (await actor(clubB, "club_president")).p;
  const c = await actor(clubA, "coach");
  coach = c.p;
  otherCoach = (await actor(clubA, "coach")).p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Sam Leroy','1990-01-01','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
});
beforeEach(() => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("imports the example packages and keeps each club's packages to itself", async () => {
  await fundingExecute(db, president, { action: "importPackages", seasonId: seasonA, locale: "fr" }, clubA);
  const view = await fundingView(db, president);
  expect(view.packages.map((k) => [k.name, k.amount_cents, k.places, k.featured, k.conditions.length])).toEqual([
    ["Supporter", 70000, null, false, 2],
    ["Coéquipier", 100000, null, true, 4],
    ["Capitaine", 200000, 2, false, 5],
  ]);
  const captain = view.packages[2].id;
  // Club B cannot use, change or see club A's packages.
  await expect(fundingExecute(db, presidentB, partner("Intrus", { packageId: captain }), clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    fundingExecute(db, presidentB, { action: "package", id: captain, seasonId: null, name: "Volé", amountCents: 1, description: "", places: null, featured: false, conditions: [] }, clubB),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await fundingView(db, presidentB)).packages).toEqual([]);
  // Limited places: the third partner on Capitaine is refused, an ended one frees its place.
  const { id: first } = await fundingExecute(db, president, partner("Garage Dupont", { packageId: captain }), clubA);
  await fundingExecute(db, president, partner("Boulangerie", { packageId: captain }), clubA);
  await expect(fundingExecute(db, president, partner("Pharmacie", { packageId: captain }), clubA)).rejects.toMatchObject({ code: "PACKAGE_FULL" });
  await fundingExecute(db, president, partner("Garage Dupont", { id: first, status: "ended" }), clubA);
  await fundingExecute(db, president, partner("Pharmacie", { packageId: captain }), clubA);
});

it("turns the conditions into dated tasks, keeps the done ones when the package changes, and moves them with the signing date", async () => {
  const { id: pkg } = await fundingExecute(
    db,
    president,
    {
      action: "package",
      seasonId: seasonA,
      name: "Maillot",
      amountCents: 150000,
      description: "",
      places: null,
      featured: false,
      conditions: [
        { title: "Logo sur les maillots", description: "", quantity: "", offsetDays: 30 },
        { title: "Publications", description: "", quantity: "3 publications", offsetDays: 60 },
        { title: "Invitation au tournoi", description: "", quantity: "", offsetDays: null },
      ],
    },
    clubA,
  );
  const signed = day(-5);
  const { id } = await fundingExecute(db, president, partner("Brasserie du Parc", { packageId: pkg, signedOn: signed }), clubA);
  let tasks = (await fundingView(db, president)).tasks.filter((t) => t.partner_id === id);
  expect(tasks.map((t) => [t.title, t.due_on, t.origin])).toEqual([
    ["Logo sur les maillots", plus(signed, 30), "condition"],
    ["Publications · 3 publications", plus(signed, 60), "condition"],
    ["Invitation au tournoi", null, "condition"],
  ]);
  await fundingExecute(db, president, { action: "taskDone", id: tasks[0].id, done: true }, clubA);
  // A new signing date moves the open conditions only.
  await fundingExecute(db, president, partner("Brasserie du Parc", { id, signedOn: day(0) }), clubA);
  tasks = (await fundingView(db, president)).tasks.filter((t) => t.partner_id === id);
  expect(tasks.map((t) => t.due_on)).toEqual([plus(signed, 30), plus(day(0), 60), null]);
  // Another package: the done condition stays, the open ones go, the new ones come.
  const supporter = (await fundingView(db, president)).packages.find((k) => k.name === "Supporter")!.id;
  await fundingExecute(db, president, partner("Brasserie du Parc", { id, packageId: supporter }), clubA);
  const view = await fundingView(db, president);
  tasks = view.tasks.filter((t) => t.partner_id === id);
  expect(tasks.map((t) => [t.title, t.status])).toEqual([
    ["Logo sur les maillots", "done"],
    ["Logo sur le site du club", "todo"],
    ["Remerciement sur les réseaux sociaux · 1 publication", "todo"],
  ]);
  const row = view.partners.find((p) => p.id === id)!;
  expect([row.package_name, row.tasks_done, row.tasks_total]).toEqual(["Supporter", 1, 3]);
  // The history keeps the former package with what was delivered.
  expect(view.history.find((h) => h.target_id === id && h.action === "partner.package" && h.details.from === "Maillot")?.details).toMatchObject({ delivered: 1, total: 3 });
});

it("lets the person in charge tick their task only, and shows them their tasks and dates, never the others'", async () => {
  const { id } = await fundingExecute(db, president, partner("Imprimerie", { paymentDueOn: day(10), renewalOn: day(20) }), clubA);
  const { id: mine } = await fundingExecute(db, president, { action: "task", partnerId: id, title: "Photo du maillot", detail: "", dueOn: day(5), responsibleId: coachProfile }, clubA);
  const { id: theirs } = await fundingExecute(db, president, { action: "task", partnerId: id, title: "Bâche", detail: "", dueOn: day(6) }, clubA);
  // Someone without an account cannot be put in charge.
  const bare = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  const noAccount = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Sans compte','1990-01-01','{player}') RETURNING id", [clubA, bare])).rows[0].id;
  await expect(fundingExecute(db, president, { action: "task", partnerId: id, title: "Tâche", detail: "", dueOn: null, responsibleId: noAccount }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await fundingExecute(db, coach, { action: "taskDone", id: mine, done: true }, clubA);
  await expect(fundingExecute(db, coach, { action: "taskDone", id: theirs, done: true }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(fundingExecute(db, coach, { action: "deleteTask", id: mine }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await fundingExecute(db, coach, { action: "taskDone", id: mine, done: false }, clubA);
  const coachTasks = await fundingTasksView(db, coach);
  expect(coachTasks.tasks.map((t) => t.title)).toEqual(["Photo du maillot"]);
  expect(coachTasks.can.all).toBe(false);
  expect((await fundingTasksView(db, otherCoach)).tasks).toEqual([]);
  // Deadlines: the president sees conditions, payment and renewal; the coach his task only, no amount anywhere.
  const all = await moneyDeadlines(db, president, day(0), day(30));
  expect(all.items.filter((d) => d.title.startsWith("Imprimerie")).map((d) => d.kind).sort()).toEqual(["condition", "condition", "payment", "renewal"].sort());
  const coachDays = await moneyDeadlines(db, coach, day(0), day(30));
  expect(coachDays.can).toEqual({ all: false, layer: true });
  expect(coachDays.items.map((d) => d.title)).toEqual(["Imprimerie · Photo du maillot"]);
  expect((await moneyDeadlines(db, otherCoach, day(0), day(30))).can.layer).toBe(false);
  expect((await moneyDeadlines(db, presidentB, day(0), day(30))).items).toEqual([]);
  // The home: conditions to deliver within 14 days, all for the president, his own for the coach.
  expect((await dashboardView(db, coach)).todos.find((x) => x.key === "sponsorTasks")?.count).toBe(1);
  expect((await dashboardView(db, president)).todos.find((x) => x.key === "sponsorTasks")?.count).toBeGreaterThanOrEqual(2);
  expect((await dashboardView(db, otherCoach)).todos.find((x) => x.key === "sponsorTasks")).toBeUndefined();
});

it("writes the payment in the ledger once, and shares a public report without amounts", async () => {
  const { id } = await fundingExecute(db, president, partner("Fleuriste", { amountCents: 70000, paidOn: day(-1), recordPayment: true }), clubA);
  await fundingExecute(db, president, partner("Fleuriste", { id, amountCents: 70000, paidOn: day(-1), recordPayment: true }), clubA);
  const lines = (await db.query("SELECT amount_cents,category,direction FROM finance_transaction WHERE organization_id=$1 AND label='Fleuriste'", [clubA])).rows;
  expect(lines).toEqual([{ amount_cents: 70000, category: "sponsor", direction: "in" }]);
  const { id: task } = await fundingExecute(db, president, { action: "task", partnerId: id, title: "Logo sur le site", detail: "", dueOn: day(3), proofUrl: "https://example.org/sponsors" }, clubA);
  await fundingExecute(db, president, { action: "taskDone", id: task, done: true }, clubA);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const { id: proof } = await taskProofUpload(db, president, task, { name: "logo.png", bytes: png }, clubA);
  // Another club cannot add a proof to it.
  await expect(taskProofUpload(db, presidentB, task, { name: "x.png", bytes: png }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await fundingExecute(db, president, { action: "partnerReport", partnerId: id, public: true }, clubA);
  const token = (await fundingView(db, president)).partners.find((p) => p.id === id)!.report_token!;
  const report = await partnerReport(db, token);
  expect(report).toMatchObject({ club: "Club A", partner: "Fleuriste" });
  expect(JSON.stringify(report)).not.toContain("70000");
  expect(report.tasks.map((t) => [t.title, t.status, t.proof_url])).toEqual([["Logo sur le site", "done", "https://example.org/sponsors"]]);
  expect((await partnerReportProof(db, token, proof)).filename).toBe("logo.png");
  // Withdrawn: the link stops working.
  await fundingExecute(db, president, { action: "partnerReport", partnerId: id, public: false }, clubA);
  await expect(partnerReport(db, token)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("reminds the person in charge seven days before a task, once", async () => {
  const { id } = await fundingExecute(db, president, partner("Librairie"), clubA);
  await fundingExecute(db, president, { action: "task", partnerId: id, title: "Affiche", detail: "", dueOn: day(7), responsibleId: coachProfile }, clubA);
  const before = (await db.query("SELECT count(*)::int AS n FROM app_notification WHERE kind='funding_task'")).rows[0].n;
  await fundingTaskTick(db);
  await fundingTaskTick(db);
  const after = (await db.query("SELECT count(*)::int AS n FROM app_notification WHERE kind='funding_task' AND recipient_user_id=$1", [coach.userId])).rows[0].n;
  expect(after - before).toBe(1);
});
