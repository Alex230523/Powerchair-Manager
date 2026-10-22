import type { Pool, PoolClient } from "pg";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { ownProfiles } from "../calendar/access";
import { brusselsToday } from "../people/service";
import { dueBefore, type TaskCommand, type TaskKind, type TemplateItem } from "./schema";

/**
 * Wave 17 (O1): the club's task list. The president and the people who plan
 * (calendar.manage, teams.manage) see and give every task; sponsors' and
 * grants' tasks stay with the money people (dues.read); everyone sees and
 * ticks the tasks given to them. The table is funding_task (wave 15), made
 * common to every type.
 */
export type Scope = { c: PoolClient; org: string; userId: string; manage: boolean; money: boolean; moneyManage: boolean; own: Set<string>; financeOff: boolean };

/** Also the scope of the coaches' driving licences: the same people organise the trips. */
export async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const has = (...r: string[]) => mfa && r.some((x) => rights.includes(x as (typeof rights)[number]));
    const off = ((await c.query("SELECT disabled_modules FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.disabled_modules ?? []) as string[];
    const out = await fn({
      c,
      org: a.organization_id,
      userId: p.userId,
      manage: mfa && (a.role === "club_president" || has("calendar.manage", "teams.manage")),
      money: has("dues.read", "dues.manage") && !off.includes("finance"),
      moneyManage: has("dues.manage") && !off.includes("finance"),
      own: mfa ? await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled }) : new Set(),
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
  title: string;
  detail: string;
  due_on: string | null;
  status: "todo" | "done";
  done_on: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  partner_id: string | null;
  grant_id: string | null;
  event_id: string | null;
  match_id: string | null;
  trip_id: string | null;
  obligation_id: string | null;
  chair_id: string | null;
  about: string | null;
};

/** What a task may see: every task of its kind, or only one's own. */
const visible = (s: Scope, t: { kind: TaskKind; responsible_id: string | null }) =>
  (t.responsible_id && s.own.has(t.responsible_id) && !(s.financeOff && (t.kind === "sponsor" || t.kind === "grant"))) ||
  (t.kind === "sponsor" || t.kind === "grant" ? s.money : s.manage);

export async function tasksView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(
        `SELECT t.id,t.kind,t.title,t.detail,t.due_on::text AS due_on,t.status,t.done_on::text AS done_on,t.responsible_id,cp.full_name AS responsible_name,
                t.partner_id,t.grant_id,t.event_id,t.match_id,t.trip_id,t.obligation_id,t.chair_id,
                COALESCE(pa.name, g.funder, e.title, CASE WHEN m.id IS NOT NULL THEN mt.name||' · '||m.opponent END, tr.title, o.title, ch.name) AS about
           FROM funding_task t LEFT JOIN club_person cp ON cp.id=t.responsible_id AND cp.organization_id=t.organization_id
           LEFT JOIN partner pa ON pa.id=t.partner_id LEFT JOIN grant_application g ON g.id=t.grant_id
           LEFT JOIN calendar_event e ON e.id=t.event_id AND e.organization_id=t.organization_id
           LEFT JOIN match m ON m.id=t.match_id AND m.organization_id=t.organization_id LEFT JOIN team mt ON mt.id=m.team_id
           LEFT JOIN trip tr ON tr.id=t.trip_id AND tr.organization_id=t.organization_id
           LEFT JOIN club_obligation o ON o.id=t.obligation_id AND o.organization_id=t.organization_id
           LEFT JOIN equipment_chair ch ON ch.id=t.chair_id AND ch.organization_id=t.organization_id
          WHERE t.organization_id=$1
          ORDER BY t.due_on NULLS LAST,t.title`,
        [s.org],
      )
    ).rows as TaskRow[];
    const people = s.manage
      ? ((
          await s.c.query(
            "SELECT DISTINCT c.id,c.full_name FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 AND c.status='active' AND (p.user_id IS NOT NULL OR 'coach'=ANY(c.directory_roles)) ORDER BY c.full_name LIMIT 500",
            [s.org],
          )
        ).rows as { id: string; full_name: string }[])
      : [];
    return {
      organization_id: s.org,
      today: brusselsToday(),
      can: { manage: s.manage, money: s.money },
      own: [...s.own],
      people,
      tasks: rows.filter((t) => visible(s, t)),
      templates: (await s.c.query("SELECT id,kind,name,items FROM task_template WHERE organization_id=$1 ORDER BY kind,name", [s.org])).rows as {
        id: string;
        kind: TaskKind;
        name: string;
        items: TemplateItem[];
      }[],
    };
  });
}

