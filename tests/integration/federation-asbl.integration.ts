import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { financeExecute, financeView } from "../../src/domains/finance/service";
import { clubAffiliationsExecute, clubAffiliationsView, federationAffiliationsExecute } from "../../src/domains/affiliations/service";
import { undoExecute } from "../../src/domains/undo/service";
import { associationExecute, associationView } from "../../src/domains/association/service";
import { taskCommand } from "../../src/domains/tasks/schema";
import { tasksExecute } from "../../src/domains/tasks/service";
import { seasonOf } from "../../src/domains/finance/schema";

/**
 * 35: the federation's operation invisible to the clubs; an affiliation
 * paid that is the federation's income and the club's expense, with nothing
 * private of the club; the clubs' assembly with a proxy and weighted votes;
 * a federal treasurer without a club's books; the federation's year; two
 * federations.
 */
const schema = "fasbl_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
type Who = Principal & { mandateId: string };
let fed: string, fedB: string, clubA: string, clubB: string, president: Who, presidentB: Who, treasurer: Who, licences: Who, presidentA: Who, presidentClubB: Who;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const labels = async (who: Who) => {
  const v = await financeView(db, who);
  return (v.entries as unknown as { label: string; direction: string; counterparty: string; cancelled_at: string | null }[]).filter((t) => !t.cancelled_at).map((t) => `${t.direction}:${t.label}:${t.counterparty}`);
};
async function member(org: string, role: string, name: string, grants: string[] = []): Promise<Who> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id as string;
  await execute(db, { userId, sessionId }, { action: "context", mandateId });
  return { userId, sessionId, mandateId };
}
const record = (label: string, direction: "in" | "out" = "in") => ({ action: "record" as const, occurredOn: today, label, direction, category: "subsidy" as const, amountCents: 50000, method: "transfer" as const, counterparty: "Région", reference: "", notes: "" });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  fedB = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  president = await member(fed, "federation_president", "Présidence");
  presidentB = await member(fedB, "federation_president", "Autre présidence");
  treasurer = await member(fed, "federation_worker", "Trésorier fédéral", ["federation.finance"]);
  licences = await member(fed, "federation_worker", "Délégué licences", ["federation.licences"]);
  presidentA = await member(clubA, "club_president", "Président A");
  presidentClubB = await member(clubB, "club_president", "Président B");
  // Club A has three active licences this season, club B one.
  const season = seasonOf(today).label;
  for (const [club, n] of [
    [clubA, 3],
    [clubB, 1],
  ] as const)
    for (let i = 0; i < n; i++) {
      const profile = (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,p.id,$2 FROM p RETURNING id", [club, `Joueur ${i}`])).rows[0].id;
      await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,$5,'active',$6)", [fed, club, profile, season, `${club.slice(0, 4)}-${i}`, president.userId]);
    }
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps the federation's books to its treasurer, and a club's to the club", async () => {
  await financeExecute(db, treasurer, record("Subside régional"), fed);
  await financeExecute(db, presidentA, record("Subside communal"), clubA);
  expect(await labels(treasurer)).toEqual(["in:Subside régional:Région"]);
  expect(await labels(presidentA)).toEqual(["in:Subside communal:Région"]);
  // A delegate without the finance competence, another federation.
  await expect(financeView(db, licences)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(financeExecute(db, licences, record("Intrus"), fed)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await labels(presidentB)).toEqual([]);
});

