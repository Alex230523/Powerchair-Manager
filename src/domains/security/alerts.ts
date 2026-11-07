import type { Pool, PoolClient } from "pg";
import { logEvent } from "../../lib/log";
import { createTransport, type Transport } from "../notifications/transport";
import { eventKinds, type EventKind, type Severity } from "./events";
type Db = Pool | PoolClient;

/** The rules: so many events of these kinds within the window send an alert. */
export const alertRules = [
  { key: "critical", kinds: (Object.keys(eventKinds) as EventKind[]).filter((k) => eventKinds[k] === "critical"), threshold: 1, minutes: 15, fr: "Événement critique" },
  { key: "lockouts", kinds: ["auth.lockout"] as EventKind[], threshold: 3, minutes: 15, fr: "Adresses bloquées après des mots de passe faux (attaque par identifiants possible)" },
  { key: "flood", kinds: ["rate.limited"] as EventKind[], threshold: 10, minutes: 15, fr: "Demandes refusées pour excès (inondation possible)" },
  { key: "keys", kinds: ["key.invalid"] as EventKind[], threshold: 20, minutes: 15, fr: "Clés d'API ou MCP refusées (clés essayées)" },
  { key: "origin", kinds: ["request.bad_origin"] as EventKind[], threshold: 20, minutes: 15, fr: "Changements envoyés depuis un autre site (falsification de requête possible)" },
  { key: "borrow", kinds: ["support.borrow"] as EventKind[], threshold: 1, minutes: 15, fr: "Accès de support ouvert sur une organisation" },
] as const;

/** Who gets the alerts: the platform's owners, and OPS_ALERT_EMAIL if set. */
async function recipients(db: Db, env: Record<string, string | undefined>) {
  const owners = (await db.query(`SELECT u.email FROM platform_operator o JOIN "user" u ON u.id=o.user_id AND u.active WHERE o.role='owner' AND o.revoked_at IS NULL`)).rows.map((r) => r.email as string);
  return [...new Set([...owners, ...(env.OPS_ALERT_EMAIL ? [env.OPS_ALERT_EMAIL] : [])].map((e) => e.toLowerCase()))];
}

/**
 * Every five minutes (the « security » task): each rule over its window; an
 * alert at most once per rule and hour, straight through the transport (not
 * the mail queue, which may be what is stuck). Then the journal past twelve
 * months goes.
 */
export async function securityTick(db: Pool, env: Record<string, string | undefined> = process.env, transport: Transport = createTransport(env, env.MAIL_ALLOW_EXTERNAL === "true")) {
  let alerts = 0;
  const to = await recipients(db, env);
  for (const rule of alertRules) {
    const events = (
      await db.query(
        `SELECT kind,count(*)::int AS n,count(DISTINCT source)::int AS sources,min(created_at) AS first FROM security_event WHERE kind=ANY($1::text[]) AND created_at>now()-make_interval(mins=>$2) GROUP BY kind`,
        [rule.kinds, rule.minutes],
      )
    ).rows as { kind: string; n: number; sources: number; first: Date }[];
    const total = events.reduce((s, e) => s + e.n, 0);
    if (total < rule.threshold) continue;
    // One alert per rule and hour: the row is the lock.
    const claimed = await db.query("INSERT INTO security_alert(rule,hour,events,recipients) VALUES($1,date_trunc('hour',now()),$2,$3) ON CONFLICT DO NOTHING RETURNING rule", [rule.key, total, to.length]);
    if (!claimed.rowCount) continue;
    alerts++;
    logEvent("warn", "security.alert", { rule: rule.key, events: total });
    const lines = events.map((e) => `- ${e.kind} : ${e.n} (${e.sources} source(s)), depuis ${new Date(e.first).toISOString()}`);
    const text = `Powerchair Football Manager : alerte de sécurité.\n\n${rule.fr}, ${total} en ${rule.minutes} minutes.\n${lines.join("\n")}\n\nLe journal de sécurité est dans la console, onglet Supervision : ${env.BETTER_AUTH_URL ?? ""}/fr/console`;
    for (const email of to) {
      const id = (await db.query("INSERT INTO job_run(job) VALUES('alert') RETURNING id")).rows[0].id as string;
      try {
        await transport.send(id, { email, url: env.BETTER_AUTH_URL ?? "", subject: `Alerte de sécurité : ${rule.fr}`, text, html: `<pre>${text.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!)}</pre>` });
        await db.query("UPDATE job_run SET finished_at=now(),ok=true,summary=$2 WHERE id=$1", [id, JSON.stringify({ security: rule.key, events: total })]);
      } catch (e) {
        await db.query("UPDATE job_run SET finished_at=now(),ok=false,error_code=$2 WHERE id=$1", [id, e instanceof Error ? e.message.slice(0, 80) : "UNKNOWN"]);
      }
    }
  }
  const purged = (await db.query("DELETE FROM security_event WHERE created_at<now()-interval '12 months' - interval '1 day'")).rowCount ?? 0;
  await db.query("DELETE FROM security_alert WHERE sent_at<now()-interval '12 months'");
  return { alerts, recipients: to.length, purged };
}

/** The journal for the console: the latest events and alerts, sources as hashes. */
export async function securityJournal(db: Db) {
  const events = (
    await db.query(
      `SELECT e.id,e.kind,e.severity,e.source,e.details,e.created_at,o.name AS organization,u.name AS actor FROM security_event e
         LEFT JOIN organization o ON o.id=e.organization_id LEFT JOIN "user" u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT 100`,
    )
  ).rows as { id: string; kind: EventKind; severity: Severity; source: string; details: Record<string, unknown>; created_at: string; organization: string | null; actor: string | null }[];
  const day = (await db.query("SELECT severity,count(*)::int AS n FROM security_event WHERE created_at>now()-interval '24 hours' GROUP BY severity")).rows as { severity: Severity; n: number }[];
  const alerts = (await db.query("SELECT rule,events,recipients,sent_at FROM security_alert ORDER BY sent_at DESC LIMIT 20")).rows as { rule: string; events: number; recipients: number; sent_at: string }[];
  return { events, day, alerts };
}
