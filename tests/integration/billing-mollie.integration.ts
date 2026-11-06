import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { billingExecute, billingView, organizationBilling } from "../../src/domains/billing/service";
import { createPaymentLink, mollieConfigured, mollieMode, mollieWebhook } from "../../src/domains/billing/mollie";
import { ublForOperator, ublForOrganization } from "../../src/domains/billing/ubl";

/**
 * Console, series B (06/11/2026): the Mollie payment link on a sent invoice,
 * the webhook that reads the link back and marks the invoice paid once,
 * the electronic invoice (UBL) for the operators and for the presidency,
 * of its own invoices only.
 */
const schema = "mollie_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, owner: Principal, support: Principal, invoice: string;
const env = { MOLLIE_API_KEY: "test_" + "a".repeat(30), BETTER_AUTH_URL: "https://pfm.test/", PFM_SELLER_NAME: "PFM SRL", PFM_SELLER_VAT: "BE0999999999", PFM_SELLER_IBAN: "BE68539007547034", PFM_VAT_RATE: "21" };
const calls: { method: string; url: string; body?: unknown }[] = [];
let paidAt: string | null = null;
const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  calls.push({ method: init?.method ?? "GET", url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (u.endsWith("/payment-links") && init?.method === "POST") return new Response(JSON.stringify({ id: "pl_test1", _links: { paymentLink: { href: "https://pay.test/pl_test1" } } }), { status: 201, headers: { "content-type": "application/json" } });
  if (u.endsWith("/payment-links/pl_test1")) return new Response(JSON.stringify({ id: "pl_test1", paidAt, status: paidAt ? "paid" : "open" }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 404 });
}) as typeof fetch;

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

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind,company_number,address) VALUES('Club A','club','0123.456.789','Rue du Stade 1, 1000 Bruxelles') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Présidente B");
  owner = await operator("Alex", "owner");
  support = await operator("Sam Support", "support");
  const plan = (await billingExecute(db, owner, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24200, period: "year", basis: "organization", active: true })).id!;
  const sub = (await billingExecute(db, owner, { action: "subscribe", organizationId: clubA, planId: plan, startedOn: "2026-11-01", note: "" })).id!;
  invoice = (await billingExecute(db, owner, { action: "invoice", subscriptionId: sub, periodFrom: "2026-11-01", periodTo: "2027-10-31", dueDays: 30 })).id!;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("knows whether Mollie is configured, and in which mode", () => {
  expect(mollieConfigured({})).toBe(false);
  expect(mollieConfigured({ MOLLIE_API_KEY: "live_short" })).toBe(false);
  expect(mollieMode(env)).toBe("test");
  expect(mollieMode({ MOLLIE_API_KEY: "live_" + "b".repeat(30) })).toBe("live");
  expect(mollieMode({})).toBeNull();
});

it("sends the invoice (by transfer when Mollie is off), then carries the payment link once Mollie creates it", async () => {
  // In the tests nothing is configured: the invoice leaves without a link and the journal says so.
  const sent = await billingExecute(db, owner, { action: "send", id: invoice });
  expect(sent.recipients).toBe(1);
  expect((await db.query("SELECT payload->>'mollie' AS m FROM platform_action WHERE kind='billing.send'")).rows[0].m).toBe("off");
  expect((await organizationBilling(db, presidentA)).invoices[0]).toMatchObject({ state: "sent", pay_url: "", paid_via: "" });
  // Mollie configured: a payment link, posted with the amount, our return page and our webhook; stored on the invoice.
  const c = await db.connect();
  try {
    const inv = (await c.query("SELECT id,number,amount_cents,'Club A' AS organization FROM billing_invoice WHERE id=$1", [invoice])).rows[0];
    const link = await createPaymentLink(c, inv, env, fakeFetch);
    expect(link).toEqual({ id: "pl_test1", url: "https://pay.test/pl_test1" });
    expect(await createPaymentLink(c, inv, {}, fakeFetch)).toBeNull();
  } finally {
    c.release();
  }
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.mollie.com/v2/payment-links", body: { amount: { currency: "EUR", value: "242.00" }, redirectUrl: "https://pfm.test/fr/club/billing", webhookUrl: "https://pfm.test/api/billing/mollie", reusable: false } });
  expect((calls[0].body as { description: string }).description).toContain("F-2026-0001");
  const mine = await organizationBilling(db, presidentA);
  expect(mine.invoices[0].pay_url).toBe("https://pay.test/pl_test1");
  expect((await organizationBilling(db, presidentB)).invoices).toHaveLength(0);
  expect((await billingView(db, owner)).mollie).toBeNull();
});

