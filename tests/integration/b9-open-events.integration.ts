import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { openEventCommand, openEventExport, openEventsExecute, openEventsView, openEventTick, publicCommand, publicEvent, publicExecute } from "../../src/domains/open-events/service";
import { bankCommand } from "../../src/domains/bank/schema";
import { bankExecute } from "../../src/domains/bank/service";
import { formatReference } from "../../src/domains/bank/reference";

/**
 * B9: open events. A full event and a withdrawal that promotes the waiting
 * list (then an offer not confirmed in time that goes to nobody); a
 * registration outside the window refused; a paid registration marked paid
 * by the bank reconciliation; a participant without the image consent;
 * check-in by code; reminders, the survey and its results; a cancellation
 * that tells everyone; the to-do; two clubs apart.
 */
const schema = "b9open_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, event: string, open: string, token: string;
const links: Record<string, string> = {};

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => openEventsExecute(db, p, openEventCommand.parse(cmd), org) as Promise<Record<string, unknown>>;
const pub = (cmd: Record<string, unknown>) => publicExecute(db, token, publicCommand.parse(cmd)) as Promise<{ status: string; registration?: string }>;
const register = async (name: string, extra: Record<string, unknown> = {}) => {
  const r = await pub({ action: "register", fullName: name, email: `${name.normalize("NFD").replace(/[^A-Za-z ]/g, "").toLowerCase().replace(/\s+/g, ".")}@example.test`, consentData: true, answers: { q1: true }, ...extra });
  links[name] = r.registration!;
  return r;
};
const statusOf = async (name: string) => (await db.query("SELECT status FROM open_registration WHERE full_name=$1", [name])).rows[0].status as string;
const mails = async (name: string) => (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_type='open_event' AND resource_id=(SELECT id::text FROM open_registration WHERE full_name=$1)", [name])).rows[0].n as number;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president", "Présidente");
  presidentB = await actor(clubB, "club_president", "Président B");
  await db.query("INSERT INTO bank_account(organization_id,label,iban,bic,holder,for_dues,created_by) VALUES($1,'Compte','BE68539007547034','GKCCBEBB','Club A',true,$2)", [clubA, president.userId]);
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  event = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility) VALUES($1,$2,1,'Journée découverte','custom','Europe/Brussels',now()+interval '10 days',now()+interval '10 days 4 hours','2026-11-11T10:00','2026-11-11T14:00',$3,'organization') RETURNING id",
      [clubA, series, president.userId],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("opens a calendar event to the public, with its task in the to-do", async () => {
  const r = await run(president, {
    action: "open",
    eventId: event,
    capacity: 2,
    opensAt: new Date(Date.now() - 3600000).toISOString(),
    closesAt: new Date(Date.now() + 9 * 86400000).toISOString(),
    feeCents: 1500,
    confirmHours: 24,
    questions: [{ id: "q1", label: "Avez-vous déjà joué ?", kind: "yesno", required: true }],
    surveyQuestions: [{ id: "q1", label: "Qu'avez-vous préféré", kind: "text", required: false }],
  });
  open = r.id as string;
  token = (await db.query("SELECT token FROM open_event WHERE id=$1", [open])).rows[0].token;
  expect((await db.query("SELECT category,title FROM funding_task WHERE event_id=$1", [event])).rows[0]).toEqual({ category: "events", title: "Organiser : Journée découverte" });
  await expect(run(president, { action: "open", eventId: event, capacity: null, opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 86400000).toISOString() })).rejects.toMatchObject({ code: "ALREADY_OPEN" });
  const v = await publicEvent(db, token);
  expect(v).toMatchObject({ club: "Club A", title: "Journée découverte", window: "open", left: 2, fee_cents: 1500, registration: null });
});

