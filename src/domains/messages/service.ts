import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { offerUndo } from "../undo/service";
import { isAdmin, permissions } from "../access/policy";
import { ageOn } from "../people/schema";
import { brusselsToday } from "../people/service";

/**
 * Internal messages. Direct conversations between members, plus one thread
 * per team ("team": coaches, adult players, parents of the young players) and
 * one per team for parents ("parents": coaches and parents).
 *
 * Protection of minors: a minor is never alone with an adult in a private
 * conversation (their representatives join it, or it is refused), minors are
 * not members of the team threads (their parents are), and any message can be
 * reported to the club's moderators, who can hide it or lock a thread.
 */
export const reportReasons = [
  "inappropriate",
  "harassment",
  "personal_data",
  "spam",
  "other",
] as const;
export const messageCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    requestId: z.uuid(),
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(5000),
    recipients: z.array(z.string().min(1).max(120)).min(1).max(50),
  }),
  z.object({
    action: z.literal("reply"),
    requestId: z.uuid(),
    threadId: z.uuid(),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    action: z.literal("openTeam"),
    teamId: z.uuid(),
    kind: z.enum(["team", "parents"]),
  }),
  z.object({
    action: z.literal("report"),
    messageId: z.uuid(),
    reason: z.enum(reportReasons),
    comment: z.string().trim().max(1000),
  }),
  z.object({
    action: z.literal("moderate"),
    messageId: z.uuid(),
    outcome: z.enum(["hidden", "kept"]),
  }),
  z.object({
    action: z.literal("lock"),
    threadId: z.uuid(),
    locked: z.boolean(),
  }),
]);
type Active = Awaited<ReturnType<typeof active>>;
type Ctx = { c: PoolClient; a: Active; userId: string; moderator: boolean };
async function scope<T>(
  db: Pool,
  p: Principal,
  org: string | undefined,
  fn: (x: Ctx) => Promise<T>,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const first = await active(c, p);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      first.organization_id,
    ]);
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const a = await active(c, p);
    const user = await account(c, p);
    if (
      a.organization_id !== first.organization_id ||
      (org && org !== a.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    const moderator =
      mfaSatisfied(!!user.twoFactorEnabled) &&
      (isAdmin(a.role) || permissions(a.role, a.grants).includes("members.read"));
    const result = await fn({ c, a, userId: p.userId, moderator });
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}
async function recipients(c: PoolClient, a: Active) {
  const staff =
    permissions(a.role, a.grants).includes("members.read") ||
    a.role === "coach";
  return (
    await c.query(
      `SELECT DISTINCT u.id,u.name FROM "user" u JOIN organization_membership m ON m.user_id=u.id JOIN role_assignment r ON r.user_id=u.id AND r.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.active AND u.active AND u.id<>$2 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND ($3 OR r.role IN ('club_president','federation_president','coach')) ORDER BY u.name,u.id`,
      [a.organization_id, a.user_id, staff],
    )
  ).rows as { id: string; name: string }[];
}
/** A member is a minor when one of their active profiles in the club is under 18. */
async function minor(c: PoolClient, org: string, userId: string) {
  const today = brusselsToday();
  return (
    await c.query(
      "SELECT c.birth_date::text AS birth_date FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.organization_id=$1 AND p.user_id=$2 AND c.status='active' AND c.birth_date IS NOT NULL",
      [org, userId],
    )
  ).rows.some((r) => ageOn(r.birth_date, today) < 18);
}
/** Representatives of a member who can take part (active account and membership). */
async function representatives(c: PoolClient, org: string, userId: string) {
  return (
    await c.query(
      `SELECT DISTINCT gu.id FROM club_person s JOIN person sp ON sp.id=s.person_id
         JOIN guardian_relationship g ON g.subject_profile_id=s.id AND g.organization_id=s.organization_id
         JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person gpp ON gpp.id=gp.person_id
         JOIN "user" gu ON gu.id=gpp.user_id JOIN organization_membership m ON m.user_id=gu.id AND m.organization_id=s.organization_id
        WHERE s.organization_id=$1 AND sp.user_id=$2 AND s.status='active' AND gp.status='active' AND gu.active AND m.active
          AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND gu.id<>$2`,
      [org, userId],
    )
  ).rows.map((r) => r.id as string);
}
/** Which team threads a member can read: by coaching, playing (adults) or representing. */
async function teamKinds(c: PoolClient, x: Ctx, teamId: string) {
  const kinds = new Set<"team" | "parents">();
  if (x.moderator) return new Set(["team", "parents"] as const);
  const org = x.a.organization_id,
    user = x.userId;
  const coach =
    (x.a.role === "coach" && x.a.team_id === teamId) ||
    !!(
      await c.query(
        `SELECT 1 FROM team_membership m JOIN club_person c ON c.id=m.profile_id JOIN person p ON p.id=c.person_id
          WHERE m.team_id=$1 AND m.organization_id=$2 AND p.user_id=$3 AND c.status='active' AND m.role IN ('coach','assistant')
            AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)`,
        [teamId, org, user],
      )
    ).rowCount;
  if (coach) return new Set(["team", "parents"] as const);
  const today = brusselsToday();
  const playing = (
    await c.query(
      `SELECT c.birth_date::text AS birth_date FROM team_membership m JOIN club_person c ON c.id=m.profile_id JOIN person p ON p.id=c.person_id
        WHERE m.team_id=$1 AND m.organization_id=$2 AND p.user_id=$3 AND c.status='active' AND m.role IN ('player','volunteer')
          AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)`,
      [teamId, org, user],
    )
  ).rows;
  if (playing.some((r) => !r.birth_date || ageOn(r.birth_date, today) >= 18))
    kinds.add("team");
  const representing = (
    await c.query(
      `SELECT 1 FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person p ON p.id=gp.person_id
         JOIN club_person s ON s.id=g.subject_profile_id JOIN team_membership m ON m.profile_id=s.id
        WHERE g.organization_id=$1 AND p.user_id=$2 AND m.team_id=$3 AND gp.status='active' AND s.status='active'
          AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)
          AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)`,
      [org, user, teamId],
    )
  ).rowCount;
  if (representing) {
    kinds.add("team");
    kinds.add("parents");
  }
  return kinds;
}
async function coachOf(c: PoolClient, x: Ctx, teamId: string) {
  if (x.moderator) return true;
  if (x.a.role === "coach" && x.a.team_id === teamId) return true;
  return !!(
    await c.query(
      `SELECT 1 FROM team_membership m JOIN club_person c ON c.id=m.profile_id JOIN person p ON p.id=c.person_id
        WHERE m.team_id=$1 AND m.organization_id=$2 AND p.user_id=$3 AND c.status='active' AND m.role IN ('coach','assistant')
          AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)`,
      [teamId, x.a.organization_id, x.userId],
    )
  ).rowCount;
}
type Thread = {
  id: string;
  subject: string;
  kind: "direct" | "team" | "parents";
  team_id: string | null;
  team_name: string | null;
  locked_at: string | null;
  updated_at: string | null;
};
async function readable(c: PoolClient, x: Ctx) {
  const all = (
    await c.query(
      `SELECT t.id,t.subject,t.kind,t.team_id,tm.name AS team_name,t.locked_at,
              (SELECT max(created_at) FROM internal_message WHERE thread_id=t.id) AS updated_at,
              EXISTS(SELECT 1 FROM message_participant p WHERE p.thread_id=t.id AND p.user_id=$2) AS participant
         FROM message_thread t LEFT JOIN team tm ON tm.id=t.team_id
        WHERE t.organization_id=$1 ORDER BY updated_at DESC NULLS LAST,t.id`,
      [x.a.organization_id, x.userId],
    )
  ).rows as (Thread & { participant: boolean })[];
  const out: Thread[] = [];
  const cache = new Map<string, Set<string>>();
  for (const t of all) {
    if (t.kind === "direct") {
      if (t.participant) out.push(t);
      continue;
    }
    if (!cache.has(t.team_id!))
      cache.set(t.team_id!, await teamKinds(c, x, t.team_id!));
    if (cache.get(t.team_id!)!.has(t.kind)) out.push(t);
  }
  return out.map((t) => ({
    id: t.id,
    subject: t.subject,
    kind: t.kind,
    team_id: t.team_id,
    team_name: t.team_name,
    locked_at: t.locked_at,
    updated_at: t.updated_at,
  }));
}
async function threadFor(c: PoolClient, x: Ctx, id: string) {
  const t = (await readable(c, x)).find((v) => v.id === id);
  if (!t) throw new AccessError("NOT_FOUND", 404);
  return t;
}

export async function messagesView(db: Pool, p: Principal, threadId?: string) {
  return scope(db, p, undefined, async (x) => {
    const { c, a } = x;
    const threads = await readable(c, x);
    const current = threadId ? threads.find((t) => t.id === threadId) : undefined;
    if (threadId && !current) throw new AccessError("NOT_FOUND", 404);
    // Teams whose threads this member can open (coaches, moderators).
    const teams = (
      await c.query(
        "SELECT t.id,t.name FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived ORDER BY s.starts_on DESC,t.name",
        [a.organization_id],
      )
    ).rows as { id: string; name: string }[];
    const teamOptions = [];
    for (const t of teams)
      if (await coachOf(c, x, t.id))
        teamOptions.push({
          ...t,
          open: threads
            .filter((v) => v.team_id === t.id)
            .map((v) => v.kind),
        });
    return {
      organizationId: a.organization_id,
      userId: x.userId,
      moderator: x.moderator,
      recipients: await recipients(c, a),
      threads,
      teamOptions,
      thread: current ?? null,
      messages: current
        ? (
            await c.query(
              `SELECT i.id,i.body,i.created_at,i.sender_id,u.name AS sender,i.hidden_at,
                      EXISTS(SELECT 1 FROM message_report r WHERE r.message_id=i.id AND r.reporter_id=$2) AS reported
                 FROM internal_message i JOIN "user" u ON u.id=i.sender_id WHERE i.thread_id=$1 ORDER BY i.created_at,i.id`,
              [current.id, x.userId],
            )
          ).rows.map((m) => ({
            id: m.id as string,
            // A hidden message stays readable by moderators only.
            body: m.hidden_at && !x.moderator ? "" : (m.body as string),
            hidden: !!m.hidden_at,
            created_at: m.created_at as string,
            sender: m.sender as string,
            mine: m.sender_id === x.userId,
            reported: m.reported as boolean,
          }))
        : [],
      participants: current
        ? (
            await c.query(
              'SELECT u.name,p.reason FROM message_participant p JOIN "user" u ON u.id=p.user_id WHERE p.thread_id=$1 ORDER BY u.name',
              [current.id],
            )
          ).rows as { name: string; reason: "member" | "guardian" }[]
        : [],
      reports: x.moderator
        ? (
            await c.query(
              `SELECT r.id,r.message_id,r.reason,r.comment,r.created_at,i.body,su.name AS sender,ru.name AS reporter,t.id AS thread_id,t.subject,t.kind,tm.name AS team_name
                 FROM message_report r JOIN internal_message i ON i.id=r.message_id JOIN message_thread t ON t.id=i.thread_id
                 LEFT JOIN team tm ON tm.id=t.team_id JOIN "user" su ON su.id=i.sender_id JOIN "user" ru ON ru.id=r.reporter_id
                WHERE r.organization_id=$1 AND r.resolved_at IS NULL ORDER BY r.created_at`,
              [a.organization_id],
            )
          ).rows
        : [],
    };
  });
}

export async function messagesExecute(
  db: Pool,
  p: Principal,
  cmd: z.infer<typeof messageCommand>,
  org: string,
) {
  return scope(db, p, org, async (x) => {
    const { c, a } = x;
    if (cmd.action === "openTeam") {
      if (!(await coachOf(c, x, cmd.teamId))) throw new AccessError("FORBIDDEN");
      const team = (
        await c.query(
          "SELECT t.name FROM team t JOIN season s ON s.id=t.season_id WHERE t.id=$1 AND t.organization_id=$2 AND NOT t.archived AND NOT s.archived",
          [cmd.teamId, org],
        )
      ).rows[0];
      if (!team) throw new AccessError("NOT_FOUND", 404);
      const existing = (
        await c.query(
          "SELECT id FROM message_thread WHERE team_id=$1 AND kind=$2",
          [cmd.teamId, cmd.kind],
        )
      ).rows[0];
      if (existing) return { id: existing.id as string };
      const id = (
        await c.query(
          "INSERT INTO message_thread(organization_id,subject,kind,team_id,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [org, String(team.name).slice(0, 160), cmd.kind, cmd.teamId, x.userId],
        )
      ).rows[0].id as string;
      await audit(c, org, x.userId, "messages.thread." + cmd.kind, id);
      return { id };
    }
    if (cmd.action === "report") {
      const m = (
        await c.query(
          "SELECT id,thread_id,sender_id FROM internal_message WHERE id=$1 AND organization_id=$2",
          [cmd.messageId, org],
        )
      ).rows[0];
      if (!m) throw new AccessError("NOT_FOUND", 404);
      await threadFor(c, x, m.thread_id);
      if (m.sender_id === x.userId) throw new AccessError("INVALID_INPUT", 400);
      await c.query(
        "INSERT INTO message_report(organization_id,message_id,reporter_id,reason,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(message_id,reporter_id) DO NOTHING",
        [org, m.id, x.userId, cmd.reason, cmd.comment],
      );
      await audit(c, org, x.userId, "messages.reported", m.id);
      return { id: m.thread_id as string };
    }
    if (cmd.action === "moderate" || cmd.action === "lock") {
      if (!x.moderator) throw new AccessError("FORBIDDEN");
      if (cmd.action === "lock") {
        const r = await c.query(
          "UPDATE message_thread SET locked_at=CASE WHEN $3 THEN now() ELSE NULL END,locked_by=CASE WHEN $3 THEN $4 ELSE NULL END WHERE id=$1 AND organization_id=$2 RETURNING id",
          [cmd.threadId, org, cmd.locked, x.userId],
        );
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(c, org, x.userId, cmd.locked ? "messages.locked" : "messages.unlocked", cmd.threadId);
        return { id: cmd.threadId };
      }
      const m = (
        await c.query(
          "SELECT id,thread_id FROM internal_message WHERE id=$1 AND organization_id=$2",
          [cmd.messageId, org],
        )
      ).rows[0];
      if (!m) throw new AccessError("NOT_FOUND", 404);
      const was = (await c.query("SELECT hidden_at,hidden_by FROM internal_message WHERE id=$1 FOR UPDATE", [m.id])).rows[0];
      await c.query(
        "UPDATE internal_message SET hidden_at=CASE WHEN $2='hidden' THEN COALESCE(hidden_at,now()) ELSE NULL END,hidden_by=CASE WHEN $2='hidden' THEN $3 ELSE NULL END WHERE id=$1",
        [m.id, cmd.outcome, x.userId],
      );
      const reports = (
        await c.query(
          "UPDATE message_report SET resolved_at=now(),resolved_by=$2,outcome=$3 WHERE message_id=$1 AND resolved_at IS NULL RETURNING id",
          [m.id, x.userId, cmd.outcome],
        )
      ).rows.map((r) => r.id as string);
      await audit(c, org, x.userId, "messages.moderated." + cmd.outcome, m.id);
      // Wave 15, C10: hiding a message can be undone for two minutes.
      const undo =
        cmd.outcome === "hidden" && !was.hidden_at
          ? await offerUndo(c, org, x.userId, "messageHide", m.id, { hidden_at: null, hidden_by: was.hidden_by ?? null, reports })
          : undefined;
      return { id: m.thread_id as string, ...(undo ? { undo } : {}) };
    }
    const previous = (
      await c.query(
        "SELECT thread_id,sender_id,organization_id FROM internal_message WHERE id=$1",
        [cmd.requestId],
      )
    ).rows[0];
    if (previous) {
      if (previous.sender_id !== p.userId || previous.organization_id !== org)
        throw new AccessError("NOT_FOUND", 404);
      return { id: previous.thread_id };
    }
    let id: string;
    if (cmd.action === "create") {
      const allowed = new Set((await recipients(c, a)).map((r) => r.id));
      if (cmd.recipients.some((r) => !allowed.has(r)))
        throw new AccessError("NOT_FOUND", 404);
      const members = [...new Set([p.userId, ...cmd.recipients])];
      // A minor is never alone with adults: their representatives join.
      const guardians = new Set<string>();
      for (const u of members)
        if (await minor(c, org, u)) {
          const reps = await representatives(c, org, u);
          if (!reps.length) throw new AccessError("MINOR_NEEDS_GUARDIAN", 409);
          reps.forEach((r) => guardians.add(r));
        }
      id = (
        await c.query(
          "INSERT INTO message_thread(organization_id,subject,created_by) VALUES($1,$2,$3) RETURNING id",
          [org, cmd.subject, x.userId],
        )
      ).rows[0].id;
      for (const user of members)
        await c.query(
          "INSERT INTO message_participant(thread_id,organization_id,user_id) VALUES($1,$2,$3)",
          [id, org, user],
        );
      for (const user of guardians)
        if (!members.includes(user))
          await c.query(
            "INSERT INTO message_participant(thread_id,organization_id,user_id,reason) VALUES($1,$2,$3,'guardian')",
            [id, org, user],
          );
    } else {
      const t = await threadFor(c, x, cmd.threadId);
      if (t.locked_at && !x.moderator) throw new AccessError("THREAD_LOCKED", 409);
      id = t.id;
      if (t.kind !== "direct")
        await c.query(
          "INSERT INTO message_participant(thread_id,organization_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [id, org, p.userId],
        );
    }
    await c.query(
      "INSERT INTO internal_message(id,thread_id,organization_id,sender_id,body) VALUES($1,$2,$3,$4,$5)",
      [cmd.requestId, id, org, p.userId, cmd.body],
    );
    await audit(c, org, p.userId, "messages.sent", id);
    return { id };
  });
}
