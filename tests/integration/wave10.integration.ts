import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, workspace, type Principal } from "../../src/domains/access/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { fundraisingExecute, fundraisingView } from "../../src/domains/fundraising/service";
import { calendarExecute } from "../../src/domains/calendar/service";
import { attendanceExecute, attendanceView } from "../../src/domains/attendance/service";
import { governanceExecute, governanceView } from "../../src/domains/club/governance";
import { dashboardView } from "../../src/domains/dashboard/service";
import { publicForm, registrationExecute } from "../../src/domains/registrations/service";
import { platformTemplate } from "../../src/domains/registrations/templates";
import { brusselsDay } from "../../src/lib/today";

const schema = "wave10_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  season: string,
  president: Principal,
  coach: Principal,
  coachProfile: string,
  parent: Principal,
  player: Principal,
  emma: string,
  lucas: string,
  sam: string,
  team: string;

async function actor(role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, "Test " + role, userId + "@example.test"],
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
  return { p, person };
}
async function profile(name: string, birth: string | null, roles: string, person?: string) {
  const pid = person ?? (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [club, pid, name, birth, roles],
    )
  ).rows[0].id as string;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const inDays = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

async function session(offset: number, title: string, kind: "training" | "friendly", profiles: string[]) {
  await calendarExecute(
    db,
    president,
    {
      action: "create",
      title,
      kind,
      customType: "",
      timezone: "Europe/Brussels",
      localStart: `${inDays(offset)}T18:00`,
      localEnd: `${inDays(offset)}T19:30`,
      fold: "reject",
      teamId: team,
      placeId: null,
      freeLocation: "Salle",
      responsibleId: president.userId,
      visibility: "organization",
      equipment: "",
      instructions: "",
      participants: profiles,
      documents: [],
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
    },
    club,
  );
  const eventId = (await db.query("SELECT id FROM calendar_event WHERE title=$1", [title])).rows[0].id as string;
  await attendanceExecute(
    db,
    president,
    { action: "invite", eventId, expectedVersion: null, profiles, deadline: `${inDays(offset)}T12:00:00Z`, minimum: 0 },
    club,
  );
  return eventId;
}
async function answer(eventId: string, profileId: string, response: "present" | "absent") {
  await db.query(
    "UPDATE attendance_invitation i SET response=$3 FROM attendance_register r WHERE r.id=i.register_id AND r.event_id=$1 AND i.profile_id=$2",
    [eventId, profileId, response],
  );
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query("INSERT INTO organization(name,kind) VALUES('Club vague 10','club') RETURNING id")
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison 2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id",
      [club],
    )
  ).rows[0].id;
  president = (await actor("club_president")).p;
  const c = await actor("coach", ["calendar.read", "attendance.manage"]);
  coach = c.p;
  coachProfile = await profile("Coach Karim", null, "{coach}", c.person);
  const par = await actor("guardian");
  parent = par.p;
  const pl = await actor("player");
  player = pl.p;
  emma = await profile("Emma Peeters", "2010-12-03", "{player}");
  lucas = await profile("Lucas Peeters", "2013-04-30", "{player}");
  sam = await profile("Sam Janssens", "1998-06-01", "{player}", pl.person);
  const nadia = await profile("Nadia Peeters", null, "{}", par.person);
  for (const kid of [emma, lucas])
    await db.query(
      "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
      [club, nadia, kid, president.userId],
    );
  team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id",
      [club, season],
    )
  ).rows[0].id;
  for (const kid of [emma, lucas, sam])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-60)",
      [club, team, kid],
    );
  await db.query(
    "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-60)",
    [club, team, coachProfile],
  );
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

