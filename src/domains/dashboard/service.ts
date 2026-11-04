import { coachFocus, federationFocus, memberFocus } from "./focus";
import { reservedTotal } from "../finance/allocations";
import { forecastAlertOf } from "../finance/forecast";
import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
import { myTasksCount } from "../tasks/service";
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
  buildBoard,
  buildTodos,
  metric,
  type AgendaItem,
  type Dashboard,
  type Deadline,
  type FinanceCard,
  type Metric,
  type TodoKey,
  type WeekEvent,
} from "./summary";
import { presenceRules, readiness } from "./presence";
import { fundingDeadlines, moneyDeadlinesIn, openTasksCount } from "../funding/service";
import { resolveScope, seasonOptions, teamMembers } from "../scope/service";
import { seasonKeyFigures } from "../statistics/key-figures";
import { duesSeasonRows } from "../dues/service";
import { today } from "../calendar/access";
import { duesTotals } from "../dues/schema";
import { setupState } from "../setup/service";
import { setupShown } from "../setup/schema";
import { clubStatus } from "../club/obligations";

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
export type DashboardQuery = { season?: string; team?: string; week?: string };
export async function dashboardView(db: Pool, p: Principal, raw: DashboardQuery = {}) {
  const c = await db.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const result = await compute(c, p, raw);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function compute(c: PoolClient, p: Principal, raw: DashboardQuery): Promise<Dashboard> {
  const user = (await account(c, p)) as DashboardUser;
  let context: DashboardContext | null = null;
  try {
    context = await active(c, p);
  } catch (e) {
    if (!(e instanceof AccessError && e.code === "CONTEXT_REQUIRED")) throw e;
  }
  return computeFor(c, user, context, raw);
}

export type DashboardUser = { id: string; name: string; twoFactorEnabled: boolean | null };
export type DashboardContext = Awaited<ReturnType<typeof active>>;
/**
 * The dashboard of one account in one mandate. The page resolves them from
 * the session; the weekly digest (wave 15, C7) from the mandate itself, so
 * both apply exactly the same rights. `limits` widens the agenda and the
 * dates for the digest (the home keeps 8 of each).
 */
export async function computeFor(
  c: PoolClient,
  user: DashboardUser,
  context: DashboardContext | null,
  raw: DashboardQuery,
  limits: { agenda: number; deadlines: number } = { agenda: 8, deadlines: 8 },
): Promise<Dashboard> {
  const counts: Partial<Record<TodoKey, number>> = {};
  const metrics: Metric[] = [];
  const scopes: string[] = [];
  // Applications belong to the applicant whatever the active profile, like /registrations/mine.
  counts.myApplications = await count(
    c,
    "SELECT count(*) FROM registration_application WHERE applicant_user_id=$1 AND status='incomplete'",
    [user.id],
  );
  if (!context)
    return {
      generatedAt: new Date().toISOString(),
      user: { name: user.name },
      context: null,
      todos: buildTodos(counts),
      metrics,
      agenda: [],
      deadlines: [],
      scopes,
    };
  const a: Actor = { ...context, twoFactorEnabled: !!user.twoFactorEnabled };
  const org = a.organization_id;
  const rights = permissions(a.role, a.grants);
  const mfa = mfaSatisfied(a.twoFactorEnabled);
  const has = (permission: Permission) => mfa && rights.includes(permission);
  const club = context.kind === "club";
  // Modules the club switched off add nothing to the dashboard.
  const on = (m: string) => !club || !context.disabled_modules?.includes(m);
  const own = [...(await ownProfiles(c, a))];
  // A1: one's own open tasks due within 14 days, the late ones included.
  if (mfa) counts.myTasks = await myTasksCount(c, org, user.id, own);
  // The team chosen in the top bar (wave 12): validated here, never trusted from the URL.
  const scope = club
    ? await resolveScope(c, { organization_id: org, role: a.role, user_id: user.id, team_id: a.team_id }, raw)
    : { seasonId: null, teamId: null };
  const teamId = scope.teamId;
  const members = teamId ? await teamMembers(c, org, teamId) : null;

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
    ...(club && on("dues") && has("dues.manage") ? ["dues"] : []),
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
           FROM club_document WHERE organization_id=$1 AND (NOT sensitive OR $2) AND ($3::uuid[] IS NULL OR profile_id=ANY($3::uuid[]))`,
        [org, a.grants.includes("documents.sensitive"), members],
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
      "SELECT e.*,(r.closed_at IS NULL AND e.ends_at<now()) AS to_close,(SELECT count(*)::int FROM attendance_invitation i WHERE i.register_id=r.id AND i.withdrawn_at IS NULL AND i.response='none') AS unanswered FROM attendance_register r JOIN calendar_event e ON e.id=r.event_id WHERE r.organization_id=$1 AND e.status='scheduled' AND ($2::uuid IS NULL OR e.team_id=$2) AND ((r.closed_at IS NULL AND e.ends_at<now()) OR (e.starts_at>now() AND e.starts_at<now()+interval '7 days')) ORDER BY e.starts_at LIMIT 200",
      [org, teamId],
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

  // Teams over their places (wave 16, R1): only for those who manage teams.
  if (club && has("teams.manage"))
    counts.teamsOverCapacity = await count(
      c,
      `SELECT count(*) FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived AND s.starts_on<=CURRENT_DATE AND s.ends_on>=CURRENT_DATE AND t.capacity IS NOT NULL
         AND t.capacity<(SELECT count(DISTINCT m.profile_id) FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=t.id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND cp.status='active')`,
      [org],
    );

  // 8: active minor players with no representative at all (declared or verified).
  if (club && has("people.manage"))
    counts.minorsWithoutGuardian = await count(c, minorsWithoutGuardianSql, [org]);

  // Equipment: chairs in maintenance or due for service within 14 days.
  if (club && on("equipment") && has("equipment.manage")) {
    scopes.push("equipment");
    counts.equipmentService = await count(
      c,
      "SELECT count(*) FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND (status='maintenance' OR next_service_on<=CURRENT_DATE+14)",
      [org],
    );
  }

  // Coach courses: approved courses expiring within 60 days (club management).
  if (club && has("mandates.manage"))
    counts.coursesExpiring = await count(
      c,
      "SELECT count(*) FROM training_request WHERE organization_id=$1 AND status='approved' AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE+60",
      [org],
    );
  // Federation: club requests waiting for a decision.
  if (!club && fedCan(a.role, a.grants, "federation.courses")) {
    scopes.push("courses");
    counts.courseRequests = await count(
      c,
      "SELECT count(*) FROM training_request q JOIN training_course k ON k.id=q.course_id WHERE k.federation_id=$1 AND q.status='requested'",
      [org],
    );
  }

  // People: only with the directory rights used by peopleView.
  if (club && (has("people.read") || has("people.manage"))) {
    scopes.push("people");
    const m = (
      await c.query(
        `SELECT (SELECT count(*)::int FROM club_person WHERE organization_id=$1 AND status='active' AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[]))) AS members,
                (SELECT count(*)::int FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles) AND NOT 'player'=ANY(former_roles) AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[]))) AS players,
                (SELECT count(*)::int FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived AND ($3::uuid IS NULL OR t.id=$3)) AS teams`,
        [org, members, teamId],
      )
    ).rows[0];
    metrics.push(
      metric("activeMembers", m.members, { href: "/club" }),
      metric("activePlayers", m.players, { href: "/players" }),
      metric("activeTeams", m.teams, { href: "/teams" }),
    );
  }

  // Dues: the instalments scheduled in the next 30 days (the payments
  // reconciled from the bank, B1, show on the dues page and in the reminders).
  if (club && on("dues") && has("dues.manage")) {
    scopes.push("dues");
    const next = await count(
      c,
      "SELECT COALESCE(sum(i.amount_cents),0) AS count FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND i.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30 AND ($2::uuid[] IS NULL OR d.profile_id=ANY($2::uuid[]))",
      [org, members],
    );
    // Treasury: balance of the club ledger (cancelled entries never count).
    const treasury = await count(
      c,
      "SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END),0) AS count FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL",
      [org],
    );
    metrics.push(
      ...(on("finance")
        ? [metric("treasury", treasury, { format: "cents", href: "/funding" }), metric("available", treasury - (await reservedTotal(c, org)), { format: "cents", href: "/funding/reserved" }), ...(await forecastAlertOf(c, org).then((a) => (a ? [metric("forecastLow", a.balance, { format: "cents", href: "/funding/forecast" })] : [])))]
        : []),
      metric("duesNext30", next, { format: "cents", href: "/dues" }),
    );
    // Players late with their dues (wave 14): the same totals as the dues page, for the season in view.
    const totals = duesTotals(await duesSeasonRows(c, org, scope.seasonId), today(), teamId);
    counts.duesLate = totals.playersLate;
  } else if (club && on("dues") && own.length) {
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
      "SELECT e.*,t.name AS team_name,t.color AS team_color,COALESCE(pl.name,sv.name,NULLIF(e.free_location,'')) AS place_name FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id LEFT JOIN calendar_place pl ON pl.id=e.place_id LEFT JOIN shared_venue sv ON sv.id=e.shared_venue_id WHERE e.organization_id=$1 AND e.ends_at>now() AND e.starts_at<now()+interval '14 days' AND ($2::uuid IS NULL OR e.team_id=$2 OR e.team_id IS NULL) ORDER BY e.starts_at,e.id LIMIT 60",
      [org, teamId],
    )
  ).rows as (Event & { team_name: string | null; team_color: string | null; place_name: string | null })[];
  const agenda: AgendaItem[] = [];
  let upcoming = 0;
  const rules = presenceRules(
    (await c.query("SELECT presence_rules FROM organization WHERE id=$1", [org]))
      .rows[0]?.presence_rules,
  );
  for (const e of events) {
    if (!(await canRead(c, a, e))) continue;
    if (e.status === "scheduled") upcoming++;
    if (agenda.length < limits.agenda) {
      // Who answered "present": coaches are the team's coaches (or listed as
      // coach in the directory), everyone else counts as a player.
      const present = (
        await c.query(
          `SELECT count(*) FILTER (WHERE is_coach)::int AS coaches,count(*) FILTER (WHERE NOT is_coach)::int AS players FROM (
             SELECT (EXISTS(SELECT 1 FROM team_membership m WHERE m.profile_id=cp.id AND m.team_id=$2 AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=$3::date AND (m.ends_on IS NULL OR m.ends_on>=$3::date))
                     OR ('coach'=ANY(cp.directory_roles) AND NOT 'coach'=ANY(cp.former_roles))) AS is_coach
               FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN club_person cp ON cp.id=i.profile_id
              WHERE r.event_id=$1 AND i.withdrawn_at IS NULL AND i.response='present') x`,
          [e.id, e.team_id, e.starts_at],
        )
      ).rows[0] as { coaches: number; players: number } | undefined;
      const hasRegister = !!(
        await c.query("SELECT 1 FROM attendance_register WHERE event_id=$1", [e.id])
      ).rowCount;
      agenda.push({
        id: e.id,
        title: e.title,
        kind: e.kind,
        status: e.status,
        startsAt: new Date(e.starts_at).toISOString(),
        endsAt: new Date(e.ends_at).toISOString(),
        team: e.team_name,
        teamColor: e.team_color ?? null,
        place: e.place_name,
        responseNeeded: pendingEvents.has(e.id),
        ...(hasRegister && e.status === "scheduled"
          ? { readiness: readiness(e.kind, present ?? { players: 0, coaches: 0 }, rules) }
          : {}),
      });
    }
  }
  scopes.push("calendar");
  metrics.unshift(metric("upcomingEvents", upcoming, { href: "/calendar" }));

  // Administrative dates of the next 30 days, next to the events.
  const deadlines: Deadline[] = [];
  const push = (d: Omit<Deadline, "id">) =>
    deadlines.push({ id: `${d.kind}:${d.date}:${d.href}:${d.title}`, ...d });
  if (managesDocuments(a)) {
    for (const r of (
      await c.query(
        "SELECT expires_on::text AS day,count(*)::int AS n FROM club_document WHERE organization_id=$1 AND status='valid' AND expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30 AND (NOT sensitive OR $2) GROUP BY expires_on ORDER BY expires_on",
        [org, a.grants.includes("documents.sensitive")],
      )
    ).rows)
      push({ kind: "documents", date: r.day, title: "", count: r.n, href: "/documents" });
  } else if (own.length) {
    for (const r of (
      await c.query(
        "SELECT expires_on::text AS day,count(*)::int AS n FROM club_document WHERE organization_id=$1 AND profile_id=ANY($2::uuid[]) AND status='valid' AND expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30 GROUP BY expires_on ORDER BY expires_on",
        [org, own],
      )
    ).rows)
      push({ kind: "documents", date: r.day, title: "", count: r.n, href: "/documents" });
  }
  if (club && on("dues") && (has("dues.manage") || has("dues.read") || own.length)) {
    const mine = !(has("dues.manage") || has("dues.read"));
    for (const r of (
      await c.query(
        "SELECT i.due_on::text AS day,count(DISTINCT d.profile_id)::int AS n,sum(i.amount_cents)::int AS cents FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND i.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30 AND ($2 OR d.profile_id=ANY($3::uuid[])) GROUP BY i.due_on ORDER BY i.due_on",
        [org, !mine, own],
      )
    ).rows)
      push({ kind: "dues", date: r.day, title: "", count: r.n, cents: r.cents, href: "/dues" });
  }
  if (club && on("fundraising")) {
    const staff = has("dues.manage") || has("dues.read");
    for (const r of (
      await c.query(
        "SELECT p.id,p.name,p.deadline::text AS day FROM fundraising_pot p WHERE p.organization_id=$1 AND p.status='open' AND p.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE+60 AND ($2 OR p.players_join) ORDER BY p.deadline",
        [org, staff],
      )
    ).rows)
      push({ kind: "fundraising", date: r.day, title: r.name, count: 1, href: "/fundraising" });
  }
  if (club && on("trips")) {
    for (const r of (
      await c.query(
        `SELECT t.id,t.title,t.starts_on::text AS day FROM trip t WHERE t.organization_id=$1 AND t.status IN ('planned','confirmed') AND t.starts_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30
           AND ($2 OR EXISTS(SELECT 1 FROM trip_participant tp WHERE tp.trip_id=t.id AND tp.profile_id=ANY($3::uuid[]))) ORDER BY t.starts_on`,
        [org, has("calendar.manage") || has("teams.manage") || a.role === "coach", own],
      )
    ).rows)
      push({ kind: "trip", date: r.day, title: r.title, count: 1, href: `/trips/${r.id}` });
  }
  // Grants to file or report on, partners to renew or call back (wave 11): money people only.
  const moneyPeople = has("dues.manage") || has("dues.read");
  if (club && on("finance") && moneyPeople)
    for (const d of await fundingDeadlines(c, org, 30))
      push({ kind: d.kind, date: d.date, title: d.title, count: 1, href: d.href });
  // Sponsor conditions, partner payments and renewals (wave 15): every one for money people, one's own tasks otherwise.
  if (club && on("finance")) {
    const until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    for (const d of await moneyDeadlinesIn(c, org, today(), until, moneyPeople, own))
      if (d.kind !== "grant" && d.kind !== "grantReport" && d.source !== "tournament")
        push({ kind: d.source, date: d.date, title: d.title, count: 1, href: d.href, ...(d.kind === "condition" || d.kind === "task" ? { task: true } : {}) });
    // Conditions to deliver within 14 days (late ones too): all for the president, one's own otherwise.
    counts.sponsorTasks = await openTasksCount(c, org, "partner", 14, a.role === "club_president" && moneyPeople, own);
    // Grant check-lists (wave 15, C2): same rule, the person in charge sees their own steps.
    counts.grantTasks = await openTasksCount(c, org, "grant", 14, a.role === "club_president" && moneyPeople, own);
  }
  deadlines.sort((x, y) => x.date.localeCompare(y.date));

  // The season in view, for the subtitle and the money card.
  const seasonRow = club && scope.seasonId ? (await seasonOptions(c, org)).find((s) => s.id === scope.seasonId) ?? null : null;
  // The money card (wave 14): same totals as the dues page, ledger of the season, treasury of the club.
  let finance: FinanceCard | undefined;
  const money = club && (has("dues.manage") || has("dues.read"));
  if (money && (on("finance") || on("dues"))) {
    const from = seasonRow?.starts_on ?? null,
      to = seasonRow?.ends_on ?? null;
    const ledger = on("finance")
      ? (
          await c.query(
            "SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END),0)::int AS treasury,COALESCE(sum(amount_cents) FILTER (WHERE direction='in' AND ($2::date IS NULL OR occurred_on BETWEEN $2 AND $3)),0)::int AS income,COALESCE(sum(amount_cents) FILTER (WHERE direction='out' AND ($2::date IS NULL OR occurred_on BETWEEN $2 AND $3)),0)::int AS expenses FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL",
            [org, from, to],
          )
        ).rows[0]
      : null;
    finance = {
      treasury: ledger ? ledger.treasury : null,
      income: ledger ? ledger.income : 0,
      expenses: ledger ? ledger.expenses : 0,
      dues: on("dues") ? duesTotals(await duesSeasonRows(c, org, scope.seasonId), today(), teamId) : null,
    };
    scopes.push("money");
  }
  // The president's key figures (wave 16, A), for the season in view: distinct people, done sessions, played matches.
  const president = club && (a.role === "club_president" || has("mandates.manage"));
  if (president && seasonRow) {
    const k = await seasonKeyFigures(c, org, seasonRow, teamId ? [teamId] : null);
    const season = `?season=${seasonRow.id}`;
    metrics.push(
      metric("seasonPlayers", k.players, { href: `/players${season}` }),
      metric("seasonTeams", k.teams, { href: `/teams${season}` }),
      metric("seasonCoaches", k.coaches, { href: `/coaches${season}` }),
      ...(on("equipment") ? [metric("chairs", k.chairs, { href: "/equipment", extra: k.chairs_service })] : []),
      metric("trainingsDone", k.trainings, { href: `/attendance${season}` }),
      ...(on("matches") ? [metric("matchesPlayed", k.matches, { href: `/matches${season}` })] : []),
    );
  }
  // « Statut du club » (wave 16, A): the obligations of the year, for the president.
  const status = president ? await clubStatus(c, org) : null;

  // The week asked for: events the actor may read, filtered like the calendar and the team in view.
  let week: Dashboard["week"];
  if (raw.week && /^\d{4}-\d{2}-\d{2}$/.test(raw.week) && !Number.isNaN(Date.parse(raw.week + "T00:00:00Z"))) {
    const from = raw.week;
    const rows = (
      await c.query(
        "SELECT e.*,t.name AS team_name,t.color AS team_color,COALESCE(pl.name,sv.name,NULLIF(e.free_location,'')) AS place_name FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id LEFT JOIN calendar_place pl ON pl.id=e.place_id LEFT JOIN shared_venue sv ON sv.id=e.shared_venue_id WHERE e.organization_id=$1 AND e.ends_at>($2::date)::timestamptz AND e.starts_at<($2::date+7)::timestamptz AND ($3::uuid IS NULL OR e.team_id=$3 OR e.team_id IS NULL) ORDER BY e.starts_at,e.id LIMIT 200",
        [org, from, teamId],
      )
    ).rows as (Event & { team_name: string | null; team_color: string | null; place_name: string | null })[];
    const events: WeekEvent[] = [];
    for (const e of rows)
      if (await canRead(c, a, e))
        events.push({
          id: e.id,
          title: e.title,
          kind: e.kind,
          status: e.status,
          startsAt: new Date(e.starts_at).toISOString(),
          endsAt: new Date(e.ends_at).toISOString(),
          team: e.team_name,
          teamColor: e.team_color ?? null,
          place: e.place_name,
        });
    const end = new Date(from + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + 6);
    week = { from, to: end.toISOString().slice(0, 10), events };
  }
  // Getting started for players and parents (wave 15, C9): the calendar in their phone.
  const start =
    club && (a.role === "player" || a.role === "guardian")
      ? {
          calendarSubscribed: !!(
            await c.query("SELECT 1 FROM calendar_feed WHERE organization_id=$1 AND user_id=$2 AND mandate_id=$3 AND revoked_at IS NULL AND expires_at>now() LIMIT 1", [org, user.id, a.id])
          ).rowCount,
        }
      : undefined;
  // 15: the home by role.
  const focus = !mfa
    ? undefined
    : club && (a.role === "player" || a.role === "guardian")
      ? await memberFocus(c, org, own)
      : club && a.role === "coach"
        ? await coachFocus(c, org, own)
        : !club && fedCan(a.role, a.grants)
          ? await federationFocus(c, org, {
              licences: fedCan(a.role, a.grants, "federation.licences"),
              competitions: fedCan(a.role, a.grants, "federation.competitions"),
              referees: fedCan(a.role, a.grants, "federation.referees"),
              classification: fedCan(a.role, a.grants, "federation.classification"),
              courses: fedCan(a.role, a.grants, "federation.courses"),
              communication: fedCan(a.role, a.grants, "federation.communication"),
              discipline: fedCan(a.role, a.grants, "federation.discipline"),
            })
          : undefined;
  // Getting started of a new club (wave 15, C3): for the president, until done or hidden.
  const setup = club && a.role === "club_president" && has("mandates.manage") ? await setupState(c, org) : null;
  return {
    generatedAt: new Date().toISOString(),
    user: { name: user.name },
    ...(start ? { start } : {}),
    ...(setup && setupShown(setup) ? { setup } : {}),
    context: {
      organization: context.organization_name,
      kind: context.kind,
      role: a.role,
      statistics: on("statistics"),
    },
    season: seasonRow ? { id: seasonRow.id, name: seasonRow.name } : null,
    can: {
      event: has("calendar.manage"),
      player: club && has("people.manage"),
      operation: club && on("finance") && has("dues.manage"),
      mail: club && (has("notifications.manage") || has("calendar.manage")),
    },
    todos: buildTodos(counts),
    board: buildBoard(counts, { president, status }),
    metrics,
    agenda,
    deadlines: deadlines.slice(0, limits.deadlines),
    scopes,
    ...(finance ? { finance } : {}),
    ...(week ? { week } : {}),
    ...(focus ? { focus } : {}),
  };
}

/** 8: the minor players of a club whom no representative answers for. */
export const minorsWithoutGuardianSql = `SELECT count(*) FROM club_person cp WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles)
  AND cp.birth_date>CURRENT_DATE-interval '18 years'
  AND NOT EXISTS (SELECT 1 FROM guardian_relationship g WHERE g.organization_id=cp.organization_id AND g.subject_profile_id=cp.id AND g.revoked_at IS NULL AND g.kind IN ('declared','legal_verified') AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE))`;
async function count(c: PoolClient, sql: string, values: unknown[]) {
  return Number((await c.query(sql, values)).rows[0]?.count ?? 0) || 0;
}
