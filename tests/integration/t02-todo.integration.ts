import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { tasksExecute, tasksView, tasksYear } from "../../src/domains/tasks/service";
import { taskCommand } from "../../src/domains/tasks/schema";
import { calendarExecute, calendarFeed } from "../../src/domains/calendar/service";
import { fundingTaskTick } from "../../src/domains/funding/service";
import { clubAffiliationsExecute, ensureDues } from "../../src/domains/affiliations/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * 2: a task for two people in both modes of completion, the reminders sent
 * once to each, a meeting in the feed of the people in charge only, a
 * template applied with its dates, a weekly repetition with an end, the year
 * view without another club's data, a task with an amount that records one
 * operation, an affiliation that creates its task and closes it when paid,
 * a player who sees only his task.
 */
const schema = "t02_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, driver1: Principal, driver2: Principal, player: Principal;
let d1: string, d2: string, playerProfile: string;
const day = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));
const run = (p: Principal, body: Record<string, unknown>, org = clubA) => tasksExecute(db, p, taskCommand.parse(body), org);

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,$3,'{coach}') RETURNING id", [org, person, name])).rows[0].id as string;
  return { p, profile };
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const a = await actor(clubA, "coach", "Chauffeur Un"),
    b = await actor(clubA, "coach", "Chauffeur Deux"),
    c = await actor(clubA, "player", "Joueur Seul");
  [driver1, d1, driver2, d2, player, playerProfile] = [a.p, a.profile, b.p, b.profile, c.p, c.profile];
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives a task to two drivers: done when one ticks, or when each ticked his part (2/2)", async () => {
  const any = (await run(president, { action: "create", category: "events", title: "Conduire au tournoi", dueOn: day(7), assignees: [d1, d2] })) as { ids: string[] };
  const each = (await run(president, { action: "create", category: "events", title: "Rapporter son maillot", dueOn: day(1), assignees: [d1, d2], completion: "each" })) as { ids: string[] };
  // Each driver was told, once.
  expect(Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=ANY($1::text[])", [[driver1.userId, driver2.userId]])).rows[0].n)).toBe(4);
  await run(driver1, { action: "done", id: any.ids[0], done: true });
  expect((await db.query("SELECT status FROM task WHERE id=$1", [any.ids[0]])).rows[0].status).toBe("done");
  await run(driver1, { action: "done", id: each.ids[0], done: true });
  let t = (await tasksView(db, president)).tasks.find((x) => x.id === each.ids[0])!;
  expect([t.status, t.assignees.filter((x) => x.done_on).length]).toEqual(["doing", 1]);
  // The reminder J-1 goes to the one who has not done his part, once.
  await fundingTaskTick(db, { tasks: true });
  await fundingTaskTick(db, { tasks: true });
  const reminded = (await db.query("SELECT recipient_user_id FROM notification_dispatch WHERE recipient_user_id=ANY($1::text[]) AND organization_id=$2", [[driver1.userId, driver2.userId], clubA])).rows.map((r) => r.recipient_user_id);
  expect(reminded.filter((x) => x === driver2.userId)).toHaveLength(3);
  expect(reminded.filter((x) => x === driver1.userId)).toHaveLength(2);
  await run(driver2, { action: "done", id: each.ids[0], done: true });
  t = (await tasksView(db, president)).tasks.find((x) => x.id === each.ids[0])!;
  expect(t.status).toBe("done");
});

it("shows a meeting in the feed of the people in charge only", async () => {
  const start = new Date(Date.now() + 3 * 86400000);
  await run(president, { action: "create", category: "admin", title: "Rendez-vous à la banque", dueOn: day(5), assignees: [d1], meetingStartsAt: start.toISOString(), meetingEndsAt: new Date(start.getTime() + 3600000).toISOString(), freeLocation: "Banque du centre" });
  const feed = async (p: Principal) => {
    const f = (await calendarExecute(db, p, { action: "feed", name: "Moi", teamId: null, mine: true }, clubA)) as { url: string };
    return calendarFeed(db, f.url.split("/").pop()!);
  };
  expect(await feed(driver1)).toContain("Rendez-vous à la banque");
  expect(await feed(driver2)).not.toContain("Rendez-vous à la banque");
});

