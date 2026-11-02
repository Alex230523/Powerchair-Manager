import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import type { Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { receiptMaxBytes, receiptType } from "../finance/schema";
import { ensureStorage } from "../storage/service";
import { bookingWords } from "./bookings-copy";
import { billingPeriods, bookingEmail, changeEmail, invoiceGap, plannedCost, sessionLabel, slotLines, type Billing, type BookingCommand, type Rate, type Session } from "./bookings-schema";

/**
 * 18: hall bookings worked out from the calendar. Every session planned in a
 * hall that must be booked joins the hall's booking for its season; the
 * booking carries its status, reference, confirmation, planned cost (at the
 * rate in force) and invoices. The to-do follows by itself: ask, follow up
 * after ten days, pay each invoice, tell the hall when a session changes;
 * each task closes when its step is passed.
 */
type Ctx = { c: PoolClient; org: string; userId: string; manage: boolean; money: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const president = a.role === "club_president";
    const manage = mfa && (president || rights.includes("calendar.manage"));
    const off = (a.disabled_modules ?? []) as string[];
    const money = mfa && (president || rights.includes("dues.manage")) && !off.includes("finance");
    if (!manage && !(mfa && rights.includes("calendar.read"))) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage, money });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}

type Linked = Session & { event_id: string; starts_at: Date; ends_at: Date; status: string; place_id: string | null; team_id: string | null; snap_starts: Date; snap_status: string; snap_local: string };
const iso = (d: Date | string) => new Date(d).toISOString();

/** The president's profile and account: who gets the hall's tasks, and his language. */
async function president(c: PoolClient, org: string) {
  return (
    (
      await c.query(
        `SELECT cp.id,r.user_id,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=r.user_id
           LEFT JOIN club_person cp ON cp.person_id=pe.id AND cp.organization_id=r.organization_id AND cp.status='active'
          WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) ORDER BY r.valid_from LIMIT 1`,
        [org],
      )
    ).rows[0] as { id: string | null; user_id: string; name: string; locale: Locale } | undefined
  );
}

