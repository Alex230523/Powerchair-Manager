import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, userAvatar, workspace, type Principal } from "../../src/domains/access/service";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import { governanceExecute, governanceView } from "../../src/domains/club/governance";
import { dashboardView } from "../../src/domains/dashboard/service";
import { fundingExecute, fundingView } from "../../src/domains/funding/service";
import { contactsExecute, contactsView } from "../../src/domains/crm/service";
import { duesReminderTick } from "../../src/domains/reminders/service";
import { brusselsDay } from "../../src/lib/today";

const schema = "wave11_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string, season: string, president: Principal, coach: Principal, parent: Principal, emma: string;

async function actor(role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, "Test " + role, userId + "@example.test"],
  );
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, userId]);
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
const inDays = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club vague 11','club') RETURNING id")).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison 2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id",
      [club],
    )
  ).rows[0].id;
  president = (await actor("club_president")).p;
  coach = (await actor("coach", ["calendar.read"])).p;
  const par = await actor("guardian");
  parent = par.p;
  const kidPerson = (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")).rows[0].id;
  emma = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Emma Peeters','2010-12-03','{player}') RETURNING id",
      [club, kidPerson],
    )
  ).rows[0].id;
  const nadia = (
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Nadia Peeters') RETURNING id", [club, par.person])
  ).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
    [club, nadia, emma, president.userId],
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

it("keeps one photo per account, checked by its signature", async () => {
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(32)]).toString("base64");
  await expect(execute(db, president, { action: "avatar", mediaType: "image/jpeg", data: png })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  await execute(db, president, { action: "avatar", mediaType: "image/png", data: png });
  expect((await workspace(db, president)).avatarVersion).toMatch(/^\d+$/);
  expect((await userAvatar(db, president))?.media_type).toBe("image/png");
  expect((await workspace(db, coach)).avatarVersion).toBeNull();
  await execute(db, president, { action: "removeAvatar" });
  expect(await userAvatar(db, president)).toBeUndefined();
});

