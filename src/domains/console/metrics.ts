import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AccessError, type Principal } from "../access/service";
import { createTransport } from "../notifications/transport";
import { jobStates, overdueMails } from "../jobs/health";
import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { firstReplyMedianHours } from "../support/stats";
import { operatorScope } from "./service";

/**
 * Console, series A (06/11/2026): the platform's figures kept day by day
 * (a snapshot every hour, one row per key and day), the trends the
 * dashboard reads from them (a year of months, the value 30 days ago), the
 * operators' daily alert by e-mail (rules they choose, from the hour they
 * choose, once a day, straight through the transport like the watchdog),
 * and the monthly report archived as a PDF.
 */
export const metricKeys = ["clubs", "federations", "accounts", "players", "coaches", "licences", "active7", "active30", "matches30", "storageBytes", "mrr", "open", "late", "lateCount", "subscriptions", "feedbackOpen", "dataRequestsOpen", "dataRequestsLate", "noPresident", "suspended", "jobsLate", "ticketsOpen", "ticketsFirstReplyHours"] as const;
export type MetricKey = (typeof metricKeys)[number];
const presidentRole = "r.role IN ('club_president','federation_president') AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())";

const n = async (c: PoolClient | Pool, sql: string, params: unknown[] = []) => Number((await c.query(sql, params)).rows[0].n ?? 0);
/** Today's figures, computed now. */
export async function computeMetrics(db: Pool): Promise<Record<string, number>> {
  const c = await db.connect();
  try {
    const out: Record<string, number> = {
      clubs: await n(c, "SELECT count(*)::int AS n FROM organization WHERE kind='club'"),
      federations: await n(c, "SELECT count(*)::int AS n FROM organization WHERE kind='federation'"),
      accounts: await n(c, 'SELECT count(*)::int AS n FROM "user" WHERE active'),
      players: await n(c, "SELECT count(*)::int AS n FROM club_person WHERE status='active' AND 'player'=ANY(directory_roles)"),
      coaches: await n(c, "SELECT count(*)::int AS n FROM club_person WHERE status='active' AND 'coach'=ANY(directory_roles)"),
      licences: await n(c, "SELECT count(*)::int AS n FROM license WHERE status='active'"),
      active7: await n(c, 'SELECT count(DISTINCT "userId")::int AS n FROM session WHERE "updatedAt">now()-interval \'7 days\''),
      active30: await n(c, 'SELECT count(DISTINCT "userId")::int AS n FROM session WHERE "updatedAt">now()-interval \'30 days\''),
      matches30: await n(c, "SELECT count(*)::int AS n FROM match WHERE status='played' AND starts_at>now()-interval '30 days'"),
      storageBytes: await n(c, "SELECT COALESCE(sum(size_bytes),0)::bigint AS n FROM storage_file"),
      mrr: await n(c, "SELECT COALESCE(sum(CASE WHEN p.period='year' THEN p.amount_cents/12.0 ELSE p.amount_cents END),0)::bigint AS n FROM billing_subscription s JOIN billing_plan p ON p.id=s.plan_id WHERE s.ended_on IS NULL"),
      open: await n(c, "SELECT COALESCE(sum(amount_cents),0)::bigint AS n FROM billing_invoice WHERE state='sent'"),
      late: await n(c, "SELECT COALESCE(sum(amount_cents),0)::bigint AS n FROM billing_invoice WHERE state='sent' AND due_on<CURRENT_DATE"),
      lateCount: await n(c, "SELECT count(*)::int AS n FROM billing_invoice WHERE state='sent' AND due_on<CURRENT_DATE"),
      subscriptions: await n(c, "SELECT count(*)::int AS n FROM billing_subscription WHERE ended_on IS NULL"),
      feedbackOpen: await n(c, "SELECT count(*)::int AS n FROM app_feedback WHERE state<>'fixed'"),
      // Series C: the tickets waiting for the operators, and the median delay of a first answer over 30 days.
      ticketsOpen: await n(c, "SELECT count(*)::int AS n FROM support_ticket WHERE state='open'"),
      ticketsFirstReplyHours: (await firstReplyMedianHours(c)) ?? 0,
      dataRequestsOpen: await n(c, "SELECT count(*)::int AS n FROM data_request WHERE status IN ('received','in_progress')"),
      dataRequestsLate: await n(c, "SELECT count(*)::int AS n FROM data_request WHERE status IN ('received','in_progress') AND due_on<CURRENT_DATE"),
      noPresident: await n(c, `SELECT count(*)::int AS n FROM organization o WHERE NOT EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=o.id AND ${presidentRole})`),
      suspended: await n(c, "SELECT count(*)::int AS n FROM organization WHERE suspended_at IS NOT NULL"),
    };
    out.jobsLate = (await jobStates(db)).filter((j) => j.late).length;
    // Clubs and players by country, for the multi-country console (series E reads them).
    for (const r of (await c.query("SELECT country_code AS country,count(*) FILTER (WHERE kind='club')::int AS clubs FROM organization GROUP BY country_code")).rows as { country: string; clubs: number }[]) out[`clubs:${r.country}`] = r.clubs;
    return out;
  } finally {
    c.release();
  }
}
/** The hourly snapshot: today's row for every key, overwritten through the day. */
export async function snapshotMetrics(db: Pool) {
  const m = await computeMetrics(db);
  const keys = Object.keys(m);
  await db.query("INSERT INTO platform_metric_daily(day,key,value) SELECT CURRENT_DATE,k,v FROM unnest($1::text[],$2::bigint[]) AS t(k,v) ON CONFLICT (day,key) DO UPDATE SET value=EXCLUDED.value", [keys, keys.map((k) => m[k])]);
  return keys.length;
}

