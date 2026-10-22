import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { fundingExecute, fundingTaskTick, fundingView } from "../../src/domains/funding/service";
import { fundingCommand } from "../../src/domains/funding/schema";
import { tasksView } from "../../src/domains/tasks/service";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * A2: « Subsides & sponsors ». The opening of a call, the period covered,
 * the money received in instalments (one grant), next year's file one
 * year later; a sponsor's person in charge and last contact, the renewal
 * 60 days ahead and the silence of 90 days in the to-do; the reminders
 * J-30, J-7 and J-1; rights and two clubs.
 */
const schema = "a2gs_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, coachProfile: string;
const today = brusselsToday();
const day = (n: number) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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
const run = (p: Principal, org: string, cmd: Record<string, unknown>) => fundingExecute(db, p, fundingCommand.parse({ organizationId: org, ...cmd }), org) as Promise<{ id: string }>;
const grant = (extra: Record<string, unknown>) => ({ action: "grant", funder: "Région", program: "Sport adapté", purpose: "", requestedCents: 500000, status: "idea", notes: "", ...extra });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const c = await actor(clubA, "coach", "Coach");
  coach = c.p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Sam Coach','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("waits for the call to open before the task, then keeps one task until the file is filed", async () => {
  const { id } = await run(president, clubA, grant({ opensOn: day(5), deadlineOn: day(40), startsOn: "2027-01-01", endsOn: "2027-12-31" }));
  const row = (await fundingView(db, president)).grants.find((g) => g.id === id)!;
  expect([row.opens_on, row.starts_on, row.ends_on, row.received_cents]).toEqual([day(5), "2027-01-01", "2027-12-31", 0]);
  expect((await tasksView(db, president)).tasks.filter((t) => t.grant_id === id)).toEqual([]);
  // The call opens: one task, due on the deadline.
  await db.query("UPDATE grant_application SET opens_on=$2 WHERE id=$1", [id, today]);
  expect((await tasksView(db, president)).tasks.filter((t) => t.grant_id === id).map((t) => [t.source_kind, t.due_on])).toEqual([["grantDeadline", day(40)]]);
  // Without a deadline: « L'appel est ouvert ».
  const open = (await run(president, clubA, grant({ funder: "Province", opensOn: day(-1) }))).id;
  expect((await tasksView(db, president)).tasks.filter((t) => t.grant_id === open).map((t) => t.source_kind)).toEqual(["grantOpening"]);
  // Absent fields keep their value on an update.
  await run(president, clubA, { ...grant({ deadlineOn: day(40) }), id });
  expect((await fundingView(db, president)).grants.find((g) => g.id === id)!.starts_on).toBe("2027-01-01");
});

