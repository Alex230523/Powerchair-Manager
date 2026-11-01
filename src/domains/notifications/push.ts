import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { unseal } from "./crypto";
import { allowed } from "./eligibility";
import { encryptPayload, vapidAuthorization, vapidFromEnv, type Subscription } from "./webpush";
import { AccessError, type Principal } from "../access/service";
import { pushCopy, pushTopics, type PushTopic } from "../../components/push-copy";
import { groupPayload, type PushPayload } from "./push-queue";

/**
 * B4: push notifications on the phone (PWA), a third channel next to the
 * e-mail and the application. Rights and preferences are read again when a
 * line leaves, like the e-mails; close notifications are grouped into one;
 * expired devices are removed. The person's devices and topics.
 */
type Locale = "fr" | "nl" | "en";

/* ---------- Delivery ---------- */
export type PushSender = { mode: "local" | "web"; send: (sub: Subscription, payload: PushPayload) => Promise<number> };
/** Push services a device may point at (no other host is ever called). */
const services = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export const knownService = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && services.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
};
export function createPushSender(env: Record<string, string | undefined> = process.env): PushSender | null {
  const vapid = vapidFromEnv(env);
  const mode = env.PUSH_TRANSPORT ?? (vapid && env.NODE_ENV === "production" ? "web" : env.PFM_LOCAL_MAIL === "true" || env.NODE_ENV !== "production" ? "local" : "disabled");
  if (mode === "local")
    return {
      mode,
      async send(sub, payload) {
        // Development and tests: each notification is a file, like the local mails.
        const dir = env.PFM_PUSH_DIR ?? ".local/push";
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(`${dir}/${randomUUID()}.json`, JSON.stringify({ endpoint: sub.endpoint, ...payload }, null, 2), { mode: 0o600 });
        return 201;
      },
    };
  if (mode !== "web" || !vapid) return null;
  return {
    mode: "web",
    async send(sub, payload) {
      if (!knownService(sub.endpoint)) return 410;
      const r = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          Authorization: vapidAuthorization(sub.endpoint, vapid),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: payload.urgent ? "3600" : "86400",
          Urgency: payload.urgent ? "high" : "normal",
          Topic: createHash("sha256").update(payload.tag).digest("base64url").slice(0, 32),
        },
        body: new Uint8Array(encryptPayload(sub, JSON.stringify(payload))),
        signal: AbortSignal.timeout(10000),
      });
      return r.status;
    },
  };
}

/**
 * Sends the oldest waiting notification, with the others of the same
 * person and club waiting since less than two minutes (grouped into one).
 * Expired devices (404, 410) are removed.
 */
