import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { consoleExecute, consoleOrganization, consoleHome } from "../../src/domains/console/service";
import { billingExecute, billingTick, billingView, organizationBilling } from "../../src/domains/billing/service";

/**
 * Console, steps 3 and 4 (05/11/2026): an organisation suspended by the
 * platform reads the reason and writes nothing; the platform's plans,
 * subscriptions, invoices, payments and reminders, by hand and by the
 * daily task; the presidency reads its own invoices only.
 */
const schema = "bill_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, owner: Principal, finance: Principal, support: Principal;

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function actor(org: string, role: string, name: string) {
  const p = await user(name);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, p.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, p.userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function operator(name: string, role: string) {
  const p = await user(name);
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,$2)", [p.userId, role]);
  return p;
}
const mails = async (org: string, key: string) => (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND resource_id=$2", [org, key])).rows[0].n as number;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Présidente B");
  for (const n of ["Léa", "Noa", "Sam"]) {
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status,phone) VALUES($1,$2,$3,'2000-01-01','{player}','active','0470 11 22 33')", [clubA, person, n]);
  }
  owner = await operator("Alex", "owner");
  finance = await operator("Fin", "finance");
  support = await operator("Sam Support", "support");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("suspends an organisation: read only with the reason, written in its journal; then reinstates it", async () => {
  await expect(consoleExecute(db, finance, { action: "suspend", organizationId: clubA, reason: "Impayé depuis 60 jours" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await consoleExecute(db, support, { action: "suspend", organizationId: clubA, reason: "Impayé depuis 60 jours" });
  await expect(consoleExecute(db, support, { action: "suspend", organizationId: clubA, reason: "Encore" })).rejects.toMatchObject({ code: "ALREADY_SUSPENDED" });
  const sheet = await consoleOrganization(db, support, clubA);
  expect(sheet.organization.suspended_reason).toBe("Impayé depuis 60 jours");
  expect(sheet.organization.suspended_at).not.toBeNull();
  expect(sheet.actions.map((a) => [a.kind, a.reason])).toEqual([["suspend", "Impayé depuis 60 jours"]]);
  // The club's own journal says it, and its workspace carries the reason.
  expect((await db.query("SELECT action FROM audit_log WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1", [clubA])).rows[0].action).toBe("platform.suspend");
  const ws = await workspace(db, presidentA);
  expect(ws.selected?.suspended_reason).toBe("Impayé depuis 60 jours");
  expect(ws.selected?.suspended_at).not.toBeNull();
  expect((await consoleHome(db, owner)).todos.find((x) => x.key === "suspended")).toMatchObject({ count: 1, organizations: [{ name: "Club A" }] });
  await consoleExecute(db, owner, { action: "reinstate", organizationId: clubA });
  await expect(consoleExecute(db, owner, { action: "reinstate", organizationId: clubA })).rejects.toMatchObject({ code: "NOT_SUSPENDED" });
  expect((await consoleOrganization(db, support, clubA)).organization.suspended_at).toBeNull();
});

it("bills a subscription: plan, invoice per period, sent to the presidency, paid, reminded by steps", async () => {
  await expect(billingExecute(db, support, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const planA = (await billingExecute(db, finance, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).id!;
  const planP = (await billingExecute(db, owner, { action: "plan", id: null, code: "joueur-mois", name: "Par joueur, mensuel", amountCents: 300, period: "month", basis: "player", active: true })).id!;
  const old = (await billingExecute(db, owner, { action: "plan", id: null, code: "ancien", name: "Ancien", amountCents: 100, period: "year", basis: "organization", active: false })).id!;
  await expect(billingExecute(db, finance, { action: "subscribe", organizationId: clubA, planId: old, startedOn: "2026-09-01", note: "" })).rejects.toMatchObject({ code: "PLAN_INACTIVE" });
  await billingExecute(db, finance, { action: "subscribe", organizationId: clubA, planId: planP, startedOn: "2026-09-01", note: "Essai" });
  await expect(billingExecute(db, finance, { action: "subscribe", organizationId: clubA, planId: planA, startedOn: "2026-09-01", note: "" })).rejects.toMatchObject({ code: "SUBSCRIPTION_EXISTS" });
  await billingExecute(db, finance, { action: "subscribe", organizationId: clubB, planId: planA, startedOn: "2026-09-01", note: "" });
  const v = await billingView(db, support);
  expect(v.canBill).toBe(false);
  // 12/11/2026: the plan of clubs without a federation comes with the migrations.
  expect(v.plans.filter((p) => p.code !== "club-independant").map((p) => [p.code, p.subscribers])).toEqual([
    ["club-an", 1],
    ["joueur-mois", 1],
    ["ancien", 0],
  ]);
  // Monthly recurring revenue: 240 €/12 + 3 € (per player, counted at the invoice, one for the figure).
  expect(v.figures.mrr).toBe(2000 + 300);
  // Per player: three active players at the invoice's date.
  const subA = v.subscriptions.find((s) => s.organization === "Club A")!;
  await expect(billingExecute(db, finance, { action: "invoice", subscriptionId: subA.id, periodFrom: "2026-10-01", periodTo: "2026-09-30", dueDays: 30 })).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  const inv = (await billingExecute(db, finance, { action: "invoice", subscriptionId: subA.id, periodFrom: "2026-10-01", periodTo: "2026-10-31", dueDays: 30 })).id!;
  let row = (await billingView(db, finance)).invoices.find((i) => i.id === inv)!;
  expect(row).toMatchObject({ state: "draft", quantity: 3, unit_cents: 300, amount_cents: 900, reminders: 0 });
  expect(row.number).toMatch(/^F-\d{4}-0001$/);
  // The presidency sees nothing of a draft; sent, it gets the notice and reads it on its page; club B sees nothing of it.
  expect((await organizationBilling(db, presidentA)).invoices).toEqual([]);
  await expect(billingExecute(db, finance, { action: "paid", id: inv, paidOn: "2026-11-05" })).rejects.toMatchObject({ code: "INVOICE_STATE" });
  expect((await billingExecute(db, finance, { action: "send", id: inv })).recipients).toBe(1);
  expect(await mails(clubA, `billing:${inv}:sent`)).toBe(1);
  const mine = await organizationBilling(db, presidentA);
  expect(mine.subscription).toMatchObject({ plan: "Par joueur, mensuel", basis: "player" });
  expect(mine.invoices.map((i) => [i.number, i.state, i.amount_cents])).toEqual([[row.number, "sent", 900]]);
  expect(mine.open).toBe(900);
  expect((await organizationBilling(db, presidentB)).invoices).toEqual([]);
  // Reminders by hand, three at most; the daily task sends the steps after the due date, one a day.
  await billingExecute(db, finance, { action: "remind", id: inv });
  expect(await mails(clubA, `billing:${inv}:reminder:1`)).toBe(1);
  expect(await billingTick(db)).toBe(0);
  await db.query("UPDATE billing_invoice SET issued_on=CURRENT_DATE-55,due_on=CURRENT_DATE-25,last_reminder_at=now()-interval '2 days' WHERE id=$1", [inv]);
  expect(await billingTick(db)).toBe(1);
  row = (await billingView(db, finance)).invoices.find((i) => i.id === inv)!;
  expect(row).toMatchObject({ reminders: 2, late: true });
  expect((await db.query("SELECT level,sent_by FROM billing_reminder WHERE invoice_id=$1 ORDER BY level", [inv])).rows).toEqual([
    { level: 1, sent_by: finance.userId },
    { level: 2, sent_by: null },
  ]);
  // Same day: nothing more; the figures count the late amount.
  expect(await billingTick(db)).toBe(0);
  expect((await billingView(db, finance)).figures).toMatchObject({ open: 900, late: 900, lateCount: 1 });
  expect((await consoleHome(db, owner)).todos.find((x) => x.key === "invoicesLate")).toMatchObject({ count: 1, organizations: [{ name: "Club A" }] });
  // Paid: closed; nothing more to remind; the organisation's sheet shows the subscription.
  await billingExecute(db, finance, { action: "paid", id: inv, paidOn: "2026-11-05" });
  await expect(billingExecute(db, finance, { action: "remind", id: inv })).rejects.toMatchObject({ code: "INVOICE_STATE" });
  await expect(billingExecute(db, finance, { action: "cancel", id: inv })).rejects.toMatchObject({ code: "INVOICE_STATE" });
  expect((await billingView(db, finance)).figures.open).toBe(0);
  expect((await consoleOrganization(db, finance, clubA)).subscription).toMatchObject({ plan: "Par joueur, mensuel", open_invoices: 0 });
  await billingExecute(db, finance, { action: "unsubscribe", id: subA.id, endedOn: "2026-11-05" });
  expect((await consoleOrganization(db, finance, clubA)).subscription).toBeNull();
  expect((await consoleHome(db, owner)).recentActions.map((a) => a.kind).slice(0, 3)).toEqual(["billing.unsubscribe", "billing.paid", "billing.remind"]);
});