/** Each link must belong to this club. */
async function checkLinks(s: Scope, l: { eventId: string | null; matchId: string | null; tripId: string | null; obligationId: string | null; chairId: string | null }) {
  for (const [table, value] of [
    ["calendar_event", l.eventId],
    ["match", l.matchId],
    ["trip", l.tripId],
    ["club_obligation", l.obligationId],
    ["equipment_chair", l.chairId],
  ] as const)
    if (value && !(await s.c.query(`SELECT 1 FROM ${table} WHERE id=$1 AND organization_id=$2`, [value, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
}
/** One may give a task to someone else when planning; otherwise only to oneself. */
async function checkResponsible(s: Scope, id: string | null) {
  if (!id) {
    if (!s.manage) throw new AccessError("FORBIDDEN");
    return null;
  }
  if (!(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  if (!s.manage && !s.own.has(id)) throw new AccessError("FORBIDDEN");
  return id;
}
const insert = (s: Scope, kind: string, title: string, detail: string, due: string | null, responsible: string | null, l: Record<string, string | null>, origin: "manual" | "template") =>
  s.c.query(
    `INSERT INTO funding_task(organization_id,kind,title,detail,due_on,responsible_id,event_id,match_id,trip_id,obligation_id,chair_id,origin,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [s.org, kind, title, detail, due, responsible, l.eventId, l.matchId, l.tripId, l.obligationId, l.chairId, origin, s.userId],
  );

export async function tasksExecute(db: Pool, p: Principal, command: TaskCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "create") {
        await checkLinks(s, command);
        const responsible = await checkResponsible(s, command.responsibleId);
        const id = (await insert(s, command.kind, command.title, command.detail, command.dueOn, responsible, command, "manual")).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "task.created", id, { kind: command.kind });
        return { ok: true as const, ids: [id] };
      }
      if (command.action === "fromTemplate") {
        await checkLinks(s, command);
        const responsible = await checkResponsible(s, command.responsibleId);
        const t = (await s.c.query("SELECT kind,name,items FROM task_template WHERE id=$1 AND organization_id=$2", [command.templateId, s.org])).rows[0] as
          | { kind: string; name: string; items: TemplateItem[] }
          | undefined;
        if (!t) throw new AccessError("NOT_FOUND", 404);
        const ids: string[] = [];
        for (const i of t.items) ids.push((await insert(s, t.kind, i.title, i.detail ?? "", dueBefore(command.date, i.daysBefore), responsible, command, "template")).rows[0].id);
        await audit(s.c, s.org, s.userId, "task.template.applied", command.templateId, { count: ids.length });
        return { ok: true as const, ids };
      }
      if (command.action === "done" || command.action === "delete") {
        const t = (await s.c.query("SELECT id,kind,responsible_id FROM funding_task WHERE id=$1 AND organization_id=$2 FOR UPDATE", [command.id, s.org])).rows[0] as
          | { id: string; kind: TaskKind; responsible_id: string | null }
          | undefined;
        if (!t || !visible(s, t)) throw new AccessError("NOT_FOUND", 404);
        const money = t.kind === "sponsor" || t.kind === "grant";
        const mine = !!t.responsible_id && s.own.has(t.responsible_id);
        if (command.action === "done") {
          if (!mine && !(money ? s.moneyManage : s.manage)) throw new AccessError("FORBIDDEN");
          await s.c.query("UPDATE funding_task SET status=$3,done_on=CASE WHEN $3='done' THEN CURRENT_DATE ELSE NULL END,updated_at=now() WHERE id=$1 AND organization_id=$2", [
            t.id,
            s.org,
            command.done ? "done" : "todo",
          ]);
          await audit(s.c, s.org, s.userId, command.done ? "task.done" : "task.reopened", t.id);
          return { ok: true as const };
        }
        // A sponsor's or a grant's task is removed from its file.
        if (money || !s.manage) throw new AccessError("FORBIDDEN");
        await s.c.query("DELETE FROM funding_task_proof WHERE task_id=$1 AND organization_id=$2", [t.id, s.org]);
        await s.c.query("DELETE FROM funding_task WHERE id=$1 AND organization_id=$2", [t.id, s.org]);
        await audit(s.c, s.org, s.userId, "task.deleted", t.id);
        return { ok: true as const };
      }
      if (!s.manage) throw new AccessError("FORBIDDEN");
      if (command.action === "saveTemplate") {
        const id = command.id
          ? ((
              await s.c.query("UPDATE task_template SET kind=$3,name=$4,items=$5,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [
                command.id,
                s.org,
                command.kind,
                command.name,
                JSON.stringify(command.items),
              ])
            ).rows[0]?.id as string | undefined)
          : ((
              await s.c.query("INSERT INTO task_template(organization_id,kind,name,items,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [
                s.org,
                command.kind,
                command.name,
                JSON.stringify(command.items),
                s.userId,
              ])
            ).rows[0].id as string);
        if (!id) throw new AccessError("NOT_FOUND", 404);
        await audit(s.c, s.org, s.userId, "task.template.saved", id);
        return { ok: true as const, id };
      }
      if (!(await s.c.query("DELETE FROM task_template WHERE id=$1 AND organization_id=$2", [command.id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      await audit(s.c, s.org, s.userId, "task.template.deleted", command.id);
      return { ok: true as const };
    },
    expected,
  );
}
