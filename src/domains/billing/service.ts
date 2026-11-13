import type { Pool, PoolClient } from "pg";
import { AccessError, active, audit, type Principal } from "../access/service";
import { brusselsToday } from "../people/service";
import { notice } from "../notifications/notice";
import { canBill, operatorScope } from "../console/service";
import { billingCommand, discountCode, discountOf, invoiceNumber, monthlyCents, reminderDue, type BillingCommand, type InvoiceState } from "./schema";
import { createPaymentLink, mollieMode } from "./mollie";
export { billingCommand };

/**
 * Console, step 4 (05/11/2026): the billing of the platform's subscriptions.
 * The owner and the finance role keep the books: plans, one subscription
 * per organisation, invoices numbered per year, payments recorded by hand
 * (no card data here), reminders by steps sent to the organisation's
 * presidents, by hand or by the daily task. The organisation's presidents
 * read their own invoices in Réglages, Abonnement à la plateforme.
 */
const texts = {
  invoice: (org: string, number: string, amount: string, due: string, pay = "") => ({
    fr: { title: `Facture ${number} de la plateforme`, message: `${org} : ${amount}, à payer pour le ${due}. Le détail est dans Abonnement à la plateforme.${pay ? ` Payer en ligne : ${pay}` : ""}` },
    nl: { title: `Factuur ${number} van het platform`, message: `${org}: ${amount}, te betalen tegen ${due}. Het detail staat in Abonnement op het platform.${pay ? ` Online betalen: ${pay}` : ""}` },
    en: { title: `Invoice ${number} from the platform`, message: `${org}: ${amount}, due by ${due}. The detail is in Platform subscription.${pay ? ` Pay online: ${pay}` : ""}` },
  }),
  trial: (org: string, end: string) => ({
    fr: { title: "Fin de l'essai gratuit", message: `${org} : l'essai gratuit se termine le ${end}. La facture de l'année (99 € par an) partira ce jour-là. Un code de réduction s'ajoute dans Abonnement à la plateforme.` },
    nl: { title: "Einde van de gratis proefperiode", message: `${org}: de gratis proefperiode eindigt op ${end}. De factuur van het jaar (99 € per jaar) vertrekt die dag. Een kortingscode voegt u toe in Abonnement op het platform.` },
    en: { title: "End of the free trial", message: `${org}: the free trial ends on ${end}. The year's invoice (99 € a year) leaves that day. A discount code can be added in Platform subscription.` },
  }),
  reminder: (level: number, org: string, number: string, amount: string, due: string) =>
    level === 1
      ? {
          fr: { title: `Rappel : facture ${number}`, message: `${org} : la facture de ${amount}, échue le ${due}, reste ouverte. Un oubli sans doute : merci de la régler.` },
          nl: { title: `Herinnering: factuur ${number}`, message: `${org}: de factuur van ${amount}, vervallen op ${due}, staat nog open. Wellicht vergeten: gelieve te betalen.` },
          en: { title: `Reminder: invoice ${number}`, message: `${org}: the invoice of ${amount}, due on ${due}, is still open. Probably an oversight: please settle it.` },
        }
      : level === 2
        ? {
            fr: { title: `Second rappel : facture ${number}`, message: `${org} : la facture de ${amount}, échue le ${due}, n'est toujours pas réglée. Merci de la payer sous dix jours.` },
            nl: { title: `Tweede herinnering: factuur ${number}`, message: `${org}: de factuur van ${amount}, vervallen op ${due}, is nog steeds niet betaald. Gelieve binnen tien dagen te betalen.` },
            en: { title: `Second reminder: invoice ${number}`, message: `${org}: the invoice of ${amount}, due on ${due}, is still unpaid. Please pay within ten days.` },
          }
        : {
            fr: { title: `Dernier rappel : facture ${number}`, message: `${org} : la facture de ${amount}, échue le ${due}, reste impayée. Sans paiement sous dix jours, l'accès passe en lecture seule.` },
            nl: { title: `Laatste herinnering: factuur ${number}`, message: `${org}: de factuur van ${amount}, vervallen op ${due}, blijft onbetaald. Zonder betaling binnen tien dagen wordt de toegang alleen-lezen.` },
            en: { title: `Final reminder: invoice ${number}`, message: `${org}: the invoice of ${amount}, due on ${due}, remains unpaid. Without payment within ten days, access becomes read only.` },
          },
};
/** The presidency of a club or a federation, with their account. */
async function presidencyOf(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT DISTINCT u.id AS user_id,u.email,u.name,pe.locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.role IN ('club_president','federation_president') AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`,
      [org],
    )
  ).rows as { user_id: string; email: string; name: string; locale: string | null }[];
}
const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const frDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export type Plan = { id: string; code: string; name: string; amount_cents: number; period: "month" | "year"; basis: "organization" | "player"; active: boolean; subscribers: number };
export type Subscription = {
  id: string;
  organization_id: string;
  organization: string;
  country: string;
  plan_id: string;
  plan: string;
  period: "month" | "year";
  basis: "organization" | "player";
  amount_cents: number;
  started_on: string;
  ended_on: string | null;
  note: string;
  last_invoiced_to: string | null;
  /** 12/11/2026: a club without a federation, on trial then invoiced by the daily task. */
  trial_ends_on: string | null;
  auto_invoice: boolean;
  discount_code: string;
  discount_cycles_left: number | null;
};
export type Invoice = {
  id: string;
  organization_id: string;
  organization: string;
  number: string;
  label: string;
  period_from: string;
  period_to: string;
  quantity: number;
  unit_cents: number;
  amount_cents: number;
  issued_on: string;
  due_on: string;
  state: InvoiceState;
  sent_at: string | null;
  paid_on: string | null;
  reminders: number;
  last_reminder_at: string | null;
  late: boolean;
  /** Series B: the Mollie link to pay online, and how it got paid. */
  pay_url: string;
  paid_via: "" | "manual" | "mollie";
  /** 12/11/2026: what a discount code took off, and which code. */
  discount_cents: number;
  discount_code: string;
};
export type Discount = { id: string; code: string; percent: number | null; amount_cents: number | null; cycles: number | null; valid_until: string | null; max_uses: number | null; uses: number; note: string; active: boolean; created_at: string; usable: boolean };
const invoiceSql = `SELECT i.id,i.organization_id,o.name AS organization,i.number,i.label,i.period_from::text AS period_from,i.period_to::text AS period_to,i.quantity,i.unit_cents,i.amount_cents,i.issued_on::text AS issued_on,i.due_on::text AS due_on,i.state,i.sent_at,i.paid_on::text AS paid_on,i.reminders,i.last_reminder_at,(i.state='sent' AND i.due_on<CURRENT_DATE) AS late,i.pay_url,i.paid_via,i.discount_cents,i.discount_code
  FROM billing_invoice i JOIN organization o ON o.id=i.organization_id`;

export async function billingView(db: Pool, p: Principal, raw: { state?: string; organization?: string; country?: string } = {}) {
  return operatorScope(db, p, async (c, o) => {
    const plans = (
      await c.query("SELECT p.*,(SELECT count(*)::int FROM billing_subscription s WHERE s.plan_id=p.id AND s.ended_on IS NULL) AS subscribers FROM billing_plan p ORDER BY p.active DESC,p.name")
    ).rows as Plan[];
    const subscriptions = (
      await c.query(
        `SELECT s.id,s.organization_id,o.name AS organization,o.country_code AS country,s.plan_id,p.name AS plan,p.period,p.basis,p.amount_cents,s.started_on::text AS started_on,s.ended_on::text AS ended_on,s.note,
                (SELECT max(i.period_to)::text FROM billing_invoice i WHERE i.subscription_id=s.id AND i.state<>'cancelled') AS last_invoiced_to,
                s.trial_ends_on::text AS trial_ends_on,s.auto_invoice,COALESCE(d.code,'') AS discount_code,s.discount_cycles_left
           FROM billing_subscription s JOIN organization o ON o.id=s.organization_id JOIN billing_plan p ON p.id=s.plan_id LEFT JOIN billing_discount d ON d.id=s.discount_id ORDER BY s.ended_on NULLS FIRST,lower(o.name)`,
      )
    ).rows as Subscription[];
    const state = (["draft", "sent", "paid", "cancelled"] as string[]).includes(raw.state ?? "") ? raw.state : "";
    const invoices = (
      await c.query(`${invoiceSql} WHERE ($1='' OR i.state=$1) AND ($2='' OR i.organization_id::text=$2) AND ($3='' OR o.country_code=$3) ORDER BY i.issued_on DESC,i.number DESC LIMIT 300`, [state, raw.organization ?? "", /^[A-Z]{2}$/.test(raw.country ?? "") ? raw.country : ""])
    ).rows as Invoice[];
    const mrr = subscriptions.filter((s) => !s.ended_on).reduce((n, s) => n + monthlyCents(s.amount_cents, s.period), 0);
    const sum = async (sql: string) => (await c.query(sql)).rows[0].n as number;
    return {
      canBill: canBill(o),
      today: brusselsToday(),
      // Series B: Mollie plugged (test or live) or payments by hand.
      mollie: mollieMode(),
      plans,
      subscriptions,
      invoices,
      discounts: (
        await c.query(
          `SELECT id,code,percent,amount_cents,cycles,valid_until::text AS valid_until,max_uses,uses,note,active,created_at,
                  (active AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) AND (max_uses IS NULL OR uses<max_uses)) AS usable
             FROM billing_discount ORDER BY active DESC,created_at DESC LIMIT 200`,
        )
      ).rows as Discount[],
      figures: {
        mrr,
        invoicedMonth: await sum("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state IN ('sent','paid') AND issued_on>=date_trunc('month',CURRENT_DATE)"),
        paidMonth: await sum("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state='paid' AND paid_on>=date_trunc('month',CURRENT_DATE)"),
        open: await sum("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state='sent'"),
        late: await sum("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state='sent' AND due_on<CURRENT_DATE"),
        lateCount: await sum("SELECT count(*)::int AS n FROM billing_invoice WHERE state='sent' AND due_on<CURRENT_DATE"),
      },
    };
  });
}

export type ClubSubscription = {
  plan: string;
  period: "month" | "year";
  basis: "organization" | "player";
  amount_cents: number;
  started_on: string;
  ended_on: string | null;
  trial_ends_on: string | null;
  auto_invoice: boolean;
  discount_code: string;
  discount_percent: number | null;
  discount_amount: number | null;
  discount_cycles_left: number | null;
};
/** The organisation's own invoices and subscription, for its presidents (and the federation's presidency). */
export async function organizationBilling(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    if (!["club_president", "federation_president"].includes(a.role)) throw new AccessError("FORBIDDEN");
    const subscription = (
      await c.query(
        `SELECT p.name AS plan,p.period,p.basis,p.amount_cents,s.started_on::text AS started_on,s.ended_on::text AS ended_on,s.trial_ends_on::text AS trial_ends_on,s.auto_invoice,
                COALESCE(d.code,'') AS discount_code,d.percent AS discount_percent,d.amount_cents AS discount_amount,s.discount_cycles_left
           FROM billing_subscription s JOIN billing_plan p ON p.id=s.plan_id LEFT JOIN billing_discount d ON d.id=s.discount_id
          WHERE s.organization_id=$1 ORDER BY s.ended_on NULLS FIRST,s.started_on DESC LIMIT 1`,
        [a.organization_id],
      )
    ).rows[0] as ClubSubscription | undefined;
    const invoices = (await c.query(`${invoiceSql} WHERE i.organization_id=$1 AND i.state<>'draft' ORDER BY i.issued_on DESC LIMIT 100`, [a.organization_id])).rows as Invoice[];
    // A club's president may add a code while its subscription runs and has none (never another organisation's).
    const canAddCode = a.role === "club_president" && !!subscription && !subscription.ended_on && subscription.auto_invoice && !subscription.discount_code;
    return { organization: a.organization_name, subscription: subscription ?? null, invoices, open: invoices.filter((i) => i.state === "sent").reduce((n, i) => n + i.amount_cents, 0), canAddCode };
  } finally {
    c.release();
  }
}

/**
 * 12/11/2026: the president of a club without a federation adds the discount
 * code the platform gave him, to its running subscription (once).
 */
export async function clubDiscount(db: Pool, p: Principal, code: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (a.role !== "club_president") throw new AccessError("FORBIDDEN");
    const sub = (await c.query("SELECT id,discount_id FROM billing_subscription WHERE organization_id=$1 AND ended_on IS NULL AND auto_invoice FOR UPDATE", [a.organization_id])).rows[0] as { id: string; discount_id: string | null } | undefined;
    if (!sub) throw new AccessError("NOT_FOUND", 404);
    if (sub.discount_id) throw new AccessError("DISCOUNT_EXISTS", 409);
    const d = await claimDiscount(c, code);
    await c.query("UPDATE billing_subscription SET discount_id=$2,discount_cycles_left=$3 WHERE id=$1", [sub.id, d.id, d.cycles]);
    await audit(c, a.organization_id, p.userId, "billing.discount", sub.id, { code: d.code });
    await c.query("COMMIT");
    return { ok: true as const, code: d.code };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function sendReminder(c: PoolClient, inv: { id: string; organization_id: string; organization: string; number: string; amount_cents: number; due_on: string; reminders: number }, by: string | null) {
  const level = inv.reminders + 1;
  if (level > 3) throw new AccessError("REMINDERS_DONE", 409);
  const recipients = await notice(c, inv.organization_id, await presidencyOf(c, inv.organization_id), texts.reminder(level, inv.organization, inv.number, euros(inv.amount_cents), frDay(inv.due_on)), "/settings/subscription", `billing:${inv.id}:reminder:${level}`, "administrative");
  await c.query("UPDATE billing_invoice SET reminders=$2,last_reminder_at=now() WHERE id=$1", [inv.id, level]);
  await c.query("INSERT INTO billing_reminder(invoice_id,level,sent_by,recipients) VALUES($1,$2,$3,$4)", [inv.id, level, by, recipients]);
  return { level, recipients };
}
type InvoiceRow = { id: string; organization_id: string; organization: string; number: string; amount_cents: number; due_on: string; reminders: number; state: InvoiceState };
const lockInvoice = async (c: PoolClient, id: string) => {
  const r = (await c.query("SELECT i.id,i.organization_id,o.name AS organization,i.number,i.amount_cents,i.due_on::text AS due_on,i.reminders,i.state FROM billing_invoice i JOIN organization o ON o.id=i.organization_id WHERE i.id=$1 FOR UPDATE OF i", [id])).rows[0] as InvoiceRow | undefined;
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
};

/** A code taken twice: the console says so instead of a raw database error. */
const taken = (e: unknown): never => {
  if ((e as { code?: string }).code === "23505") throw new AccessError("DISCOUNT_CODE_TAKEN", 409);
  throw e;
};
export type ClaimedDiscount = { id: string; code: string; cycles: number | null; percent: number | null; amount_cents: number | null };
/**
 * 12/11/2026: a discount code given to a club, used once more. Refused the
 * same way whether it does not exist, is switched off, past its date or used
 * up: a club cannot tell which, nor guess the codes.
 */
export async function claimDiscount(c: PoolClient, raw: string): Promise<ClaimedDiscount> {
  const parsed = discountCode.safeParse(raw);
  if (!parsed.success) throw new AccessError("DISCOUNT_INVALID", 409);
  const d = (
    await c.query(
      `UPDATE billing_discount SET uses=uses+1
        WHERE code=$1 AND active AND (valid_until IS NULL OR valid_until>=$2::date) AND (max_uses IS NULL OR uses<max_uses)
        RETURNING id,code,cycles,percent,amount_cents`,
      [parsed.data, brusselsToday()],
    )
  ).rows[0] as ClaimedDiscount | undefined;
  if (!d) throw new AccessError("DISCOUNT_INVALID", 409);
  return d;
}

/** One invoice of a subscription for a period, lowered by its discount code while it has cycles left. */
async function issueInvoice(c: PoolClient, subscriptionId: string, periodFrom: string, periodTo: string, dueDays: number, by: string | null) {
  const s = (
    await c.query(
      `SELECT s.id,s.organization_id,s.created_by,o.name AS organization,p.name AS plan,p.amount_cents,p.basis,
              s.discount_cycles_left,d.code AS discount_code,d.percent,d.amount_cents AS discount_amount
         FROM billing_subscription s JOIN organization o ON o.id=s.organization_id JOIN billing_plan p ON p.id=s.plan_id
         LEFT JOIN billing_discount d ON d.id=s.discount_id
        WHERE s.id=$1 FOR UPDATE OF s`,
      [subscriptionId],
    )
  ).rows[0] as
    | { id: string; organization_id: string; created_by: string; organization: string; plan: string; amount_cents: number; basis: "organization" | "player"; discount_cycles_left: number | null; discount_code: string | null; percent: number | null; discount_amount: number | null }
    | undefined;
  if (!s) throw new AccessError("NOT_FOUND", 404);
  const today = brusselsToday();
  // Per player: the active players at the invoice's date; never fewer than one.
  const quantity = s.basis === "player" ? Math.max(1, (await c.query("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles)", [s.organization_id])).rows[0].n as number) : 1;
  const gross = quantity * s.amount_cents;
  const applies = !!s.discount_code && (s.discount_cycles_left === null || s.discount_cycles_left > 0);
  const off = applies ? discountOf(gross, { percent: s.percent, amount_cents: s.discount_amount }) : 0;
  if (applies && s.discount_cycles_left !== null) await c.query("UPDATE billing_subscription SET discount_cycles_left=discount_cycles_left-1 WHERE id=$1", [s.id]);
  const year = Number(today.slice(0, 4));
  const seq = ((await c.query("SELECT count(*)::int AS n FROM billing_invoice WHERE number LIKE $1", [`F-${year}-%`])).rows[0].n as number) + 1;
  const due = new Date(today + "T12:00:00Z");
  due.setUTCDate(due.getUTCDate() + dueDays);
  const number = invoiceNumber(year, seq);
  const label = `${s.plan} · ${frDay(periodFrom)} au ${frDay(periodTo)}${off ? ` · code ${s.discount_code} : -${euros(off)}` : ""}`;
  const id = (
    await c.query(
      `INSERT INTO billing_invoice(organization_id,subscription_id,number,label,period_from,period_to,quantity,unit_cents,amount_cents,issued_on,due_on,created_by,discount_cents,discount_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [s.organization_id, s.id, number, label, periodFrom, periodTo, quantity, s.amount_cents, gross - off, today, due.toISOString().slice(0, 10), by ?? s.created_by, off, off ? s.discount_code : ""],
    )
  ).rows[0].id as string;
  return { id, number, organization_id: s.organization_id, organization: s.organization, amount_cents: gross - off, discount_cents: off, due_on: due.toISOString().slice(0, 10), created_by: by ?? s.created_by };
}

