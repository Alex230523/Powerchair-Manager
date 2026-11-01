import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { duesExecute } from "../../src/domains/dues/service";
import { bankExecute, bankView } from "../../src/domains/bank/service";
import { bankCommand } from "../../src/domains/bank/schema";
import { formatReference, validReference } from "../../src/domains/bank/reference";
import { playerProfileView } from "../../src/domains/player-profile/service";

/**
 * B1 (lot 09): bank accounts, structured references, statement import and
 * reconciliation. A fee of 250 € in four instalments of 62,50 € is one
 * receivable; a partial payment; the same statement imported twice; a
 * payment without reference; an overpayment then its refund; a sibling
 * payment split in two; a cancelled reconciliation; a new season; two
 * clubs apart; rights (a parent sees only their fees and their QR).
 */
const schema = "b1bank_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal, coach: Principal, parent: Principal, season: string, team: string;
let ana: string, bilal: string, plan: string, anaFee: string, bilalFee: string;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  const p = { userId, sessionId };
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function player(name: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2011-05-05','{player}') RETURNING id", [clubA, person, name])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
  return id as string;
}
const dues = (p: Principal, org: string, cmd: Record<string, unknown>) => duesExecute(db, p, cmd as never, org) as Promise<Record<string, unknown>>;
const bank = (p: Principal, org: string, cmd: Record<string, unknown>) => bankExecute(db, p, bankCommand.parse(cmd), org) as Promise<Record<string, unknown>>;
const paid = async (receivable: string) =>
  (await db.query("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM finance_transaction WHERE receivable_id=$1 AND cancelled_at IS NULL AND direction='in'", [receivable])).rows[0].n as number;
const refOf = async (receivable: string) => (await db.query("SELECT reference FROM dues_receivable WHERE id=$1", [receivable])).rows[0].reference as string;
const instalments = async (receivable: string) =>
  (await db.query("SELECT ordinal,amount_cents,reference FROM dues_installment WHERE receivable_id=$1 ORDER BY ordinal", [receivable])).rows as { ordinal: number; amount_cents: number; reference: string }[];
const line = (bookedOn: string, amountCents: number, counterparty: string, communication: string, bankRef: string) => ({ bookedOn, amountCents, counterparty, counterpartyIban: "", communication, bankRef });
const lineId = async (bankRef: string, org = clubA) => (await db.query("SELECT id FROM bank_line WHERE bank_ref=$1 AND organization_id=$2", [bankRef, org])).rows[0].id as string;
let statement: ReturnType<typeof line>[] = [];

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Président B");
  coach = await actor(clubA, "coach", "Coach");
  parent = await actor(clubA, "guardian", "Parent");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  ana = await player("Ana Peeters");
  bilal = await player("Bilal Peeters");
  const parentProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Marie Peeters' FROM person WHERE user_id=$2 RETURNING id", [clubA, parent.userId])).rows[0].id;
  for (const child of [ana, bilal])
    await db.query("INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)", [clubA, parentProfile, child, presidentA.userId]);
  plan = (await dues(presidentA, clubA, { action: "plan", seasonId: season, category: "Joueur", amountCents: 25000, maxInstallments: 4, firstDue: "2026-11-01" })).id as string;
  for (const who of [ana, bilal])
    await dues(presidentA, clubA, { action: "issueMany", planId: plan, target: { kind: "person", profileId: who }, installments: 4, firstDue: "2026-11-01", exemptions: [], excluded: [], notify: false });
  anaFee = (await db.query("SELECT id FROM dues_receivable WHERE profile_id=$1", [ana])).rows[0].id;
  bilalFee = (await db.query("SELECT id FROM dues_receivable WHERE profile_id=$1", [bilal])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives a fee of 250 € in four instalments one receivable, each with its own structured communication", async () => {
  expect((await db.query("SELECT count(*)::int AS n FROM dues_receivable WHERE profile_id=$1", [ana])).rows[0].n).toBe(1);
  const parts = await instalments(anaFee);
  expect(parts.map((p) => p.amount_cents)).toEqual([6250, 6250, 6250, 6250]);
  const refs = [await refOf(anaFee), ...parts.map((p) => p.reference)];
  expect(new Set(refs).size).toBe(5);
  expect(refs.every(validReference)).toBe(true);
});

it("checks the IBAN and keeps one dues account", async () => {
  await expect(bank(presidentA, clubA, { action: "account", label: "Compte courant", iban: "BE68 5390 0754 7035", forDues: true })).rejects.toMatchObject({ code: "INVALID_IBAN" });
  const first = (await bank(presidentA, clubA, { action: "account", label: "Compte courant", iban: "BE68 5390 0754 7034", forDues: true })).id as string;
  await bank(presidentA, clubA, { action: "account", label: "Épargne", iban: "BE71 0961 2345 6769", forDues: true });
  const view = await bankView(db, presidentA);
  expect(view.accounts.filter((a) => a.for_dues).map((a) => a.label)).toEqual(["Épargne"]);
  await bank(presidentA, clubA, { action: "account", id: first, label: "Compte courant", iban: "BE68539007547034", forDues: true });
  expect((await bankView(db, presidentA)).accounts.find((a) => a.for_dues)?.iban).toBe("BE68539007547034");
});

