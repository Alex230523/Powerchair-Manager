import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
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
]);
async function scope<T>(
  db: Pool,
  p: Principal,
  org: string | undefined,
  fn: (c: PoolClient, a: Awaited<ReturnType<typeof active>>) => Promise<T>,
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
    await account(c, p);
    if (
      a.organization_id !== first.organization_id ||
      (org && org !== a.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    const result = await fn(c, a);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function recipients(
  c: PoolClient,
  a: Awaited<ReturnType<typeof active>>,
) {
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
export async function messagesView(db: Pool, p: Principal, threadId?: string) {
  return scope(db, p, undefined, async (c, a) => {
    const threads = (
      await c.query(
        `SELECT t.*, (SELECT max(created_at) FROM internal_message WHERE thread_id=t.id) AS updated_at FROM message_thread t JOIN message_participant p ON p.thread_id=t.id WHERE t.organization_id=$1 AND p.user_id=$2 ORDER BY updated_at DESC,t.id`,
        [a.organization_id, p.userId],
      )
    ).rows;
    if (threadId && !threads.some((t) => t.id === threadId))
      throw new AccessError("NOT_FOUND", 404);
    return {
      organizationId: a.organization_id,
      recipients: await recipients(c, a),
      threads,
      messages: threadId
        ? (
            await c.query(
              `SELECT i.id,i.body,i.created_at,u.name AS sender FROM internal_message i JOIN "user" u ON u.id=i.sender_id WHERE i.thread_id=$1 ORDER BY i.created_at,i.id`,
              [threadId],
            )
          ).rows
        : [],
      participants: threadId
        ? (
            await c.query(
              'SELECT u.name FROM message_participant p JOIN "user" u ON u.id=p.user_id WHERE p.thread_id=$1 ORDER BY u.name',
              [threadId],
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
  return scope(db, p, org, async (c, a) => {
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
      id = (
        await c.query(
          "INSERT INTO message_thread(organization_id,subject) VALUES($1,$2) RETURNING id",
          [org, cmd.subject],
        )
      ).rows[0].id;
      for (const user of new Set([p.userId, ...cmd.recipients]))
        await c.query(
          "INSERT INTO message_participant(thread_id,organization_id,user_id) VALUES($1,$2,$3)",
          [id, org, user],
        );
    } else {
      id = cmd.threadId;
      if (
        !(
          await c.query(
            "SELECT 1 FROM message_participant WHERE thread_id=$1 AND organization_id=$2 AND user_id=$3",
            [id, org, p.userId],
          )
        ).rowCount
      )
        throw new AccessError("NOT_FOUND", 404);
    }
    await c.query(
      "INSERT INTO internal_message(id,thread_id,organization_id,sender_id,body) VALUES($1,$2,$3,$4,$5)",
      [cmd.requestId, id, org, p.userId, cmd.body],
    );
    await audit(c, org, p.userId, "messages.sent", id);
    return { id };
  });
}
