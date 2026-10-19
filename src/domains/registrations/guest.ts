import type { Pool } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError, type Principal } from "../access/service";
import { publish } from "../notifications/queue";

/**
 * Registration without a password. The applicant leaves a name and an email;
 * a personal link (30 days) opens their applicant space for that form. The
 * account behind it has no password and no role: it can only use the
 * registration routes, which accept the link instead of a login session.
 */
export const guestRequestSchema = z.object({
  formId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  locale: z.enum(["fr", "nl", "en"]),
  website: z.string().max(0).optional(), // honeypot
});
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function requestGuestLink(
  db: Pool,
  input: z.infer<typeof guestRequestSchema>,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const form = (
      await c.query(
        "SELECT f.id,f.organization_id,o.name AS organization FROM registration_form f JOIN season s ON s.id=f.season_id JOIN organization o ON o.id=f.organization_id WHERE f.id=$1 AND f.published AND NOT s.archived",
        [input.formId],
      )
    ).rows[0];
    if (!form) throw new AccessError("NOT_FOUND", 404);
    const email = input.email.toLowerCase();
    const existing = (
      await c.query(
        'SELECT id,name,active FROM "user" WHERE lower(email)=$1 FOR UPDATE',
        [email],
      )
    ).rows[0] as { id: string; name: string; active: boolean } | undefined;
    const user = existing ?? {
      id: randomUUID(),
      name: input.name,
      active: true,
    };
    if (existing) {
      // Staff accounts sign in with their password and second factor, never by link.
      const staff = await c.query(
        "SELECT 1 FROM role_assignment WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1",
        [user.id],
      );
      if (staff.rowCount || !user.active) {
        await c.query("COMMIT");
        return { ok: true as const };
      }
    } else {
      await c.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)',
        [user.id, input.name, email],
      );
      await c.query(
        "INSERT INTO person(user_id,locale) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [user.id, input.locale],
      );
    }
    // At most three links per hour and per address: the answer stays the same.
    const recent = (
      await c.query(
        "SELECT count(*)::int AS n FROM registration_guest_link WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
        [user.id],
      )
    ).rows[0].n as number;
    const busy = (
      await c.query(
        "SELECT count(*)::int AS n FROM registration_guest_link WHERE form_id=$1 AND created_at>now()-interval '1 hour'",
        [form.id],
      )
    ).rows[0].n as number;
    if (recent >= 3 || busy >= 200) {
      await c.query("COMMIT");
      return { ok: true as const };
    }
    const token = randomBytes(32).toString("base64url");
    const link = (
      await c.query(
        "INSERT INTO registration_guest_link(user_id,form_id,token_hash) VALUES($1,$2,$3) RETURNING id",
        [user.id, form.id, hash(token)],
      )
    ).rows[0].id as string;
    await publish(c, {
      organizationId: form.organization_id,
      userId: user.id,
      email,
      kind: "registration_link",
      category: "security",
      resourceType: "registration",
      resourceId: link,
      eventKey: "registration_link:" + link,
      locale: input.locale,
      variables: {
        name: user.name,
        organization: form.organization,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${input.locale}/inscription/${form.id}?guest=${token}`,
      },
      inApp: false,
    });
    await c.query("COMMIT");
    return { ok: true as const };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Turns a guest link into a principal for the registration routes only. A
 * server-side session row backs it (its token never leaves the server).
 */
export async function guestPrincipal(
  db: Pool,
  token: string,
): Promise<Principal> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token))
    throw new AccessError("UNAUTHENTICATED", 401);
  const link = (
    await db.query(
      'SELECT l.id,l.user_id,l.expires_at FROM registration_guest_link l JOIN "user" u ON u.id=l.user_id WHERE l.token_hash=$1 AND l.expires_at>now() AND u.active',
      [hash(token)],
    )
  ).rows[0];
  if (!link) throw new AccessError("UNAUTHENTICATED", 401);
  const sessionId = "guest-" + link.id;
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET "expiresAt"=EXCLUDED."expiresAt","updatedAt"=now()',
    [sessionId, link.user_id, randomBytes(32).toString("hex"), link.expires_at],
  );
  // Opening the link proves the address.
  await db.query(
    'UPDATE "user" SET "emailVerified"=true WHERE id=$1 AND NOT "emailVerified"',
    [link.user_id],
  );
  await db.query(
    "UPDATE registration_guest_link SET last_used_at=now() WHERE id=$1",
    [link.id],
  );
  return { userId: link.user_id, sessionId };
}
/** Guest token from the request: header for API calls, query for file links. */
export function guestToken(request: Request) {
  return (
    request.headers.get("x-guest-token") ??
    new URL(request.url).searchParams.get("guest") ??
    null
  );
}
