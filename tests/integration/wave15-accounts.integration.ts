import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { accountsExecute, accountsLedger, accountsView } from "../../src/domains/accounts/service";
import { moneyDeadlines } from "../../src/domains/funding/service";
import { accountsSheet } from "../../src/domains/accounts/export";
import { accountsCopy } from "../../src/components/accounts-copy";

/** Wave 15 (C12): annual accounts from the ledger, one club at a time, frozen once approved. */
const schema = "w15ac_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, treasurerReader: Principal, coach: Principal;
const lastYear = String(new Date().getUTCFullYear() - 1);
const y = (md: string) => `${lastYear}-${md}`;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const tx = (org: string, user: string, day: string, direction: string, category: string, cents: number) =>
  db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,$2,'Opération',$3,$4,$5,$6)", [org, day, direction, category, cents, user]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  treasurerReader = await actor(clubA, "coach", ["dues.read"]);
  coach = await actor(clubA, "coach");
  const u = president.userId;
  // Before the year: 1 000 € opening balance. During the year: dues, a sponsor, equipment, the hall, one "other".
  await tx(clubA, u, `${Number(lastYear) - 1}-11-15`, "in", "donation", 100000);
  await tx(clubA, u, y("02-01"), "in", "dues", 50000);
  await tx(clubA, u, y("03-01"), "in", "sponsor", 120000);
  await tx(clubA, u, y("04-01"), "out", "equipment", 30000);
  await tx(clubA, u, y("05-01"), "out", "venue", 20000);
  await tx(clubA, u, y("06-01"), "out", "other", 5000);
  // A cancelled line and another club's line never count.
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by,cancelled_at,cancel_reason) VALUES($1,$2,'Erreur','in','dues',99900,$3,now(),'Saisie en double')", [clubA, y("07-01"), u]);
  await tx(clubB, presidentB.userId, y("02-01"), "in", "dues", 777700);
  // A chair bought with a grant, and a grant awarded but not paid at the closing.
  await db.query("INSERT INTO equipment_chair(organization_id,name,acquired_on,purchase_value_cents) VALUES($1,'Strike 1',$2,950000)", [clubA, y("09-01")]);
  await db.query("INSERT INTO grant_application(organization_id,funder,purpose,requested_cents,granted_cents,status,decision_on,created_by) VALUES($1,'ADEPS','Fauteuils',800000,600000,'granted',$2,$3)", [clubA, y("10-01"), u]);
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

it("prepares last year's accounts from the ledger of the club only", async () => {
  const v = await accountsView(db, president);
  expect(v.year).toEqual({ from: y("01-01"), to: y("12-31"), label: lastYear });
  expect(v.figures.statement.income).toMatchObject({ dues: 50000, gifts: 120000 });
  expect(v.figures.statement.expenses).toMatchObject({ goods_out: 30000, services: 20000, other_out: 5000 });
  expect([v.figures.opening, v.figures.closing, v.figures.statement.result]).toEqual([100000, 215000, 115000]);
  expect(v.figures.assets).toMatchObject({ treasury: 215000, grants: 600000, equipment: 950000 });
  expect(v.controls).toEqual({ balance: "ok", categories: "fail", dates: "ok", carried: "na" });
  // Totals match the ledger of the year.
  const ledger = await accountsLedger(db, president, v.year.from);
  const net = ledger.rows.reduce((n, r) => n + (r.direction === "in" ? r.amount_cents : -r.amount_cents), 0);
  expect(net).toBe(v.figures.statement.result);
  expect(JSON.stringify(v)).not.toContain("777700");
  const b = await accountsView(db, presidentB);
  expect(b.figures.statement.income.dues).toBe(777700);
  // The sheet for the accountant has the statements and the ledger.
  const sheet = accountsSheet(v, ledger, accountsCopy.fr);
  expect(sheet.some((r) => r[0] === "Cotisations" && r[1] === 500)).toBe(true);
  expect(sheet.filter((r) => r[0] === "Opération").length).toBe(0);
  // The ledger annex: its header, then the five lines of the year.
  expect(sheet.filter((r) => r[1] === "Opération")).toHaveLength(6);
});

