import type { Pool, PoolClient } from "pg";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { contactsFor, groupProfiles } from "../communication/service";
import { emailHash } from "../communication/hash";
import { builtins, fill, firstName, mailTemplateCommand, optional, type MailTemplateCommand, type Texts, type Usage, type Values } from "./schema";
export { mailTemplateCommand };

/**
 * 10: one library of email templates for the whole club. Written by those
 * who manage the club's messages (notifications.manage); used from the
 * library (« Envoyer » to groups), from an event (« Envoyer une
 * invitation », also by those who plan the calendar), by the dues and
 * document reminders and by the automations (their chosen template).
 * Every recipient reads his own language; the messages one may stop
 * carry the unsubscribe link; everything leaves through the mail queue.
 */
export const DAILY_LIMIT = 2000;
type Scope = { c: PoolClient; org: string; orgName: string; userId: string; manage: boolean; planner: boolean };
async function scope<T>(db: Pool, p: Principal, _write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    const rights = permissions(a.role as never, a.grants as never) as string[];
    const manage = rights.includes("notifications.manage");
    const planner = manage || rights.includes("calendar.manage") || a.role === "coach";
    if (!planner) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, orgName: a.organization_name, userId: p.userId, manage, planner });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const need = (ok: boolean) => {
  if (!ok) throw new AccessError("FORBIDDEN");
};

/** The templates offered to every club, created the first time the library is opened. */
export async function ensureDefaults(c: PoolClient, org: string, locale: Locale = "fr") {
  for (const [usage, b] of Object.entries(builtins))
    await c.query("INSERT INTO mail_template(organization_id,usage,name,texts,builtin_key) VALUES($1,$2,$3,$4,$2) ON CONFLICT (organization_id,builtin_key) WHERE builtin_key IS NOT NULL DO NOTHING", [
      org,
      usage,
      b.name[locale],
      JSON.stringify(b.texts),
    ]);
}
export type MailTemplate = { id: string; usage: Usage; name: string; texts: Texts; builtin_key: string | null; archived: boolean; version: number; sends: number; last_sent: string | null };
async function templateOf(c: PoolClient, org: string, id: string) {
  const t = (await c.query("SELECT id,usage,name,texts,builtin_key,archived,version FROM mail_template WHERE id=$1 AND organization_id=$2", [id, org])).rows[0] as MailTemplate | undefined;
  if (!t) throw new AccessError("NOT_FOUND", 404);
  return t;
}
const tag = (l: string) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (d: Date | string, l: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));

/** What an event gives to a template: its name, date, place, team and link. */
async function eventOf(c: PoolClient, org: string, id: string | null) {
  if (!id) return null;
  const e = (
    await c.query(
      `SELECT e.id,e.title,e.starts_at,COALESCE(v.name,NULLIF(e.free_location,''),p.name,'') AS place,COALESCE(t.name,'') AS team
         FROM calendar_event e LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id LEFT JOIN team t ON t.id=e.team_id
        WHERE e.id=$1 AND e.organization_id=$2`,
      [id, org],
    )
  ).rows[0] as { id: string; title: string; starts_at: string; place: string; team: string } | undefined;
  if (!e) throw new AccessError("NOT_FOUND", 404);
  return e;
}
type Event = NonNullable<Awaited<ReturnType<typeof eventOf>>>;
const base = () => process.env.BETTER_AUTH_URL ?? "";
/** The values of one recipient, in his language. */
export function valuesFor(locale: Locale, club: string, name: string, event: Event | null, extra: Values = {}): Values {
  return {
    prénom: firstName(name),
    club,
    lien: event ? `${base()}/${locale}/calendar?event=${event.id}` : `${base()}/${locale}`,
    ...(event ? { événement: event.title, date: when(event.starts_at, locale), lieu: event.place, équipe: event.team } : {}),
    ...extra,
  };
}
/** Subject and body for one language, filled. */
export function render(texts: Texts, locale: Locale, values: Values) {
  const t = texts[locale] ?? texts.fr;
  return { subject: fill(t.subject, values).slice(0, 200), body: fill(t.body, values).slice(0, 8000) };
}

type Contact = { email: string; userId: string | null; name: string; locale: string };
/**
 * Sends one template to contacts through the mail queue: the recipient's
 * language, the unsubscribe link for the optional messages, the daily cap.
 */