export type Trend = { prev30: number | null; series: { month: string; value: number }[] };
/** For the dashboard: the value 30 days ago and the last value of each of the last twelve months. */
export async function trends(c: PoolClient, keys: readonly string[]): Promise<Record<string, Trend>> {
  const prev = (await c.query("SELECT DISTINCT ON (key) key,value FROM platform_metric_daily WHERE key=ANY($1::text[]) AND day<=CURRENT_DATE-30 ORDER BY key,day DESC", [keys])).rows as { key: string; value: string }[];
  const months = (
    await c.query(
      `SELECT DISTINCT ON (key,to_char(day,'YYYY-MM')) key,to_char(day,'YYYY-MM') AS month,value FROM platform_metric_daily
        WHERE key=ANY($1::text[]) AND day>=date_trunc('month',CURRENT_DATE)-interval '11 months' ORDER BY key,to_char(day,'YYYY-MM'),day DESC`,
      [keys],
    )
  ).rows as { key: string; month: string; value: string }[];
  const out: Record<string, Trend> = {};
  for (const k of keys) out[k] = { prev30: null, series: [] };
  for (const r of prev) out[r.key].prev30 = Number(r.value);
  for (const r of months) out[r.key].series.push({ month: r.month, value: Number(r.value) });
  return out;
}

