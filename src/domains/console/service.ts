import type { Pool, PoolClient } from "pg";
import { AccessError, audit, type Principal } from "../access/service";
import { notice } from "../notifications/notice";
import { trends } from "./metrics";
import { firstReplyMedianHours } from "../support/stats";
import { jobStates, overdueMails } from "../jobs/health";

/**
 * Console, step 1 (05/11/2026): the platform's operators, outside every
 * organisation. The console reads counts and states (never a player's
 * personal data), lists the organisations and their officers, keeps
 * internal notes, and writes every intervention in platform_action and in
 * the organisation's own audit journal. Operators come from the table, or
 * from PFM_OPERATOR_EMAILS (owners) so the first one can get in.
 */
import { consoleCommand, keyReview, onboardingSteps, operatorRoles, operatorSessionHours, type ConsoleCommand, type OnboardingStep, type OperatorRole } from "./schema";
export { consoleCommand, operatorRoles, type ConsoleCommand, type OperatorRole };

export type Operator = { userId: string; name: string; role: OperatorRole };
export function envOperators(env: Record<string, string | undefined> = process.env) {
  return (env.PFM_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
async function operatorOf(c: PoolClient, p: Principal): Promise<Operator> {
  const u = (await c.query('SELECT u.id,u.name,lower(u.email) AS email,o.role FROM "user" u LEFT JOIN platform_operator o ON o.user_id=u.id AND o.revoked_at IS NULL WHERE u.id=$1 AND u.active', [p.userId])).rows[0] as
    | { id: string; name: string; email: string; role: OperatorRole | null }
    | undefined;
  if (!u) throw new AccessError("FORBIDDEN");
  const role: OperatorRole | null = u.role ?? (envOperators().includes(u.email) ? "owner" : null);
  if (!role) throw new AccessError("FORBIDDEN");
  await consoleSession(c, p, u.id);
  return { userId: u.id, name: u.name, role };
}
/**
 * Series D: the console wants a session younger than PFM_OPERATOR_SESSION_HOURS (12): past that, the
 * operator signs in again (the application itself stays open). Every console session is journaled with
 * the address and the browser the session carries; a key of the MCP server has no session and no journal here.
 */
async function consoleSession(c: PoolClient, p: Principal, userId: string) {
  if (p.sessionId.startsWith("mcp:")) return;
  const s = (await c.query('SELECT "createdAt" AS created_at,COALESCE("ipAddress",\'\') AS ip,COALESCE("userAgent",\'\') AS ua FROM session WHERE id=$1 AND "userId"=$2', [p.sessionId, userId])).rows[0] as { created_at: Date; ip: string; ua: string } | undefined;
  if (!s) return;
  if (Date.now() - new Date(s.created_at).getTime() > operatorSessionHours() * 3600000) throw new AccessError("OPERATOR_SESSION_EXPIRED");
  await c.query(
    `INSERT INTO operator_session_log(session_id,operator_id,started_at,ip,user_agent,calls) VALUES($1,$2,$3,left($4,64),left($5,300),1)
       ON CONFLICT (session_id) DO UPDATE SET last_console_at=now(),calls=operator_session_log.calls+1`,
    [p.sessionId, userId, s.created_at, s.ip, s.ua],
  );
}
export const canWrite = (o: Operator) => o.role === "owner" || o.role === "support";
/** Owner and finance keep the books of the platform. */
export const canBill = (o: Operator) => o.role === "owner" || o.role === "finance";
export async function operatorScope<T>(db: Pool, p: Principal, fn: (c: PoolClient, o: Operator) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const o = await operatorOf(c, p);
    const out = await fn(c, o);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** Is this account an operator? For the shell, without throwing. */
export async function isOperator(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    await operatorOf(c, p);
    return true;
  } catch {
    return false;
  } finally {
    c.release();
  }
}

const n = async (c: PoolClient, sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0].n as number;
/** The presidency of a club or a federation, with their account, for the notices of the console. */
export async function presidencyOf(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT DISTINCT u.id AS user_id,u.email,u.name,pe.locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.role IN ('club_president','federation_president') AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
          AND NOT EXISTS(SELECT 1 FROM platform_operator o WHERE o.user_id=u.id AND o.revoked_at IS NULL)`,
      [org],
    )
  ).rows as { user_id: string; email: string; name: string; locale: string | null }[];
}
/** The migrations applied by scripts/migrate.mjs; a test schema has no such table. */
async function migrations(c: PoolClient, limit: number) {
  const has = (await c.query("SELECT to_regclass('schema_migrations') IS NOT NULL AS ok")).rows[0].ok as boolean;
  if (!has) return [] as { name: string; applied_at: string }[];
  return (await c.query("SELECT name,applied_at FROM schema_migrations ORDER BY name DESC LIMIT $1", [limit])).rows as { name: string; applied_at: string }[];
}
const presidentRole = "r.role IN ('club_president','federation_president') AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())";

export type Todo = { key: string; count: number; organizations: { id: string; name: string }[] };
async function todos(c: PoolClient): Promise<Todo[]> {
  const rule = async (key: string, sql: string) => {
    const rows = (await c.query(sql)).rows as { id: string; name: string }[];
    return { key, count: rows.length, organizations: rows.slice(0, 8) };
  };
  return [
    await rule("noPresident", `SELECT o.id,o.name FROM organization o WHERE NOT EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=o.id AND ${presidentRole}) ORDER BY o.created_at DESC`),
    await rule(
      "inactive60",
      `SELECT o.id,o.name FROM organization o WHERE o.kind='club' AND o.created_at<now()-interval '60 days' AND NOT EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=o.id AND a.created_at>now()-interval '60 days') ORDER BY o.name`,
    ),
    await rule(
      "seasonEnding",
      `SELECT o.id,o.name FROM organization o WHERE o.kind='club' AND EXISTS(SELECT 1 FROM season s WHERE s.organization_id=o.id AND s.ends_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30)
         AND NOT EXISTS(SELECT 1 FROM season s2 WHERE s2.organization_id=o.id AND s2.ends_on>CURRENT_DATE+30) ORDER BY o.name`,
    ),
    await rule("dataRequestsLate", `SELECT DISTINCT o.id,o.name FROM data_request d JOIN organization o ON o.id=d.organization_id WHERE d.status IN ('received','in_progress') AND d.due_on<CURRENT_DATE ORDER BY o.name`),
    await rule("terminations", `SELECT o.id,o.name FROM club_termination t JOIN organization o ON o.id=t.organization_id WHERE t.cancelled_at IS NULL AND t.completed_at IS NULL ORDER BY t.effective_on`),
    await rule("apiKeysIdle", `SELECT DISTINCT o.id,o.name FROM api_key k JOIN organization o ON o.id=k.organization_id WHERE k.revoked_at IS NULL AND COALESCE(k.last_used_at,k.created_at)<now()-interval '90 days' ORDER BY o.name`),
    await rule("noDpa", `SELECT o.id,o.name FROM organization o WHERE o.kind='club' AND NOT EXISTS(SELECT 1 FROM club_dpa_acceptance d WHERE d.organization_id=o.id) ORDER BY o.name`),
    await rule("suspended", "SELECT o.id,o.name FROM organization o WHERE o.suspended_at IS NOT NULL ORDER BY o.suspended_at DESC"),
    await rule("invoicesLate", "SELECT DISTINCT o.id,o.name FROM billing_invoice i JOIN organization o ON o.id=i.organization_id WHERE i.state='sent' AND i.due_on<CURRENT_DATE ORDER BY o.name"),
  ];
}

export async function consoleHome(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c, o) => {
    const byKind = (await c.query("SELECT kind,count(*)::int AS n FROM organization GROUP BY kind")).rows as { kind: string; n: number }[];
    const byCountry = (await c.query("SELECT country_code AS country,count(*) FILTER (WHERE kind='federation')::int AS federations,count(*) FILTER (WHERE kind='club')::int AS clubs FROM organization GROUP BY country_code ORDER BY country_code")).rows as {
      country: string;
      federations: number;
      clubs: number;
    }[];
    const jobs = await jobStates(db);
    return {
      operator: { name: o.name, role: o.role },
      generatedAt: new Date().toISOString(),
      organizations: {
        clubs: byKind.find((k) => k.kind === "club")?.n ?? 0,
        federations: byKind.find((k) => k.kind === "federation")?.n ?? 0,
        newThisMonth: await n(c, "SELECT count(*)::int AS n FROM organization WHERE created_at>=date_trunc('month',now())"),
        byCountry,
      },
      people: {
        accounts: await n(c, 'SELECT count(*)::int AS n FROM "user" WHERE active'),
        players: await n(c, "SELECT count(*)::int AS n FROM club_person WHERE status='active' AND 'player'=ANY(directory_roles)"),
        coaches: await n(c, "SELECT count(*)::int AS n FROM club_person WHERE status='active' AND 'coach'=ANY(directory_roles)"),
        referees: await n(c, "SELECT count(DISTINCT user_id)::int AS n FROM role_assignment WHERE role='referee' AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now())"),
        licences: await n(c, "SELECT count(*)::int AS n FROM license WHERE status='active'"),
      },
      activity: {
        active7: await n(c, 'SELECT count(DISTINCT "userId")::int AS n FROM session WHERE "updatedAt">now()-interval \'7 days\''),
        active30: await n(c, 'SELECT count(DISTINCT "userId")::int AS n FROM session WHERE "updatedAt">now()-interval \'30 days\''),
        matches30: await n(c, "SELECT count(*)::int AS n FROM match WHERE status='played' AND starts_at>now()-interval '30 days'"),
        mails7: await n(c, "SELECT count(*)::int AS n FROM mail_job WHERE created_at>now()-interval '7 days' AND state IN ('sent','local')"),
        storageBytes: Number((await c.query("SELECT COALESCE(sum(size_bytes),0)::bigint AS n FROM storage_file")).rows[0].n),
      },
      health: {
        jobsLate: jobs.filter((j) => j.late).length,
        jobs: jobs.length,
        mailsOverdue: await overdueMails(db),
        mailsFailed7: await n(c, "SELECT count(*)::int AS n FROM mail_job WHERE created_at>now()-interval '7 days' AND state='failed'"),
        lastMigration: (await migrations(c, 1))[0]?.name ?? null,
      },
      support: {
        feedbackOpen: await n(c, "SELECT count(*)::int AS n FROM app_feedback WHERE state<>'fixed'"),
        feedbackWeek: await n(c, "SELECT count(*)::int AS n FROM app_feedback WHERE created_at>now()-interval '7 days'"),
        // Series C: the support desk.
        ticketsOpen: await n(c, "SELECT count(*)::int AS n FROM support_ticket WHERE state='open'"),
        ticketsWaiting24: await n(c, "SELECT count(*)::int AS n FROM support_ticket WHERE state='open' AND last_message_at<now()-interval '24 hours'"),
        firstReplyHours: await firstReplyMedianHours(c),
        dataRequestsOpen: await n(c, "SELECT count(*)::int AS n FROM data_request WHERE status IN ('received','in_progress')"),
        dataRequestsLate: await n(c, "SELECT count(*)::int AS n FROM data_request WHERE status IN ('received','in_progress') AND due_on<CURRENT_DATE"),
      },
      billing: {
        invoicedMonth: await n(c, "SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state IN ('sent','paid') AND issued_on>=date_trunc('month',CURRENT_DATE)"),
        paidMonth: await n(c, "SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state='paid' AND paid_on>=date_trunc('month',CURRENT_DATE)"),
        open: await n(c, "SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state='sent'"),
        late: await n(c, "SELECT COALESCE(sum(amount_cents),0)::int AS n FROM billing_invoice WHERE state='sent' AND due_on<CURRENT_DATE"),
        lateCount: await n(c, "SELECT count(*)::int AS n FROM billing_invoice WHERE state='sent' AND due_on<CURRENT_DATE"),
        subscriptions: await n(c, "SELECT count(*)::int AS n FROM billing_subscription WHERE ended_on IS NULL"),
      },
      compliance: {
        noPresident: await n(c, `SELECT count(*)::int AS n FROM organization o WHERE NOT EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=o.id AND ${presidentRole})`),
        noDpa: await n(c, "SELECT count(*)::int AS n FROM organization o WHERE o.kind='club' AND NOT EXISTS(SELECT 1 FROM club_dpa_acceptance d WHERE d.organization_id=o.id)"),
        minorsWithoutGuardian: await n(
          c,
          `SELECT count(*)::int AS n FROM club_person cp WHERE cp.status='active' AND cp.birth_date>CURRENT_DATE-interval '18 years' AND 'player'=ANY(cp.directory_roles)
             AND NOT EXISTS(SELECT 1 FROM guardian_relationship g WHERE g.subject_profile_id=cp.id)`,
        ),
        terminationsPending: await n(c, "SELECT count(*)::int AS n FROM club_termination WHERE cancelled_at IS NULL AND completed_at IS NULL"),
      },
      // Series A: the value 30 days ago and a year of months, from the daily snapshots.
      trends: await trends(c, ["clubs", "players", "accounts", "active30", "matches30", "mrr", "open", "late", "subscriptions", "feedbackOpen", "dataRequestsOpen"]),
      todos: await todos(c),
      recentActions: (
        await c.query(
          'SELECT a.id,a.kind,a.reason,a.created_at,u.name AS operator,o.name AS organization FROM platform_action a JOIN "user" u ON u.id=a.operator_id LEFT JOIN organization o ON o.id=a.organization_id ORDER BY a.created_at DESC LIMIT 20',
        )
      ).rows as { id: string; kind: string; reason: string; created_at: string; operator: string; organization: string | null }[],
    };
  });
}

export type OrganizationRow = {
  id: string;
  name: string;
  kind: "club" | "federation";
  country: string;
  federation: string | null;
  created_at: string;
  members: number;
  players: number;
  presidents: number;
  last_activity: string | null;
  disabled_modules: number;
  suspended_at: string | null;
};
export async function consoleOrganizations(db: Pool, p: Principal, raw: { q?: string; kind?: string; country?: string }) {
  return operatorScope(db, p, async (c) => {
    const q = (raw.q ?? "").trim().slice(0, 80);
    const rows = (
      await c.query(
        `SELECT o.id,o.name,o.kind,o.country_code AS country,f.name AS federation,o.created_at,
                (SELECT count(*)::int FROM organization_membership m WHERE m.organization_id=o.id AND m.active) AS members,
                (SELECT count(*)::int FROM club_person cp WHERE cp.organization_id=o.id AND cp.status='active' AND 'player'=ANY(cp.directory_roles)) AS players,
                (SELECT count(*)::int FROM role_assignment r WHERE r.organization_id=o.id AND ${presidentRole}) AS presidents,
                (SELECT max(a.created_at) FROM audit_log a WHERE a.organization_id=o.id) AS last_activity,
                COALESCE(array_length(o.disabled_modules,1),0) AS disabled_modules,o.suspended_at
           FROM organization o LEFT JOIN organization f ON f.id=o.federation_id
          WHERE ($1='' OR o.name ILIKE '%'||$1||'%') AND ($2='' OR o.kind=$2) AND ($3='' OR o.country_code=$3)
          ORDER BY o.kind DESC,lower(o.name) LIMIT 500`,
        [q, raw.kind === "club" || raw.kind === "federation" ? raw.kind : "", /^[A-Z]{2}$/.test(raw.country ?? "") ? raw.country : ""],
      )
    ).rows as OrganizationRow[];
    const countries = (await c.query("SELECT DISTINCT country_code AS code FROM organization ORDER BY code")).rows.map((r) => r.code as string);
    return { organizations: rows, countries };
  });
}

/** Series D: what happened to the organisation on the platform, newest first (no personal data but the officers' names). */
export type TimelineEvent = { at: string; kind: string; label: string };
async function timeline(c: PoolClient, org: string): Promise<TimelineEvent[]> {
  return (
    await c.query(
      `SELECT at,kind,label FROM (
         SELECT created_at AS at,'created' AS kind,'' AS label FROM organization WHERE id=$1
         UNION ALL SELECT r.valid_from,'president',u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.role IN ('club_president','federation_president') AND r.revoked_at IS NULL
         UNION ALL SELECT d.accepted_at,'dpa','' FROM club_dpa_acceptance d WHERE d.organization_id=$1
         UNION ALL SELECT s.started_on::timestamptz,'subscription',p.name FROM billing_subscription s JOIN billing_plan p ON p.id=s.plan_id WHERE s.organization_id=$1
         UNION ALL SELECT s.ended_on::timestamptz,'subscription.end',p.name FROM billing_subscription s JOIN billing_plan p ON p.id=s.plan_id WHERE s.organization_id=$1 AND s.ended_on IS NOT NULL
         UNION ALL SELECT i.sent_at,'invoice.sent',i.number FROM billing_invoice i WHERE i.organization_id=$1 AND i.sent_at IS NOT NULL
         UNION ALL SELECT i.paid_on::timestamptz,'invoice.paid',i.number FROM billing_invoice i WHERE i.organization_id=$1 AND i.paid_on IS NOT NULL
         UNION ALL SELECT a.created_at,'action.'||a.kind,u.name FROM platform_action a JOIN "user" u ON u.id=a.operator_id WHERE a.organization_id=$1 AND a.kind<>'note'
         UNION ALL SELECT d.created_at,'privacy.'||d.kind,'' FROM data_request d WHERE d.organization_id=$1
         UNION ALL SELECT d.handled_at,'privacy.'||d.status,'' FROM data_request d WHERE d.organization_id=$1 AND d.handled_at IS NOT NULL AND d.status IN ('done','refused')
         UNION ALL SELECT t.created_at,'ticket',t.category FROM support_ticket t WHERE t.organization_id=$1
         UNION ALL SELECT t.requested_at,'termination',t.effective_on::text FROM club_termination t WHERE t.organization_id=$1
         UNION ALL SELECT s.starts_on::timestamptz,'season',s.name FROM season s WHERE s.organization_id=$1
       ) e WHERE at IS NOT NULL ORDER BY at DESC LIMIT 60`,
      [org],
    )
  ).rows as TimelineEvent[];
}
/** Series D: the first steps, done or not, for the console to see where a newcomer stands. */
async function onboarding(c: PoolClient, org: string, kind: "club" | "federation") {
  const q = async (sql: string) => Boolean((await c.query(sql, [org])).rowCount);
  const checks: Record<OnboardingStep, () => Promise<boolean>> = {
    president: () => q(`SELECT 1 FROM role_assignment r WHERE r.organization_id=$1 AND ${presidentRole} LIMIT 1`),
    dpa: () => q("SELECT 1 FROM club_dpa_acceptance WHERE organization_id=$1 LIMIT 1"),
    identity: () => q("SELECT 1 FROM organization WHERE id=$1 AND company_number<>'' AND address<>''"),
    season: () => q("SELECT 1 FROM season WHERE organization_id=$1 LIMIT 1"),
    team: () => q("SELECT 1 FROM team WHERE organization_id=$1 AND NOT archived LIMIT 1"),
    players: () => q("SELECT 1 FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles) LIMIT 1"),
    match: () => q("SELECT 1 FROM match WHERE organization_id=$1 LIMIT 1"),
    subscription: () => q("SELECT 1 FROM billing_subscription WHERE organization_id=$1 AND ended_on IS NULL LIMIT 1"),
    paid: () => q("SELECT 1 FROM billing_invoice WHERE organization_id=$1 AND state='paid' LIMIT 1"),
    clubs: () => q("SELECT 1 FROM organization WHERE federation_id=$1 AND kind='club' LIMIT 1"),
    policy: () => q("SELECT 1 FROM federation_policy WHERE federation_id=$1 LIMIT 1"),
    competition: () => q("SELECT 1 FROM tournament WHERE organization_id=$1 LIMIT 1"),
  };
  const steps: { key: OnboardingStep; done: boolean }[] = [];
  for (const key of onboardingSteps[kind]) steps.push({ key, done: await checks[key]() });
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
/** Series D: active profiles of the organisation that probably exist elsewhere under another identity (same name and birth date). */
export const duplicatesSql = `SELECT cp.id,cp.full_name FROM club_person cp WHERE cp.organization_id=$1 AND cp.status='active' AND cp.birth_date IS NOT NULL
  AND EXISTS(SELECT 1 FROM club_person x WHERE x.organization_id<>cp.organization_id AND x.status='active' AND x.person_id<>cp.person_id AND x.birth_date=cp.birth_date
             AND lower(regexp_replace(x.full_name,'\\s+',' ','g'))=lower(regexp_replace(cp.full_name,'\\s+',' ','g'))) ORDER BY cp.full_name`;
async function duplicatesOf(c: PoolClient, org: string) {
  const count = (await c.query(`SELECT count(*)::int AS n FROM (${duplicatesSql}) d`, [org])).rows[0].n as number;
  const last = (await c.query("SELECT max(created_at) AS at FROM platform_action WHERE organization_id=$1 AND kind='duplicates.notify'", [org])).rows[0].at as string | null;
  return { count, notified_at: last };
}

export async function consoleOrganization(db: Pool, p: Principal, id: string) {
  return operatorScope(db, p, async (c, o) => {
    const org = (
      await c.query(
        `SELECT o.id,o.name,o.kind,o.country_code AS country,f.name AS federation,o.created_at,o.disabled_modules,o.province,o.training_format,o.suspended_at,o.suspended_reason,
                (SELECT count(*)::int FROM organization_membership m WHERE m.organization_id=o.id AND m.active) AS members,
                (SELECT count(*)::int FROM club_person cp WHERE cp.organization_id=o.id AND cp.status='active' AND 'player'=ANY(cp.directory_roles)) AS players,
                (SELECT count(*)::int FROM club_person cp WHERE cp.organization_id=o.id AND cp.status='active' AND 'coach'=ANY(cp.directory_roles)) AS coaches,
                (SELECT count(*)::int FROM team t WHERE t.organization_id=o.id AND NOT t.archived) AS teams,
                (SELECT count(*)::int FROM organization x WHERE x.federation_id=o.id AND x.kind='club') AS clubs,
                (SELECT max(a.created_at) FROM audit_log a WHERE a.organization_id=o.id) AS last_activity,
                (SELECT count(*)::int FROM audit_log a WHERE a.organization_id=o.id AND a.created_at>now()-interval '30 days') AS actions30,
                (SELECT COALESCE(sum(size_bytes),0)::bigint FROM storage_file s WHERE s.organization_id=o.id) AS storage_bytes,
                (SELECT max(d.accepted_at) FROM club_dpa_acceptance d WHERE d.organization_id=o.id) AS dpa_accepted_at,
                (SELECT count(*)::int FROM data_request d WHERE d.organization_id=o.id AND d.status IN ('received','in_progress')) AS data_requests_open,
                (SELECT t.effective_on::text FROM club_termination t WHERE t.organization_id=o.id AND t.cancelled_at IS NULL AND t.completed_at IS NULL LIMIT 1) AS termination_on,
                (SELECT count(*)::int FROM api_key k WHERE k.organization_id=o.id AND k.revoked_at IS NULL) AS api_keys
           FROM organization o LEFT JOIN organization f ON f.id=o.federation_id WHERE o.id=$1`,
        [id],
      )
    ).rows[0];
    if (!org) throw new AccessError("NOT_FOUND", 404);
    // The officers: name and role; the e-mail only for those who answer support.
    const officers = (
      await c.query(
        `SELECT u.name,r.role,${canWrite(o) ? "u.email" : "NULL"} AS email,r.valid_from FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active
          WHERE r.organization_id=$1 AND r.role IN ('club_president','federation_president','federation_worker') AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
          ORDER BY r.role,u.name`,
        [id],
      )
    ).rows as { name: string; role: string; email: string | null; valid_from: string }[];
    const notes = (await c.query('SELECT n.id,n.text,n.created_at,u.name AS operator FROM platform_note n JOIN "user" u ON u.id=n.operator_id WHERE n.organization_id=$1 ORDER BY n.created_at DESC LIMIT 100', [id])).rows as {
      id: string;
      text: string;
      created_at: string;
      operator: string;
    }[];
    const actions = (await c.query('SELECT a.id,a.kind,a.reason,a.created_at,u.name AS operator FROM platform_action a JOIN "user" u ON u.id=a.operator_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 50', [id])).rows as {
      id: string;
      kind: string;
      reason: string;
      created_at: string;
      operator: string;
    }[];
    // Step 4: the running subscription and the plans offered, to open one from here.
    const subscription = (
      await c.query(
        "SELECT s.id,p.name AS plan,p.period,p.basis,p.amount_cents,s.started_on::text AS started_on,s.note,(SELECT count(*)::int FROM billing_invoice i WHERE i.organization_id=s.organization_id AND i.state='sent') AS open_invoices FROM billing_subscription s JOIN billing_plan p ON p.id=s.plan_id WHERE s.organization_id=$1 AND s.ended_on IS NULL",
        [id],
      )
    ).rows[0] as { id: string; plan: string; period: "month" | "year"; basis: "organization" | "player"; amount_cents: number; started_on: string; note: string; open_invoices: number } | undefined;
    // Step 3b: the borrows of this organisation, the open one first.
    const borrows = (
      await c.query(
        'SELECT b.id,b.reason,b.started_at,b.expires_at,b.ended_at,b.mandate_id,u.name AS operator,b.operator_id FROM platform_borrow b JOIN "user" u ON u.id=b.operator_id WHERE b.organization_id=$1 ORDER BY (b.ended_at IS NULL AND b.expires_at>now()) DESC,b.started_at DESC LIMIT 20',
        [id],
      )
    ).rows as { id: string; reason: string; started_at: string; expires_at: string; ended_at: string | null; mandate_id: string; operator: string; operator_id: string }[];
    const myBorrow = borrows.find((b) => b.operator_id === o.userId && !b.ended_at && new Date(b.expires_at) > new Date()) ?? null;
    const plans = (await c.query("SELECT id,name,amount_cents,period,basis FROM billing_plan WHERE active ORDER BY name")).rows as { id: string; name: string; amount_cents: number; period: "month" | "year"; basis: "organization" | "player" }[];
    return {
      organization: { ...org, storage_bytes: Number(org.storage_bytes) },
      // Series D: the organisation's path on the platform, its first steps, its probable duplicates of identity.
      timeline: await timeline(c, id),
      onboarding: await onboarding(c, id, org.kind as "club" | "federation"),
      duplicates: await duplicatesOf(c, id),
      officers,
      notes,
      actions,
      canWrite: canWrite(o),
      canBill: canBill(o),
      subscription: subscription ?? null,
      plans,
      borrows: borrows.map(({ operator_id: _omit, ...b }) => ({ ...b, active: !b.ended_at && new Date(b.expires_at) > new Date() })),
      myBorrow: myBorrow ? { id: myBorrow.id, mandateId: myBorrow.mandate_id, expiresAt: myBorrow.expires_at } : null,
    };
  });
}

export async function consoleSupervision(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c) => {
    const jobs = await jobStates(db);
    const mails = (await c.query("SELECT state,count(*)::int AS n FROM mail_job WHERE created_at>now()-interval '7 days' GROUP BY state ORDER BY state")).rows as { state: string; n: number }[];
    const storage = (await c.query("SELECT o.id,o.name,sum(s.size_bytes)::bigint AS bytes,count(*)::int AS files FROM storage_file s JOIN organization o ON o.id=s.organization_id GROUP BY o.id,o.name ORDER BY bytes DESC LIMIT 20")).rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      bytes: Number(r.bytes),
      files: r.files as number,
    }));
    const applied = await migrations(c, 10);
    const feedback = (
      await c.query(
        "SELECT f.id,f.kind,f.state,f.created_at,f.issue_number,o.name AS organization FROM app_feedback f LEFT JOIN organization o ON o.id=f.organization_id WHERE f.state<>'fixed' ORDER BY f.created_at DESC LIMIT 50",
      )
    ).rows as { id: string; kind: string; state: string; created_at: string; issue_number: number | null; organization: string | null }[];
    const dataRequests = (
      await c.query("SELECT d.id,d.kind,d.status,d.due_on::text AS due_on,d.created_at,o.name AS organization FROM data_request d JOIN organization o ON o.id=d.organization_id WHERE d.status IN ('received','in_progress') ORDER BY d.due_on LIMIT 50")
    ).rows as { id: string; kind: string; status: string; due_on: string; created_at: string; organization: string }[];
    return { jobs, mails, storage, migrations: applied, feedback, dataRequests };
  });
}

/** The browser family and the system, nothing finer (series D: the sessions' journal). */
export function browserOf(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ua ? "?" : "";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}
export async function consoleOperators(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c, o) => {
    const rows = (
      await c.query(
        'SELECT o.user_id,u.name,u.email,o.role,o.created_at,o.revoked_at FROM platform_operator o JOIN "user" u ON u.id=o.user_id ORDER BY o.revoked_at NULLS FIRST,o.created_at',
      )
    ).rows as { user_id: string; name: string; email: string; role: OperatorRole; created_at: string; revoked_at: string | null }[];
    // Series D: my console sessions (the owner reads everyone's), and the keys to review (the owner reads them all).
    const sessions = (
      await c.query(
        `SELECT l.session_id,u.name AS operator,l.started_at,l.last_console_at,l.ip,l.user_agent,l.calls,EXISTS(SELECT 1 FROM session s WHERE s.id=l.session_id AND s."expiresAt">now()) AS alive
           FROM operator_session_log l JOIN "user" u ON u.id=l.operator_id WHERE ${o.role === "owner" ? "true" : "l.operator_id=$1"} ORDER BY l.last_console_at DESC LIMIT 50`,
        o.role === "owner" ? [] : [o.userId],
      )
    ).rows as { session_id: string; operator: string; started_at: string; last_console_at: string; ip: string; user_agent: string; calls: number; alive: boolean }[];
    const keys = (
      await c.query(
        `SELECT k.id,k.name,k.prefix,k.scopes,k.calls,k.created_at,k.last_used_at,u.name AS operator FROM operator_api_key k JOIN "user" u ON u.id=k.operator_id
           WHERE k.revoked_at IS NULL AND ${o.role === "owner" ? "true" : "k.operator_id=$1"} ORDER BY k.created_at`,
        o.role === "owner" ? [] : [o.userId],
      )
    ).rows as { id: string; name: string; prefix: string; scopes: string[]; calls: number; created_at: string; last_used_at: string | null; operator: string }[];
    return {
      me: { userId: o.userId, role: o.role },
      operators: rows,
      fromEnvironment: envOperators().length,
      sessions: sessions.map((x) => ({ ...x, session_id: x.session_id.slice(0, 8), user_agent: browserOf(x.user_agent) })),
      sessionHours: operatorSessionHours(),
      keys: keys.map((k) => ({ ...k, review: keyReview(k) })),
    };
  });
}

export async function consoleExecute(db: Pool, p: Principal, command: ConsoleCommand) {
  return operatorScope(db, p, async (c, o) => {
    if (command.action === "note") {
      if (!canWrite(o)) throw new AccessError("FORBIDDEN");
      const ok = (await c.query("SELECT 1 FROM organization WHERE id=$1", [command.organizationId])).rowCount;
      if (!ok) throw new AccessError("NOT_FOUND", 404);
      const id = (await c.query("INSERT INTO platform_note(organization_id,operator_id,text) VALUES($1,$2,$3) RETURNING id", [command.organizationId, o.userId, command.text])).rows[0].id as string;
      await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,payload) VALUES($1,$2,'note',$3)", [o.userId, command.organizationId, JSON.stringify({ id })]);
      return { ok: true as const, id };
    }
    if (command.action === "duplicatesNotify") {
      // Series D: counted here, told to the presidency with no name; the club links the identities itself.
      if (!canWrite(o)) throw new AccessError("FORBIDDEN");
      const org = (await c.query("SELECT id,kind FROM organization WHERE id=$1", [command.organizationId])).rows[0] as { id: string; kind: string } | undefined;
      if (!org) throw new AccessError("NOT_FOUND", 404);
      const n = (await duplicatesOf(c, org.id)).count;
      if (!n) throw new AccessError("NO_DUPLICATES", 409);
      const text = {
        fr: { title: "Doublons probables dans votre annuaire", message: `${n} personne(s) de votre club existent probablement dans un autre club sous une autre identité (même nom, même date de naissance). Dans Sécurité et données, rattachez chaque fiche au code d'identité de la personne.` },
        nl: { title: "Waarschijnlijke dubbels in uw ledenlijst", message: `${n} persoon/personen van uw club bestaan waarschijnlijk in een andere club onder een andere identiteit (zelfde naam, zelfde geboortedatum). Koppel in Veiligheid en gegevens elke fiche aan de identiteitscode van de persoon.` },
        en: { title: "Probable duplicates in your directory", message: `${n} person(s) of your club probably exist in another club under another identity (same name, same birth date). In Security and data, link each profile to the person's identity code.` },
      };
      const recipients = await notice(c, org.id, await presidencyOf(c, org.id), text, "/settings/club#security", `duplicates:${org.id}:${Date.now()}`, "administrative");
      await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,payload) VALUES($1,$2,'duplicates.notify',$3)", [o.userId, org.id, JSON.stringify({ count: n, recipients })]);
      await audit(c, org.id, o.userId, "platform.duplicates_notify", org.id, { count: n });
      return { ok: true as const, recipients, count: n };
    }
    if (command.action === "suspend" || command.action === "reinstate") {
      // Step 3: read only for the organisation's members, with the reason; written in its own journal too.
      if (!canWrite(o)) throw new AccessError("FORBIDDEN");
      const org = (await c.query("SELECT id,suspended_at FROM organization WHERE id=$1 FOR UPDATE", [command.organizationId])).rows[0] as { id: string; suspended_at: string | null } | undefined;
      if (!org) throw new AccessError("NOT_FOUND", 404);
      if (command.action === "suspend") {
        if (org.suspended_at) throw new AccessError("ALREADY_SUSPENDED", 409);
        await c.query("UPDATE organization SET suspended_at=now(),suspended_reason=$2 WHERE id=$1", [org.id, command.reason]);
      } else {
        if (!org.suspended_at) throw new AccessError("NOT_SUSPENDED", 409);
        await c.query("UPDATE organization SET suspended_at=NULL,suspended_reason='' WHERE id=$1", [org.id]);
      }
      await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,reason) VALUES($1,$2,$3,$4)", [o.userId, org.id, command.action, command.action === "suspend" ? command.reason : ""]);
      await audit(c, org.id, o.userId, `platform.${command.action}`, org.id, command.action === "suspend" ? { reason: command.reason } : undefined);
      return { ok: true as const };
    }
    if (command.action === "borrow") {
      // Step 3b: a presidency mandate for a while, the presidency told, both journals written.
      if (!canWrite(o)) throw new AccessError("FORBIDDEN");
      const org = (await c.query("SELECT id,name,kind FROM organization WHERE id=$1", [command.organizationId])).rows[0] as { id: string; name: string; kind: "club" | "federation" } | undefined;
      if (!org) throw new AccessError("NOT_FOUND", 404);
      if ((await c.query("SELECT 1 FROM platform_borrow WHERE operator_id=$1 AND organization_id=$2 AND ended_at IS NULL AND expires_at>now()", [o.userId, org.id])).rowCount) throw new AccessError("BORROW_OPEN", 409);
      await c.query("INSERT INTO organization_membership(organization_id,user_id,active) VALUES($1,$2,true) ON CONFLICT (organization_id,user_id) DO UPDATE SET active=true", [org.id, o.userId]);
      const role = org.kind === "club" ? "club_president" : "federation_president";
      const mandate = (
        await c.query("INSERT INTO role_assignment(organization_id,user_id,role,valid_until,created_by) VALUES($1,$2,$3,now()+make_interval(mins => $4),$2) RETURNING id", [org.id, o.userId, role, command.minutes])
      ).rows[0].id as string;
      const id = (await c.query("INSERT INTO platform_borrow(operator_id,organization_id,mandate_id,reason,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(mins => $5)) RETURNING id,expires_at", [o.userId, org.id, mandate, command.reason, command.minutes])).rows[0] as {
        id: string;
        expires_at: string;
      };
      await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,reason,payload) VALUES($1,$2,'borrow',$3,$4)", [o.userId, org.id, command.reason, JSON.stringify({ id: id.id, minutes: command.minutes })]);
      await audit(c, org.id, o.userId, "platform.borrow", org.id, { reason: command.reason, minutes: command.minutes });
      const notified = await notice(
        c,
        org.id,
        await presidencyOf(c, org.id),
        {
          fr: { title: "Accès de support ouvert sur votre organisation", message: `${o.name}, de la plateforme, ouvre ${org.name} comme président pendant ${command.minutes} minutes. Raison : ${command.reason}. Tout ce qu'il fait est dans votre journal.` },
          nl: { title: "Supporttoegang geopend op uw organisatie", message: `${o.name}, van het platform, opent ${org.name} als voorzitter gedurende ${command.minutes} minuten. Reden: ${command.reason}. Alles wat hij doet staat in uw logboek.` },
          en: { title: "Support access opened on your organisation", message: `${o.name}, from the platform, opens ${org.name} as president for ${command.minutes} minutes. Reason: ${command.reason}. Everything done is in your journal.` },
        },
        "/audit",
        `borrow:${id.id}`,
        "administrative",
      );
      await c.query("UPDATE platform_borrow SET notified=$2 WHERE id=$1", [id.id, notified]);
      return { ok: true as const, id: id.id, mandateId: mandate, expiresAt: new Date(id.expires_at).toISOString() };
    }
    if (command.action === "borrowEnd") {
      const b = (await c.query("SELECT id,organization_id,mandate_id FROM platform_borrow WHERE id=$1 AND operator_id=$2 AND ended_at IS NULL FOR UPDATE", [command.id, o.userId])).rows[0] as { id: string; organization_id: string; mandate_id: string } | undefined;
      if (!b) throw new AccessError("NOT_FOUND", 404);
      await c.query("UPDATE platform_borrow SET ended_at=now() WHERE id=$1", [b.id]);
      await c.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", [b.mandate_id]);
      await c.query("UPDATE organization_membership SET active=false WHERE organization_id=$1 AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()))", [b.organization_id, o.userId]);
      await c.query("DELETE FROM active_context WHERE user_id=$1 AND organization_id=$2", [o.userId, b.organization_id]);
      await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,payload) VALUES($1,$2,'borrow.end',$3)", [o.userId, b.organization_id, JSON.stringify({ id: b.id })]);
      await audit(c, b.organization_id, o.userId, "platform.borrow.end", b.organization_id);
      return { ok: true as const };
    }
    if (o.role !== "owner") throw new AccessError("FORBIDDEN");
    if (command.action === "addOperator") {
      const u = (await c.query('SELECT id FROM "user" WHERE lower(email)=lower($1) AND active', [command.email])).rows[0] as { id: string } | undefined;
      if (!u) throw new AccessError("NOT_FOUND", 404);
      await c.query(
        "INSERT INTO platform_operator(user_id,role,created_by) VALUES($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role,created_by=EXCLUDED.created_by,created_at=now(),revoked_at=NULL,revoked_by=NULL",
        [u.id, command.role, o.userId],
      );
      await c.query("INSERT INTO platform_action(operator_id,kind,payload) VALUES($1,'operator.add',$2)", [o.userId, JSON.stringify({ userId: u.id, role: command.role })]);
      return { ok: true as const };
    }
    if (command.userId === o.userId) throw new AccessError("SELF_REVOKE", 409);
    const r = await c.query("UPDATE platform_operator SET revoked_at=now(),revoked_by=$2 WHERE user_id=$1 AND revoked_at IS NULL RETURNING user_id", [command.userId, o.userId]);
    if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
    await c.query("INSERT INTO platform_action(operator_id,kind,payload) VALUES($1,'operator.revoke',$2)", [o.userId, JSON.stringify({ userId: command.userId })]);
    return { ok: true as const };
  });
}

/** Hourly: the borrows past their end are closed (mandate revoked, membership inactive, context dropped). */
export async function borrowTick(db: Pool) {
  const c = await db.connect();
  let closed = 0;
  try {
    await c.query("BEGIN");
    const rows = (await c.query("SELECT id,operator_id,organization_id,mandate_id FROM platform_borrow WHERE ended_at IS NULL AND expires_at<now() FOR UPDATE SKIP LOCKED LIMIT 100")).rows as { id: string; operator_id: string; organization_id: string; mandate_id: string }[];
    for (const b of rows) {
      await c.query("UPDATE platform_borrow SET ended_at=expires_at WHERE id=$1", [b.id]);
      await c.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", [b.mandate_id]);
      await c.query("UPDATE organization_membership SET active=false WHERE organization_id=$1 AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()))", [b.organization_id, b.operator_id]);
      await c.query("DELETE FROM active_context WHERE user_id=$1 AND organization_id=$2", [b.operator_id, b.organization_id]);
      closed++;
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return closed;
}
