import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  calendarExecute,
  calendarView,
  calendarFeed,
  commandSchema,
} from "../../src/domains/calendar/service";
import { localAt, shiftLocal } from "../../src/domains/calendar/time";
import { processOne } from "../../src/domains/notifications/worker";
import { dashboardView } from "../../src/domains/dashboard/service";
const schema = "calendar_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
    max: 10,
  });
type Actor = Principal & { mandateId: string };
let org: string,
  orgB: string,
  season: string,
  teamA: string,
  teamB: string,
  admin: Actor,
  coach: Actor,
  player: Actor,
  other: Actor,
  parent: Actor,
  outsider: Actor,
  child: string,
  place: string;
const start = shiftLocal(localAt(new Date(), "Europe/Brussels"), 14).slice(
    0,
    10,
  ),
  range = {
    from: start,
    to: shiftLocal(start + "T12:00", 80).slice(0, 10),
    team: "",
    place: "",
  };
async function actor(
  orgId: string,
  role: string,
  scopedTeam?: string,
): Promise<Actor> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,$4)',
    [
      userId,
      "Calendar " + role,
      userId + "@example.test",
      !["player", "guardian"].includes(role),
    ],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [orgId, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,$3,$4) RETURNING id",
      [orgId, userId, role, scopedTeam ?? null],
    )
  ).rows[0].id;
  const p = { userId, sessionId, mandateId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function profile(name: string, user?: Actor) {
  const person = user
    ? (await db.query("SELECT id FROM person WHERE user_id=$1", [user.userId]))
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
const placeValues = {
  action: "place",
  name: "Salle accessible",
  address: "Rue du sport 1",
  contact: "Accueil",
  capacity: 20,
  costCents: 2500,
  accessible: true,
  toilets: true,
  parking: true,
  storage: true,
  charging: true,
  logistics: "Entrée latérale",
  archived: false,
};
function run(p: Principal, input: unknown, orgId = org) {
  return calendarExecute(db, p, commandSchema.parse(input), orgId);
}
function values(overrides: Record<string, unknown> = {}) {
  return {
    title: "Entraînement",
    kind: "training",
    customType: "",
    timezone: "Europe/Brussels",
    localStart: start + "T18:00",
    localEnd: start + "T20:00",
    fold: "reject",
    teamId: teamA,
    placeId: place,
    responsibleId: admin.userId,
    visibility: "team",
    equipment: "Ballons",
    instructions: "Entrée latérale",
    participants: [],
    documents: [],
    ...overrides,
  };
}
async function create(
  overrides: Record<string, unknown> = {},
  p: Principal = admin,
) {
  return (
    await run(p, {
      action: "create",
      ...values(),
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
      ...overrides,
    })
  ).id as string;
}
async function row(id: string) {
  return (await db.query("SELECT * FROM calendar_event WHERE id=$1", [id]))
    .rows[0];
}
async function update(id: string, overrides: Record<string, unknown> = {}) {
  return run(admin, {
    action: "update",
    id,
    expectedVersion: (await row(id)).version,
    scope: "one",
    ...values(),
    ...overrides,
  });
}
async function cancel(id: string, scope = "one") {
  return run(admin, {
    action: "cancel",
    id,
    expectedVersion: (await row(id)).version,
    scope,
    reason: "Vacances du club",
  });
}
async function feed(p: Actor = player) {
  const result = await run(p, {
    action: "feed",
    name: "Mon planning",
    teamId: null,
  });
  return { ...result, token: result.url!.split("/").pop()! };
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const file of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + file, "utf8"));
  org = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club Calendar','club') RETURNING id",
    )
  ).rows[0].id;
  orgB = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Planning','2020-01-01','2099-12-31') RETURNING id",
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
    if (name === "Team A") teamA = id;
    else teamB = id;
  }
  admin = await actor(org, "club_president");
  coach = await actor(org, "coach", teamA);
  player = await actor(org, "player");
  other = await actor(org, "player");
  parent = await actor(org, "guardian");
  outsider = await actor(orgB, "club_president");
  const p = await profile("Player A", player),
    o = await profile("Player B", other);
  child = await profile("Child");
  const g = await profile("Parent", parent);
  for (const [id, team] of [
    [p, teamA],
    [child, teamA],
    [o, teamB],
  ])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')",
      [org, team, id],
    );
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Verified family',$4)",
    [org, g, child, admin.userId],
  );
});
beforeEach(async () => {
  await db.query(
    "TRUNCATE calendar_series,calendar_event,calendar_participant,calendar_document,calendar_history,calendar_feed,calendar_place CASCADE",
  );
  await db.query(
    "TRUNCATE notification_dispatch,mail_job,mail_attempt,app_notification",
  );
  await db.query("UPDATE role_assignment SET revoked_at=NULL");
  await db.query("UPDATE organization_membership SET active=true");
  await db.query('UPDATE "user" SET active=true');
  await db.query("UPDATE guardian_relationship SET revoked_at=NULL");
  await db.query("UPDATE club_person SET birth_date='2015-01-01' WHERE id=$1", [
    child,
  ]);
  place = (await run(admin, placeValues)).id as string;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
it("persists a place and event with local times and planned participants", async () => {
  const id = await create();
  const view = await calendarView(db, admin, range);
  expect(view.events[0]).toMatchObject({
    id,
    place_name: "Salle accessible",
    team_name: "Team A",
    local_start: start + "T18:00",
  });
  expect(view.events[0].participants).toHaveLength(2);
  expect(view.places[0]).toMatchObject({
    accessible: true,
    charging: true,
    cost_cents: 2500,
  });
});
it("plans without a second factor (removed) nor email verification", async () => {
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    admin.userId,
  ]);
  expect(await create()).toBeTruthy();
  await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [
    admin.userId,
  ]);
});
it("allows a coach only on their active team and no private participants outside it", async () => {
  await create({ responsibleId: coach.userId }, coach);
  await expect(
    create({ teamId: teamB, responsibleId: coach.userId }, coach),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const p = (
    await db.query("SELECT id FROM club_person WHERE full_name='Player B'")
  ).rows[0].id;
  await expect(
    create(
      {
        responsibleId: coach.userId,
        participants: [p],
        localStart: start + "T12:00",
        localEnd: start + "T13:00",
      },
      coach,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("isolates teams, clubs and participant details for players", async () => {
  await create();
  expect(
    (await calendarView(db, player, range)).events[0].participants,
  ).toHaveLength(1);
  expect((await calendarView(db, other, range)).events).toHaveLength(0);
  expect((await calendarView(db, outsider, range)).events).toHaveLength(0);
  await expect(
    run(admin, { action: "feed", name: "Wrong", teamId: null }, orgB),
  ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});
it("checks room conflicts transactionally under concurrent scheduling", async () => {
  const results = await Promise.allSettled([
    create(),
    create({ title: "Competing booking" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await db.query("SELECT id FROM calendar_event")).rowCount).toBe(1);
});
it("allows adjacent bookings and rejects an overlapping move without losing history", async () => {
  const first = await create();
  await create({ localStart: start + "T20:00", localEnd: start + "T21:00" });
  await expect(
    update(first, { localStart: start + "T19:00", localEnd: start + "T20:30" }),
  ).rejects.toMatchObject({ code: "PLACE_CONFLICT" });
  expect((await row(first)).version).toBe(1);
  expect(
    (
      await db.query("SELECT id FROM calendar_history WHERE event_id=$1", [
        first,
      ])
    ).rowCount,
  ).toBe(1);
});
it("materializes a series, preserves a moved exception and a cancelled vacation", async () => {
  const first = await create({ intervalDays: 7, occurrences: 4 });
  const events = (
    await db.query("SELECT id FROM calendar_event ORDER BY ordinal")
  ).rows;
  await update(events[1].id, {
    localStart: shiftLocal(start + "T10:00", 7),
    localEnd: shiftLocal(start + "T11:00", 7),
  });
  await cancel(events[2].id);
  await update(first, {
    scope: "following",
    localStart: start + "T19:00",
    localEnd: start + "T21:00",
  });
  const rows = (await db.query("SELECT * FROM calendar_event ORDER BY ordinal"))
    .rows;
  expect(rows[0].local_start).toBe(start + "T19:00");
  expect(rows[1].local_start).toBe(shiftLocal(start + "T10:00", 7));
  expect(rows[2].status).toBe("cancelled");
  expect(rows[3].local_start).toBe(shiftLocal(start + "T19:00", 21));
});
it("rolls back an entire recurrent creation if one occurrence conflicts", async () => {
  await create({
    localStart: shiftLocal(start + "T18:00", 7),
    localEnd: shiftLocal(start + "T20:00", 7),
  });
  await expect(
    create({ intervalDays: 7, occurrences: 3 }),
  ).rejects.toMatchObject({ code: "PLACE_CONFLICT" });
  expect((await db.query("SELECT id FROM calendar_series")).rowCount).toBe(1);
});
it("keeps wall times through DST and rejects nonexistent recurring hours", async () => {
  await create({
    localStart: "2027-03-21T10:00",
    localEnd: "2027-03-21T11:00",
    intervalDays: 7,
    occurrences: 2,
  });
  const rows = (
    await db.query("SELECT starts_at FROM calendar_event ORDER BY ordinal")
  ).rows;
  expect(rows[0].starts_at.toISOString()).toBe("2027-03-21T09:00:00.000Z");
  expect(rows[1].starts_at.toISOString()).toBe("2027-03-28T08:00:00.000Z");
  await expect(
    create({
      localStart: "2027-03-21T02:30",
      localEnd: "2027-03-21T03:30",
      intervalDays: 7,
      occurrences: 2,
    }),
  ).rejects.toMatchObject({ code: "NONEXISTENT_TIME" });
});
it("returns the existing event on a repeated create request", async () => {
  const requestId = randomUUID();
  const a = await create({ requestId }),
    b = await create({ requestId });
  expect(b).toBe(a);
  expect((await db.query("SELECT id FROM calendar_event")).rowCount).toBe(1);
});
it("rejects stale edits and preserves the original values in history", async () => {
  const id = await create();
  await update(id, { title: "Updated" });
  await expect(
    run(admin, {
      action: "update",
      id,
      expectedVersion: 1,
      scope: "one",
      ...values(),
    }),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
  const h = (
    await db.query(
      "SELECT before_data,after_data FROM calendar_history WHERE event_id=$1 AND action='updated'",
      [id],
    )
  ).rows[0];
  expect(h.before_data.title).toBe("Entraînement");
  expect(h.after_data.title).toBe("Updated");
});
it("keeps parent views and private feeds bounded by current family authorization", async () => {
  await create();
  const f = await feed(parent);
  expect(await calendarFeed(db, f.token)).toContain("SUMMARY:Entraînement");
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  expect(await calendarFeed(db, f.token)).not.toContain("SUMMARY:Entraînement");
  expect((await calendarView(db, parent, range)).events).toHaveLength(0);
  await db.query("UPDATE guardian_relationship SET revoked_at=NULL");
  await db.query("UPDATE club_person SET birth_date='2000-01-01' WHERE id=$1", [
    child,
  ]);
  expect(await calendarFeed(db, f.token)).not.toContain("SUMMARY:Entraînement");
});
it("hashes feed tokens, revokes them and does not reveal planned people in ICS", async () => {
  await create();
  const f = await feed();
  const stored = (
    await db.query("SELECT token_hash FROM calendar_feed WHERE id=$1", [f.id])
  ).rows[0].token_hash;
  expect(stored).not.toBe(f.token);
  expect(stored).not.toContain(f.token);
  const ics = await calendarFeed(db, f.token);
  expect(ics).toContain("DTSTART:");
  expect(ics).not.toContain("Player A");
  expect(ics).not.toContain("ATTENDEE");
  await run(player, { action: "revokeFeed", id: f.id });
  await expect(calendarFeed(db, f.token)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("invalidates feeds for revoked mandates, expired feeds and inactive accounts", async () => {
  await create();
  const f = await feed();
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1", [
    player.mandateId,
  ]);
  await expect(calendarFeed(db, f.token)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await db.query("UPDATE role_assignment SET revoked_at=NULL WHERE id=$1", [
    player.mandateId,
  ]);
  await db.query(
    "UPDATE calendar_feed SET expires_at=now()-interval '1 day' WHERE id=$1",
    [f.id],
  );
  await expect(calendarFeed(db, f.token)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await db.query(
    "UPDATE calendar_feed SET expires_at=now()+interval '1 year' WHERE id=$1",
    [f.id],
  );
  await db.query('UPDATE "user" SET active=false WHERE id=$1', [player.userId]);
  await expect(calendarFeed(db, f.token)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("exports stable occurrence identities, cancellations and updated sequence values", async () => {
  const id = await create();
  const f = await feed();
  const before = await calendarFeed(db, f.token);
  await cancel(id);
  const after = await calendarFeed(db, f.token);
  expect(before).toContain("UID:" + id + "@pfm");
  expect(after).toContain("UID:" + id + "@pfm");
  expect(after).toContain("STATUS:CANCELLED");
  expect(after).toContain("SEQUENCE:2");
});
it("updates upcoming events when a venue address changes and checks capacity", async () => {
  const id = await create();
  await run(admin, {
    ...placeValues,
    id: place,
    expectedVersion: 1,
    address: "Nouvelle adresse",
  });
  expect((await row(id)).version).toBe(2);
  expect(
    (
      await db.query(
        "SELECT action,before_data,after_data FROM calendar_history WHERE event_id=$1 AND action='venue.updated'",
        [id],
      )
    ).rows[0].before_data.place_address,
  ).toBe("Rue du sport 1");
  await expect(
    run(admin, { ...placeValues, id: place, expectedVersion: 2, capacity: 1 }),
  ).rejects.toMatchObject({ code: "CAPACITY_REACHED" });
});
it("cancels a pending calendar email after a family link is revoked", async () => {
  const id = await create();
  const job = (
    await db.query(
      "SELECT id FROM mail_job WHERE resource_id=$1 AND recipient_user_id=$2",
      [id, parent.userId],
    )
  ).rows[0].id;
  await db.query("UPDATE mail_job SET state='cancelled' WHERE id<>$1", [job]);
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  expect(
    await processOne(db, {
      mode: "local",
      async send() {
        throw new Error("Must not send");
      },
    }),
  ).toMatchObject({ id: job, state: "cancelled" });
});
it("refuses a recurrent event that crosses its team season boundary", async () => {
  const limited = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Short season',$2,$3) RETURNING id",
      [org, start, shiftLocal(start + "T12:00", 8).slice(0, 10)],
    )
  ).rows[0].id;
  const team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Short team') RETURNING id",
      [org, limited],
    )
  ).rows[0].id;
  await expect(
    create({ teamId: team, intervalDays: 7, occurrences: 3 }),
  ).rejects.toMatchObject({ code: "SEASON_RANGE" });
  expect((await db.query("SELECT id FROM calendar_event")).rowCount).toBe(0);
});
it("does not grant document access through an event or remove an unseen protected association", async () => {
  const profile = (
    await db.query("SELECT id FROM club_person WHERE full_name='Player A'")
  ).rows[0].id;
  const doc = (
    await db.query(
      "INSERT INTO club_document(organization_id,profile_id,season_id,name,category,sensitive) VALUES($1,$2,$3,'Private fitness','fitness',true) RETURNING id",
      [org, profile, season],
    )
  ).rows[0].id;
  // A president has the habilitation from the start (21/10/2026); once removed, the event gives no way around it.
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY[]::text[] WHERE id=$1",
    [admin.mandateId],
  );
  await expect(create({ documents: [doc] })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY['documents.sensitive'] WHERE id=$1",
    [admin.mandateId],
  );
  const id = await create({ documents: [doc] });
  expect(
    (await calendarView(db, admin, range)).events[0].documents,
  ).toHaveLength(1);
  // Player A sees their own document; no second factor is asked any more (removed 21/10/2026).
  expect(
    (await calendarView(db, player, range)).events[0].documents,
  ).toHaveLength(1);
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY[]::text[] WHERE id=$1",
    [admin.mandateId],
  );
  await update(id, { title: "New time", documents: [] });
  expect(
    (
      await db.query(
        "SELECT document_id FROM calendar_document WHERE event_id=$1",
        [id],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (await calendarView(db, admin, range)).events[0].documents,
  ).toHaveLength(0);
});
it("requires an individual traced correction rather than rewriting a past series", async () => {
  const past = shiftLocal(localAt(new Date(), "Europe/Brussels"), -14).slice(
    0,
    10,
  );
  const id = await create({
    localStart: past + "T10:00",
    localEnd: past + "T11:00",
    intervalDays: 7,
    occurrences: 4,
  });
  await expect(
    update(id, {
      scope: "all",
      localStart: past + "T12:00",
      localEnd: past + "T13:00",
    }),
  ).rejects.toMatchObject({ code: "PAST_SERIES" });
  await update(id, {
    scope: "one",
    localStart: past + "T12:00",
    localEnd: past + "T13:00",
  });
  expect((await row(id)).is_exception).toBe(true);
  expect(
    (
      await db.query(
        "SELECT id FROM calendar_history WHERE event_id=$1 AND action='updated'",
        [id],
      )
    ).rowCount,
  ).toBe(1);
});

it("shares only public venue details and keeps free locations out of the directory and in ICS", async () => {
  // Wave 17 (C4): a hall reaches the directory once the federation validates it; a club outside it does not see it.
  const v = (
    await db.query(
      "INSERT INTO shared_venue(name,address,created_by,organization_id) VALUES('Shared arena','Public street 2',$1,$2) RETURNING id",
      [admin.userId, org],
    )
  ).rows[0] as { id: string };
  expect(
    (await calendarView(db, admin, range)).sharedVenues.some(
      (x) => x.id === v.id,
    ),
  ).toBe(true);
  expect(
    (await calendarView(db, outsider, range)).sharedVenues.some(
      (x) => x.id === v.id,
    ),
  ).toBe(false);
  const id = await create({ placeId: null, sharedVenueId: v.id });
  expect(
    (await calendarView(db, admin, range)).events.find((e) => e.id === id)
      ?.place_name,
  ).toBe("Shared arena");
  await update(id, {
    placeId: null,
    sharedVenueId: null,
    freeLocation: "Meeting point near stadium",
  });
  expect(
    (await calendarView(db, admin, range)).events.find((e) => e.id === id)
      ?.place_name,
  ).toBe("Meeting point near stadium");
  expect(
    (await calendarView(db, admin, range)).sharedVenues.some(
      (x) => x.name === "Meeting point near stadium",
    ),
  ).toBe(false);
  expect(await calendarFeed(db, (await feed()).token)).toContain(
    "LOCATION:Meeting point near stadium",
  );
  await expect(
    update(id, { freeLocation: "Street", placeId: place }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("lists events outside the selected date range when all is requested", async () => {
  const past = shiftLocal(start + "T12:00", -100).slice(0, 10);
  const id = await create({
    localStart: past + "T10:00",
    localEnd: past + "T11:00",
  });
  expect(
    (await calendarView(db, admin, range)).events.some((e) => e.id === id),
  ).toBe(false);
  expect(
    (await calendarView(db, admin, { ...range, all: "true" })).events.some(
      (e) => e.id === id,
    ),
  ).toBe(true);
});
it("exposes separate coach/player attendance without leaking another family's responses", async () => {
  const id = await create();
  const coachProfile = await profile("Invited coach", coach);
  await db.query(
    "UPDATE club_person SET directory_roles=ARRAY['coach'] WHERE id=$1",
    [coachProfile],
  );
  const reg = (
    await db.query(
      "INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '1 day') RETURNING id",
      [org, id],
    )
  ).rows[0].id;
  for (const p of [coachProfile, child])
    await db.query(
      "INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,'present','unchecked')",
      [org, reg, p],
    );
  const staff = (await calendarView(db, admin, range)).events[0].attendance;
  expect(staff.map((x) => x.role).sort()).toEqual(["coach", "player"]);
  const family = (await calendarView(db, parent, range)).events[0].attendance;
  expect(family.map((x) => x.id)).toEqual([child]);
});

it("keeps messages private to participants, checks recipients and revocations, and deduplicates retries", async () => {
  const { messagesView, messagesExecute, messageCommand } =
    await import("../../src/domains/messages/service");
  const cmd = messageCommand.parse({
    action: "create",
    requestId: randomUUID(),
    subject: "Training discussion",
    body: "Meet at 18:00",
    recipients: [player.userId],
  });
  // The player profile is a minor without a representative account: refused
  // (protection of minors, wave 9). As an adult the conversation is private.
  await expect(messagesExecute(db, admin, cmd, org)).rejects.toMatchObject({
    code: "MINOR_NEEDS_GUARDIAN",
  });
  const playerProfile = (
    await db.query(
      "SELECT c.id FROM club_person c JOIN person p ON p.id=c.person_id WHERE p.user_id=$1",
      [player.userId],
    )
  ).rows[0].id;
  await db.query("UPDATE club_person SET birth_date='2000-01-01' WHERE id=$1", [
    playerProfile,
  ]);
  const result = await messagesExecute(db, admin, cmd, org);
  expect(await messagesExecute(db, admin, cmd, org)).toEqual(result);
  expect((await messagesView(db, player, result.id)).messages).toHaveLength(1);
  await expect(messagesView(db, other, result.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(messagesView(db, outsider, result.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    messagesExecute(
      db,
      admin,
      messageCommand.parse({
        ...cmd,
        requestId: randomUUID(),
        recipients: [outsider.userId],
      }),
      org,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    messagesExecute(
      db,
      player,
      messageCommand.parse({
        ...cmd,
        requestId: randomUUID(),
        recipients: [other.userId],
      }),
      org,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await messagesExecute(
    db,
    player,
    messageCommand.parse({
      action: "reply",
      requestId: randomUUID(),
      threadId: result.id,
      body: "Confirmed",
    }),
    org,
  );
  expect((await messagesView(db, admin, result.id)).messages).toHaveLength(2);
  await db.query(
    "UPDATE organization_membership SET active=false WHERE user_id=$1",
    [player.userId],
  );
  await expect(messagesView(db, player, result.id)).rejects.toBeInstanceOf(
    Error,
  );
  await db.query("UPDATE club_person SET birth_date='2015-01-01' WHERE id=$1", [
    playerProfile,
  ]);
});

it("C9: follows one team or only my events, renews a link and keeps another club out", async () => {
  await create({ title: "Séance A", visibility: "organization", placeId: null });
  await create({ title: "Séance B", teamId: teamB, visibility: "organization", placeId: null });
  await create({ title: "Assemblée", teamId: null, visibility: "organization", placeId: null });
  const team = await run(admin, { action: "feed", name: "Team B", teamId: teamB });
  const teamIcs = await calendarFeed(db, team.url!.split("/").pop()!);
  expect(teamIcs).toContain("SUMMARY:Séance B");
  expect(teamIcs).not.toContain("SUMMARY:Séance A");
  const mine = await run(player, { action: "feed", name: "Mes événements", teamId: null, mine: true });
  const mineIcs = await calendarFeed(db, mine.url!.split("/").pop()!);
  expect(mineIcs).toContain("SUMMARY:Séance A");
  expect(mineIcs).not.toContain("SUMMARY:Séance B");
  expect(mineIcs).not.toContain("SUMMARY:Assemblée");
  // The whole club for the same person shows all three.
  const all = await calendarFeed(db, (await feed()).token);
  for (const t of ["Séance A", "Séance B", "Assemblée"]) expect(all).toContain("SUMMARY:" + t);
  // Renewing: a new secret, the same choice, the old link dead.
  await expect(run(outsider, { action: "renewFeed", id: mine.id }, orgB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const renewed = await run(player, { action: "renewFeed", id: mine.id });
  await expect(calendarFeed(db, mine.url!.split("/").pop()!)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const again = await calendarFeed(db, renewed.url!.split("/").pop()!);
  expect(again).toContain("SUMMARY:Séance A");
  expect(again).not.toContain("SUMMARY:Assemblée");
  const view = await calendarView(db, player, range);
  expect(view.feeds.filter((f: { revoked_at: string | null }) => !f.revoked_at).map((f: { name: string; only_mine: boolean }) => [f.name, f.only_mine]).sort()).toEqual([
    ["Mes événements", true],
    ["Mon planning", false],
  ]);
});

it("C9: offers players and parents to subscribe until they have a link", async () => {
  expect((await dashboardView(db, player)).start).toEqual({ calendarSubscribed: false });
  expect((await dashboardView(db, admin)).start).toBeUndefined();
  const f = await feed();
  expect((await dashboardView(db, player)).start).toEqual({ calendarSubscribed: true });
  await run(player, { action: "revokeFeed", id: f.id });
  expect((await dashboardView(db, player)).start).toEqual({ calendarSubscribed: false });
});
