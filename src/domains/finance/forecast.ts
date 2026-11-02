import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import type { Locale } from "../../lib/locale";
import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { moneyRights } from "../access/policy";
import { brusselsToday } from "../people/service";
import { reservedTotal } from "./allocations";
import { buildForecast, collectionRate, forecastCommand, monthOf, monthsFrom, spread, type ForecastItem } from "./forecast-schema";

/**
 * H4: the 12-month cash forecast, computed at each reading from the data the
 * application already holds (nothing typed twice): dues still to come, grants
 * granted and not received, signed sponsors not cashed, fundraising goals,
 * the budget's other lines, halls, trips, affiliations, tasks with an amount,
 * chairs to service. Simulation lines stay in the forecast, never in the
 * ledger. Money rights only; every query on the organisation.
 */
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (c: PoolClient, org: string, edit: boolean) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const money = moneyRights(a);
    if (!money.manage && (write || !money.read)) throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!(await account(c, p)).twoFactorEnabled)) throw new AccessError("MFA_REQUIRED");
    const out = await fn(c, a.organization_id, money.manage);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
type Row = Record<string, unknown>;
const q = async <T = Row>(c: PoolClient, sql: string, params: unknown[]) => (await c.query(sql, params)).rows as T[];
const addMonths = (month: string, n: number) => monthsFrom(month + "-01", n + 1)[n];

