import type { Pool, PoolClient } from "pg";
import { randomBytes } from "node:crypto";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, type Principal } from "../access/service";
import { publish } from "../notifications/queue";
import { createIssue, githubConfig, issueState, repoIsPrivate } from "./github";
import { DAILY_LIMIT, feedbackCommand, issueBody, issueTitle, pageOnly, stateOf } from "./schema";
import type { z } from "zod";

/**
 * 19: « Signaler un problème ». The remark is kept, then sent by the server
 * to the project's GitHub issues: one issue per remark, its context, never
 * a name unless the person agreed to be contacted, and its screenshot (masked
 * in the browser, seen by the person) only to a private repository. The
 * person follows its state in the application and is told when it is fixed.
 */
const version = () => (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.PFM_VERSION ?? "dev").slice(0, 12);

async function who(c: PoolClient, p: Principal) {
  try {
    const a = await active(c, p);
    return { org: a.organization_id as string | null, role: a.role as string };
  } catch {
    return { org: null, role: "" };
  }
}

export async function feedbackView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    await account(c, p);
    const mine = (
      await c.query("SELECT id,kind,left(description,140) AS description,state,created_at FROM app_feedback WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [p.userId])
    ).rows as { id: string; kind: string; description: string; state: string; created_at: string }[];
    const today = Number((await c.query("SELECT count(*)::int AS n FROM app_feedback WHERE user_id=$1 AND created_at>now()-interval '1 day'", [p.userId])).rows[0].n);
    return { mine, left: Math.max(0, DAILY_LIMIT - today) };
  } finally {
    c.release();
  }
}

export async function feedbackSubmit(db: Pool, p: Principal, raw: z.input<typeof feedbackCommand>) {
  const cmd = feedbackCommand.parse(raw);
  const c = await db.connect();
  let id: string;
  try {
    await c.query("BEGIN");
    await account(c, p);
    // Ten a day per person.
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`feedback:${p.userId}`]);
    const n = Number((await c.query("SELECT count(*)::int AS n FROM app_feedback WHERE user_id=$1 AND created_at>now()-interval '1 day'", [p.userId])).rows[0].n);
    if (n >= DAILY_LIMIT) throw new AccessError("TOO_MANY", 429);
    let shot: Buffer | null = null;
    if (cmd.screenshot) {
      shot = Buffer.from(cmd.screenshot, "base64");
      if (shot.length < 8 || shot.length > 3145728 || shot.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new AccessError("INVALID_IMAGE", 400);
    }
    const w = await who(c, p);
    const context = { page: pageOnly(cmd.context.page), locale: cmd.context.locale, screen: cmd.context.screen, browser: cmd.context.browser.slice(0, 200), version: version(), role: w.role };
    id = (
      await c.query(
        "INSERT INTO app_feedback(user_id,organization_id,kind,description,context,contact,screenshot,screenshot_type,screenshot_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        [p.userId, w.org, cmd.kind, cmd.description, JSON.stringify(context), cmd.contact, shot, shot ? "image/png" : null, shot ? randomBytes(24).toString("base64url") : null],
      )
    ).rows[0].id as string;
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  // Sent at once when GitHub answers; otherwise the hourly task tries again.
  await send(db, id).catch(() => undefined);
  return { id };
}