it("colours each coming session by who answered present, with the club's own thresholds", async () => {
  const training = await session(3, "Entraînement J+3", "training", [emma, lucas, sam, coachProfile]);
  const match = await session(6, "Match J+6", "friendly", [emma, lucas, sam, coachProfile]);
  for (const p of [emma, lucas, sam]) await answer(training, p, "present");
  await answer(training, coachProfile, "present");
  await answer(match, emma, "present");
  await answer(match, coachProfile, "present");
  const before = await dashboardView(db, president);
  const row = (id: string) => before.agenda.find((e) => e.id === id)!.readiness!;
  // Defaults: players green from 5, yellow at 4; coaches green from 2, yellow at 1.
  expect(row(training)).toMatchObject({ players: 3, coaches: 1, playersTone: "low", coachesTone: "warn", tone: "low" });
  expect(row(match)).toMatchObject({ players: 1, coaches: 1, tone: "low" });
  // The president lowers the bar for trainings: 3 players are enough, 1 coach too.
  await governanceExecute(
    db,
    president,
    {
      action: "presence",
      rules: {
        training: { players: { ok: 3, warn: 2 }, coaches: { ok: 1, warn: 1 } },
        match: { players: { ok: 4, warn: 2 }, coaches: { ok: 2, warn: 1 } },
      },
    },
    club,
  );
  const gov = await governanceView(db, president);
  expect(gov.presence.training.players).toEqual({ ok: 3, warn: 2 });
  const after = await dashboardView(db, president);
  const again = (id: string) => after.agenda.find((e) => e.id === id)!.readiness!;
  expect(again(training)).toMatchObject({ playersTone: "ok", coachesTone: "ok", tone: "ok" });
  expect(again(match)).toMatchObject({ playersTone: "low", coachesTone: "warn", tone: "low" });
  // The parent sees the same readiness on the events of her children.
  const asParent = await dashboardView(db, parent);
  expect(asParent.agenda.find((e) => e.id === training)?.readiness?.tone).toBe("ok");
  // A coach without the right cannot change the thresholds.
  await expect(
    governanceExecute(db, coach, { action: "presence", rules: gov.presence }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("lists administrative deadlines with the events: dues installments and fundraising", async () => {
  const { id: plan } = await duesExecute(
    db,
    president,
    { action: "plan", seasonId: season, category: "Cotisation", amountCents: 25000, maxInstallments: 4, firstDue: inDays(20) },
    club,
  );
  await duesExecute(
    db,
    president,
    { action: "issue", planId: plan, profileId: emma, discountCents: 0, reason: "", installments: 2, firstDue: inDays(20) },
    club,
  );
  const { id: group } = await fundraisingExecute(
    db,
    president,
    { action: "group", name: "Comité", description: "", archived: false },
    club,
  );
  const { id: pot } = await fundraisingExecute(
    db,
    president,
    { action: "pot", groupId: group, name: "Tournoi de Pâques", description: "", goalCents: 200000, deadline: inDays(40), status: "open", playersJoin: true },
    club,
  );
  const dash = await dashboardView(db, president);
  const dues = dash.deadlines.find((d) => d.kind === "dues");
  expect(dues).toMatchObject({ date: inDays(20), count: 1, cents: 12500, href: "/dues" });
  expect(dash.deadlines.find((d) => d.kind === "fundraising")).toMatchObject({ title: "Tournoi de Pâques", date: inDays(40) });
  // The family sees its own installment; the player of another family does not.
  const family = await dashboardView(db, parent);
  expect(family.deadlines.find((d) => d.kind === "dues")).toMatchObject({ count: 1, cents: 12500 });
  const other = await dashboardView(db, player);
  expect(other.deadlines.find((d) => d.kind === "dues")).toBeUndefined();
  // A pot open to the players is a deadline for everyone.
  expect(other.deadlines.find((d) => d.kind === "fundraising")?.title).toBe("Tournoi de Pâques");
  expect((await workspace(db, player)).fundraisingOpen).toBe(true);
  void pot;
});

it("ticks a payment from the dues table and refuses to overpay", async () => {
  const view = await duesView(db, president);
  const debt = view.debts.find((d) => d.profile_id === emma)!;
  expect(debt.state).toBe("on_track");
  expect(debt.settled.map((i: { left_cents: number }) => i.left_cents)).toEqual([12500, 12500]);
  await duesExecute(
    db,
    president,
    { action: "pay", id: debt.id, amountCents: 12500, method: "transfer", occurredOn: today(), reference: "BE41 virement" },
    club,
  );
  const paid = (await duesView(db, president)).debts.find((d) => d.id === debt.id)!;
  expect(paid.paid_cents).toBe(12500);
  expect(paid.settled.map((i: { left_cents: number }) => i.left_cents)).toEqual([0, 12500]);
  expect(paid.payments).toHaveLength(1);
  expect(paid.state).toBe("on_track");
  await expect(
    duesExecute(
      db,
      president,
      { action: "pay", id: debt.id, amountCents: 20000, method: "cash", occurredOn: today(), reference: "" },
      club,
    ),
  ).rejects.toMatchObject({ code: "OVERPAID" });
  await expect(
    duesExecute(
      db,
      coach,
      { action: "pay", id: debt.id, amountCents: 100, method: "cash", occurredOn: today(), reference: "" },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const ledger = await db.query(
    "SELECT category,direction,amount_cents FROM finance_transaction WHERE receivable_id=$1 AND cancelled_at IS NULL",
    [debt.id],
  );
  expect(ledger.rows).toEqual([{ category: "dues", direction: "in", amount_cents: 12500 }]);
});

it("lets the players note what they collected for a pot run with them", async () => {
  const pot = (await fundraisingView(db, president)).pots.find((p) => p.name === "Tournoi de Pâques")!;
  expect(pot.players_join).toBe(true);
  // The parent notes a sponsor for Emma; Sam notes a sale for himself.
  await fundraisingExecute(
    db,
    parent,
    { action: "collect", potId: pot.id, profileId: emma, occurredOn: today(), kind: "sponsor", label: "Boulangerie Dupont", amountCents: 15000, donor: "Dupont" },
    club,
  );
  await fundraisingExecute(
    db,
    player,
    { action: "collect", potId: pot.id, profileId: sam, occurredOn: today(), kind: "action", label: "Vente de gaufres", amountCents: 4000, donor: "" },
    club,
  );
  // Nobody notes for a child who is not theirs.
  await expect(
    fundraisingExecute(
      db,
      player,
      { action: "collect", potId: pot.id, profileId: emma, occurredOn: today(), kind: "donation", label: "Faux don", amountCents: 100, donor: "" },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const mine = (await fundraisingView(db, player)).pots.find((p) => p.id === pot.id)!;
  expect(mine.collectors.map((c) => [c.name, c.cents])).toEqual([
    ["Emma Peeters", 15000],
    ["Sam Janssens", 4000],
  ]);
  expect(mine.own_movements.map((m) => m.label)).toEqual(["Vente de gaufres"]);
  // Members still see no amounts of the club's other movements, only their own.
  expect(mine.progress.net).toBe(19000);
  // The manager sees who collected what in the movements.
  const managed = (await fundraisingView(db, president)).pots.find((p) => p.id === pot.id)!;
  expect(managed.movements.map((m) => m.collector)).toEqual(["Sam Janssens", "Emma Peeters"]);
  // A player cancels only their own note.
  const samMove = mine.own_movements[0];
  await expect(
    fundraisingExecute(db, parent, { action: "cancelMovement", id: samMove.id }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await fundraisingExecute(db, player, { action: "cancelMovement", id: samMove.id }, club);
  expect((await fundraisingView(db, player)).pots.find((p) => p.id === pot.id)!.progress.net).toBe(15000);
  // A pot without the players stays a managers' matter.
  await fundraisingExecute(
    db,
    president,
    { action: "pot", id: pot.id, groupId: pot.group_id, name: pot.name, description: "", goalCents: 200000, deadline: inDays(40), status: "open", playersJoin: false },
    club,
  );
  await expect(
    fundraisingExecute(
      db,
      player,
      { action: "collect", potId: pot.id, profileId: sam, occurredOn: today(), kind: "action", label: "Encore", amountCents: 100, donor: "" },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await workspace(db, player)).fundraisingOpen).toBe(false);
});

it("marks attendance from the table, one click per cell, and keeps the statistics view readable", async () => {
  const past = await session(2, "Entraînement J-2", "training", [emma, lucas]);
  // The session took place two days ago.
  await db.query("UPDATE calendar_event SET starts_at=starts_at-interval '4 days',ends_at=ends_at-interval '4 days' WHERE id=$1", [past]);
  const view = await attendanceView(db, coach, inDays(-30), inDays(10), "");
  const ev = view.events.find((e) => e.id === past)!;
  expect(ev.manage).toBe(true);
  const inv = ev.invitations.find((i) => i.profile_id === emma)!;
  await attendanceExecute(
    db,
    coach,
    { action: "mark", id: inv.id, expectedVersion: inv.version, actual: "present", reason: "" },
    club,
  );
  const again = await attendanceView(db, coach, inDays(-30), inDays(10), "");
  expect(again.events.find((e) => e.id === past)!.invitations.find((i) => i.profile_id === emma)!.actual).toBe("present");
  // The statistics page asks the same view for 90 days: it answers for the president.
  const stats = await attendanceView(db, president, inDays(-90), today(), "");
  expect(stats.events.some((e) => e.id === past)).toBe(true);
});

it("fills the registration form with the amount of the season's dues plan", async () => {
  const { id: form } = await registrationExecute(
    db,
    president,
    {
      action: "form",
      seasonId: season,
      title: "Inscription 2026-27",
      description: platformTemplate("player", "fr").description,
      fields: platformTemplate("player", "fr").fields,
      published: true,
      capacity: null,
    },
    club,
  );
  const shown = await publicForm(db, form);
  expect(shown.description).toContain("La cotisation s'élève à 250 € par saison");
  const installments = shown.fields.find((f) => f.key === "installments")!;
  expect(installments.label.fr).toBe("Paiement de la cotisation (250 €) : en combien de fois ?");
  expect(installments.options).toEqual(["1 fois", "2 fois", "3 fois", "4 fois"]);
  expect(installments.help?.fr).toContain("En 2 fois : 125 € par versement ; en 3 fois : 83,34 € ; en 4 fois : 62,50 €.");
  // The stored form keeps the placeholders: a new plan changes the public form at once.
  const stored = await db.query("SELECT description FROM registration_form WHERE id=$1", [form]);
  expect(stored.rows[0].description).toContain("{cotisation}");
});