/** Every expected movement of the next 12 months. */
export async function forecastItems(c: PoolClient, org: string, today: string) {
  const months = monthsFrom(today);
  const items: ForecastItem[] = [];
  const put = (i: Omit<ForecastItem, "month"> & { day: string }) => {
    const month = monthOf(i.day, months);
    if (month && i.cents > 0) items.push({ source: i.source, label: i.label, direction: i.direction, cents: Math.round(i.cents), certain: i.certain, month, ...(i.id ? { id: i.id } : {}) });
  };

  // Dues: the instalments still unpaid (what was paid covers the earliest first), weighed by last season's collection.
  const past = (
    await q<{ net: number; paid: number }>(
      c,
      `SELECT COALESCE(sum(d.net_cents),0)::int AS net,COALESCE(sum((SELECT sum(t.amount_cents) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.deleted_at IS NULL AND t.direction='in')),0)::int AS paid
         FROM dues_receivable d JOIN season s ON s.id=d.season_id WHERE d.organization_id=$1 AND d.status<>'cancelled' AND s.ends_on<$2::date AND s.ends_on>=$2::date-400`,
      [org, today],
    )
  )[0];
  const rate = collectionRate(past.net, past.paid);
  const receivables = await q<{ id: string; name: string; paid: number; installments: { due_on: string; amount_cents: number }[] }>(
    c,
    `SELECT d.id,cp.full_name AS name,
            COALESCE((SELECT sum(t.amount_cents) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.deleted_at IS NULL AND t.direction='in'),0)::int AS paid,
            (SELECT json_agg(json_build_object('due_on',i.due_on,'amount_cents',i.amount_cents) ORDER BY i.due_on,i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id) AS installments
       FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id WHERE d.organization_id=$1 AND d.status='open'`,
    [org],
  );
  for (const r of receivables) {
    let paid = r.paid;
    for (const i of r.installments ?? []) {
      const left = Math.max(0, i.amount_cents - paid);
      paid = Math.max(0, paid - i.amount_cents);
      if (!left) continue;
      put({ source: "dues", label: r.name, direction: "in", cents: left * rate, certain: true, day: i.due_on });
      if (rate < 1) put({ source: "dues", label: r.name, direction: "in", cents: left * (1 - rate), certain: false, day: i.due_on });
    }
  }
  // Grants granted and not (fully) received.
  for (const g of await q<{ id: string; funder: string; left: number; day: string }>(
    c,
    `SELECT g.id,g.funder,(COALESCE(g.granted_cents,0)-COALESCE((SELECT sum(x.amount_cents) FROM grant_payment x WHERE x.grant_id=g.id AND x.organization_id=g.organization_id),0))::int AS left,
            COALESCE(g.starts_on,g.decision_on+60,$2::date)::text AS day
       FROM grant_application g WHERE g.organization_id=$1 AND g.status='granted'`,
    [org, today],
  ))
    put({ source: "grant", label: g.funder, direction: "in", cents: g.left, certain: true, day: g.day, id: g.id });
  // Signed sponsors not cashed yet.
  for (const s of await q<{ id: string; name: string; amount_cents: number; day: string }>(
    c,
    "SELECT id,name,amount_cents,COALESCE(payment_due_on,signed_on,$2::date)::text AS day FROM partner WHERE organization_id=$1 AND status='active' AND signed_on IS NOT NULL AND paid_on IS NULL AND payment_transaction_id IS NULL",
    [org, today],
  ))
    put({ source: "sponsor", label: s.name, direction: "in", cents: s.amount_cents, certain: true, day: s.day, id: s.id });
  // Fundraising with a goal: what is still to collect, probable, by its deadline.
  for (const f of await q<{ name: string; left: number; day: string }>(
    c,
    `SELECT p.name,(p.goal_cents-COALESCE((SELECT sum(m.amount_cents) FROM fundraising_movement m WHERE m.pot_id=p.id AND m.cancelled_at IS NULL AND m.kind<>'expense'),0))::int AS left,COALESCE(p.deadline,$2::date+90)::text AS day
       FROM fundraising_pot p WHERE p.organization_id=$1 AND p.status='open'`,
    [org, today],
  ))
    put({ source: "fundraising", label: f.name, direction: "in", cents: f.left, certain: false, day: f.day });

  // Halls: unpaid invoices for sure; the rest of the planned cost (less what was invoiced) by its billing, probable.
  for (const b of await q<{ id: string; place: string; billing: string; planned: number; invoiced: number; starts_on: string | null; ends_on: string | null; sessions: { month: string; n: number }[] | null }>(
    c,
    `SELECT b.id,pl.name AS place,b.billing,b.planned_cost_cents AS planned,COALESCE((SELECT sum(i.amount_cents) FROM venue_invoice i WHERE i.booking_id=b.id),0)::int AS invoiced,s.starts_on::text,s.ends_on::text,
            (SELECT json_agg(json_build_object('month',x.m,'n',x.n)) FROM (SELECT to_char(e.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM') AS m,count(*)::int AS n FROM venue_booking_event e WHERE e.booking_id=b.id AND e.starts_at>=now() AND e.status<>'cancelled' GROUP BY 1) x) AS sessions
       FROM venue_booking b JOIN calendar_place pl ON pl.id=b.place_id LEFT JOIN season s ON s.id=b.season_id
      WHERE b.organization_id=$1 AND b.status IN ('requested','confirmed')`,
    [org],
  )) {
    const left = Math.max(0, b.planned - b.invoiced);
    const end = (b.ends_on ?? addMonths(months[0], 11) + "-28").slice(0, 7);
    const rest = months.filter((m) => m <= end);
    if (b.billing === "per_session" && b.sessions?.length) {
      const total = b.sessions.reduce((n, x) => n + x.n, 0);
      for (const x of b.sessions) put({ source: "venue", label: b.place, direction: "out", cents: (left * x.n) / total, certain: false, day: x.month + "-15" });
    } else {
      const every = b.billing === "quarterly" ? 3 : b.billing === "yearly" ? 12 : 1;
      const due = rest.filter((_, i) => i % every === 0);
      for (const x of spread(left, due)) put({ source: "venue", label: b.place, direction: "out", cents: x.cents, certain: false, day: x.month + "-15" });
    }
  }
  for (const i of await q<{ place: string; amount_cents: number; issued_on: string }>(
    c,
    "SELECT pl.name AS place,i.amount_cents,(i.issued_on+30)::text AS issued_on FROM venue_invoice i JOIN venue_booking b ON b.id=i.booking_id JOIN calendar_place pl ON pl.id=b.place_id WHERE i.organization_id=$1 AND i.transaction_id IS NULL",
    [org],
  ))
    put({ source: "venue", label: i.place, direction: "out", cents: i.amount_cents, certain: true, day: i.issued_on });
  // Trips planned: their budget less what was already spent; confirmed ones are certain.
  for (const t of await q<{ title: string; status: string; left: number; starts_on: string }>(
    c,
    `SELECT t.title,t.status,t.starts_on::text,
            (GREATEST(COALESCE((SELECT sum(l.planned_cents) FROM trip_budget_line l WHERE l.trip_id=t.id),0),t.budget_cents)
             -COALESCE((SELECT sum(x.amount_cents) FROM finance_transaction x WHERE x.trip_id=t.id AND x.direction='out' AND x.cancelled_at IS NULL AND x.deleted_at IS NULL),0))::int AS left
       FROM trip t WHERE t.organization_id=$1 AND t.status IN ('planned','confirmed') AND t.ends_on>=$2::date`,
    [org, today],
  ))
    put({ source: "trip", label: t.title, direction: "out", cents: t.left, certain: t.status === "confirmed", day: t.starts_on });
  // Affiliations and licences to pay.
  for (const a of await q<{ period: string; amount_cents: number; due_on: string }>(c, "SELECT period,amount_cents,due_on::text FROM affiliation_due WHERE organization_id=$1 AND paid_on IS NULL", [org]))
    put({ source: "affiliation", label: a.period, direction: "out", cents: a.amount_cents, certain: true, day: a.due_on });
  // Tasks with a planned amount, not yet paid.
  for (const t of await q<{ title: string; amount_cents: number; due_on: string }>(
    c,
    "SELECT title,amount_cents,due_on::text FROM task WHERE organization_id=$1 AND amount_cents>0 AND transaction_id IS NULL AND status<>'done' AND due_on IS NOT NULL",
    [org],
  ))
    put({ source: "task", label: t.title, direction: "out", cents: t.amount_cents, certain: true, day: t.due_on });
  // Chairs to service: the chair's (or the club's) usual service cost, probable.
  for (const ch of await q<{ name: string; cost: number | null; next_service_on: string }>(
    c,
    `SELECT e.name,e.next_service_on::text,COALESCE(
              (SELECT avg(i.cost_cents) FROM chair_intervention i WHERE i.chair_id=e.id AND i.kind='service' AND i.cost_cents IS NOT NULL AND i.cancelled_at IS NULL),
              (SELECT avg(i.cost_cents) FROM chair_intervention i WHERE i.organization_id=e.organization_id AND i.kind='service' AND i.cost_cents IS NOT NULL AND i.cancelled_at IS NULL))::int AS cost
       FROM equipment_chair e WHERE e.organization_id=$1 AND e.status<>'retired' AND e.next_service_on IS NOT NULL`,
    [org],
  ))
    if (ch.cost) put({ source: "chair", label: ch.name, direction: "out", cents: ch.cost, certain: false, day: ch.next_service_on });

  // The budget's other lines (those no source above covers): what is left this season, spread over its remaining months, probable.
  const start = Number(today.slice(5) >= "07-01" ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1);
  const label = `${start}-${String(start + 1).slice(2)}`;
  const covered = { in: ["dues", "subsidy", "sponsor", "donation"], out: ["venue", "travel", "affiliation", "competition"] };
  for (const b of await q<{ direction: "in" | "out"; category: string; amount_cents: number; done: number }>(
    c,
    `SELECT b.direction,b.category,sum(b.amount_cents)::int AS amount_cents,
            COALESCE((SELECT sum(t.amount_cents) FROM finance_transaction t WHERE t.organization_id=$1 AND t.direction=b.direction AND t.category=b.category AND t.cancelled_at IS NULL AND t.deleted_at IS NULL AND t.occurred_on BETWEEN $3::date AND $4::date),0)::int AS done
       FROM finance_budget b WHERE b.organization_id=$1 AND b.season=$2 GROUP BY b.direction,b.category`,
    [org, label, `${start}-07-01`, `${start + 1}-06-30`],
  )) {
    if (covered[b.direction].includes(b.category)) continue;
    const rest = months.filter((m) => m <= `${start + 1}-06`);
    for (const x of spread(Math.max(0, b.amount_cents - b.done), rest)) put({ source: "budget", label: b.category, direction: b.direction, cents: x.cents, certain: false, day: x.month + "-15" });
  }
  // The simulation lines.
  for (const l of await q<{ id: string; month: string; label: string; direction: "in" | "out"; amount_cents: number; probable: boolean }>(c, "SELECT id,month,label,direction,amount_cents,probable FROM forecast_line WHERE organization_id=$1 ORDER BY month", [org]))
    put({ source: "manual", label: l.label, direction: l.direction, cents: l.amount_cents, certain: !l.probable, day: l.month + "-15", id: l.id });
  return { months, items, rate };
}

