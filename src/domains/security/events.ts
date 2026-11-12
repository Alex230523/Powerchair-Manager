import type { Pool, PoolClient } from "pg";
import { logEvent } from "../../lib/log";

/**
 * Security (07/11/2026), missing logging and alerting. The platform kept
 * each club's journal (audit_log) and the operators' (platform_action), but
 * what an attacker leaves behind went nowhere durable: an address locked
 * after ten wrong passwords, a flood refused, a key guessed, a request from
 * another site, a wrong scheduler secret. The host's logs keep an hour on a
 * free plan. Now each such event is written to the security journal (an
 * account, or the hash of an address, never the address), copied as one
 * JSON line to the host's logs, and the rules below send the platform's
 * owners an e-mail within minutes, once per rule and hour.
 */
export const eventKinds = {
  /** An address refused after ten wrong passwords in fifteen minutes. */
  "auth.lockout": "warning",
  /** A platform operator signed in (the accounts that can do the most). */
  "auth.operator_signin": "info",
  /** A flood refused (the first refusal of a window). */
  "rate.limited": "warning",
  /** An API or MCP key refused: unknown, revoked, orphaned. */
  "key.invalid": "warning",
  /** A change sent from another site (a forged form). */
  "request.bad_origin": "warning",
  /** The scheduler's door knocked with a wrong secret. */
  "cron.unauthorized": "critical",
  /** The platform's operators: who can do the most. */
  "operator.added": "critical",
  "operator.revoked": "warning",
  "operator.key_created": "warning",
  /** A support access opened on an organisation. */
  "support.borrow": "warning",
  /** A whole file of an organisation's data taken out. */
  "data.export": "info",
} as const;
export type EventKind = keyof typeof eventKinds;
export type Severity = (typeof eventKinds)[EventKind];
type Db = Pool | PoolClient;

/** Writes one event; never breaks the request that reports it. */
export async function securityEvent(db: Db, kind: EventKind, e: { organizationId?: string | null; actorId?: string | null; source?: string; details?: Record<string, string | number | boolean | null> } = {}) {
  const severity = eventKinds[kind];
  const details = e.details ?? {};
  logEvent(severity === "info" ? "info" : "warn", `security.${kind}`, { severity, source: e.source ?? "", organization: e.organizationId ?? "", ...details });
  try {
    await db.query("INSERT INTO security_event(kind,severity,organization_id,actor_id,source,details) VALUES($1,$2,$3,$4,$5,$6)", [
      kind,
      severity,
      e.organizationId ?? null,
      e.actorId ?? null,
      (e.source ?? "").slice(0, 100),
      JSON.stringify(details),
    ]);
  } catch (err) {
    logEvent("error", "security.journal_failed", { kind, code: err instanceof Error ? err.name : "unknown" });
  }
}

