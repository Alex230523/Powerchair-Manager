import type { Pool, PoolClient } from "pg";
import { AccessError, type Principal } from "../access/service";
import { jobStates, overdueMails } from "../jobs/health";

/**
 * Console, step 1 (05/11/2026): the platform's operators, outside every
 * organisation. The console reads counts and states (never a player's
 * personal data), lists the organisations and their officers, keeps
 * internal notes, and writes every intervention in platform_action and in
 * the organisation's own audit journal. Operators come from the table, or
 * from PFM_OPERATOR_EMAILS (owners) so the first one can get in.
 */
import { consoleCommand, operatorRoles, type ConsoleCommand, type OperatorRole } from "./schema";
export { consoleCommand, operatorRoles, type ConsoleCommand, type OperatorRole };

type Operator = { userId: string; name: string; role: OperatorRole };
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
  if (u.role) return { userId: u.id, name: u.name, role: u.role };
  if (envOperators().includes(u.email)) return { userId: u.id, name: u.name, role: "owner" };
  throw new AccessError("FORBIDDEN");
}
const canWrite = (o: Operator) => o.role === "owner" || o.role === "support";
async function scope<T>(db: Pool, p: Principal, fn: (c: PoolClient, o: Operator) => Promise<T>) {
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
  ];
}

export async function consoleHome(db: Pool, p: Principal) {
  return scope(db, p, async (c, o) => {
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
        dataRequestsOpen: await n(c, "SELECT count(*)::int AS n FROM data_request WHERE status IN ('received','in_progress')"),
        dataRequestsLate: await n(c, "SELECT count(*)::int AS n FROM data_request WHERE status IN ('received','in_progress') AND due_on<CURRENT_DATE"),
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
};
export async function consoleOrganizations(db: Pool, p: Principal, raw: { q?: string; kind?: string; country?: string }) {
  return scope(db, p, async (c) => {
    const q = (raw.q ?? "").trim().slice(0, 80);
    const rows = (
      await c.query(
        `SELECT o.id,o.name,o.kind,o.country_code AS country,f.name AS federation,o.created_at,
                (SELECT count(*)::int FROM organization_membership m WHERE m.organization_id=o.id AND m.active) AS members,
                (SELECT count(*)::int FROM club_person cp WHERE cp.organization_id=o.id AND cp.status='active' AND 'player'=ANY(cp.directory_roles)) AS players,
                (SELECT count(*)::int FROM role_assignment r WHERE r.organization_id=o.id AND ${presidentRole}) AS presidents,
                (SELECT max(a.created_at) FROM audit_log a WHERE a.organization_id=o.id) AS last_activity,
                COALESCE(array_length(o.disabled_modules,1),0) AS disabled_modules
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

export async function consoleOrganization(db: Pool, p: Principal, id: string) {
  return scope(db, p, async (c, o) => {
    const org = (
      await c.query(
        `SELECT o.id,o.name,o.kind,o.country_code AS country,f.name AS federation,o.created_at,o.disabled_modules,o.province,o.training_format,
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
    return { organization: { ...org, storage_bytes: Number(org.storage_bytes) }, officers, notes, actions, canWrite: canWrite(o) };
  });
}

export async function consoleSupervision(db: Pool, p: Principal) {
  return scope(db, p, async (c) => {
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

export async function consoleOperators(db: Pool, p: Principal) {
  return scope(db, p, async (c, o) => {
    const rows = (
      await c.query(
        'SELECT o.user_id,u.name,u.email,o.role,o.created_at,o.revoked_at FROM platform_operator o JOIN "user" u ON u.id=o.user_id ORDER BY o.revoked_at NULLS FIRST,o.created_at',
      )
    ).rows as { user_id: string; name: string; email: string; role: OperatorRole; created_at: string; revoked_at: string | null }[];
    return { me: { userId: o.userId, role: o.role }, operators: rows, fromEnvironment: envOperators().length };
  });
}

export async function consoleExecute(db: Pool, p: Principal, command: ConsoleCommand) {
  return scope(db, p, async (c, o) => {
    if (command.action === "note") {
      if (!canWrite(o)) throw new AccessError("FORBIDDEN");
      const ok = (await c.query("SELECT 1 FROM organization WHERE id=$1", [command.organizationId])).rowCount;
      if (!ok) throw new AccessError("NOT_FOUND", 404);
      const id = (await c.query("INSERT INTO platform_note(organization_id,operator_id,text) VALUES($1,$2,$3) RETURNING id", [command.organizationId, o.userId, command.text])).rows[0].id as string;
      await c.query("INSERT INTO platform_action(operator_id,organization_id,kind,payload) VALUES($1,$2,'note',$3)", [o.userId, command.organizationId, JSON.stringify({ id })]);
      return { ok: true as const, id };
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