async function task(
  c: PoolClient,
  org: string,
  v: { key: string; kind: string; title: string; about: string; detail: string; due: string; placeId: string; category: "admin" | "events"; who: { id: string | null; user_id: string } | undefined; createdBy: string },
) {
  await c.query(
    `INSERT INTO task(organization_id,kind,category,title,detail,due_on,responsible_id,origin,created_by,source_key,source_kind,source_params,place_id)
     VALUES($1,'other',$2,$3,$4,$5,$6,'template',$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
    [org, v.category, v.title.slice(0, 200), v.detail.slice(0, 2000), v.due, v.who?.id ?? null, v.createdBy, v.key, v.kind, JSON.stringify({ about: v.about }), v.placeId],
  );
}
/** A step passed closes its task by itself. */
const close = (c: PoolClient, org: string, keys: string[]) =>
  c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key=ANY($2::text[]) AND status<>'done'", [org, keys]);

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const plusDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/**
 * Brings the club's bookings up to date with its calendar: creates the
 * missing ones (one per hall and season), links the sessions, tells the
 * hall's task list what changed, recomputes the planned cost and keeps the
 * to-do in step. Safe to run again: nothing is created twice.
 */
export async function syncBookings(c: PoolClient, org: string) {
  const now = today();
  const boss = await president(c, org);
  if (!boss) return { created: 0, tasks: 0 };
  const locale = (["fr", "nl", "en"].includes(boss.locale) ? boss.locale : "fr") as Locale;
  const w = bookingWords[locale];
  const club = (await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0]?.name as string;
  // 1. The sessions in halls that must be booked, each with its season.
  const sessions = (
    await c.query(
      `SELECT e.id,e.place_id,e.local_start,e.local_end,e.status,
              (SELECT s.id FROM season s WHERE s.organization_id=e.organization_id AND left(e.local_start,10)::date BETWEEN s.starts_on AND s.ends_on ORDER BY s.archived,s.starts_on DESC LIMIT 1) AS season_id
         FROM calendar_event e JOIN calendar_place pl ON pl.id=e.place_id AND pl.organization_id=e.organization_id
        WHERE e.organization_id=$1 AND pl.booking_needed AND NOT pl.archived AND e.status='scheduled' AND e.ends_at>now()`,
      [org],
    )
  ).rows as { id: string; place_id: string; local_start: string; local_end: string; season_id: string | null }[];
  let created = 0;
  for (const key of new Set(sessions.map((s) => `${s.place_id}|${s.season_id ?? ""}`))) {
    const [place, season] = key.split("|");
    const label = (await c.query("SELECT label FROM venue_rate WHERE organization_id=$1 AND place_id=$2 AND valid_from<=CURRENT_DATE ORDER BY valid_from DESC,created_at DESC LIMIT 1", [org, place])).rows[0]?.label ?? null;
    const made = await c.query(
      `INSERT INTO venue_booking(organization_id,place_id,season_id,rate_label) VALUES($1,$2,$3,$4)
       ON CONFLICT (organization_id,place_id,COALESCE(season_id,'00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING RETURNING id`,
      [org, place, season || null, label],
    );
    created += made.rowCount ?? 0;
  }
  // 2. Each session joins its booking (once).
  for (const s of sessions)
    await c.query(
      `INSERT INTO venue_booking_event(booking_id,event_id,starts_at,ends_at,status)
       SELECT b.id,e.id,e.starts_at,e.ends_at,e.status FROM venue_booking b JOIN calendar_event e ON e.id=$2
        WHERE b.organization_id=$1 AND b.place_id=$3 AND b.season_id IS NOT DISTINCT FROM $4::uuid AND b.status<>'cancelled'
       ON CONFLICT DO NOTHING`,
      [org, s.id, s.place_id, s.season_id],
    );
  // 3. Each booking: what changed since last seen, its cost, its tasks.
  const bookings = (
    await c.query(
      `SELECT b.*,pl.name AS place,pl.booking_needed,s.name AS season,ct.full_name AS contact
         FROM venue_booking b JOIN calendar_place pl ON pl.id=b.place_id LEFT JOIN season s ON s.id=b.season_id LEFT JOIN contact ct ON ct.id=pl.contact_id AND ct.organization_id=b.organization_id
        WHERE b.organization_id=$1`,
      [org],
    )
  ).rows as { id: string; place_id: string; place: string; season: string | null; contact: string | null; status: string; billing: Billing; rate_label: string | null; requested_at: Date | null; booking_needed: boolean }[];
  let tasks = 0;
  for (const b of bookings) {
    const linked = (
      await c.query(
        `SELECT be.event_id,be.starts_at AS snap_starts,be.status AS snap_status,e.starts_at,e.ends_at,e.status,e.place_id,e.team_id,e.local_start,e.local_end,
                to_char(be.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS snap_local
           FROM venue_booking_event be JOIN calendar_event e ON e.id=be.event_id WHERE be.booking_id=$1`,
        [b.id],
      )
    ).rows as Linked[];
    const rates = (await c.query("SELECT label,amount_cents,valid_from::text AS valid_from FROM venue_rate WHERE organization_id=$1 AND place_id=$2", [org, b.place_id])).rows as Rate[];
    const told = b.status === "requested" || b.status === "confirmed";
    for (const l of linked) {
      const cancelled = l.status === "cancelled" && l.snap_status !== "cancelled";
      const moved = l.status === "scheduled" && iso(l.starts_at) !== iso(l.snap_starts);
      const left = l.place_id !== b.place_id;
      if (!cancelled && !moved && !left) continue;
      // 4. The hall knew of this session: « Prévenir la salle », with the email ready.
      if (told && new Date(l.snap_starts) > new Date()) {
        const before = sessionLabel(locale, l.snap_local);
        const after = moved && !left ? sessionLabel(locale, l.local_start) : null;
        const mail = changeEmail(locale, { club, place: b.place, contact: b.contact, before, after, sender: boss.name });
        const about = `${b.place}, ${l.snap_local.slice(0, 10)}`;
        await task(c, org, {
          key: `venue:${b.id}:notify:${l.event_id}:${iso(l.starts_at)}:${l.status}:${l.place_id ?? ""}`,
          kind: "venueNotify",
          title: w.notify.replace("{place}", b.place).replace("{when}", l.snap_local.slice(0, 10)),
          about,
          detail: `${mail.subject}\n\n${mail.body}`,
          due: now,
          placeId: b.place_id,
          category: "events",
          who: boss,
          createdBy: boss.user_id,
        });
        tasks++;
      }
      if (left) await c.query("DELETE FROM venue_booking_event WHERE booking_id=$1 AND event_id=$2", [b.id, l.event_id]);
      else await c.query("UPDATE venue_booking_event SET starts_at=$3,ends_at=$4,status=$5 WHERE booking_id=$1 AND event_id=$2", [b.id, l.event_id, l.starts_at, l.ends_at, l.status]);
    }
    const live = linked.filter((l) => l.status === "scheduled" && l.place_id === b.place_id);
    await c.query("UPDATE venue_booking SET planned_cost_cents=$2 WHERE id=$1 AND planned_cost_cents<>$2", [b.id, plannedCost(live, rates, b.rate_label)]);
    const future = live.filter((l) => new Date(l.ends_at) > new Date());
    const first = future.map((l) => l.local_start.slice(0, 10)).sort()[0];
    const params = { place: b.place };
    // 3. Ask (a month before the first session at the latest), with the email ready.
    if (b.status === "to_request" && first && b.booking_needed) {
      const mail = bookingEmail(locale, { club, place: b.place, contact: b.contact, season: b.season, slots: slotLines(locale, future), sender: boss.name });
      const due = plusDays(first, -30) < now ? now : plusDays(first, -30);
      await task(c, org, { key: `venue:${b.id}:request`, kind: "venueRequest", title: w.request.replace("{place}", params.place), about: b.place, detail: `${mail.subject}\n\n${mail.body}`, due, placeId: b.place_id, category: "admin", who: boss, createdBy: boss.user_id });
      tasks++;
    }
    if (b.status !== "to_request") await close(c, org, [`venue:${b.id}:request`]);
    // Ten days without an answer: follow up.
    if (b.status === "requested" && b.requested_at && new Date(b.requested_at).getTime() <= Date.now() - 10 * 86400000) {
      await task(c, org, { key: `venue:${b.id}:remind`, kind: "venueRemind", title: w.remind.replace("{place}", b.place), about: b.place, detail: "", due: now, placeId: b.place_id, category: "admin", who: boss, createdBy: boss.user_id });
      tasks++;
    }
    if (b.status !== "requested") await close(c, org, [`venue:${b.id}:remind`]);
    // Pay each invoice expected (two weeks ahead); paid, its task closes.
    if (b.status === "confirmed") {
      const paid = new Set(
        (await c.query("SELECT period FROM venue_invoice WHERE booking_id=$1 AND transaction_id IS NOT NULL", [b.id])).rows.map((r) => r.period as string),
      );
      for (const p of billingPeriods(
        linked.filter((l) => l.status === "scheduled" && l.place_id === b.place_id),
        b.billing,
        rates,
        b.rate_label,
      )) {
        const key = `venue:${b.id}:pay:${p.period}`;
        if (paid.has(p.period)) {
          await close(c, org, [key]);
          continue;
        }
        if (p.due > plusDays(now, 14)) continue;
        await task(c, org, { key, kind: "venuePay", title: w.pay.replace("{place}", b.place).replace("{period}", p.period), about: `${b.place} (${p.period})`, detail: "", due: p.due, placeId: b.place_id, category: "admin", who: boss, createdBy: boss.user_id });
        await c.query("UPDATE task SET amount_cents=$3 WHERE organization_id=$1 AND source_key=$2 AND status<>'done' AND amount_cents IS NULL", [org, key, p.cents || null]);
        tasks++;
      }
    }
    if (b.status === "refused" || b.status === "cancelled")
      await c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key LIKE 'venue:'||$2::text||':%' AND source_kind IN ('venueRequest','venueRemind','venuePay') AND status<>'done'", [org, b.id]);
  }
  return { created, tasks };
}

/** Every club that has halls to book, once a day (and whenever the page is opened). */
export async function bookingsTick(db: Pool) {
  const clubs = (await db.query("SELECT DISTINCT organization_id FROM calendar_place WHERE booking_needed AND NOT archived")).rows.map((r) => r.organization_id as string);
  let n = 0;
  for (const org of clubs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
      n += (await syncBookings(c, org)).tasks;
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return n;
}

/** 6: each hall's bookings of the season: status, sessions, planned and paid, invoices; the cost per team. */
export async function bookingsView(db: Pool, p: Principal, locale: Locale) {
  return scope(db, p, true, async (x) => {
    if (x.manage) await syncBookings(x.c, x.org);
    const club = (await x.c.query("SELECT name FROM organization WHERE id=$1", [x.org])).rows[0]?.name as string;
    const sender = (await x.c.query('SELECT name FROM "user" WHERE id=$1', [x.userId])).rows[0]?.name as string;
    const rows = (
      await x.c.query(
        `SELECT b.id,b.place_id,b.season_id,b.status,b.reference,b.billing,b.rate_label,b.planned_cost_cents,b.notes,b.requested_at,b.answered_at,b.confirmation_filename,b.version,
                pl.name AS place,pl.address,s.name AS season,ct.full_name AS contact,ct.email AS contact_email,ct.phone AS contact_phone
           FROM venue_booking b JOIN calendar_place pl ON pl.id=b.place_id LEFT JOIN season s ON s.id=b.season_id LEFT JOIN contact ct ON ct.id=pl.contact_id AND ct.organization_id=b.organization_id
          WHERE b.organization_id=$1 ORDER BY pl.name,s.starts_on DESC NULLS LAST`,
        [x.org],
      )
    ).rows;
    const out = [];
    for (const b of rows) {
      const sessions = (
        await x.c.query(
          `SELECT e.id,e.local_start,e.local_end,e.status,e.team_id,tm.name AS team FROM venue_booking_event be JOIN calendar_event e ON e.id=be.event_id LEFT JOIN team tm ON tm.id=e.team_id
            WHERE be.booking_id=$1 AND e.place_id=$2 ORDER BY e.starts_at`,
          [b.id, b.place_id],
        )
      ).rows as (Session & { id: string; status: string; team_id: string | null; team: string | null })[];
      const scheduled = sessions.filter((s) => s.status === "scheduled");
      const rates = (await x.c.query("SELECT label,amount_cents,valid_from::text AS valid_from FROM venue_rate WHERE organization_id=$1 AND place_id=$2", [x.org, b.place_id])).rows as Rate[];
      const periods = billingPeriods(scheduled, b.billing, rates, b.rate_label);
      const invoices = (
        await x.c.query(
          "SELECT id,period,amount_cents,issued_on::text AS issued_on,filename,transaction_id FROM venue_invoice WHERE booking_id=$1 AND organization_id=$2 ORDER BY issued_on,created_at",
          [b.id, x.org],
        )
      ).rows as { id: string; period: string; amount_cents: number; issued_on: string; filename: string | null; transaction_id: string | null }[];
      const teams = new Map<string, { team: string; sessions: number; cents: number }>();
      for (const s of scheduled) {
        const k = s.team_id ?? "";
        const t = teams.get(k) ?? { team: s.team ?? "", sessions: 0, cents: 0 };
        t.sessions += 1;
        t.cents += plannedCost([s], rates, b.rate_label);
        teams.set(k, t);
      }
      const future = scheduled.filter((s) => s.local_start.slice(0, 10) >= today());
      out.push({
        ...b,
        labels: [...new Set(rates.map((r) => r.label))],
        sessions: scheduled.length,
        slots: slotLines(locale, scheduled),
        email: bookingEmail(locale, { club, place: b.place, contact: b.contact, season: b.season, slots: slotLines(locale, future.length ? future : scheduled), sender }),
        periods,
        invoices: invoices.map((i) => {
          const planned = periods.find((q) => q.period === i.period)?.cents ?? (b.billing === "yearly" ? b.planned_cost_cents : null);
          return { ...i, planned, gap: planned === null ? null : invoiceGap(i.amount_cents, planned) };
        }),
        paid_cents: invoices.filter((i) => i.transaction_id).reduce((n, i) => n + i.amount_cents, 0),
        invoiced_cents: invoices.reduce((n, i) => n + i.amount_cents, 0),
        teams: [...teams.values()],
      });
    }
    return { organization_id: x.org, can: { manage: x.manage, money: x.money }, bookings: out };
  });
}

export async function bookingExecute(db: Pool, p: Principal, input: BookingCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (input.action === "expense" ? !x.money : !x.manage) throw new AccessError("FORBIDDEN");
      const booking = async (id: string) => {
        const b = (await x.c.query("SELECT * FROM venue_booking WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, x.org])).rows[0];
        if (!b) throw new AccessError("NOT_FOUND", 404);
        return b as { id: string; status: string; place_id: string };
      };
      switch (input.action) {
        case "refresh":
          return await syncBookings(x.c, x.org);
        case "status": {
          const b = await booking(input.id);
          await x.c.query(
            `UPDATE venue_booking SET status=$3,reference=COALESCE($4,reference),
                    requested_at=CASE WHEN $3='requested' AND status<>'requested' THEN now() ELSE requested_at END,
                    answered_at=CASE WHEN $3 IN ('confirmed','refused') THEN now() ELSE answered_at END,version=version+1,updated_at=now()
              WHERE id=$1 AND organization_id=$2`,
            [b.id, x.org, input.status, input.reference ?? null],
          );
          await audit(x.c, x.org, x.userId, "booking." + input.status, b.id);
          await syncBookings(x.c, x.org);
          return { id: b.id };
        }
        case "update": {
          const b = await booking(input.id);
          if (input.rateLabel && !(await x.c.query("SELECT 1 FROM venue_rate WHERE organization_id=$1 AND place_id=$2 AND lower(label)=lower($3)", [x.org, b.place_id, input.rateLabel])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          await x.c.query("UPDATE venue_booking SET billing=$3,rate_label=$4,reference=$5,notes=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [
            b.id,
            x.org,
            input.billing,
            input.rateLabel,
            input.reference,
            input.notes,
          ]);
          await syncBookings(x.c, x.org);
          return { id: b.id };
        }
        case "invoice": {
          const b = await booking(input.bookingId);
          const id = (
            await x.c.query("INSERT INTO venue_invoice(organization_id,booking_id,period,amount_cents,issued_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
              x.org,
              b.id,
              input.period,
              input.amountCents,
              input.issuedOn,
              x.userId,
            ])
          ).rows[0].id as string;
          await audit(x.c, x.org, x.userId, "booking.invoice", id);
          return { id };
        }
        case "removeInvoice": {
          const gone = await x.c.query("DELETE FROM venue_invoice WHERE id=$1 AND organization_id=$2 AND transaction_id IS NULL RETURNING id", [input.id, x.org]);
          if (!gone.rowCount) throw new AccessError((await x.c.query("SELECT 1 FROM venue_invoice WHERE id=$1 AND organization_id=$2", [input.id, x.org])).rowCount ? "ALREADY_RECORDED" : "NOT_FOUND", 409);
          return { id: input.id };
        }
        case "expense": {
          // 5: the expense, once, linked to the invoice; the invoice's file goes with it as the receipt.
          const i = (
            await x.c.query(
              `SELECT i.*,b.id AS booking FROM venue_invoice i JOIN venue_booking b ON b.id=i.booking_id WHERE i.id=$1 AND i.organization_id=$2 FOR UPDATE OF i`,
              [input.invoiceId, x.org],
            )
          ).rows[0];
          if (!i) throw new AccessError("NOT_FOUND", 404);
          if (i.transaction_id) throw new AccessError("ALREADY_RECORDED", 409);
          // The team, when every session of the booking is the same team's.
          const teams = (await x.c.query("SELECT DISTINCT e.team_id FROM venue_booking_event be JOIN calendar_event e ON e.id=be.event_id WHERE be.booking_id=$1 AND e.status='scheduled'", [i.booking])).rows;
          const team = teams.length === 1 ? (teams[0].team_id as string | null) : null;
          const tx = (
            await x.c.query(
              "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by,team_id) VALUES($1,$2,$3,'out','venue',$4,'transfer','','','',$5,$6) RETURNING id",
              [x.org, input.occurredOn, input.label, i.amount_cents, x.userId, team],
            )
          ).rows[0].id as string;
          await x.c.query("UPDATE venue_invoice SET transaction_id=$2 WHERE id=$1", [i.id, tx]);
          if (i.content)
            await x.c.query("INSERT INTO finance_receipt(organization_id,transaction_id,filename,media_type,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6)", [
              x.org,
              tx,
              i.filename,
              i.media_type,
              i.content,
              x.userId,
            ]);
          await audit(x.c, x.org, x.userId, "booking.expense", i.id, { transaction: tx });
          await syncBookings(x.c, x.org);
          return { id: tx };
        }
      }
    },
    expected,
  );
}

/** The booking's confirmation or an invoice's file (PDF or image, 5 MB). */
export async function bookingFileUpload(db: Pool, p: Principal, target: { kind: "confirmation" | "invoice"; id: string }, file: { name: string; bytes: Uint8Array }, expected: string) {
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (!x.manage) throw new AccessError("FORBIDDEN");
      const type = receiptType(file.bytes);
      if (!type || file.bytes.length > receiptMaxBytes) throw new AccessError("INVALID_FILE", 400);
      await ensureStorage(x.c, x.org, file.bytes.length);
      const name =
        [...file.name]
          .map((ch) => (ch.charCodeAt(0) < 32 || ch === "/" || ch === "\\" ? "_" : ch))
          .join("")
          .trim()
          .slice(0, 200) || "document.pdf";
      const done =
        target.kind === "confirmation"
          ? await x.c.query("UPDATE venue_booking SET confirmation_filename=$3,confirmation_media_type=$4,confirmation_content=$5,updated_at=now() WHERE id=$1 AND organization_id=$2", [
              target.id,
              x.org,
              name,
              type,
              Buffer.from(file.bytes),
            ])
          : await x.c.query("UPDATE venue_invoice SET filename=$3,media_type=$4,content=$5 WHERE id=$1 AND organization_id=$2", [target.id, x.org, name, type, Buffer.from(file.bytes)]);
      if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
      await audit(x.c, x.org, x.userId, "booking.file", target.id, { kind: target.kind });
      return { id: target.id };
    },
    expected,
  );
}
export async function bookingFile(db: Pool, p: Principal, target: { kind: "confirmation" | "invoice"; id: string }) {
  return scope(db, p, false, async (x) => {
    const row = (
      target.kind === "confirmation"
        ? await x.c.query("SELECT confirmation_filename AS filename,confirmation_media_type AS media_type,confirmation_content AS content FROM venue_booking WHERE id=$1 AND organization_id=$2", [target.id, x.org])
        : await x.c.query("SELECT filename,media_type,content FROM venue_invoice WHERE id=$1 AND organization_id=$2", [target.id, x.org])
    ).rows[0];
    if (!row?.content) throw new AccessError("NOT_FOUND", 404);
    return row as { filename: string; media_type: string; content: Buffer };
  });
}

/** 4: a session in a hall that must be booked, without a confirmed booking. */
export async function bookingMissing(c: PoolClient, org: string, eventId: string, placeId: string | null) {
  if (!placeId) return false;
  return !!(
    await c.query(
      `SELECT 1 FROM calendar_place pl WHERE pl.id=$2 AND pl.organization_id=$3 AND pl.booking_needed
          AND NOT EXISTS(SELECT 1 FROM venue_booking_event be JOIN venue_booking b ON b.id=be.booking_id WHERE be.event_id=$1 AND b.status='confirmed' AND b.place_id=pl.id)`,
      [eventId, placeId, org],
    )
  ).rowCount;
}
