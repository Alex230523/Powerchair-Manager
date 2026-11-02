import type { Pool, PoolClient } from "pg";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { ownProfiles } from "../calendar/access";
import { brusselsToday } from "../people/service";
import { publish } from "../notifications/queue";
import { categoryOf, dueBefore, kindOf, moneyCategories, nextDue, type Category, type Status, type TaskCommand, type TaskKind, type TemplateItem } from "./schema";
import { syncSources } from "./sources";
import { moneyDeadlinesIn } from "../funding/service";
import { visibleVenue } from "../venues/schema";

/**
 * A1: the organisation's central to-do (club or federation), grown from the
 * club task list of wave 17 (O1). Table task (named funding_task until
 * migration 0077; the views funding_task and org_task stay one version for
 * older deployments). The president and the people who plan see and give every
 * task; money matters stay with the money people; everyone else sees and
 * ticks only the tasks given to them, never the others' details.
 */
export type Scope = {
  c: PoolClient;
  org: string;
  userId: string;
  federation: boolean;
  manage: boolean;
  money: boolean;
  moneyManage: boolean;
  own: Set<string>;
  financeOff: boolean;
};

/** Also the scope of the coaches' driving licences: the same people organise the trips. */
export async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const federation = a.kind === "federation";
    const rights = permissions(a.role, a.grants);
    const has = (...r: string[]) => mfa && r.some((x) => rights.includes(x as (typeof rights)[number]));
    const off = ((await c.query("SELECT disabled_modules FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.disabled_modules ?? []) as string[];
    const fedManage = mfa && federation && ["federation_president", "federation_worker"].includes(a.role);
    const out = await fn({
      c,
      org: a.organization_id,
      userId: p.userId,
      federation,
      manage: federation ? fedManage : mfa && (a.role === "club_president" || has("calendar.manage", "teams.manage", "mandates.manage")),
      money: federation ? fedManage : has("dues.read", "dues.manage") && !off.includes("finance"),
      moneyManage: federation ? fedManage : has("dues.manage") && !off.includes("finance"),
      own: mfa && !federation ? await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled }) : new Set(),
      financeOff: off.includes("finance"),
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    if ((e as { code?: string }).code === "23503") throw new AccessError("NOT_FOUND", 404);
    throw e;
  } finally {
    c.release();
  }
}

export type TaskRow = {
  id: string;
  kind: TaskKind;
  category: Category;
  title: string;
  detail: string;
  due_on: string | null;
  status: Status;
  done_on: string | null;
  priority: "normal" | "high";
  recurrence: "none" | "monthly" | "yearly";
  checklist: { text: string; done: boolean }[];
  responsible_id: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  team_id: string | null;
  partner_id: string | null;
  grant_id: string | null;
  event_id: string | null;
  match_id: string | null;
  trip_id: string | null;
  obligation_id: string | null;
  chair_id: string | null;
  pot_id: string | null;
  document_id: string | null;
  receivable_id: string | null;
  /** A4: a contact's next action. */
  contact_id: string | null;
  source_kind: string;
  source_params: { about?: string; profile?: string };
  auto_closed: boolean;
  about: string | null;
  comments: { id: string; body: string; author: string; created_at: string }[];
  /** 2: the people in charge, each with the day he ticked his part. */
  assignees: { profile_id: string | null; user_id: string | null; name: string; done_on: string | null }[];
  completion: "any" | "each";
  meeting_starts_at: string | null;
  meeting_ends_at: string | null;
  place_id: string | null;
  shared_venue_id: string | null;
  place_name: string | null;
  free_location: string;
  link_url: string;
  amount_cents: number | null;
  recurrence_until: string | null;
  transaction_id: string | null;
  affiliation_due_id: string | null;
};

const isMoney = (category: Category) => moneyCategories.includes(category);
/** Given to me: one of my profiles, or my account (federation). */
type Who = { responsible_id: string | null; responsible_user_id?: string | null; assignees?: { profile_id: string | null; user_id: string | null }[] };
const mine = (s: Scope, t: Who) =>
  (!!t.responsible_id && s.own.has(t.responsible_id)) ||
  t.responsible_user_id === s.userId ||
  (t.assignees ?? []).some((a) => (!!a.profile_id && s.own.has(a.profile_id)) || a.user_id === s.userId);
/** What a task may see: every task of its category, or only one's own. */
const visible = (s: Scope, t: Who & { category: Category }) => (mine(s, t) && !(s.financeOff && isMoney(t.category))) || (isMoney(t.category) ? s.money : s.manage);
/** Who may tick, start or edit a task. */
const canWork = (s: Scope, t: Who & { category: Category }) => mine(s, t) || (isMoney(t.category) ? s.moneyManage : s.manage);
/** 2: the people in charge of some tasks, with the day each ticked his part. */
async function assigneesOf(c: PoolClient, org: string, ids: string[]) {
  const rows = (
    await c.query(
      `SELECT a.task_id,a.profile_id,a.user_id,COALESCE(cp.full_name,u.name,'') AS name,a.done_on::text AS done_on FROM task_assignee a
         LEFT JOIN club_person cp ON cp.id=a.profile_id LEFT JOIN "user" u ON u.id=a.user_id
        WHERE a.organization_id=$1 AND a.task_id=ANY($2::uuid[]) ORDER BY a.created_at,name`,
      [org, ids],
    )
  ).rows as { task_id: string; profile_id: string | null; user_id: string | null; name: string; done_on: string | null }[];
  const by = new Map<string, TaskRow["assignees"]>();
  for (const r of rows) by.set(r.task_id, [...(by.get(r.task_id) ?? []), { profile_id: r.profile_id, user_id: r.user_id, name: r.name, done_on: r.done_on }]);
  return by;
}

const select = `SELECT t.id,t.kind,t.category,t.title,t.detail,t.due_on::text AS due_on,t.status,t.done_on::text AS done_on,t.priority,t.recurrence,t.checklist,
        t.responsible_id,t.responsible_user_id,COALESCE(cp.full_name,ru.name) AS responsible_name,t.team_id,
        t.partner_id,t.grant_id,t.event_id,t.match_id,t.trip_id,t.obligation_id,t.chair_id,t.pot_id,t.document_id,t.receivable_id,t.source_kind,t.source_params,t.auto_closed,t.contact_id,
        t.completion,t.meeting_starts_at,t.meeting_ends_at,t.place_id,t.shared_venue_id,COALESCE(pl.name,sv.name) AS place_name,t.free_location,t.link_url,t.amount_cents,t.recurrence_until::text AS recurrence_until,t.transaction_id,t.affiliation_due_id,
        COALESCE(pa.name, g.funder, e.title, CASE WHEN m.id IS NOT NULL THEN mt.name||' · '||m.opponent END, tr.title, o.title, ch.name, pot.name, doc.name, ct.full_name) AS about
   FROM task t LEFT JOIN club_person cp ON cp.id=t.responsible_id AND cp.organization_id=t.organization_id LEFT JOIN "user" ru ON ru.id=t.responsible_user_id
   LEFT JOIN partner pa ON pa.id=t.partner_id LEFT JOIN grant_application g ON g.id=t.grant_id
   LEFT JOIN calendar_event e ON e.id=t.event_id AND e.organization_id=t.organization_id
   LEFT JOIN match m ON m.id=t.match_id AND m.organization_id=t.organization_id LEFT JOIN team mt ON mt.id=m.team_id
   LEFT JOIN trip tr ON tr.id=t.trip_id AND tr.organization_id=t.organization_id
   LEFT JOIN club_obligation o ON o.id=t.obligation_id AND o.organization_id=t.organization_id
   LEFT JOIN equipment_chair ch ON ch.id=t.chair_id AND ch.organization_id=t.organization_id
   LEFT JOIN fundraising_pot pot ON pot.id=t.pot_id LEFT JOIN club_document doc ON doc.id=t.document_id
   LEFT JOIN contact ct ON ct.id=t.contact_id AND ct.organization_id=t.organization_id
   LEFT JOIN calendar_place pl ON pl.id=t.place_id AND pl.organization_id=t.organization_id LEFT JOIN shared_venue sv ON sv.id=t.shared_venue_id`;

/**
 * 22: the tasks given to me, still open, and how many are late: the
 * counter of « Tâches » in the menu and the phone's shortcut.
 */
export async function myTaskCount(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(
        `SELECT t.category,t.responsible_id,t.responsible_user_id,(t.due_on<CURRENT_DATE) AS late FROM task t WHERE t.organization_id=$1 AND t.status<>'done'
           AND (t.responsible_user_id=$2 OR t.responsible_id=ANY($3::uuid[]) OR EXISTS(SELECT 1 FROM task_assignee a WHERE a.task_id=t.id AND a.done_on IS NULL AND (a.user_id=$2 OR a.profile_id=ANY($3::uuid[]))))`,
        [s.org, s.userId, [...s.own]],
      )
    ).rows as { category: Category; responsible_id: string | null; responsible_user_id: string | null; late: boolean | null }[];
    const open = rows.filter((t) => !(s.financeOff && isMoney(t.category)));
    return { open: open.length, late: open.filter((t) => t.late).length };
  });
}