/** One remark to its issue (once). */
async function send(db: Pool, id: string) {
  const cfg = githubConfig();
  if (!cfg) return false;
  const f = (
    await db.query(
      `SELECT f.kind,f.description,f.context,f.contact,f.screenshot_token,u.name,u.email FROM app_feedback f JOIN "user" u ON u.id=f.user_id WHERE f.id=$1 AND f.sent_at IS NULL`,
      [id],
    )
  ).rows[0] as { kind: string; description: string; context: Record<string, string>; contact: boolean; screenshot_token: string | null; name: string; email: string } | undefined;
  if (!f) return false;
  try {
    const shot = f.screenshot_token && (await repoIsPrivate(cfg)) ? `${process.env.BETTER_AUTH_URL ?? ""}/api/feedback/shot/${f.screenshot_token}` : null;
    const issue = await createIssue(cfg, {
      title: issueTitle(f.kind, f.description),
      body: issueBody({ kind: f.kind, description: f.description, context: f.context, contact: f.contact ? { name: f.name, email: f.email } : null, screenshot: shot }),
      labels: ["signalement", f.kind],
    });
    await db.query("UPDATE app_feedback SET issue_number=$2,issue_url=$3,sent_at=now(),send_error='' WHERE id=$1", [id, issue.number, issue.url]);
    return true;
  } catch (e) {
    await db.query("UPDATE app_feedback SET send_error=$2 WHERE id=$1", [id, (e instanceof Error ? e.message : "SEND_FAILED").slice(0, 300)]);
    return false;
  }
}

/** The screenshot an issue links to, by its unguessable token. */
export async function feedbackShot(db: Pool, token: string) {
  const r = (await db.query("SELECT screenshot FROM app_feedback WHERE screenshot_token=$1 AND screenshot IS NOT NULL AND created_at>now()-interval '180 days'", [token])).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r.screenshot as Buffer;
}

/** Hourly: what did not leave leaves; the issues' states are read; the person is told when it is fixed. */
export async function feedbackTick(db: Pool) {
  const cfg = githubConfig();
  if (!cfg) return { sent: 0, checked: 0 };
  let sent = 0,
    checked = 0;
  for (const r of (await db.query("SELECT id FROM app_feedback WHERE sent_at IS NULL AND created_at>now()-interval '7 days' ORDER BY created_at LIMIT 20")).rows) if (await send(db, r.id)) sent++;
  const open = (
    await db.query(
      `SELECT f.id,f.issue_number,f.state,f.organization_id,u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM app_feedback f JOIN "user" u ON u.id=f.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE f.issue_number IS NOT NULL AND f.state<>'fixed' AND (f.checked_at IS NULL OR f.checked_at<now()-interval '50 minutes') ORDER BY f.checked_at NULLS FIRST LIMIT 50`,
    )
  ).rows as { id: string; issue_number: number; state: string; organization_id: string | null; user_id: string; email: string; name: string; locale: string }[];
  for (const f of open) {
    let state: string;
    try {
      state = stateOf(await issueState(cfg, f.issue_number));
    } catch {
      continue;
    }
    checked++;
    await db.query("UPDATE app_feedback SET state=$2,checked_at=now() WHERE id=$1", [f.id, state]);
    if (state === "fixed" && f.organization_id) {
      const c = await db.connect();
      try {
        const locale: Locale = isLocale(f.locale) ? f.locale : "fr";
        const w = fixedWords[locale];
        await publish(c, {
          organizationId: f.organization_id,
          userId: f.user_id,
          email: f.email,
          kind: "automation",
          category: "administrative",
          resourceType: "automation",
          resourceId: f.id,
          eventKey: `feedback:${f.id}:fixed`,
          locale,
          variables: { name: f.name, organization: "Powerchair Football Manager", url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/signalements`, title: w.title, message: w.message },
        });
        await c.query("UPDATE app_feedback SET fixed_notified_at=now() WHERE id=$1", [f.id]);
      } finally {
        c.release();
      }
    }
  }
  return { sent, checked };
}
const fixedWords: Record<Locale, { title: string; message: string }> = {
  fr: { title: "Votre signalement est corrigé", message: "Le problème que vous avez signalé est réglé. Merci de nous aider à améliorer l'application." },
  nl: { title: "Uw melding is opgelost", message: "Het probleem dat u meldde, is opgelost. Bedankt om de toepassing te helpen verbeteren." },
  en: { title: "Your report is fixed", message: "The problem you reported is fixed. Thank you for helping improve the application." },
};