it("records the money received in instalments, one grant, paid when complete", async () => {
  const { id } = await run(president, clubA, grant({ funder: "Fondation", status: "idea", deadlineOn: day(20) }));
  await expect(run(president, clubA, { action: "grantPayment", grantId: id, receivedOn: today, amountCents: 1000, note: "" })).rejects.toMatchObject({ code: "GRANT_NOT_GRANTED" });
  await run(president, clubA, { ...grant({ funder: "Fondation", status: "granted", grantedCents: 100000, deadlineOn: day(20) }), id });
  await run(president, clubA, { action: "grantPayment", grantId: id, receivedOn: day(-10), amountCents: 60000, note: "Première tranche" });
  let row = (await fundingView(db, president)).grants.find((g) => g.id === id)!;
  expect([row.status, row.received_cents]).toEqual(["granted", 60000]);
  const second = await run(president, clubA, { action: "grantPayment", grantId: id, receivedOn: day(-1), amountCents: 40000, note: "Solde" });
  const view = await fundingView(db, president);
  row = view.grants.find((g) => g.id === id)!;
  expect([row.status, row.paid_on, row.received_cents]).toEqual(["paid", day(-1), 100000]);
  expect(view.payments.filter((x) => x.grant_id === id).map((x) => x.amount_cents)).toEqual([60000, 40000]);
  expect(view.grants.filter((g) => g.funder === "Fondation")).toHaveLength(1);
  // The coach has no money rights; the other club cannot touch it.
  await expect(run(coach, clubA, { action: "grantPayment", grantId: id, receivedOn: today, amountCents: 100, note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(presidentB, clubB, { action: "grantPayment", grantId: id, receivedOn: today, amountCents: 100, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "deleteGrantPayment", id: second.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await run(president, clubA, { action: "deleteGrantPayment", id: second.id });
  expect((await fundingView(db, president)).grants.find((g) => g.id === id)!.received_cents).toBe(60000);
});

it("prepares next year's file with every date one year later", async () => {
  const { id } = await run(president, clubA, grant({ funder: "Commune", opensOn: "2026-09-01", startsOn: "2027-01-01", endsOn: "2027-12-31", deadlineOn: "2026-10-15" }));
  const next = (await run(president, clubA, { action: "nextYear", grantId: id })).id;
  const row = (await fundingView(db, president)).grants.find((g) => g.id === next)!;
  expect([row.previous_id, row.opens_on, row.starts_on, row.ends_on, row.deadline_on]).toEqual([id, "2027-09-01", "2028-01-01", "2028-12-31", "2027-10-15"]);
});

it("follows a sponsor's person in charge, last contact, renewal and silence in the to-do", async () => {
  const { id } = await run(president, clubA, {
    action: "partner",
    name: "Garage Dupont",
    kind: "sponsor",
    status: "active",
    amountCents: 150000,
    inKind: "",
    counterpart: "",
    startsOn: day(-300),
    endsOn: day(30),
    nextAction: "",
    notes: "",
    responsibleId: coachProfile,
    lastContactOn: day(-100),
  });
  let p = (await fundingView(db, president)).partners.find((x) => x.id === id)!;
  expect([p.responsible_name, p.last_contact_on]).toEqual(["Sam Coach", day(-100)]);
  const auto = (await tasksView(db, president)).tasks.filter((t) => t.partner_id === id);
  expect(auto.map((t) => [t.source_kind, t.category, t.responsible_id]).sort()).toEqual([
    ["partnerContact", "sponsors", coachProfile],
    ["partnerRenewal", "sponsors", coachProfile],
  ]);
  // The coach in charge sees both tasks in his own to-do.
  expect((await tasksView(db, coach)).tasks.filter((t) => t.partner_id === id)).toHaveLength(2);
  // A contact today closes the silence task, never the renewal.
  await run(president, clubA, { action: "partnerContacted", id });
  p = (await fundingView(db, president)).partners.find((x) => x.id === id)!;
  expect(p.last_contact_on).toBe(today);
  const after = (await tasksView(db, president)).tasks.filter((t) => t.partner_id === id);
  expect(after.find((t) => t.source_kind === "partnerContact")!.status).toBe("done");
  expect(after.find((t) => t.source_kind === "partnerRenewal")!.status).toBe("todo");
  // The sponsor's sheet keeps only its own conditions.
  expect((await fundingView(db, president)).tasks.filter((t) => t.partner_id === id)).toEqual([]);
  // A person of another club is refused.
  const stranger = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Autre' FROM person LIMIT 1 RETURNING id", [clubB])).rows[0].id;
  await expect(run(president, clubA, { action: "partner", id, name: "Garage Dupont", kind: "sponsor", status: "active", amountCents: 150000, inKind: "", counterpart: "", nextAction: "", notes: "", responsibleId: stranger })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "partnerContacted", id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("reminds the president 30, 7 and 1 days before a deadline, and when a call opens", async () => {
  const ids: string[] = [];
  for (const n of [30, 7, 1, 12]) ids.push((await run(president, clubA, grant({ funder: `Rappel ${n}`, deadlineOn: day(n) }))).id);
  ids.push((await run(president, clubA, grant({ funder: "Ouverture", opensOn: today, deadlineOn: day(60) }))).id);
  await fundingTaskTick(db);
  await fundingTaskTick(db);
  const sent = (await db.query("SELECT resource_id FROM mail_job WHERE kind='funding_task' AND recipient_user_id=$1 AND resource_id=ANY($2::text[])", [president.userId, ids])).rows.map((r) => r.resource_id);
  expect(sent.sort()).toEqual([ids[0], ids[1], ids[2], ids[4]].sort());
});
