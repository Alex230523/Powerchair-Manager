import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { inviteProfile } from "../../src/domains/access/invite";
import { careCommand, careExecute, closureTick, dataRequestCreate, exportDownload, exportTick, retentionTick, securityView } from "../../src/domains/legal/service";
import { keptTables } from "../../src/domains/legal/schema";
import { DPA_VERSION } from "../../src/domains/legal/texts";
import { brusselsDay } from "../../src/lib/today";

/**
 * 21: opening to other clubs. No member invited before the agreement is
 * accepted; a new version asks again; the full export read back; the
 * closure cancelled within its delay then done, nothing left but the
 * accounting; an erasure request sent to the right club; the planned
 * purge; two clubs.
 */
const schema = "care_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, member: Principal, profile: string;

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
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => careExecute(db, p, careCommand.parse(cmd), org) as Promise<Record<string, unknown>>;
async function invite(org: string, by: string, email: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await inviteProfile(c, org, by, { email, role: "coach", profileId: null });
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  // Club A is opened by its federation: its president must accept the agreement.
  clubA = (await db.query("INSERT INTO organization(name,kind,dpa_required) VALUES('Club A','club',true) RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente A")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const m = await actor(clubA, "player", "Léa Martin");
  member = m.p;
  profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Martin','2000-01-01','{player}') RETURNING id", [clubA, m.person])).rows[0].id;
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,'Cotisation Léa','in','dues',12000,$2)", [clubA, president.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("invites no member before the presidency accepts the agreement, and asks again for a new version", async () => {
  await expect(invite(clubA, president.userId, "coach@example.test")).rejects.toMatchObject({ code: "DPA_REQUIRED" });
  expect((await securityView(db, president)).dpa).toMatchObject({ required: true, upToDate: false, accepted: null, current: DPA_VERSION });
  await expect(run(president, { action: "acceptDpa", version: "2020-01-01" })).rejects.toMatchObject({ code: "STALE_VERSION" });
  await run(president, { action: "acceptDpa", version: DPA_VERSION });
  const v = await securityView(db, president);
  expect(v.dpa).toMatchObject({ upToDate: true, accepted: { version: DPA_VERSION, accepted_by: "Présidente A" } });
  expect((await db.query("SELECT text_sha256 FROM club_dpa_acceptance WHERE organization_id=$1", [clubA])).rows[0].text_sha256).toMatch(/^[0-9a-f]{64}$/);
  await invite(clubA, president.userId, "coach@example.test");
  // Club B accepted an older version once: the current one is asked for.
  await db.query("INSERT INTO club_dpa_acceptance(organization_id,version,text_sha256,accepted_by) VALUES($1,'2025-01-01',$2,$3)", [clubB, "0".repeat(64), presidentB.userId]);
  expect((await securityView(db, presidentB)).dpa.upToDate).toBe(false);
  await expect(invite(clubB, presidentB.userId, "x@example.test")).rejects.toMatchObject({ code: "DPA_REQUIRED" });
  // A player may not accept nor see the page.
  await expect(securityView(db, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("builds the full export in the background, readable and consistent, for the presidency only", async () => {
  const r = await run(president, { action: "export" });
  expect(await exportTick(db)).toBe(1);
  expect((await securityView(db, president)).exports[0].status).toBe("ready");
  const file = await exportDownload(db, president, String(r.token));
  const text = Buffer.from(file.bytes).toString("utf8");
  expect(text).toContain("README.json");
  expect(text).toContain("data/club_person.csv");
  expect(text).toContain("Léa Martin");
  expect(text).toContain("data/finance_transaction.json");
  // No secret ever leaves: the token itself is not in the archive.
  expect(text).not.toContain(String(r.token));
  await expect(exportDownload(db, presidentB, String(r.token))).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await db.query("SELECT downloaded_at FROM club_export WHERE organization_id=$1", [clubA])).rows[0].downloaded_at).toBeTruthy();
});

it("sends an erasure request to the club that holds the data, and lets it answer", async () => {
  const r = await dataRequestCreate(db, member, { organizationId: clubA, kind: "erasure", details: "Je quitte le club" });
  expect(r.organizationId).toBe(clubA);
  expect((await db.query("SELECT count(*)::int AS n FROM app_notification WHERE recipient_user_id=$1 AND resource_id=$2", [president.userId, `data_request:${r.id}`])).rows[0].n).toBe(1);
  const seen = (await securityView(db, president)).requests;
  expect(seen[0]).toMatchObject({ kind: "erasure", status: "received", person: "Léa Martin" });
  expect((await securityView(db, presidentB)).requests).toEqual([]);
  await expect(run(presidentB, { action: "request", id: r.id, status: "done" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await run(president, { action: "request", id: r.id, status: "done", response: "Données effacées." });
  // A club the person does not belong to is refused.
  await expect(dataRequestCreate(db, member, { organizationId: clubB, kind: "access", details: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("purges on schedule within the club's bounds, and writes it in the journal", async () => {
  await expect(run(president, { action: "retention", category: "notifications", months: 1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await run(president, { action: "retention", category: "notifications", months: 3 });
  await db.query("UPDATE app_notification SET created_at=now()-interval '4 months' WHERE organization_id=$1", [clubA]);
  await db.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id,created_at) VALUES($1,$2,'old.action',$3,now()-interval '7 years')", [clubA, president.userId, String(clubA)]);
  expect(await retentionTick(db)).toBeGreaterThan(1);
  expect((await db.query("SELECT count(*)::int AS n FROM app_notification WHERE organization_id=$1", [clubA])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action='old.action'", [clubA])).rows[0].n).toBe(0);
  expect((await securityView(db, president)).purges.map((p: { category: string }) => p.category).sort()).toEqual(["audit", "notifications"]);
});

it("closes the club after its 30 days: cancelled once, then done, nothing left but the accounting", async () => {
  await expect(run(president, { action: "close", confirmName: "Autre club" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await run(president, { action: "close", confirmName: "club a", reason: "Fusion" });
  const planned = (await securityView(db, president)).closure!;
  expect(planned.effective_on > brusselsDay()).toBe(true);
  await run(president, { action: "cancelClose" });
  expect((await securityView(db, president)).closure).toBeNull();
  await run(president, { action: "close", confirmName: "Club A" });
  expect(await closureTick(db)).toBe(0);
  await db.query("UPDATE club_termination SET effective_on=CURRENT_DATE-1 WHERE organization_id=$1 AND cancelled_at IS NULL", [clubA]);
  expect(await closureTick(db)).toBe(1);
  const certificate = (await db.query("SELECT certificate FROM club_termination WHERE organization_id=$1 AND completed_at IS NOT NULL", [clubA])).rows[0].certificate;
  expect(certificate.deleted.club_person).toBe(1);
  const tables = (await db.query("SELECT k.table_name FROM information_schema.columns k JOIN information_schema.tables t ON t.table_schema=k.table_schema AND t.table_name=k.table_name AND t.table_type='BASE TABLE' WHERE k.table_schema=current_schema() AND k.column_name='organization_id' AND k.table_name<>'organization'")).rows.map((r) => r.table_name as string);
  const left: string[] = [];
  for (const t of tables) if ((await db.query(`SELECT count(*)::int AS n FROM "${t}" WHERE organization_id=$1`, [clubA])).rows[0].n) left.push(t);
  expect(left.filter((t) => !keptTables.includes(t))).toEqual([]);
  expect(left).toContain("finance_transaction");
  expect((await db.query("SELECT closed_at FROM organization WHERE id=$1", [clubA])).rows[0].closed_at).toBeTruthy();
  // Club B is untouched.
  expect((await db.query("SELECT count(*)::int AS n FROM role_assignment WHERE organization_id=$1", [clubB])).rows[0].n).toBe(1);
  void profile;
});
