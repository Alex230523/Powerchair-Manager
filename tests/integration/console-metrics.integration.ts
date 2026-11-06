import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { consoleHome } from "../../src/domains/console/service";
import { alertItems, alertPrefSave, alertPrefView, alertTick, computeMetrics, generateReport, monthlyReportTick, reportGenerate, reportPdf, reportsView, snapshotMetrics, trends } from "../../src/domains/console/metrics";
import { billingExecute } from "../../src/domains/billing/service";

/**
 * Console, series A (06/11/2026): the daily snapshots and the trends the
 * dashboard reads from them; the operators' alert, by their rules, from
 * their hour, once a day; the monthly report archived as a PDF.
 */
const schema = "metrics_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` }),
  mailDir = `.local/test-mail-${schema}`;
let clubA: string, owner: Principal, reader: Principal;

async function user(name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  return { userId, sessionId };
}
async function operator(name: string, role: string) {
  const p = await user(name);
  await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,$2)", [p.userId, role]);
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  const president = await user("Président A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, president.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [clubA, president.userId])).rows[0].id;
  await execute(db, president, { action: "context", mandateId });
  await db.query("INSERT INTO organization(name,kind) VALUES('Club sans président','club')");
  owner = await operator("Alex", "owner");
  reader = await operator("Rita", "readonly");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
  await rm(mailDir, { recursive: true, force: true });
});

it("snapshots the figures every hour and reads the trends from them", async () => {
  const m = await computeMetrics(db);
  expect(m).toMatchObject({ clubs: 2, federations: 0, noPresident: 1, "clubs:BE": 2 });
  expect(await snapshotMetrics(db)).toBeGreaterThan(20);
  // A second snapshot the same day overwrites; the past is made up to see the trends.
  await db.query("INSERT INTO organization(name,kind) VALUES('Club C','club')");
  await snapshotMetrics(db);
  expect((await db.query("SELECT value FROM platform_metric_daily WHERE day=CURRENT_DATE AND key='clubs'")).rows[0].value).toBe("3");
  await db.query("INSERT INTO platform_metric_daily(day,key,value) VALUES (CURRENT_DATE-31,'clubs',1),(CURRENT_DATE-31,'players',4),(CURRENT_DATE-70,'clubs',1),(date_trunc('month',CURRENT_DATE)-interval '2 months','clubs',1)");
  const c = await db.connect();
  try {
    const t = await trends(c, ["clubs", "players", "mrr"]);
    expect(t.clubs.prev30).toBe(1);
    expect(t.players.prev30).toBe(4);
    expect(t.mrr.prev30).toBeNull();
    expect(t.clubs.series.length).toBeGreaterThanOrEqual(2);
    expect(t.clubs.series.at(-1)).toMatchObject({ value: 3 });
  } finally {
    c.release();
  }
  const home = await consoleHome(db, owner);
  expect(home.trends.clubs.prev30).toBe(1);
  expect(home.trends.clubs.series.at(-1)?.value).toBe(3);
});

it("sends the daily alert to the operators who want it, by their rules, from their hour, once a day", async () => {
  const env = { PFM_MAIL_DIR: mailDir, MAIL_TRANSPORT: "local", BETTER_AUTH_URL: "https://pfm.test" };
  expect((await alertItems(db)).map((i) => i.rule)).toContain("noPresident");
  // Rita only wants the late invoices; Alex everything from midnight. Nothing late: Rita gets nothing.
  await alertPrefSave(db, reader, { action: "alertPref", email: true, hour: 0, rules: ["invoicesFinalReminder"] });
  await alertPrefSave(db, owner, { action: "alertPref", email: true, hour: 0, rules: ["noPresident", "invoicesFinalReminder", "jobsLate"] });
  expect((await alertPrefView(db, reader)).rules).toEqual(["invoicesFinalReminder"]);
  expect(await alertTick(db, env)).toBe(1);
  const sent = (await db.query("SELECT operator_id,items FROM platform_alert_log ORDER BY operator_id")).rows as { operator_id: string; items: { rule: string; count: number }[] }[];
  expect(sent.map((x) => x.operator_id)).toEqual([owner.userId]);
  expect(sent[0].items.map((i) => i.rule)).toEqual(["noPresident"]);
  const files = (await readdir(mailDir)).filter((f) => f.endsWith(".json"));
  expect(files).toHaveLength(1);
  const mail = JSON.parse(await readFile(`${mailDir}/${files[0]}`, "utf8")) as { email?: string; envelope?: { email: string; subject: string; text: string } };
  const envelope = mail.envelope ?? (mail as unknown as { email: string; subject: string; text: string });
  expect(envelope.text).toContain("Organisations sans président actif : 2");
  expect(envelope.text).toContain("https://pfm.test/fr/console");
  // The same day: nothing more; an operator who turned it off never gets it.
  expect(await alertTick(db, env)).toBe(0);
  expect((await alertPrefView(db, owner)).last?.items).toHaveLength(1);
  await alertPrefSave(db, reader, { action: "alertPref", email: false, hour: 0, rules: ["noPresident"] });
  await db.query("DELETE FROM platform_alert_log");
  expect(await alertTick(db, env)).toBe(1);
});

it("archives the previous month's report as a PDF, once, and lets the owner generate one again", async () => {
  // Readings for last month (the first test made some up): the report comes once, with its figures.
  const month = (await db.query("SELECT to_char(date_trunc('month',CURRENT_DATE)-interval '1 month','YYYY-MM-DD') AS m")).rows[0].m as string;
  await db.query("INSERT INTO platform_metric_daily(day,key,value) VALUES ($1::date,'clubs',1),($1::date+27,'clubs',2),($1::date+27,'players',12),($1::date+27,'mrr',4000),($1::date+27,'open',24000),($1::date+27,'late',0),($1::date+27,'lateCount',0)", [month]);
  const plan = (await billingExecute(db, owner, { action: "plan", id: null, code: "club-an", name: "Club, annuel", amountCents: 24000, period: "year", basis: "organization", active: true })).id!;
  const sub = (await billingExecute(db, owner, { action: "subscribe", organizationId: clubA, planId: plan, startedOn: month, note: "" })).id!;
  const inv = (await billingExecute(db, owner, { action: "invoice", subscriptionId: sub, periodFrom: month, periodTo: month, dueDays: 30 })).id!;
  await db.query("UPDATE billing_invoice SET issued_on=$2::date+3,due_on=$2::date+33,state='sent',sent_at=now() WHERE id=$1", [inv, month]);
  await db.query("DELETE FROM platform_report");
  expect(await monthlyReportTick(db)).toBe(1);
  expect(await monthlyReportTick(db)).toBe(0);
  const list = await reportsView(db, reader);
  expect(list.reports.map((r) => r.month)).toEqual([month]);
  expect(list.reports[0].summary).toMatchObject({ end: { clubs: 2, players: 12 }, start: { clubs: 1 }, billing: { invoiced: 24000, collected: 0, invoices: 1 } });
  const pdf = await reportPdf(db, reader, list.reports[0].id);
  expect(Buffer.from(pdf.pdf).subarray(0, 5).toString()).toBe("%PDF-");
  // Generated again by the owner (not by a reader), journaled.
  await expect(reportGenerate(db, reader, month)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await reportGenerate(db, owner, month);
  expect((await db.query("SELECT count(*)::int AS n FROM platform_report")).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM platform_action WHERE kind='report.generate'")).rows[0].n).toBe(1);
  const again = await generateReport(db, month);
  expect(again.summary.month).toBe(month);
});