it("writes a paid affiliation as the federation's income and the club's expense, and undoes both", async () => {
  const month = Number(today.slice(5, 7));
  await federationAffiliationsExecute(
    db,
    president,
    { action: "addFee", name: "Affiliation", description: "", contactId: null, basis: "club", frequency: "annual", amountCents: 2500, opensMonth: month, opensDay: 1, dueDays: 30, dueMonth: null, dueDay: null, allClubs: true, clubIds: [] } as never,
    fed,
  );
  const due = (await clubAffiliationsView(db, presidentA)).dues[0];
  const r = await clubAffiliationsExecute(db, presidentA, { action: "markPaid", id: due.id, paidOn: today, method: "transfer", createExpense: true }, clubA);
  expect((await labels(presidentA)).filter((l) => l.startsWith("out:"))).toEqual([`out:Affiliation ${due.period}:Fédération`]);
  expect((await labels(treasurer)).filter((l) => l.includes("Affiliation"))).toEqual([`in:Affiliation ${due.period} · Club A:Club A`]);
  // Nothing of the club's private data rides along.
  const row = (await db.query("SELECT notes,reference,payer_profile_id,credit_profile_id,receivable_id FROM finance_transaction WHERE organization_id=$1 AND auto_source='affiliation'", [fed])).rows[0];
  expect(row).toEqual({ notes: "", reference: "", payer_profile_id: null, credit_profile_id: null, receivable_id: null });
  await undoExecute(db, presidentA, { id: r.undo! }, clubA);
  expect((await labels(treasurer)).filter((l) => l.includes("Affiliation"))).toEqual([]);
  // Paid again: written again, once.
  await clubAffiliationsExecute(db, presidentA, { action: "markPaid", id: due.id, paidOn: today, method: "transfer", createExpense: false }, clubA);
  expect((await labels(treasurer)).filter((l) => l.includes("Affiliation"))).toHaveLength(1);
});

it("holds the clubs' assembly: each club a member, a proxy, votes weighted by licences", async () => {
  const v = await associationView(db, president, "fr");
  expect(v.members.map((m) => [m.full_name, m.status])).toEqual([
    ["Club A", "effective"],
    ["Club B", "effective"],
  ]);
  expect(v.representatives.map((k) => [k.club, k.name])).toEqual([
    ["Club A", "Président A"],
    ["Club B", "Président B"],
  ]);
  // Opening the page twice adds no one.
  expect((await associationView(db, president, "fr")).members).toHaveLength(2);
  const rules = { ...v.rules, weighting: "licences" as const, maxProxies: 1, quorumPercent: 50 };
  await associationExecute(db, president, { action: "rules", rules }, fed);
  const planned = (await associationExecute(db, president, { action: "plan", kind: "assembly", title: "AG des clubs", startsAt: new Date(Date.now() + 30 * 86400000).toISOString(), place: "Namur", fiscalYearStart: null, locale: "fr" }, fed)) as {
    id: string;
  };
  const a = v.representatives.find((k) => k.club === "Club A")!.profile_id,
    b = v.representatives.find((k) => k.club === "Club B")!.profile_id;
  await associationExecute(db, president, { action: "proxy", meetingId: planned.id, giverId: b, holderId: a }, fed);
  await associationExecute(db, president, { action: "presence", meetingId: planned.id, profileId: a, present: true }, fed);
  const meeting = (await associationView(db, president, "fr")).meetings.find((m) => m.id === planned.id)!;
  expect(meeting.attendees.map((x) => [x.full_name, x.weight, x.holder_id === a])).toEqual([
    ["Club A", 3, false],
    ["Club B", 1, true],
  ]);
  expect(meeting.quorum).toMatchObject({ members: 4, present: 3, represented: 1, reached: true });
  // The representative of a club is one of its mandates, never someone of another club.
  await expect(associationExecute(db, president, { action: "representative", profileId: a, userId: presidentClubB.userId }, fed)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Another federation's presidency sees none of it.
  expect((await associationView(db, presidentB, "fr")).members).toEqual([]);
  await expect(associationExecute(db, presidentB, { action: "presence", meetingId: planned.id, profileId: a, present: false }, fedB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("applies the ASBL's year to the federation, with its own deadlines", async () => {
  const year = Number(today.slice(0, 4));
  const items = ["assembly", "filing", "affiliationsOpen", "competitionCalendar", "classificationDays"].map((key) => ({ key, title: `Échéance ${key}`, dueOn: `${year}-12-01`, responsibleUserId: treasurer.userId }));
  await tasksExecute(db, president, taskCommand.parse({ action: "applyYear", year, items }), fed);
  const rows = (await db.query("SELECT category,responsible_user_id FROM task WHERE organization_id=$1 AND source_key LIKE 'year:%' ORDER BY source_key", [fed])).rows;
  expect(rows.map((r) => r.category).sort()).toEqual(["fed_admin", "fed_admin", "fed_competitions", "fed_competitions", "fed_affiliations"].sort());
  expect(rows.every((r) => r.responsible_user_id === treasurer.userId)).toBe(true);
  // A club's own item is not the federation's.
  await expect(tasksExecute(db, president, taskCommand.parse({ action: "applyYear", year, items: [{ key: "affiliation", title: "Payer", dueOn: null }] }), fed)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