/* Alerts. */
export const alertRules = ["jobsLate", "mailsOverdue", "dataRequestsLate", "invoicesFinalReminder", "noPresident", "suspended", "feedbackNew", "terminations", "ticketsWaiting"] as const;
export type AlertRule = (typeof alertRules)[number];
export const alertPrefCommand = z.object({ action: z.literal("alertPref"), email: z.boolean(), hour: z.number().int().min(0).max(23), rules: z.array(z.enum(alertRules)) });
export type AlertItem = { rule: AlertRule; count: number; detail: string };
/** What would be in the alert now, by rule. */
export async function alertItems(db: Pool): Promise<AlertItem[]> {
  const items: AlertItem[] = [];
  const late = (await jobStates(db)).filter((j) => j.late);
  if (late.length) items.push({ rule: "jobsLate", count: late.length, detail: late.map((j) => j.job).join(", ") });
  const overdue = await overdueMails(db);
  if (overdue) items.push({ rule: "mailsOverdue", count: overdue, detail: "" });
  const c = await db.connect();
  try {
    const rule = async (key: AlertRule, sql: string) => {
      const rows = (await c.query(sql)).rows as { name: string }[];
      if (rows.length) items.push({ rule: key, count: rows.length, detail: rows.slice(0, 6).map((r) => r.name).join(", ") + (rows.length > 6 ? "…" : "") });
    };
    await rule("dataRequestsLate", "SELECT o.name FROM data_request d JOIN organization o ON o.id=d.organization_id WHERE d.status IN ('received','in_progress') AND d.due_on<CURRENT_DATE ORDER BY d.due_on");
    await rule("invoicesFinalReminder", "SELECT o.name||' ('||i.number||')' AS name FROM billing_invoice i JOIN organization o ON o.id=i.organization_id WHERE i.state='sent' AND i.reminders>=3 ORDER BY i.due_on");
    await rule("noPresident", `SELECT o.name FROM organization o WHERE NOT EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=o.id AND ${presidentRole}) ORDER BY o.created_at DESC`);
    await rule("suspended", "SELECT name FROM organization WHERE suspended_at IS NOT NULL ORDER BY suspended_at DESC");
    await rule("feedbackNew", "SELECT COALESCE(o.name,'?')||' · '||f.kind AS name FROM app_feedback f LEFT JOIN organization o ON o.id=f.organization_id WHERE f.created_at>now()-interval '24 hours' ORDER BY f.created_at DESC");
    await rule("ticketsWaiting", "SELECT COALESCE(o.name,u.name)||' · '||t.subject AS name FROM support_ticket t JOIN \"user\" u ON u.id=t.user_id LEFT JOIN organization o ON o.id=t.organization_id WHERE t.state='open' AND t.last_message_at<now()-interval '24 hours' ORDER BY t.last_message_at");
    await rule("terminations", "SELECT o.name||' ('||t.effective_on||')' AS name FROM club_termination t JOIN organization o ON o.id=t.organization_id WHERE t.cancelled_at IS NULL AND t.completed_at IS NULL AND t.effective_on<=CURRENT_DATE+30 ORDER BY t.effective_on");
  } finally {
    c.release();
  }
  return items;
}
const brusselsHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Brussels" }).format(new Date()));
const ruleLabels: Record<AlertRule, string> = {
  jobsLate: "Tâches de fond en retard",
  mailsOverdue: "E-mails en attente depuis plus de 30 minutes",
  dataRequestsLate: "Demandes RGPD hors délai",
  invoicesFinalReminder: "Factures au dernier rappel",
  noPresident: "Organisations sans président actif",
  suspended: "Organisations suspendues",
  feedbackNew: "Signalements reçus depuis 24 heures",
  terminations: "Fermetures programmées sous 30 jours",
  ticketsWaiting: "Tickets de support sans réponse depuis 24 heures",
};
/** Hourly: every operator who wants the alert, from their hour, once a day, when something is there. */
export async function alertTick(db: Pool, env: Record<string, string | undefined> = process.env) {
  const hour = brusselsHour();
  const operators = (
    await db.query(
      `SELECT o.user_id,u.email,u.name,COALESCE(p.email,true) AS wants,COALESCE(p.hour,7) AS hour,COALESCE(p.rules,$1::text[]) AS rules FROM platform_operator o JOIN "user" u ON u.id=o.user_id AND u.active
         LEFT JOIN platform_alert_pref p ON p.operator_id=o.user_id WHERE o.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM platform_alert_log l WHERE l.operator_id=o.user_id AND l.day=CURRENT_DATE)`,
      [[...alertRules]],
    )
  ).rows as { user_id: string; email: string; name: string; wants: boolean; hour: number; rules: AlertRule[] }[];
  const due = operators.filter((o) => o.wants && hour >= o.hour && o.rules.length);
  if (!due.length) return 0;
  const items = await alertItems(db);
  if (!items.length) return 0;
  const transport = createTransport(env, env.MAIL_ALLOW_EXTERNAL === "true");
  let sent = 0;
  for (const o of due) {
    const mine = items.filter((i) => o.rules.includes(i.rule));
    if (!mine.length) continue;
    const lines = mine.map((i) => `- ${ruleLabels[i.rule]} : ${i.count}${i.detail ? ` (${i.detail})` : ""}`);
    const text = `Powerchair Football Manager, console : à faire aujourd'hui.\n\n${lines.join("\n")}\n\nOuvrir la console : ${env.BETTER_AUTH_URL ?? ""}/fr/console`;
    const id = (await db.query("INSERT INTO job_run(job) VALUES('alert') RETURNING id")).rows[0].id as string;
    try {
      await transport.send(id, { email: o.email, url: env.BETTER_AUTH_URL ?? "", subject: `Console : ${mine.reduce((s, i) => s + i.count, 0)} point(s) à voir aujourd'hui`, text, html: `<pre>${text.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!)}</pre>` });
      await db.query("UPDATE job_run SET finished_at=now(),ok=true,summary=$2 WHERE id=$1", [id, JSON.stringify({ operator: o.user_id, items: mine.length })]);
      await db.query("INSERT INTO platform_alert_log(operator_id,day,items) VALUES($1,CURRENT_DATE,$2) ON CONFLICT DO NOTHING", [o.user_id, JSON.stringify(mine)]);
      sent++;
    } catch (e) {
      await db.query("UPDATE job_run SET finished_at=now(),ok=false,error_code=$2 WHERE id=$1", [id, e instanceof Error ? e.message.slice(0, 80) : "UNKNOWN"]);
    }
  }
  return sent;
}
export async function alertPrefView(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c, o) => {
    const row = (await c.query("SELECT email,hour,rules FROM platform_alert_pref WHERE operator_id=$1", [o.userId])).rows[0] as { email: boolean; hour: number; rules: AlertRule[] } | undefined;
    const last = (await c.query("SELECT day::text AS day,items FROM platform_alert_log WHERE operator_id=$1 ORDER BY day DESC LIMIT 1", [o.userId])).rows[0] as { day: string; items: AlertItem[] } | undefined;
    return { email: row?.email ?? true, hour: row?.hour ?? 7, rules: row?.rules ?? [...alertRules], allRules: [...alertRules], last: last ?? null, now: await alertItems(db) };
  });
}
export async function alertPrefSave(db: Pool, p: Principal, input: z.infer<typeof alertPrefCommand>) {
  return operatorScope(db, p, async (c, o) => {
    await c.query("INSERT INTO platform_alert_pref(operator_id,email,hour,rules) VALUES($1,$2,$3,$4) ON CONFLICT (operator_id) DO UPDATE SET email=EXCLUDED.email,hour=EXCLUDED.hour,rules=EXCLUDED.rules,updated_at=now()", [o.userId, input.email, input.hour, input.rules]);
    return { ok: true as const };
  });
}

