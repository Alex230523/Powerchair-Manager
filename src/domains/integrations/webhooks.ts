import type { Pool, PoolClient } from "pg";
import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { unseal } from "../notifications/crypto";

/**
 * B6: webhooks. An event of the club (a registration validated, a match
 * result validated, a document expired, a payment reconciled) is written
 * once per subscribed hook, in the same transaction as the change; a
 * background task posts it, signed with HMAC SHA-256, and retries with a
 * growing delay. A delivery replayed keeps its id, so the receiver can
 * recognise it. Only public HTTPS addresses are ever called.
 */
export const webhookEvents = ["registration.validated", "match.validated", "document.expired", "payment.reconciled"] as const;
export type WebhookEvent = (typeof webhookEvents)[number];
type Db = Pool | PoolClient;

/** Writes the event for each active hook of the club that listens to it (once per hook and key). */
export async function emitWebhook(c: Db, org: string, event: WebhookEvent, key: string, data: Record<string, unknown>, delaySeconds = 0) {
  const hooks = (await c.query("SELECT id FROM webhook WHERE organization_id=$1 AND active AND $2=ANY(events)", [org, event])).rows as { id: string }[];
  for (const h of hooks)
    await c.query(
      "INSERT INTO webhook_delivery(webhook_id,organization_id,event,event_key,payload,next_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(secs=>$6)) ON CONFLICT (webhook_id,event_key) DO NOTHING",
      [h.id, org, event, key.slice(0, 200), JSON.stringify({ event, organization: org, occurred_at: new Date().toISOString(), data }), delaySeconds],
    );
  return hooks.length;
}

/** « sha256=<hex> » of « <timestamp>.<body> » with the hook's secret. Pure. */
export function signature(secret: string, timestamp: string, body: string) {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
/** What a receiver does: the same signature, compared in constant time, and a recent timestamp. Pure. */
export function verifySignature(secret: string, timestamp: string, body: string, header: string, now = Date.now(), toleranceSeconds = 300) {
  const expected = Buffer.from(signature(secret, timestamp, body)),
    given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given) && Math.abs(now / 1000 - Number(timestamp)) <= toleranceSeconds;
}
/** Loopback, private, link-local, shared and reserved addresses are never called. Pure. */
export function privateAddress(ip: string) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s.startsWith("::ffff:")) return privateAddress(s.slice(7));
    return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("ff");
  }
  return true;
}
/** An address a hook may use: HTTPS, a name (not an IP), not a local name. Pure. */
export function acceptableUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && !isIP(host.replace(/^\[|\]$/g, "")) && host.includes(".") && !/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host);
  } catch {
    return false;
  }
}
/** At sending time, the name must not lead to a private address (DNS rebinding included). */
async function resolvesPublic(raw: string) {
  const host = new URL(raw).hostname;
  const addresses = await lookup(host, { all: true }).catch(() => []);
  return addresses.length > 0 && addresses.every((a) => !privateAddress(a.address));
}

export type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<number>;
const httpPost: Poster = async (url, body, headers) => {
  if (!(await resolvesPublic(url))) return -1;
  const r = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10000) });
  return r.status;
};
/** The waiting deliveries: sent, or retried later (1, 2, 4… minutes, six attempts), with the journal kept. */
export async function webhookTick(db: Pool, post: Poster = httpPost, now = () => Date.now()) {
  let sent = 0;
  const due = (
    await db.query(
      "SELECT d.id,d.event,d.payload,d.attempts,w.url,w.secret_sealed,w.id AS webhook_id FROM webhook_delivery d JOIN webhook w ON w.id=d.webhook_id AND w.organization_id=d.organization_id WHERE d.state='pending' AND d.next_at<=now() AND w.active ORDER BY d.next_at LIMIT 50",
    )
  ).rows as { id: string; event: string; payload: unknown; attempts: number; url: string; secret_sealed: string; webhook_id: string }[];
  for (const d of due) {
    // Claimed one by one: two runs never send the same delivery at once.
    const claim = await db.query("UPDATE webhook_delivery SET attempts=attempts+1,next_at=now()+interval '5 minutes' WHERE id=$1 AND state='pending' AND attempts=$2 RETURNING attempts", [d.id, d.attempts]);
    if (!claim.rowCount) continue;
    const body = JSON.stringify({ id: d.id, ...(d.payload as object) });
    const timestamp = String(Math.floor(now() / 1000));
    let status = 0,
      error = "";
    try {
      if (!acceptableUrl(d.url)) status = -1;
      else
        status = await post(d.url, body, {
          "Content-Type": "application/json",
          "User-Agent": "PowerchairFootballManager-Webhook/1",
          "X-PFM-Event": d.event,
          "X-PFM-Delivery": d.id,
          "X-PFM-Timestamp": timestamp,
          "X-PFM-Signature": signature(unseal<string>(d.secret_sealed, "webhook:" + d.webhook_id), timestamp, body),
        });
    } catch (e) {
      error = (e instanceof Error ? e.message : "ERROR").slice(0, 300);
    }
    if (status === -1) error = "UNSAFE_ADDRESS";
    const attempts = claim.rows[0].attempts as number;
    if (status >= 200 && status < 300) {
      await db.query("UPDATE webhook_delivery SET state='sent',last_status=$2,last_error='',delivered_at=now() WHERE id=$1", [d.id, status]);
      sent++;
    } else
      await db.query("UPDATE webhook_delivery SET state=$2,last_status=$3,last_error=$4,next_at=now()+make_interval(mins=>$5) WHERE id=$1", [
        d.id,
        attempts >= 6 || status === -1 ? "failed" : "pending",
        status > 0 ? status : null,
        error || `HTTP_${status}`,
        2 ** Math.min(attempts - 1, 10),
      ]);
  }
  return sent;
}
