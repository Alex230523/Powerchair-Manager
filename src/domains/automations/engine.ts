import { belcotaxDeadline } from "../tax/rules";
import type { Pool, PoolClient } from "pg";
import { publish } from "../notifications/queue";
import { brusselsToday } from "../people/service";
import { duesReminderDeliver, duesReminderPlan } from "../reminders/service";
import { attendancePlan, attendanceTick } from "../attendance/service";
import { licencePlan, licenceReminderTick } from "../licences/service";
import { fundingTaskTick } from "../funding/service";
import { logEvent } from "../../lib/log";
import { catalog, defaultMessages, isEditable, render, ruleKeys, type Action, type Message, type Recipients, type RuleKey } from "./catalog";

/**
 * B7: the automations engine. For each club and each rule switched on (and
 * not paused, the club not stopped), `plan` lists who would get what today
 * WITHOUT writing; `run` does exactly that list, each line once thanks to
 * its key (rule, entity, due date, recipient). The simulation and the run
 * share the same plan. A rule that fails is written to the journal and the
 * others go on; nothing here runs inside a person's request.
 */
type Locale = "fr" | "nl" | "en";
export type Settings = { rule: RuleKey; enabled: boolean; paused: boolean; delay: number | null; recipients: Recipients; actions: Action[]; messages: Partial<Record<Locale, Message>> };
export type Recipient = { userId: string; email: string; name: string; locale: Locale };
export type Occurrence = {
  entity: string;
  /** The date the line is about (expiry, due date): with the entity, it makes the key. */
  due: string;
  about: string;
  person: string;
  url: string;
  recipients: Recipient[];
};
export type Club = { id: string; name: string; disabled: string[]; dues_rules: unknown; stopped: boolean; tax_approved?: boolean };

const locale = (l: string | null | undefined): Locale => (l === "nl" || l === "en" ? l : "fr");
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A club's settings for each rule: what is saved, or the catalogue's defaults. */
export async function settingsOf(c: PoolClient | Pool, club: Club): Promise<Record<RuleKey, Settings>> {
  const rows = (await c.query("SELECT rule,enabled,paused,delay_days,recipients,actions,messages FROM automation_rule WHERE organization_id=$1", [club.id])).rows as {
    rule: string;
    enabled: boolean;
    paused: boolean;
    delay_days: number | null;
    recipients: string;
    actions: string[];
    messages: Partial<Record<Locale, Message>>;
  }[];
  return Object.fromEntries(
    ruleKeys.map((rule) => {
      const def = catalog[rule],
        r = rows.find((x) => x.rule === rule);
      // The dues reminders keep their switch where it always was (Réglages › Relances).
      const enabled = rule === "duesReminder" ? !!(club.dues_rules as { auto?: boolean } | null)?.auto : (r?.enabled ?? def.enabled);
      return [
        rule,
        {
          rule,
          enabled,
          paused: r?.paused ?? false,
          delay: def.delay ? (r?.delay_days ?? def.delay.value) : null,
          recipients: (r && r.recipients !== "default" && def.recipients.includes(r.recipients as Recipients) ? r.recipients : def.recipients[0]) as Recipients,
          actions: (r?.actions ?? def.defaultActions).filter((a) => def.actions.includes(a as Action)) as Action[],
          messages: r?.messages ?? {},
        },
      ];
    }),
  ) as Record<RuleKey, Settings>;
}
/** On, not paused, its modules on, the club not stopped. */
export const active = (club: Club, s: Settings) =>
  !club.stopped && s.enabled && !s.paused && catalog[s.rule].modules.every((m) => !club.disabled.includes(m)) && (s.rule !== "taxDeadline" || !!club.tax_approved);

