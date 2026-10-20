import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { financeExecute } from "../../src/domains/finance/service";
import {
  fundraisingExecute,
  fundraisingView,
  publicPot,
} from "../../src/domains/fundraising/service";
import { calendarExecute } from "../../src/domains/calendar/service";
import { attendanceExecute } from "../../src/domains/attendance/service";
import { absenceExecute, absencesView } from "../../src/domains/absences/service";
import { rolloverExecute, rolloverView } from "../../src/domains/seasons/rollover";
import { attestationsView } from "../../src/domains/dues/attestation";
import { governanceExecute } from "../../src/domains/club/governance";

const schema = "wave8_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  season: string,
  president: Principal,
  coach: Principal,
  parent: Principal,
  emma: string,
  lucas: string,
  zoe: string,
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
async function child(name: string, birth: string) {
  const person = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,'{player}') RETURNING id",
      [club, person, name, birth],
    )
  ).rows[0].id as string;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query("INSERT INTO organization(name,kind) VALUES('Club vague 8','club') RETURNING id")
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison 2025-26',CURRENT_DATE-100,CURRENT_DATE+200) RETURNING id",
      [club],
    )
  ).rows[0].id;
  president = (await actor("club_president")).p;
  coach = (await actor("coach")).p;
  const par = await actor("guardian");
  parent = par.p;
  emma = await child("Emma Peeters", "2010-12-03");
  lucas = await child("Lucas Peeters", "2013-04-30");
  zoe = await child("Zoé Peeters", "2015-01-01");
  const nadia = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Nadia Peeters') RETURNING id",
      [club, par.person],
    )
  ).rows[0].id;
  for (const kid of [emma, lucas, zoe])
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
  for (const kid of [emma, lucas, zoe])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-100)",
      [club, team, kid],
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

const discounts = async () =>
  Object.fromEntries(
    (await duesView(db, president)).debts
      .filter((d: { status: string }) => d.status === "open")
      .map((d: { profile_id: string; discount_cents: number }) => [d.profile_id, d.discount_cents]),
  );

it("applies the sibling discount by age, recomputes it, and leaves paid dues alone", async () => {
  const { id: plan } = await duesExecute(
    db,
    president,
    { action: "plan", seasonId: season, category: "Cotisation", amountCents: 25000, maxInstallments: 4, firstDue: inDays(10) },
    club,
  );
  await duesExecute(db, president, { action: "siblingRule", planId: plan, secondPercent: 20, nextPercent: 30 }, club);
  const issue = (profileId: string) =>
    duesExecute(
      db,
      president,
      { action: "issue", planId: plan, profileId, discountCents: 0, reason: "", installments: 1, firstDue: inDays(10) },
      club,
    );
  await issue(lucas);
  expect(await discounts()).toEqual({ [lucas]: 0 });
  await issue(emma);
  // Emma is older: Lucas becomes the second child.
  expect(await discounts()).toEqual({ [lucas]: 5000, [emma]: 0 });
  await issue(zoe);
  expect((await discounts())[zoe]).toBe(7500);
  // Lucas pays; a later change of rule does not touch his dues.
  const lucasDebt = (await duesView(db, president)).debts.find((d: { profile_id: string }) => d.profile_id === lucas);
  await financeExecute(
    db,
    president,
    {
      action: "record",
      occurredOn: today(),
      label: "Cotisation Lucas",
      direction: "in",
      category: "dues",
      amountCents: 20000,
      method: "transfer",
      counterparty: "",
      reference: "",
      notes: "",
      receivableId: lucasDebt.id,
    },
    club,
  );
  await duesExecute(db, president, { action: "siblingRule", planId: plan, secondPercent: 10, nextPercent: 15 }, club);
  expect(await discounts()).toEqual({ [lucas]: 5000, [emma]: 0, [zoe]: 3750 });
  // Lucas's dues are paid in full: the attestation is ready for his family.
  const att = await attestationsView(db, parent, season);
  expect(att.can.all).toBe(false);
  expect(att.people.map((x) => [x.full_name, x.eligible])).toEqual([
    ["Emma Peeters", false],
    ["Lucas Peeters", true],
    ["Zoé Peeters", false],
  ]);
  expect(att.people.find((x) => x.profile_id === lucas)?.paid_cents).toBe(20000);
});

