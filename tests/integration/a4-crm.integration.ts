import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { contactChoices, contactDetail, contactExport, contactsExecute, contactsView, searchContacts } from "../../src/domains/crm/service";
import { contactCommand } from "../../src/domains/crm/schema";
import { fundingExecute, fundingView } from "../../src/domains/funding/service";
import { fundingCommand } from "../../src/domains/funding/schema";
import { fundraisingExecute } from "../../src/domains/fundraising/service";
import { tasksView } from "../../src/domains/tasks/service";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * A4: the contact book as a light CRM. The organisations written as text
 * become organisations; a contact created from a grant's form; the log
 * moves a sponsor's last contact; two duplicates merged with their
 * history; a donation linked to its donor; the next action in the to-do;
 * import, export and erasure; a contact of another club stays invisible.
 */
const schema = "a4crm_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, coachProfile: string, legacy: string;
const today = brusselsToday();

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const crm = (p: Principal, org: string, cmd: Record<string, unknown>) => contactsExecute(db, p, contactCommand.parse(cmd), org) as Promise<Record<string, unknown> & { id: string }>;
const fund = (p: Principal, org: string, cmd: Record<string, unknown>) => fundingExecute(db, p, fundingCommand.parse(cmd), org) as Promise<{ id: string }>;
const person = (fullName: string, extra: Record<string, unknown> = {}) => ({ action: "contact", fullName, organizationName: "", role: "", email: "", phone: "", tags: [], notes: "", ...extra });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  const files = (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.filter((f) => f < "0066")) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const pres = await actor(clubA, "club_president", "Présidente");
  president = pres.p;
  // A contact written before the CRM, its organisation as free text.
  legacy = (await db.query("INSERT INTO contact(organization_id,full_name,organization_name,tags,created_by) VALUES($1,'Anne Legrand','Commune de Namur','{public}',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  for (const f of files.filter((f) => f >= "0066")) await db.query(await readFile("db/migrations/" + f, "utf8"));
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const c = await actor(clubA, "coach", "Coach");
  coach = c.p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Sam Coach','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("turns the organisations written as text into organisations, without loss", async () => {
  const view = await contactsView(db, president);
  const org = view.organizations.find((o) => o.name === "Commune de Namur")!;
  expect([org.kind, org.contacts]).toEqual(["public", 1]);
  expect(view.contacts.find((x) => x.id === legacy)).toMatchObject({ organization_name: "Commune de Namur", contact_organization_id: org.id, legal_basis: "legitimate_interest", contact_ok: true });
});

it("creates a contact from a grant's form and shows the grant on its sheet", async () => {
  // « Choisir ou créer un contact »: the contact is created, then chosen in the form.
  const made = await crm(president, clubA, person("Paul Dumont", { organizationName: "Province de Liège", email: "paul@province.test" }));
  expect(made.organization_name).toBe("Province de Liège");
  const grant = await fund(president, clubA, { action: "grant", funder: "Province de Liège", program: "", purpose: "", requestedCents: 100000, status: "idea", notes: "", contactId: made.id });
  const sheet = await contactDetail(db, president, made.id);
  expect(sheet.organization?.name).toBe("Province de Liège");
  expect(sheet.linked.grants.map((g) => g.id)).toEqual([grant.id]);
  expect((await contactChoices(db, president)).contacts.map((x) => x.full_name)).toContain("Paul Dumont");
  // The coach reads the book and the sheet, but creates nothing.
  expect((await contactChoices(db, coach)).can.create).toBe(false);
  await expect(crm(coach, clubA, person("Quelqu'un"))).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("logs an exchange in one click, which moves the sponsor's last contact", async () => {
  const contact = await crm(president, clubA, person("Marc Garage", { tags: ["sponsor"] }));
  const partner = await fund(president, clubA, {
    action: "partner",
    name: "Garage Marc",
    kind: "sponsor",
    status: "active",
    amountCents: 50000,
    inKind: "",
    counterpart: "",
    nextAction: "",
    notes: "",
    contactId: contact.id,
    lastContactOn: "2026-01-10",
  });
  // A note does not count as a contact; a call does.
  await crm(coach, clubA, { action: "interaction", contactId: contact.id, kind: "note", summary: "Préfère être appelé le matin" });
  expect((await fundingView(db, president)).partners.find((x) => x.id === partner.id)!.last_contact_on).toBe("2026-01-10");
  await crm(coach, clubA, { action: "interaction", contactId: contact.id, kind: "call", summary: "D'accord pour renouveler" });
  expect((await fundingView(db, president)).partners.find((x) => x.id === partner.id)!.last_contact_on).toBe(today);
  const sheet = await contactDetail(db, president, contact.id);
  expect(sheet.interactions.map((i) => [i.kind, i.summary, i.author])).toEqual([
    ["call", "D'accord pour renouveler", "Coach"],
    ["note", "Préfère être appelé le matin", "Coach"],
  ]);
  expect((await contactsView(db, president)).contacts.find((x) => x.id === contact.id)!.last_contact_on).toBe(today);
  // Sharing the sponsor report writes itself in the log.
  await fund(president, clubA, { action: "partnerReport", partnerId: partner.id, public: true });
  expect((await contactDetail(db, president, contact.id)).interactions[0]).toMatchObject({ kind: "sent", source: "partner_report" });
  // The coach deletes his own line, not the president's or the application's.
  const own = (await contactDetail(db, president, contact.id)).interactions.find((i) => i.kind === "note")!;
  await crm(coach, clubA, { action: "deleteInteraction", id: own.id });
  const sent = (await contactDetail(db, president, contact.id)).interactions.find((i) => i.kind === "sent")!;
  await expect(crm(president, clubA, { action: "deleteInteraction", id: sent.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("finds two duplicates and merges them, keeping the history and the links", async () => {
  const a = await crm(president, clubA, person("Julie Martin", { email: "julie@club.test", phone: "0470 12 34 56" }));
  const b = await crm(president, clubA, person("julie MARTIN", { email: "", phone: "+32 470 12 34 56", role: "Trésorière", tags: ["donor"] }));
  await crm(president, clubA, { action: "interaction", contactId: b.id, kind: "meeting", summary: "Rencontre au tournoi" });
  const grant = await fund(president, clubA, { action: "grant", funder: "Fondation Julie", program: "", purpose: "", requestedCents: 0, status: "idea", notes: "", contactId: b.id });
  const dup = (await contactsView(db, president)).duplicates.find((d) => [d.a, d.b].sort().join() === [a.id, b.id].sort().join());
  expect(dup?.reason).toBe("phone");
  await crm(president, clubA, { action: "merge", keepId: a.id, mergeId: b.id });
  const sheet = await contactDetail(db, president, a.id);
  // « public » comes from the grant it is the contact of (wave 15).
  expect([sheet.contact.email, sheet.contact.role, [...sheet.contact.tags].sort()]).toEqual(["julie@club.test", "Trésorière", ["donor", "public"]]);
  expect(sheet.interactions.map((i) => i.summary)).toEqual(expect.arrayContaining(["Rencontre au tournoi", "Fiche fusionnée avec julie MARTIN"]));
  expect(sheet.linked.grants.map((g) => g.id)).toEqual([grant.id]);
  await expect(contactDetail(db, president, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("links a donation to its donor, with the total given by year", async () => {
  const donor = await crm(president, clubA, person("Hélène Don", { tags: ["donor"] }));
  const group = (await db.query("INSERT INTO fundraising_group(organization_id,name,created_by) VALUES($1,'Saison',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  const pot = (await db.query("INSERT INTO fundraising_pot(organization_id,group_id,name,goal_cents,created_by) VALUES($1,$2,'Nouveau fauteuil',500000,$3) RETURNING id", [clubA, group, president.userId])).rows[0].id;
  for (const [on, cents] of [
    ["2025-12-01", 10000],
    ["2026-03-01", 25000],
  ] as const)
    await fundraisingExecute(db, president, { action: "movement", potId: pot, occurredOn: on, kind: "donation", label: "Don", amountCents: cents, donor: "", anonymous: false, contactId: donor.id }, clubA);
  const sheet = await contactDetail(db, president, donor.id);
  expect(sheet.linked.donations.map((d) => d.amount_cents)).toEqual([25000, 10000]);
  expect(sheet.linked.donationsByYear).toEqual([
    { year: "2026", cents: 25000 },
    { year: "2025", cents: 10000 },
  ]);
  expect((await db.query("SELECT donor FROM fundraising_movement WHERE contact_id=$1 LIMIT 1", [donor.id])).rows[0].donor).toBe("Hélène Don");
  // The coach sees the sheet, not the amounts.
  expect((await contactDetail(db, coach, donor.id)).linked.donations).toEqual([]);
  // A contact of another club cannot be the donor.
  const elsewhere = await crm(presidentB, clubB, person("Donateur B"));
  await expect(
    fundraisingExecute(db, president, { action: "movement", potId: pot, occurredOn: today, kind: "donation", label: "Don", amountCents: 100, donor: "", anonymous: false, contactId: elsewhere.id }, clubA),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("puts a contact's next action in the to-do, given to someone", async () => {
  const contact = await crm(president, clubA, person("Sophie Salle", { tags: ["venue"] }));
  const { id } = await crm(president, clubA, { action: "nextAction", contactId: contact.id, title: "Réserver la salle pour mars", dueOn: "2027-01-15", responsibleId: coachProfile });
  const task = (await tasksView(db, coach)).tasks.find((t) => t.id === id)!;
  expect([task.category, task.contact_id, task.about, task.responsible_id]).toEqual(["events", contact.id, "Sophie Salle", coachProfile]);
  expect((await contactDetail(db, president, contact.id)).linked.tasks.map((t) => t.title)).toEqual(["Réserver la salle pour mars"]);
});

it("imports contacts once, exports and erases a contact on request", async () => {
  const rows = [
    { fullName: "Import Un", email: "un@import.test", organizationName: "Société Import" },
    { fullName: "Import Deux", email: "UN@import.test" },
    { fullName: "Import Trois", phone: "02 123 45 67" },
  ];
  expect(await crm(president, clubA, { action: "import", rows, tags: ["supplier"] })).toMatchObject({ created: 2, skipped: 1 });
  const imported = (await contactsView(db, president)).contacts.find((x) => x.full_name === "Import Un")!;
  expect([imported.tags, imported.organization_name]).toEqual([["supplier"], "Société Import"]);
  const exported = await contactExport(db, president, imported.id);
  expect(exported.contact).toMatchObject({ full_name: "Import Un", email: "un@import.test", organization: "Société Import" });
  await expect(contactExport(db, coach, imported.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Erasure: the grant keeps its funder, only the link goes.
  const grant = await fund(president, clubA, { action: "grant", funder: "Société Import", program: "", purpose: "", requestedCents: 0, status: "idea", notes: "", contactId: imported.id });
  await crm(president, clubA, { action: "erase", id: imported.id });
  expect((await fundingView(db, president)).grants.find((g) => g.id === grant.id)).toMatchObject({ funder: "Société Import", contact_id: null });
  await expect(contactDetail(db, president, imported.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("keeps another club's contacts invisible", async () => {
  const b = await crm(presidentB, clubB, person("Contact secret B", { email: "secret@b.test" }));
  expect((await contactsView(db, president)).contacts.some((x) => x.id === b.id)).toBe(false);
  await expect(contactDetail(db, president, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(crm(president, clubA, { action: "interaction", contactId: b.id, kind: "call", summary: "Bonjour" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(crm(president, clubA, { action: "merge", keepId: legacy, mergeId: b.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(crm(president, clubA, { action: "erase", id: b.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(fund(president, clubA, { action: "grant", funder: "X club", program: "", purpose: "", requestedCents: 0, status: "idea", notes: "", contactId: b.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const c = await db.connect();
  try {
    expect((await searchContacts(c, clubA, "secret")).length).toBe(0);
    expect((await searchContacts(c, clubB, "secret")).map((x) => x.name)).toEqual(["Contact secret B"]);
    expect((await searchContacts(c, clubA, "helene")).map((x) => x.name)).toEqual(["Hélène Don"]);
  } finally {
    c.release();
  }
});
