import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { belcotaxExport, identityRequestInfo, identityRequestSubmit, receiptByToken, receiptFile, taxApprovalView, taxExecute, taxPurge, taxView } from "../../src/domains/tax/service";
import { taxCommand } from "../../src/domains/tax/schema";
import { automationsView } from "../../src/domains/automations/service";
import { plan, type Club } from "../../src/domains/automations/engine";
import { validNationalNumber } from "../../src/domains/tax/identity";

/**
 * B8: tax receipts for gifts (281.71). A club not approved sees nothing;
 * two gifts under the threshold then over it; sponsoring left out; a donor
 * without a national number flagged; the national number sealed, shown and
 * typed only with the dedicated right, each opening journaled; the donor's
 * secure form; a corrected receipt; the Belcotax file checked; the filing
 * reminder; the purge after ten years; two clubs apart.
 */
const schema = "b8tax_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, treasurer: Principal, treasurerMandate: string, coach: Principal;
const nn = (base: string) => base + String(97 - (Number(base) % 97)).padStart(2, "0");
const marieNumber = nn("850730033");
const bce = (base8: string) => base8 + String(97 - (Number(base8) % 97)).padStart(2, "0");

async function actor(org: string, role: string, name: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, mandateId: mandateId as string };
}
const run = (p: Principal, org: string, cmd: Record<string, unknown>) => taxExecute(db, p, taxCommand.parse(cmd), org) as Promise<Record<string, unknown>>;
let marie: string, jan: string, bakery: string;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind,address,company_number) VALUES('Club A','club','Rue du Stade 1, 1300 Wavre',$1) RETURNING id", [bce("04123456").replace(/(\d{4})(\d{3})(\d{3})/, "$1.$2.$3")])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const t = await actor(clubA, "coach", "Trésorier", ["dues.manage", "dues.read"]);
  treasurer = t.p;
  treasurerMandate = t.mandateId;
  coach = (await actor(clubA, "coach", "Coach")).p;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("shows nothing to a club that is not approved, and asks the number and period on « oui »", async () => {
  expect(await taxApprovalView(db, president)).toMatchObject({ approved: false, thresholdCents: 4000, canEdit: true });
  await expect(taxView(db, president)).rejects.toMatchObject({ code: "TAX_NOT_APPROVED" });
  await expect(run(president, clubA, { action: "donor", kind: "person", name: "Marie Peeters" })).rejects.toMatchObject({ code: "TAX_NOT_APPROVED" });
  expect((await automationsView(db, president)).rules.map((r) => r.rule)).not.toContain("taxDeadline");
  await expect(run(president, clubA, { action: "approval", approved: true, number: "" })).rejects.toMatchObject({ code: "TAX_APPROVAL_REQUIRED" });
  await expect(run(treasurer, clubA, { action: "approval", approved: true, number: "AG-1", from: "2024-01-01", to: "2029-12-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await run(president, clubA, { action: "approval", approved: true, number: "AG-2024-15", from: "2024-01-01", to: "2029-12-31", thresholdCents: 4000 });
  expect((await taxView(db, treasurer, 2025)).club.approvalNumber).toBe("AG-2024-15");
  expect((await automationsView(db, president)).rules.map((r) => r.rule)).toContain("taxDeadline");
  await expect(taxView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("adds two gifts under the threshold into one receipt, leaves sponsoring out and flags a missing national number", async () => {
  marie = (await run(treasurer, clubA, { action: "donor", kind: "person", name: "Marie Peeters", street: "Rue Haute 3", postalCode: "1300", city: "Wavre", email: "marie@example.test" })).id as string;
  jan = (await run(treasurer, clubA, { action: "donor", kind: "person", name: "Jan Janssens", street: "Kerkstraat 1", postalCode: "9000", city: "Gent" })).id as string;
  await expect(run(treasurer, clubA, { action: "donor", kind: "company", name: "Boulangerie SA", companyNumber: "0123456789" })).rejects.toMatchObject({ code: "INVALID_COMPANY_NUMBER" });
  bakery = (await run(treasurer, clubA, { action: "donor", kind: "company", name: "Boulangerie SA", street: "Grand-Place 1", postalCode: "1000", city: "Bruxelles", companyNumber: bce("08765432") })).id as string;
  await run(treasurer, clubA, { action: "gift", donorId: marie, receivedOn: "2025-03-01", amountCents: 2500, nature: "gift" });
  let v = await taxView(db, treasurer, 2025);
  expect(v.report.eligible).toEqual([]);
  expect(v.report.below).toEqual([marie]);
  await run(treasurer, clubA, { action: "gift", donorId: marie, receivedOn: "2025-11-01", amountCents: 2000, nature: "gift" });
  await run(treasurer, clubA, { action: "gift", donorId: jan, receivedOn: "2025-05-01", amountCents: 3000, nature: "gift" });
  await run(treasurer, clubA, { action: "gift", donorId: jan, receivedOn: "2025-05-02", amountCents: 50000, nature: "sponsor" });
  await run(treasurer, clubA, { action: "gift", donorId: bakery, receivedOn: "2025-06-01", amountCents: 25000, nature: "gift" });
  v = await taxView(db, treasurer, 2025);
  expect(v.donors.find((d) => d.id === marie)!.total_cents).toBe(4500);
  expect(v.donors.find((d) => d.id === jan)!.total_cents).toBe(3000);
  expect(v.report.eligible.sort()).toEqual([marie, bakery].sort());
  expect(v.report.below).toEqual([jan]);
  expect(v.report.missing).toEqual([marie]);
  // The donor's last gift sets the purge date, ten years later.
  expect(v.donors.find((d) => d.id === marie)!.purge_after).toBe("2035-11-01");
});

it("keeps the national number sealed, shown and typed only with the dedicated right, each opening journaled", async () => {
  await expect(run(treasurer, clubA, { action: "national", donorId: marie, value: marieNumber })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(president, clubA, { action: "national", donorId: marie, value: "85073003300" })).rejects.toMatchObject({ code: "INVALID_NATIONAL_NUMBER" });
  // Through the donor's secure form, not typed by the club.
  await run(treasurer, clubA, { action: "requestNational", donorId: marie });
  const mail = (await db.query("SELECT payload_ciphertext,resource_type,kind FROM mail_job WHERE kind='tax_identity'")).rows;
  expect(mail).toHaveLength(1);
  expect(mail[0].resource_type).toBe("tax");
  const { unseal } = await import("../../src/domains/notifications/crypto");
  const job = (await db.query("SELECT dedupe_key,payload_ciphertext FROM mail_job WHERE kind='tax_identity'")).rows[0];
  const url = unseal<{ url: string; email: string }>(job.payload_ciphertext, job.dedupe_key).url;
  const token = url.split("/").pop()!;
  expect(await identityRequestInfo(db, token)).toEqual({ name: "Marie Peeters", organization: "Club A" });
  await expect(identityRequestSubmit(db, token, "12345678901")).rejects.toMatchObject({ code: "INVALID_NATIONAL_NUMBER" });
  await identityRequestSubmit(db, token, marieNumber.replace(/(\d{2})(\d{2})(\d{2})(\d{3})(\d{2})/, "$1.$2.$3-$4.$5"));
  await expect(identityRequestInfo(db, token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const row = (await db.query("SELECT national_sealed FROM tax_donor WHERE id=$1", [marie])).rows[0];
  expect(row.national_sealed).not.toContain(marieNumber);
  expect(validNationalNumber(marieNumber)).toBe(true);
  // The treasurer sees « known », not the number; the presidency opens it and the journal says so.
  expect((await taxView(db, treasurer, 2025)).donors.find((d) => d.id === marie)).toMatchObject({ has_national: true });
  expect(JSON.stringify(await taxView(db, treasurer, 2025))).not.toContain(marieNumber);
  await expect(run(treasurer, clubA, { action: "revealNational", donorId: marie })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await run(president, clubA, { action: "revealNational", donorId: marie })).toEqual({ value: marieNumber.replace(/(\d{2})(\d{2})(\d{2})(\d{3})(\d{2})/, "$1.$2.$3-$4.$5") });
  // The right given to the treasurer, then the treasurer opens it too.
  await run(president, clubA, { action: "identityRight", mandateId: treasurerMandate, granted: true });
  await execute(db, treasurer, { action: "context", mandateId: treasurerMandate });
  await run(treasurer, clubA, { action: "revealNational", donorId: marie });
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='tax.national.read' AND target_id=$1", [marie])).rows[0].n).toBe(2);
  expect((await db.query("SELECT details->>'by' AS by FROM audit_log WHERE action='tax.national.set' AND target_id=$1", [marie])).rows[0].by).toBe("donor");
});

it("issues the receipts, gives each a PDF and a private link, then corrects one and keeps the history", async () => {
  await expect(run(treasurer, clubA, { action: "issue", year: 2099 })).rejects.toMatchObject({ code: "INVALID_DATE" });
  expect(await run(treasurer, clubA, { action: "issue", year: 2025 })).toEqual({ issued: 2 });
  expect(await run(treasurer, clubA, { action: "issue", year: 2025 })).toEqual({ issued: 0 });
  let v = await taxView(db, treasurer, 2025);
  const first = v.receipts.find((r) => r.donor_id === marie)!;
  expect(first).toMatchObject({ amount_cents: 4500, status: "issued" });
  const pdf = Buffer.from((await receiptFile(db, treasurer, first.id)).bytes).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).not.toContain(marieNumber);
  // The snapshot never holds the full number.
  expect(JSON.stringify((await db.query("SELECT snapshot FROM tax_receipt WHERE id=$1", [first.id])).rows[0].snapshot)).not.toContain(marieNumber);
  // Sent: only to donors with an address (Marie), through a private link.
  expect(await run(treasurer, clubA, { action: "send", year: 2025 })).toEqual({ sent: 1 });
  const { unseal } = await import("../../src/domains/notifications/crypto");
  const job = (await db.query("SELECT dedupe_key,payload_ciphertext FROM mail_job WHERE kind='tax_receipt'")).rows[0];
  const sealed = unseal<{ url: string; email: string }>(job.payload_ciphertext, job.dedupe_key);
  expect(sealed.email).toBe("marie@example.test");
  const link = sealed.url;
  expect(Buffer.from((await receiptByToken(db, link.split("/").pop()!)).bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
  // A gift found later: the receipt is corrected with the same number.
  await run(treasurer, clubA, { action: "gift", donorId: marie, receivedOn: "2025-12-20", amountCents: 1000, nature: "gift" });
  const corrected = (await run(treasurer, clubA, { action: "correct", id: first.id, reason: "Don de décembre oublié" })).id;
  v = await taxView(db, treasurer, 2025);
  expect(v.receipts.find((r) => r.id === first.id)).toMatchObject({ status: "corrected", reason: "Don de décembre oublié" });
  expect(v.receipts.find((r) => r.id === corrected)).toMatchObject({ status: "issued", amount_cents: 5500, sequence: first.sequence, correction: true });
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='tax.receipt.corrected'")).rows[0].n).toBe(1);
});

it("checks the Belcotax file before it leaves and only with the dedicated right", async () => {
  await execute(db, treasurer, { action: "context", mandateId: treasurerMandate });
  await run(president, clubA, { action: "identityRight", mandateId: treasurerMandate, granted: false });
  await expect(belcotaxExport(db, treasurer, 2025)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const check = (await belcotaxExport(db, president, 2025, true)) as { issues: { code: string }[]; fiches: number };
  expect(check.fiches).toBe(2);
  expect(check.issues).toEqual([]);
  const out = (await belcotaxExport(db, president, 2025)) as { xml: string; name: string };
  expect(out.name).toBe("belcotax-281-71-2025.xml");
  expect(out.xml).toContain(`<f2011_nationaalnr>${marieNumber}</f2011_nationaalnr>`);
  expect(out.xml).toContain("<f2028_typetraitement>1</f2028_typetraitement>");
  expect(out.xml).toContain("<r8012_controletotaal>30500</r8012_controletotaal>");
  // A cancelled receipt goes in the file as a cancellation.
  const bakeryReceipt = (await taxView(db, president, 2025)).receipts.find((r) => r.donor_id === bakery)!;
  await run(president, clubA, { action: "cancelReceipt", id: bakeryReceipt.id, reason: "Don remboursé à la demande" });
  expect(((await belcotaxExport(db, president, 2025)) as { xml: string }).xml).toContain("<f2028_typetraitement>3</f2028_typetraitement>");
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='tax.national.read' AND details->>'purpose' LIKE 'belcotax%'")).rows[0].n).toBe(3);
});

it("reminds the presidency before the filing deadline, once", async () => {
  const club = (await db.query("SELECT id,name,disabled_modules AS disabled,dues_rules,automations_stopped AS stopped,tax_approved FROM organization WHERE id=$1", [clubA])).rows[0] as Club;
  const c = await db.connect();
  try {
    const at = async (day: string) => (await plan(c, club, day, ["taxDeadline"])).filter((l) => l.rule === "taxDeadline");
    expect(await at("2026-01-15")).toEqual([]);
    // A notification and an e-mail to the presidency, and a task in the to-do.
    expect((await at("2026-02-10")).map((l) => [l.about, l.due, l.recipient, l.actions.join("+")])).toEqual([
      ["2025", "2026-02-28", "Présidente", "notify+email"],
      ["2025", "2026-02-28", "", "task"],
    ]);
    expect(await at("2026-03-01")).toEqual([]);
  } finally {
    c.release();
  }
});

it("hides the module on « non » without erasing, purges after ten years, and keeps two clubs apart", async () => {
  await expect(taxView(db, presidentB)).rejects.toMatchObject({ code: "TAX_NOT_APPROVED" });
  await run(presidentB, clubB, { action: "approval", approved: true, number: "AG-B", from: "2025-01-01", to: "2030-12-31" });
  const b = await taxView(db, presidentB, 2025);
  expect(b.donors).toEqual([]);
  expect(b.receipts).toEqual([]);
  await expect(run(presidentB, clubB, { action: "revealNational", donorId: marie })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, clubB, { action: "gift", donorId: marie, receivedOn: "2025-01-01", amountCents: 100, nature: "gift" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // « Non »: hidden, nothing erased; « oui » again finds everything.
  await run(president, clubA, { action: "approval", approved: false });
  await expect(taxView(db, president, 2025)).rejects.toMatchObject({ code: "TAX_NOT_APPROVED" });
  expect((await db.query("SELECT count(*)::int AS n FROM tax_receipt WHERE organization_id=$1", [clubA])).rows[0].n).toBe(3);
  expect(await taxApprovalView(db, president)).toMatchObject({ approved: false, number: "AG-2024-15" });
  await run(president, clubA, { action: "approval", approved: true, number: "AG-2024-15", from: "2024-01-01", to: "2029-12-31" });
  // Ten years after Marie's last gift (2025-12-20): her number and address go, the receipts stay.
  // Jan's (2025-05-02) and the bakery's (2025-06-01) come first; Marie's on 2035-12-20.
  expect(await taxPurge(db, "2035-12-19")).toBe(2);
  expect((await db.query("SELECT purged_at FROM tax_donor WHERE id=$1", [marie])).rows[0].purged_at).toBeNull();
  expect(await taxPurge(db, "2035-12-20")).toBe(1);
  expect((await db.query("SELECT national_sealed,street,purged_at IS NOT NULL AS purged FROM tax_donor WHERE id=$1", [marie])).rows[0]).toEqual({ national_sealed: null, street: "", purged: true });
  expect((await db.query("SELECT count(*)::int AS n FROM tax_receipt WHERE donor_id=$1", [marie])).rows[0].n).toBe(2);
});
