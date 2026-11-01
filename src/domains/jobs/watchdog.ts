import type { Pool } from "pg";
import { createTransport } from "../notifications/transport";
import { jobStates, overdueMails } from "./health";
import type { Env } from "./registry";

/**
 * B2: a task that has not run for two cycles, or mails stuck for more than
 * 30 minutes, send one email to the operator (OPS_ALERT_EMAIL), at most
 * once a day. Sent straight through the transport, not through the queue
 * that may be the one stuck.
 */
export async function watchdog(db: Pool, env: Env) {
  const late = (await jobStates(db, env)).filter((j) => j.late && j.job !== "watchdog");
  const overdue = await overdueMails(db);
  if (!late.length && overdue === 0) return { late: 0, overdue: 0, alerted: 0 };
  const to = env.OPS_ALERT_EMAIL;
  const recent = (await db.query("SELECT 1 FROM job_run WHERE job='alert' AND ok AND started_at>now()-interval '24 hours' LIMIT 1")).rowCount;
  if (!to || recent) return { late: late.length, overdue, alerted: 0 };
  const lines = [
    ...late.map((j) => `- ${j.job}: dernière exécution réussie ${j.lastOk ?? "jamais"} (attendue toutes les ${j.every} min)`),
    ...(overdue ? [`- ${overdue} email(s) en attente depuis plus de 30 minutes`] : []),
  ];
  const text = `Powerchair Manager : une tâche de fond est en retard.\n\n${lines.join("\n")}\n\nVoir docs/PRODUCTION.md, « En cas d'incident ».`;
  const transport = createTransport(env, env.MAIL_ALLOW_EXTERNAL === "true");
  const id = (await db.query("INSERT INTO job_run(job) VALUES('alert') RETURNING id")).rows[0].id as string;
  try {
    await transport.send(id, { email: to, url: env.BETTER_AUTH_URL ?? "", subject: "Powerchair Manager : tâche de fond en retard", text, html: `<pre>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</pre>` });
    await db.query("UPDATE job_run SET finished_at=now(),ok=true,summary=$2 WHERE id=$1", [id, JSON.stringify({ late: late.length, overdue })]);
    return { late: late.length, overdue, alerted: 1 };
  } catch (e) {
    await db.query("UPDATE job_run SET finished_at=now(),ok=false,error_code=$2 WHERE id=$1", [id, e instanceof Error ? e.message.slice(0, 80) : "UNKNOWN"]);
    throw e;
  }
}