it("follows the club's mapping and its financial year start", async () => {
  await accountsExecute(db, president, { action: "mapping", direction: "in", category: "sponsor", rubric: "other_in" }, clubA);
  await expect(accountsExecute(db, president, { action: "mapping", direction: "in", category: "dues", rubric: "services" }, clubA)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  let v = await accountsView(db, president, y("01-01"));
  expect(v.figures.statement.income).toMatchObject({ gifts: 0, other_in: 120000 });
  expect(v.mapping.find((m) => m.direction === "in" && m.category === "sponsor")).toMatchObject({ rubric: "other_in", custom: true });
  expect((await accountsView(db, presidentB)).figures.statement.income.other_in).toBe(0);
  await accountsExecute(db, president, { action: "fiscalStart", start: "07-01" }, clubA);
  v = await accountsView(db, president, y("01-01"));
  expect(v.year.from).toBe(`${Number(lastYear) - 1}-07-01`);
  await accountsExecute(db, president, { action: "fiscalStart", start: "01-01" }, clubA);
});

it("lets a reader see, the treasurer complete, then freezes the approved version", async () => {
  await expect(accountsView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await accountsView(db, treasurerReader)).can.manage).toBe(false);
  await expect(accountsExecute(db, treasurerReader, { action: "save", yearStart: y("01-01"), manual: [], commitments: "" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await accountsExecute(
    db,
    president,
    { action: "save", yearStart: y("01-01"), manual: [{ side: "debt", label: "Facture de la salle de décembre", cents: 25000, comment: "Payée en janvier" }], commitments: "Fauteuil prêté par la ligue." },
    clubA,
  );
  let v = await accountsView(db, president);
  expect([v.figures.totalDebts, v.record?.status]).toEqual([25000, "draft"]);
  await expect(accountsExecute(db, president, { action: "approve", yearStart: y("01-01"), on: `${Number(lastYear) + 1}-04-20` }, clubA)).rejects.toMatchObject({ code: "ACCOUNTS_LOCKED" });
  await accountsExecute(db, president, { action: "verify", yearStart: y("01-01"), name: "Claire Trésorière", on: `${Number(lastYear) + 1}-03-01` }, clubA);
  await accountsExecute(db, president, { action: "approve", yearStart: y("01-01"), on: `${Number(lastYear) + 1}-04-20` }, clubA);
  // Frozen: a new line in the ledger does not change the approved accounts, and they cannot be saved.
  await tx(clubA, president.userId, y("12-15"), "in", "dues", 1000);
  v = await accountsView(db, president);
  expect([v.record?.status, v.figures.statement.income.dues, v.deadlines.filing]).toEqual(["approved", 50000, `${Number(lastYear) + 1}-05-20`]);
  await expect(accountsExecute(db, president, { action: "save", yearStart: y("01-01"), manual: [], commitments: "" }, clubA)).rejects.toMatchObject({ code: "ACCOUNTS_LOCKED" });
  await expect(accountsExecute(db, presidentB, { action: "file", yearStart: y("01-01"), on: `${Number(lastYear) + 1}-05-01` }, clubB)).rejects.toMatchObject({ code: "ACCOUNTS_LOCKED" });
  // A correction: version 2, a draft again, with the new figures; the approved one stays in the history.
  await accountsExecute(db, president, { action: "reopen", yearStart: y("01-01") }, clubA);
  v = await accountsView(db, president);
  expect([v.record?.version, v.record?.status, v.figures.statement.income.dues, v.record?.manual.length]).toEqual([2, "draft", 51000, 1]);
  expect(v.versions.map((x) => [x.version, x.status, !!x.superseded_at])).toEqual([
    [2, "draft", false],
    [1, "approved", true],
  ]);
});

it("puts the assembly then the filing in the deadlines layer of money people only", async () => {
  const from = `${Number(lastYear) + 1}-01-01`,
    to = `${Number(lastYear) + 1}-12-31`;
  const layer = await moneyDeadlines(db, president, from, to);
  expect(layer.items.filter((d) => d.source === "accounts").map((d) => [d.kind, d.date])).toEqual([["accountsAssembly", `${Number(lastYear) + 1}-06-30`]]);
  expect((await moneyDeadlines(db, presidentB, from, to)).items.filter((d) => d.source === "accounts")).toHaveLength(1);
});
