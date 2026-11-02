import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { bookingExecute, bookingMissing, bookingsTick, bookingsView } from "../../src/domains/venues/bookings";
import { bookingCommand } from "../../src/domains/venues/bookings-schema";

/**
 * 18: a weekly series that makes one booking for the season, its cost
 * recomputed after a new rate, the request then the follow-up task, a
 * session without a confirmed booking, a cancellation that asks to tell the
 * hall, an invoice recorded as one operation, the home hall without booking,
 * two clubs.
 */
const schema = "t18_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, hall: string, home: string, season: string, team: string;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const run = (p: Principal, body: Record<string, unknown>, org = clubA) => bookingExecute(db, p, bookingCommand.parse(body), org);
const tasks = async (kind: string) => (await db.query("SELECT title,status,detail,due_on::text AS due_on,amount_cents FROM task WHERE organization_id=$1 AND source_kind=$2 ORDER BY created_at", [clubA, kind])).rows;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,$3)", [org, person, name]);
  return p;
}
/** A weekly series of `n` sessions from `from` days on, Wednesdays or not, 18:00 to 20:00 Brussels. */
async function series(org: string, place: string, from: number, n: number, by: Principal) {
  const s = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,7,$2,$3) RETURNING id", [org, n, by.userId])).rows[0].id;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = day(from + i * 7);
    ids.push(
      (
        await db.query(
          `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility)
           VALUES($1,$2,$3,'Entraînement','training','Europe/Brussels',($4::date+time '18:00') AT TIME ZONE 'Europe/Brussels',($4::date+time '20:00') AT TIME ZONE 'Europe/Brussels',$4||'T18:00',$4||'T20:00',$5,$6,$7,'organization') RETURNING id`,
          [org, s, i + 1, d, team, place, by.userId],
        )
      ).rows[0].id,
    );
  }
  return ids;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president", "Présidente");
  presidentB = await actor(clubB, "club_president", "Président B");
  season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, season])).rows[0].id;
  const contact = (await db.query("INSERT INTO contact(organization_id,full_name,email,created_by) VALUES($1,'Marc Gestionnaire','salle@example.test',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  hall = (await db.query("INSERT INTO calendar_place(organization_id,name,address,category,contact_id) VALUES($1,'Hall des Sports','Rue du Hall 1, Namur','training',$2) RETURNING id", [clubA, contact])).rows[0].id;
  home = (await db.query("INSERT INTO calendar_place(organization_id,name,category,home,booking_needed) VALUES($1,'Notre salle','training',true,false) RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO venue_rate(organization_id,place_id,label,amount_cents,valid_from,created_by) VALUES($1,$2,'Heure de salle',5000,CURRENT_DATE-60,$3)", [clubA, hall, president.userId]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("groups two weekly series of the same hall into one booking for the season, none for the home hall", async () => {
  await series(clubA, hall, 40, 10, president);
  await series(clubA, hall, 42, 4, president);
  await series(clubA, home, 41, 5, president);
  await bookingsTick(db);
  await bookingsTick(db);
  const v = await bookingsView(db, president, "fr");
  expect(v.bookings).toHaveLength(1);
  expect(v.bookings[0]).toMatchObject({ place: "Hall des Sports", season: "Saison", status: "to_request", sessions: 14, planned_cost_cents: 14 * 5000, rate_label: "Heure de salle" });
  expect(v.bookings[0].slots[0]).toMatch(/^chaque .* de 18:00 à 20:00, du .* \(10 séances\)$/);
  expect(v.bookings[0].teams).toEqual([{ team: "Lions", sessions: 14, cents: 70000 }]);
});

it("recomputes the cost when the rate changes, from its date", async () => {
  await db.query("INSERT INTO venue_rate(organization_id,place_id,label,amount_cents,valid_from,created_by) VALUES($1,$2,'Heure de salle',6000,$3,$4)", [clubA, hall, day(60), president.userId]);
  const b = (await bookingsView(db, president, "fr")).bookings[0];
  // Sessions on day 40, 47, 54 (3) and 42, 49, 56 (3) before the new rate; 8 from day 60 on.
  expect(b.planned_cost_cents).toBe(6 * 5000 + 8 * 6000);
});

it("asks for the booking with the email ready, then follows up after ten days", async () => {
  let request = await tasks("venueRequest");
  expect(request).toHaveLength(1);
  expect(request[0].title).toBe("Demander la réservation : Hall des Sports");
  expect(request[0].detail).toContain("Bonjour Marc Gestionnaire,");
  expect(request[0].detail).toContain("Le club Club A souhaite réserver Hall des Sports pour la saison Saison");
  const id = (await bookingsView(db, president, "fr")).bookings[0].id;
  await run(president, { action: "status", id, status: "requested" });
  request = await tasks("venueRequest");
  expect(request[0].status).toBe("done");
  expect(await tasks("venueRemind")).toHaveLength(0);
  await db.query("UPDATE venue_booking SET requested_at=now()-interval '11 days' WHERE id=$1", [id]);
  await bookingsTick(db);
  await bookingsTick(db);
  expect((await tasks("venueRemind")).map((t) => t.title)).toEqual(["Relancer la salle : Hall des Sports"]);
});

it("flags a session without a confirmed booking; confirmed, the flag goes", async () => {
  const event = (await db.query("SELECT id FROM calendar_event WHERE organization_id=$1 AND place_id=$2 ORDER BY starts_at LIMIT 1", [clubA, hall])).rows[0].id;
  const homeEvent = (await db.query("SELECT id FROM calendar_event WHERE organization_id=$1 AND place_id=$2 LIMIT 1", [clubA, home])).rows[0].id;
  const c = await db.connect();
  try {
    expect(await bookingMissing(c, clubA, event, hall)).toBe(true);
    expect(await bookingMissing(c, clubA, homeEvent, home)).toBe(false);
    const id = (await bookingsView(db, president, "fr")).bookings[0].id;
    await run(president, { action: "status", id, status: "confirmed", reference: "RES-2026-118" });
    expect(await bookingMissing(c, clubA, event, hall)).toBe(false);
  } finally {
    c.release();
  }
  expect((await tasks("venueRemind"))[0].status).toBe("done");
});

it("asks to tell the hall when a session is cancelled or moved, once", async () => {
  const [first, second] = (await db.query("SELECT id FROM calendar_event WHERE organization_id=$1 AND place_id=$2 ORDER BY starts_at LIMIT 2", [clubA, hall])).rows.map((r) => r.id);
  await db.query("UPDATE calendar_event SET status='cancelled' WHERE id=$1", [first]);
  await db.query("UPDATE calendar_event SET starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour',local_start=replace(local_start,'T18:','T19:'),local_end=replace(local_end,'T20:','T21:') WHERE id=$1", [second]);
  await bookingsTick(db);
  await bookingsTick(db);
  const notify = await tasks("venueNotify");
  expect(notify).toHaveLength(2);
  expect(notify.map((t) => t.detail).join("\n")).toContain("est annulée");
  expect(notify.map((t) => t.detail).join("\n")).toMatch(/est déplacée au .* à 19:00/);
});

it("records an invoice's expense once, linked, with its file as receipt", async () => {
  const b = (await bookingsView(db, president, "fr")).bookings[0];
  const period = b.periods[0].period;
  const inv = (await run(president, { action: "invoice", bookingId: b.id, period, amountCents: 15500, issuedOn: day(1) })) as { id: string };
  await db.query("UPDATE venue_invoice SET filename='facture.pdf',media_type='application/pdf',content=$2 WHERE id=$1", [inv.id, Buffer.from("%PDF-1.4 test")]);
  const view = (await bookingsView(db, president, "fr")).bookings[0];
  expect(view.invoices[0].gap).not.toBeNull();
  const tx = (await run(president, { action: "expense", invoiceId: inv.id, occurredOn: day(1), label: "Hall des Sports" })) as { id: string };
  await expect(run(president, { action: "expense", invoiceId: inv.id, occurredOn: day(1), label: "Hall des Sports" })).rejects.toMatchObject({ code: "ALREADY_RECORDED" });
  const line = (await db.query("SELECT category,amount_cents,team_id FROM finance_transaction WHERE id=$1", [tx.id])).rows[0];
  expect(line).toEqual({ category: "venue", amount_cents: 15500, team_id: team });
  expect(Number((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1", [clubA])).rows[0].n)).toBe(1);
  expect((await db.query("SELECT filename FROM finance_receipt WHERE transaction_id=$1", [tx.id])).rows).toEqual([{ filename: "facture.pdf" }]);
  expect((await bookingsView(db, president, "fr")).bookings[0].paid_cents).toBe(15500);
  // A recorded invoice cannot be removed.
  await expect(run(president, { action: "removeInvoice", id: inv.id })).rejects.toMatchObject({ code: "ALREADY_RECORDED" });
});

it("keeps two clubs apart", async () => {
  const b = (await bookingsView(db, president, "fr")).bookings[0];
  expect((await bookingsView(db, presidentB, "fr")).bookings).toEqual([]);
  await expect(run(presidentB, { action: "status", id: b.id, status: "cancelled" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "invoice", bookingId: b.id, period: "x", amountCents: 1, issuedOn: day(0) }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const inv = (await db.query("SELECT id FROM venue_invoice WHERE booking_id=$1", [b.id])).rows[0].id;
  await expect(run(presidentB, { action: "expense", invoiceId: inv, occurredOn: day(0), label: "Vol" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
