import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  calendarExecute,
  commandSchema as calendarSchema,
} from "../../src/domains/calendar/service";
import {
  attendanceExecute,
  attendanceView,
  attendanceTick,
  commandSchema,
} from "../../src/domains/attendance/service";
import { notificationAllowed } from "../../src/domains/attendance/access";
import { processOne } from "../../src/domains/notifications/worker";
const schema = "attendance_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
type P = Principal & { mandateId: string };
let org: string,
  orgB: string,
  season: string,
  team: string,
  teamB: string,
  admin: P,
  coach: P,
  player: P,
  parent: P,
  parent2: P,
  outsider: P,
  child: string,
  self: string,
  eventId: string;
async function actor(
  role: string,
  o = org,
  t: string | null = null,
): Promise<P> {
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
    [o, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,$3,$4) RETURNING id",
      [o, userId, role, t],
    )
  ).rows[0].id;
  const p = { userId, sessionId, mandateId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function profile(name: string, p?: P) {
  const person = p
    ? (await db.query("SELECT id FROM person WHERE user_id=$1", [p.userId]))
        .rows[0].id
    : (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0]
        .id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,$3,'2015-01-01') RETURNING id",
      [org, person, name],
    )
  ).rows[0].id as string;
}
const run = (p: P, cmd: unknown, o = org) =>
  attendanceExecute(db, p, commandSchema.parse(cmd), o);
async function view(p = admin) {
  const d = new Date(),
    from = new Date(d.getTime() - 86400000).toISOString().slice(0, 10),
    to = new Date(d.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  return attendanceView(db, p, from, to);
}
async function invite(
  profiles = [child, self],
  overrides: Record<string, unknown> = {},
) {
  return (
    await run(admin, {
      action: "invite",
      eventId,
      expectedVersion: null,
      profiles,
      deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
      minimum: 1,
      ...overrides,
    })
  ).id;
}
async function invitation(profile = child) {
  return (
    await db.query(
      "SELECT * FROM attendance_invitation WHERE profile_id=$1 AND withdrawn_at IS NULL",
      [profile],
    )
  ).rows[0];
}
async function reg() {
  return (
    await db.query("SELECT * FROM attendance_register WHERE event_id=$1", [
      eventId,
    ])
  ).rows[0];
}
async function respond(
  p = parent,
  profile = child,
  response = "present",
  expected?: number,
) {
  const i = await invitation(profile);
  return run(p, {
    action: "respond",
    id: i.id,
    expectedVersion: expected ?? i.version,
    response,
    comment: "Transport confirmé",
  });
}
async function started() {
  await db.query(
    "UPDATE calendar_event SET starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' WHERE id=$1",
    [eventId],
  );
}
async function mark(profile = child, actual = "present", reason = "") {
  const i = await invitation(profile);
  return run(coach, {
    action: "mark",
    id: i.id,
    expectedVersion: i.version,
    actual,
    reason,
  });
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  org = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Attendance','club') RETURNING id",
    )
  ).rows[0].id;
  orgB = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Other','club') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Season','2020-01-01','2099-12-31') RETURNING id",
      [org],
    )
  ).rows[0].id;
  for (const name of ["Team A", "Team B"]) {
    const id = (
      await db.query(
        "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,$3) RETURNING id",
        [org, season, name],
      )
    ).rows[0].id;
    if (name === "Team A") team = id;
    else teamB = id;
  }
  admin = await actor("club_president");
  coach = await actor("coach", org, team);
  player = await actor("player");
  parent = await actor("guardian");
  parent2 = await actor("guardian");
  outsider = await actor("club_president", orgB);
  child = await profile("Child");
  self = await profile("Adult", player);
  for (const id of [child, self])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')",
      [org, team, id],
    );
  for (const p of [parent, parent2]) {
    const id = await profile("Parent " + p.userId, p);
    await db.query(
      "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Verified',$4)",
      [org, id, child, admin.userId],
    );
  }
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  await db.query("TRUNCATE calendar_series,calendar_event CASCADE");
  await db.query(
    "TRUNCATE notification_dispatch,mail_job,mail_attempt,app_notification",
  );
  await db.query("UPDATE role_assignment SET revoked_at=NULL");
  await db.query("UPDATE organization_membership SET active=true");
  await db.query('UPDATE "user" SET active=true,"twoFactorEnabled"=true');
  await db.query(
    "UPDATE guardian_relationship SET revoked_at=NULL,can_edit=true,can_view=true,kind='legal_verified'",
  );
  await db.query("UPDATE club_person SET birth_date='2015-01-01' WHERE id=$1", [
    child,
  ]);
  await db.query("UPDATE role_assignment SET team_id=$2 WHERE id=$1", [
    coach.mandateId,
    team,
  ]);
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  eventId = (
    await calendarExecute(
      db,
      admin,
      calendarSchema.parse({
        action: "create",
        requestId: randomUUID(),
        title: "Training",
        kind: "training",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: day + "T18:00",
        localEnd: day + "T20:00",
        fold: "reject",
        teamId: team,
        placeId: null,
        responsibleId: admin.userId,
        visibility: "team",
        equipment: "",
        instructions: "",
        participants: [],
        documents: [],
        intervalDays: 0,
        occurrences: 1,
      }),
      org,
    )
  ).id;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