it("applies a template with its dates and each line's people", async () => {
  const tpl = (await run(president, { action: "saveTemplate", kind: "other", category: "events", name: "Souper du club", items: [
    { title: "Réserver la salle", detail: "", daysBefore: 60 },
    { title: "Annoncer le souper", detail: "", daysBefore: 30 },
    { title: "Préparer la salle", detail: "", daysBefore: 1 },
  ] })) as { id: string };
  const date = day(90);
  const made = (await run(president, { action: "fromTemplate", templateId: tpl.id, date, assignments: { "0": [d1], "2": [d1, d2] }, excluded: [1] })) as { ids: string[] };
  expect(made.ids).toHaveLength(2);
  const rows = (await tasksView(db, president)).tasks.filter((x) => made.ids.includes(x.id)).sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  expect(rows.map((x) => [x.title, x.due_on, x.assignees.length, x.category])).toEqual([
    ["Réserver la salle", day(30), 1, "events"],
    ["Préparer la salle", day(89), 2, "events"],
  ]);
  // Archived, a template is no longer applied.
  await run(president, { action: "archiveTemplate", id: tpl.id, archived: true });
  await expect(run(president, { action: "fromTemplate", templateId: tpl.id, date })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("repeats a weekly task until its end", async () => {
  const w = (await run(president, { action: "create", category: "sport", title: "Charger les batteries", dueOn: day(0), assignees: [d1], recurrence: "weekly", recurrenceUntil: day(10) })) as { ids: string[] };
  const first = await run(driver1, { action: "done", id: w.ids[0], done: true }) as { next: string | null };
  expect(first.next).toBeTruthy();
  expect((await db.query("SELECT due_on::text AS d FROM task WHERE id=$1", [first.next])).rows[0].d).toBe(day(7));
  expect((await db.query("SELECT count(*)::int AS n FROM task_assignee WHERE task_id=$1", [first.next])).rows[0].n).toBe(1);
  const second = (await run(driver1, { action: "done", id: first.next!, done: true })) as { next: string | null };
  expect(second.next).toBeNull();
});

it("records the expense of a task with an amount once", async () => {
  const x = (await run(president, { action: "create", category: "admin", title: "Assurance annuelle", dueOn: day(20), amountCents: 45000 })) as { ids: string[] };
  await run(president, { action: "expense", id: x.ids[0], occurredOn: day(0), amountCents: 45000, label: "Assurance annuelle" });
  await expect(run(president, { action: "expense", id: x.ids[0], occurredOn: day(0), amountCents: 45000, label: "Assurance annuelle" })).rejects.toMatchObject({ code: "ALREADY_RECORDED" });
  expect((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1 AND label='Assurance annuelle'", [clubA])).rows[0].n).toBe(1);
  await expect(run(driver1, { action: "expense", id: x.ids[0], occurredOn: day(0), amountCents: 1, label: "Non" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("turns an affiliation into a task at its opening, closed when paid", async () => {
  const fee = (
    await db.query(
      "INSERT INTO affiliation_fee(organization_id,name,basis,frequency,amount_cents,opens_month,opens_day,due_days,all_clubs,created_by) VALUES((SELECT federation_id FROM organization WHERE id=$1),'Sportéa','club','annual',12000,1,1,60,true,$2) RETURNING id",
      [clubA, president.userId],
    )
  ).rows[0].id;
  expect(fee).toBeTruthy();
  const c = await db.connect();
  try {
    await ensureDues(c, clubA);
  } finally {
    c.release();
  }
  const task = (await db.query("SELECT id,status,amount_cents,affiliation_due_id,category FROM task WHERE organization_id=$1 AND affiliation_due_id IS NOT NULL", [clubA])).rows[0];
  expect(task).toMatchObject({ status: "todo", category: "affiliation" });
  const due = (await db.query("SELECT id FROM affiliation_due WHERE id=$1", [task.affiliation_due_id])).rows[0].id;
  await clubAffiliationsExecute(db, president, { action: "markPaid", id: due, paidOn: day(0), method: "transfer", createExpense: true } as never, clubA);
  const after = (await db.query("SELECT status,transaction_id FROM task WHERE id=$1", [task.id])).rows[0];
  expect(after.status).toBe("done");
  expect(after.transaction_id).toBeTruthy();
  // Ensured again: no second task for the same due.
  const c2 = await db.connect();
  try {
    await ensureDues(c2, clubA);
  } finally {
    c2.release();
  }
  expect((await db.query("SELECT count(*)::int AS n FROM task WHERE affiliation_due_id=$1", [due])).rows[0].n).toBe(1);
});

it("keeps a player to his own task, and the year view to the club", async () => {
  await run(president, { action: "create", category: "other", title: "Apporter le ballon", dueOn: day(3), assignees: [playerProfile] });
  const seen = (await tasksView(db, player)).tasks.map((x) => x.title);
  expect(seen).toEqual(["Apporter le ballon"]);
  // A player creates a task for himself only.
  await expect(run(player, { action: "create", category: "other", title: "Pour un autre", assignees: [d1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(player, { action: "create", category: "other", title: "Pour moi", assignees: [playerProfile] });
  await expect(tasksYear(db, player)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const year = await tasksYear(db, president);
  expect(year.items.some((i) => i.title === "Charger les batteries")).toBe(true);
  await run(presidentB, { action: "create", category: "admin", title: "Secret du club B", dueOn: day(10) }, clubB);
  expect(JSON.stringify(await tasksYear(db, president))).not.toContain("Secret du club B");
});
