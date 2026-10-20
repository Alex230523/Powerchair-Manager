import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execute, type Principal } from "../../src/domains/access/service";
import { publish } from "../../src/domains/notifications/queue";
import { processOne } from "../../src/domains/notifications/worker";
import { createTransport } from "../../src/domains/notifications/transport";
import {
  communicationExecute,
  communicationView,
  eventMailTick,
  unsubscribeExecute,
  unsubscribeInfo,
} from "../../src/domains/communication/service";
import { emailHash } from "../../src/domains/communication/hash";
import { messagesExecute, messagesView } from "../../src/domains/messages/service";
import { equipmentExecute, equipmentView } from "../../src/domains/equipment/service";
import { calendarCopyWeek, calendarExecute } from "../../src/domains/calendar/service";
import { peopleExportGrid, filterSchema } from "../../src/domains/people/service";

const schema = "wave9_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  season: string,
  team: string,
  president: Principal,
  coach: Principal,
  treasurer: Principal,
  parent: Principal,
  adult: Principal,
  teen: Principal,
  lucas: string,
  adultProfile: string,
  teenProfile: string,
  alumni: string,
  mailDir: string;

async function actor(role: string, name: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, name, userId + "@example.test"],
  );
  const person = (
    await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])
  ).rows[0].id as string;
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [club, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
      [club, userId, role, grants],
    )
  ).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person, email: userId + "@example.test" };
}
async function profile(name: string, birth: string | null, person?: string, email?: string) {
  const id =
    person ??
    ((await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id as string);
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,directory_roles) VALUES($1,$2,$3,$4,$5,'{player}') RETURNING id",
      [club, id, name, birth, email ?? null],
    )
  ).rows[0].id as string;
}
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const transport = () =>
  createTransport({ MAIL_TRANSPORT: "local", PFM_MAIL_DIR: mailDir });
async function drain() {
  const states: string[] = [];
  for (;;) {
    const r = await processOne(db, transport());
    if (!r) return states;
    states.push(r.state);
  }
}
async function mails() {
  const out = [];
  for (const f of await readdir(mailDir))
    if (f.endsWith(".json")) out.push(JSON.parse(await readFile(mailDir + "/" + f, "utf8")));
  return out as { email: string; subject: string; text: string; html: string; fromName?: string; replyTo?: string }[];
}
const event = (title: string, day: string, extra: Record<string, unknown> = {}) => ({
  action: "create" as const,
  title,
  kind: "training" as const,
  customType: "",
  timezone: "Europe/Brussels",
  localStart: `${day}T18:00`,
  localEnd: `${day}T19:30`,
  fold: "reject" as const,
  teamId: team,
  placeId: null,
  freeLocation: "Salle du club",
  responsibleId: president.userId,
  visibility: "team" as const,
  equipment: "",
  instructions: "",
  participants: [],
  documents: [],
  intervalDays: 0 as const,
  occurrences: 1,
  requestId: randomUUID(),
  ...extra,
});

