import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { acceptInvitation, inviteProfile, type InvitationRow } from "../../src/domains/access/invite";
import { billingExecute, billingTick, billingView, clubDiscount, organizationBilling } from "../../src/domains/billing/service";
import { clubRequestExecute, clubRequestsView, clubRequestTick, confirmClub, requestClub, type ClubRequestInput } from "../../src/domains/independent/service";
import { menuGroups } from "../../src/components/menu";
import type { Transport } from "../../src/domains/notifications/transport";

/**
 * 12/11/2026, a club without a federation, on the real database. A future
 * president asks (same answer whatever happens), confirms by the link, the
 * platform's support accepts: the club is created without a federation, its
 * president invited by the platform, 30 days of trial then 99 € a year,
 * lowered by the discount code the finance made. Club A (affiliated) and its
 * president never see the requests, cannot forge a platform invitation nor
 * apply a code; the daily task sends the trial's notice and the invoices.
 */
const schema = "indep_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, presidentA: Principal, owner: Principal, support: Principal, finance: Principal;
const env = { BETTER_AUTH_URL: "https://pfm.example" };
const sent: { email: string; subject: string; text: string; url: string }[] = [];
const transport: Transport = {
  mode: "local",
  async send(_id, e) {
    sent.push({ email: e.email, subject: e.subject ?? "", text: e.text ?? "", url: e.url ?? "" });
    return "local";
  },
};
const base: ClubRequestInput = { clubName: "Les Roues Libres", countryCode: "FR", city: "Lille", presidentName: "Inès Martin", presidentEmail: "ines@example.test", message: "Douze joueurs, depuis 2019.", discountCode: "", locale: "fr", acceptTerms: true };
const tokenOf = (text: string) => /confirm=([a-f0-9]{64})/.exec(text)?.[1] ?? "";

async function user(name: string, email = `${randomUUID()}@example.test`) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId, email };
}
async function operator(name: string, role: string) {
  const p = await user(name);
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,$2)", [p.userId, role]);
  return p;
}
async function accept(id: string, who: { userId: string; email: string }) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const row = (await c.query("SELECT i.*,o.kind FROM invitation i JOIN organization o ON o.id=i.organization_id WHERE i.id=$1", [id])).rows[0] as InvitationRow;
    await acceptInvitation(c, row, { id: who.userId, email: who.email });
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const today = async () => (await db.query("SELECT (now() AT TIME ZONE 'Europe/Brussels')::date::text AS d")).rows[0].d as string;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  const a = await user("Président A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, a.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [clubA, a.userId])).rows[0].id;
  await execute(db, a, { action: "context", mandateId });
  presidentA = a;
  owner = await operator("Alex", "owner");
  support = await operator("Sam Support", "support");
  finance = await operator("Fin", "finance");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("takes a request without telling whether the address is known, and sends one link at a time", async () => {
  expect(await requestClub(db, { ...base, website: "spam" }, env, transport)).toEqual({ ok: true });
  expect((await db.query("SELECT count(*)::int AS n FROM club_request")).rows[0].n).toBe(0);
  expect(await requestClub(db, base, env, transport)).toEqual({ ok: true });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ email: "ines@example.test", subject: "Confirmez la demande de votre club" });
  expect(sent[0].text).toContain("https://pfm.example/fr/join/club?confirm=");
  // The token is never stored, only its hash.
  expect((await db.query("SELECT count(*)::int AS n FROM club_request WHERE token_hash=$1", [tokenOf(sent[0].text)])).rows[0].n).toBe(0);
  // Again minutes later: same answer, no second mail.
  expect(await requestClub(db, { ...base, presidentEmail: "INES@example.test" }, env, transport)).toEqual({ ok: true });
  expect(sent).toHaveLength(1);
  // Later: a new link, the old one no longer works.
  await db.query("UPDATE club_request SET created_at=now()-interval '1 hour'");
  await requestClub(db, { ...base, discountCode: "BIENVENUE-50" }, env, transport);
  expect(sent).toHaveLength(2);
  await expect(confirmClub(db, tokenOf(sent[0].text), env, transport)).rejects.toMatchObject({ code: "LINK_EXPIRED" });
  // Not confirmed: the console does not show it.
  expect((await clubRequestsView(db, support)).requests).toHaveLength(0);
});