it("fills up, puts the next on the waiting list, and promotes it when someone withdraws", async () => {
  expect((await register("Ana Peeters", { consentImage: true, needs: { wheelchair: true, helper: true, transport: false, diet: "sans gluten" } })).status).toBe("confirmed");
  expect((await register("Bilal Haddad")).status).toBe("confirmed");
  expect((await register("Chloé Martin")).status).toBe("waiting");
  await expect(register("Ana Peeters")).rejects.toMatchObject({ code: "ALREADY_REGISTERED" });
  await expect(pub({ action: "register", fullName: "Sans Réponse", email: "x@example.test", consentData: true })).rejects.toMatchObject({ code: "ANSWER_REQUIRED" });
  expect(await mails("Ana Peeters")).toBe(1);
  expect(await mails("Chloé Martin")).toBe(1);
  // Bilal withdraws: Chloé is offered his place, for 24 hours.
  expect((await pub({ action: "withdraw", registration: links["Bilal Haddad"] })).status).toBe("cancelled");
  expect(await statusOf("Chloé Martin")).toBe("offered");
  expect(await mails("Chloé Martin")).toBe(2);
  const mine = await publicEvent(db, token, links["Chloé Martin"]);
  expect(mine.registration).toMatchObject({ full_name: "Chloé Martin", status: "offered" });
  expect((await pub({ action: "confirm", registration: links["Chloé Martin"] })).status).toBe("confirmed");
  // A newcomer while full waits; the next withdrawal offers her the place; she does not confirm in time: nobody else waits.
  expect((await register("Dina Lee")).status).toBe("waiting");
  await pub({ action: "withdraw", registration: links["Chloé Martin"] });
  expect(await statusOf("Dina Lee")).toBe("offered");
  await db.query("UPDATE open_registration SET offered_until=now()-interval '1 minute' WHERE full_name='Dina Lee'");
  await expect(pub({ action: "confirm", registration: links["Dina Lee"] })).rejects.toMatchObject({ code: "OFFER_EXPIRED" });
  await openEventTick(db);
  expect(await statusOf("Dina Lee")).toBe("cancelled");
});

it("refuses a registration outside its window", async () => {
  await db.query("UPDATE open_event SET opens_at=now()+interval '1 day' WHERE id=$1", [open]);
  await expect(register("Trop Tôt")).rejects.toMatchObject({ code: "WINDOW_CLOSED" });
  expect((await publicEvent(db, token)).window).toBe("before");
  await db.query("UPDATE open_event SET opens_at=now()-interval '2 days',closes_at=now()-interval '1 day' WHERE id=$1", [open]);
  await expect(register("Trop Tard")).rejects.toMatchObject({ code: "WINDOW_CLOSED" });
  await db.query("UPDATE open_event SET closes_at=now()+interval '9 days' WHERE id=$1", [open]);
});

it("marks a paid registration paid by the bank reconciliation, and keeps the image consent apart", async () => {
  const ana = (await db.query("SELECT payment_reference,consent_image,needs FROM open_registration WHERE full_name='Ana Peeters'")).rows[0];
  expect(ana.consent_image).toBe(true);
  expect(ana.needs).toEqual({ wheelchair: true, helper: true, transport: false, diet: "sans gluten" });
  expect((await publicEvent(db, token, links["Ana Peeters"])).registration?.payment).toMatchObject({ cents: 1500, reference: ana.payment_reference, paid: false, account: { iban: "BE68539007547034" } });
  const r = await bankExecute(
    db,
    president,
    bankCommand.parse({ action: "import", format: "csv", lines: [{ bookedOn: new Date().toISOString().slice(0, 10), amountCents: 1500, counterparty: "A. Peeters", communication: formatReference(ana.payment_reference) }] }),
    clubA,
  );
  expect(r).toMatchObject({ created: 1, matched: 1 });
  expect((await db.query("SELECT paid_cents FROM open_registration WHERE full_name='Ana Peeters'")).rows[0].paid_cents).toBe(1500);
  expect((await publicEvent(db, token, links["Ana Peeters"])).registration?.payment?.paid).toBe(true);
  expect((await db.query("SELECT category FROM finance_transaction WHERE organization_id=$1", [clubA])).rows[0].category).toBe("event");
  // A participant without the image consent: written as such in the export.
  expect((await register("Eli Novak", { consentImage: false })).status).toBe("confirmed");
  const detail = (await openEventsView(db, president, open)).detail!;
  expect((detail.registrations as { full_name: string; consent_image: boolean }[]).find((x) => x.full_name === "Eli Novak")?.consent_image).toBe(false);
  expect(Buffer.from(await openEventExport(db, president, open)).subarray(0, 2).toString()).toBe("PK");
  // The same reference in another club's statement pays nothing there.
  const other = await bankExecute(db, presidentB, bankCommand.parse({ action: "import", format: "csv", lines: [{ bookedOn: new Date().toISOString().slice(0, 10), amountCents: 1500, communication: formatReference(ana.payment_reference), bankRef: "x" }] }), clubB);
  expect(other).toMatchObject({ matched: 0 });
});

