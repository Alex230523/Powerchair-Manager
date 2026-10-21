import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { fundingExecute } from "../../src/domains/funding/service";
import { notificationExecute, notificationView } from "../../src/domains/notifications/service";
import { allowed } from "../../src/domains/notifications/eligibility";
import { digestData, digestTick, digestUnsubscribe, digestUnsubscribeInfo } from "../../src/domains/digest/service";
import { brusselsClock } from "../../src/domains/digest/schema";

/** Wave 15 (C7): the weekly digest under each person's rights, once a week, never empty, one club at a time. */
const schema = "w15dg_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, coachProfile: string, presidentMandate: string, coachMandate: string;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// Noon in Brussels, today: the tick sees the right day and a reached time.
const noon = () => new Date(brusselsClock(new Date()).date + "T10:00:00Z");

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id as string;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person, mandateId };
}
const partner = (name: string) => ({
  action: "partner" as const,
  name,
  kind: "sponsor" as const,
  status: "active" as const,
  amountCents: 100000,
  inKind: "",
  counterpart: "",
  startsOn: null,
  endsOn: null,
  nextActionOn: null,
  nextAction: "",
  contactId: null,
  notes: "",
});
const digestMails = async (userId: string) =>
  (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE kind='weekly_digest' AND recipient_user_id=$1", [userId])).rows[0].n as number;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  await db.query("UPDATE organization SET digest_day=$1", [brusselsClock(noon()).day]);
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [clubA]);
  const a = await actor(clubA, "club_president");
  president = a.p;
  presidentMandate = a.mandateId;
  presidentB = (await actor(clubB, "club_president")).p;
  const c = await actor(clubA, "coach");
  coach = c.p;
  coachMandate = c.mandateId;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Sam Coach','1990-01-01','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
  await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,p.id,'Zoé Secrète','2010-01-01' FROM p", [clubA]);
  // A sponsor condition for the coach and one without anyone in charge, both due within 7 days.
  const { id } = await fundingExecute(db, president, partner("Garage Dupont"), clubA);
  await fundingExecute(db, president, { action: "task", partnerId: id, title: "Logo sur le maillot", detail: "", dueOn: day(3), responsibleId: coachProfile }, clubA);
  await fundingExecute(db, president, { action: "task", partnerId: id, title: "Photo d'équipe", detail: "", dueOn: day(5), responsibleId: null }, clubA);
  // An event of the whole club in two days, and money in the ledger.
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  await db.query(
    `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility)
     VALUES($1,$2,1,'Fête du club','association','Europe/Brussels',now()+interval '2 days',now()+interval '2 days 2 hours','2026-01-01T18:00','2026-01-01T20:00',$3,'organization')`,
    [clubA, series, president.userId],
  );
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE-3,'Cotisations','in','dues',40000,$2)", [clubA, president.userId]);
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

it("fills each digest under the person's own rights", async () => {
  const c = await db.connect();
  try {
    const p = (await digestData(c, presidentMandate))!.data;
    expect(p.club).toBe("Club A");
    expect(p.events.map((e) => e.title)).toEqual(["Fête du club"]);
    expect(p.tasks.map((t) => [t.title, t.responsible])).toEqual([
      ["Garage Dupont · Logo sur le maillot", "Sam Coach"],
      ["Garage Dupont · Photo d'équipe", null],
    ]);
    expect(p.treasury).toBe(40000);
    // The coach: his own task only, no money, no club-wide registrations or documents.
    const k = (await digestData(c, coachMandate))!.data;
    expect(k.tasks.map((t) => t.title)).toEqual(["Garage Dupont · Logo sur le maillot"]);
    expect([k.treasury, k.dues, k.registrations]).toEqual([null, null, null]);
    expect(k.events.map((e) => e.title)).toEqual(["Fête du club"]);
    // Nothing from another club, and no player's name.
    expect(JSON.stringify(p) + JSON.stringify(k)).not.toContain("Zoé");
  } finally {
    c.release();
  }
});

