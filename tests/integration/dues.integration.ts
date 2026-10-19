import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  execute,
  workspace,
  type Principal,
} from "../../src/domains/access/service";
import {
  duesExecute,
  duesView,
  commandSchema,
} from "../../src/domains/dues/service";
const schema = "dues_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
type P = Principal & { mandateId: string };
let org: string,
  season: string,
  admin: P,
  player: P,
  parent: P,
  outsider: P,
  profileId: string,
  parentId: string,
  planId: string;
async function actor(role: string): Promise<P> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,true)',
    [userId, role, userId + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [org, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
      [org, userId, role],
    )
  ).rows[0].id;
  const p = { userId, sessionId, mandateId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: P, input: unknown, o = org) =>
  duesExecute(db, p, commandSchema.parse(input), o);
const issue = (extra: Record<string, unknown> = {}) =>
  run(admin, {
    action: "issue",
    planId,
    profileId,
    installments: 4,
    firstDue: "2020-01-31",
    ...extra,
  });
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  org = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Dues test','club') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30') RETURNING id",
      [org],
    )
  ).rows[0].id;
  admin = await actor("club_president");
  player = await actor("player");
  parent = await actor("guardian");
  outsider = await actor("coach");
  for (const [p, name] of [
    [player, "Player"],
    [parent, "Parent"],
  ] as const) {
    const id = (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,$3,'2015-01-01' FROM person WHERE user_id=$2 RETURNING id",
        [org, p.userId, name],
      )
    ).rows[0].id;
    if (p === player) profileId = id;
    else parentId = id;
  }
  planId = (
    await run(admin, {
      action: "plan",
      seasonId: season,
      category: "Player dues",
      amountCents: 25000,
      maxInstallments: 4,
      firstDue: "2026-10-01",
    })
  ).id;
});
beforeEach(async () => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
  await db.query("DELETE FROM dues_history WHERE receivable_id IS NOT NULL");
  await db.query("DELETE FROM dues_installment");
  await db.query("DELETE FROM dues_receivable");
  await db.query("DELETE FROM guardian_relationship");
  await db.query("UPDATE season SET archived=false");
  await db.query("UPDATE dues_plan SET archived=false");
  await db.query("UPDATE role_assignment SET revoked_at=NULL");
  await db.query("UPDATE organization_membership SET active=true");
  await db.query('UPDATE "user" SET "twoFactorEnabled"=true');
  await execute(db, admin, { action: "context", mandateId: admin.mandateId });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
it("persists one 250 EUR debt with four exact instalments and rejects concurrent duplicates", async () => {
  const results = await Promise.allSettled([issue(), issue()]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const v = await duesView(db, admin);
  expect(v.debts).toHaveLength(1);
  expect(v.debts[0].net_cents).toBe(25000);
  expect(
    v.debts[0].installments.map(
      (i: { amount_cents: number }) => i.amount_cents,
    ),
  ).toEqual([6250, 6250, 6250, 6250]);
  expect(v.debts[0].overdue_cents).toBe(25000);
  expect(v.debts[0].history).toHaveLength(1);
});
it("isolates personal/family finances and requires a current verified relationship", async () => {
  await issue();
  expect((await duesView(db, player)).debts).toHaveLength(1);
  expect((await duesView(db, outsider)).debts).toHaveLength(0);
  expect((await duesView(db, parent)).debts).toHaveLength(0);
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,CURRENT_DATE,'Verified authorisation',$4)",
    [org, parentId, profileId, admin.userId],
  );
  expect((await duesView(db, parent)).debts).toHaveLength(1);
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  expect((await duesView(db, parent)).debts).toHaveLength(0);
  await expect(
    run(player, { action: "archivePlan", id: planId }),
  ).rejects.toThrow("FORBIDDEN");
});
it("rejects over-discounts, unmotivated exemptions, stale changes and wrong organisation", async () => {
  await expect(
    issue({ discountCents: 25001, reason: "Exemption" }),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(issue({ discountCents: 25000 })).rejects.toThrow(
    "INVALID_INPUT",
  );
  const { id } = await issue({
    discountCents: 25000,
    reason: "Approved exemption",
  });
  expect((await duesView(db, admin)).debts[0].net_cents).toBe(0);
  await expect(
    run(admin, { action: "cancel", id, version: 5, reason: "Correction" }),
  ).rejects.toThrow("STALE_VERSION");
  await expect(
    run(
      admin,
      { action: "cancel", id, version: 1, reason: "Correction" },
      randomUUID(),
    ),
  ).rejects.toThrow("CONTEXT_CHANGED");
});
it("retains history and principal when rescheduling and cancelling", async () => {
  const { id } = await issue();
  await run(admin, {
    action: "schedule",
    id,
    version: 1,
    installments: 3,
    firstDue: "2028-01-31",
    reason: "Agreed adjustment",
  });
  let d = (await duesView(db, admin)).debts[0];
  expect(
    d.installments.map((i: { amount_cents: number }) => i.amount_cents),
  ).toEqual([8334, 8333, 8333]);
  expect(d.net_cents).toBe(25000);
  await run(admin, {
    action: "cancel",
    id,
    version: 2,
    reason: "Duplicate obligation",
  });
  d = (await duesView(db, admin)).debts[0];
  expect(d.status).toBe("cancelled");
  expect(d.overdue_cents).toBe(0);
  expect(d.history).toHaveLength(3);
  expect(
    (
      await db.query(
        "SELECT before_data FROM dues_history WHERE action='schedule' AND receivable_id=$1",
        [id],
      )
    ).rows[0].before_data.installments,
  ).toHaveLength(4);
});
it("does not issue new debts against archived seasons or plans", async () => {
  await db.query("UPDATE season SET archived=true");
  await expect(issue()).rejects.toThrow("NOT_FOUND");
  await db.query("UPDATE season SET archived=false");
  await run(admin, { action: "archivePlan", id: planId });
  await expect(issue()).rejects.toThrow("NOT_FOUND");
});
it("honours strict MFA and the explicitly suspended pilot policy", async () => {
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    admin.userId,
  ]);
  await expect(issue()).rejects.toThrow("MFA_REQUIRED");
  vi.stubEnv("PFM_MFA_SUSPENDED", "true");
  await expect(issue()).resolves.toHaveProperty("id");
});
it("saved profiles cannot grant another user’s access and English preferences persist", async () => {
  await expect(
    execute(db, admin, {
      action: "saveProfile",
      mandateId: player.mandateId,
      name: "Not mine",
      isDefault: false,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await execute(db, admin, {
    action: "saveProfile",
    mandateId: admin.mandateId,
    name: "Club president",
    isDefault: true,
  });
  await execute(db, admin, {
    action: "preferences",
    locale: "en",
    notificationsEnabled: true,
  });
  const v = await workspace(db, admin);
  expect(v.profiles[0].name).toBe("Club president");
  expect(v.preferences).toMatchObject({ locale: "en" });
  await db.query("DELETE FROM active_context WHERE session_id=$1", [
    admin.sessionId,
  ]);
  expect((await workspace(db, admin)).selected?.id).toBe(admin.mandateId);
});
it("a revoked saved profile never restores permissions", async () => {
  await execute(db, outsider, {
    action: "saveProfile",
    mandateId: outsider.mandateId,
    name: "Coaching",
    isDefault: true,
  });
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1", [
    outsider.mandateId,
  ]);
  await db.query("DELETE FROM active_context WHERE session_id=$1", [
    outsider.sessionId,
  ]);
  const v = await workspace(db, outsider);
  expect(v.selected).toBeUndefined();
  expect(v.permissions).toEqual([]);
  await expect(
    execute(db, outsider, { action: "context", mandateId: outsider.mandateId }),
  ).rejects.toThrow("FORBIDDEN");
});
it("consumes only the matching admission dues follow-up, once", async () => {
  const f = (
    await db.query(
      "INSERT INTO registration_form(organization_id,season_id,title) VALUES($1,$2,'Membership') RETURNING id",
      [org, season],
    )
  ).rows[0].id;
  const a = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,season_id,applicant_user_id,subject_name,birth_date,locale,form_snapshot,status,profile_id) VALUES($1,$2,$3,$4,'Player','2015-01-01','en','{}','accepted',$5) RETURNING id",
      [org, f, season, player.userId, profileId],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO registration_followup(application_id,kind) VALUES($1,'dues'),($1,'documents')",
    [a],
  );
  await issue({ applicationId: a });
  expect(
    (
      await db.query(
        "SELECT kind,state FROM registration_followup WHERE application_id=$1 ORDER BY kind",
        [a],
      )
    ).rows,
  ).toEqual([
    { kind: "documents", state: "awaiting_module" },
    { kind: "dues", state: "processed" },
  ]);
  await expect(issue({ applicationId: a })).rejects.toThrow("NOT_FOUND");
  expect((await duesView(db, admin)).debts).toHaveLength(1);
});
it("switching from a saved president profile to a player profile removes management rights", async () => {
  const m = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'player') RETURNING id",
      [org, admin.userId],
    )
  ).rows[0].id;
  await execute(db, admin, {
    action: "saveProfile",
    mandateId: m,
    name: "My player hat",
    isDefault: false,
  });
  await execute(db, admin, { action: "context", mandateId: m });
  expect((await duesView(db, admin)).manage).toBe(false);
  await expect(issue()).rejects.toThrow("FORBIDDEN");
  expect((await workspace(db, admin)).selected?.id).toBe(m);
});
