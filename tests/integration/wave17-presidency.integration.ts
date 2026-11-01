import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { acceptInvitation, type InvitationRow } from "../../src/domains/access/invite";
import { presidencyExecute, presidencyView } from "../../src/domains/access/presidency";

/**
 * Wave 17 (G1): the club president hands over the presidency. Cancelled,
 * refused, accepted (the outgoing president becomes coach), with a later
 * date of effect; never two presidents at once nor none; other clubs and
 * other roles cannot touch it.
 */
const schema = "w17pre_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let federation: string, clubA: string, clubB: string;
let fedPresident: Principal, president: Principal & { email: string }, member: Principal & { email: string }, coach: Principal, presidentB: Principal;

async function actor(org: string, role: string | null, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    email = `${userId}@example.test`;
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, email]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const p = { userId, sessionId, email };
  if (role) {
    const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
    await execute(db, p, { action: "context", mandateId });
  }
  return p;
}
/** As liveInvitation reads it: neither accepted, revoked nor expired. */
const invitation = async (id: string) => {
  const row = (
    await db.query("SELECT i.*,o.kind FROM invitation i JOIN organization o ON o.id=i.organization_id WHERE i.id=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()", [id])
  ).rows[0] as InvitationRow | undefined;
  if (!row) throw Object.assign(new Error("INVITATION_INVALID"), { code: "INVITATION_INVALID" });
  return row;
};
async function accept(id: string, user: { userId: string; email: string }) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await acceptInvitation(c, await invitation(id), { id: user.userId, email: user.email });
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** Presidents in office at a moment (now by default). */
const presidents = async (at = "now()") =>
  (await db.query(`SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL AND valid_from<=${at} AND (valid_until IS NULL OR valid_until>${at})`, [clubA])).rows.map(
    (r) => r.user_id,
  );
const handOver = (fields: Record<string, unknown>, p: Principal = president, org = clubA) =>
  presidencyExecute(db, p, { action: "handOver", userId: null, email: null, name: "", effectiveOn: null, keep: "coach", message: "", ...fields } as never, org) as Promise<{ id: string }>;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  federation = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [federation])).rows[0].id;
  fedPresident = await actor(federation, "federation_president", "Fédé");
  president = await actor(clubA, "club_president", "Paul Président");
  member = await actor(clubA, null, "Marie Membre");
  coach = await actor(clubA, "coach", "Coach");
  presidentB = await actor(clubB, "club_president", "Président B");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("offers the presidency; nothing changes until accepted, and it can be cancelled", async () => {
  const view = await presidencyView(db, president);
  expect(view.can).toBe(true);
  expect(view.candidates.map((x) => x.name)).toEqual(expect.arrayContaining(["Marie Membre", "Coach"]));
  expect(view.candidates.map((x) => x.name)).not.toContain("Paul Président");
  const { id } = await handOver({ userId: member.userId, message: "À toi de jouer" });
  expect((await presidencyView(db, president)).pending).toMatchObject({ id, email: member.email, outgoing_role: "coach", message: "À toi de jouer" });
  expect(await presidents()).toEqual([president.userId]);
  // Only the president of this club.
  expect((await presidencyView(db, coach)).can).toBe(false);
  await expect(handOver({ userId: member.userId }, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(presidencyExecute(db, presidentB, { action: "cancel", id }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(handOver({ email: president.email })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await presidencyExecute(db, president, { action: "cancel", id }, clubA);
  await expect(accept(id, member)).rejects.toThrow();
  expect(await presidents()).toEqual([president.userId]);
});

it("changes nothing when the invitation is refused or taken by someone else", async () => {
  const { id } = await handOver({ email: "nouvelle@example.test", name: "Nina Nouvelle" });
  // « Ce n'est pas mon rôle »: the invitation waits, the president stays.
  await db.query("UPDATE invitation SET disputed_at=now() WHERE id=$1", [id]);
  await expect(accept(id, { userId: member.userId, email: "nouvelle@example.test" })).rejects.toMatchObject({ code: "INVITATION_DISPUTED" });
  // Another account cannot take it.
  const { id: second } = await handOver({ email: "nouvelle@example.test" });
  await expect(accept(second, member)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  expect((await db.query("SELECT revoked_at IS NOT NULL AS gone FROM invitation WHERE id=$1", [id])).rows[0].gone).toBe(true);
  expect(await presidents()).toEqual([president.userId]);
  await presidencyExecute(db, president, { action: "cancel", id: second }, clubA);
});

it("hands over on acceptance: one president, the former one coach, everyone told", async () => {
  const { id } = await handOver({ userId: member.userId, keep: "coach" });
  await accept(id, member);
  expect(await presidents()).toEqual([member.userId]);
  expect((await db.query("SELECT role FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL", [clubA, president.userId])).rows.map((r) => r.role)).toEqual(["coach"]);
  expect((await db.query("SELECT details FROM audit_log WHERE organization_id=$1 AND action='presidency.transferred'", [clubA])).rows[0].details).toMatchObject({ from: [president.userId], keeps: "coach" });
  const told = (await db.query("SELECT DISTINCT recipient_user_id FROM mail_job WHERE kind='access_changed'")).rows.map((r) => r.recipient_user_id);
  expect(told).toEqual(expect.arrayContaining([member.userId, president.userId, fedPresident.userId]));
});

it("takes effect at the date chosen, never with two presidents nor none", async () => {
  // Marie, now president, hands over to the coach in ten days and keeps no role.
  const marie = { ...member };
  const mandate = (await db.query("SELECT id FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='club_president' AND revoked_at IS NULL", [clubA, marie.userId])).rows[0].id;
  await execute(db, marie, { action: "context", mandateId: mandate });
  const coachEmail = (await db.query('SELECT email FROM "user" WHERE id=$1', [coach.userId])).rows[0].email;
  const later = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const { id } = await handOver({ userId: coach.userId, keep: "none", effectiveOn: later }, marie);
  await accept(id, { userId: coach.userId, email: coachEmail });
  expect(await presidents()).toEqual([marie.userId]);
  expect(await presidents("now()+interval '11 days'")).toEqual([coach.userId]);
  // At every boundary exactly one president.
  for (const at of ["now()", "now()+interval '9 days'", "now()+interval '10 days'", "now()+interval '12 days'", `('${later}'::date)::timestamp AT TIME ZONE 'Europe/Brussels'`])
    expect(await presidents(at)).toHaveLength(1);
});
