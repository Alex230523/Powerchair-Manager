import type { Pool, PoolClient } from "pg";

/**
 * Console, series B (06/11/2026): Mollie payment links for the platform's
 * invoices. A link is created when the invoice is sent (Bancontact, SEPA
 * and cards follow the Mollie account), put in the notice and on the
 * organisation's page; Mollie calls the webhook with the link's id, the
 * link is read back from the API (never trusted from the call itself),
 * and a paid link marks the invoice paid, which stops the reminders.
 * Nothing of a card ever comes here. Without MOLLIE_API_KEY, nothing of
 * this runs and payments stay by hand.
 */
export type Env = Record<string, string | undefined>;
export type Fetch = typeof fetch;
export const mollieConfigured = (env: Env = process.env) => /^(test|live)_[A-Za-z0-9]{20,}$/.test(env.MOLLIE_API_KEY ?? "");
export const mollieMode = (env: Env = process.env) => (!mollieConfigured(env) ? null : env.MOLLIE_API_KEY!.startsWith("test_") ? ("test" as const) : ("live" as const));
const API = "https://api.mollie.com/v2";
const euros = (cents: number) => (cents / 100).toFixed(2);

type Link = { id: string; status?: string; paidAt?: string | null; expiresAt?: string | null; amount?: { value: string; currency: string }; _links?: { paymentLink?: { href: string } } };
export class MollieError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function call(env: Env, f: Fetch, method: "GET" | "POST", path: string, body?: unknown): Promise<Link> {
  const r = await f(`${API}${path}`, { method, headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new MollieError(r.status, `Mollie ${method} ${path}: ${r.status}`);
  return (await r.json()) as Link;
}

/** A payment link for the invoice, stored on it; null when Mollie is not configured. */
export async function createPaymentLink(c: PoolClient, inv: { id: string; number: string; amount_cents: number; organization: string }, env: Env = process.env, f: Fetch = fetch) {
  if (!mollieConfigured(env)) return null;
  const base = (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  const link = await call(env, f, "POST", "/payment-links", {
    amount: { currency: "EUR", value: euros(inv.amount_cents) },
    description: `${inv.number} · ${inv.organization}`.slice(0, 255),
    redirectUrl: `${base}/fr/club/billing`,
    webhookUrl: `${base}/api/billing/mollie`,
    reusable: false,
  });
  const url = link._links?.paymentLink?.href ?? "";
  await c.query("UPDATE billing_invoice SET mollie_link_id=$2,pay_url=$3 WHERE id=$1", [inv.id, link.id, url.slice(0, 300)]);
  return { id: link.id, url };
}

/** The webhook: Mollie says a link changed; we read it back and act on what the API says. */
export async function mollieWebhook(db: Pool, linkId: string, env: Env = process.env, f: Fetch = fetch) {
  if (!/^pl_[A-Za-z0-9]+$/.test(linkId)) return { outcome: "ignored" as const };
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const inv = (await c.query("SELECT id,state,number,organization_id FROM billing_invoice WHERE mollie_link_id=$1 FOR UPDATE", [linkId])).rows[0] as { id: string; state: string; number: string; organization_id: string } | undefined;
    let outcome = "unknown-link";
    let status = "";
    if (inv) {
      const link = await call(env, f, "GET", `/payment-links/${linkId}`);
      status = link.paidAt ? "paid" : (link.status ?? "");
      if (link.paidAt && inv.state === "sent") {
        await c.query("UPDATE billing_invoice SET state='paid',paid_on=$2::date,paid_via='mollie' WHERE id=$1", [inv.id, link.paidAt.slice(0, 10)]);
        outcome = "paid";
      } else if (link.paidAt) outcome = "already-" + inv.state;
      else outcome = "not-paid";
    }
    await c.query("INSERT INTO billing_webhook(provider,external_id,invoice_id,status,outcome) VALUES('mollie',$1,$2,$3,$4)", [linkId, inv?.id ?? null, status, outcome]);
    await c.query("COMMIT");
    return { outcome };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