it("opens the contact book to the staff and its edition to the president", async () => {
  const { id } = await contactsExecute(
    db,
    president,
    { action: "contact", fullName: "Marc Dupont", organizationName: "Commune de Schaerbeek", role: "Échevin des sports", email: "marc@commune.test", phone: "02 000 00 00", tags: ["public"], notes: "" },
    club,
  );
  const seen = await contactsView(db, coach);
  expect(seen.can.manage).toBe(false);
  expect(seen.contacts.map((c) => c.full_name)).toEqual(["Marc Dupont"]);
  await expect(
    contactsExecute(db, coach, { action: "contact", id, fullName: "Marc D.", organizationName: "", role: "", email: "", phone: "", tags: [], notes: "" }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(contactsView(db, parent)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await contactsExecute(
    db,
    president,
    { action: "contact", id, fullName: "Marc Dupont", organizationName: "Commune de Schaerbeek", role: "Échevin des sports", email: "", phone: "", tags: ["public", "sponsor"], notes: "Rencontré au tournoi", archived: false },
    club,
  );
  expect((await contactsView(db, president)).contacts[0]).toMatchObject({ tags: ["public", "sponsor"], notes: "Rencontré au tournoi", version: 2 });
});

it("follows grants and partners with their next dates on the home page", async () => {
  const contact = (await contactsView(db, president)).contacts[0];
  await fundingExecute(
    db,
    president,
    { action: "grant", seasonId: season, funder: "Commune de Schaerbeek", program: "Sport pour tous", purpose: "Deux fauteuils", requestedCents: 800000, grantedCents: null, status: "idea", deadlineOn: inDays(12), notes: "", contactId: contact.id },
    club,
  );
  const { id: partner } = await fundingExecute(
    db,
    president,
    { action: "partner", name: "Boulangerie Dupont", kind: "sponsor", status: "active", amountCents: 150000, inKind: "", counterpart: "Logo sur le maillot", startsOn: inDays(-300), endsOn: inDays(20), nextActionOn: null, nextAction: "", contactId: null, notes: "" },
    club,
  );
  const view = await fundingView(db, president);
  expect(view.grants[0]).toMatchObject({ funder: "Commune de Schaerbeek", contact_name: "Marc Dupont", next: { kind: "deadline", date: inDays(12) } });
  expect(view.partners[0]).toMatchObject({ name: "Boulangerie Dupont", next: { kind: "renewal", date: inDays(20) } });
  expect((await contactsView(db, president)).contacts[0].grants).toBe(1);
  const dash = await dashboardView(db, president);
  expect(dash.deadlines.find((d) => d.kind === "grant")).toMatchObject({ date: inDays(12), title: "Commune de Schaerbeek · Sport pour tous", href: `/funding/grants-sponsors?vue=subsides&grant=${view.grants[0].id}` });
  expect(dash.deadlines.find((d) => d.kind === "partner")).toMatchObject({ date: inDays(20), title: "Boulangerie Dupont", href: "/funding/grants-sponsors?vue=sponsoring" });
  // A family sees none of the club's money matters; a coach without money rights neither.
  expect((await dashboardView(db, parent)).deadlines.some((d) => d.kind === "grant" || d.kind === "partner")).toBe(false);
  await expect(fundingView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Once granted, the next step is the report; an ended partner has no next date.
  await fundingExecute(
    db,
    president,
    { action: "grant", id: view.grants[0].id, seasonId: season, funder: "Commune de Schaerbeek", program: "Sport pour tous", purpose: "Deux fauteuils", requestedCents: 800000, grantedCents: 600000, status: "granted", decisionOn: inDays(-1), reportDueOn: inDays(90), notes: "", contactId: contact.id },
    club,
  );
  await fundingExecute(
    db,
    president,
    { action: "partner", id: partner, name: "Boulangerie Dupont", kind: "sponsor", status: "ended", amountCents: 150000, inKind: "", counterpart: "", startsOn: inDays(-300), endsOn: inDays(20), nextActionOn: null, nextAction: "", contactId: null, notes: "" },
    club,
  );
  const again = await fundingView(db, president);
  expect(again.grants[0].next).toEqual({ kind: "report", date: inDays(90) });
  expect(again.partners[0].next).toBeNull();
  await fundingExecute(db, president, { action: "deletePartner", id: partner }, club);
  expect((await fundingView(db, president)).partners).toHaveLength(0);
});

it("warns the president before changing a rate the season already uses", async () => {
  const { id: plan } = await duesExecute(
    db,
    president,
    { action: "plan", seasonId: season, category: "Cotisation", amountCents: 25000, maxInstallments: 4, firstDue: inDays(3) },
    club,
  );
  // No dues yet: the rate changes without a question.
  await duesExecute(db, president, { action: "updatePlan", id: plan, category: "Cotisation", amountCents: 26000, maxInstallments: 4, firstDue: inDays(3) }, club);
  await duesExecute(
    db,
    president,
    { action: "issue", planId: plan, profileId: emma, discountCents: 0, reason: "", installments: 2, firstDue: inDays(3) },
    club,
  );
  await expect(
    duesExecute(db, president, { action: "updatePlan", id: plan, category: "Cotisation", amountCents: 27000, maxInstallments: 4, firstDue: inDays(3) }, club),
  ).rejects.toMatchObject({ code: "SEASON_STARTED" });
  const done = await duesExecute(
    db,
    president,
    { action: "updatePlan", id: plan, category: "Cotisation", amountCents: 27000, maxInstallments: 4, firstDue: inDays(3), confirm: true },
    club,
  );
  expect(done).toMatchObject({ issued: 1 });
  const view = await duesView(db, president);
  expect(view.plans[0]).toMatchObject({ amount_cents: 27000, issued_count: 1 });
  // Emma's dues keep their amount.
  expect(view.debts[0].net_cents).toBe(26000);
});

it("sends dues reminders by itself once the club switches them on", async () => {
  expect(await duesReminderTick(db)).toBe(0);
  await governanceExecute(db, president, { action: "duesRules", rules: { auto: true, daysBefore: 7, daysAfter: 7, repeatDays: 14 } }, club);
  expect((await governanceView(db, president)).dues).toEqual({ auto: true, daysBefore: 7, daysAfter: 7, repeatDays: 14 });
  // Emma's first instalment is due in 3 days: her mother gets a mail, once.
  expect(await duesReminderTick(db)).toBe(1);
  expect(await duesReminderTick(db)).toBe(0);
  const log = await db.query("SELECT automatic,sent_by,recipients FROM reminder_log WHERE organization_id=$1", [club]);
  expect(log.rows).toEqual([{ automatic: true, sent_by: null, recipients: 1 }]);
  const mails = await db.query(
    "SELECT count(*)::int AS n FROM notification_dispatch WHERE organization_id=$1 AND recipient_user_id=$2",
    [club, parent.userId],
  );
  expect(mails.rows[0].n).toBe(1);
});
