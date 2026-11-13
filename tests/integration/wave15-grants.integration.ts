import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { fundingExecute, fundingTasksView, fundingView, grantChairsExport, moneyDeadlines } from "../../src/domains/funding/service";
import { contactsView } from "../../src/domains/crm/service";
import { dashboardView } from "../../src/domains/dashboard/service";
import { brusselsDay } from "../../src/lib/today";

/** Wave 15 (C2): funders, grant file fields, standard check-list, next year, equipment financed. */
const schema = "w15gr_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, seasonA: string, president: Principal, presidentB: Principal, coach: Principal, coachProfile: string, oldGrant: string;
const day = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const grant = (funder: string, extra: Record<string, unknown> = {}) => ({
  action: "grant" as const,
  seasonId: seasonA,
  funder,
  program: "Équipement",
  purpose: "Deux fauteuils",
  requestedCents: 800000,
  grantedCents: null,
  status: "idea" as const,
  deadlineOn: day(10),
  notes: "",
  contactId: null,
  ...extra,
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  const files = (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  // Everything before the grant files, then an old application, then 0034: the funder is backfilled.
  for (const f of files.filter((f) => f < "0034")) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const author = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Author\',$2,true)', [author, author + "@example.test"]);
  oldGrant = (await db.query("INSERT INTO grant_application(organization_id,funder,program,purpose,requested_cents,status,created_by) VALUES($1,' ADEPS ','Plan sport','Ballons',50000,'paid',$2) RETURNING id", [clubA, author])).rows[0].id;
  await db.query("INSERT INTO grant_application(organization_id,funder,purpose,requested_cents,status,created_by) VALUES($1,'adeps','Filets',10000,'idea',$3),($2,'ADEPS','Maillots',20000,'idea',$3)", [clubA, clubB, author]);
  for (const f of files.filter((f) => f >= "0034")) await db.query(await readFile("db/migrations/" + f, "utf8"));
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2027-28',CURRENT_DATE+241,CURRENT_DATE+600)", [clubA]);
  president = (await actor(clubA, "club_president")).p;
  presidentB = (await actor(clubB, "club_president")).p;
  const c = await actor(clubA, "coach");
  coach = c.p;
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

it("backfills one funder per name and club, and reuses it for a new file", async () => {
  const view = await fundingView(db, president);
  expect(view.funders.map((f) => f.name)).toEqual(["ADEPS"]);
  expect(new Set(view.grants.map((g) => g.funder_id))).toEqual(new Set([view.funders[0].id]));
  const b = await fundingView(db, presidentB);
  expect(b.funders).toHaveLength(1);
  expect(b.funders[0].id).not.toBe(view.funders[0].id);
  // Typed with another case: same funder, its name kept.
  const { id } = await fundingExecute(db, president, grant("adeps", { programUrl: "https://www.adeps.be/appel", conditions: "Club affilié", explanation: "Dossier annuel", endsOn: day(200), recheckOn: day(300) }), clubA);
  const after = await fundingView(db, president);
  const g = after.grants.find((x) => x.id === id)!;
  expect([g.funder, g.funder_id, g.program_url, g.conditions, g.explanation, g.ends_on, g.recheck_on]).toEqual(["ADEPS", view.funders[0].id, "https://www.adeps.be/appel", "Club affilié", "Dossier annuel", day(200), day(300)]);
  // An update without the wave 15 fields keeps them.
  await fundingExecute(db, president, { ...grant("ADEPS"), id }, clubA);
  const kept = (await fundingView(db, president)).grants.find((x) => x.id === id)!;
  expect([kept.program_url, kept.conditions, kept.ends_on]).toEqual(["https://www.adeps.be/appel", "Club affilié", day(200)]);
  // A funder of another club cannot be picked.
  await expect(fundingExecute(db, president, grant("x", { funderId: b.funders[0].id }), clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("edits the funder, links its contact as public authority and renames its files", async () => {
  const view = await fundingView(db, president);
  const contact = (await db.query("INSERT INTO contact(organization_id,full_name,tags,created_by) VALUES($1,'Anne Dumont','{}',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  await fundingExecute(db, president, { action: "funder", id: view.funders[0].id, name: "ADEPS Fédération Wallonie-Bruxelles", website: "https://www.adeps.be", email: "info@adeps.be", phone: "02 413 23 11", address: "Boulevard Léopold II 44", notes: "", contactId: contact }, clubA);
  const after = await fundingView(db, president);
  expect(after.funders[0]).toMatchObject({ name: "ADEPS Fédération Wallonie-Bruxelles", contact_name: "Anne Dumont" });
  expect(after.grants.every((g) => g.funder === "ADEPS Fédération Wallonie-Bruxelles")).toBe(true);
  const contacts = await contactsView(db, president);
  const anne = contacts.contacts.find((c) => c.id === contact)!;
  expect(anne.tags).toContain("public");
  expect(anne.files).toEqual([{ kind: "funder", id: view.funders[0].id, name: "ADEPS Fédération Wallonie-Bruxelles" }]);
  // Another club cannot touch it.
  await expect(
    fundingExecute(db, presidentB, { action: "funder", id: view.funders[0].id, name: "Pirate", website: "", email: "", phone: "", address: "", notes: "", contactId: null }, clubB),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("adds the standard check-list once, and a step assigned to the coach shows on his home only", async () => {
  const id = (await fundingView(db, president)).grants.find((g) => g.program === "Équipement")!.id;
  await fundingExecute(db, president, { action: "grantChecklist", grantId: id, locale: "fr" }, clubA);
  await fundingExecute(db, president, { action: "grantChecklist", grantId: id, locale: "fr" }, clubA);
  let view = await fundingView(db, president);
  const steps = view.tasks.filter((t) => t.grant_id === id);
  expect(steps).toHaveLength(8);
  expect(steps[0].title).toBe("Lire l’appel et ses conditions");
  const g = view.grants.find((x) => x.id === id)!;
  expect([g.tasks_done, g.tasks_total]).toEqual([0, 8]);
  // The coach is in charge of filing, due in five days.
  const file = steps.find((t) => t.title === "Déposer le dossier")!;
  await fundingExecute(db, president, { action: "task", id: file.id, grantId: id, title: file.title, detail: "", dueOn: day(5), responsibleId: coachProfile }, clubA);
  const mine = await fundingTasksView(db, coach);
  expect(mine.tasks.map((t) => t.title)).toEqual(["Déposer le dossier"]);
  const home = await dashboardView(db, coach);
  expect(home.todos.find((t) => t.key === "grantTasks")?.count).toBe(1);
  const deadlines = await moneyDeadlines(db, coach, day(0), day(30));
  expect(deadlines.items.map((d) => [d.kind, d.source])).toEqual([["task", "grant"]]);
  // He ticks it; the club next door sees nothing of it.
  await fundingExecute(db, coach, { action: "taskDone", id: file.id, done: true }, clubA);
  view = await fundingView(db, president);
  expect(view.grants.find((x) => x.id === id)!.tasks_done).toBe(1);
  expect((await fundingView(db, presidentB)).tasks).toEqual([]);
  await expect(fundingExecute(db, presidentB, { action: "grantChecklist", grantId: id, locale: "fr" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The end of the period and the date to check again are in the layer for money people.
  const layer = await moneyDeadlines(db, president, day(0), day(400));
  expect(layer.items.filter((d) => d.kind === "grantRecheck" || d.kind === "grantEnd").map((d) => d.kind)).toEqual(["grantRecheck"]);
});

it("prepares next year's file once: same texts, dates one year later, steps unticked", async () => {
  const view = await fundingView(db, president);
  const g = view.grants.find((x) => x.program === "Équipement")!;
  const { id } = await fundingExecute(db, president, { action: "nextYear", grantId: g.id }, clubA);
  expect((await fundingExecute(db, president, { action: "nextYear", grantId: g.id }, clubA)).id).toBe(id);
  const after = await fundingView(db, president);
  const next = after.grants.find((x) => x.id === id)!;
  const year = (d: string | null) => (d ? `${Number(d.slice(0, 4)) + 1}${d.slice(4)}` : null);
  expect([next.status, next.funder_id, next.program, next.conditions, next.previous_id, next.season_name, next.deadline_on, next.recheck_on]).toEqual([
    "idea",
    g.funder_id,
    "Équipement",
    "Club affilié",
    g.id,
    "2027-28",
    year(g.deadline_on),
    year(g.recheck_on),
  ]);
  expect(after.grants.find((x) => x.id === g.id)!.next_id).toBe(id);
  const steps = after.tasks.filter((t) => t.grant_id === id);
  expect(steps).toHaveLength(8);
  expect(steps.every((t) => t.status === "todo" && t.responsible_id === null)).toBe(true);
  expect(steps.find((t) => t.title === "Déposer le dossier")!.due_on).toBe(year(day(5)));
  expect(after.history.filter((h) => h.target_id === g.id).map((h) => h.action)).toContain("grant.nextYear");
});

it("links the chairs it financed, refuses another club's chair and exports them", async () => {
  const g = (await fundingView(db, president)).grants.find((x) => x.program === "Équipement" && !x.previous_id)!;
  const [a, b] = (await db.query("INSERT INTO equipment_chair(organization_id,name,brand,acquired_on) VALUES($1,'Strike 1','Strike Force',CURRENT_DATE),($1,'Strike 2','Strike Force',CURRENT_DATE) RETURNING id", [clubA])).rows.map((r) => r.id as string);
  const other = (await db.query("INSERT INTO equipment_chair(organization_id,name) VALUES($1,'Their chair') RETURNING id", [clubB])).rows[0].id;
  await expect(fundingExecute(db, president, { action: "grantChairs", grantId: g.id, chairs: [{ id: other, purchaseValueCents: 100 }] }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await fundingExecute(db, president, { action: "grantChairs", grantId: g.id, chairs: [{ id: a, purchaseValueCents: 950000 }, { id: b, purchaseValueCents: null }] }, clubA);
  await fundingExecute(db, president, { action: "grantChairs", grantId: g.id, chairs: [{ id: a, purchaseValueCents: 950000 }] }, clubA);
  const view = await fundingView(db, president);
  expect(view.chairs.map((x) => [x.name, x.grant_id, x.purchase_value_cents])).toEqual([
    ["Strike 1", g.id, 950000],
    ["Strike 2", null, null],
  ]);
  const sheet = await grantChairsExport(db, president, g.id, "fr");
  expect(sheet.rows).toEqual([
    ["Fauteuil", "Marque", "Modèle", "Numéro de série", "Acquis le", "Valeur d'achat (€)"],
    ["Strike 1", "Strike Force", "", "", day(0), 9500],
    ["", "", "", "", "Total", 9500],
  ]);
  await expect(grantChairsExport(db, presidentB, g.id, "fr")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(grantChairsExport(db, coach, g.id, "fr")).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Deleting the file keeps the chairs and next year's file.
  await fundingExecute(db, president, { action: "deleteGrant", id: g.id }, clubA);
  const after = await fundingView(db, president);
  expect(after.chairs.find((x) => x.id === a)!.grant_id).toBeNull();
  expect(after.grants.find((x) => x.program === "Équipement")!.previous_id).toBeNull();
  expect(oldGrant).toBeTruthy();
});