/** A draft leaves: a Mollie link when configured, the notice to the presidency. Nothing to pay (a full discount): it is paid at once. */
async function sendInvoice(c: PoolClient, inv: { id: string; organization_id: string; organization: string; number: string; amount_cents: number; due_on: string }) {
  if (inv.amount_cents === 0) {
    await c.query("UPDATE billing_invoice SET state='paid',sent_at=now(),paid_on=CURRENT_DATE WHERE id=$1", [inv.id]);
    const recipients = await notice(c, inv.organization_id, await presidencyOf(c, inv.organization_id), texts.invoice(inv.organization, inv.number, euros(0), frDay(inv.due_on)), "/settings/subscription", `billing:${inv.id}:sent`, "administrative");
    return { recipients, mollie: "free" };
  }
  await c.query("UPDATE billing_invoice SET state='sent',sent_at=now() WHERE id=$1", [inv.id]);
  // Series B: a Mollie payment link when configured; the notice carries it. Mollie down: the invoice leaves anyway, by transfer.
  let link: { id: string; url: string } | null = null,
    mollie = "";
  try {
    link = await createPaymentLink(c, inv);
    mollie = link ? "link" : "off";
  } catch (e) {
    mollie = "error: " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  const recipients = await notice(c, inv.organization_id, await presidencyOf(c, inv.organization_id), texts.invoice(inv.organization, inv.number, euros(inv.amount_cents), frDay(inv.due_on), link?.url ?? ""), "/settings/subscription", `billing:${inv.id}:sent`, "administrative");
  return { recipients, mollie };
}

/** The day after a date, and a year on (the end of a yearly period). */
export const nextDay = (iso: string, days = 1) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const yearOn = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export async function billingExecute(db: Pool, p: Principal, command: BillingCommand) {
  return operatorScope(db, p, async (c, o) => {
    if (!canBill(o)) throw new AccessError("FORBIDDEN");
    const log = (organizationId: string | null, kind: string, payload: Record<string, unknown>, reason = "") =>
      c.query("INSERT INTO platform_action(operator_id,organization_id,kind,reason,payload) VALUES($1,$2,$3,$4,$5)", [o.userId, organizationId, kind, reason, JSON.stringify(payload)]);
    const today = brusselsToday();
    if (command.action === "plan") {
      const id = command.id
        ? (await c.query("UPDATE billing_plan SET code=$2,name=$3,amount_cents=$4,period=$5,basis=$6,active=$7 WHERE id=$1 RETURNING id", [command.id, command.code, command.name, command.amountCents, command.period, command.basis, command.active])).rows[0]?.id
        : (await c.query("INSERT INTO billing_plan(code,name,amount_cents,period,basis,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [command.code, command.name, command.amountCents, command.period, command.basis, command.active])).rows[0].id;
      if (!id) throw new AccessError("NOT_FOUND", 404);
      await log(null, "billing.plan", { id, code: command.code });
      return { ok: true as const, id: id as string };
    }
    if (command.action === "subscribe") {
      const plan = (await c.query("SELECT id,active FROM billing_plan WHERE id=$1", [command.planId])).rows[0] as { id: string; active: boolean } | undefined;
      if (!plan) throw new AccessError("NOT_FOUND", 404);
      if (!plan.active) throw new AccessError("PLAN_INACTIVE", 409);
      if (!(await c.query("SELECT 1 FROM organization WHERE id=$1", [command.organizationId])).rowCount) throw new AccessError("NOT_FOUND", 404);
      if ((await c.query("SELECT 1 FROM billing_subscription WHERE organization_id=$1 AND ended_on IS NULL", [command.organizationId])).rowCount) throw new AccessError("SUBSCRIPTION_EXISTS", 409);
      const id = (await c.query("INSERT INTO billing_subscription(organization_id,plan_id,started_on,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [command.organizationId, plan.id, command.startedOn, command.note, o.userId])).rows[0].id as string;
      await log(command.organizationId, "billing.subscribe", { id, planId: plan.id });
      await audit(c, command.organizationId, o.userId, "platform.subscription", id);
      return { ok: true as const, id };
    }
    if (command.action === "unsubscribe") {
      const r = await c.query("UPDATE billing_subscription SET ended_on=$2 WHERE id=$1 AND ended_on IS NULL AND started_on<=$2 RETURNING organization_id", [command.id, command.endedOn]);
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      await log(r.rows[0].organization_id, "billing.unsubscribe", { id: command.id, endedOn: command.endedOn });
      return { ok: true as const };
    }
    if (command.action === "invoice") {
      if (command.periodTo < command.periodFrom) throw new AccessError("INVALID_PERIOD", 409);
      const r = await issueInvoice(c, command.subscriptionId, command.periodFrom, command.periodTo, command.dueDays, o.userId);
      await log(r.organization_id, "billing.invoice", { id: r.id, number: r.number, amountCents: r.amount_cents, discountCents: r.discount_cents });
      return { ok: true as const, id: r.id };
    }
    if (command.action === "discount") {
      const values = [command.code, command.percent, command.amountCents, command.cycles, command.validUntil, command.maxUses, command.note, command.active];
      const id = command.id
        ? (await c.query("UPDATE billing_discount SET code=$2,percent=$3,amount_cents=$4,cycles=$5,valid_until=$6,max_uses=$7,note=$8,active=$9 WHERE id=$1 RETURNING id", [command.id, ...values]).catch(taken)).rows[0]?.id
        : (await c.query("INSERT INTO billing_discount(code,percent,amount_cents,cycles,valid_until,max_uses,note,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [...values, o.userId]).catch(taken)).rows[0].id;
      if (!id) throw new AccessError("NOT_FOUND", 404);
      await log(null, "billing.discount", { id, code: command.code, percent: command.percent, amountCents: command.amountCents, cycles: command.cycles, active: command.active });
      return { ok: true as const, id: id as string };
    }
    if (command.action === "applyDiscount") {
      const sub = (await c.query("SELECT id,organization_id FROM billing_subscription WHERE id=$1 AND ended_on IS NULL FOR UPDATE", [command.subscriptionId])).rows[0] as { id: string; organization_id: string } | undefined;
      if (!sub) throw new AccessError("NOT_FOUND", 404);
      const d = await claimDiscount(c, command.code);
      await c.query("UPDATE billing_subscription SET discount_id=$2,discount_cycles_left=$3 WHERE id=$1", [sub.id, d.id, d.cycles]);
      await log(sub.organization_id, "billing.discount.apply", { subscriptionId: sub.id, code: d.code });
      await audit(c, sub.organization_id, o.userId, "platform.discount", sub.id, { code: d.code });
      return { ok: true as const };
    }
    const inv = await lockInvoice(c, command.id);
    if (command.action === "send") {
      if (inv.state !== "draft") throw new AccessError("INVOICE_STATE", 409);
      const r = await sendInvoice(c, inv);
      await log(inv.organization_id, "billing.send", { id: inv.id, number: inv.number, recipients: r.recipients, mollie: r.mollie });
      await audit(c, inv.organization_id, o.userId, "platform.invoice", inv.id, { number: inv.number });
      return { ok: true as const, recipients: r.recipients };
    }
    if (command.action === "paid") {
      if (inv.state !== "sent") throw new AccessError("INVOICE_STATE", 409);
      await c.query("UPDATE billing_invoice SET state='paid',paid_on=$2,paid_via='manual' WHERE id=$1", [inv.id, command.paidOn]);
      await log(inv.organization_id, "billing.paid", { id: inv.id, number: inv.number, paidOn: command.paidOn });
      return { ok: true as const };
    }
    if (command.action === "cancel") {
      if (inv.state === "paid" || inv.state === "cancelled") throw new AccessError("INVOICE_STATE", 409);
      await c.query("UPDATE billing_invoice SET state='cancelled',cancelled_at=now() WHERE id=$1", [inv.id]);
      await log(inv.organization_id, "billing.cancel", { id: inv.id, number: inv.number });
      return { ok: true as const };
    }
    if (inv.state !== "sent") throw new AccessError("INVOICE_STATE", 409);
    const r = await sendReminder(c, inv, o.userId);
    await log(inv.organization_id, "billing.remind", { id: inv.id, number: inv.number, ...r });
    return { ok: true as const, ...r };
  });
}

/** Daily: the reminders due by the steps (3, 10 and 20 days after the due date), one step a day at most. */
export async function billingTick(db: Pool) {
  const c = await db.connect();
  let sent = 0;
  try {
    await c.query("BEGIN");
    const today = brusselsToday();
    const rows = (
      await c.query(
        "SELECT i.id,i.organization_id,o.name AS organization,i.number,i.amount_cents,i.due_on::text AS due_on,i.reminders FROM billing_invoice i JOIN organization o ON o.id=i.organization_id WHERE i.state='sent' AND i.reminders<3 AND i.due_on<CURRENT_DATE AND (i.last_reminder_at IS NULL OR i.last_reminder_at<now()-interval '1 day') ORDER BY i.due_on FOR UPDATE OF i SKIP LOCKED LIMIT 200",
      )
    ).rows as { id: string; organization_id: string; organization: string; number: string; amount_cents: number; due_on: string; reminders: number }[];
    for (const inv of rows) {
      if (!reminderDue(inv.due_on, today, inv.reminders)) continue;
      await sendReminder(c, inv, null);
      sent++;
    }
    sent += await autoInvoices(c, today);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return sent;
}

/**
 * 12/11/2026, a club without a federation: its trial ends, a notice seven
 * days before; on the day, the first year's invoice leaves by itself (30
 * days to pay, the Mollie link when configured), then one each year.
 */
async function autoInvoices(c: PoolClient, today: string) {
  let n = 0;
  const soon = (
    await c.query(
      `SELECT s.id,s.organization_id,o.name AS organization,s.trial_ends_on::text AS trial_ends_on
         FROM billing_subscription s JOIN organization o ON o.id=s.organization_id
        WHERE s.auto_invoice AND s.ended_on IS NULL AND s.trial_ends_on BETWEEN $1::date AND $1::date+7
          AND NOT EXISTS (SELECT 1 FROM billing_invoice i WHERE i.subscription_id=s.id AND i.state<>'cancelled')
        LIMIT 200`,
      [today],
    )
  ).rows as { id: string; organization_id: string; organization: string; trial_ends_on: string }[];
  for (const s of soon) n += await notice(c, s.organization_id, await presidencyOf(c, s.organization_id), texts.trial(s.organization, frDay(s.trial_ends_on)), "/settings/subscription", `billing:${s.id}:trial`, "administrative");
  const due = (
    await c.query(
      `SELECT s.id,COALESCE((SELECT max(i.period_to) FROM billing_invoice i WHERE i.subscription_id=s.id AND i.state<>'cancelled'),s.trial_ends_on-1)::text AS covered_to
         FROM billing_subscription s
        WHERE s.auto_invoice AND s.ended_on IS NULL AND s.trial_ends_on<=$1::date
          AND COALESCE((SELECT max(i.period_to) FROM billing_invoice i WHERE i.subscription_id=s.id AND i.state<>'cancelled'),s.trial_ends_on-1)<$1::date
        ORDER BY s.trial_ends_on FOR UPDATE OF s SKIP LOCKED LIMIT 100`,
      [today],
    )
  ).rows as { id: string; covered_to: string }[];
  for (const s of due) {
    const from = nextDay(s.covered_to);
    const inv = await issueInvoice(c, s.id, from, yearOn(from), 30, null);
    const r = await sendInvoice(c, inv);
    await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,reason,payload) VALUES($1,$2,'billing.auto','',$3)", [
      inv.created_by,
      inv.organization_id,
      JSON.stringify({ id: inv.id, number: inv.number, amountCents: inv.amount_cents, discountCents: inv.discount_cents, recipients: r.recipients, mollie: r.mollie }),
    ]);
    n++;
  }
  return n;
}
