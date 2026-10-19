import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  publish,
  type Publication,
  type Envelope,
} from "../../src/domains/notifications/queue";
import {
  processOne,
  claim,
  recoverExpired,
} from "../../src/domains/notifications/worker";
import {
  createTransport,
  DeliveryFailure,
  type Transport,
} from "../../src/domains/notifications/transport";
import {
  notificationView,
  notificationExecute,
  templatePreview,
} from "../../src/domains/notifications/service";
import { unseal } from "../../src/domains/notifications/crypto";
import { createAuth } from "../../src/lib/auth";
import { peopleExecute } from "../../src/domains/people/service";
const schema = "mail_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
    max: 10,
  });
let orgA: string,
  orgB: string,
  admin: Principal,
  member: Principal,
  other: Principal,
  directory: string,
  local: Transport;
async function actor(name: string, org: string, role: string) {
  const id = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [id, name, id + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [id]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, id, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [org, id],
  );
  const mandate = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
      [org, id, role],
    )
  ).rows[0].id;
  const p = { userId: id, sessionId };
  await execute(db, p, { action: "context", mandateId: mandate });
  return p;
}
async function notice(overrides: Partial<Publication> = {}) {
  return publish(db, {
    organizationId: orgA,
    userId: member.userId,
    email: member.userId + "@example.test",
    kind: "test_self",
    category: "administrative",
    eventKey: randomUUID(),
    resourceType: "membership",
    resourceId: member.userId,
    locale: "fr",
    variables: {
      name: "Member <script>unsafe</script>",
      organization: "Club A",
      url: process.env.BETTER_AUTH_URL + "/fr/notifications",
    },
    ...overrides,
  });
}
async function job(id: string) {
  return (await db.query("SELECT * FROM mail_job WHERE id=$1", [id])).rows[0];
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  orgA = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id",
    )
  ).rows[0].id;
  orgB = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id",
    )
  ).rows[0].id;
  admin = await actor("Admin", orgA, "club_president");
  member = await actor("Member", orgA, "guardian");
  other = await actor("Other admin", orgB, "club_president");
  directory = await mkdtemp(join(tmpdir(), "pfm-mail-test-"));
  local = createTransport({
    ...process.env,
    MAIL_TRANSPORT: "local",
    PFM_MAIL_DIR: directory,
  });
});
beforeEach(async () => {
  await db.query(
    "TRUNCATE app_notification,mail_attempt,mail_job,notification_dispatch",
  );
  await db.query("DELETE FROM notification_preference");
  await db.query("DELETE FROM notification_setting");
  await db.query("DELETE FROM notification_template");
  await db.query("UPDATE person SET notifications_enabled=true");
  await db.query('UPDATE "user" SET active=true');
  await db.query("UPDATE organization_membership SET active=true");
  await db.query("UPDATE role_assignment SET revoked_at=NULL");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
  await rm(directory, { recursive: true, force: true });
});
describe("persistent notification engine", () => {
  it("creates one encrypted email and one inbox item for a repeated event", async () => {
    const key = randomUUID(),
      first = await notice({ eventKey: key });
    expect(await notice({ eventKey: key })).toBe(first);
    expect((await db.query("SELECT id FROM mail_job")).rowCount).toBe(1);
    expect((await db.query("SELECT id FROM app_notification")).rowCount).toBe(
      1,
    );
    const row = await job(first!);
    expect(row.payload_ciphertext).not.toContain("@example.test");
    const payload = unseal<Envelope>(row.payload_ciphertext, row.dedupe_key);
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });
  it("captures mail locally and distinguishes it from an external SMTP delivery", async () => {
    const id = await notice();
    expect(await processOne(db, local)).toMatchObject({ id, state: "local" });
    const file = JSON.parse(
      await readFile(join(directory, id + ".json"), "utf8"),
    );
    expect(file.email).toBe(member.userId + "@example.test");
    expect((await job(id!)).state).toBe("local");
    expect(await processOne(db, local)).toBeNull();
  });
  it("supports two concurrent workers without duplicate dispatch", async () => {
    const id = await notice();
    let sends = 0;
    const transport: Transport = {
      mode: "local",
      async send() {
        sends++;
        return "local";
      },
    };
    const results = await Promise.all([
      processOne(db, transport),
      processOne(db, transport),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(sends).toBe(1);
    expect((await job(id!)).attempts).toBe(1);
  });
  it("retries temporary failures without duplicating internal notifications", async () => {
    const id = await notice();
    const failing: Transport = {
      mode: "local",
      async send() {
        throw new DeliveryFailure("retry", "TEMPORARY");
      },
    };
    expect(await processOne(db, failing)).toMatchObject({ state: "pending" });
    await db.query("UPDATE mail_job SET available_at=now() WHERE id=$1", [id]);
    expect(await processOne(db, local)).toMatchObject({ state: "local" });
    expect((await job(id!)).attempts).toBe(2);
    expect((await db.query("SELECT id FROM app_notification")).rowCount).toBe(
      1,
    );
    expect((await db.query("SELECT id FROM mail_attempt")).rowCount).toBe(2);
  });
  it("stops after five automatic attempts and allows an authorized manual retry", async () => {
    const id = await notice();
    const failing: Transport = {
      mode: "local",
      async send() {
        throw new DeliveryFailure("retry", "TEMPORARY");
      },
    };
    for (let i = 0; i < 5; i++) {
      await processOne(db, failing);
      await db.query("UPDATE mail_job SET available_at=now() WHERE id=$1", [
        id,
      ]);
    }
    expect((await job(id!)).state).toBe("failed");
    await notificationExecute(
      db,
      admin,
      { action: "retry", id: id!, confirmUncertain: false },
      orgA,
    );
    expect(await processOne(db, local)).toMatchObject({ state: "local" });
  });
  it("holds uncertain SMTP outcomes for review rather than retrying blindly", async () => {
    const id = await notice();
    await processOne(db, {
      mode: "smtp",
      async send() {
        throw new DeliveryFailure("uncertain", "SMTP_OUTCOME_UNKNOWN");
      },
    });
    expect((await job(id!)).state).toBe("uncertain");
    expect(await processOne(db, local)).toBeNull();
    await expect(
      notificationExecute(
        db,
        admin,
        { action: "retry", id: id!, confirmUncertain: false },
        orgA,
      ),
    ).rejects.toMatchObject({ code: "UNCERTAIN_CONFIRM" });
    await notificationExecute(
      db,
      admin,
      { action: "retry", id: id!, confirmUncertain: true },
      orgA,
    );
    expect(await processOne(db, local)).toMatchObject({ state: "local" });
  });
  it("recovers an unstarted lease but never automatically replays a possibly accepted SMTP message", async () => {
    const id = await notice();
    await claim(db, { mode: "smtp", send: async () => "sent" });
    await db.query(
      "UPDATE mail_job SET locked_until=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await recoverExpired(db);
    expect((await job(id!)).state).toBe("pending");
    await claim(db, { mode: "smtp", send: async () => "sent" });
    await db.query(
      "UPDATE mail_job SET dispatch_started_at=now(),locked_until=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await recoverExpired(db);
    expect((await job(id!)).state).toBe("uncertain");
  });
  it("recovers local writes idempotently after a crash", async () => {
    const id = await notice(),
      row = await claim(db, local);
    await local.send(
      id!,
      unseal<Envelope>(row.payload_ciphertext, row.dedupe_key),
    );
    await db.query(
      "UPDATE mail_job SET dispatch_started_at=now(),locked_until=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await recoverExpired(db);
    expect(await processOne(db, local)).toMatchObject({ state: "local" });
    expect(
      (await readdir(directory)).filter((name) => name === id + ".json"),
    ).toHaveLength(1);
  });
  it("rechecks revoked membership before dispatch and hides the inbox", async () => {
    const id = await notice();
    await db.query(
      "UPDATE organization_membership SET active=false WHERE user_id=$1 AND organization_id=$2",
      [member.userId, orgA],
    );
    expect(await processOne(db, local)).toMatchObject({ state: "cancelled" });
    expect((await job(id!)).error_code).toBe("ACCESS_REVOKED_OR_EXPIRED");
    await expect(notificationView(db, member)).rejects.toMatchObject({
      code: "CONTEXT_REQUIRED",
    });
  });
  it("honors category and global preferences while retaining security notices", async () => {
    await notificationExecute(
      db,
      member,
      {
        action: "preferences",
        category: "administrative",
        email: false,
        inApp: false,
      },
      orgA,
    );
    const key = randomUUID();
    expect(await notice({ eventKey: key })).toBeUndefined();
    await notificationExecute(
      db,
      member,
      {
        action: "preferences",
        category: "administrative",
        email: true,
        inApp: true,
      },
      orgA,
    );
    expect(await notice({ eventKey: key })).toBeUndefined();
    await db.query(
      "UPDATE person SET notifications_enabled=false WHERE user_id=$1",
      [member.userId],
    );
    expect(await notice()).toBeUndefined();
    const security = await notice({
      kind: "access_changed",
      category: "security",
    });
    expect(security).toBeTruthy();
    expect((await notificationView(db, member)).inbox).toHaveLength(1);
  });
  it("rechecks changed preferences for already queued email", async () => {
    await notice();
    await notificationExecute(
      db,
      member,
      {
        action: "preferences",
        category: "administrative",
        email: false,
        inApp: true,
      },
      orgA,
    );
    expect(await processOne(db, local)).toMatchObject({ state: "cancelled" });
    expect((await notificationView(db, member)).inbox).toHaveLength(1);
  });
  it("marks only the recipient own notifications as read", async () => {
    await notice();
    const item = (await notificationView(db, member)).inbox[0];
    await expect(
      notificationExecute(db, admin, { action: "read", id: item.id }, orgA),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await notificationExecute(
      db,
      member,
      { action: "read", id: item.id },
      orgA,
    );
    expect((await notificationView(db, member)).unread).toBe(0);
  });
  it("isolates inboxes, queues, templates and actions across organizations", async () => {
    const id = await notice();
    expect((await notificationView(db, other)).jobs).toHaveLength(0);
    await expect(
      notificationExecute(db, other, { action: "cancel", id: id! }, orgB),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      notificationExecute(db, admin, { action: "pause", paused: true }, orgB),
    ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  });
  it("pauses only organization emails without blocking the internal inbox", async () => {
    await notice();
    await notificationExecute(
      db,
      admin,
      { action: "pause", paused: true },
      orgA,
    );
    expect(await processOne(db, local)).toBeNull();
    expect((await notificationView(db, member)).inbox).toHaveLength(1);
    await notificationExecute(
      db,
      admin,
      { action: "pause", paused: false },
      orgA,
    );
    expect(await processOne(db, local)).toMatchObject({ state: "local" });
  });
  it("versions FR/NL templates and preserves queued snapshots", async () => {
    const old = await notice();
    await notificationExecute(
      db,
      admin,
      {
        action: "template",
        kind: "test_self",
        locale: "fr",
        subject: "Modèle v1 · {organization}",
        body: "Bonjour {name}, exemple modifié.\n{url}",
        expectedVersion: 0,
      },
      orgA,
    );
    await expect(
      notificationExecute(
        db,
        admin,
        {
          action: "template",
          kind: "test_self",
          locale: "fr",
          subject: "Stale",
          body: "Ancien texte {url}",
          expectedVersion: 0,
        },
        orgA,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    const next = await notice();
    expect((await job(old!)).template_version).toBe(0);
    expect((await job(next!)).template_version).toBe(1);
    const view = await notificationView(db, admin);
    expect(
      view.templates.find((t) => t.kind === "test_self" && t.locale === "nl")
        ?.version,
    ).toBe(0);
    await expect(
      templatePreview(db, member, {
        organizationId: orgA,
        kind: "test_self",
        locale: "fr",
        subject: "Preview",
        body: "Bonjour {url}",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("does not expose encrypted payloads or authentication links in organization queue metadata", async () => {
    await notice();
    const view = await notificationView(db, admin);
    expect(view.jobs[0]).not.toHaveProperty("payload_ciphertext");
    expect(view.jobs[0]).not.toHaveProperty("url");
    expect(view.jobs[0]).not.toHaveProperty("dedupe_key");
  });
  it("creates queued invitation emails from the existing invitation service and cancels revoked links", async () => {
    const response = await execute(db, admin, {
      action: "invite",
      email: "invited@example.test",
      role: "player",
      grants: [],
      validUntil: null,
    });
    expect("token" in response).toBe(true);
    const invitation = (
      await db.query(
        "SELECT id FROM invitation WHERE email='invited@example.test' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0].id;
    const queued = (
      await db.query("SELECT id FROM mail_job WHERE kind='invitation'")
    ).rows[0].id;
    await execute(db, admin, { action: "cancelInvitation", id: invitation });
    expect(await processOne(db, local)).toMatchObject({ state: "cancelled" });
    expect((await job(queued)).state).toBe("cancelled");
  });
  it("sends no verification email and delivers actual recovery links through the persistent local worker", async () => {
    const auth = createAuth(db),
      email = "auth-" + randomUUID() + "@example.test";
    const created = await auth.api.signUpEmail({
      body: { email, name: "Auth user", password: "Auth-fixture-only-2026!" },
    });
    expect(
      (
        await db.query("SELECT id FROM mail_job WHERE recipient_user_id=$1", [
          created.user.id,
        ])
      ).rowCount,
    ).toBe(0);
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: process.env.BETTER_AUTH_URL + "/fr/access" },
    });
    const reset = (
      await db.query(
        "SELECT id FROM mail_job WHERE recipient_user_id=$1 AND kind='auth_reset'",
        [created.user.id],
      )
    ).rows[0].id;
    expect(await processOne(db, local)).toMatchObject({
      id: reset,
      state: "local",
    });
    const recovery = JSON.parse(
      await readFile(join(directory, reset + ".json"), "utf8"),
    );
    await auth.api.resetPassword({
      body: {
        token: new URL(recovery.url).pathname.split("/").pop()!,
        newPassword: "Updated-fixture-passphrase-2026!",
      },
    });
  });
  it("transmits a message through a real loopback SMTP server, without any external recipient", async () => {
    let captured = "";
    const smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS", "AUTH"],
      onData(stream, _session, callback) {
        stream.on("data", (chunk) => {
          captured += chunk.toString();
        });
        stream.on("end", () => callback());
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
    try {
      const id = await notice(),
        port = (smtp.server.address() as AddressInfo).port;
      const transport = createTransport({
        ...process.env,
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(port),
        SMTP_FROM: "notifications@pfm.test",
      });
      expect(await processOne(db, transport)).toMatchObject({
        id,
        state: "sent",
      });
      expect(captured).toMatch(
        new RegExp("Message-ID: <" + id + "@pfm.test>", "i"),
      );
      expect((await job(id!)).state).toBe("sent");
    } finally {
      await new Promise<void>((resolve) => smtp.close(resolve));
    }
  });
  it("rechecks family authorization before inbox reading and dispatch", async () => {
    const guardian = (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,'Guardian fixture','1980-01-01' FROM person WHERE user_id=$2 RETURNING id",
        [orgA, member.userId],
      )
    ).rows[0].id;
    const childPerson = (
      await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")
    ).rows[0].id;
    const child = (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,'Child fixture',CURRENT_DATE-interval '10 years') RETURNING id",
        [orgA, childPerson],
      )
    ).rows[0].id;
    const relationship = (
      await db.query(
        "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,'Verified fixture',$4) RETURNING id",
        [orgA, guardian, child, admin.userId],
      )
    ).rows[0].id;
    const id = await notice({
      kind: "family_access",
      resourceType: "family",
      resourceId: relationship,
    });
    expect((await notificationView(db, member)).inbox).toHaveLength(1);
    await db.query(
      "UPDATE guardian_relationship SET revoked_at=now() WHERE id=$1",
      [relationship],
    );
    expect((await notificationView(db, member)).inbox).toHaveLength(0);
    expect(await processOne(db, local)).toMatchObject({
      id,
      state: "cancelled",
    });
    await db.query(
      "UPDATE guardian_relationship SET revoked_at=NULL WHERE id=$1",
      [relationship],
    );
    await notice({
      kind: "family_access",
      resourceType: "family",
      resourceId: relationship,
    });
    await db.query(
      "UPDATE club_person SET birth_date=CURRENT_DATE-interval '18 years' WHERE id=$1",
      [child],
    );
    expect((await notificationView(db, member)).inbox).toHaveLength(0);
    expect(await processOne(db, local)).toMatchObject({ state: "cancelled" });
  });
  it("queues a team notification atomically from the real people service", async () => {
    const profile = (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Team member fixture' FROM person WHERE user_id=$2 ON CONFLICT(organization_id,person_id) DO UPDATE SET status='active' RETURNING id",
        [orgA, member.userId],
      )
    ).rows[0].id;
    const season = (
      await db.query(
        "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Notification season','2026-01-01','2027-12-31') RETURNING id",
        [orgA],
      )
    ).rows[0].id;
    const team = (
      await db.query(
        "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Notification team') RETURNING id",
        [orgA, season],
      )
    ).rows[0].id;
    await peopleExecute(
      db,
      admin,
      {
        action: "assign",
        teamId: team,
        profileId: profile,
        role: "player",
        position: "",
        startsOn: "2026-10-01",
        endsOn: null,
      },
      orgA,
    );
    const rows = await db.query(
      "SELECT kind,recipient_user_id,resource_type FROM mail_job",
    );
    expect(rows.rows).toEqual([
      {
        kind: "team_assignment",
        recipient_user_id: member.userId,
        resource_type: "team",
      },
    ]);
    expect(await processOne(db, local)).toMatchObject({ state: "local" });
  });
  it("waits for an auth transaction, then cancels an expired recovery token", async () => {
    const id = await publish(db, {
      organizationId: null,
      userId: member.userId,
      email: member.userId + "@example.test",
      kind: "auth_reset",
      category: "security",
      eventKey: randomUUID(),
      resourceType: "auth",
      resourceId: member.userId,
      locale: "fr",
      variables: {
        name: "Fixture",
        organization: "",
        url:
          process.env.BETTER_AUTH_URL +
          "/api/auth/reset-password/missing-token",
      },
      inApp: false,
    });
    expect(await processOne(db, local)).toMatchObject({ id, state: "pending" });
    expect((await job(id!)).error_code).toBe("AUTH_TRANSACTION_PENDING");
    await db.query(
      "UPDATE mail_job SET created_at=now()-interval '2 minutes',available_at=now() WHERE id=$1",
      [id],
    );
    expect(await processOne(db, local)).toMatchObject({
      id,
      state: "cancelled",
    });
    const disabled = await notice();
    await db.query('UPDATE "user" SET active=false WHERE id=$1', [
      member.userId,
    ]);
    expect(await processOne(db, local)).toMatchObject({
      id: disabled,
      state: "cancelled",
    });
  });
  it("uses the Dutch locale chosen during real signup", async () => {
    const auth = createAuth(db);
    const created = await auth.api.signUpEmail({
      body: {
        name: "Nederlandse gebruiker",
        email: randomUUID() + "@example.test",
        password: "Dutch-fixture-password-2026!",
        callbackURL: process.env.BETTER_AUTH_URL + "/nl/access",
      },
    });
    expect(
      (
        await db.query("SELECT locale FROM person WHERE user_id=$1", [
          created.user.id,
        ])
      ).rows[0].locale,
    ).toBe("nl");
    expect(
      (
        await db.query("SELECT id FROM mail_job WHERE recipient_user_id=$1", [
          created.user.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
});