it("persists invitations and keeps declared availability separate from actual presence", async () => {
  await invite();
  await respond();
  await started();
  await mark(child, "absent");
  const i = await invitation();
  expect(i.response).toBe("present");
  expect(i.actual).toBe("absent");
  expect((await view(parent)).events[0].invitations).toHaveLength(1);
  expect((await view(player)).events[0].invitations).toHaveLength(1);
});
it("allows an autonomous adult without MFA to answer only their own invitation", async () => {
  await invite();
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    player.userId,
  ]);
  await respond(player, self, "uncertain");
  await expect(respond(player, child)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect((await invitation(self)).response).toBe("uncertain");
});
it("rejects stale replies from a second guardian without overwriting the first", async () => {
  await invite();
  const v = (await invitation()).version;
  await respond(parent, child, "present", v);
  await expect(respond(parent2, child, "absent", v)).rejects.toMatchObject({
    code: "STALE_VERSION",
  });
  await respond(parent2, child, "uncertain");
  expect((await invitation()).response).toBe("uncertain");
  expect(
    (await view(parent)).events[0].history.filter(
      (h) => h.action === "respond",
    ),
  ).toHaveLength(2);
});
it("rechecks family edit rights, revocation, majority and declared relationships", async () => {
  await invite();
  await db.query("UPDATE guardian_relationship SET can_edit=false");
  await expect(respond()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.query(
    "UPDATE guardian_relationship SET can_edit=false,can_view=false,kind='declared'",
  );
  await expect(respond()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.query(
    "UPDATE guardian_relationship SET kind='legal_verified',can_edit=true,can_view=true",
  );
  await db.query("UPDATE club_person SET birth_date='2000-01-01' WHERE id=$1", [
    child,
  ]);
  expect((await view(parent)).events).toHaveLength(0);
  await expect(respond()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.query("UPDATE club_person SET birth_date='2015-01-01' WHERE id=$1", [
    child,
  ]);
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  expect(
    await notificationAllowed(db, parent.userId, (await invitation()).id),
  ).toBe(false);
});
it("does not combine a read-only adult delegation with an expired legal editing authority", async () => {
  await invite();
  await db.query("UPDATE club_person SET birth_date='2000-01-01' WHERE id=$1", [
    child,
  ]);
  const g = (
    await db.query(
      "SELECT guardian_profile_id FROM guardian_relationship WHERE subject_profile_id=$1 LIMIT 1",
      [child],
    )
  ).rows[0].guardian_profile_id;
  const u = (
    await db.query(
      "SELECT p.user_id FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.id=$1",
      [g],
    )
  ).rows[0].user_id;
  await db.query(
    "UPDATE guardian_relationship SET revoked_at=now() WHERE guardian_profile_id=$1",
    [g],
  );
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by,ends_on) VALUES($1,$2,$3,'delegated_aid',true,false,'Adult delegation',$4,CURRENT_DATE+30)",
    [org, g, child, admin.userId],
  );
  const p = u === parent.userId ? parent : parent2;
  await expect(respond(p)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.query(
    "DELETE FROM guardian_relationship WHERE kind='delegated_aid'",
  );
});
it("isolates clubs and coaches assigned to another team", async () => {
  await invite();
  expect((await view(outsider)).events).toHaveLength(0);
  await expect(
    run(
      outsider,
      {
        action: "respond",
        id: (await invitation()).id,
        expectedVersion: 1,
        response: "present",
        comment: "",
      },
      orgB,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.query("UPDATE role_assignment SET team_id=$2 WHERE id=$1", [
    coach.mandateId,
    teamB,
  ]);
  await started();
  await expect(mark()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects late replies, future pointage and invalid deadlines or thresholds", async () => {
  await expect(invite([child], { minimum: 2 })).rejects.toMatchObject({
    code: "INVALID_THRESHOLD",
  });
  await expect(
    invite([child], { deadline: new Date(Date.now() - 1000).toISOString() }),
  ).rejects.toMatchObject({ code: "INVALID_DEADLINE" });
  await invite();
  await expect(mark()).rejects.toMatchObject({ code: "EVENT_NOT_STARTED" });
  await db.query(
    "UPDATE attendance_register SET deadline=now()-interval '1 minute'",
  );
  await expect(respond()).rejects.toMatchObject({ code: "RESPONSE_CLOSED" });
});
it("closes only fully marked registers and traces motivated corrections", async () => {
  await invite();
  await respond();
  await started();
  await mark();
  const r = await reg();
  await expect(
    run(coach, { action: "close", id: r.id, expectedVersion: r.version }),
  ).rejects.toMatchObject({ code: "INCOMPLETE_REGISTER" });
  await mark(self, "late");
  await run(coach, { action: "close", id: r.id, expectedVersion: r.version });
  await expect(mark(child, "absent")).rejects.toMatchObject({
    code: "CORRECTION_REASON",
  });
  await mark(child, "early", "Départ observé à 19 h");
  expect((await invitation()).response).toBe("present");
  expect((await view(coach)).events[0].history[0].reason).toBe(
    "Départ observé à 19 h",
  );
  expect((await view(parent)).stats[0]).toMatchObject({
    invited: 1,
    answered: 1,
    closed: 1,
    attended: 1,
  });
});
it("withdraws invitations, preserves history and stops responses and queued notices", async () => {
  await invite();
  await respond();
  const i = await invitation(),
    r = await reg();
  await invite([self], { expectedVersion: r.version });
  await expect(
    run(parent, {
      action: "respond",
      id: i.id,
      expectedVersion: i.version + 1,
      response: "absent",
      comment: "",
    }),
  ).rejects.toMatchObject({ code: "INVITATION_WITHDRAWN" });
  expect((await view(parent)).events).toHaveLength(0);
  expect(await notificationAllowed(db, parent.userId, i.id)).toBe(false);
  expect(
    (
      await db.query("SELECT response FROM attendance_invitation WHERE id=$1", [
        i.id,
      ])
    ).rows[0].response,
  ).toBe("present");
});
it("cancellation blocks response, pointage, stats and pending delivery", async () => {
  await invite();
  await db.query("UPDATE calendar_event SET status='cancelled' WHERE id=$1", [
    eventId,
  ]);
  await expect(respond()).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
  await expect(mark()).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
  expect((await view()).stats).toHaveLength(0);
  expect(
    await notificationAllowed(db, parent.userId, (await invitation()).id),
  ).toBe(false);
});
it("reminds only nonrespondents, throttles repeated requests and respects worker idempotency", async () => {
  await invite();
  await respond();
  await db.query(
    "TRUNCATE notification_dispatch,mail_job,mail_attempt,app_notification",
  );
  const r = await reg();
  await run(coach, { action: "remind", id: r.id, expectedVersion: r.version });
  expect(
    (
      await db.query(
        "SELECT recipient_user_id FROM mail_job WHERE resource_type='attendance'",
      )
    ).rows.map((r) => r.recipient_user_id),
  ).toEqual([player.userId]);
  await expect(
    run(coach, { action: "remind", id: r.id, expectedVersion: r.version + 1 }),
  ).rejects.toMatchObject({ code: "REMINDER_RECENT" });
  await db.query(
    "UPDATE attendance_register SET reminder_sent_at=NULL,deadline=now()+interval '1 hour'",
  );
  expect(await attendanceTick(db)).toBe(1);
  expect(await attendanceTick(db)).toBe(0);
});
it("checks the low-confirmation threshold once after the deadline and alerts only staff", async () => {
  await invite();
  await db.query(
    "TRUNCATE notification_dispatch,mail_job,mail_attempt,app_notification",
  );
  await db.query(
    "UPDATE attendance_register SET deadline=now()-interval '1 minute'",
  );
  expect(await attendanceTick(db)).toBe(1);
  expect(await attendanceTick(db)).toBe(0);
  const recipients = (
    await db.query(
      "SELECT recipient_user_id FROM mail_job WHERE resource_type='attendance'",
    )
  ).rows.map((r) => r.recipient_user_id);
  expect(recipients).toContain(admin.userId);
  expect(recipients).toContain(coach.userId);
  expect(recipients).not.toContain(parent.userId);
});
it("cancels queued family emails after revocation at worker delivery time", async () => {
  await invite();
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  let delivered = 0;
  for (let n = 0; n < 20; n++) {
    const v = await processOne(db, {
      mode: "local",
      send: async () => {
        delivered++;
        return "local";
      },
    });
    if (!v) break;
  }
  expect(
    (
      await db.query(
        "SELECT state FROM mail_job WHERE recipient_user_id=$1 AND resource_type='attendance'",
        [parent.userId],
      )
    ).rows.every((r) => r.state === "cancelled"),
  ).toBe(true);
  expect(delivered).toBeGreaterThan(0);
});
it("works without a second factor (removed) and still grants no extra role nor cross-club access", async () => {
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false');
  await invite();
  await started();
  await mark();
  await expect(
    run(player, { action: "close", id: (await reg()).id, expectedVersion: 1 }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await view(outsider)).events).toHaveLength(0);
});
it("rejects revoked mandates and changed organization contexts", async () => {
  await invite();
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1", [
    parent.mandateId,
  ]);
  await expect(respond()).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
  await expect(
    run(
      admin,
      { action: "close", id: (await reg()).id, expectedVersion: 1 },
      orgB,
    ),
  ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});

it("reinvites a withdrawn participant with a fresh unanswered response and preserves the old declaration in history", async () => {
  await invite();
  await respond();
  await invite([self], { expectedVersion: (await reg()).version });
  await invite([self, child], { expectedVersion: (await reg()).version });
  expect((await invitation()).response).toBe("none");
  expect((await invitation()).comment).toBe("");
  const h = (await view()).events[0].history.filter(
    (h) => h.action === "invite",
  );
  expect(h[0].before_data).not.toBeNull();
});
it("uses the moved event start as a response cutoff and threshold checkpoint", async () => {
  await invite();
  await started();
  await expect(respond()).rejects.toMatchObject({ code: "RESPONSE_CLOSED" });
  await expect(
    run(coach, {
      action: "remind",
      id: (await reg()).id,
      expectedVersion: (await reg()).version,
    }),
  ).rejects.toMatchObject({ code: "RESPONSE_CLOSED" });
  expect(await attendanceTick(db)).toBe(1);
  expect((await reg()).alert_sent_at).not.toBeNull();
});