export async function processPush(pool: Pool, sender: PushSender) {
  const c = await pool.connect();
  let jobs: { id: string; organization_id: string; recipient_user_id: string; topic: string; kind: string; category: string; resource_type: string; resource_id: string; payload_ciphertext: string; dedupe_key: string; attempts: number }[] = [];
  const token = randomUUID();
  try {
    await c.query("BEGIN");
    const first = (await c.query("SELECT * FROM push_job WHERE state='pending' AND available_at<=now() ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if (!first) {
      await c.query("COMMIT");
      return null;
    }
    const others =
      // An urgent change and each child's invitation (with its buttons) stay alone.
      first.topic === "urgent" || first.topic === "invitation"
        ? []
        : (
            await c.query(
              "SELECT * FROM push_job WHERE state='pending' AND available_at<=now() AND id<>$1 AND recipient_user_id=$2 AND organization_id=$3 AND topic NOT IN ('urgent','invitation') AND created_at BETWEEN $4::timestamptz-interval '2 minutes' AND $4::timestamptz+interval '2 minutes' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 19",
              [first.id, first.recipient_user_id, first.organization_id, first.created_at],
            )
          ).rows;
    jobs = [first, ...others];
    await c.query("UPDATE push_job SET state='processing',attempts=attempts+1,claim_token=$2,locked_until=now()+interval '60 seconds' WHERE id=ANY($1::uuid[])", [jobs.map((j) => j.id), token]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  const finish = (ids: string[], state: string, code: string | null = null, retry = false) =>
    ids.length
      ? pool.query(
          "UPDATE push_job SET state=$3,error_code=$4,claim_token=NULL,locked_until=NULL,completed_at=CASE WHEN $3 IN ('sent','grouped','cancelled','failed') THEN now() END,available_at=CASE WHEN $5 THEN now()+interval '2 minutes'*attempts ELSE available_at END WHERE id=ANY($1::uuid[]) AND claim_token=$2",
          [ids, token, state, code, retry],
        )
      : null;
  // Rights and preferences again, at the time of sending.
  const live: typeof jobs = [];
  for (const j of jobs) {
    const ok =
      (await allowed(pool, { organization_id: j.organization_id, recipient_user_id: j.recipient_user_id, resource_type: j.resource_type as never, resource_id: j.resource_id, kind: j.kind, category: j.category as never })) &&
      (
        await pool.query(
          "SELECT 1 FROM person p WHERE p.user_id=$2 AND p.notifications_enabled AND COALESCE((SELECT enabled FROM push_preference WHERE organization_id=$1 AND user_id=$2 AND topic=$3),true)",
          [j.organization_id, j.recipient_user_id, j.topic],
        )
      ).rowCount;
    if (ok) live.push(j);
    else await finish([j.id], "cancelled", "ACCESS_OR_PREFERENCE");
  }
  if (!live.length) return { state: "cancelled", jobs: jobs.length };
  const payloads = live.map((j) => unseal<PushPayload & { locale: Locale }>(j.payload_ciphertext, j.dedupe_key));
  const org = (await pool.query("SELECT name FROM organization WHERE id=$1", [live[0].organization_id])).rows[0]?.name ?? "";
  const payload = groupPayload(payloads, payloads[0].locale, org);
  const devices = (await pool.query("SELECT id,endpoint,p256dh,auth FROM push_subscription WHERE user_id=$1", [live[0].recipient_user_id])).rows as (Subscription & { id: string })[];
  let delivered = 0,
    removed = 0,
    retry = false;
  for (const d of devices) {
    let status = 0;
    try {
      status = await sender.send(d, payload);
    } catch {
      status = 0;
    }
    if (status >= 200 && status < 300) {
      delivered++;
      await pool.query("UPDATE push_subscription SET last_success_at=now(),failures=0 WHERE id=$1", [d.id]);
    } else if (status === 404 || status === 410) {
      // The device was unsubscribed or expired: forgotten.
      await pool.query("DELETE FROM push_subscription WHERE id=$1", [d.id]);
      removed++;
    } else {
      retry ||= status === 0 || status === 429 || status >= 500;
      await pool.query("UPDATE push_subscription SET failures=failures+1 WHERE id=$1", [d.id]);
    }
  }
  const [head, ...rest] = live.map((j) => j.id);
  if (delivered) {
    await finish([head], "sent");
    await finish(rest, "grouped");
    return { state: "sent", jobs: live.length, devices: delivered };
  }
  if (removed === devices.length) {
    await finish([head, ...rest], "cancelled", "NO_DEVICE");
    return { state: "cancelled", jobs: live.length };
  }
  const again = retry && live[0].attempts < 5;
  await finish([head, ...rest], again ? "pending" : "failed", "PUSH_FAILED", again);
  return { state: again ? "pending" : "failed", jobs: live.length };
}
/** Lines stuck in « processing » (a crash) are retried. */
export async function recoverPush(pool: Pool) {
  return (await pool.query("UPDATE push_job SET state='pending',claim_token=NULL,locked_until=NULL WHERE state='processing' AND locked_until<now()")).rowCount ?? 0;
}

/* ---------- The person's settings ---------- */
const subscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine(knownService, "UNKNOWN_PUSH_SERVICE"),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{86,88}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{21,24}$/),
  label: z.string().trim().max(120).default(""),
});
export const pushCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), subscription: subscriptionSchema }),
  z.object({ action: z.literal("unsubscribe"), endpoint: z.url().max(1000) }),
  z.object({ action: z.literal("remove"), id: z.uuid() }),
  z.object({ action: z.literal("preference"), organizationId: z.uuid(), topic: z.enum(pushTopics as [PushTopic, ...PushTopic[]]), enabled: z.boolean() }),
  z.object({ action: z.literal("test") }),
]);
export type PushCommand = z.infer<typeof pushCommand>;

