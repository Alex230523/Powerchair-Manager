import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { unseal } from "./crypto";
import { allowed } from "./eligibility";
import { preferences, type Envelope } from "./queue";
import { DeliveryFailure, type Transport } from "./transport";
export async function recoverExpired(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const expired = await c.query(
      "SELECT id,claim_token,dispatch_started_at,transport_mode FROM mail_job WHERE state='processing' AND locked_until<now() FOR UPDATE SKIP LOCKED",
    );
    for (const job of expired.rows) {
      const state =
        job.dispatch_started_at && job.transport_mode !== "local"
          ? "uncertain"
          : "pending";
      await c.query(
        "UPDATE mail_job SET state=$2,claim_token=NULL,locked_until=NULL,error_code=$3,available_at=now() WHERE id=$1",
        [
          job.id,
          state,
          state === "uncertain" ? "LEASE_UNCERTAIN" : "LEASE_RECOVERED",
        ],
      );
      await c.query(
        "UPDATE mail_attempt SET finished_at=now(),outcome=$2,error_code=$3 WHERE id=$1",
        [job.claim_token, state, "LEASE_EXPIRED"],
      );
    }
    await c.query("COMMIT");
    return expired.rowCount;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function claim(pool: Pool, transport: Transport) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const candidate = (
      await c.query(
        "SELECT j.id FROM mail_job j LEFT JOIN notification_setting s ON s.organization_id=j.organization_id WHERE j.state='pending' AND j.available_at<=now() AND NOT COALESCE(s.paused,false) ORDER BY j.available_at,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!candidate) {
      await c.query("COMMIT");
      return null;
    }
    const token = randomUUID();
    const job = (
      await c.query(
        "UPDATE mail_job SET state='processing',attempts=attempts+1,claim_token=$2,locked_until=now()+interval '60 seconds',dispatch_started_at=NULL,transport_mode=$3 WHERE id=$1 RETURNING *",
        [candidate.id, token, transport.mode],
      )
    ).rows[0];
    await c.query("INSERT INTO mail_attempt(id,job_id) VALUES($1,$2)", [
      token,
      job.id,
    ]);
    await c.query("COMMIT");
    return job;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function finish(
  pool: Pool,
  job: { id: string; claim_token: string; attempts: number },
  state: string,
  errorCode: string | null = null,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await c.query(
      "UPDATE mail_job SET state=$3,error_code=$4,completed_at=CASE WHEN $3 IN ('local','sent','failed','cancelled') THEN now() ELSE NULL END,available_at=CASE WHEN $3='pending' THEN now()+($5::integer*interval '1 second') ELSE available_at END,claim_token=NULL,locked_until=NULL WHERE id=$1 AND claim_token=$2 AND state='processing' RETURNING id",
      [
        job.id,
        job.claim_token,
        state,
        errorCode,
        Math.min(3600, 10 * 2 ** Math.max(0, job.attempts - 1)),
      ],
    );
    if (result.rowCount)
      await c.query(
        "UPDATE mail_attempt SET finished_at=now(),outcome=$2,error_code=$3 WHERE id=$1",
        [job.claim_token, state, errorCode],
      );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function processOne(pool: Pool, transport: Transport) {
  const job = await claim(pool, transport);
  if (!job) return null;
  let envelope: Envelope;
  try {
    envelope = unseal<Envelope>(job.payload_ciphertext, job.dedupe_key);
  } catch {
    await finish(pool, job, "failed", "PAYLOAD_UNREADABLE");
    return { id: job.id, state: "failed" };
  }
  const guard = await pool.connect();
  let guardStarted = false;
  try {
    await guard.query("BEGIN");
    guardStarted = true;
    await guard.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    // Organization changes and account deactivation wait until this dispatch ends.
    if (job.organization_id)
      await guard.query("SELECT id FROM organization WHERE id=$1 FOR SHARE", [
        job.organization_id,
      ]);
    const recipient = job.recipient_user_id
      ? (
          await guard.query(
            'SELECT id,active FROM "user" WHERE id=$1 FOR SHARE',
            [job.recipient_user_id],
          )
        ).rows[0]
      : undefined;
    if (
      job.organization_id &&
      (
        await guard.query(
          "SELECT paused FROM notification_setting WHERE organization_id=$1",
          [job.organization_id],
        )
      ).rows[0]?.paused
    ) {
      await finish(pool, job, "pending", "PAUSED");
      return { id: job.id, state: "pending" };
    }
    if (!(await allowed(guard, job, envelope))) {
      // Auth callbacks may queue before the identity/token transaction commits.
      const settling =
        job.resource_type === "auth" &&
        job.attempts < 5 &&
        Date.now() - new Date(job.created_at).getTime() < 60000 &&
        (!recipient || (job.kind === "auth_reset" && recipient.active));
      const state = settling ? "pending" : "cancelled";
      await finish(
        pool,
        job,
        state,
        settling ? "AUTH_TRANSACTION_PENDING" : "ACCESS_REVOKED_OR_EXPIRED",
      );
      return { id: job.id, state };
    }
    if (
      job.organization_id &&
      job.recipient_user_id &&
      !(
        await preferences(
          guard,
          job.organization_id,
          job.recipient_user_id,
          job.category,
        )
      ).email
    ) {
      await finish(pool, job, "cancelled", "PREFERENCES");
      return { id: job.id, state: "cancelled" };
    }
    const started = await pool.query(
      "UPDATE mail_job SET dispatch_started_at=now() WHERE id=$1 AND claim_token=$2 AND state='processing' RETURNING id",
      [job.id, job.claim_token],
    );
    if (!started.rowCount) return { id: job.id, state: "abandoned" };
    const state = await transport.send(job.id, envelope);
    await finish(pool, job, state);
    return { id: job.id, state };
  } catch (e) {
    const failure =
      e instanceof DeliveryFailure
        ? e
        : new DeliveryFailure(
            transport.mode === "local" ? "retry" : "uncertain",
            "TRANSPORT_FAILURE",
          );
    const state =
      failure.disposition === "retry"
        ? job.attempts < 5
          ? "pending"
          : "failed"
        : failure.disposition;
    await finish(pool, job, state, failure.code);
    return { id: job.id, state };
  } finally {
    if (guardStarted) await guard.query("ROLLBACK");
    guard.release();
  }
}