it("reconciles by itself only an exact reference within what is left, and a statement imported twice creates nothing", async () => {
  const [first] = await instalments(anaFee);
  statement = [
    line("2026-10-02", 6250, "PEETERS MARIE", formatReference(first.reference), "REF-1"),
    line("2026-10-03", 3000, "PEETERS MARIE", (await refOf(anaFee)).replace(/(\d{3})(\d{4})(\d{5})/, "$1/$2/$3"), "REF-2"),
    line("2026-10-04", 10000, "M. PEETERS", "cotisations enfants", "REF-3"),
    line("2026-10-05", -8450, "Sport Shop", "Ballons", "REF-4"),
    line("2026-10-06", 50000, "PEETERS MARIE", formatReference(await refOf(anaFee)), "REF-5"),
  ];
  const preview = (await bank(presidentA, clubA, { action: "preview", lines: statement })).lines as { duplicate: boolean; automatic: boolean }[];
  expect(preview.map((l) => l.automatic)).toEqual([true, true, false, false, false]);
  const done = await bank(presidentA, clubA, { action: "import", format: "camt", lines: statement, filename: "octobre.xml" });
  expect(done).toMatchObject({ created: 5, matched: 2, duplicates: 0 });
  // Partial: 62,50 + 30,00 paid, the rest still due.
  expect(await paid(anaFee)).toBe(9250);
  expect((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE bank_line_id IS NOT NULL")).rows[0].n).toBe(2);
  const again = await bank(presidentA, clubA, { action: "import", format: "camt", lines: statement, filename: "octobre.xml" });
  expect(again).toMatchObject({ created: 0, matched: 0, duplicates: 5 });
  expect((await db.query("SELECT count(*)::int AS n FROM bank_line")).rows[0].n).toBe(5);
  expect((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE bank_line_id IS NOT NULL")).rows[0].n).toBe(2);
  expect((await db.query("SELECT count(*)::int AS n FROM dues_history WHERE receivable_id=$1 AND action='payment'", [anaFee])).rows[0].n).toBe(2);
});

it("ranks suggestions for a payment without reference and splits it between siblings", async () => {
  const view = await bankView(db, presidentA);
  const three = await lineId("REF-3");
  const ranked = view.suggestions[three];
  expect(ranked.map((s) => s.id).sort()).toEqual([anaFee, bilalFee].sort());
  expect(ranked.every((s) => s.reasons.includes("name"))).toBe(true);
  // More than what is left on one receivable is refused.
  await expect(bank(presidentA, clubA, { action: "allocate", lineId: three, parts: [{ target: "receivable", targetId: anaFee, amountCents: 20000 }] })).rejects.toMatchObject({ code: "OVERPAID" });
  await bank(presidentA, clubA, {
    action: "allocate",
    lineId: three,
    parts: [
      { target: "receivable", targetId: anaFee, amountCents: 5000 },
      { target: "receivable", targetId: bilalFee, amountCents: 5000 },
    ],
  });
  expect(await paid(anaFee)).toBe(14250);
  expect(await paid(bilalFee)).toBe(5000);
  expect((await db.query("SELECT status FROM bank_line WHERE id=$1", [three])).rows[0].status).toBe("matched");
  // An expense goes to the ledger as « other », never to a fee.
  const four = await lineId("REF-4");
  await expect(bank(presidentA, clubA, { action: "allocate", lineId: four, parts: [{ target: "receivable", targetId: anaFee, amountCents: 8450 }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await bank(presidentA, clubA, { action: "allocate", lineId: four, parts: [{ target: "other", amountCents: 8450, category: "equipment" }] });
  expect((await db.query("SELECT direction,category FROM finance_transaction WHERE bank_line_id=$1", [four])).rows[0]).toEqual({ direction: "out", category: "equipment" });
});

it("carries an overpayment as a credit, then uses part of it and refunds the rest", async () => {
  const five = await lineId("REF-5");
  // 500 € with Ana's reference: more than what is left, so a person decides.
  expect((await db.query("SELECT status FROM bank_line WHERE id=$1", [five])).rows[0].status).toBe("new");
  const left = 25000 - (await paid(anaFee));
  await bank(presidentA, clubA, {
    action: "allocate",
    lineId: five,
    parts: [
      { target: "receivable", targetId: anaFee, amountCents: left },
      { target: "credit", targetId: ana, amountCents: 50000 - left },
    ],
  });
  expect(await paid(anaFee)).toBe(25000);
  const credit = () => bankView(db, presidentA).then((v) => v.credits.find((c) => c.profile_id === ana)?.cents ?? 0);
  expect(await credit()).toBe(50000 - left);
  // The credit pays Bilal's fee (same family), up to what is left there.
  await expect(bank(presidentA, clubA, { action: "applyCredit", profileId: ana, receivableId: bilalFee, amountCents: 30000 })).rejects.toMatchObject({ code: "OVERPAID" });
  await bank(presidentA, clubA, { action: "applyCredit", profileId: ana, receivableId: bilalFee, amountCents: 20000 });
  expect(await paid(bilalFee)).toBe(25000);
  const rest = 50000 - left - 20000;
  expect(await credit()).toBe(rest);
  await expect(bank(presidentA, clubA, { action: "refundCredit", profileId: ana, amountCents: rest + 1, occurredOn: "2026-10-10", reason: "Trop versé" })).rejects.toMatchObject({ code: "CREDIT_TOO_LOW" });
  await bank(presidentA, clubA, { action: "refundCredit", profileId: ana, amountCents: rest, occurredOn: "2026-10-10", reason: "Trop versé en octobre" });
  expect(await credit()).toBe(0);
  // The cash: 500 in, the refund out; the line still counted once.
  const money = (await db.query("SELECT sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END)::int AS n FROM finance_transaction WHERE cancelled_at IS NULL AND (bank_line_id=$1 OR label LIKE 'Remboursement%')", [five])).rows[0].n;
  expect(money).toBe(50000 - rest);
});

it("cancels a reconciliation only with a reason, with its ledger line, and keeps the trace", async () => {
  const one = await lineId("REF-1");
  const allocation = (await db.query("SELECT id FROM bank_allocation WHERE line_id=$1", [one])).rows[0].id;
  expect(() => bankCommand.parse({ action: "cancelAllocation", id: allocation, reason: "x" })).toThrow();
  const before = await paid(anaFee);
  await bank(presidentA, clubA, { action: "cancelAllocation", id: allocation, reason: "Virement rejeté par la banque" });
  expect(await paid(anaFee)).toBe(before - 6250);
  expect((await db.query("SELECT status FROM bank_line WHERE id=$1", [one])).rows[0].status).toBe("new");
  expect((await db.query("SELECT count(*)::int AS n FROM dues_history WHERE receivable_id=$1 AND action='payment_cancelled'", [anaFee])).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='bank.allocation.cancelled'")).rows[0].n).toBe(1);
  // Ignored, then back.
  await bank(presidentA, clubA, { action: "ignore", lineId: one, ignored: true });
  await bank(presidentA, clubA, { action: "ignore", lineId: one, ignored: false });
  expect((await db.query("SELECT status FROM bank_line WHERE id=$1", [one])).rows[0].status).toBe("new");
});

it("keeps last season's reference for last season's fee and gives the new season new ones", async () => {
  const next = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2027-28',CURRENT_DATE+241,CURRENT_DATE+600) RETURNING id", [clubA])).rows[0].id;
  const nextPlan = (await dues(presidentA, clubA, { action: "plan", seasonId: next, category: "Joueur", amountCents: 26000, maxInstallments: 1, firstDue: "2027-09-01" })).id as string;
  await dues(presidentA, clubA, { action: "issueMany", planId: nextPlan, target: { kind: "person", profileId: ana }, installments: 1, firstDue: "2027-09-01", exemptions: [], excluded: [], notify: false });
  const newFee = (await db.query("SELECT id FROM dues_receivable WHERE profile_id=$1 AND season_id=$2", [ana, next])).rows[0].id;
  expect(await refOf(newFee)).not.toBe(await refOf(anaFee));
  // A late transfer for last season, with last season's instalment reference, still files itself there.
  const [first] = await instalments(anaFee);
  const out = await bank(presidentA, clubA, { action: "import", format: "csv", lines: [line("2026-10-20", 6250, "PEETERS MARIE", formatReference(first.reference), "REF-6")] });
  expect(out).toMatchObject({ matched: 1 });
  expect(await paid(anaFee)).toBe(25000);
  expect(await paid(newFee)).toBe(0);
});

it("keeps two clubs apart", async () => {
  const b = await bankView(db, presidentB);
  expect(b.lines).toEqual([]);
  expect(b.receivables).toEqual([]);
  await expect(bank(presidentB, clubB, { action: "allocate", lineId: await lineId("REF-1"), parts: [{ target: "other", amountCents: 100, category: "other" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The same statement in club B is new there and reconciles nothing of club A.
  const out = await bank(presidentB, clubB, { action: "import", format: "camt", lines: statement });
  expect(out).toMatchObject({ created: 5, matched: 0 });
  await expect(bank(presidentA, clubB, { action: "preview", lines: statement })).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});

it("reserves the bank to dues.manage; a parent sees their own fees and the QR's account", async () => {
  await expect(bankView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(bankView(db, parent)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const sheet = await playerProfileView(db, parent, bilal);
  expect(sheet.payment).toMatchObject({ iban: "BE68539007547034", holder: "Club A" });
  expect((sheet.dues as { reference: string }[])[0].reference).toBe(await refOf(bilalFee));
  const stranger = await player("Zoé Martin");
  await expect(playerProfileView(db, parent, stranger)).rejects.toBeTruthy();
});
