import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError, type Principal } from "../access/service";
import { brusselsToday } from "../people/service";
import { createTransport, type Transport } from "../notifications/transport";
import { escapeHtml } from "../../lib/html";
import { logEvent } from "../../lib/log";

/**
 * 12/11/2026: deleting one's account. The request waits 30 days, the time to
 * change one's mind (the same as a club's closure); the person can still sign
 * in and cancel it. Then the account is anonymised: no sign-in, no name, no
 * e-mail, no photo, no mandate. The clubs keep their own files (a player's
 * sheet, a payment) as their records; the journals keep the account's
 * identifier, never its name. Nobody leaves an organisation without a
 * president: a sole president hands over first, or closes the club.
 */
export const deletionDays = 30;
export const deletionCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), confirmEmail: z.string().trim().max(254) }),
  z.object({ action: z.literal("cancel") }),
]);
type Env = Record<string, string | undefined>;

/** The organisations the person is the only president of, still open. */
async function soleOf(c: Pool | PoolClient, userId: string) {
  return (
    await c.query(
      `SELECT o.id,o.name,r.role FROM role_assignment r JOIN organization o ON o.id=r.organization_id
        WHERE r.user_id=$1 AND r.role IN ('club_president','federation_president') AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
          AND o.closed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM role_assignment x WHERE x.organization_id=r.organization_id AND x.role=r.role AND x.user_id<>r.user_id AND x.revoked_at IS NULL AND x.valid_from<=now() AND (x.valid_until IS NULL OR x.valid_until>now()))
        ORDER BY o.name`,
      [userId],
    )
  ).rows as { id: string; name: string; role: string }[];
}

export async function deletionView(db: Pool, p: Principal) {
  const pending = (await db.query("SELECT due_on::text AS due_on,requested_at FROM account_deletion WHERE user_id=$1 AND cancelled_at IS NULL AND completed_at IS NULL", [p.userId])).rows[0] as { due_on: string; requested_at: string } | undefined;
  return { pending: pending ?? null, sole: await soleOf(db, p.userId), days: deletionDays };
}

const mails = {
  fr: (due: string) => ({ subject: "Suppression de votre compte demandée", text: `Bonjour,\n\nLa suppression de votre compte Powerchair Football Manager est prévue le ${due}. D'ici là, vous pouvez l'annuler dans Réglages, Mon compte.\n\nSi vous n'avez rien demandé, connectez-vous, annulez-la et changez votre mot de passe.` }),
  nl: (due: string) => ({ subject: "Verwijdering van uw account gevraagd", text: `Hallo,\n\nDe verwijdering van uw Powerchair Football Manager-account is gepland op ${due}. Tot dan kunt u ze annuleren in Instellingen, Mijn account.\n\nHeeft u niets gevraagd? Meld u aan, annuleer ze en wijzig uw wachtwoord.` }),
  en: (due: string) => ({ subject: "Deletion of your account requested", text: `Hello,\n\nThe deletion of your Powerchair Football Manager account is planned on ${due}. Until then, you can cancel it in Settings, My account.\n\nIf you did not ask for anything, sign in, cancel it and change your password.` }),
};