it("marks the invoice paid from the webhook only once the API says so, once, and journals every call", async () => {
  // An unknown link, a malformed one: nothing changes, the call is kept.
  expect(await mollieWebhook(db, "pl_other", env, fakeFetch)).toEqual({ outcome: "unknown-link" });
  expect(await mollieWebhook(db, "../etc", env, fakeFetch)).toEqual({ outcome: "ignored" });
  // Known but not paid yet: the state stays.
  expect(await mollieWebhook(db, "pl_test1", env, fakeFetch)).toEqual({ outcome: "not-paid" });
  expect((await db.query("SELECT state FROM billing_invoice WHERE id=$1", [invoice])).rows[0].state).toBe("sent");
  // Paid: the invoice is paid on the day Mollie says, « en ligne »; a second call changes nothing.
  paidAt = "2026-11-06T10:00:00+00:00";
  expect(await mollieWebhook(db, "pl_test1", env, fakeFetch)).toEqual({ outcome: "paid" });
  expect((await db.query("SELECT state,paid_on::text AS paid_on,paid_via FROM billing_invoice WHERE id=$1", [invoice])).rows[0]).toEqual({ state: "paid", paid_on: "2026-11-06", paid_via: "mollie" });
  expect(await mollieWebhook(db, "pl_test1", env, fakeFetch)).toEqual({ outcome: "already-paid" });
  await expect(billingExecute(db, owner, { action: "paid", id: invoice, paidOn: "2026-11-06" })).rejects.toMatchObject({ code: "INVOICE_STATE" });
  const hooks = (await db.query("SELECT external_id,outcome,status FROM billing_webhook ORDER BY received_at,outcome")).rows;
  expect(hooks.map((h) => h.outcome)).toEqual(["unknown-link", "not-paid", "paid", "already-paid"]);
  expect(hooks[2]).toMatchObject({ external_id: "pl_test1", status: "paid" });
  expect((await organizationBilling(db, presidentA)).invoices[0]).toMatchObject({ state: "paid", paid_via: "mollie" });
  // Mollie unreachable: the webhook fails so Mollie retries, nothing is written.
  await expect(mollieWebhook(db, "pl_test1", env, (async () => new Response("", { status: 500 })) as typeof fetch)).rejects.toMatchObject({ status: 500 });
  expect((await db.query("SELECT count(*)::int AS n FROM billing_webhook")).rows[0].n).toBe(4);
});

it("gives the electronic invoice (UBL) to the operators and to the presidency of the invoiced organisation only", async () => {
  const ops = await ublForOperator(db, support, invoice);
  expect(ops.number).toBe("F-2026-0001");
  expect(ops.xml).toContain("<cbc:ID>F-2026-0001</cbc:ID>");
  expect(ops.xml).toContain("<cbc:RegistrationName>Club A</cbc:RegistrationName>");
  expect(ops.xml).toContain("<cbc:CompanyID>BE0123456789</cbc:CompanyID>");
  expect(ops.xml).toContain('<cbc:PayableAmount currencyID="EUR">242.00</cbc:PayableAmount>');
  expect(ops.xml).toContain('<cbc:TaxAmount currencyID="EUR">42.00</cbc:TaxAmount>');
  expect(ops.xml).toContain("<cbc:Note>Paid on 2026-11-06</cbc:Note>");
  const mine = await ublForOrganization(db, presidentA, invoice);
  expect(mine.xml).toBe(ops.xml);
  await expect(ublForOrganization(db, presidentB, invoice)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A draft is not an invoice yet.
  const sub = (await db.query("SELECT subscription_id FROM billing_invoice WHERE id=$1", [invoice])).rows[0].subscription_id as string;
  const draft = (await billingExecute(db, owner, { action: "invoice", subscriptionId: sub, periodFrom: "2027-11-01", periodTo: "2028-10-31", dueDays: 30 })).id!;
  await expect(ublForOperator(db, owner, draft)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(ublForOrganization(db, presidentA, draft)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