export async function tasksView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    // The application's own tasks are brought up to date first (idempotent).
    if (!s.federation) await syncSources(s.c, s.org);
    const rows = (
      await s.c.query(`${select} WHERE t.organization_id=$1 AND (t.status<>'done' OR t.done_on>CURRENT_DATE-90) ORDER BY t.due_on NULLS LAST,t.title LIMIT 2000`, [s.org])
    ).rows as TaskRow[];
    const crew = await assigneesOf(s.c, s.org, rows.map((t) => t.id));
    for (const t of rows) t.assignees = crew.get(t.id) ?? [];
    const tasks = rows.filter((t) => visible(s, t));
    const comments = (
      await s.c.query(
        `SELECT k.id,k.task_id,k.body,k.created_at,u.name AS author FROM task_comment k JOIN "user" u ON u.id=k.author_id WHERE k.organization_id=$1 AND k.task_id=ANY($2::uuid[]) ORDER BY k.created_at`,
        [s.org, tasks.map((t) => t.id)],
      )
    ).rows as { id: string; task_id: string; body: string; created_at: string; author: string }[];
    for (const t of tasks) t.comments = comments.filter((k) => k.task_id === t.id).map(({ task_id: _t, ...k }) => (void _t, k));
    const people = !s.manage
      ? []
      : s.federation
        ? ((
            await s.c.query(
              `SELECT DISTINCT u.id AS user_id,u.name AS full_name FROM role_assignment r JOIN "user" u ON u.id=r.user_id
                WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active ORDER BY u.name LIMIT 500`,
              [s.org],
            )
          ).rows.map((r) => ({ id: r.user_id as string, full_name: r.full_name as string, account: true })) as { id: string; full_name: string; account: boolean }[])
        : ((
            await s.c.query(
              "SELECT DISTINCT c.id,c.full_name FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 AND c.status='active' AND (p.user_id IS NOT NULL OR 'coach'=ANY(c.directory_roles)) ORDER BY c.full_name LIMIT 500",
              [s.org],
            )
          ).rows.map((r) => ({ ...r, account: false })) as { id: string; full_name: string; account: boolean }[]);
    const fiscalStart = s.federation ? "01-01" : (((await s.c.query("SELECT fiscal_year_start FROM organization WHERE id=$1", [s.org])).rows[0]?.fiscal_year_start as string) ?? "01-01");
    return {
      organization_id: s.org,
      federation: s.federation,
      today: brusselsToday(),
      fiscalStart,
      can: { manage: s.manage, money: s.money, moneyManage: s.moneyManage },
      own: [...s.own],
      userId: s.userId,
      people,
      teams: s.federation ? [] : ((await s.c.query("SELECT t.id,t.name FROM team t JOIN season se ON se.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT se.archived ORDER BY t.name", [s.org])).rows as { id: string; name: string }[]),
      tasks,
      // 2: the places for a meeting (the club's, and the shared directory).
      places: s.federation ? [] : ((await s.c.query("SELECT id,name,address FROM calendar_place WHERE organization_id=$1 AND NOT archived ORDER BY name", [s.org])).rows as { id: string; name: string; address: string }[]),
      sharedVenues: s.federation
        ? []
        : ((await s.c.query(`SELECT v.id,v.name,v.address FROM shared_venue v WHERE ${visibleVenue()} ORDER BY v.name LIMIT 500`, [s.org])).rows as { id: string; name: string; address: string }[]),
      templates: s.federation
        ? []
        : ((await s.c.query("SELECT id,kind,name,items,archived,category FROM task_template WHERE organization_id=$1 ORDER BY archived,kind,name", [s.org])).rows as {
            id: string;
            kind: TaskKind;
            name: string;
            items: TemplateItem[];
            archived: boolean;
            category: Category | null;
          }[]),
    };
  });
}

