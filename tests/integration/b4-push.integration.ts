import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { attendanceExecute } from "../../src/domains/attendance/service";
import { commandSchema } from "../../src/domains/attendance/schema";
import { calendarExecute } from "../../src/domains/calendar/service";
import { processPush, pushExecute, pushView, type PushSender } from "../../src/domains/notifications/push";
import { queuePush, type PushPayload } from "../../src/domains/notifications/push-queue";
import { respondFromPush } from "../../src/domains/notifications/push-respond";
import { unseal } from "../../src/domains/notifications/crypto";

/**
 * B4: push notifications. An invitation reaches the parent's phone once per
 * child, with the first name, and nobody of another team or club; a topic
 * switched off is respected; « Présent » from the notification uses the
 * attendance checks (refused after the deadline); rights are read again
 * when it leaves; close notifications are grouped; an expired device is
 * forgotten; a cancellation within 48 hours is urgent.
 */
const schema = "b4push_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, parent: Principal, otherCoach: Principal;
let team: string, other: string, event: string, register: string, ana: string, bilal: string, series: string;

async function actor(org: string, role: string, name: string, teamId: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, teamId])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(name: string) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2012-01-01','{player}') RETURNING id", [clubA, person, name])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, team, id]);
  return id;
}
let devices = 0;
const device = (p: Principal) =>
  pushExecute(db, p, { action: "subscribe", subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${p.userId}-${devices++}`, p256dh: "B" + "x".repeat(86), auth: "a".repeat(22), label: "Android · Chrome" } }, null);
const jobs = async (userId: string) =>
  (await db.query("SELECT id,topic,state,error_code,payload_ciphertext,dedupe_key FROM push_job WHERE recipient_user_id=$1 ORDER BY created_at", [userId])).rows.map((j) => ({ ...j, payload: unseal<PushPayload>(j.payload_ciphertext, j.dedupe_key) }));
/** A push service that answers what the test says, and keeps what it received. */
function fake(status = 201) {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const sender: PushSender = { mode: "local", send: async (sub, payload) => (sent.push({ endpoint: sub.endpoint, payload }), status) };
  return { sent, sender };
}
const drain = async (sender: PushSender) => {
  while (await processPush(db, sender));
};

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  other = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Ours') RETURNING id", [clubA, season])).rows[0].id;
  otherCoach = (await actor(clubA, "coach", "Coach Ours", other)).p;
  ana = await player("Ana Peeters");
  bilal = await player("Bilal Peeters");
  // One parent for both children.
  const pa = await actor(clubA, "guardian", "Parent Peeters");
  parent = pa.p;
  const guardian = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent Peeters') RETURNING id", [clubA, pa.person])).rows[0].id;
  // The parent may answer for Ana; for Bilal, only read (no buttons on his notification).
  for (const [child, edit] of [
    [ana, true],
    [bilal, false],
  ] as const)
    await db.query(
      "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,$5,'Vérifié pour le test',$4)",
      [clubA, guardian, child, president.userId, edit],
    );
  // Everybody has a phone, except the president of club A.
  for (const p of [parent, presidentB, otherCoach]) await device(p);
  series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,1,'Entraînement','training','Europe/Brussels',now()+interval '3 days',now()+interval '3 days 2 hours','2026-11-04T18:00','2026-11-04T20:00',$3,$4,'organization') RETURNING id",
      [clubA, series, team, president.userId],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("sends one invitation per child to the parent's phone, and to nobody else", async () => {
  await attendanceExecute(db, president, commandSchema.parse({ action: "invite", eventId: event, expectedVersion: null, profiles: [ana, bilal], deadline: new Date(Date.now() + 2 * 86400000).toISOString(), minimum: 0 }), clubA);
  register = (await db.query("SELECT id FROM attendance_register WHERE event_id=$1", [event])).rows[0].id;
  const mine = await jobs(parent.userId);
  expect(mine.map((j) => j.topic)).toEqual(["invitation", "invitation"]);
  expect(mine.map((j) => j.payload.body).sort()).toEqual(["Nouvelle invitation pour Ana : répondez présent ou absent.", "Nouvelle invitation pour Bilal : répondez présent ou absent."]);
  // No surname, no detail of the event on the phone.
  expect(JSON.stringify(mine.map((j) => j.payload))).not.toMatch(/Peeters|Entraînement/);
  const forAna = mine.find((j) => j.payload.body.includes("Ana"))!.payload,
    forBilal = mine.find((j) => j.payload.body.includes("Bilal"))!.payload;
  expect(forAna).toMatchObject({ title: "Club A", url: "/fr/attendance", invitation: { organizationId: clubA, present: "Présent", absent: "Absent" } });
  expect(forBilal.invitation).toBeUndefined();
  expect(await jobs(presidentB.userId)).toEqual([]);
  expect(await jobs(otherCoach.userId)).toEqual([]);
  expect(await jobs(president.userId)).toEqual([]);
  // Each child's notification leaves alone, with its buttons.
  const { sent, sender } = fake();
  await drain(sender);
  expect(sent.map((s) => s.payload.body).sort()).toEqual(mine.map((j) => j.payload.body).sort());
});

it("respects a topic switched off", async () => {
  await pushExecute(db, parent, { action: "preference", organizationId: clubA, topic: "invitation", enabled: false }, null);
  expect((await pushView(db, parent)).clubs.find((c) => c.id === clubA)!.topics).toMatchObject({ invitation: false, urgent: true });
  const before = (await jobs(parent.userId)).length;
  const version = (await db.query("SELECT version FROM attendance_register WHERE id=$1", [register])).rows[0].version;
  await attendanceExecute(db, president, commandSchema.parse({ action: "remind", id: register, expectedVersion: version }), clubA);
  expect((await jobs(parent.userId)).length).toBe(before);
  // A club the person is not a member of cannot be set.
  await expect(pushExecute(db, parent, { action: "preference", organizationId: clubB, topic: "dues", enabled: false }, null)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await pushExecute(db, parent, { action: "preference", organizationId: clubA, topic: "invitation", enabled: true }, null);
});

it("answers from the notification with the attendance checks, refused after the deadline", async () => {
  const invitation = (await db.query("SELECT id FROM attendance_invitation WHERE profile_id=$1", [ana])).rows[0].id;
  await respondFromPush(db, parent, invitation, clubA, "present");
  expect((await db.query("SELECT response,responded_by FROM attendance_invitation WHERE id=$1", [invitation])).rows[0]).toEqual({ response: "present", responded_by: parent.userId });
  // Another club's person may not answer.
  await expect(respondFromPush(db, presidentB, invitation, clubA, "absent")).rejects.toBeTruthy();
  await db.query("UPDATE attendance_register SET deadline=now()-interval '1 minute' WHERE id=$1", [register]);
  await expect(respondFromPush(db, parent, invitation, clubA, "absent")).rejects.toMatchObject({ code: "RESPONSE_CLOSED" });
  expect((await db.query("SELECT response FROM attendance_invitation WHERE id=$1", [invitation])).rows[0].response).toBe("present");
});

it("reads the rights again when it leaves, and groups close notifications", async () => {
  // Two pieces of news close together: one notification.
  for (const k of ["a", "b"]) await queuePush(db, { organizationId: clubA, userId: parent.userId, topic: "other", kind: "registration_update", category: "administrative", resourceType: "membership", resourceId: k, locale: "fr", eventKey: "test:" + k, url: "/fr" });
  const { sent, sender } = fake();
  await drain(sender);
  expect(sent.map((s) => s.payload.body)).toEqual(["2 nouvelles notifications du club."]);
  expect((await jobs(parent.userId)).slice(-2).map((j) => j.state).sort()).toEqual(["grouped", "sent"]);
  // The parent leaves the club before it is sent: cancelled.
  await queuePush(db, { organizationId: clubA, userId: parent.userId, topic: "other", kind: "registration_update", category: "administrative", resourceType: "membership", resourceId: "c", locale: "fr", eventKey: "test:c", url: "/fr" });
  await db.query("UPDATE organization_membership SET active=false WHERE organization_id=$1 AND user_id=$2", [clubA, parent.userId]);
  const after = fake();
  await drain(after.sender);
  expect(after.sent).toEqual([]);
  expect((await jobs(parent.userId)).at(-1)).toMatchObject({ state: "cancelled", error_code: "ACCESS_OR_PREFERENCE" });
  // Not a member any more: nothing is even queued.
  expect(await queuePush(db, { organizationId: clubA, userId: parent.userId, topic: "other", kind: "registration_update", category: "administrative", resourceType: "membership", resourceId: "d", locale: "fr", eventKey: "test:d", url: "/fr" })).toBeNull();
  await db.query("UPDATE organization_membership SET active=true WHERE organization_id=$1 AND user_id=$2", [clubA, parent.userId]);
});

it("calls a cancellation within 48 hours urgent, and forgets an expired device", async () => {
  const soon = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility) VALUES($1,$2,2,'Match','friendly','Europe/Brussels',now()+interval '20 hours',now()+interval '22 hours','2026-11-02T07:00','2026-11-02T09:00',$3,$4,'organization') RETURNING id,version",
      [clubA, series, team, president.userId],
    )
  ).rows[0];
  await calendarExecute(db, president, { action: "cancel", id: soon.id, expectedVersion: soon.version, scope: "one", reason: "Salle fermée" } as never, clubA);
  const urgent = (await jobs(parent.userId)).filter((j) => j.topic === "urgent");
  expect(urgent).toHaveLength(1);
  expect(urgent[0].payload).toMatchObject({ urgent: true, body: "Changement de dernière minute : un rendez-vous des prochaines 48 heures a changé." });
  expect(JSON.stringify(urgent[0].payload)).not.toContain("Salle fermée");
  // The push service says the device is gone (410): it is removed, the line cancelled.
  const { sent, sender } = fake(410);
  await drain(sender);
  expect(sent.length).toBeGreaterThan(0);
  expect((await db.query("SELECT count(*)::int AS n FROM push_subscription WHERE user_id=$1", [parent.userId])).rows[0].n).toBe(0);
  expect((await jobs(parent.userId)).at(-1)).toMatchObject({ state: "cancelled", error_code: "NO_DEVICE" });
  // Without a device, nothing more is queued.
  expect(await queuePush(db, { organizationId: clubA, userId: parent.userId, topic: "urgent", kind: "calendar_update", category: "sport", resourceType: "calendar", resourceId: soon.id, locale: "fr", eventKey: "test:e", url: "/fr/calendar" })).toBeNull();
});

it("keeps devices to their account", async () => {
  const mine = await pushView(db, presidentB);
  expect(mine.devices).toHaveLength(1);
  expect(mine.clubs.map((c) => c.name)).toEqual(["Club B"]);
  await expect(pushExecute(db, otherCoach, { action: "remove", id: mine.devices[0].id }, null)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(pushExecute(db, presidentB, { action: "test" }, null)).rejects.toMatchObject({ code: "PUSH_NOT_CONFIGURED" });
  const { sent, sender } = fake();
  expect(await pushExecute(db, presidentB, { action: "test" }, sender)).toMatchObject({ sent: 1 });
  expect(sent[0].payload.body).toBe("Les notifications fonctionnent sur cet appareil.");
});