export async function deliver(
  c: PoolClient,
  org: string,
  club: string,
  t: Pick<MailTemplate, "id" | "usage" | "texts">,
  contacts: Contact[],
  opts: { kind: "groups" | "event" | "test" | "reminder" | "automation"; eventId?: string | null; sentBy: string | null; values?: (to: Contact, locale: Locale) => Values; eventKey?: string; texts?: Texts },
) {
  const today = Number(
    (await c.query("SELECT COALESCE(sum(recipients),0)::int AS n FROM mail_template_send WHERE organization_id=$1 AND sent_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Brussels') AT TIME ZONE 'Europe/Brussels'", [org])).rows[0].n,
  );
  const stoppable = optional.includes(t.usage);
  const stops = stoppable
    ? new Set((await c.query("SELECT email_hash FROM mail_unsubscribe WHERE organization_id=$1", [org])).rows.map((r) => r.email_hash as string))
    : new Set<string>();
  const to = contacts.filter((x) => !stops.has(emailHash(x.email)));
  if (!to.length) throw new AccessError("NO_RECIPIENT", 409);
  if (today + to.length > DAILY_LIMIT) throw new AccessError("DAILY_LIMIT", 429);
  const event = await eventOf(c, org, opts.eventId ?? null);
  const send = (
    await c.query("INSERT INTO mail_template_send(organization_id,template_id,kind,event_id,recipients,sent_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [org, t.id, opts.kind, event?.id ?? null, to.length, opts.sentBy])
  ).rows[0].id as string;
  const texts = opts.texts ?? t.texts;
  for (const x of to) {
    const locale: Locale = isLocale(x.locale) ? x.locale : "fr";
    let unsubscribe = "";
    if (stoppable) {
      const d = (await c.query("INSERT INTO mail_template_delivery(send_id,organization_id,email_hash,user_id) VALUES($1,$2,$3,$4) RETURNING id", [send, org, emailHash(x.email), x.userId])).rows[0].id;
      unsubscribe = `${base()}/${locale}/desinscription/${d}`;
    }
    const values = { ...valuesFor(locale, club, x.name, event), ...(opts.values?.(x, locale) ?? {}) };
    const r = render(texts, locale, values);
    const stop = { fr: "Ne plus recevoir ces messages", nl: "Deze berichten niet meer ontvangen", en: "Stop receiving these messages" }[locale];
    await publish(c, {
      organizationId: org,
      userId: x.userId,
      email: x.email,
      kind: "automation",
      category: stoppable ? "sport" : "administrative",
      resourceType: "automation",
      resourceId: `template:${t.id}`,
      eventKey: `${opts.eventKey ?? `template:${send}`}:${emailHash(x.email).slice(0, 16)}`,
      locale,
      inApp: !!x.userId && opts.kind !== "test",
      variables: { name: x.name, title: r.subject, message: unsubscribe ? `${r.body}\n\n${stop} : ${unsubscribe}` : r.body, organization: club, url: values.lien ?? `${base()}/${locale}` },
    });
  }
  return { sendId: send, recipients: to.length };
}
/** The template chosen for a reminder or an automation, or null (their own text then). */
export async function boundTemplate(c: PoolClient, org: string, target: string) {
  return ((await c.query("SELECT t.id,t.usage,t.texts FROM mail_template_binding b JOIN mail_template t ON t.id=b.template_id WHERE b.organization_id=$1 AND b.target=$2 AND NOT t.archived", [org, target])).rows[0] ??
    null) as Pick<MailTemplate, "id" | "usage" | "texts"> | null;
}
/** Notes a sending made by a reminder or an automation in the template's history. */
export async function logSend(c: PoolClient, org: string, templateId: string, kind: "reminder" | "automation", recipients: number, by: string | null) {
  await c.query("INSERT INTO mail_template_send(organization_id,template_id,kind,recipients,sent_by) VALUES($1,$2,$3,$4,$5)", [org, templateId, kind, recipients, by]);
}

export async function mailTemplatesView(db: Pool, p: Principal, locale: Locale = "fr") {
  return scope(db, p, false, async (s) => {
    await ensureDefaults(s.c, s.org, locale);
    const templates = (
      await s.c.query(
        `SELECT t.id,t.usage,t.name,t.texts,t.builtin_key,t.archived,t.version,
                (SELECT count(*)::int FROM mail_template_send x WHERE x.template_id=t.id AND x.kind<>'test') AS sends,(SELECT max(sent_at) FROM mail_template_send x WHERE x.template_id=t.id) AS last_sent
           FROM mail_template t WHERE t.organization_id=$1 ORDER BY t.archived,t.usage='free',lower(t.name)`,
        [s.org],
      )
    ).rows as MailTemplate[];
    const history = (
      await s.c.query(
        `SELECT x.id,x.template_id,x.kind,x.recipients,x.sent_at,COALESCE(u.name,'') AS sent_by,e.title AS event
           FROM mail_template_send x LEFT JOIN "user" u ON u.id=x.sent_by LEFT JOIN calendar_event e ON e.id=x.event_id WHERE x.organization_id=$1 ORDER BY x.sent_at DESC LIMIT 100`,
        [s.org],
      )
    ).rows as { id: string; template_id: string; kind: string; recipients: number; sent_at: string; sent_by: string; event: string | null }[];
    return {
      organization_id: s.org,
      can: { manage: s.manage, send: s.planner },
      templates,
      history,
      groups: s.manage ? (await s.c.query("SELECT id,name FROM recipient_group WHERE organization_id=$1 AND NOT archived ORDER BY name", [s.org])).rows : [],
      events: (
        await s.c.query(
          "SELECT id,title,starts_at FROM calendar_event WHERE organization_id=$1 AND status='scheduled' AND starts_at BETWEEN now()-interval '1 day' AND now()+interval '120 days' ORDER BY starts_at LIMIT 200",
          [s.org],
        )
      ).rows as { id: string; title: string; starts_at: string }[],
      people: s.manage ? (await s.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name LIMIT 1000", [s.org])).rows : [],
      bindings: (await s.c.query("SELECT target,template_id FROM mail_template_binding WHERE organization_id=$1", [s.org])).rows as { target: string; template_id: string }[],
      dailyLimit: DAILY_LIMIT,
    };
  });
}

/** Those invited to an event (its register), or else the current players of its team. */
async function invitedTo(c: PoolClient, org: string, eventId: string) {
  const ids = (
    await c.query(
      `SELECT i.profile_id FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1 AND i.organization_id=$2 AND i.withdrawn_at IS NULL
       UNION SELECT m.profile_id FROM calendar_event e JOIN team_membership m ON m.team_id=e.team_id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL
        WHERE e.id=$1 AND e.organization_id=$2 AND NOT EXISTS(SELECT 1 FROM attendance_register r WHERE r.event_id=e.id)`,
      [eventId, org],
    )
  ).rows.map((r) => r.profile_id as string);
  return ids;
}

export async function mailTemplateExecute(db: Pool, p: Principal, command: MailTemplateCommand, expected?: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      switch (command.action) {
        case "save": {
          need(s.manage);
          if (command.id) {
            const r = await s.c.query("UPDATE mail_template SET name=$3,usage=$4,texts=$5,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND version=$6 RETURNING id", [
              command.id,
              s.org,
              command.name,
              command.usage,
              JSON.stringify(command.texts),
              command.version ?? 0,
            ]);
            if (!r.rowCount) throw new AccessError((await s.c.query("SELECT 1 FROM mail_template WHERE id=$1 AND organization_id=$2", [command.id, s.org])).rowCount ? "STALE_VERSION" : "NOT_FOUND", 409);
            await audit(s.c, s.org, s.userId, "mail_template.updated", command.id);
            return { ok: true as const, id: command.id };
          }
          const id = (
            await s.c.query("INSERT INTO mail_template(organization_id,usage,name,texts,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [s.org, command.usage, command.name, JSON.stringify(command.texts), s.userId])
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "mail_template.created", id);
          return { ok: true as const, id };
        }
        case "archive": {
          need(s.manage);
          await templateOf(s.c, s.org, command.id);
          await s.c.query("UPDATE mail_template SET archived=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [command.id, s.org, command.archived]);
          return { ok: true as const, id: command.id };
        }
        case "duplicate": {
          need(s.manage);
          const t = await templateOf(s.c, s.org, command.id);
          const id = (
            await s.c.query("INSERT INTO mail_template(organization_id,usage,name,texts,created_by) VALUES($1,$2,left($3,120),$4,$5) RETURNING id", [s.org, t.usage, `${t.name} (2)`, JSON.stringify(t.texts), s.userId])
          ).rows[0].id as string;
          return { ok: true as const, id };
        }
        case "preview": {
          const t = await templateOf(s.c, s.org, command.id);
          const event = await eventOf(s.c, s.org, command.eventId);
          let name = (await s.c.query('SELECT name FROM "user" WHERE id=$1', [s.userId])).rows[0]?.name as string;
          let locale: Locale = "fr";
          let team = "";
          if (command.profileId) {
            const person = (
              await s.c.query(
                `SELECT c.full_name,COALESCE(pe.locale,'fr') AS locale,(SELECT t.name FROM team_membership m JOIN team t ON t.id=m.team_id WHERE m.profile_id=c.id AND NOT m.cancelled AND m.closed_at IS NULL AND NOT t.archived ORDER BY m.starts_on DESC LIMIT 1) AS team
                   FROM club_person c JOIN person pe ON pe.id=c.person_id WHERE c.id=$1 AND c.organization_id=$2`,
                [command.profileId, s.org],
              )
            ).rows[0];
            if (!person) throw new AccessError("NOT_FOUND", 404);
            name = person.full_name;
            locale = isLocale(person.locale) ? person.locale : "fr";
            team = person.team ?? "";
          }
          const values = valuesFor(locale, s.orgName, name, event, event?.team ? {} : { équipe: team });
          return { ok: true as const, id: t.id, locale, ...render(t.texts, locale, values) };
        }
        case "test": {
          const t = await templateOf(s.c, s.org, command.id);
          const me = (await s.c.query(`SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1`, [s.userId])).rows[0];
          const r = await deliver(s.c, s.org, s.orgName, { ...t, usage: "dues_reminder" }, [{ email: me.email, userId: me.id, name: me.name, locale: me.locale }], {
            kind: "test",
            eventId: command.eventId,
            sentBy: s.userId,
          });
          return { ok: true as const, id: t.id, recipients: r.recipients };
        }
        case "send": {
          const t = await templateOf(s.c, s.org, command.id);
          if (t.archived) throw new AccessError("NOT_FOUND", 404);
          const profiles = new Set<string>();
          if (command.toInvited) {
            if (!command.eventId) throw new AccessError("INVALID_INPUT", 400);
            await eventOf(s.c, s.org, command.eventId);
            for (const id of await invitedTo(s.c, s.org, command.eventId)) profiles.add(id);
          }
          if (command.groupIds.length) {
            // Groups are the messaging's: those who manage the club's messages only.
            need(s.manage);
            for (const gid of command.groupIds) {
              const g = (await s.c.query("SELECT * FROM recipient_group WHERE id=$1 AND organization_id=$2 AND NOT archived", [gid, s.org])).rows[0];
              if (!g) throw new AccessError("NOT_FOUND", 404);
              for (const id of await groupProfiles(s.c, s.org, g)) profiles.add(id);
            }
          }
          if (!command.toInvited && !command.groupIds.length) throw new AccessError("NO_RECIPIENT", 409);
          if (!s.manage && !command.toInvited) throw new AccessError("FORBIDDEN");
          const contacts = await contactsFor(s.c, s.org, [...profiles]);
          const r = await deliver(s.c, s.org, s.orgName, t, contacts, { kind: command.toInvited ? "event" : "groups", eventId: command.eventId, sentBy: s.userId, texts: command.texts });
          await audit(s.c, s.org, s.userId, "mail_template.sent", t.id, { recipients: r.recipients });
          return { ok: true as const, id: t.id, recipients: r.recipients };
        }
        case "bind": {
          need(s.manage);
          if (command.templateId === null) await s.c.query("DELETE FROM mail_template_binding WHERE organization_id=$1 AND target=$2", [s.org, command.target]);
          else {
            await templateOf(s.c, s.org, command.templateId);
            await s.c.query(
              `INSERT INTO mail_template_binding(organization_id,target,template_id,updated_by) VALUES($1,$2,$3,$4)
               ON CONFLICT (organization_id,target) DO UPDATE SET template_id=EXCLUDED.template_id,updated_by=EXCLUDED.updated_by,updated_at=now()`,
              [s.org, command.target, command.templateId, s.userId],
            );
          }
          return { ok: true as const, id: command.target };
        }
      }
    },
    expected,
  );
}
/** The kind and variables of a mail written from a chosen template (reminders, automations). */
export function viaTemplate(t: Pick<MailTemplate, "texts">, locale: Locale, name: string, club: string, values: Values) {
  const r = render(t.texts, locale, { prénom: firstName(name), club, ...values });
  return { kind: "automation" as const, variables: { name, title: r.subject, message: r.body, organization: club, url: values.lien ?? `${base()}/${locale}` } };
}