export async function pushView(db: Pool, p: Principal, env: Record<string, string | undefined> = process.env) {
  const vapid = vapidFromEnv(env);
  const devices = (await db.query("SELECT id,endpoint,label,created_at,last_success_at FROM push_subscription WHERE user_id=$1 ORDER BY created_at", [p.userId])).rows as { id: string; endpoint: string; label: string; created_at: string; last_success_at: string | null }[];
  const clubs = (
    await db.query(
      `SELECT o.id,o.name,COALESCE(json_object_agg(pp.topic,pp.enabled) FILTER (WHERE pp.topic IS NOT NULL),'{}') AS prefs
         FROM organization_membership m JOIN organization o ON o.id=m.organization_id LEFT JOIN push_preference pp ON pp.organization_id=m.organization_id AND pp.user_id=m.user_id
        WHERE m.user_id=$1 AND m.active GROUP BY o.id,o.name ORDER BY o.name`,
      [p.userId],
    )
  ).rows as { id: string; name: string; prefs: Partial<Record<PushTopic, boolean>> }[];
  return {
    publicKey: vapid?.publicKey ?? null,
    devices: devices.map((d) => ({ id: d.id, endpoint: d.endpoint, label: d.label, created_at: d.created_at, last_success_at: d.last_success_at })),
    clubs: clubs.map((c) => ({ id: c.id, name: c.name, topics: Object.fromEntries(pushTopics.map((t) => [t, c.prefs[t] ?? true])) as Record<PushTopic, boolean> })),
  };
}

export async function pushExecute(db: Pool, p: Principal, cmd: PushCommand, sender: PushSender | null) {
  switch (cmd.action) {
    case "subscribe": {
      const s = cmd.subscription;
      // A device belongs to one account: signing in with another account moves it.
      const r = await db.query(
        "INSERT INTO push_subscription(user_id,endpoint,p256dh,auth,label) VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,label=EXCLUDED.label,failures=0 RETURNING id",
        [p.userId, s.endpoint, s.p256dh, s.auth, s.label],
      );
      return { id: r.rows[0].id as string };
    }
    case "unsubscribe":
      await db.query("DELETE FROM push_subscription WHERE endpoint=$1 AND user_id=$2", [cmd.endpoint, p.userId]);
      return { id: null };
    case "remove": {
      const r = await db.query("DELETE FROM push_subscription WHERE id=$1 AND user_id=$2", [cmd.id, p.userId]);
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      return { id: cmd.id };
    }
    case "preference": {
      const r = await db.query(
        "INSERT INTO push_preference(organization_id,user_id,topic,enabled) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM organization_membership WHERE organization_id=$1 AND user_id=$2 AND active) ON CONFLICT(organization_id,user_id,topic) DO UPDATE SET enabled=EXCLUDED.enabled",
        [cmd.organizationId, p.userId, cmd.topic, cmd.enabled],
      );
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      return { id: cmd.organizationId };
    }
    case "test": {
      if (!sender) throw new AccessError("PUSH_NOT_CONFIGURED", 409);
      const devices = (await db.query("SELECT id,endpoint,p256dh,auth FROM push_subscription WHERE user_id=$1", [p.userId])).rows as (Subscription & { id: string })[];
      if (!devices.length) throw new AccessError("NO_DEVICE", 409);
      const locale = ((await db.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale ?? "fr") as Locale;
      let sent = 0;
      for (const d of devices) {
        const status = await sender.send(d, { title: "Powerchair Football Manager", body: pushCopy[locale].messages.test, url: `/${locale}/settings/notifications`, tag: "pfm-test" }).catch(() => 0);
        if (status >= 200 && status < 300) sent++;
        else if (status === 404 || status === 410) await db.query("DELETE FROM push_subscription WHERE id=$1", [d.id]);
      }
      return { id: null, sent };
    }
  }
}