it("checks in by the QR code, reminds, asks the opinion and adds the results up", async () => {
  const code = (await db.query("SELECT checkin_code FROM open_registration WHERE full_name='Ana Peeters'")).rows[0].checkin_code;
  expect((await publicEvent(db, token, links["Ana Peeters"])).registration?.checkin).toContain(code);
  expect(await run(president, { action: "checkin", code })).toMatchObject({ name: "Ana Peeters", already: false });
  expect(await run(president, { action: "checkin", code })).toMatchObject({ already: true });
  await expect(run(presidentB, { action: "checkin", code }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Seven days before: one reminder each.
  await db.query("UPDATE calendar_event SET starts_at=now()+interval '6 days 12 hours',ends_at=now()+interval '6 days 16 hours' WHERE id=$1", [event]);
  await openEventTick(db);
  expect((await db.query("SELECT count(*)::int AS n FROM open_registration WHERE open_event_id=$1 AND reminded_7", [open])).rows[0].n).toBe(2);
  // After the event: the survey, then the opinions.
  await db.query("UPDATE calendar_event SET starts_at=now()-interval '5 hours',ends_at=now()-interval '1 hour' WHERE id=$1", [event]);
  await openEventTick(db);
  expect((await db.query("SELECT count(*)::int AS n FROM open_registration WHERE open_event_id=$1 AND survey_sent", [open])).rows[0].n).toBe(2);
  expect((await publicEvent(db, token, links["Ana Peeters"])).registration?.survey).toBe(true);
  await pub({ action: "feedback", registration: links["Ana Peeters"], rating: 5, answers: { q1: "Le match" } });
  await pub({ action: "feedback", registration: links["Ana Peeters"], rating: 1 });
  await pub({ action: "feedback", registration: links["Eli Novak"], rating: 4 });
  await expect(pub({ action: "feedback", registration: links["Dina Lee"], rating: 3 })).rejects.toMatchObject({ code: "SURVEY_CLOSED" });
  const o = (await openEventsView(db, president, open)).detail!.opinions;
  expect(o).toEqual({ count: 2, average: 4.5, answers: [{ question: "Qu'avez-vous préféré", values: ["Le match"] }] });
  await expect(pub({ action: "withdraw", registration: links["Eli Novak"] })).rejects.toMatchObject({ code: "WINDOW_CLOSED" });
});

it("tells everyone when the event is cancelled, and keeps two clubs apart", async () => {
  await expect(openEventsView(db, presidentB, open)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "cancelEvent", id: open }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await openEventsView(db, presidentB)).events).toEqual([]);
  const before = (await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_type='open_event'")).rows[0].n;
  await run(president, { action: "cancelEvent", id: open, reason: "Salle indisponible" });
  // Ana and Eli (still registered) are told; the people who withdrew are not.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE resource_type='open_event'")).rows[0].n).toBe(before + 2);
  expect((await publicEvent(db, token)).status).toBe("cancelled");
  await expect(register("Après Annulation")).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
});