it("sends once a week to those who have it on, and nothing for an empty week", async () => {
  // Default: on for presidents, off for coaches.
  expect(await digestTick(db, noon())).toBe(1);
  expect(await digestTick(db, noon())).toBe(0);
  expect(await digestMails(president.userId)).toBe(1);
  expect(await digestMails(coach.userId)).toBe(0);
  // Club B has nothing to say: its week is recorded, no mail leaves.
  expect(await digestMails(presidentB.userId)).toBe(0);
  expect((await db.query("SELECT items FROM digest_send WHERE user_id=$1", [presidentB.userId])).rows).toEqual([{ items: 0 }]);
  // The coach turns it on, with only the tasks: one digest, then no more this week.
  await notificationExecute(db, coach, { action: "digest", enabled: true, day: null, minute: 360, sections: ["tasks"] }, clubA);
  expect(await digestTick(db, noon())).toBe(1);
  expect(await digestTick(db, noon())).toBe(0);
  expect(await digestMails(coach.userId)).toBe(1);
  const job = (await db.query("SELECT organization_id,recipient_user_id,resource_type,resource_id,kind,category FROM mail_job WHERE kind='weekly_digest' AND recipient_user_id=$1", [coach.userId])).rows[0];
  expect(job.category).toBe("digest");
  expect(await allowed(db, job)).toBe(true);
  // A revoked mandate stops a digest still in the queue.
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1", [coachMandate]);
  expect(await allowed(db, job)).toBe(false);
  await db.query("UPDATE role_assignment SET revoked_at=NULL WHERE id=$1", [coachMandate]);
});

it("does not send before the chosen time nor on another day", async () => {
  await db.query("DELETE FROM digest_send WHERE user_id=$1", [president.userId]);
  const clock = brusselsClock(noon());
  await notificationExecute(db, president, { action: "digest", enabled: true, day: (clock.day % 7) + 1, minute: null, sections: ["events"] }, clubA);
  expect(await digestTick(db, noon())).toBe(0);
  await notificationExecute(db, president, { action: "digest", enabled: true, day: null, minute: 1200, sections: ["events"] }, clubA);
  expect(await digestTick(db, noon())).toBe(0);
  const settings = (await notificationView(db, president)).digest!;
  expect(settings).toMatchObject({ enabled: true, day: null, minute: 1200, sections: ["events"], canClub: true });
  expect(settings.next?.date).toBe(clock.date);
});

it("lets the president set the club's moment, not the coach", async () => {
  await notificationExecute(db, president, { action: "digestClub", day: 1, minute: 480 }, clubA);
  expect((await db.query("SELECT digest_day,digest_minute FROM organization WHERE id=$1", [clubA])).rows[0]).toEqual({ digest_day: 1, digest_minute: 480 });
  await expect(notificationExecute(db, coach, { action: "digestClub", day: 2, minute: 480 }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await notificationView(db, coach)).digest).toMatchObject({ canClub: false, club: { day: 1, minute: 480 } });
  await expect(notificationExecute(db, coach, { action: "digest", enabled: true, day: null, minute: null, sections: [] }, clubA)).rejects.toMatchObject({ code: "DIGEST_SECTIONS" });
});

it("sends a preview at once, which never blocks the week's digest", async () => {
  const before = await digestMails(president.userId);
  expect(await notificationExecute(db, president, { action: "digestPreview" }, clubA)).toMatchObject({ sent: true });
  // A second click within the minute sends nothing more.
  await notificationExecute(db, president, { action: "digestPreview" }, clubA);
  expect(await digestMails(president.userId)).toBe(before + 1);
  expect((await db.query("SELECT count(*)::int AS n FROM digest_send WHERE user_id=$1 AND preview", [president.userId])).rows[0].n).toBe(1);
});

it("stops with the link at the bottom of the email", async () => {
  const send = (await db.query("SELECT id FROM digest_send WHERE user_id=$1 AND NOT preview", [coach.userId])).rows[0].id;
  expect(await digestUnsubscribeInfo(db, send)).toEqual({ club: "Club A", unsubscribed: false });
  await digestUnsubscribe(db, send, true);
  expect(await digestUnsubscribeInfo(db, send)).toEqual({ club: "Club A", unsubscribed: true });
  expect((await notificationView(db, coach)).digest?.enabled).toBe(false);
  expect(await digestUnsubscribeInfo(db, randomUUID())).toBeNull();
});