/* ------------------------------------------------------------ Recipients */
const userSql = `u.id AS "userId",u.email,u.name,COALESCE(pe.locale,'fr') AS locale`;
async function presidents(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT DISTINCT ${userSql} FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id AND m.active
         JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active`,
      [org],
    )
  ).rows as Recipient[];
}
/** The person's own account and their current representatives. */
async function personAndFamily(c: PoolClient, org: string, profile: string) {
  return (
    await c.query(
      `SELECT ${userSql} FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id WHERE cp.id=$1 AND cp.organization_id=$2 AND cp.status='active' AND u.active
       UNION
       SELECT ${userSql} FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id
        WHERE g.organization_id=$2 AND g.subject_profile_id=$1 AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND u.active`,
      [profile, org],
    )
  ).rows as Recipient[];
}
async function profileAccount(c: PoolClient, org: string, profile: string | null) {
  if (!profile) return [];
  return (
    await c.query(`SELECT ${userSql} FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id WHERE cp.id=$1 AND cp.organization_id=$2 AND cp.status='active' AND u.active`, [
      profile,
      org,
    ])
  ).rows as Recipient[];
}
const fixLocale = (list: Recipient[]) => list.map((r) => ({ ...r, locale: locale(r.locale) }));

/* ------------------------------------------------------------ Plans of the catalogue's own rules */
async function planGeneric(c: PoolClient, club: Club, s: Settings, today: string): Promise<Occurrence[]> {
  const org = club.id,
    delay = s.delay ?? 0,
    out: Occurrence[] = [];
  const to = async (who: Recipients, profile: string | null) =>
    fixLocale(who === "president" ? await presidents(c, org) : who === "responsible" ? await profileAccount(c, org, profile) : profile ? await personAndFamily(c, org, profile) : await presidents(c, org));
  if (s.rule === "documentExpiring")
    for (const d of (
      await c.query(
        `SELECT d.id,d.name,d.profile_id,d.expires_on::text AS due,COALESCE(cp.full_name,'') AS person FROM club_document d LEFT JOIN club_person cp ON cp.id=d.profile_id AND cp.organization_id=d.organization_id
          WHERE d.organization_id=$1 AND d.status='valid' AND d.expires_on BETWEEN $2::date AND $2::date+$3::int AND (cp.id IS NULL OR cp.status='active')`,
        [org, today, delay],
      )
    ).rows)
      out.push({ entity: d.id, due: d.due, about: d.name, person: d.person, url: "/documents", recipients: await to(s.recipients, d.profile_id) });
  if (s.rule === "registrationReview")
    for (const r of (
      await c.query(
        `SELECT id,subject_name,submitted_at::date::text AS due FROM registration_application WHERE organization_id=$1 AND status IN ('submitted','review') AND submitted_at::date<=$2::date-$3::int`,
        [org, today, delay],
      )
    ).rows)
      out.push({ entity: r.id, due: r.due, about: r.subject_name, person: r.subject_name, url: "/registrations", recipients: await to("president", null) });
  if (s.rule === "chairService")
    for (const r of (
      await c.query(`SELECT id,name,next_service_on::text AS due FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND next_service_on BETWEEN $2::date AND $2::date+$3::int`, [org, today, delay])
    ).rows)
      out.push({ entity: r.id, due: r.due, about: r.name, person: "", url: `/equipment/${r.id}`, recipients: await to("president", null) });
  if (s.rule === "sponsorQuiet")
    for (const r of (
      await c.query(
        `SELECT id,name,responsible_id,COALESCE(last_contact_on,signed_on,starts_on,created_at::date)::text AS due FROM partner
          WHERE organization_id=$1 AND status='active' AND COALESCE(last_contact_on,signed_on,starts_on,created_at::date)<$2::date-$3::int`,
        [org, today, delay],
      )
    ).rows) {
      const list = s.recipients === "responsible" ? await to("responsible", r.responsible_id) : [];
      out.push({ entity: r.id, due: r.due, about: r.name, person: "", url: `/funding/grants-sponsors?vue=sponsoring&partner=${r.id}`, recipients: list.length ? list : await to("president", null) });
    }
  if (s.rule === "taxDeadline") {
    // The gifts of last year are filed by the end of February: from `delay` days before, once per year.
    const year = Number(today.slice(0, 4)) - 1,
      due = belcotaxDeadline(year);
    if (today <= due && today >= addDays(due, -delay))
      out.push({ entity: club.id, due, about: String(year), person: "", url: "/funding/tax", recipients: await to("president", null) });
  }
  if (s.rule === "taskLate")
    for (const t of (
      await c.query(
        `SELECT t.id,t.title,t.due_on::text AS due,t.responsible_id,t.responsible_user_id,COALESCE(cp.full_name,'') AS person FROM funding_task t LEFT JOIN club_person cp ON cp.id=t.responsible_id
          WHERE t.organization_id=$1 AND t.status<>'done' AND t.due_on<=$2::date-GREATEST($3::int,1) AND NOT (t.source_kind LIKE 'auto\\_%')
            AND (t.responsible_id IS NOT NULL OR t.responsible_user_id IS NOT NULL)`,
        [org, today, delay],
      )
    ).rows) {
      const list = t.responsible_id
        ? await to("responsible", t.responsible_id)
        : fixLocale((await c.query(`SELECT ${userSql} FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1 AND u.active`, [t.responsible_user_id])).rows as Recipient[]);
      out.push({ entity: t.id, due: t.due, about: t.title, person: t.person || list[0]?.name || "", url: `/tasks?task=${t.id}`, recipients: list });
    }
  return out;
}

/* ------------------------------------------------------------ Simulation */
export type PlannedLine = { rule: RuleKey; entity: string; due: string; about: string; recipient: string; recipientId: string | null; actions: Action[]; already: boolean };
const key = (rule: RuleKey, o: { entity: string; due: string }, who: string) => `${rule}:${o.entity}:${o.due}:${who}`;

/**
 * What every active rule of the club would do today. Built-in rules list
 * what their own code is about to send; the catalogue's rules list each
 * (entity, recipient) and whether its key is already in the journal.
 */
export async function plan(c: PoolClient, club: Club, today = brusselsToday(), only?: RuleKey[]): Promise<PlannedLine[]> {
  const settings = await settingsOf(c, club);
  const out: PlannedLine[] = [];
  for (const rule of ruleKeys) {
    const s = settings[rule];
    if ((only && !only.includes(rule)) || !active(club, s)) continue;
    if (rule === "duesReminder") {
      for (const i of await duesReminderPlan(c, { id: club.id, name: club.name, dues_rules: club.dues_rules }, today))
        for (const t of i.targets) out.push({ rule, entity: i.profileId, due: today, about: i.fullName, recipient: t.name, recipientId: t.user_id, actions: ["email"], already: false });
      continue;
    }
    if (rule === "callNoAnswer") {
      for (const r of await attendancePlan(c, club.id))
        for (const name of r.reminder ? r.waiting : []) out.push({ rule, entity: r.id, due: today, about: r.title, recipient: name, recipientId: null, actions: ["notify", "email"], already: false });
      continue;
    }
    if (rule === "licenceExpiring") {
      for (const r of await licencePlan(c, today, [club.id])) out.push({ rule, entity: r.profile_id, due: r.valid_until, about: r.full_name, recipient: r.name, recipientId: r.user_id, actions: ["email"], already: false });
      continue;
    }
    if (rule === "grantDeadline" || rule === "sponsorRenewal") {
      for (const r of await fundingPlan(c, club.id, today, rule)) out.push({ rule, entity: r.id, due: r.due, about: r.about, recipient: r.name, recipientId: r.user_id, actions: ["email"], already: false });
      continue;
    }
    for (const o of await planGeneric(c, club, s, today)) {
      const notifying = s.actions.filter((a) => a !== "task");
      if (notifying.length)
        for (const r of o.recipients) {
          const k = key(rule, o, r.userId);
          const already = !!(await c.query("SELECT 1 FROM automation_run WHERE organization_id=$1 AND idem_key=$2", [club.id, k])).rowCount;
          out.push({ rule, entity: o.entity, due: o.due, about: o.about, recipient: r.name, recipientId: r.userId, actions: notifying, already });
        }
      if (s.actions.includes("task")) {
        const k = key(rule, o, "task");
        const already = !!(await c.query("SELECT 1 FROM automation_run WHERE organization_id=$1 AND idem_key=$2", [club.id, k])).rowCount;
        out.push({ rule, entity: o.entity, due: o.due, about: o.about, recipient: "", recipientId: null, actions: ["task"], already });
      }
    }
  }
  return out;
}
/** The grants' and renewals' notices, as fundingTaskTick sends them (to the presidents). */
async function fundingPlan(c: PoolClient, org: string, today: string, rule: "grantDeadline" | "sponsorRenewal") {
  if (rule === "sponsorRenewal")
    return (
      await c.query(
        `SELECT p.id,p.name AS about,p.renewal_on::text AS due,u.id AS user_id,u.name FROM partner p JOIN role_assignment r ON r.organization_id=p.organization_id AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
           JOIN "user" u ON u.id=r.user_id WHERE p.organization_id=$1 AND p.status<>'ended' AND p.renewal_on=$2::date`,
        [org, today],
      )
    ).rows as { id: string; about: string; due: string; user_id: string; name: string }[];
  return (
    await c.query(
      `SELECT g.id,CASE WHEN g.program<>'' THEN g.funder||' · '||g.program ELSE g.funder END AS about,CASE WHEN g.opens_on=$2::date THEN g.opens_on ELSE g.deadline_on END::text AS due,u.id AS user_id,u.name
         FROM grant_application g JOIN role_assignment r ON r.organization_id=g.organization_id AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
         JOIN "user" u ON u.id=r.user_id WHERE g.organization_id=$1 AND g.status='idea' AND (g.deadline_on=ANY($3::date[]) OR g.opens_on=$2::date)`,
      [org, today, [addDays(today, 30), addDays(today, 7), addDays(today, 1)]],
    )
  ).rows as { id: string; about: string; due: string; user_id: string; name: string }[];
}

/* ------------------------------------------------------------ Run */
const dateLabel = (iso: string, l: Locale) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
async function deliverGeneric(c: PoolClient, club: Club, s: Settings, o: Occurrence) {
  const base = process.env.BETTER_AUTH_URL ?? "";
  let sent = 0;
  const notifying = s.actions.filter((a) => a !== "task");
  if (notifying.length && isEditable(s.rule))
    for (const r of o.recipients) {
      const k = key(s.rule, o, r.userId);
      // The key first: a second run (or a second scheduler) finds it and stops there.
      const fresh = (
        await c.query(
          "INSERT INTO automation_run(organization_id,rule,idem_key,entity_id,about,recipient_user_id,recipient_label,result) VALUES($1,$2,$3,$4,$5,$6,$7,'sent') ON CONFLICT (organization_id,idem_key) DO NOTHING RETURNING id",
          [club.id, s.rule, k, o.entity, o.about.slice(0, 200), r.userId, r.name.slice(0, 160)],
        )
      ).rowCount;
      if (!fresh) continue;
      const message = s.messages[r.locale] ?? defaultMessages[s.rule][r.locale];
      const vars = { person: o.person || r.name, about: o.about, date: dateLabel(o.due, r.locale), organization: club.name };
      await publish(c, {
        organizationId: club.id,
        userId: r.userId,
        email: r.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: o.entity,
        eventKey: `automation:${k}`,
        locale: r.locale,
        inApp: notifying.includes("notify"),
        skipEmail: !notifying.includes("email"),
        variables: { name: r.name, title: render(message.subject, vars).slice(0, 200), message: render(message.body, vars).slice(0, 4000), organization: club.name, url: `${base}/${r.locale}${o.url}` },
      });
      sent++;
    }
  if (s.actions.includes("task") && catalog[s.rule].category) {
    const k = key(s.rule, o, "task");
    const fresh = (
      await c.query(
        "INSERT INTO automation_run(organization_id,rule,idem_key,entity_id,about,result) VALUES($1,$2,$3,$4,$5,'task') ON CONFLICT (organization_id,idem_key) DO NOTHING RETURNING id",
        [club.id, s.rule, k, o.entity, o.about.slice(0, 200)],
      )
    ).rowCount;
    const creator = (await c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL ORDER BY created_at LIMIT 1", [club.id])).rows[0]?.user_id;
    if (fresh && creator)
      await c.query(
        `INSERT INTO funding_task(organization_id,kind,category,title,due_on,origin,source_key,source_kind,source_params,created_by) VALUES($1,'other',$2,$3,$4,'template',$5,$6,$7,$8)
         ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,
        [club.id, catalog[s.rule].category, render(defaultMessages[s.rule as keyof typeof defaultMessages].fr.subject, { about: o.about, person: o.person, date: o.due, organization: club.name }).slice(0, 200), o.due, `auto:${k}`, `auto_${s.rule}`, JSON.stringify({ about: o.about }), creator],
      );
  }
  return sent;
}
async function journal(c: PoolClient, org: string, rule: RuleKey, result: "done" | "error", about: string, code: string | null = null) {
  await c.query("INSERT INTO automation_run(organization_id,rule,idem_key,entity_id,about,result,error_code) VALUES($1,$2,$3,'run',$4,$5,$6)", [
    org,
    rule,
    `${rule}:run:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    about.slice(0, 200),
    result,
    code,
  ]);
}

/**
 * Runs every active rule of every club once. Built-in rules call their own
 * code for the clubs where they are active; a rule that fails is journaled
 * (error code) and the next one runs. Returns counts only.
 */
export async function runAutomations(db: Pool, today = brusselsToday(), only?: RuleKey[]) {
  const clubs = (
    await db.query("SELECT id,name,disabled_modules AS disabled,dues_rules,automations_stopped AS stopped,tax_approved FROM organization WHERE kind='club'")
  ).rows as Club[];
  const counts: Record<string, number> = { sent: 0, errors: 0 };
  const where: Record<"callNoAnswer" | "licenceExpiring" | "grantDeadline" | "sponsorRenewal", string[]> = { callNoAnswer: [], licenceExpiring: [], grantDeadline: [], sponsorRenewal: [] };
  for (const club of clubs) {
    const settings = await settingsOf(db, club);
    for (const rule of ruleKeys) {
      const s = settings[rule];
      if ((only && !only.includes(rule)) || !active(club, s)) continue;
      if (rule in where) {
        where[rule as keyof typeof where].push(club.id);
        continue;
      }
      const c = await db.connect();
      try {
        await c.query("BEGIN");
        await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
        let n = 0;
        if (rule === "duesReminder") for (const i of await duesReminderPlan(c, club, today)) n += await duesReminderDeliver(c, club, i, today);
        else for (const o of await planGeneric(c, club, s, today)) n += await deliverGeneric(c, club, s, o);
        await c.query("COMMIT");
        counts.sent += n;
      } catch (e) {
        await c.query("ROLLBACK");
        counts.errors++;
        const code = (e instanceof Error ? e.message : "UNKNOWN").replace(/[^A-Z0-9_]/gi, "_").slice(0, 80);
        logEvent("error", "automation.failed", { rule, code });
        const j = await db.connect();
        try {
          await journal(j, club.id, rule, "error", "", code);
        } finally {
          j.release();
        }
      } finally {
        c.release();
      }
    }
  }
  // Built-in rules: their own code, for the clubs where they are active.
  const step = async (rule: keyof typeof where, run: () => Promise<number>) => {
    if (!where[rule].length) return;
    try {
      counts.sent += await run();
    } catch (e) {
      counts.errors++;
      logEvent("error", "automation.failed", { rule, code: e instanceof Error ? e.message.slice(0, 80) : "UNKNOWN" });
    }
  };
  await step("callNoAnswer", () => attendanceTick(db, where.callNoAnswer));
  await step("licenceExpiring", () => licenceReminderTick(db, where.licenceExpiring));
  await step("grantDeadline", () => fundingTaskTick(db, { grants: where.grantDeadline }));
  await step("sponsorRenewal", () => fundingTaskTick(db, { renewals: where.sponsorRenewal }));
  return counts;
}