export async function deletionExecute(db: Pool, p: Principal, raw: unknown, env: Env = process.env, transport?: Transport) {
  const cmd = deletionCommand.parse(raw);
  const c = await db.connect();
  let notify: { email: string; locale: "fr" | "nl" | "en"; due: string };
  try {
    await c.query("BEGIN");
    const u = (await c.query('SELECT u.email,COALESCE(pe.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1 AND u.active FOR UPDATE OF u', [p.userId])).rows[0] as { email: string; locale: "fr" | "nl" | "en" } | undefined;
    if (!u) throw new AccessError("UNAUTHENTICATED", 401);
    if (cmd.action === "cancel") {
      const r = await c.query("UPDATE account_deletion SET cancelled_at=now() WHERE user_id=$1 AND cancelled_at IS NULL AND completed_at IS NULL", [p.userId]);
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      await c.query("COMMIT");
      return { ok: true as const };
    }
    // The person types their own address: a click alone never deletes an account.
    if (cmd.confirmEmail.toLowerCase() !== u.email.toLowerCase()) throw new AccessError("CONFIRMATION_MISMATCH", 400);
    if ((await soleOf(c, p.userId)).length) throw new AccessError("SOLE_PRESIDENT", 409);
    const due = (await c.query("SELECT ($1::date + $2::int)::text AS d", [brusselsToday(), deletionDays])).rows[0].d as string;
    await c.query(
      `INSERT INTO account_deletion(user_id,due_on) VALUES($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET requested_at=now(),due_on=EXCLUDED.due_on,cancelled_at=NULL,completed_at=NULL
       WHERE account_deletion.completed_at IS NULL`,
      [p.userId, due],
    );
    await c.query("COMMIT");
    notify = { email: u.email, locale: u.locale, due };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  const day = `${notify.due.slice(8, 10)}/${notify.due.slice(5, 7)}/${notify.due.slice(0, 4)}`;
  const m = mails[notify.locale](day);
  try {
    await (transport ?? createTransport(env, env.MAIL_ALLOW_EXTERNAL === "true")).send(randomUUID(), { email: notify.email, url: env.BETTER_AUTH_URL ?? "", subject: m.subject, text: m.text, html: `<p>${escapeHtml(m.text).replace(/\n/g, "<br>")}</p>` });
  } catch (e) {
    logEvent("error", "account_deletion.mail_failed", { code: e instanceof Error ? e.message.slice(0, 80) : "unknown" });
  }
  return { ok: true as const, dueOn: notify.due };
}

/** Anonymises one account, in the caller's transaction. */
export async function anonymiseAccount(c: PoolClient, userId: string) {
  await c.query(`UPDATE "user" SET name='Compte supprimé',email='deleted-'||id||'@deleted.invalid',image=NULL,active=false,"emailVerified"=false,"twoFactorEnabled"=false,"updatedAt"=now() WHERE id=$1`, [userId]);
  // Sign-in, second factor, sessions, phone notifications, photo: gone.
  await c.query('DELETE FROM account WHERE "userId"=$1', [userId]);
  await c.query('DELETE FROM "twoFactor" WHERE "userId"=$1', [userId]);
  await c.query("DELETE FROM active_context WHERE user_id=$1", [userId]);
  await c.query('DELETE FROM session WHERE "userId"=$1', [userId]);
  await c.query("DELETE FROM push_subscription WHERE user_id=$1", [userId]);
  await c.query("DELETE FROM user_avatar WHERE user_id=$1", [userId]);
  // No mandate, no membership any more.
  await c.query("UPDATE role_assignment SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
  await c.query("UPDATE organization_membership SET active=false WHERE user_id=$1", [userId]);
}

/** Hourly: the requests whose 30 days are over. */
export async function deletionTick(db: Pool) {
  const c = await db.connect();
  let done = 0;
  try {
    const due = (await c.query("SELECT user_id FROM account_deletion WHERE cancelled_at IS NULL AND completed_at IS NULL AND due_on<=$1::date ORDER BY due_on LIMIT 50", [brusselsToday()])).rows as { user_id: string }[];
    for (const d of due) {
      try {
        await c.query("BEGIN");
        const still = await c.query("SELECT 1 FROM account_deletion WHERE user_id=$1 AND cancelled_at IS NULL AND completed_at IS NULL FOR UPDATE", [d.user_id]);
        // A person who became the only president meanwhile keeps the account: a presidency is never left empty.
        if (!still.rowCount || (await soleOf(c, d.user_id)).length) {
          await c.query("ROLLBACK");
          continue;
        }
        await anonymiseAccount(c, d.user_id);
        await c.query("UPDATE account_deletion SET completed_at=now() WHERE user_id=$1", [d.user_id]);
        await c.query("COMMIT");
        done++;
      } catch (e) {
        await c.query("ROLLBACK");
        logEvent("error", "account_deletion.failed", { code: e instanceof Error ? e.name : "unknown" });
      }
    }
  } finally {
    c.release();
  }
  return done;
}
