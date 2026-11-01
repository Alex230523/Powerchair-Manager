import type { Pool, PoolClient } from "pg";
import { AccessError, account, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { brusselsToday } from "../people/service";
import { catalog, defaultMessages, isEditable, ruleKeys, type RuleKey } from "./catalog";
import { plan, settingsOf, type Club } from "./engine";
import type { AutomationCommand } from "./schema";

/**
 * B7: the club's automations, seen and changed by the president and those
 * who manage notifications. Every query names the club.
 */
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (c: PoolClient, club: Club, userId: string) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = (
      await c.query(
        `SELECT r.organization_id,r.role,r.grants,o.kind FROM active_context x JOIN role_assignment r ON r.id=x.mandate_id AND r.user_id=x.user_id JOIN organization o ON o.id=r.organization_id
          WHERE x.session_id=$1 AND x.user_id=$2 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`,
        [p.sessionId, p.userId],
      )
    ).rows[0] as { organization_id: string; role: string; grants: string[]; kind: string } | undefined;
    if (!a) throw new AccessError("CONTEXT_REQUIRED");
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    if (a.role !== "club_president" && !permissions(a.role as never, a.grants).includes("notifications.manage")) throw new AccessError("FORBIDDEN");
    const club = (
      await c.query(`SELECT id,name,disabled_modules AS disabled,dues_rules,automations_stopped AS stopped,tax_approved FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id])
    ).rows[0] as Club;
    const out = await fn(c, club, p.userId);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function automationsView(db: Pool, p: Principal, simulate = false) {
  return scope(db, p, false, async (c, club) => {
    const settings = await settingsOf(c, club);
    const journal = (
      await c.query(
        "SELECT id,rule,entity_id,about,recipient_label,result,error_code,created_at FROM automation_run WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200",
        [club.id],
      )
    ).rows as { id: string; rule: RuleKey; entity_id: string; about: string; recipient_label: string; result: string; error_code: string | null; created_at: string }[];
    return {
      organization_id: club.id,
      stopped: club.stopped,
      today: brusselsToday(),
      // B8: nothing about tax receipts for a club that is not approved.
      rules: ruleKeys.filter((rule) => rule !== "taxDeadline" || club.tax_approved).map((rule) => ({
        rule,
        def: catalog[rule],
        settings: settings[rule],
        moduleOff: catalog[rule].modules.some((m) => club.disabled.includes(m)),
        defaults: isEditable(rule) ? defaultMessages[rule] : null,
      })),
      journal,
      // « Qui recevrait quoi aujourd'hui », only on demand: nothing is sent.
      simulation: simulate ? await plan(c, club) : null,
    };
  });
}

export async function automationsExecute(db: Pool, p: Principal, cmd: AutomationCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (c, club, userId) => {
      if (cmd.action === "stop") {
        await c.query("UPDATE organization SET automations_stopped=$2 WHERE id=$1", [club.id, cmd.stopped]);
        await audit(c, club.id, userId, cmd.stopped ? "automations.stopped" : "automations.resumed", club.id);
        return { ok: true as const };
      }
      const def = catalog[cmd.rule];
      // The dues reminders keep their switch in Réglages › Relances (dues_rules.auto).
      if (cmd.rule === "duesReminder")
        await c.query("UPDATE organization SET dues_rules=jsonb_set(COALESCE(dues_rules,'{}'::jsonb),'{auto}',to_jsonb($2::boolean)) WHERE id=$1", [club.id, cmd.enabled]);
      const delay = def.delay && cmd.delayDays !== undefined && cmd.delayDays !== null ? Math.min(def.delay.max, Math.max(def.delay.min, cmd.delayDays)) : null;
      const recipients = cmd.recipients && def.recipients.includes(cmd.recipients) ? cmd.recipients : "default";
      const actions = (cmd.actions ?? def.defaultActions).filter((a) => def.actions.includes(a));
      if (!actions.length) throw new AccessError("INVALID_INPUT", 400);
      const messages = isEditable(cmd.rule) ? (cmd.messages ?? {}) : {};
      await c.query(
        `INSERT INTO automation_rule(organization_id,rule,enabled,paused,delay_days,recipients,actions,messages,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (organization_id,rule) DO UPDATE SET enabled=EXCLUDED.enabled,paused=EXCLUDED.paused,delay_days=EXCLUDED.delay_days,recipients=EXCLUDED.recipients,actions=EXCLUDED.actions,messages=EXCLUDED.messages,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [club.id, cmd.rule, cmd.enabled, cmd.paused, delay, recipients, actions, JSON.stringify(messages), userId],
      );
      await audit(c, club.id, userId, "automations.rule", club.id, { rule: cmd.rule, enabled: cmd.enabled, paused: cmd.paused });
      return { ok: true as const };
    },
    expected,
  );
}
