import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  affiliationTick,
  clubAffiliationsExecute,
  clubAffiliationsView,
  federationAffiliationsExecute,
  federationAffiliationsView,
} from "../../src/domains/affiliations/service";
import { undoExecute } from "../../src/domains/undo/service";
import { obligationRows } from "../../src/domains/club/obligations";
import { seasonOf } from "../../src/domains/finance/schema";

/**
 * Wave 17 (N2): fees defined by a federation (all clubs or chosen ones) or a
 * club, one due per period with its amount (per player: licensed players),
 * « en ordre » with the expense, undone, ticking « Statut du club »; the
 * federation's follow-up and reminder. Three clubs, each sees only its own.
 */
const schema = "w17aff_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, clubC: string, fedPresident: Principal, presidentA: Principal, presidentB: Principal, coachA: Principal;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const month = Number(today.slice(5, 7));

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const fee = (name: string, basis: "player" | "club", extra: Record<string, unknown> = {}) => ({
  action: "addFee" as const,
  name,
  description: "",
  contactId: null,
  basis,
  frequency: "annual" as const,
  amountCents: 2500,
  // Opened on the 1st of this month: the period is open today.
  opensMonth: month,
  opensDay: 1,
  dueDays: 30,
  dueMonth: null,
  dueDay: null,
  ...extra,
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération test','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  clubC = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club C','club',$1) RETURNING id", [fed])).rows[0].id;
  fedPresident = await actor(fed, "federation_president");
  presidentA = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  coachA = await actor(clubA, "coach");
  // Three players of club A licensed for the season of the opening day.
  const season = seasonOf(`${today.slice(0, 8)}01`).label;
  for (const n of [1, 2, 3]) {
    const profile = (
      await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,p.id,$2 FROM p RETURNING id", [clubA, "Joueur " + n])
    ).rows[0].id;
    await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) VALUES($1,$2,$3,$4,$5,'active',$6)", [fed, clubA, profile, season, "A-" + n, presidentA.userId]);
  }
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("a federal fee for chosen clubs, per licensed player; one for all clubs, per club", async () => {
  await federationAffiliationsExecute(db, fedPresident, fee("Sportéa", "player", { allClubs: false, clubIds: [clubA] }), fed);
  await federationAffiliationsExecute(db, fedPresident, fee("Affiliation BPCF", "club", { allClubs: true, clubIds: [] }), fed);
  // A club of another federation cannot be chosen; nor can a club define for another.
  await expect(federationAffiliationsExecute(db, fedPresident, fee("X", "club", { allClubs: false, clubIds: [randomUUID()] }), fed)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(federationAffiliationsExecute(db, presidentA, fee("X", "club", { allClubs: true, clubIds: [] }), clubA)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
  const a = await clubAffiliationsView(db, presidentA);
  const names = a.dues.map((d) => `${d.name}:${d.amount_cents}:${d.players ?? "-"}:${d.state}`).sort();
  expect(names).toEqual(["Affiliation BPCF:2500:-:open", "Sportéa:7500:3:open"]);
  expect((await clubAffiliationsView(db, presidentB)).dues.map((d) => d.name)).toEqual(["Affiliation BPCF"]);
  // Each due has its line in « Statut du club ».
  const lines = await (async () => {
    const c = await db.connect();
    try {
      return await obligationRows(c, clubA, Number(a.dues[0].due_on.slice(0, 4)));
    } finally {
      c.release();
    }
  })();
  expect(lines.filter((l) => l.auto_source === "affiliation").map((l) => l.done_on)).toEqual([null, null]);
  // The federation follows all three clubs for BPCF, club A only for Sportéa.
  const f = await federationAffiliationsView(db, fedPresident);
  expect(f.dues.map((d) => d.club).sort()).toEqual(["Club A", "Club A", "Club B", "Club C"]);
});

it("marks « en ordre » with the expense, ticks the status line, and the undo puts it back", async () => {
  const due = (await clubAffiliationsView(db, presidentA)).dues.find((d) => d.name === "Sportéa")!;
  await expect(clubAffiliationsExecute(db, presidentB, { action: "markPaid", id: due.id, paidOn: today, createExpense: true, method: "transfer" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(clubAffiliationsExecute(db, coachA, { action: "markPaid", id: due.id, paidOn: today, createExpense: true, method: "transfer" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const r = await clubAffiliationsExecute(db, presidentA, { action: "markPaid", id: due.id, paidOn: today, createExpense: true, method: "transfer" }, clubA);
  const tx = (await db.query("SELECT direction,category,amount_cents,label FROM finance_transaction WHERE id=$1", [r.transaction])).rows[0];
  expect(tx).toMatchObject({ direction: "out", category: "affiliation", amount_cents: 7500 });
  const c = await db.connect();
  try {
    const line = (await obligationRows(c, clubA, Number(due.due_on.slice(0, 4)))).find((l) => l.title.startsWith("Sportéa"))!;
    expect(line).toMatchObject({ done_on: today, automatic: true });
  } finally {
    c.release();
  }
  expect((await clubAffiliationsView(db, presidentA)).dues.find((d) => d.id === due.id)!.state).toBe("paid");
  await expect(clubAffiliationsExecute(db, presidentA, { action: "markPaid", id: due.id, paidOn: today, createExpense: false, method: "transfer" }, clubA)).rejects.toMatchObject({
    code: "ALREADY_PAID",
  });
  await undoExecute(db, presidentA, { id: r.undo }, clubA);
  expect((await db.query("SELECT paid_on,transaction_id FROM affiliation_due WHERE id=$1", [due.id])).rows[0]).toEqual({ paid_on: null, transaction_id: null });
  expect((await db.query("SELECT cancelled_at IS NOT NULL AS cancelled FROM finance_transaction WHERE id=$1", [r.transaction])).rows[0].cancelled).toBe(true);
});

it("a club adds and archives its own fee, never the federation's", async () => {
  const own = (await clubAffiliationsExecute(db, presidentB, { ...fee("Assurance salle", "club"), frequency: "monthly" }, clubB)).id!;
  const view = await clubAffiliationsView(db, presidentB);
  expect(view.dues.map((d) => d.name).sort()).toEqual(["Affiliation BPCF", "Assurance salle"]);
  expect((await clubAffiliationsView(db, presidentA)).fees.map((f) => f.name)).not.toContain("Assurance salle");
  const federal = view.fees.find((f) => f.name === "Affiliation BPCF")!.id;
  await expect(clubAffiliationsExecute(db, presidentB, { action: "archiveFee", id: federal }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(clubAffiliationsExecute(db, presidentA, { action: "archiveFee", id: own }, clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await clubAffiliationsExecute(db, presidentB, { action: "archiveFee", id: own }, clubB);
  // A fixed deadline exists for yearly fees only.
  await expect(clubAffiliationsExecute(db, presidentB, { ...fee("Mensuel", "club"), frequency: "monthly", dueDays: null, dueMonth: 9, dueDay: 30 }, clubB)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it("tells the presidents once when a period opens, and reminds the clubs that are late", async () => {
  const sent = await affiliationTick(db);
  expect(sent).toBeGreaterThanOrEqual(3);
  expect(await affiliationTick(db)).toBe(0);
  const opened = (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='funding_task' AND recipient_user_id=$1", [presidentA.userId])).rows[0].n;
  expect(opened).toBe(2);
  // Club B is late on BPCF.
  await db.query(
    "UPDATE affiliation_due d SET opens_on=CURRENT_DATE-40,due_on=CURRENT_DATE-5 FROM affiliation_fee f WHERE f.id=d.fee_id AND f.name='Affiliation BPCF' AND d.organization_id=$1",
    [clubB],
  );
  const before = (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1", [presidentB.userId])).rows[0].n;
  const r = await federationAffiliationsExecute(db, fedPresident, { action: "remind", feeId: null }, fed);
  expect(r.clubs).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1", [presidentB.userId])).rows[0].n).toBe(before + 1);
  expect((await federationAffiliationsView(db, fedPresident)).dues.find((d) => d.club === "Club B")!.state).toBe("late");
});
