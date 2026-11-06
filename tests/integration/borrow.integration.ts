import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { borrowTick, consoleExecute, consoleOrganization } from "../../src/domains/console/service";
import { clubView } from "../../src/domains/club/service";

/**
 * Console, step 3b (06/11/2026): an operator opens an organisation as its
 * president for a while, with a reason: the presidency is told, the club's
 * journal keeps it, the mandate shows in the operator's workspace, ends
 * early from the console or at its hour by the task, and the organisation
 * never counts it as a president of its own.
 */
const schema = "borrow_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, president: Principal, support: Principal, reader: Principal;

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
  president = await user("Président A");
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [clubA, president.userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [clubA, president.userId])).rows[0].id;
  await execute(db, president, { action: "context", mandateId });
  support = await operator("Sam Support", "support");
  reader = await operator("Rita", "readonly");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("opens the organisation as president for a while, tells the presidency, journals, and ends early", async () => {
  await expect(consoleExecute(db, reader, { action: "borrow", organizationId: clubA, reason: "Question sur les cotisations", minutes: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await workspace(db, support)).contexts).toEqual([]);
  const b = await consoleExecute(db, support, { action: "borrow", organizationId: clubA, reason: "Question sur les cotisations", minutes: 30 });
  expect(b).toMatchObject({ ok: true });
  const borrow = b as { id: string; mandateId: string; expiresAt: string };
  expect(new Date(borrow.expiresAt).getTime() - Date.now()).toBeGreaterThan(25 * 60000);
  await expect(consoleExecute(db, support, { action: "borrow", organizationId: clubA, reason: "Encore une fois", minutes: 30 })).rejects.toMatchObject({ code: "BORROW_OPEN" });
  // The presidency got the notice (never the operator, even if they held a mandate); the club's journal says it.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND resource_id=$2", [clubA, `borrow:${borrow.id}`])).rows[0].n).toBe(1);
  expect((await db.query("SELECT action FROM audit_log WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1", [clubA])).rows[0].action).toBe("platform.borrow");
  // The mandate is in the operator's workspace, limited in time; the club still has one president of its own only.
  const ws = await workspace(db, support);
  expect((ws.contexts as { id: string; role: string; name: string }[]).map((m) => [m.name, m.role, m.id])).toEqual([["Club A", "club_president", borrow.mandateId]]);
  await execute(db, support, { action: "context", mandateId: borrow.mandateId });
  const club = await clubView(db, support);
  expect(club.organization.id).toBe(clubA);
  expect(club.canEdit).toBe(true);
  const sheet = await consoleOrganization(db, support, clubA);
  expect(sheet.myBorrow).toMatchObject({ id: borrow.id, mandateId: borrow.mandateId });
  expect(sheet.borrows.map((x) => [x.operator, x.active, x.reason])).toEqual([["Sam Support", true, "Question sur les cotisations"]]);
  expect(sheet.actions.map((a) => a.kind)).toEqual(["borrow"]);
  // The president's own sheet of mandates shows the operator's mandate, with its end.
  expect((await db.query("SELECT count(*)::int AS n FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND valid_until IS NOT NULL AND revoked_at IS NULL", [clubA, support.userId])).rows[0].n).toBe(1);
  // Ended early: no more context, no more mandate, membership inactive.
  await consoleExecute(db, support, { action: "borrowEnd", id: borrow.id });
  await expect(consoleExecute(db, support, { action: "borrowEnd", id: borrow.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(clubView(db, support)).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
  expect((await workspace(db, support)).contexts).toEqual([]);
  expect((await db.query("SELECT active FROM organization_membership WHERE organization_id=$1 AND user_id=$2", [clubA, support.userId])).rows[0].active).toBe(false);
  expect((await consoleOrganization(db, support, clubA)).myBorrow).toBeNull();
  expect((await db.query("SELECT action FROM audit_log WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1", [clubA])).rows[0].action).toBe("platform.borrow.end");
});

it("closes a borrow past its hour by the task", async () => {
  const b = (await consoleExecute(db, support, { action: "borrow", organizationId: clubA, reason: "Vérification d'un export", minutes: 5 })) as { id: string; mandateId: string };
  await execute(db, support, { action: "context", mandateId: b.mandateId });
  expect(await borrowTick(db)).toBe(0);
  await db.query("UPDATE platform_borrow SET started_at=now()-interval '10 minutes',expires_at=now()-interval '1 minute' WHERE id=$1", [b.id]);
  await db.query("UPDATE role_assignment SET valid_from=now()-interval '10 minutes',valid_until=now()-interval '1 minute' WHERE id=$1", [b.mandateId]);
  expect(await borrowTick(db)).toBe(1);
  await expect(clubView(db, support)).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
  expect((await consoleOrganization(db, support, clubA)).borrows.filter((x) => x.active)).toEqual([]);
  expect((await db.query("SELECT active FROM organization_membership WHERE organization_id=$1 AND user_id=$2", [clubA, support.userId])).rows[0].active).toBe(false);
});