it("keeps fundraising apart from the accounts and shares only progress publicly", async () => {
  const { id: group } = await fundraisingExecute(
    db,
    president,
    { action: "group", name: "Comité de soutien", description: "", archived: false },
    club,
  );
  const { id: pot } = await fundraisingExecute(
    db,
    president,
    { action: "pot", groupId: group, name: "Nouveaux fauteuils", description: "Deux Strike Force", goalCents: 4000000, deadline: inDays(200), status: "open" },
    club,
  );
  for (const [kind, label, amount, donor] of [
    ["donation", "Don", 50000, "Famille Peeters"],
    ["action", "Souper spaghetti", 120000, ""],
    ["expense", "Courses du souper", 30000, ""],
  ] as const)
    await fundraisingExecute(
      db,
      president,
      { action: "movement", potId: pot, occurredOn: today(), kind, label, amountCents: amount, donor, anonymous: false },
      club,
    );
  const ledger = await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1 AND label LIKE 'Souper%'", [club]);
  expect(ledger.rows[0].n).toBe(0);
  const byCoach = await fundraisingView(db, coach);
  const seen = byCoach.pots.find((p) => p.id === pot)!;
  expect(seen.progress).toMatchObject({ net: 140000, spent: 30000 });
  // Members see the events held, not the gifts' amounts or donors, nor expenses.
  expect(seen.movements.map((m) => m.label)).toEqual(["Souper spaghetti", "Don"]);
  expect(seen.movements.some((m) => "donor" in m)).toBe(false);
  await expect(
    fundraisingExecute(db, coach, { action: "cancelMovement", id: randomUUID() }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await fundraisingExecute(db, president, { action: "publish", potId: pot, public: true }, club);
  const token = (await fundraisingView(db, president)).pots.find((p) => p.id === pot)!.public_token!;
  const pub = await publicPot(db, token);
  expect(pub).toMatchObject({ name: "Nouveaux fauteuils", club: "Club vague 8", progress: { net: 140000, percent: 3 } });
  expect(JSON.stringify(pub)).not.toContain("Peeters");
  await governanceExecute(db, president, { action: "modules", disabled: ["fundraising"] }, club);
  await expect(publicPot(db, token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await governanceExecute(db, president, { action: "modules", disabled: [] }, club);
});

it("answers absent for announced absences, also for sessions planned later, and reopens on cancel", async () => {
  const create = async (offset: number, title: string) => {
    await calendarExecute(
      db,
      president,
      {
        action: "create",
        title,
        kind: "training",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: `${inDays(offset)}T18:00`,
        localEnd: `${inDays(offset)}T19:30`,
        fold: "reject",
        teamId: null,
        placeId: null,
        freeLocation: "Salle",
        responsibleId: president.userId,
        visibility: "organization",
        equipment: "",
        instructions: "",
        participants: [emma, lucas],
        documents: [],
        intervalDays: 0,
        occurrences: 1,
        requestId: randomUUID(),
      },
      club,
    );
    const eventId = (await db.query("SELECT id FROM calendar_event WHERE title=$1", [title])).rows[0].id;
    await attendanceExecute(
      db,
      president,
      { action: "invite", eventId, expectedVersion: null, profiles: [emma, lucas], deadline: `${inDays(offset)}T12:00:00Z`, minimum: 0 },
      club,
    );
    return eventId as string;
  };
  await create(5, "Entraînement J+5");
  const { id: absence } = await absenceExecute(
    db,
    parent,
    { action: "declare", profileId: emma, startsOn: inDays(3), endsOn: inDays(12), reason: "chair", comment: "Fauteuil en réparation" },
    club,
  );
  await create(9, "Entraînement J+9");
  const answers = async () =>
    (
      await db.query(
        "SELECT e.title,cp.full_name,i.response,i.absence_reason FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id JOIN club_person cp ON cp.id=i.profile_id ORDER BY e.title,cp.full_name",
      )
    ).rows.map((r) => `${r.title} ${r.full_name} ${r.response} ${r.absence_reason}`);
  expect(await answers()).toEqual([
    "Entraînement J+5 Emma Peeters absent chair",
    "Entraînement J+5 Lucas Peeters none ",
    "Entraînement J+9 Emma Peeters absent chair",
    "Entraînement J+9 Lucas Peeters none ",
  ]);
  const staffView = await absencesView(db, president);
  expect(staffView.absences.map((a) => [a.full_name, a.reason])).toEqual([["Emma Peeters", "chair"]]);
  await expect(
    absenceExecute(db, coach, { action: "declare", profileId: lucas, startsOn: inDays(1), endsOn: inDays(2), reason: "illness", comment: "" }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await absenceExecute(db, parent, { action: "cancel", id: absence }, club);
  expect((await answers()).filter((a) => a.includes("Emma"))).toEqual([
    "Entraînement J+5 Emma Peeters none ",
    "Entraînement J+9 Emma Peeters none ",
  ]);
});

it("rolls a season over: teams, chosen people, dues plans, archived old season", async () => {
  const view = await rolloverView(db, president, season);
  expect(view.suggestion?.name).toBe("Saison 2026-27");
  expect(view.teams[0].members).toHaveLength(3);
  const result = await rolloverExecute(
    db,
    president,
    {
      fromSeasonId: season,
      name: "Saison 2026-27",
      startsOn: inDays(201),
      endsOn: inDays(560),
      teams: [{ teamId: team, profiles: [emma, lucas] }],
      copyPlans: true,
      archiveOld: true,
    },
    club,
  );
  expect(result).toMatchObject({ enrolled: 2, plans: 1 });
  const rows = (
    await db.query(
      "SELECT cp.full_name FROM team_membership m JOIN team t ON t.id=m.team_id JOIN club_person cp ON cp.id=m.profile_id WHERE t.season_id=$1 ORDER BY cp.full_name",
      [result.id],
    )
  ).rows.map((r) => r.full_name);
  expect(rows).toEqual(["Emma Peeters", "Lucas Peeters"]);
  const old = (await db.query("SELECT archived FROM season WHERE id=$1", [season])).rows[0];
  expect(old.archived).toBe(true);
  const plan = (await db.query("SELECT sibling_second_percent FROM dues_plan WHERE season_id=$1", [result.id])).rows[0];
  expect(plan.sibling_second_percent).toBe(10);
  await expect(
    rolloverExecute(db, coach, { fromSeasonId: season, name: "X", startsOn: inDays(600), endsOn: inDays(700), teams: [], copyPlans: false, archiveOld: false }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
