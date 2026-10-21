import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { peopleExecute } from "../../src/domains/people/service";
import { teamsExecute } from "../../src/domains/teams/service";
import { equipmentExecute } from "../../src/domains/equipment/service";
import { duesExecute, commandSchema as duesCommand } from "../../src/domains/dues/service";
import { undoExecute } from "../../src/domains/undo/service";

/** Wave 15 (C10): undo after a reversible action, on the server, by its author, once, in time, in its club. */
const schema = "w15un_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, secretary: Principal, presidentB: Principal, season: string, lions: string, tigers: string, player: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const undo = (p: Principal, id: string | undefined, org = clubA) => undoExecute(db, p, { id: id! }, org);
const archived = async (id: string) => (await db.query("SELECT archived FROM team WHERE id=$1", [id])).rows[0].archived as boolean;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  secretary = await actor(clubA, "coach", ["people.read"]);
  presidentB = await actor(clubB, "club_president");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  lions = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  tigers = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Tigres') RETURNING id", [clubA, season])).rows[0].id;
  player = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,'Zoé Martin','2010-01-01','{player}' FROM p RETURNING id", [clubA])).rows[0].id;
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

it("puts an archived team back, once, with a line in the audit log", async () => {
  const r = await peopleExecute(db, president, { action: "teamArchive", id: lions, archived: true }, clubA);
  expect(await archived(lions)).toBe(true);
  expect(r.undo).toBeTruthy();
  await expect(undo(president, r.undo)).resolves.toMatchObject({ kind: "teamArchive" });
  expect(await archived(lions)).toBe(false);
  await expect(undo(president, r.undo)).rejects.toMatchObject({ code: "UNDO_USED" });
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='undo.teamArchive' AND target_id=$1", [lions])).rows[0].n).toBe(1);
});

it("refuses after the delay, to someone else, and in another club", async () => {
  const r = await peopleExecute(db, president, { action: "teamArchive", id: tigers, archived: true }, clubA);
  await expect(undo(secretary, r.undo)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(undo(presidentB, r.undo, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.query("UPDATE undo_action SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE id=$1", [r.undo]);
  await expect(undo(president, r.undo)).rejects.toMatchObject({ code: "UNDO_EXPIRED" });
  expect(await archived(tigers)).toBe(true);
  await peopleExecute(db, president, { action: "teamArchive", id: tigers, archived: false }, clubA);
});

it("checks the rights again: a mandate that lost them cannot undo", async () => {
  const r = await peopleExecute(db, president, { action: "teamArchive", id: lions, archived: true }, clubA);
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE user_id=$1", [president.userId]);
  await expect(undo(president, r.undo)).rejects.toBeTruthy();
  await db.query("UPDATE role_assignment SET revoked_at=NULL WHERE user_id=$1", [president.userId]);
  await execute(db, president, { action: "context", mandateId: (await db.query("SELECT id FROM role_assignment WHERE user_id=$1", [president.userId])).rows[0].id });
  await undo(president, r.undo);
  expect(await archived(lions)).toBe(false);
});

it("undoes an ended assignment and a move between teams", async () => {
  const today = (await db.query("SELECT CURRENT_DATE::text AS d")).rows[0].d as string;
  const assigned = (await peopleExecute(db, president, { action: "assign", teamId: lions, profileId: player, role: "player", position: "", startsOn: today, endsOn: null }, clubA)).id!;
  const ended = await peopleExecute(db, president, { action: "endAssignment", id: assigned, endsOn: today }, clubA);
  expect((await db.query("SELECT ends_on IS NOT NULL AS e,closed_at IS NOT NULL AS c FROM team_membership WHERE id=$1", [assigned])).rows[0]).toEqual({ e: true, c: true });
  await undo(president, ended.undo);
  expect((await db.query("SELECT ends_on,closed_at FROM team_membership WHERE id=$1", [assigned])).rows[0]).toEqual({ ends_on: null, closed_at: null });
  // Move from the Lions to the Tigers on the first day: the former assignment is cancelled, then restored.
  const moved = await teamsExecute(db, president, { action: "move", profileId: player, fromTeamId: lions, toTeamId: tigers, effectiveOn: today, keep: false }, clubA);
  const active = async () =>
    (await db.query("SELECT team_id FROM team_membership WHERE profile_id=$1 AND NOT cancelled AND closed_at IS NULL ORDER BY team_id", [player])).rows.map((r) => r.team_id);
  expect(await active()).toEqual([tigers]);
  await undo(president, (moved as { undo?: string }).undo);
  expect(await active()).toEqual([lions]);
});

it("puts a retired chair back with its links, and takes back a payment and its ledger line", async () => {
  const chair = {
    action: "chair" as const,
    name: "Fauteuil 1",
    brand: "",
    model: "",
    serialNumber: "",
    ownership: "club" as const,
    status: "in_use" as const,
    maxSpeedKmh: 10,
    battery: "",
    acquiredOn: null,
    lastServiceOn: null,
    nextServiceOn: null,
    notes: "",
  };
  const { id } = await equipmentExecute(db, president, chair, clubA);
  const today = (await db.query("SELECT CURRENT_DATE::text AS d")).rows[0].d as string;
  await equipmentExecute(db, president, { action: "assign", chairId: id, profileId: player, primary: true, startsOn: today }, clubA);
  const retired = await equipmentExecute(db, president, { ...chair, id, expectedVersion: 1, status: "retired" }, clubA);
  expect((await db.query("SELECT count(*)::int AS n FROM equipment_chair_assignment WHERE chair_id=$1 AND ends_on IS NULL", [id])).rows[0].n).toBe(0);
  await undo(president, (retired as { undo?: string }).undo);
  expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [id])).rows[0].status).toBe("in_use");
  expect((await db.query("SELECT count(*)::int AS n FROM equipment_chair_assignment WHERE chair_id=$1 AND ends_on IS NULL", [id])).rows[0].n).toBe(1);

  const run = (input: unknown) => duesExecute(db, president, duesCommand.parse(input), clubA);
  const plan = (await run({ action: "plan", seasonId: season, category: "Cotisation", amountCents: 20000, maxInstallments: 2, firstDue: today })) as { id: string };
  const debt = (await run({ action: "issue", planId: plan.id, profileId: player, installments: 1, firstDue: today })) as { id: string };
  const paid = (await run({ action: "pay", id: debt.id, amountCents: 5000, method: "cash", occurredOn: today, reference: "" })) as { id: string; undo?: string };
  await undo(president, paid.undo);
  expect((await db.query("SELECT cancelled_at IS NOT NULL AS gone FROM finance_transaction WHERE id=$1", [paid.id])).rows[0].gone).toBe(true);
  expect((await db.query("SELECT action FROM dues_history WHERE receivable_id=$1 ORDER BY created_at DESC LIMIT 1", [debt.id])).rows[0].action).toBe("payment_undone");
});
