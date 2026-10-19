import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions, type Permission } from "../access/policy";
import {
  canRead,
  ownProfiles,
  type Actor,
  type Event,
} from "../calendar/access";
import { manages as managesAttendance, mayRespond } from "../attendance/access";
import {
  docAccess,
  manages as managesDocuments,
  type Doc,
} from "../documents/access";
import {
  buildTodos,
  metric,
  type AgendaItem,
  type Dashboard,
  type Metric,
  type TodoKey,
} from "./summary";

/**
 * Read-only operational summary for the active context.
 *
 * Every figure reuses the same permission helpers as its source module
 * (documents, attendance, calendar, registrations, dues), so the dashboard
 * never shows more than the module would. It stores nothing: indicators are
 * recomputed on each request and disappear as soon as their cause is resolved.
 * Runs in one READ ONLY snapshot and takes no organization lock, unlike
 * module mutations, so it never blocks or delays them.
 */
export async function dashboardView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const result = await compute(c, p);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function compute(c: PoolClient, p: Principal): Promise<Dashboard> {
  const user = await account(c, p);
  const counts: Partial<Record<TodoKey, number>> = {};
  const metrics: Metric[] = [];
  const scopes: string[] = [];
  // Applications belong to the applicant whatever the active profile, like /registrations/mine.
  counts.myApplications = await count(
    c,
    "SELECT count(*) FROM registration_application WHERE applicant_user_id=$1 AND status='incomplete'",
    [p.userId],
  );
  let context;
  try {
    context = await active(c, p);
  } catch (e) {
    if (e instanceof AccessError && e.code === "CONTEXT_REQUIRED")
      return {
        generatedAt: new Date().toISOString(),
        user: { name: user.name },
        context: null,
        todos: buildTodos(counts),
        metrics,
        agenda: [],
        scopes,
      };
    throw e;
  }
  const a: Actor = { ...context, twoFactorEnabled: !!user.twoFactorEnabled };
  const org = a.organization_id;
  const rights = permissions(a.role, a.grants);
  const mfa = mfaSatisfied(a.twoFactorEnabled);
  const has = (permission: Permission) => mfa && rights.includes(permission);
  const club = context.kind === "club";
  const own = [...(await ownProfiles(c, a))];

  // Registrations: club inbox for registrations.manage, as in registrationView(adminMode).
  if (club && has("registrations.manage")) {
    scopes.push("registrations");
    const r = (
      await c.query(
        `SELECT count(*) FILTER (WHERE status IN ('submitted','review'))::int AS review,
                count(*) FILTER (WHERE status='waiting')::int AS waiting,
                count(*) FILTER (WHERE status='accepted' AND decided_at>now()-interval '14 days')::int AS accepted
           FROM registration_application WHERE organization_id=$1 AND submitted_at IS NOT NULL`,
        [org],
      )
    ).rows[0];
    counts.registrationsReview = r.review;
    metrics.push(
      metric("waitingList", r.waiting, { href: "/registrations" }),
      metric("acceptedRecently", r.accepted, { href: "/registrations" }),
    );
  }
  // Accepted applications still waiting for the documents or dues follow-up.
  const followupKinds = [
    ...(club && managesDocuments(a) ? ["documents"] : []),
    ...(club && has("dues.manage") ? ["dues"] : []),
  ];
  if (followupKinds.length)
    counts.registrationFollowups = await count(
      c,
      "SELECT count(DISTINCT a.id) FROM registration_followup f JOIN registration_application a ON a.id=f.application_id WHERE a.organization_id=$1 AND a.status='accepted' AND f.state='awaiting_module' AND f.kind=ANY($2::text[])",
      [org, followupKinds],
    );

  // Documents: staff view mirrors documentView (sensitive pieces need the explicit grant).
  if (managesDocuments(a)) {
    scopes.push("documents");
    const d = (
      await c.query(
        `SELECT count(*) FILTER (WHERE status IN ('uploaded','review'))::int AS review,
                count(*) FILTER (WHERE status='expired' OR (status='valid' AND expires_on<CURRENT_DATE))::int AS expired,
                count(*) FILTER (WHERE status='valid' AND expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int AS expiring,
                count(*) FILTER (WHERE status IN ('missing','requested','refused'))::int AS missing
           FROM club_document WHERE organization_id=$1 AND (NOT sensitive OR $2)`,
        [org, a.grants.includes("documents.sensitive")],
      )
    ).rows[0];
    counts.documentsReview = d.review;
    counts.documentsExpired = d.expired;
    counts.documentsExpiring = d.expiring;
    counts.documentsMissing = d.missing;
  } else if (own.length) {
    // Personal or family pieces the user can actually upload.
    const rows = (
      await c.query(
        "SELECT *,expires_on::text AS expires_on FROM club_document WHERE organization_id=$1 AND profile_id=ANY($2::uuid[]) AND (status IN ('missing','requested','refused','expired') OR (status='valid' AND expires_on<CURRENT_DATE)) ORDER BY updated_at DESC LIMIT 100",
        [org, own],
      )
    ).rows as Doc[];
    let mine = 0;
    for (const doc of rows) if (await docAccess(c, a, doc, true)) mine++;
    counts.myDocuments = mine;
  }

  // Attendance: answers the user still owes, for themself or a represented child.
  const pendingEvents = new Set<string>();
  if (own.length) {
    const rows = (
      await c.query(
        "SELECT i.profile_id,e.* FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id WHERE i.organization_id=$1 AND i.profile_id=ANY($2::uuid[]) AND i.withdrawn_at IS NULL AND i.response='none' AND r.closed_at IS NULL AND r.deadline>now() AND e.status='scheduled' AND e.starts_at>now() ORDER BY e.starts_at LIMIT 100",
        [org, own],
      )
    ).rows as (Event & { profile_id: string })[];
    const allowed = new Map<string, boolean>();
    let pending = 0;
    for (const row of rows) {
      if (!allowed.has(row.profile_id))
        allowed.set(
          row.profile_id,
          await mayRespond(c, a, row.profile_id, true),
        );
      if (allowed.get(row.profile_id) && (await canRead(c, a, row))) {
        pending++;
        pendingEvents.add(row.id);
      }
    }
    counts.myAttendance = pending;
  }
  // Staff: registers of finished events left open, and answers still missing this week.
  const managed = (
    await c.query(
      "SELECT e.*,(r.closed_at IS NULL AND e.ends_at<now()) AS to_close,(SELECT count(*)::int FROM attendance_invitation i WHERE i.register_id=r.id AND i.withdrawn_at IS NULL AND i.response='none') AS unanswered FROM attendance_register r JOIN calendar_event e ON e.id=r.event_id WHERE r.organization_id=$1 AND e.status='scheduled' AND ((r.closed_at IS NULL AND e.ends_at<now()) OR (e.starts_at>now() AND e.starts_at<now()+interval '7 days')) ORDER BY e.starts_at LIMIT 200",
      [org],
    )
  ).rows as (Event & { to_close: boolean; unanswered: number })[];
  let toClose = 0,
    unanswered = 0,
    managesAny = false;
  for (const e of managed) {
    if (!(await managesAttendance(c, a, e))) continue;
    managesAny = true;
    if (e.to_close) toClose++;
    else unanswered += e.unanswered;
  }
  if (managesAny || has("attendance.manage")) {
    scopes.push("attendance");
    counts.registersToClose = toClose;
    metrics.push(
      metric("pendingResponses", unanswered, { href: "/attendance" }),
    );
  }

  // Equipment: chairs in maintenance or due for service within 14 days.
  if (club && has("equipment.manage")) {
    scopes.push("equipment");
    counts.equipmentService = await count(
      c,
      "SELECT count(*) FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND (status='maintenance' OR next_service_on<=CURRENT_DATE+14)",
      [org],
    );
  }

  // People: only with the directory rights used by peopleView.
  if (club && (has("people.read") || has("people.manage"))) {
    scopes.push("people");
    const m = (
      await c.query(
        `SELECT (SELECT count(*)::int FROM club_person WHERE organization_id=$1 AND status='active') AS members,
                (SELECT count(*)::int FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles) AND NOT 'player'=ANY(former_roles)) AS players,
                (SELECT count(*)::int FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived) AS teams`,
        [org],
      )
    ).rows[0];
    metrics.push(
      metric("activeMembers", m.members, { href: "/club" }),
      metric("activePlayers", m.players, { href: "/players" }),
      metric("activeTeams", m.teams, { href: "/club/manage" }),
    );
  }

  // Dues: scheduled instalments only. Payments and reconciliation arrive with lot 09,
  // so nothing here claims that an amount is paid or late.
  if (club && has("dues.manage")) {
    scopes.push("dues");
    const next = await count(
      c,
      "SELECT COALESCE(sum(i.amount_cents),0) AS count FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND i.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30",
      [org],
    );
    metrics.push(
      metric("duesNext30", next, { format: "cents", href: "/dues" }),
    );
  } else if (club && own.length) {
    const next = (
      await c.query(
        "SELECT i.due_on::text AS due_on,i.amount_cents FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND d.profile_id=ANY($2::uuid[]) AND i.due_on>=CURRENT_DATE ORDER BY i.due_on,i.ordinal LIMIT 1",
        [org, own],
      )
    ).rows[0];
    if (next)
      metrics.push(
        metric("myNextDue", next.amount_cents, {
          format: "cents",
          href: "/dues",
          date: next.due_on,
        }),
      );
  }

  // Agenda: the next fortnight, filtered exactly like the calendar.
  const events = (
    await c.query(
      "SELECT e.*,t.name AS team_name,COALESCE(pl.name,sv.name,NULLIF(e.free_location,'')) AS place_name FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id LEFT JOIN calendar_place pl ON pl.id=e.place_id LEFT JOIN shared_venue sv ON sv.id=e.shared_venue_id WHERE e.organization_id=$1 AND e.ends_at>now() AND e.starts_at<now()+interval '14 days' ORDER BY e.starts_at,e.id LIMIT 60",
      [org],
    )
  ).rows as (Event & { team_name: string | null; place_name: string | null })[];
  const agenda: AgendaItem[] = [];
  let upcoming = 0;
  for (const e of events) {
    if (!(await canRead(c, a, e))) continue;
    if (e.status === "scheduled") upcoming++;
    if (agenda.length < 6)
      agenda.push({
        id: e.id,
        title: e.title,
        kind: e.kind,
        status: e.status,
        startsAt: new Date(e.starts_at).toISOString(),
        endsAt: new Date(e.ends_at).toISOString(),
        team: e.team_name,
        place: e.place_name,
        responseNeeded: pendingEvents.has(e.id),
      });
  }
  scopes.push("calendar");
  metrics.unshift(metric("upcomingEvents", upcoming, { href: "/calendar" }));

  return {
    generatedAt: new Date().toISOString(),
    user: { name: user.name },
    context: {
      organization: context.organization_name,
      kind: context.kind,
      role: a.role,
    },
    todos: buildTodos(counts),
    metrics,
    agenda,
    scopes,
  };
}

async function count(c: PoolClient, sql: string, values: unknown[]) {
  return Number((await c.query(sql, values)).rows[0]?.count ?? 0) || 0;
}
