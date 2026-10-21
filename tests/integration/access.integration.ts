import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createAuth } from "../../src/lib/auth";
import {
  execute,
  workspace,
  type Principal,
} from "../../src/domains/access/service";
const schema = "test_" + randomUUID().replaceAll("-", "");
const root = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${schema},public`,
});
let auth: ReturnType<typeof createAuth>;
const password = "Test-passphrase-Only-2026!";
type Actor = {
  userId: string;
  sessionId: string;
  cookie: string;
  email: string;
};
let president: Actor, coach: Actor, federal: Actor, outsider: Actor;
let clubA: string,
  clubB: string,
  federation: string,
  adminA: string,
  adminB: string,
  coachA: string,
  referee: string;
async function request(path: string, body?: unknown, cookie = "") {
  const url = process.env.BETTER_AUTH_URL!;
  return auth.handler(
    new Request(url + "/api/auth" + path, {
      method: body ? "POST" : "GET",
      headers: { origin: url, "content-type": "application/json", cookie },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .filter((s) => !s.endsWith("="))
    .join("; ");
}
async function actor(name: string): Promise<Actor> {
  await db.query('DELETE FROM "rateLimit"');
  const email = name.toLowerCase() + "." + schema + "@example.test";
  const response = await request("/sign-up/email", { name, email, password });
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(200);
  await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
    data.user.id,
  ]);
  const cookie = cookies(response);
  const session = await request("/get-session", undefined, cookie);
  const value = await session.json();
  expect(value?.session?.id).toBeTruthy();
  return { userId: data.user.id, sessionId: value.session.id, cookie, email };
}
async function organization(name: string, kind = "club") {
  return (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES($1,$2) RETURNING id",
      [name, kind],
    )
  ).rows[0].id as string;
}
async function mandate(user: Actor, org: string, role: string) {
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [org, user.userId],
  );
  return (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
      [org, user.userId, role],
    )
  ).rows[0].id as string;
}
async function select(user: Principal, id: string) {
  await execute(db, user, { action: "context", mandateId: id });
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const file of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + file, "utf8"));
  auth = createAuth(db);
  president = await actor("President");
  coach = await actor("Coach");
  federal = await actor("Federal");
  outsider = await actor("Other");
  clubA = await organization("Club A");
  clubB = await organization("Club B");
  federation = await organization("Fédération", "federation");
  adminA = await mandate(president, clubA, "club_president");
  adminB = await mandate(president, clubB, "club_president");
  coachA = await mandate(coach, clubA, "coach");
  referee = await mandate(coach, federation, "referee");
  await mandate(federal, federation, "federation_president");
  await select(president, adminA);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
describe("persistent identity, mandates and isolation", () => {
  it("one identity has two clubs with distinct explicit contexts", async () => {
    const state = await workspace(db, president);
    expect(state.contexts).toHaveLength(2);
    expect(state.selected?.organization_id).toBe(clubA);
    await select(president, adminB);
    expect((await workspace(db, president)).selected?.organization_id).toBe(
      clubB,
    );
    await select(president, adminA);
  });
  it("does not allow guessing another user mandate or changing another club resource", async () => {
    await expect(select(outsider, adminA)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      execute(db, president, { action: "revoke", id: adminB }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("keeps referee and coach permissions separate and federation out of club membership data", async () => {
    await select(coach, coachA);
    expect((await workspace(db, coach)).permissions).toEqual([
      "organization.read",
    ]);
    await select(coach, referee);
    expect((await workspace(db, coach)).selected?.organization_id).toBe(
      federation,
    );
    const f = (await workspace(db, federal)).contexts[0] as { id: string };
    await select(federal, f.id);
    expect((await workspace(db, federal)).members).toHaveLength(2);
    await expect(
      execute(db, federal, { action: "revoke", id: coachA }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("protects last indefinite administrator against revoke, expiry and deactivation", async () => {
    for (const cmd of [
      { action: "revoke", id: adminA },
      {
        action: "renew",
        id: adminA,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
      },
      { action: "membership", userId: president.userId, active: false },
    ] as const) {
      await expect(execute(db, president, cmd)).rejects.toMatchObject({
        code: "LAST_ADMIN",
      });
    }
    expect((await workspace(db, president)).selected?.id).toBe(adminA);
  });
  it("lets a delegated operation run without a second factor (removed 21/10/2026)", async () => {
    await db.query(
      "UPDATE role_assignment SET grants=ARRAY['invitations.create'] WHERE id=$1",
      [coachA],
    );
    await select(coach, coachA);
    const invited = await execute(db, coach, {
      action: "invite",
      email: "delegated." + schema + "@example.test",
      role: "player",
      grants: [],
      validUntil: null,
    });
    expect(invited).toBeTruthy();
    await db.query(
      "UPDATE role_assignment SET grants=ARRAY[]::text[] WHERE id=$1",
      [coachA],
    );
  });
  it("accepts invitation only once, only for its verified recipient", async () => {
    const result = await execute(db, president, {
      action: "invite",
      email: outsider.email,
      role: "guardian",
      grants: [],
      validUntil: null,
    });
    expect("token" in result).toBe(true);
    const token = "token" in result ? result.token : "";
    await expect(
      execute(db, coach, { action: "accept", token }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    await execute(db, outsider, { action: "accept", token });
    await expect(
      execute(db, outsider, { action: "accept", token }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    expect((await workspace(db, outsider)).contexts).toHaveLength(1);
  });
  it("blocks expired and cancelled invitations", async () => {
    for (const type of ["expired", "cancelled"]) {
      const result = await execute(db, president, {
        action: "invite",
        email: outsider.email,
        role: "player",
        grants: [],
        validUntil: null,
      });
      if (!("token" in result)) throw new Error();
      if (type === "expired")
        await db.query(
          "UPDATE invitation SET expires_at=now()-interval '1 minute' WHERE email=$1 AND accepted_at IS NULL",
          [outsider.email],
        );
      else {
        const id = (
          await db.query(
            "SELECT id FROM invitation WHERE email=$1 AND accepted_at IS NULL AND expires_at>now()",
            [outsider.email],
          )
        ).rows[0].id;
        await execute(db, president, { action: "cancelInvitation", id });
      }
      await expect(
        execute(db, outsider, { action: "accept", token: result.token }),
      ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    }
  });
  it("schedules a dated mandate without granting early access", async () => {
    const result = await execute(db, president, {
      action: "invite",
      email: outsider.email,
      role: "player",
      grants: [],
      validFrom: new Date(Date.now() + 86400000).toISOString(),
      validUntil: new Date(Date.now() + 172800000).toISOString(),
    });
    if (!("token" in result)) throw new Error();
    await execute(db, outsider, { action: "accept", token: result.token });
    expect((await workspace(db, outsider)).contexts).toHaveLength(1);
  });
  it("does not allow a delegate to assign permissions they do not possess", async () => {
    const delegated = await mandate(president, clubA, "coach");
    await db.query(
      "UPDATE role_assignment SET grants=ARRAY['invitations.create'] WHERE id=$1",
      [delegated],
    );
    await select(president, delegated);
    await expect(
      execute(db, president, {
        action: "invite",
        email: outsider.email,
        role: "club_president",
        grants: [],
        validUntil: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      execute(db, president, {
        action: "invite",
        email: outsider.email,
        role: "player",
        grants: ["audit.read"],
        validUntil: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await select(president, adminA);
  });
  it("revocation immediately invalidates a selected context and audit persists", async () => {
    await execute(db, president, { action: "revoke", id: coachA });
    await expect(
      execute(db, coach, {
        action: "invite",
        email: outsider.email,
        role: "player",
        grants: [],
        validUntil: null,
      }),
    ).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
    expect((await workspace(db, coach)).selected).toBeUndefined();
    expect((await workspace(db, president)).audit.length).toBeGreaterThan(0);
  });
  it("persists preferences without granting access to another person", async () => {
    await execute(db, outsider, {
      action: "preferences",
      locale: "nl",
      notificationsEnabled: false,
    });
    expect((await workspace(db, outsider)).preferences).toMatchObject({
      locale: "nl",
      notifications_enabled: false,
    });
  });
  it("rejects mismatched organization roles at the database boundary", async () => {
    await expect(
      mandate(outsider, clubA, "federation_president"),
    ).rejects.toMatchObject({ code: "P0001" });
  });
  it("signs in with email and password only, no second factor (removed 21/10/2026)", async () => {
    const response = await request("/sign-in/email", {
      email: president.email,
      password,
    });
    const data = await response.json();
    expect(data.twoFactorRedirect).not.toBe(true);
    const result = await request("/get-session", undefined, cookies(response));
    expect((await result.json())?.session?.id).toBeTruthy();
  });
  it("serializes concurrent administrator revocations without losing both admins", async () => {
    const org = await organization("Concurrent administrators");
    const one = await mandate(president, org, "club_president");
    const two = await mandate(federal, org, "club_president");
    await select(president, one);
    await select(federal, two);
    const results = await Promise.allSettled([
      execute(db, president, { action: "revoke", id: two }),
      execute(db, federal, { action: "revoke", id: one }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await db.query(
          "SELECT id FROM role_assignment WHERE organization_id=$1 AND revoked_at IS NULL",
          [org],
        )
      ).rowCount,
    ).toBe(1);
    await select(president, adminA);
  });
  it("disabled accounts cannot continue a session or sign in", async () => {
    await db.query('UPDATE "user" SET active=false WHERE id=$1', [
      outsider.userId,
    ]);
    await expect(workspace(db, outsider)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const response = await request("/sign-in/email", {
      email: outsider.email,
      password,
    });
    expect(response.ok).toBe(false);
  });
});
