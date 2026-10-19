import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import {
  canRead,
  audience,
  ownProfiles,
  type Actor,
  type Event,
} from "../calendar/access";
import { manages, mayRespond } from "./access";
import { publish } from "../notifications/queue";
import type { Command } from "./schema";
export { commandSchema } from "./schema";
type Register = {
  id: string;
  event_id: string;
  organization_id: string;
  deadline: Date;
  minimum: number;
  closed_at: Date | null;
  version: number;
};
type Invitation = {
  id: string;
  profile_id: string;
  register_id: string;
  withdrawn_at: Date | null;
  response: string;
  comment: string;
  actual: string;
  version: number;
  full_name: string;
  canRespond: boolean;
};
type History = {
  id: string;
  invitation_id: string | null;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  reason: string;
  created_at: Date;
  actor: string;
};
type EventView = {
  id: string;
  title: string;
  kind: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  team_id: string | null;
  team_name: string | null;
  season_id: string | null;
  manage: boolean;
  register: Register | null;
  invitations: Invitation[];
  candidates: { id: string; full_name: string; user_id: string | null }[];
  history: History[];
};
type Scope = { c: PoolClient; p: Principal; a: Actor };
async function scope<T>(
  db: Pool,
  p: Principal,
  fn: (s: Scope) => Promise<T>,
  org?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const first = await active(c, p);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      first.organization_id,
    ]);
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const a = await active(c, p),
      u = await account(c, p);
    if (
      a.organization_id !== first.organization_id ||
      (org && org !== a.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    const result = await fn({
      c,
      p,
      a: { ...a, twoFactorEnabled: !!u.twoFactorEnabled },
    });
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function event(s: Scope, id: string) {
  const e = (
    await s.c.query(
      "SELECT e.*,t.name AS team_name,t.season_id FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id WHERE e.id=$1 AND e.organization_id=$2",
      [id, s.a.organization_id],
    )
  ).rows[0];
  if (!e) throw new AccessError("NOT_FOUND", 404);
  return e as Event & { team_name: string | null; season_id: string | null };
}
async function manager(s: Scope, e: Event) {
  if (!(await manages(s.c, s.a, e))) throw new AccessError("FORBIDDEN");
}
function version(expected: number, actual: number) {
  if (expected !== actual) throw new AccessError("STALE_VERSION", 409);
}
function scheduled(e: Event) {
  if (e.status !== "scheduled") throw new AccessError("EVENT_CANCELLED", 409);
}
async function history(
  s: Scope,
  r: string,
  i: string | null,
  action: string,
  before: unknown,
  after: unknown,
  reason = "",
) {
  await s.c.query(
    "INSERT INTO attendance_history(register_id,invitation_id,actor_id,action,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      r,
      i,
      s.p.userId,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
    ],
  );
  await audit(
    s.c,
    s.a.organization_id,
    s.p.userId,
    "attendance." + action,
    i ?? r,
  );
}
async function register(s: Scope, id: string) {
  const r = (
    await s.c.query(
      "SELECT * FROM attendance_register WHERE id=$1 AND organization_id=$2",
      [id, s.a.organization_id],
    )
  ).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
}
// One current mandate must authorize each notification; rights are never merged.
async function notify(
  s: Scope,
  e: Event,
  ids: string[],
  staffOnly = false,
  unansweredOnly = false,
) {
  const users = (
    await s.c.query(
      "SELECT DISTINCT u.id,u.name,u.email,COALESCE(p.locale,'fr') AS locale FROM \"user\" u JOIN role_assignment r ON r.user_id=u.id JOIN organization_membership m ON m.user_id=u.id AND m.organization_id=r.organization_id LEFT JOIN person p ON p.user_id=u.id WHERE r.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())",
      [s.a.organization_id],
    )
  ).rows;
  const invitations = (
    await s.c.query(
      "SELECT * FROM attendance_invitation WHERE id=ANY($1::uuid[]) AND withdrawn_at IS NULL AND (NOT $2 OR response='none')",
      [ids, unansweredOnly],
    )
  ).rows;
  const batch = randomUUID();
  for (const u of users) {
    const actors = (
      await s.c.query(
        'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())',
        [s.a.organization_id, u.id],
      )
    ).rows as Actor[];
    let target: string | undefined;
    for (const a of actors) {
      for (const i of invitations) {
        if (
          staffOnly
            ? await manages(s.c, a, e)
            : (await canRead(s.c, a, e)) &&
              (await mayRespond(s.c, a, i.profile_id))
        ) {
          target = i.id;
          break;
        }
      }
      if (target) break;
    }
    if (!target) continue;
    await publish(s.c, {
      organizationId: s.a.organization_id,
      userId: u.id,
      email: u.email,
      kind: "attendance_update",
      category: "sport",
      eventKey: "attendance:" + batch,
      resourceType: "attendance",
      resourceId: target,
      locale: u.locale,
      variables: {
        name: u.name,
        organization: "Powerchair Football Manager",
        url: process.env.BETTER_AUTH_URL + "/" + u.locale + "/attendance",
      },
    });
  }
}
export async function attendanceExecute(
  db: Pool,
  p: Principal,
  cmd: Command,
  org: string,
) {
  return scope(
    db,
    p,
    async (s) => {
      if (cmd.action === "invite") {
        const e = await event(s, cmd.eventId);
        await manager(s, e);
        scheduled(e);
        if (e.starts_at <= new Date())
          throw new AccessError("EVENT_STARTED", 409);
        const deadline = new Date(cmd.deadline);
        if (deadline <= new Date() || deadline > e.starts_at)
          throw new AccessError("INVALID_DEADLINE", 409);
        if (cmd.minimum > cmd.profiles.length)
          throw new AccessError("INVALID_THRESHOLD", 409);
        const allowed = new Set((await audience(s.c, e)).map((p) => p.id));
        if (cmd.profiles.some((p) => !allowed.has(p)))
          throw new AccessError("INVALID_PARTICIPANT", 409);
        let r = (
          await s.c.query(
            "SELECT * FROM attendance_register WHERE event_id=$1",
            [e.id],
          )
        ).rows[0];
        const previous = r
          ? (
              await s.c.query(
                "SELECT profile_id,response,withdrawn_at FROM attendance_invitation WHERE register_id=$1",
                [r.id],
              )
            ).rows
          : [];
        if (r) {
          if (cmd.expectedVersion === null)
            throw new AccessError("STALE_VERSION", 409);
          version(cmd.expectedVersion, r.version);
          if (r.closed_at) throw new AccessError("REGISTER_CLOSED", 409);
          await s.c.query(
            "UPDATE attendance_register SET deadline=$2,minimum=$3,version=version+1,reminder_sent_at=NULL,alert_sent_at=NULL WHERE id=$1",
            [r.id, deadline, cmd.minimum],
          );
        } else {
          if (cmd.expectedVersion !== null)
            throw new AccessError("STALE_VERSION", 409);
          r = (
            await s.c.query(
              "INSERT INTO attendance_register(organization_id,event_id,deadline,minimum) VALUES($1,$2,$3,$4) RETURNING *",
              [org, e.id, deadline, cmd.minimum],
            )
          ).rows[0];
        }
        await s.c.query(
          "UPDATE attendance_invitation SET withdrawn_at=now(),version=version+1 WHERE register_id=$1 AND withdrawn_at IS NULL AND NOT(profile_id=ANY($2::uuid[]))",
          [r.id, cmd.profiles],
        );
        for (const id of cmd.profiles)
          await s.c.query(
            "INSERT INTO attendance_invitation(organization_id,register_id,profile_id) VALUES($1,$2,$3) ON CONFLICT(register_id,profile_id) DO UPDATE SET withdrawn_at=NULL,version=attendance_invitation.version+1,response='none',comment='',responded_at=NULL,responded_by=NULL WHERE attendance_invitation.withdrawn_at IS NOT NULL",
            [org, r.id, id],
          );
        const ids = (
          await s.c.query(
            "SELECT id FROM attendance_invitation WHERE register_id=$1 AND withdrawn_at IS NULL",
            [r.id],
          )
        ).rows.map((i) => i.id);
        await history(
          s,
          r.id,
          null,
          "invite",
          { invitations: previous },
          {
            profiles: cmd.profiles,
            deadline: cmd.deadline,
            minimum: cmd.minimum,
          },
        );
        await notify(s, e, ids);
        return { id: r.id };
      }
      if (cmd.action === "respond" || cmd.action === "mark") {
        const i = (
          await s.c.query(
            "SELECT * FROM attendance_invitation WHERE id=$1 AND organization_id=$2",
            [cmd.id, org],
          )
        ).rows[0];
        if (!i) throw new AccessError("NOT_FOUND", 404);
        const r = await register(s, i.register_id),
          e = await event(s, r.event_id);
        scheduled(e);
        if (i.withdrawn_at) throw new AccessError("INVITATION_WITHDRAWN", 409);
        version(cmd.expectedVersion, i.version);
        if (cmd.action === "respond") {
          if (
            !(await canRead(s.c, s.a, e)) ||
            !(await mayRespond(s.c, s.a, i.profile_id, true))
          )
            throw new AccessError("FORBIDDEN");
          if (
            r.closed_at ||
            r.deadline <= new Date() ||
            e.starts_at <= new Date()
          )
            throw new AccessError("RESPONSE_CLOSED", 409);
          await s.c.query(
            "UPDATE attendance_invitation SET response=$2,comment=$3,responded_at=now(),responded_by=$4,version=version+1 WHERE id=$1",
            [i.id, cmd.response, cmd.comment, p.userId],
          );
          await history(
            s,
            r.id,
            i.id,
            "respond",
            { response: i.response, comment: i.comment },
            { response: cmd.response, comment: cmd.comment },
          );
        } else {
          await manager(s, e);
          if (e.starts_at > new Date())
            throw new AccessError("EVENT_NOT_STARTED", 409);
          if (r.closed_at && (!cmd.reason || cmd.actual === "unchecked"))
            throw new AccessError("CORRECTION_REASON", 409);
          await s.c.query(
            "UPDATE attendance_invitation SET actual=$2,marked_at=now(),marked_by=$3,version=version+1 WHERE id=$1",
            [i.id, cmd.actual, p.userId],
          );
          await history(
            s,
            r.id,
            i.id,
            "mark",
            { actual: i.actual },
            { actual: cmd.actual },
            cmd.reason,
          );
        }
        return { id: i.id };
      }
      const r = await register(s, cmd.id),
        e = await event(s, r.event_id);
      await manager(s, e);
      scheduled(e);
      version(cmd.expectedVersion, r.version);
      if (r.closed_at) throw new AccessError("REGISTER_CLOSED", 409);
      if (cmd.action === "close") {
        if (e.starts_at > new Date())
          throw new AccessError("EVENT_NOT_STARTED", 409);
        if (
          (
            await s.c.query(
              "SELECT 1 FROM attendance_invitation WHERE register_id=$1 AND withdrawn_at IS NULL AND actual='unchecked' LIMIT 1",
              [r.id],
            )
          ).rowCount
        )
          throw new AccessError("INCOMPLETE_REGISTER", 409);
        await s.c.query(
          "UPDATE attendance_register SET closed_at=now(),closed_by=$2,version=version+1 WHERE id=$1",
          [r.id, p.userId],
        );
        await history(s, r.id, null, "close", null, { closed: true });
      } else {
        if (r.deadline <= new Date() || e.starts_at <= new Date())
          throw new AccessError("RESPONSE_CLOSED", 409);
        if (
          r.reminder_sent_at &&
          Date.now() - new Date(r.reminder_sent_at).getTime() < 3600000
        )
          throw new AccessError("REMINDER_RECENT", 409);
        const ids = (
          await s.c.query(
            "SELECT id FROM attendance_invitation WHERE register_id=$1 AND withdrawn_at IS NULL AND response='none'",
            [r.id],
          )
        ).rows.map((i) => i.id);
        await notify(s, e, ids, false, true);
        await s.c.query(
          "UPDATE attendance_register SET reminder_sent_at=now(),version=version+1 WHERE id=$1",
          [r.id],
        );
        await history(s, r.id, null, "remind", null, { count: ids.length });
      }
      return { id: r.id };
    },
    org,
  );
}
export async function attendanceView(
  db: Pool,
  p: Principal,
  from: string,
  to: string,
  team = "",
) {
  return scope(db, p, async (s) => {
    const all = (
      await s.c.query(
        "SELECT e.*,t.name AS team_name,t.season_id FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id WHERE e.organization_id=$1 AND e.starts_at>=$2::date AND e.starts_at<($3::date+1) AND ($4='' OR e.team_id::text=$4) ORDER BY e.starts_at,e.id LIMIT 500",
        [s.a.organization_id, from, to, team],
      )
    ).rows as (Event & { team_name: string; season_id: string })[];
    const events: EventView[] = [];
    for (const e of all) {
      const manage = await manages(s.c, s.a, e);
      if (!manage && !(await canRead(s.c, s.a, e))) continue;
      const r: Register | null =
        (
          await s.c.query(
            "SELECT * FROM attendance_register WHERE event_id=$1",
            [e.id],
          )
        ).rows[0] ?? null;
      const invitations: Invitation[] = [];
      if (r) {
        for (const i of (
          await s.c.query(
            "SELECT i.*,p.full_name FROM attendance_invitation i JOIN club_person p ON p.id=i.profile_id WHERE i.register_id=$1 ORDER BY p.full_name",
            [r.id],
          )
        ).rows) {
          if (
            !manage &&
            (i.withdrawn_at || !(await mayRespond(s.c, s.a, i.profile_id)))
          )
            continue;
          invitations.push({
            ...i,
            canRespond:
              !i.withdrawn_at &&
              (await mayRespond(s.c, s.a, i.profile_id, true)),
          });
        }
      }
      if (!manage && !invitations.length) continue;
      const candidates = manage ? await audience(s.c, e) : [];
      const own = manage ? null : await ownProfiles(s.c, s.a);
      const h = r
        ? (
            await s.c.query(
              'SELECT h.id,h.invitation_id,h.action,h.before_data,h.after_data,h.reason,h.created_at,u.name AS actor FROM attendance_history h JOIN "user" u ON u.id=h.actor_id WHERE h.register_id=$1 ORDER BY h.created_at DESC,h.id LIMIT 100',
              [r.id],
            )
          ).rows
        : [];
      events.push({
        id: e.id,
        title: e.title,
        kind: e.kind,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        status: e.status,
        team_id: e.team_id,
        team_name: e.team_name,
        season_id: e.season_id,
        manage,
        register: r,
        invitations,
        candidates,
        history: manage
          ? h
          : h.filter((h) =>
              invitations.some(
                (i) => i.id === h.invitation_id && own?.has(i.profile_id),
              ),
            ),
      });
    }
    // Statistics use the requested period; only closed, non-cancelled, active invitations count as observed sessions.
    const stats = new Map<
      string,
      {
        profileId: string;
        name: string;
        seasonId: string | null;
        teamId: string | null;
        team: string;
        kind: string;
        invited: number;
        answered: number;
        closed: number;
        attended: number;
        absent: number;
      }
    >();
    for (const e of events)
      for (const i of e.invitations) {
        if (i.withdrawn_at || e.status === "cancelled") continue;
        const key = [i.profile_id, e.season_id, e.team_id, e.kind].join(":");
        const v = stats.get(key) ?? {
          profileId: i.profile_id,
          name: i.full_name,
          seasonId: e.season_id,
          teamId: e.team_id,
          team: e.team_name ?? "",
          kind: e.kind,
          invited: 0,
          answered: 0,
          closed: 0,
          attended: 0,
          absent: 0,
        };
        v.invited++;
        if (i.response !== "none") v.answered++;
        if (e.register?.closed_at) {
          v.closed++;
          if (["present", "late", "early"].includes(i.actual)) v.attended++;
          else if (i.actual === "absent") v.absent++;
        }
        stats.set(key, v);
      }
    const teams = (
      await s.c.query(
        "SELECT id,name FROM team WHERE organization_id=$1 ORDER BY name",
        [s.a.organization_id],
      )
    ).rows;
    const seasons = (
      await s.c.query(
        "SELECT id,name,starts_on::text,ends_on::text FROM season WHERE organization_id=$1 ORDER BY starts_on DESC",
        [s.a.organization_id],
      )
    ).rows;
    const teamStats = new Map<
      string,
      {
        team: string;
        seasonId: string | null;
        kind: string;
        invited: number;
        answered: number;
        closed: number;
        attended: number;
      }
    >();
    for (const v of stats.values()) {
      const key = [v.teamId, v.seasonId, v.kind].join(":");
      const total = teamStats.get(key) ?? {
        team: v.team,
        seasonId: v.seasonId,
        kind: v.kind,
        invited: 0,
        answered: 0,
        closed: 0,
        attended: 0,
      };
      for (const k of ["invited", "answered", "closed", "attended"] as const)
        total[k] += v[k];
      teamStats.set(key, total);
    }
    return {
      context: { organization_id: s.a.organization_id, role: s.a.role },
      events,
      limited: all.length === 500,
      teams,
      seasons,
      stats: [...stats.values()],
      teamStats: [...teamStats.values()],
    };
  });
}
// Bounded automatic reminders and low-attendance alerts. Same organization lock as all mutations.
export async function attendanceTick(db: Pool) {
  const candidates = (
    await db.query(
      "SELECT r.id,r.organization_id FROM attendance_register r JOIN calendar_event e ON e.id=r.event_id WHERE r.closed_at IS NULL AND e.status='scheduled' AND e.ends_at>now() AND ((r.reminder_sent_at IS NULL AND r.deadline>now() AND r.deadline<=now()+interval '24 hours') OR (r.alert_sent_at IS NULL AND r.minimum>0 AND LEAST(r.deadline,e.starts_at)<=now())) ORDER BY r.deadline LIMIT 100",
    )
  ).rows;
  let changed = 0;
  for (const item of candidates) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
        item.organization_id,
      ]);
      const r = (
        await c.query("SELECT * FROM attendance_register WHERE id=$1", [
          item.id,
        ])
      ).rows[0];
      const e = (
        await c.query("SELECT * FROM calendar_event WHERE id=$1", [r.event_id])
      ).rows[0] as Event;
      if (r.closed_at || e.status !== "scheduled" || e.ends_at <= new Date()) {
        await c.query("COMMIT");
        continue;
      }
      const actor = (
        await c.query(
          'SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) ORDER BY r.id',
          [item.organization_id],
        )
      ).rows as Actor[];
      let a: Actor | undefined;
      for (const v of actor)
        if (await manages(c, v, e)) {
          a = v;
          break;
        }
      if (!a) {
        await c.query("COMMIT");
        continue;
      }
      const s: Scope = { c, a, p: { userId: a.user_id, sessionId: "" } },
        ids = (
          await c.query(
            "SELECT id,response FROM attendance_invitation WHERE register_id=$1 AND withdrawn_at IS NULL",
            [r.id],
          )
        ).rows;
      if (
        e.starts_at > new Date() &&
        !r.reminder_sent_at &&
        r.deadline > new Date() &&
        r.deadline <= new Date(Date.now() + 86400000)
      ) {
        await notify(
          s,
          e,
          ids.map((i) => i.id),
          false,
          true,
        );
        await c.query(
          "UPDATE attendance_register SET reminder_sent_at=now(),version=version+1 WHERE id=$1",
          [r.id],
        );
        await history(s, r.id, null, "automatic_reminder", null, {
          count: ids.filter((i) => i.response === "none").length,
        });
        changed++;
      }
      if (
        !r.alert_sent_at &&
        r.minimum > 0 &&
        (r.deadline <= new Date() || e.starts_at <= new Date())
      ) {
        const confirmed = ids.filter((i) => i.response === "present").length;
        if (confirmed < r.minimum)
          await notify(
            s,
            e,
            ids.map((i) => i.id),
            true,
          );
        await c.query(
          "UPDATE attendance_register SET alert_sent_at=now(),version=version+1 WHERE id=$1",
          [r.id],
        );
        await history(s, r.id, null, "threshold_check", null, {
          confirmed,
          minimum: r.minimum,
          alerted: confirmed < r.minimum,
        });
        changed++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return changed;
}
