import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { financeExecute, financeView } from "../../src/domains/finance/service";
import { allocationsExecute, allocationsTick, allocationsView } from "../../src/domains/finance/allocations";
import { attestationFile, attestationSend, attestationSettings, attestationSettingsExecute, attestationTick } from "../../src/domains/dues/attestation-send";
import { fundraisingExecute, fundraisingCommand } from "../../src/domains/fundraising/service";
import { fundingCommand } from "../../src/domains/funding/schema";
import { fundingExecute } from "../../src/domains/funding/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * 9: a grant allocated and partly spent, the available cash, granted but not
 * received apart, the deadline alert once; the attestation PDF with logo,
 * company number and signature, sent once when paid in full, then resent,
 * the signature hidden from a coach; a fundraising task for two players; the
 * yearly reminder back next year; two clubs.
 */
const schema = "money9_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let playerP: Principal, clubA: string, clubB: string, president: Principal, coach: Principal, presidentB: Principal, season: string, player: string, playerUser: string, grant: string;
async function actor(org: string, role: string, name: string, birth: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, person, name, birth, role === "player" ? "{player}" : role === "coach" ? "{coach}" : "{}"])).rows[0].id as string;
  return { p, profile };
}
/** A tiny PNG: 2×2 pixels, RGBA, half transparent. */
function png() {
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "latin1"), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.from([0, 10, 20, 30, 255, 40, 50, 60, 128, 0, 70, 80, 90, 0, 100, 110, 120, 255]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const pay = (amount: number, label: string, direction: "in" | "out", extra: Record<string, unknown> = {}) =>
  financeExecute(db, president, { action: "record", occurredOn: brusselsDay(), label, direction, category: direction === "in" ? "subsidy" : "equipment", amountCents: amount, method: "transfer", counterparty: "", reference: "", notes: "", ...extra } as never, clubA);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind,address,company_number,signatory) VALUES('Club A','club','Rue du Stade 1, 4000 Liège','0123.456.789','Alex Martin') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  coach = (await actor(clubA, "coach", "Coach")).p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const pl = await actor(clubA, "player", "Léa Adulte", "1990-05-01");
  player = pl.profile;
  playerP = pl.p;
  playerUser = pl.p.userId;
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  grant = (await db.query("INSERT INTO grant_application(organization_id,funder,status,granted_cents,created_by) VALUES($1,'Province','granted',300000,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  await db.query("INSERT INTO organization_logo(organization_id,media_type,content,updated_by) VALUES($1,'image/png',$2,$3)", [clubA, png(), president.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps a grant's allocation reserved until spent, and says what is available and what is still to receive", async () => {
  const useBy = brusselsDay(new Date(Date.now() + 45 * 86400000));
  const { id } = await allocationsExecute(db, president, { action: "create", sourceKind: "grant", grantId: grant, purpose: "equipment", label: "2 fauteuils Strike Force", amountCents: 300000, useBy }, clubA);
  await pay(200000, "Subside reçu", "in", { allocationId: id });
  await pay(50000, "Loyer", "out", { category: "venue" });
  const spent = (await pay(80000, "Fauteuil 1", "out")) as { id: string };
  await allocationsExecute(db, president, { action: "link", transactionId: spent.id, allocationId: id }, clubA);
  const a = (await allocationsView(db, president)).allocations.find((x) => x.id === id)!;
  expect(a.state).toEqual({ received: 200000, spent: 80000, remaining: 120000, toReceive: 100000 });
  const v = await financeView(db, president);
  // Total 200000 − 50000 − 80000 = 70000; reserved 120000; available −50000.
  expect(v.treasury).toEqual({ total: 70000, reserved: 120000, available: -50000 });
  // The alert at 60 days, once.
  expect(await allocationsTick(db)).toBe(1);
  expect(await allocationsTick(db)).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM task WHERE organization_id=$1 AND source_kind='allocationDeadline'", [clubA])).rows[0].n).toBe(1);
  // Another club sees nothing and cannot attach its operation.
  expect((await allocationsView(db, presidentB)).allocations).toHaveLength(0);
  await expect(allocationsExecute(db, presidentB, { action: "close", id, closed: true }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(allocationsView(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("makes the attestation PDF with logo, company number and signature, sends it once when paid in full, then on demand", async () => {
  const sig = "data:image/png;base64," + png().toString("base64");
  await attestationSettingsExecute(db, president, { action: "signature", png: sig }, clubA);
  await attestationSettingsExecute(db, president, { action: "signatory", signatory: "Alex Martin", signatoryRole: "Présidente" }, clubA);
  await attestationSettingsExecute(db, president, { action: "auto", on: true }, clubA);
  // The coach never sees the signature.
  await expect(attestationSettings(db, coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(attestationSettingsExecute(db, coach, { action: "signature", png: null }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const plan = (await db.query("INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due) VALUES($1,$2,'Joueur',20000,1,CURRENT_DATE) RETURNING id", [clubA, season])).rows[0].id;
  const fee = (
    await db.query("INSERT INTO dues_receivable(organization_id,plan_id,season_id,profile_id,category,plan_snapshot,gross_cents,discount_cents,created_by) VALUES($1,$2,$3,$4,'Joueur','{}',20000,0,$5) RETURNING id", [clubA, plan, season, player, president.userId])
  ).rows[0].id;
  await financeExecute(db, president, { action: "record", occurredOn: brusselsDay(), label: "Cotisation 1", direction: "in", category: "dues", amountCents: 10000, method: "transfer", counterparty: "", reference: "", notes: "", receivableId: fee } as never, clubA);
  // Half paid: nothing leaves, and no PDF.
  expect(await attestationTick(db)).toBe(0);
  await expect(attestationFile(db, president, player, season, "fr")).rejects.toMatchObject({ code: "NOT_PAID" });
  await financeExecute(db, president, { action: "record", occurredOn: brusselsDay(), label: "Cotisation 2", direction: "in", category: "dues", amountCents: 10000, method: "transfer", counterparty: "", reference: "", notes: "", receivableId: fee } as never, clubA);
  expect(await attestationTick(db)).toBe(1);
  expect(await attestationTick(db)).toBe(0);
  const pdf = await attestationFile(db, president, player, season, "fr");
  const text = Buffer.from(pdf.bytes).toString("latin1");
  expect(text.startsWith("%PDF")).toBe(true);
  expect(text.match(/\/Subtype \/Image/g)?.length).toBeGreaterThanOrEqual(2);
  expect(text).toContain("/SMask");
  expect(text).toContain("BCE 0123.456.789");
  expect(text).toContain("Alex Martin");
  expect(pdf.number).toMatch(/^\d{4}-0001$/);
  // The player downloads his own; another club does not.
  await expect(attestationFile(db, presidentB, player, season, "fr")).rejects.toBeTruthy();
  // « Renvoyer »: a second sending, kept in the log.
  expect(await attestationSend(db, president, player, season, clubA)).toEqual({ sent: 1 });
  expect((await db.query("SELECT kind,recipient_user_id FROM dues_attestation_send ORDER BY sent_at")).rows).toEqual([
    { kind: "auto", recipient_user_id: playerUser },
    { kind: "manual", recipient_user_id: playerUser },
  ]);
  await expect(attestationSend(db, coach, player, season, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("gives a fundraising task to two players, with goals per person", async () => {
  const group = (await db.query("INSERT INTO fundraising_group(organization_id,name,created_by) VALUES($1,'Actions',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  const pot = (await fundraisingExecute(db, president, fundraisingCommand.parse({ action: "pot", groupId: group, name: "Gaufres", description: "", goalCents: 50000, deadline: null, status: "open", linkUrl: "https://example.org/don" }), clubA)) as { id: string };
  const second = await actor(clubA, "player", "Noé Joueur", "2000-01-01");
  const r = (await fundraisingExecute(db, president, fundraisingCommand.parse({ action: "tasks", potId: pot.id, title: "Vendre des gaufres", dueOn: null, profileIds: [player, second.profile] }), clubA)) as { id: string; assigned: number };
  expect(r.assigned).toBe(2);
  expect((await db.query("SELECT category,pot_id FROM task WHERE id=$1", [r.id])).rows[0]).toEqual({ category: "fundraising", pot_id: pot.id });
  expect((await db.query("SELECT count(*)::int AS n FROM task_assignee WHERE task_id=$1", [r.id])).rows[0].n).toBe(2);
  await fundraisingExecute(db, president, fundraisingCommand.parse({ action: "goal", potId: pot.id, profileId: player, target: 20, unit: "boîtes" }), clubA);
  // The player notes his own progress; not another's.
  await fundraisingExecute(db, playerP, fundraisingCommand.parse({ action: "progress", potId: pot.id, profileId: player, done: 5 }), clubA);
  expect((await db.query("SELECT done FROM fundraising_goal WHERE pot_id=$1 AND profile_id=$2", [pot.id, player])).rows[0].done).toBe(5);
  await expect(fundraisingExecute(db, playerP, fundraisingCommand.parse({ action: "progress", potId: pot.id, profileId: second.profile, done: 9 }), clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Another club's people cannot be given the task.
  const other = await actor(clubB, "player", "Autre", "2000-01-01");
  await expect(fundraisingExecute(db, president, fundraisingCommand.parse({ action: "tasks", potId: pot.id, title: "Vendre", dueOn: null, profileIds: [other.profile] }), clubA)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("brings the yearly reminder back next year, kept when the file closes", async () => {
  const { id } = (await fundingExecute(db, president, fundingCommand.parse({ action: "annualReminder", grantId: grant, title: "L'appel rouvre", dueOn: "2026-03-15" }), clubA)) as { id: string };
  await db.query("UPDATE grant_application SET status='closed' WHERE id=$1", [grant]);
  await fundingExecute(db, president, fundingCommand.parse({ action: "taskDone", id, done: true, doneOn: null }), clubA);
  const next = (await db.query("SELECT due_on::text,recurrence,source_kind,grant_id FROM task WHERE organization_id=$1 AND source_kind='annualReminder' AND status<>'done'", [clubA])).rows;
  expect(next).toEqual([{ due_on: "2027-03-15", recurrence: "yearly", source_kind: "annualReminder", grant_id: grant }]);
  await expect(fundingExecute(db, presidentB, fundingCommand.parse({ action: "annualReminder", grantId: grant, title: "Volé", dueOn: "2026-03-15" }), clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