it("goes to the platform's team once confirmed; a club's president never reads the requests", async () => {
  expect(await confirmClub(db, tokenOf(sent[1].text), env, transport)).toEqual({ ok: true, state: "pending" });
  // The team is told: owner and support, not finance.
  const told = sent.slice(2).map((m) => m.subject);
  expect(told).toEqual(["Nouvelle demande de club : Les Roues Libres", "Nouvelle demande de club : Les Roues Libres"]);
  // Twice: same answer.
  expect(await confirmClub(db, tokenOf(sent[1].text), env, transport)).toEqual({ ok: true, state: "pending" });
  const view = await clubRequestsView(db, support);
  expect(view.requests.map((r) => [r.club_name, r.state, r.discount_code, r.discount_usable])).toEqual([["Les Roues Libres", "pending", "BIENVENUE-50", false]]);
  await expect(clubRequestsView(db, presidentA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(clubRequestExecute(db, presidentA, { action: "approve", id: view.requests[0].id }, env, transport)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Finance reads, never decides.
  expect((await clubRequestsView(db, finance)).canDecide).toBe(false);
  await expect(clubRequestExecute(db, finance, { action: "approve", id: view.requests[0].id }, env, transport)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("makes discount codes in the console: owner and finance only, unique, one kind of discount", async () => {
  await expect(billingExecute(db, support, { action: "discount", id: null, code: "BIENVENUE-50", percent: 50, amountCents: null, cycles: 1, validUntil: null, maxUses: 2, note: "", active: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await billingExecute(db, finance, { action: "discount", id: null, code: "BIENVENUE-50", percent: 50, amountCents: null, cycles: 1, validUntil: null, maxUses: 2, note: "Lancement", active: true });
  await expect(billingExecute(db, owner, { action: "discount", id: null, code: "BIENVENUE-50", percent: 10, amountCents: null, cycles: 1, validUntil: null, maxUses: null, note: "", active: true })).rejects.toMatchObject({ code: "DISCOUNT_CODE_TAKEN" });
  await billingExecute(db, owner, { action: "discount", id: null, code: "OFFERT-100", percent: 100, amountCents: null, cycles: null, validUntil: null, maxUses: null, note: "", active: true });
  await billingExecute(db, owner, { action: "discount", id: null, code: "PERIME-10", percent: null, amountCents: 1000, cycles: 1, validUntil: "2020-01-01", maxUses: null, note: "", active: true });
  const v = await billingView(db, finance);
  expect(v.discounts.map((d) => [d.code, d.usable])).toEqual(expect.arrayContaining([["BIENVENUE-50", true], ["OFFERT-100", true], ["PERIME-10", false]]));
  expect((await clubRequestsView(db, support)).requests[0].discount_usable).toBe(true);
});

it("accepts: the club without a federation, its trial, its code, and its president invited by the platform", async () => {
  const id = (await clubRequestsView(db, support)).requests[0].id;
  const r = await clubRequestExecute(db, support, { action: "approve", id }, env, transport);
  expect(r).toMatchObject({ ok: true, discount: "applied" });
  await expect(clubRequestExecute(db, owner, { action: "approve", id }, env, transport)).rejects.toMatchObject({ code: "REQUEST_DECIDED" });
  const club = (await db.query("SELECT name,kind,federation_id,country_code,city,dpa_required FROM organization WHERE id=$1", [r.organizationId])).rows[0];
  expect(club).toEqual({ name: "Les Roues Libres", kind: "club", federation_id: null, country_code: "FR", city: "Lille", dpa_required: true });
  const sub = (await db.query("SELECT s.trial_ends_on::text AS trial,s.auto_invoice,s.discount_cycles_left,p.code,p.amount_cents FROM billing_subscription s JOIN billing_plan p ON p.id=s.plan_id WHERE s.organization_id=$1", [r.organizationId])).rows[0];
  expect(sub).toMatchObject({ auto_invoice: true, discount_cycles_left: 1, code: "club-independant", amount_cents: 9900 });
  expect((await db.query("SELECT ($1::date-$2::date) AS d", [sub.trial, await today()])).rows[0].d).toBe(30);
  expect((await db.query("SELECT uses FROM billing_discount WHERE code='BIENVENUE-50'")).rows[0].uses).toBe(1);
  // The journals: the platform's and the club's.
  expect((await db.query("SELECT kind FROM platform_action WHERE organization_id=$1", [r.organizationId])).rows.map((x) => x.kind)).toContain("club_request.approved");
  expect((await db.query("SELECT action FROM audit_log WHERE organization_id=$1", [r.organizationId])).rows.map((x) => x.action)).toContain("club.created_by_platform");
  // The invitation, sent by the platform, opens the presidency.
  const inv = (await db.query("SELECT id,role,issued_by_platform,issued_by_federation FROM invitation WHERE organization_id=$1", [r.organizationId])).rows[0];
  expect(inv).toMatchObject({ role: "club_president", issued_by_platform: true, issued_by_federation: null });
  const ines = await user("Inès Martin", "ines@example.test");
  await accept(inv.id, ines);
  const mandateId = (await db.query("SELECT id FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='club_president'", [r.organizationId, ines.userId])).rows[0].id;
  await execute(db, ines, { action: "context", mandateId });
  const ws = await workspace(db, ines);
  expect(ws.selected?.federation_id).toBeNull();
  // No federation: no transfers, classification, discipline nor circulars in the menu; club A keeps them.
  const routes = (w: typeof ws) => menuGroups(w as never).flatMap((g) => g.items.map((i) => i.route));
  for (const route of ["/transfers", "/classification", "/discipline", "/circulars"]) expect(routes(ws)).not.toContain(route);
  expect(routes(await workspace(db, presidentA))).toEqual(expect.arrayContaining(["/transfers", "/club/federation"]));
  // Her own billing: the trial and the code; club A sees none of it.
  const mine = await organizationBilling(db, ines);
  expect(mine.subscription).toMatchObject({ trial_ends_on: sub.trial, discount_code: "BIENVENUE-50", discount_percent: 50 });
  expect(mine.canAddCode).toBe(false);
  await expect(clubDiscount(db, ines, "OFFERT-100")).rejects.toMatchObject({ code: "DISCOUNT_EXISTS" });
  expect((await organizationBilling(db, presidentA)).subscription).toBeNull();
  await expect(clubDiscount(db, presidentA, "OFFERT-100")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("refuses a platform invitation that the platform did not send, or whose operator left", async () => {
  // Club A's president forges one for his affiliated club: refused at acceptance.
  const c = await db.connect();
  let forged: string, orphan: string;
  try {
    await c.query("BEGIN");
    forged = (await inviteProfile(c, clubA, presidentA.userId, { email: "forge@example.test", role: "club_president", profileId: null, issuedByPlatform: true })).id;
    const lonely = (await c.query("INSERT INTO organization(name,kind) VALUES('Club seul','club') RETURNING id")).rows[0].id;
    orphan = (await inviteProfile(c, lonely, support.userId, { email: "orphan@example.test", role: "club_president", profileId: null, issuedByPlatform: true })).id;
    await c.query("COMMIT");
  } finally {
    c.release();
  }
  await expect(accept(forged, await user("Forge", "forge@example.test"))).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  // A finance operator, or a support operator revoked since, cannot either.
  await db.query("UPDATE platform_operator SET revoked_at=now() WHERE user_id=$1", [support.userId]);
  await expect(accept(orphan, await user("Orphan", "orphan@example.test"))).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  await db.query("UPDATE platform_operator SET revoked_at=NULL WHERE user_id=$1", [support.userId]);
});

it("sends the trial's notice, then the year's invoice lowered by the code, then a full one a year on", async () => {
  const org = (await db.query("SELECT organization_id FROM club_request WHERE state='approved'")).rows[0].organization_id as string;
  const sub = (await db.query("SELECT id FROM billing_subscription WHERE organization_id=$1", [org])).rows[0].id as string;
  const now = await today();
  await db.query("UPDATE billing_subscription SET trial_ends_on=$2::date+5 WHERE id=$1", [sub, now]);
  await billingTick(db);
  await billingTick(db);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND resource_id=$2", [org, `billing:${sub}:trial`])).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM billing_invoice WHERE subscription_id=$1", [sub])).rows[0].n).toBe(0);
  // The trial ends today: the first invoice leaves, half price, due in 30 days.
  await db.query("UPDATE billing_subscription SET trial_ends_on=$2 WHERE id=$1", [sub, now]);
  await billingTick(db);
  await billingTick(db);
  const first = (await db.query("SELECT number,amount_cents,discount_cents,discount_code,state,period_from::text AS f,period_to::text AS t,(due_on-issued_on) AS days,label,created_by FROM billing_invoice WHERE subscription_id=$1", [sub])).rows;
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ amount_cents: 4950, discount_cents: 4950, discount_code: "BIENVENUE-50", state: "sent", f: now, days: 30 });
  expect(first[0].label).toContain("code BIENVENUE-50");
  expect((await db.query("SELECT ($1::date + interval '1 year' - interval '1 day')::date::text AS d", [now])).rows[0].d).toBe(first[0].t);
  expect((await db.query("SELECT kind FROM platform_action WHERE organization_id=$1 AND kind='billing.auto'", [org])).rowCount).toBe(1);
  expect((await db.query("SELECT discount_cycles_left FROM billing_subscription WHERE id=$1", [sub])).rows[0].discount_cycles_left).toBe(0);
  // A year on: full price, the code's one cycle is used.
  await db.query("UPDATE billing_invoice SET period_to=$2::date-1,period_from=$2::date-365 WHERE subscription_id=$1", [sub, now]);
  await billingTick(db);
  const all = (await db.query("SELECT amount_cents,discount_cents FROM billing_invoice WHERE subscription_id=$1 ORDER BY number", [sub])).rows;
  expect(all).toEqual([
    { amount_cents: 4950, discount_cents: 4950 },
    { amount_cents: 9900, discount_cents: 0 },
  ]);
});

it("lets an independent club's president add a code once; a free code leaves the invoice paid", async () => {
  await requestClub(db, { ...base, clubName: "Club Offert", countryCode: "US", presidentEmail: "free@example.test" }, env, transport);
  await confirmClub(db, tokenOf(sent[sent.length - 1].text), env, transport);
  const id = (await clubRequestsView(db, owner)).requests.find((r) => r.club_name === "Club Offert")!.id;
  const r = await clubRequestExecute(db, owner, { action: "approve", id }, env, transport);
  expect(r.discount).toBe("none");
  const inv = (await db.query("SELECT id FROM invitation WHERE organization_id=$1", [r.organizationId])).rows[0].id;
  const free = await user("Free", "free@example.test");
  await accept(inv, free);
  const mandateId = (await db.query("SELECT id FROM role_assignment WHERE organization_id=$1 AND user_id=$2", [r.organizationId, free.userId])).rows[0].id;
  await execute(db, free, { action: "context", mandateId });
  expect((await organizationBilling(db, free)).canAddCode).toBe(true);
  await expect(clubDiscount(db, free, "PERIME-10")).rejects.toMatchObject({ code: "DISCOUNT_INVALID" });
  await expect(clubDiscount(db, free, "INCONNU-1")).rejects.toMatchObject({ code: "DISCOUNT_INVALID" });
  expect(await clubDiscount(db, free, "offert-100")).toEqual({ ok: true, code: "OFFERT-100" });
  expect((await organizationBilling(db, free)).canAddCode).toBe(false);
  await db.query("UPDATE billing_subscription SET trial_ends_on=CURRENT_DATE-1 WHERE organization_id=$1", [r.organizationId]);
  await billingTick(db);
  expect((await db.query("SELECT amount_cents,state,paid_on IS NOT NULL AS paid FROM billing_invoice WHERE organization_id=$1", [r.organizationId])).rows).toEqual([{ amount_cents: 0, state: "paid", paid: true }]);
  // A code used up refuses the next club.
  await db.query("UPDATE billing_discount SET max_uses=uses WHERE code='OFFERT-100'");
  await expect(billingExecute(db, owner, { action: "applyDiscount", subscriptionId: (await db.query("SELECT id FROM billing_subscription WHERE organization_id=$1", [r.organizationId])).rows[0].id, code: "OFFERT-100" })).rejects.toMatchObject({ code: "DISCOUNT_INVALID" });
});

it("refuses with a reason sent to the requester, and forgets what was never confirmed", async () => {
  await requestClub(db, { ...base, clubName: "Club Douteux", presidentEmail: "doute@example.test", locale: "en" }, env, transport);
  await confirmClub(db, tokenOf(sent[sent.length - 1].text), env, transport);
  const id = (await clubRequestsView(db, support)).requests.find((r) => r.club_name === "Club Douteux")!.id;
  await clubRequestExecute(db, support, { action: "refuse", id, reason: "Nous n'avons pas pu joindre le club." }, env, transport);
  expect(sent[sent.length - 1]).toMatchObject({ email: "doute@example.test", subject: "Your club request" });
  expect(sent[sent.length - 1].text).toContain("Nous n'avons pas pu joindre le club.");
  expect((await db.query("SELECT count(*)::int AS n FROM organization WHERE name='Club Douteux'")).rows[0].n).toBe(0);
  // A new address waits unconfirmed; after 7 days, the daily task removes it.
  await requestClub(db, { ...base, presidentEmail: "jamais@example.test" }, env, transport);
  await db.query("UPDATE club_request SET created_at=now()-interval '8 days' WHERE president_email='jamais@example.test'");
  expect(await clubRequestTick(db)).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM club_request WHERE president_email='jamais@example.test'")).rows[0].n).toBe(0);
});
