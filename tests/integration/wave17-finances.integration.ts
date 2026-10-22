import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { financeExecute, financeView, statementFile, statementRemove, statementUpload, statementsView } from "../../src/domains/finance/service";
import { undoExecute } from "../../src/domains/undo/service";

/**
 * Wave 17 (N1): deleting an operation (not in an approved year, not one made
 * elsewhere), with its undo and its trace; bank statements filed with the
 * gap to the platform's cash. Two clubs.
 */
const schema = "w17fin_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, presidentA: Principal, presidentB: Principal;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const record = async (org: string, by: Principal, label: string, direction: "in" | "out", amountCents: number, occurredOn = today) =>
  (
    await financeExecute(
      db,
      by,
      { action: "record", occurredOn, label, direction, category: direction === "in" ? "donation" : "equipment", amountCents, method: "transfer", counterparty: "", reference: "", notes: "" } as never,
      org,
    )
  ).id as string;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("deletes an operation with a reason, traced, hidden from the totals, and the undo brings it back", async () => {
  await record(clubA, presidentA, "Don de départ", "in", 50000);
  const chair = await record(clubA, presidentA, "Pneus de fauteuil", "out", 12000);
  expect((await financeView(db, presidentA)).summary.balance).toBe(38000);
  await expect(financeExecute(db, presidentB, { action: "delete", id: chair, reason: "Erreur" } as never, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const r = (await financeExecute(db, presidentA, { action: "delete", id: chair, reason: "Saisie en double" } as never, clubA)) as { id: string; undo?: string };
  const view = await financeView(db, presidentA);
  expect(view.entries.map((e) => e.label)).toEqual(["Don de départ"]);
  expect(view.summary.balance).toBe(50000);
  const trace = (await db.query("SELECT details FROM audit_log WHERE action='finance.delete' AND target_id=$1", [chair])).rows[0].details;
  expect(trace).toMatchObject({ amountCents: 12000, reason: "Saisie en double", direction: "out" });
  await undoExecute(db, presidentA, { id: r.undo! }, clubA);
  const back = await financeView(db, presidentA);
  expect(back.entries.map((e) => e.label).sort()).toEqual(["Don de départ", "Pneus de fauteuil"]);
  expect(back.entries.find((e) => e.id === chair)!.cancelled_at).toBeNull();
  expect(back.summary.balance).toBe(38000);
});

it("refuses to delete in a year approved by the assembly, or an operation made elsewhere", async () => {
  const old = await record(clubA, presidentA, "Ancienne dépense", "out", 3000, "2025-03-10");
  await db.query("INSERT INTO annual_accounts(organization_id,year_start,year_end,status,approved_on,snapshot,created_by) VALUES($1,'2025-01-01','2025-12-31','approved','2026-03-01','{}',$2)", [
    clubA,
    presidentA.userId,
  ]);
  await expect(financeExecute(db, presidentA, { action: "delete", id: old, reason: "Erreur" } as never, clubA)).rejects.toMatchObject({ code: "YEAR_APPROVED" });
  // A sponsor payment is deleted from the sponsor's file.
  const paid = await record(clubA, presidentA, "Sponsor payé", "in", 20000);
  await db.query("INSERT INTO partner(organization_id,name,kind,created_by,payment_transaction_id) VALUES($1,'Sponsor','sponsor',$2,$3)", [clubA, presidentA.userId, paid]);
  await expect(financeExecute(db, presidentA, { action: "delete", id: paid, reason: "Erreur" } as never, clubA)).rejects.toMatchObject({ code: "LINKED_OPERATION" });
  expect((await financeView(db, presidentA)).entries.find((e) => e.id === paid)!.origin).not.toBeNull();
});

it("files a bank statement, reads the CSV balance and shows the gap with the platform's cash", async () => {
  const month = today.slice(0, 7);
  const csv = "Date;Libellé;Montant;Solde\n2026-10-01;Don;500,00;1.200,00\n2026-10-15;Pneus;-120,00;1.080,00\n";
  const up = await statementUpload(db, presidentA, { account: "Compte courant", month, balanceCents: null, file: { name: "releve.csv", bytes: new TextEncoder().encode(csv) } }, clubA);
  expect(up.balanceCents).toBe(108000);
  const pdf = await statementUpload(db, presidentA, { account: "", month, balanceCents: 61000, file: { name: "releve.pdf", bytes: new TextEncoder().encode("%PDF-1.7 test") } }, clubA);
  await expect(statementUpload(db, presidentA, { account: "", month, balanceCents: null, file: { name: "photo.png", bytes: new Uint8Array([137, 80, 78, 71]) } }, clubA)).rejects.toMatchObject({
    code: "INVALID_FILE",
  });
  const view = await statementsView(db, presidentA);
  const platform = (await financeView(db, presidentA)).summary.balance;
  const fromCsv = view.statements.find((s) => s.filename === "releve.csv")!;
  expect(fromCsv).toMatchObject({ balance_source: "csv", closing_balance_cents: 108000, platform_cents: platform, gap_cents: 108000 - platform });
  expect(view.statements.find((s) => s.id === pdf.id)).toMatchObject({ balance_source: "entered", closing_balance_cents: 61000 });
  // The other club sees nothing of it.
  expect((await statementsView(db, presidentB)).statements).toEqual([]);
  await expect(statementFile(db, presidentB, pdf.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(statementRemove(db, presidentB, pdf.id, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await statementFile(db, presidentA, pdf.id)).media_type).toBe("application/pdf");
  await statementRemove(db, presidentA, pdf.id, clubA);
  expect((await statementsView(db, presidentA)).statements.map((s) => s.filename)).toEqual(["releve.csv"]);
  // Statements count in the club's storage.
  expect((await db.query("SELECT count(*)::int AS n FROM storage_file WHERE organization_id=$1 AND origin='statement'", [clubA])).rows[0].n).toBe(1);
});