/** Each link must belong to this club. */
async function checkLinks(s: Scope, l: { eventId: string | null; matchId: string | null; tripId: string | null; obligationId: string | null; chairId: string | null; teamId?: string | null }) {
  for (const [table, value] of [
    ["calendar_event", l.eventId],
    ["match", l.matchId],
    ["trip", l.tripId],
    ["club_obligation", l.obligationId],
    ["equipment_chair", l.chairId],
    ["team", l.teamId ?? null],
  ] as const)
    if (value && !(await s.c.query(`SELECT 1 FROM ${table} WHERE id=$1 AND organization_id=$2`, [value, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
}
/** One may give a task to someone else when planning; otherwise only to oneself. */
async function checkResponsible(s: Scope, id: string | null, userId: string | null = null) {
  if (userId) {
    if (!s.federation) throw new AccessError("INVALID_INPUT", 400);
    const ok = await s.c.query("SELECT 1 FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL", [s.org, userId]);
    if (!ok.rowCount) throw new AccessError("NOT_FOUND", 404);
    if (!s.manage && userId !== s.userId) throw new AccessError("FORBIDDEN");
    return { profile: null, user: userId };
  }
  if (!id) {
    if (!s.manage && !s.money) throw new AccessError("FORBIDDEN");
    return { profile: null, user: null };
  }
  if (s.federation) throw new AccessError("INVALID_INPUT", 400);
  if (!(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  if (!s.manage && !s.moneyManage && !s.own.has(id)) throw new AccessError("FORBIDDEN");
  return { profile: id, user: null };
}
/** The right to create in a category. */
function checkCategory(s: Scope, category: Category) {
  const fed = category.startsWith("fed_");
  if (fed !== s.federation) throw new AccessError("INVALID_INPUT", 400);
  if (isMoney(category) ? !s.moneyManage && !s.manage : !s.manage) {
    // Not planning: one's own tasks only (checked with the responsible).
    return false;
  }
  return true;
}

type Insert = {
  kind: string;
  category: Category;
  title: string;
  detail: string;
  due: string | null;
  responsible: { profile: string | null; user: string | null };
  links: Record<string, string | null>;
  origin: "manual" | "template";
  priority?: string;
  recurrence?: string;
  checklist?: { text: string; done: boolean }[];
  team?: string | null;
  sourceKey?: string | null;
  sourceKind?: string;
  extra?: Extra;
};
/** 2: what a task may carry besides its deadline. */
type Extra = {
  completion: "any" | "each";
  meetingStartsAt: string | null;
  meetingEndsAt: string | null;
  placeId: string | null;
  sharedVenueId: string | null;
  freeLocation: string;
  linkUrl: string;
  amountCents: number | null;
  recurrenceUntil: string | null;
};
const noExtra: Extra = { completion: "any", meetingStartsAt: null, meetingEndsAt: null, placeId: null, sharedVenueId: null, freeLocation: "", linkUrl: "", amountCents: null, recurrenceUntil: null };
const insert = async (s: Scope, i: Insert) => {
  const r = await s.c.query(
    `INSERT INTO task(organization_id,kind,category,title,detail,due_on,responsible_id,responsible_user_id,event_id,match_id,trip_id,obligation_id,chair_id,origin,priority,recurrence,checklist,team_id,source_key,source_kind,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING RETURNING id`,
    [
      s.org,
      i.kind,
      i.category,
      i.title,
      i.detail,
      i.due,
      i.responsible.profile,
      i.responsible.user,
      i.links.eventId ?? null,
      i.links.matchId ?? null,
      i.links.tripId ?? null,
      i.links.obligationId ?? null,
      i.links.chairId ?? null,
      i.origin,
      i.priority ?? "normal",
      i.recurrence ?? "none",
      JSON.stringify(i.checklist ?? []),
      i.team ?? null,
      i.sourceKey ?? null,
      i.sourceKind ?? "",
      s.userId,
    ],
  );
  if (r.rows[0] && i.extra) await setExtra(s, r.rows[0].id, i.extra);
  return r;
};
async function setExtra(s: Scope, id: string, e: Extra) {
  await s.c.query(
    `UPDATE task SET completion=$3,meeting_starts_at=$4,meeting_ends_at=$5,place_id=$6,shared_venue_id=$7,free_location=$8,link_url=$9,amount_cents=$10,recurrence_until=$11 WHERE id=$1 AND organization_id=$2`,
    [id, s.org, e.completion, e.meetingStartsAt, e.meetingEndsAt, e.placeId, e.sharedVenueId, e.freeLocation, e.linkUrl, e.amountCents, e.recurrenceUntil],
  );
}
/** 2: the extra fields of a command, checked (the place belongs to the club, the meeting ends after it starts). */
async function extraOf(s: Scope, c: Partial<Extra> & { completion?: "any" | "each" }): Promise<Extra> {
  const e = { ...noExtra, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) } as Extra;
  if (e.meetingEndsAt && (!e.meetingStartsAt || e.meetingEndsAt <= e.meetingStartsAt)) throw new AccessError("INVALID_DATE", 400);
  if (e.placeId && !(await s.c.query("SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2", [e.placeId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  if (e.sharedVenueId && !(await s.c.query("SELECT 1 FROM shared_venue WHERE id=$1", [e.sharedVenueId])).rowCount) throw new AccessError("NOT_FOUND", 404);
  return e;
}
/**
 * 2: the people in charge of a task (profiles of the club, or accounts of the
 * federation). Someone who does not plan can only take a task for himself.
 * The first one stays in responsible_id / responsible_user_id.
 */
async function setAssignees(s: Scope, taskId: string, profiles: string[], users: string[]) {
  const p = [...new Set(profiles)],
    u = [...new Set(users)];
  if (p.length && s.federation) throw new AccessError("INVALID_INPUT", 400);
  if (u.length && !s.federation) throw new AccessError("INVALID_INPUT", 400);
  if (p.length && (await s.c.query("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND status='active' AND id=ANY($2::uuid[])", [s.org, p])).rows[0].n !== p.length)
    throw new AccessError("NOT_FOUND", 404);
  if (u.length && (await s.c.query("SELECT count(DISTINCT user_id)::int AS n FROM role_assignment WHERE organization_id=$1 AND revoked_at IS NULL AND user_id=ANY($2::text[])", [s.org, u])).rows[0].n !== u.length)
    throw new AccessError("NOT_FOUND", 404);
  const before = (await s.c.query("SELECT profile_id,user_id FROM task_assignee WHERE task_id=$1", [taskId])).rows as { profile_id: string | null; user_id: string | null }[];
  await s.c.query("DELETE FROM task_assignee WHERE task_id=$1 AND organization_id=$2 AND NOT (COALESCE(profile_id::text,user_id)=ANY($3::text[]))", [taskId, s.org, [...p, ...u]]);
  for (const id of p) await s.c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [taskId, s.org, id]);
  for (const id of u) await s.c.query("INSERT INTO task_assignee(task_id,organization_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [taskId, s.org, id]);
  await s.c.query("UPDATE task SET responsible_id=$3,responsible_user_id=$4 WHERE id=$1 AND organization_id=$2", [taskId, s.org, p[0] ?? null, u[0] ?? null]);
  // The first one was put back by the trigger if it was dropped: keep the list exact.
  await s.c.query("DELETE FROM task_assignee WHERE task_id=$1 AND organization_id=$2 AND NOT (COALESCE(profile_id::text,user_id)=ANY($3::text[]))", [taskId, s.org, [...p, ...u]]);
  return [...p, ...u].filter((x) => !before.some((b) => (b.profile_id ?? b.user_id) === x));
}
/** The people a command gives the task to: the list, or the single responsible of older calls. */
function crewOf(c: { assignees?: string[]; assigneeUserIds?: string[]; responsibleId?: string | null; responsibleUserId?: string | null }) {
  return {
    profiles: c.assignees ?? (c.responsibleId ? [c.responsibleId] : []),
    users: c.assigneeUserIds ?? (c.responsibleUserId ? [c.responsibleUserId] : []),
  };
}

/** The people given a task hear it at once, each once (the reminders at J-7 and J-1 follow in fundingTaskTick). */
async function tellResponsible(s: Pick<Scope, "c" | "org" | "userId">, taskId: string, only: string[] | null = null) {
  const rows = (
    await s.c.query(
      `SELECT DISTINCT t.title,t.due_on::text AS due_on,o.name AS organization,u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,COALESCE(a.profile_id::text,a.user_id) AS who
         FROM task t JOIN organization o ON o.id=t.organization_id JOIN task_assignee a ON a.task_id=t.id
         LEFT JOIN club_person cp ON cp.id=a.profile_id AND cp.organization_id=t.organization_id LEFT JOIN person cpe ON cpe.id=cp.person_id
         JOIN "user" u ON u.id=COALESCE(a.user_id,cpe.user_id) LEFT JOIN person pe ON pe.user_id=u.id
        WHERE t.id=$1 AND t.organization_id=$2 AND u.active`,
      [taskId, s.org],
    )
  ).rows as { title: string; due_on: string | null; organization: string; id: string; email: string; name: string; locale: "fr" | "nl" | "en"; who: string }[];
  for (const r of rows) {
    if (r.id === s.userId || (only && !only.includes(r.who))) continue;
    await publish(s.c, {
      organizationId: s.org,
      userId: r.id,
      email: r.email,
      kind: "funding_task",
      category: "administrative",
      resourceType: "funding",
      resourceId: taskId,
      eventKey: `task_assigned:${taskId}:${r.id}`,
      locale: r.locale,
      inApp: true,
      variables: { name: r.name, organization: r.organization, url: `${process.env.BETTER_AUTH_URL ?? ""}/${r.locale}/tasks?task=${taskId}`, title: r.title, due: r.due_on ?? "" },
    });
  }
}

/** A4: a task created elsewhere (a contact's next action) is told the same way. */
export const tellTaskResponsible = (c: PoolClient, org: string, actorId: string, taskId: string) => tellResponsible({ c, org, userId: actorId }, taskId);

async function taskFor(s: Scope, id: string) {
  const t = (
    await s.c.query(
      `SELECT id,kind,category,title,detail,due_on::text AS due_on,status,responsible_id,responsible_user_id,recurrence,checklist,priority,team_id,origin,source_key,
              completion,meeting_starts_at,meeting_ends_at,place_id,shared_venue_id,free_location,link_url,amount_cents,recurrence_until::text AS recurrence_until,transaction_id,affiliation_due_id
         FROM task WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [id, s.org],
    )
  ).rows[0] as
    | (Pick<
        TaskRow,
        | "id"
        | "kind"
        | "category"
        | "title"
        | "detail"
        | "due_on"
        | "status"
        | "responsible_id"
        | "responsible_user_id"
        | "recurrence"
        | "checklist"
        | "priority"
        | "team_id"
        | "completion"
        | "meeting_starts_at"
        | "meeting_ends_at"
        | "place_id"
        | "shared_venue_id"
        | "free_location"
        | "link_url"
        | "amount_cents"
        | "recurrence_until"
        | "transaction_id"
        | "affiliation_due_id"
        | "assignees"
      > & {
        origin: string;
        source_key: string | null;
      })
    | undefined;
  if (!t) throw new AccessError("NOT_FOUND", 404);
  t.assignees = (await assigneesOf(s.c, s.org, [t.id])).get(t.id) ?? [];
  if (!visible(s, t)) throw new AccessError("NOT_FOUND", 404);
  return t;
}
const shiftIso = (iso: string | null, days: number) => (iso ? new Date(new Date(iso).getTime() + days * 86400000).toISOString() : null);

/** Done: a recurring task comes back for its next date (until its end, if it has one), with the same people. */
async function setStatus(s: Scope, t: Awaited<ReturnType<typeof taskFor>>, status: Status) {
  await s.c.query("UPDATE task SET status=$3,done_on=CASE WHEN $3='done' THEN CURRENT_DATE ELSE NULL END,auto_closed=false,updated_at=now() WHERE id=$1 AND organization_id=$2", [
    t.id,
    s.org,
    status,
  ]);
  if (status !== "done") await s.c.query("UPDATE task_assignee SET done_on=NULL,done_by=NULL WHERE task_id=$1 AND $2::text<>'done' AND $3", [t.id, status, t.completion === "any"]);
  let next: string | null = null;
  if (status === "done" && t.status !== "done" && t.recurrence !== "none" && t.due_on) {
    const due = nextDue(t.due_on, t.recurrence);
    if (due && (!t.recurrence_until || due <= t.recurrence_until)) {
      const days = Math.round((Date.parse(due) - Date.parse(t.due_on)) / 86400000);
      next = (
        await insert(s, {
          kind: t.kind,
          category: t.category,
          title: t.title,
          detail: t.detail,
          due,
          responsible: { profile: t.responsible_id, user: t.responsible_user_id },
          links: {},
          origin: "template",
          priority: t.priority,
          recurrence: t.recurrence,
          checklist: t.checklist.map((i) => ({ ...i, done: false })),
          team: t.team_id,
          // The yearly model keeps one task per year and duty.
          sourceKey: t.source_key?.startsWith("year:") && t.recurrence === "yearly" ? t.source_key.replace(/^year:(\d{4})/, (_, y: string) => `year:${Number(y) + 1}`) : null,
          sourceKind: t.source_key?.startsWith("year:") ? (t.source_key.split(":")[2] ? `year_${t.source_key.split(":")[2]}` : "") : "",
          extra: {
            completion: t.completion,
            meetingStartsAt: shiftIso(t.meeting_starts_at, days),
            meetingEndsAt: shiftIso(t.meeting_ends_at, days),
            placeId: t.place_id,
            sharedVenueId: t.shared_venue_id,
            freeLocation: t.free_location,
            linkUrl: t.link_url,
            amountCents: t.amount_cents,
            recurrenceUntil: t.recurrence_until,
          },
        })
      ).rows[0]?.id;
      if (next)
        for (const a of t.assignees)
          await s.c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id,user_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [next, s.org, a.profile_id, a.user_id]);
    }
  }
  await audit(s.c, s.org, s.userId, status === "done" ? "task.done" : status === "doing" ? "task.started" : "task.reopened", t.id, next ? { next } : undefined);
  return next;
}

export async function tasksExecute(db: Pool, p: Principal, command: TaskCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "create") {
        const category = command.category ?? categoryOf(command.kind ?? "other");
        const planning = checkCategory(s, category);
        await checkLinks(s, command);
        const crew = crewOf(command);
        // Not planning: only a task of one's own (and nobody else in it).
        if (!planning) {
          if (!crew.profiles.length && !crew.users.length) throw new AccessError("FORBIDDEN");
          if (crew.profiles.some((x) => !s.own.has(x)) || crew.users.some((x) => x !== s.userId)) throw new AccessError("FORBIDDEN");
        }
        if (!crew.profiles.length && !crew.users.length && !s.manage && !s.money) throw new AccessError("FORBIDDEN");
        const extra = await extraOf(s, command);
        const id = (
          await insert(s, {
            kind: command.kind ?? kindOf(category),
            category,
            title: command.title,
            detail: command.detail,
            due: command.dueOn,
            responsible: { profile: null, user: null },
            links: { eventId: command.eventId, matchId: command.matchId, tripId: command.tripId, obligationId: command.obligationId, chairId: command.chairId },
            origin: "manual",
            priority: command.priority,
            recurrence: command.recurrence,
            checklist: (command.checklist ?? []).map((text) => ({ text, done: false })),
            team: command.teamId,
            extra,
          })
        ).rows[0].id as string;
        await setAssignees(s, id, crew.profiles, crew.users);
        await audit(s.c, s.org, s.userId, "task.created", id, { category });
        await tellResponsible(s, id);
        return { ok: true as const, ids: [id] };
      }
      if (command.action === "fromTemplate") {
        if (s.federation || !s.manage) throw new AccessError("FORBIDDEN");
        await checkLinks(s, command);
        const t = (await s.c.query("SELECT kind,name,items,category FROM task_template WHERE id=$1 AND organization_id=$2 AND NOT archived", [command.templateId, s.org])).rows[0] as
          | { kind: TaskKind; name: string; items: TemplateItem[]; category: Category | null }
          | undefined;
        if (!t) throw new AccessError("NOT_FOUND", 404);
        const ids: string[] = [];
        for (const [n, i] of t.items.entries()) {
          if ((command.excluded ?? []).includes(n)) continue;
          const id = (
            await insert(s, {
              kind: t.kind,
              category: t.category ?? categoryOf(t.kind),
              title: i.title,
              detail: i.detail ?? "",
              due: dueBefore(command.date, i.daysBefore),
              responsible: { profile: null, user: null },
              links: { eventId: command.eventId, matchId: command.matchId, tripId: command.tripId, obligationId: command.obligationId, chairId: command.chairId },
              origin: "template",
            })
          ).rows[0].id as string;
          // 2: each line's people, adjusted before validating (or the one person of older calls).
          await setAssignees(s, id, (command.assignments ?? {})[String(n)] ?? (command.responsibleId ? [command.responsibleId] : []), []);
          await tellResponsible(s, id);
          ids.push(id);
        }
        await audit(s.c, s.org, s.userId, "task.template.applied", command.templateId, { count: ids.length });
        return { ok: true as const, ids };
      }
      if (command.action === "saveAsTemplate" || command.action === "duplicateTemplate" || command.action === "archiveTemplate") {
        if (s.federation || !s.manage) throw new AccessError("FORBIDDEN");
        if (command.action === "archiveTemplate") {
          if (!(await s.c.query("UPDATE task_template SET archived=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [command.id, s.org, command.archived])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, command.archived ? "task.template.archived" : "task.template.restored", command.id);
          return { ok: true as const, id: command.id };
        }
        const from =
          command.action === "duplicateTemplate"
            ? ((await s.c.query("SELECT kind,category,items FROM task_template WHERE id=$1 AND organization_id=$2", [command.id, s.org])).rows[0] as { kind: string; category: string | null; items: TemplateItem[] } | undefined)
            : await (async () => {
                const x = await taskFor(s, command.id);
                return { kind: x.kind === "sponsor" || x.kind === "grant" ? "other" : x.kind, category: x.category.startsWith("fed_") ? null : x.category, items: [{ title: x.title, detail: x.detail, daysBefore: 0 }] };
              })();
        if (!from) throw new AccessError("NOT_FOUND", 404);
        const id = (
          await s.c.query("INSERT INTO task_template(organization_id,kind,category,name,items,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
            s.org,
            from.kind,
            from.category,
            command.name,
            JSON.stringify(from.items),
            s.userId,
          ])
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "task.template.saved", id);
        return { ok: true as const, id };
      }
      if (command.action === "applyYear") {
        if (s.federation || !s.manage) throw new AccessError("FORBIDDEN");
        const ids: string[] = [];
        for (const i of command.items) {
          const responsible = await checkResponsible(s, i.responsibleId);
          const id = (
            await insert(s, {
              kind: "other",
              category: i.key === "affiliation" ? "affiliation" : "admin",
              title: i.title,
              detail: "",
              due: i.dueOn,
              responsible,
              links: {},
              origin: "template",
              recurrence: "yearly",
              sourceKey: `year:${command.year}:${i.key}`,
              sourceKind: `year_${i.key}`,
            })
          ).rows[0]?.id as string | undefined;
          if (id) {
            ids.push(id);
            await tellResponsible(s, id);
          }
        }
        await audit(s.c, s.org, s.userId, "task.year.applied", s.org, { year: command.year, count: ids.length });
        return { ok: true as const, ids };
      }
      if (command.action === "saveTemplate" || command.action === "deleteTemplate") {
        if (s.federation || !s.manage) throw new AccessError("FORBIDDEN");
        if (command.action === "saveTemplate") {
          const id = command.id
            ? ((
                await s.c.query("UPDATE task_template SET kind=$3,name=$4,items=$5,category=$6,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [
                  command.id,
                  s.org,
                  command.kind,
                  command.name,
                  JSON.stringify(command.items),
                  command.category ?? null,
                ])
              ).rows[0]?.id as string | undefined)
            : ((
                await s.c.query("INSERT INTO task_template(organization_id,kind,name,items,created_by,category) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
                  s.org,
                  command.kind,
                  command.name,
                  JSON.stringify(command.items),
                  s.userId,
                  command.category ?? null,
                ])
              ).rows[0].id as string);
          if (!id) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, "task.template.saved", id);
          return { ok: true as const, id };
        }
        if (!(await s.c.query("DELETE FROM task_template WHERE id=$1 AND organization_id=$2", [command.id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(s.c, s.org, s.userId, "task.template.deleted", command.id);
        return { ok: true as const };
      }

      // One task: tick, start, edit, sub-tasks, comments, delete.
      const t = await taskFor(s, command.id);
      if (command.action === "comment") {
        await s.c.query("INSERT INTO task_comment(task_id,organization_id,author_id,body) VALUES($1,$2,$3,$4)", [t.id, s.org, s.userId, command.body]);
        await audit(s.c, s.org, s.userId, "task.commented", t.id);
        return { ok: true as const };
      }
      if (!canWork(s, t)) throw new AccessError("FORBIDDEN");
      if (command.action === "expense") {
        // 2 (7): the task's expense, once; the line is linked to the task, never written twice.
        if (!(isMoney(t.category) ? s.moneyManage : s.manage) || s.financeOff || s.federation) throw new AccessError("FORBIDDEN");
        if (t.transaction_id) throw new AccessError("ALREADY_RECORDED", 409);
        const tx = (
          await s.c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by) VALUES($1,$2,$3,'out',$4,$5,'transfer','','','',$6) RETURNING id",
            [s.org, command.occurredOn, command.label, t.affiliation_due_id || t.category === "affiliation" ? "affiliation" : "other", command.amountCents, s.userId],
          )
        ).rows[0].id as string;
        await s.c.query("UPDATE task SET transaction_id=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [t.id, s.org, tx]);
        await audit(s.c, s.org, s.userId, "task.expense", t.id, { transaction: tx });
        return { ok: true as const, id: tx };
      }
      if (command.action === "done" || command.action === "status") {
        const want = command.action === "done" ? (command.done ? "done" : "todo") : command.status;
        // 2: « chacun coche sa part »: an assignee ticks his own part; the task is done when every part is.
        const me = t.assignees.find((a) => (!!a.profile_id && s.own.has(a.profile_id)) || a.user_id === s.userId);
        if (t.completion === "each" && me && (want === "done" || want === "todo") && t.assignees.length > 1) {
          await s.c.query(
            "UPDATE task_assignee SET done_on=CASE WHEN $4 THEN CURRENT_DATE END,done_by=CASE WHEN $4 THEN $5 END WHERE task_id=$1 AND organization_id=$2 AND COALESCE(profile_id::text,user_id)=$3",
            [t.id, s.org, me.profile_id ?? me.user_id, want === "done", s.userId],
          );
          const left = (await s.c.query("SELECT count(*)::int AS n FROM task_assignee WHERE task_id=$1 AND done_on IS NULL", [t.id])).rows[0].n as number;
          if (left === 0 && t.status !== "done") return { ok: true as const, next: await setStatus(s, t, "done") };
          if (left > 0 && t.status === "done") await setStatus(s, t, "todo");
          else if (left > 0 && t.status === "todo") await s.c.query("UPDATE task SET status='doing',updated_at=now() WHERE id=$1", [t.id]);
          await audit(s.c, s.org, s.userId, want === "done" ? "task.part.done" : "task.part.reopened", t.id);
          return { ok: true as const, next: null };
        }
        const next = await setStatus(s, t, want);
        if (want === "done") await s.c.query("UPDATE task_assignee SET done_on=COALESCE(done_on,CURRENT_DATE) WHERE task_id=$1 AND $2", [t.id, t.completion === "any"]);
        return { ok: true as const, next };
      }
      if (command.action === "check" || command.action === "addItem") {
        const list = [...t.checklist];
        if (command.action === "addItem") {
          if (list.length >= 50) throw new AccessError("INVALID_INPUT", 400);
          list.push({ text: command.text, done: false });
        } else {
          if (!list[command.index]) throw new AccessError("NOT_FOUND", 404);
          list[command.index] = { ...list[command.index], done: command.done };
        }
        await s.c.query("UPDATE task SET checklist=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [t.id, s.org, JSON.stringify(list)]);
        return { ok: true as const };
      }
      if (command.action === "update") {
        const planning = checkCategory(s, command.category);
        const crew = crewOf(command);
        if (!planning && (crew.profiles.some((x) => !s.own.has(x)) || crew.users.some((x) => x !== s.userId) || (!crew.profiles.length && !crew.users.length)))
          throw new AccessError("FORBIDDEN");
        const responsible = { profile: crew.profiles[0] ?? null, user: crew.users[0] ?? null };
        // A sponsor's or a grant's task keeps its file and type.
        const keepKind = t.kind === "sponsor" || t.kind === "grant";
        if (command.teamId) await checkLinks(s, { eventId: null, matchId: null, tripId: null, obligationId: null, chairId: null, teamId: command.teamId });
        await s.c.query(
          `UPDATE task SET category=$3,title=$4,detail=$5,due_on=$6,responsible_id=$7,responsible_user_id=$8,priority=$9,recurrence=$10,team_id=$11,kind=$12,updated_at=now()
            WHERE id=$1 AND organization_id=$2`,
          [
            t.id,
            s.org,
            command.category,
            command.title,
            command.detail,
            command.dueOn,
            responsible.profile,
            responsible.user,
            command.priority,
            command.recurrence,
            command.teamId,
            keepKind ? t.kind : kindOf(command.category),
          ],
        );
        await setExtra(s, t.id, await extraOf(s, command));
        const added = await setAssignees(s, t.id, crew.profiles, crew.users);
        await audit(s.c, s.org, s.userId, "task.updated", t.id);
        // Only the people newly given the task hear it.
        if (added.length) await tellResponsible(s, t.id, added);
        return { ok: true as const };
      }
      // Delete: a sponsor's or a grant's task is removed from its file; an automatic one closes by itself.
      if (t.kind === "sponsor" || t.kind === "grant" || t.source_key || !s.manage) throw new AccessError("FORBIDDEN");
      await s.c.query("DELETE FROM task_proof WHERE task_id=$1 AND organization_id=$2", [t.id, s.org]);
      await s.c.query("DELETE FROM task WHERE id=$1 AND organization_id=$2", [t.id, s.org]);
      await audit(s.c, s.org, s.userId, "task.deleted", t.id);
      return { ok: true as const };
    },
    expected,
  );
}

/** « À faire » on the home: one's open tasks due within 14 days, late ones included. */
export async function myTasksCount(c: PoolClient, org: string, userId: string, own: string[]) {
  return (
    await c.query(
      "SELECT count(*)::int AS n FROM task t WHERE t.organization_id=$1 AND t.status<>'done' AND t.due_on<=CURRENT_DATE+14 AND (t.responsible_user_id=$2 OR t.responsible_id=ANY($3::uuid[]) OR EXISTS(SELECT 1 FROM task_assignee a WHERE a.task_id=t.id AND a.done_on IS NULL AND (a.user_id=$2 OR a.profile_id=ANY($3::uuid[]))))",
      [org, userId, own],
    )
  ).rows[0].n as number;
}

/**
 * 2 (6): « Année ». The next twelve months at a glance for whoever plans:
 * every dated task (a recurring one at each of its dates), the grants'
 * deadlines, the sponsors' renewals, the annual accounts and the
 * affiliations, each with its state (done, to come, late).
 */
export type YearItem = { date: string; category: Category; title: string; state: "done" | "upcoming" | "late"; source: "task" | "money" | "affiliation"; recurring: boolean };
export async function tasksYear(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    if (!s.manage) throw new AccessError("FORBIDDEN");
    const today = brusselsToday();
    const end = new Date(today + "T12:00:00Z");
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    const to = end.toISOString().slice(0, 10);
    const rows = (
      await s.c.query(
        "SELECT t.id,t.category,t.title,t.due_on::text AS due_on,t.status,t.recurrence,t.recurrence_until::text AS recurrence_until,t.responsible_id,t.responsible_user_id,t.source_kind,t.source_params FROM task t WHERE t.organization_id=$1 AND t.due_on IS NOT NULL AND t.due_on<=$3 AND (t.due_on>=$2 OR t.status<>'done')",
        [s.org, today.slice(0, 8) + "01", to],
      )
    ).rows as (Pick<TaskRow, "id" | "category" | "title" | "due_on" | "status" | "recurrence" | "recurrence_until" | "responsible_id" | "responsible_user_id"> & { source_kind: string })[];
    const items: YearItem[] = [];
    for (const t of rows.filter((t) => visible(s, t))) {
      const state = t.status === "done" ? "done" : t.due_on! < today ? "late" : "upcoming";
      items.push({ date: t.due_on!, category: t.category, title: t.title, state, source: "task", recurring: t.recurrence !== "none" });
      // The next dates of a repetition, until the end of the twelve months (or of the repetition).
      if (t.recurrence !== "none" && t.status !== "done")
        for (let d = nextDue(t.due_on!, t.recurrence); d && d <= to && (!t.recurrence_until || d <= t.recurrence_until); d = nextDue(d, t.recurrence))
          items.push({ date: d, category: t.category, title: t.title, state: "upcoming", source: "task", recurring: true });
    }
    if (!s.federation && s.money)
      for (const m of await moneyDeadlinesIn(s.c, s.org, today, to, true, []))
        if (!m.id.startsWith("task:") && m.source !== "tournament")
          items.push({ date: m.date, category: m.source === "partner" ? "sponsors" : m.source === "grant" ? "grants" : "admin", title: m.title, state: "upcoming", source: "money", recurring: false });
    if (!s.federation)
      for (const a of (
        await s.c.query(
          "SELECT d.due_on::text AS due_on,d.paid_on,f.name,d.period FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id WHERE d.organization_id=$1 AND d.due_on BETWEEN $2 AND $3 AND NOT EXISTS(SELECT 1 FROM task t WHERE t.affiliation_due_id=d.id)",
          [s.org, today, to],
        )
      ).rows)
        items.push({ date: a.due_on, category: "affiliation", title: `${a.name} ${a.period}`, state: a.paid_on ? "done" : a.due_on < today ? "late" : "upcoming", source: "affiliation", recurring: true });
    items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    const org = (await s.c.query("SELECT name FROM organization WHERE id=$1", [s.org])).rows[0]?.name as string;
    return { organization: org, from: today, to, federation: s.federation, items };
  });
}