/* The monthly report. */
const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const monthLabel = (iso: string) => new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
export type ReportSummary = { month: string; end: Record<string, number>; start: Record<string, number>; billing: { invoiced: number; collected: number; invoices: number; reminders: number }; interventions: number; borrows: number; dataRequests: { received: number; done: number }; feedback: number; jobsFailed: number; countries: { country: string; clubs: number }[] };
/** The figures of one month (first day given), from the snapshots and the journals. */
export async function reportSummary(db: Pool, month: string): Promise<ReportSummary> {
  const c = await db.connect();
  try {
    const pick = async (when: "first" | "last") =>
      Object.fromEntries(
        ((await c.query(`SELECT DISTINCT ON (key) key,value FROM platform_metric_daily WHERE day>=$1::date AND day<$1::date+interval '1 month' ORDER BY key,day ${when === "first" ? "ASC" : "DESC"}`, [month])).rows as { key: string; value: string }[]).map((r) => [r.key, Number(r.value)]),
      ) as Record<string, number>;
    const end = await pick("last"),
      start = await pick("first");
    const b = (
      await c.query(
        `SELECT COALESCE(sum(amount_cents) FILTER (WHERE state IN ('sent','paid') AND issued_on>=$1::date AND issued_on<$1::date+interval '1 month'),0)::bigint AS invoiced,
                COALESCE(sum(amount_cents) FILTER (WHERE state='paid' AND paid_on>=$1::date AND paid_on<$1::date+interval '1 month'),0)::bigint AS collected,
                count(*) FILTER (WHERE issued_on>=$1::date AND issued_on<$1::date+interval '1 month')::int AS invoices FROM billing_invoice`,
        [month],
      )
    ).rows[0];
    const inMonth = (col: string) => `${col}>=$1::date AND ${col}<$1::date+interval '1 month'`;
    const reminders = await n(c, `SELECT count(*)::int AS n FROM billing_reminder WHERE ${inMonth("sent_at")}`, [month]);
    const interventions = await n(c, `SELECT count(*)::int AS n FROM platform_action WHERE ${inMonth("created_at")}`, [month]);
    const borrows = await n(c, `SELECT count(*)::int AS n FROM platform_borrow WHERE ${inMonth("started_at")}`, [month]);
    const dr = (await c.query(`SELECT count(*) FILTER (WHERE ${inMonth("created_at")})::int AS received,count(*) FILTER (WHERE status='done' AND handled_at IS NOT NULL AND ${inMonth("handled_at")})::int AS done FROM data_request`, [month])).rows[0];
    const feedback = await n(c, `SELECT count(*)::int AS n FROM app_feedback WHERE ${inMonth("created_at")}`, [month]);
    const jobsFailed = await n(c, `SELECT count(*)::int AS n FROM job_run WHERE ok=false AND ${inMonth("started_at")}`, [month]);
    const countries = Object.entries(end)
      .filter(([k]) => k.startsWith("clubs:"))
      .map(([k, v]) => ({ country: k.slice(6), clubs: v }))
      .sort((x, y) => y.clubs - x.clubs);
    return { month, end, start, billing: { invoiced: Number(b.invoiced), collected: Number(b.collected), invoices: b.invoices, reminders }, interventions, borrows, dataRequests: { received: dr.received, done: dr.done }, feedback, jobsFailed, countries };
  } finally {
    c.release();
  }
}
export function reportLines(s: ReportSummary): PdfLine[] {
  const v = (k: string) => s.end[k] ?? 0;
  const delta = (k: string) => {
    const a = s.start[k],
      b = s.end[k];
    return a === undefined || b === undefined ? "" : ` (${b - a >= 0 ? "+" : ""}${b - a} sur le mois)`;
  };
  const lines: PdfLine[] = [
    { text: `Rapport d'exploitation · ${monthLabel(s.month)}`, size: 20, bold: true, gap: 6 },
    { text: "Powerchair Football Manager · console de la plateforme", size: 10, gap: 14 },
    { text: "Clients", size: 14, bold: true, gap: 4 },
    { text: `Clubs : ${v("clubs")}${delta("clubs")}` },
    { text: `Fédérations : ${v("federations")}${delta("federations")}` },
    { text: `Abonnements en cours : ${v("subscriptions")}${delta("subscriptions")}`, gap: 4 },
    ...s.countries.map((x) => ({ text: `${x.country} : ${x.clubs} club(s)`, indent: 12 })),
    { text: "Personnes et usage", size: 14, bold: true, gap: 4 },
    { text: `Comptes actifs : ${v("accounts")}${delta("accounts")}` },
    { text: `Joueurs actifs : ${v("players")}${delta("players")} · coachs : ${v("coaches")} · licences actives : ${v("licences")}` },
    { text: `Actifs sur 30 jours : ${v("active30")} · sur 7 jours : ${v("active7")}` },
    { text: `Matchs joués sur 30 jours : ${v("matches30")}`, gap: 4 },
    { text: "Revenus", size: 14, bold: true, gap: 4 },
    { text: `Revenu mensuel récurrent en fin de mois : ${euros(v("mrr"))}${s.start.mrr !== undefined ? ` (début de mois : ${euros(s.start.mrr)})` : ""}` },
    { text: `Facturé : ${euros(s.billing.invoiced)} (${s.billing.invoices} facture(s)) · encaissé : ${euros(s.billing.collected)}` },
    { text: `À encaisser en fin de mois : ${euros(v("open"))} dont en retard : ${euros(v("late"))} (${v("lateCount")} facture(s)) · rappels envoyés : ${s.billing.reminders}`, gap: 4 },
    { text: "Support et conformité", size: 14, bold: true, gap: 4 },
    { text: `Signalements reçus : ${s.feedback} · ouverts en fin de mois : ${v("feedbackOpen")}` },
    { text: `Demandes RGPD reçues : ${s.dataRequests.received} · traitées : ${s.dataRequests.done} · en cours : ${v("dataRequestsOpen")} · hors délai : ${v("dataRequestsLate")}` },
    { text: `Organisations sans président actif : ${v("noPresident")} · suspendues : ${v("suspended")}`, gap: 4 },
    { text: "Exploitation", size: 14, bold: true, gap: 4 },
    { text: `Interventions des opérateurs : ${s.interventions} · accès de support ouverts : ${s.borrows}` },
    { text: `Exécutions de tâches en échec : ${s.jobsFailed} · tâches en retard en fin de mois : ${v("jobsLate")}` },
    { text: `Stockage : ${(v("storageBytes") / 1048576).toFixed(1)} Mo`, gap: 10 },
    { text: "Chiffres issus des relevés quotidiens de la console (platform_metric_daily) et des journaux de la plateforme.", size: 9 },
  ];
  return lines;
}
/** On the first days of a month: the previous month's report, once. */
export async function monthlyReportTick(db: Pool) {
  const month = (await db.query("SELECT to_char(date_trunc('month',CURRENT_DATE)-interval '1 month','YYYY-MM-DD') AS m")).rows[0].m as string;
  if ((await db.query("SELECT 1 FROM platform_report WHERE month=$1", [month])).rowCount) return 0;
  if (!(await db.query("SELECT 1 FROM platform_metric_daily WHERE day>=$1::date AND day<$1::date+interval '1 month' LIMIT 1", [month])).rowCount) return 0;
  await generateReport(db, month);
  return 1;
}
export async function generateReport(db: Pool, month: string) {
  const summary = await reportSummary(db, month);
  const pdf = pdfDocument(reportLines(summary), `Rapport ${monthLabel(month)}`, { footer: [{ text: `Powerchair Football Manager · rapport d'exploitation · ${monthLabel(month)}`, size: 8 }] });
  const id = (await db.query("INSERT INTO platform_report(month,summary,pdf) VALUES($1,$2,$3) ON CONFLICT (month) DO UPDATE SET summary=EXCLUDED.summary,pdf=EXCLUDED.pdf,generated_at=now() RETURNING id", [month, JSON.stringify(summary), Buffer.from(pdf)])).rows[0].id as string;
  return { id, summary };
}
export async function reportsView(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c) => ({
    reports: (await c.query("SELECT id,month::text AS month,generated_at,summary FROM platform_report ORDER BY month DESC LIMIT 36")).rows as { id: string; month: string; generated_at: string; summary: ReportSummary }[],
    months: (await c.query("SELECT DISTINCT to_char(date_trunc('month',day),'YYYY-MM-DD') AS m FROM platform_metric_daily WHERE day<date_trunc('month',CURRENT_DATE) ORDER BY m DESC LIMIT 36")).rows.map((r) => r.m as string),
  }));
}
export async function reportPdf(db: Pool, p: Principal, id: string) {
  return operatorScope(db, p, async (c) => {
    const r = (await c.query("SELECT month::text AS month,pdf FROM platform_report WHERE id=$1", [id])).rows[0] as { month: string; pdf: Buffer } | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return r;
  });
}
export async function reportGenerate(db: Pool, p: Principal, month: string) {
  return operatorScope(db, p, async (c, o) => {
    if (o.role !== "owner" && o.role !== "finance") throw new AccessError("FORBIDDEN");
    const r = await generateReport(db, month);
    await c.query("INSERT INTO platform_action(operator_id,kind,payload) VALUES($1,'report.generate',$2)", [o.userId, JSON.stringify({ month })]);
    return { ok: true as const, id: r.id };
  });
}