async function compute(c: PoolClient, org: string) {
  const today = brusselsToday();
  const balance = (
    await q<{ n: number }>(c, "SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END),0)::int AS n FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL AND deleted_at IS NULL", [org])
  )[0].n;
  const threshold = (await q<{ t: number }>(c, "SELECT forecast_threshold_cents AS t FROM organization WHERE id=$1", [org]))[0].t;
  const { months, items, rate } = await forecastItems(c, org, today);
  return { today, rate, reserved: await reservedTotal(c, org), forecast: buildForecast(balance, months, items, threshold) };
}

export async function forecastView(db: Pool, p: Principal) {
  return scope(db, p, false, async (c, org, edit) => {
    const lines = await q<{ id: string; month: string; label: string; direction: "in" | "out"; amount_cents: number; probable: boolean }>(c, "SELECT id,month,label,direction,amount_cents,probable FROM forecast_line WHERE organization_id=$1 ORDER BY month,created_at", [org]);
    return { organization_id: org, can: { edit }, lines, ...(await compute(c, org)) };
  });
}

export async function forecastExecute(db: Pool, p: Principal, raw: z.input<typeof forecastCommand>, expected: string) {
  const cmd = forecastCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (c, org) => {
      if (cmd.action === "threshold") {
        await c.query("UPDATE organization SET forecast_threshold_cents=$2 WHERE id=$1", [org, cmd.cents]);
        return { ok: true };
      }
      if (cmd.action === "removeLine") {
        const r = await c.query("DELETE FROM forecast_line WHERE id=$1 AND organization_id=$2", [cmd.id, org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { ok: true };
      }
      const id = (
        await c.query("INSERT INTO forecast_line(organization_id,month,label,direction,amount_cents,probable,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [org, cmd.month, cmd.label, cmd.direction, cmd.amountCents, cmd.probable, p.userId])
      ).rows[0].id as string;
      await audit(c, org, p.userId, "forecast.line", id);
      return { id };
    },
    expected,
  );
}

const words = {
  fr: { title: "Trésorerie prévisionnelle sur 12 mois", start: "Trésorerie aujourd'hui : {v}", reserved: "dont réservée : {v}", threshold: "Seuil d'alerte : {v}", head: "Mois · entrées certaines · sorties certaines · solde certain · solde avec le probable", alert: "Attention : le solde certain passe sous le seuil en {m} ({v}).", made: "Établi le {d} à partir des données de l'application." },
  nl: { title: "Kasprognose over 12 maanden", start: "Kas vandaag: {v}", reserved: "waarvan gereserveerd: {v}", threshold: "Waarschuwingsdrempel: {v}", head: "Maand · zekere ontvangsten · zekere uitgaven · zeker saldo · saldo met het waarschijnlijke", alert: "Let op: het zekere saldo zakt onder de drempel in {m} ({v}).", made: "Opgesteld op {d} op basis van de gegevens van de toepassing." },
  en: { title: "12-month cash forecast", start: "Cash today: {v}", reserved: "of which reserved: {v}", threshold: "Alert threshold: {v}", head: "Month · certain income · certain expenses · certain balance · balance with the probable", alert: "Warning: the certain balance falls under the threshold in {m} ({v}).", made: "Drawn up on {d} from the application's data." },
};
/** The PDF for the board or a loan application. */
export async function forecastPdf(db: Pool, p: Principal, locale: Locale) {
  return scope(db, p, false, async (c, org) => {
    const v = await compute(c, org);
    const w = words[locale];
    const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
    const money = (n: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(n / 100).replace(/[  ]/g, " ");
    const month = (m: string) => new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-15T12:00:00Z"));
    const fill = (s: string, x: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => x[k] ?? "");
    const name = (await q<{ name: string }>(c, "SELECT name FROM organization WHERE id=$1", [org]))[0].name;
    const f = v.forecast;
    const lines: PdfLine[] = [
      { text: name, bold: true, size: 12 },
      { text: w.title, bold: true, size: 16, gap: 10 },
      { text: fill(w.start, { v: money(f.start) }), gap: 10 },
      { text: fill(w.reserved, { v: money(v.reserved) }) },
      { text: fill(w.threshold, { v: money(f.threshold) }) },
      ...(f.alert ? [{ text: fill(w.alert, { m: month(f.alert.month), v: money(f.alert.balance) }), bold: true, gap: 8 }] : []),
      { text: w.head, bold: true, size: 9, gap: 14 },
      ...f.rows.flatMap((r) => [
        { text: `${month(r.month)} · ${money(r.inCertain)} · ${money(r.outCertain)} · ${money(r.certain)} · ${money(r.likely)}`, size: 10, gap: 4 },
        ...r.items.slice(0, 6).map((i) => ({ text: `${i.direction === "in" ? "+" : "-"} ${money(i.cents)} ${i.label}${i.certain ? "" : " (?)"}`, size: 8, indent: 14 })),
      ]),
      { text: fill(w.made, { d: v.today }), size: 8, gap: 14 },
    ];
    return pdfDocument(lines, w.title);
  });
}

/** The alert: a task for the money managers when the certain balance goes under the threshold within three months (once per month concerned). */
export async function forecastTick(db: Pool) {
  const orgs = (await db.query("SELECT DISTINCT organization_id FROM finance_transaction UNION SELECT organization_id FROM forecast_line")).rows.map((r) => r.organization_id as string);
  let created = 0;
  for (const org of orgs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const v = await compute(c, org);
      const a = v.forecast.alert;
      if (a) {
        const kind = (await q<{ kind: string }>(c, "SELECT kind FROM organization WHERE id=$1", [org]))[0].kind;
        const by = (await q<{ id: string }>(c, "SELECT user_id AS id FROM role_assignment WHERE organization_id=$1 AND role IN ('club_president','federation_president') AND revoked_at IS NULL ORDER BY created_at LIMIT 1", [org]))[0]?.id;
        if (by) {
          const r = await c.query(
            `INSERT INTO task(organization_id,kind,category,title,detail,due_on,origin,created_by,source_key,source_kind,source_params)
             VALUES($1,'other',$2,$3,$4,$5::date,'manual',$6,$7,'forecastLow',$8::jsonb) ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,
            [
              org,
              kind === "federation" ? "fed_finance" : "admin",
              `Trésorerie sous le seuil en ${a.month}`,
              a.biggest.map((b) => `${b.label} ${(b.cents / 100).toFixed(2)} EUR`).join(", "),
              a.month + "-01",
              by,
              `forecast:${a.month}`,
              JSON.stringify({ about: a.month, balance: a.balance, biggest: a.biggest }),
            ],
          );
          created += r.rowCount ?? 0;
        }
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return created;
}
/** For the president's home: the alert, if any (money managers only, the caller checks). */
export async function forecastAlertOf(c: PoolClient, org: string) {
  return (await compute(c, org)).forecast.alert;
}