beforeAll(async () => {
  mailDir = await mkdtemp(tmpdir() + "/pfm-wave9-");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query(
      "INSERT INTO organization(name,kind,contact_email) VALUES('Club vague 9','club','secretariat@club.test') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-100,CURRENT_DATE+300) RETURNING id",
      [club],
    )
  ).rows[0].id;
  team = (
    await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id", [
      club,
      season,
    ])
  ).rows[0].id;
  president = (await actor("club_president", "Présidente")).p;
  const c = await actor("coach", "Coach Marc");
  coach = c.p;
  treasurer = (await actor("player", "Trésorier", ["dues.manage"])).p;
  const par = await actor("guardian", "Nadia Parent");
  parent = par.p;
  const ad = await actor("player", "Adulte Joueur");
  adult = ad.p;
  const tn = await actor("player", "Ado Joueur");
  teen = tn.p;
  lucas = await profile("Lucas Peeters", "2014-04-30");
  adultProfile = await profile("Adulte Joueur", "1995-01-01", ad.person);
  teenProfile = await profile("Ado Joueur", "2011-06-01", tn.person);
  const coachProfile = await profile("Coach Marc", "1980-01-01", c.person);
  const nadia = await profile("Nadia Parent", "1985-01-01", par.person);
  alumni = await profile("Ancien Joueur", "1990-01-01", undefined, "ancien@example.test");
  await db.query("UPDATE club_person SET status='archived',former_roles='{player}' WHERE id=$1", [alumni]);
  for (const kid of [lucas, teenProfile])
    await db.query(
      "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
      [club, nadia, kid, president.userId],
    );
  for (const [p, role] of [
    [lucas, "player"],
    [adultProfile, "player"],
    [teenProfile, "player"],
    [coachProfile, "coach"],
  ])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,$4,CURRENT_DATE-50)",
      [club, team, p, role],
    );
});
beforeEach(() => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("delivers reminders and federation mails that the worker used to cancel, with the club as sender", async () => {
  await communicationExecute(
    db,
    president,
    { action: "sender", senderName: "Tigers Powerchair", replyTo: "contact@tigers.test" },
    club,
  );
  const parentEmail = (await db.query('SELECT email FROM "user" WHERE id=$1', [parent.userId])).rows[0].email;
  await publish(db, {
    organizationId: club,
    userId: parent.userId,
    email: parentEmail,
    kind: "dues_reminder",
    category: "administrative",
    resourceType: "dues",
    resourceId: lucas,
    eventKey: "test:dues",
    locale: "fr",
    variables: { name: "Nadia", organization: "Club", url: "http://127.0.0.1:3000/fr/dues", person: "Lucas" },
  });
  // An address on file (no account) receives the reminder of that person only.
  await db.query("UPDATE club_person SET email='famille@example.test' WHERE id=$1", [lucas]);
  await publish(db, {
    organizationId: club,
    userId: null,
    email: "famille@example.test",
    kind: "document_reminder",
    category: "administrative",
    resourceType: "document",
    resourceId: lucas,
    eventKey: "test:docs",
    locale: "fr",
    variables: { name: "Famille", organization: "Club", url: "http://127.0.0.1:3000/fr/documents", person: "Lucas" },
  });
  await publish(db, {
    organizationId: club,
    userId: president.userId,
    email: president.userId + "@example.test",
    kind: "training_update",
    category: "administrative",
    resourceType: "training",
    resourceId: randomUUID(),
    eventKey: "test:training",
    locale: "fr",
    variables: { name: "P", organization: "Club", url: "http://127.0.0.1:3000/fr/coaches" },
  });
  // Not the parent of the adult player: refused.
  await publish(db, {
    organizationId: club,
    userId: parent.userId,
    email: parentEmail,
    kind: "dues_reminder",
    category: "administrative",
    resourceType: "dues",
    resourceId: adultProfile,
    eventKey: "test:dues-other",
    locale: "fr",
    variables: { name: "Nadia", organization: "Club", url: "http://127.0.0.1:3000/fr/dues", person: "X" },
  });
  expect((await drain()).sort()).toEqual(["cancelled", "local", "local", "local"]);
  const sent = await mails();
  expect(sent.find((m) => m.email === parentEmail)).toMatchObject({
    fromName: "Tigers Powerchair",
    replyTo: "contact@tigers.test",
  });
});

it("resolves saved groups, writes to the parents of minors and honours unsubscribes", async () => {
  const { id: group } = await communicationExecute(
    db,
    president,
    { action: "group", name: "Équipe A joueurs", audiences: ["players"], teamIds: [team], profileIds: [], archived: false },
    club,
  );
  const { id: training } = await calendarExecute(
    db,
    president,
    event("Entraînement ouvert", inDays(6), { visibility: "organization", teamId: null }),
    club,
  );
  const blocks = [
    { type: "heading" as const, text: "Nouvelles <du> club" },
    { type: "text" as const, text: "Bonjour à tous,\nla saison démarre." },
    { type: "events" as const, eventIds: [training] },
    { type: "button" as const, label: "Notre site", url: "https://tigers.test" },
  ];
  const { id: news } = await communicationExecute(
    db,
    president,
    { action: "newsletter", subject: "Nouvelles d'octobre", blocks, groupIds: [group], includeAlumni: true },
    club,
  );
  // Coaches cannot write newsletters.
  await expect(
    communicationExecute(db, coach, { action: "deleteNewsletter", id: news }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const view = await communicationView(db, president);
  expect(view.groups.find((g) => g.id === group)?.size).toBe(3);
  expect(view.alumni).toMatchObject([{ full_name: "Ancien Joueur", reachable: true, unsubscribed: false }]);
  await db.query("TRUNCATE notification_dispatch,mail_job,mail_attempt,app_notification");
  const sent = await communicationExecute(db, president, { action: "sendNewsletter", id: news, expectedVersion: 1 }, club);
  // Lucas (minor) → Nadia; the teen (minor) → Nadia too, once; adult → own; alumni → file address.
  expect(sent).toMatchObject({ recipients: 3 });
  expect((await drain()).every((s) => s === "local")).toBe(true);
  const letters = (await mails()).filter((m) => m.subject === "Nouvelles d'octobre");
  expect(letters).toHaveLength(3);
  const html = letters[0].html;
  expect(html).toContain("Nouvelles &lt;du&gt; club");
  expect(html).toContain("Entraînement ouvert");
  expect(html).toContain('href="https://tigers.test"');
  expect(html).toContain("/fr/desinscription/");
  // The alumni unsubscribes through their link.
  const delivery = (
    await db.query("SELECT id FROM newsletter_delivery WHERE email_hash=$1", [emailHash("ancien@example.test")])
  ).rows[0].id;
  expect(await unsubscribeInfo(db, delivery)).toEqual({ club: "Club vague 9", unsubscribed: false });
  await unsubscribeExecute(db, delivery, true);
  expect((await communicationView(db, president)).alumni[0].unsubscribed).toBe(true);
  // The club cannot lift a stop asked by the person.
  await communicationExecute(db, president, { action: "resubscribe", profileId: alumni }, club);
  expect((await communicationView(db, president)).alumni[0].unsubscribed).toBe(true);
  const { id: second } = await communicationExecute(
    db,
    president,
    { action: "newsletter", subject: "Deuxième", blocks: [{ type: "text", text: "Encore" }], groupIds: [], includeAlumni: true },
    club,
  );
  await expect(
    communicationExecute(db, president, { action: "sendNewsletter", id: second, expectedVersion: 1 }, club),
  ).rejects.toMatchObject({ code: "NO_RECIPIENT" });
  await expect(
    communicationExecute(db, president, { action: "sendNewsletter", id: news, expectedVersion: 2 }, club),
  ).rejects.toMatchObject({ code: "ALREADY_SENT" });
});

it("holds an event mail when the event moves, sends it after a new reading", async () => {
  const day = inDays(9);
  const { id: ev } = await calendarExecute(db, president, event("Match amical", day, { participants: [] }), club);
  const { id: mail } = await communicationExecute(
    db,
    coach,
    {
      action: "eventMail",
      eventId: ev,
      groupId: null,
      subject: "Rappel : {event}",
      body: "Bonjour {name},\nrendez-vous le {date} à {place}.",
      sendAt: new Date(Date.now() - 60000).toISOString(),
    },
    club,
  );
  const version = (await db.query("SELECT version FROM calendar_event WHERE id=$1", [ev])).rows[0].version;
  await calendarExecute(
    db,
    president,
    {
      ...event("Match amical", day),
      action: "update",
      id: ev,
      expectedVersion: version,
      scope: "one",
      localStart: `${day}T14:00`,
      localEnd: `${day}T16:00`,
    } as never,
    club,
  );
  expect((await communicationView(db, coach)).eventMails.find((m) => m.id === mail)).toMatchObject({
    state: "review",
    prepared: { local_start: `${day}T18:00` },
    event: { local_start: `${day}T14:00` },
  });
  expect(await eventMailTick(db)).toBe(0);
  await expect(communicationExecute(db, coach, { action: "sendEventMail", id: mail }, club)).rejects.toMatchObject({
    code: "EVENT_CHANGED",
  });
  await communicationExecute(db, coach, { action: "reviewEventMail", id: mail }, club);
  await db.query("TRUNCATE notification_dispatch,mail_job,mail_attempt,app_notification");
  expect(await eventMailTick(db)).toBe(1);
  expect((await db.query("SELECT status,recipients FROM event_mail WHERE id=$1", [mail])).rows[0]).toMatchObject({
    status: "sent",
    recipients: 3,
  });
  expect((await drain()).every((s) => s === "local")).toBe(true);
  const sent = (await mails()).filter((m) => m.subject === "Rappel : Match amical");
  expect(sent).toHaveLength(3);
  expect(sent[0].text).toContain("Salle du club");
});

it("keeps minors out of private one-to-one talks and team threads, and lets moderators act on reports", async () => {
  const thread = await messagesExecute(
    db,
    coach,
    { action: "create", requestId: randomUUID(), subject: "Ton fauteuil", body: "On en parle ?", recipients: [teen.userId] },
    club,
  );
  const people = (await messagesView(db, coach, thread.id)).participants;
  expect(people).toContainEqual({ name: "Nadia Parent", reason: "guardian" });
  expect((await messagesView(db, parent, thread.id)).messages).toHaveLength(1);
  // Team threads: opened by the coach; adult players and parents read them, the teen does not.
  const { id: teamThread } = await messagesExecute(db, coach, { action: "openTeam", teamId: team, kind: "team" }, club);
  const { id: parentsThread } = await messagesExecute(db, coach, { action: "openTeam", teamId: team, kind: "parents" }, club);
  await expect(messagesExecute(db, adult, { action: "openTeam", teamId: team, kind: "team" }, club)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect((await messagesView(db, adult)).threads.map((t) => t.id)).toContain(teamThread);
  expect((await messagesView(db, adult)).threads.map((t) => t.id)).not.toContain(parentsThread);
  expect((await messagesView(db, parent)).threads.map((t) => t.id)).toEqual(
    expect.arrayContaining([teamThread, parentsThread]),
  );
  await expect(messagesView(db, teen, teamThread)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const { id: posted } = await messagesExecute(
    db,
    adult,
    { action: "reply", requestId: randomUUID(), threadId: teamThread, body: "Message déplacé" },
    club,
  );
  expect(posted).toBe(teamThread);
  const message = (await messagesView(db, parent, teamThread)).messages[0];
  await messagesExecute(db, parent, { action: "report", messageId: message.id, reason: "inappropriate", comment: "Pas ici" }, club);
  await expect(
    messagesExecute(db, parent, { action: "moderate", messageId: message.id, outcome: "hidden" }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await messagesView(db, president)).reports).toHaveLength(1);
  await messagesExecute(db, president, { action: "moderate", messageId: message.id, outcome: "hidden" }, club);
  expect((await messagesView(db, parent, teamThread)).messages[0]).toMatchObject({ body: "", hidden: true });
  expect((await messagesView(db, president, teamThread)).messages[0]).toMatchObject({ body: "Message déplacé", hidden: true });
  expect((await messagesView(db, president)).reports).toHaveLength(0);
  await messagesExecute(db, president, { action: "lock", threadId: teamThread, locked: true }, club);
  await expect(
    messagesExecute(db, adult, { action: "reply", requestId: randomUUID(), threadId: teamThread, body: "Encore" }, club),
  ).rejects.toMatchObject({ code: "THREAD_LOCKED" });
});

it("lets coaches propose purchases that the treasurer validates, and tracks storage and expiry", async () => {
  const { id: wish } = await equipmentExecute(
    db,
    coach,
    { action: "wish", title: "Ballons de powerchair", reason: "Deux sont crevés", quantity: 2, estimatedCents: 9000, link: "" },
    club,
  );
  await expect(
    equipmentExecute(db, coach, { action: "decideWish", id: wish, expectedVersion: 1, decision: "approved", note: "" }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await equipmentExecute(
    db,
    treasurer,
    { action: "decideWish", id: wish, expectedVersion: 1, decision: "approved", note: "Budget matériel" },
    club,
  );
  await equipmentExecute(db, president, { action: "boughtWish", id: wish, expectedVersion: 2, boughtOn: inDays(0) }, club);
  await equipmentExecute(
    db,
    president,
    { action: "item", name: "Trousse de secours", category: "first_aid", quantity: 1, storage: "Armoire du club", expiresOn: inDays(10), notes: "", archived: false },
    club,
  );
  const view = await equipmentView(db, coach);
  expect(view.wishes[0]).toMatchObject({ status: "bought", decided_by: "Trésorier", mine: true });
  expect(view.items[0]).toMatchObject({ storage: "Armoire du club", expiry: "soon" });
  expect(view.storages).toEqual(["Armoire du club"]);
  await expect(
    equipmentExecute(
      db,
      coach,
      { action: "item", name: "Chargeur", category: "charger", quantity: 1, storage: "", expiresOn: null, notes: "", archived: false },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("copies a week of the calendar, skips what cannot be copied, and is idempotent", async () => {
  const monday = (offsetWeeks: number) => {
    const d = new Date();
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 7 * offsetWeeks);
    return d.toISOString().slice(0, 10);
  };
  const shift = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const from = monday(3),
    to = monday(4);
  const place = (
    await db.query("INSERT INTO calendar_place(organization_id,name) VALUES($1,'Salle B') RETURNING id", [club])
  ).rows[0].id;
  await calendarExecute(db, president, event("Mardi", shift(from, 1), { placeId: place, freeLocation: undefined }), club);
  await calendarExecute(db, president, event("Jeudi", shift(from, 3)), club);
  // The target Tuesday's place is already taken.
  await calendarExecute(db, president, event("Occupé", shift(to, 1), { placeId: place, freeLocation: undefined }), club);
  const requestId = randomUUID();
  const result = await calendarCopyWeek(db, president, { action: "copyWeek", fromMonday: from, toMonday: to, teamId: null, requestId }, club);
  expect(result).toMatchObject({ created: 1, skipped: [{ title: "Mardi", reason: "PLACE_CONFLICT" }] });
  expect(
    await calendarCopyWeek(db, president, { action: "copyWeek", fromMonday: from, toMonday: to, teamId: null, requestId }, club),
  ).toEqual({ created: 1, skipped: [] });
  expect(
    (await db.query("SELECT local_start FROM calendar_event WHERE copied_from IS NOT NULL", [])).rows.map((r) => r.local_start),
  ).toEqual([`${shift(to, 3)}T18:00`]);
  await expect(
    calendarCopyWeek(db, president, { action: "copyWeek", fromMonday: shift(from, 1), toMonday: to, teamId: null, requestId: randomUUID() }, club),
  ).rejects.toMatchObject({ code: "INVALID_DATE" });
});

it("exports only the chosen columns, in the club's language", async () => {
  const { grid } = await peopleExportGrid(
    db,
    president,
    filterSchema.parse({ q: "Lucas" }),
    club,
    ["name", "age", "teams", "roles"],
    "fr",
  );
  expect(grid[0]).toEqual(["Nom", "Âge", "Équipes", "Fonctions"]);
  expect(grid[1][0]).toBe("Lucas Peeters");
  expect(grid[1][2]).toBe("Équipe A");
  expect(grid[1][3]).toBe("joueur");
  expect(grid).toHaveLength(2);
});
