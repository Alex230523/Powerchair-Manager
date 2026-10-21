import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { mandateContext, AccessError, requirePermission } from "../access/service";
import { permissions, type Role } from "../access/policy";
import { ownProfiles } from "../calendar/access";
import { computeFor, type DashboardContext } from "../dashboard/service";
import { publish } from "../notifications/queue";
import { renderDigest, type DigestData } from "./build";
import {
  brusselsClock,
  digestRoles,
  digestSections,
  nextDigestDate,
  defaultDigestDay,
  defaultDigestMinute,
  type DigestCommand,
  type DigestSection,
} from "./schema";

/**
 * The weekly digest (wave 15, C7). The figures come from the dashboard
 * computed for the person's own mandate (same rights, same module switches),
 * plus the sponsor and grant tasks with the name of the person in charge.
 * One digest per person, club and ISO week; an empty week sends nothing.
 */
type Locale = "fr" | "nl" | "en";
const isManager = (role: string) => (digestRoles as readonly string[]).includes(role);

/** What the digest of this mandate would say today; null when the mandate no longer counts. */
export async function digestData(c: PoolClient, mandateId: string, now = new Date()): Promise<{ data: DigestData; context: DashboardContext; email: string; locale: Locale } | null> {
  const context = await mandateContext(c, mandateId);
  if (!context || context.kind !== "club" || !isManager(context.role)) return null;
  const user = (await c.query('SELECT u.id,u.name,u.email,u."twoFactorEnabled",COALESCE(p.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person p ON p.user_id=u.id WHERE u.id=$1 AND u.active', [context.user_id])).rows[0] as
    | { id: string; name: string; email: string; twoFactorEnabled: boolean | null; locale: Locale }
    | undefined;
  if (!user) return null;
  const clock = brusselsClock(now);
  const dash = await computeFor(c, user, context, { week: clock.date }, { agenda: 60, deadlines: 200 });
  const until = now.getTime() + 7 * 86400000;
  const soon = (iso: string) => new Date(iso).getTime() < until;
  const count = (key: string) => dash.todos.find((t) => t.key === key)?.count ?? 0;
  // Sponsor conditions and grant steps due within 7 days (late ones too), with who is in charge:
  // all of them for a president with the money rights, one's own otherwise (as on the home).
  const org = context.organization_id;
  const rights = permissions(context.role as Role, context.grants);
  const mfa = mfaSatisfied(!!user.twoFactorEnabled);
  const money = mfa && (rights.includes("dues.manage") || rights.includes("dues.read"));
  const financeOn = !context.disabled_modules?.includes("finance");
  const all = context.role === "club_president" && money;
  const own = financeOn ? [...(await ownProfiles(c, { ...context, twoFactorEnabled: !!user.twoFactorEnabled }))] : [];
  const tasks =
    financeOn && (all || own.length)
      ? (
          await c.query(
            `SELECT t.due_on::text AS date,COALESCE(pa.name,g.funder)||' · '||t.title AS title,cp.full_name AS responsible,t.due_on<$2::date AS late
               FROM funding_task t LEFT JOIN partner pa ON pa.id=t.partner_id LEFT JOIN grant_application g ON g.id=t.grant_id
               LEFT JOIN club_person cp ON cp.id=t.responsible_id AND cp.organization_id=t.organization_id
              WHERE t.organization_id=$1 AND t.status='todo' AND t.due_on<=$2::date+7 AND ($3 OR t.responsible_id=ANY($4::uuid[]))
              ORDER BY t.due_on,t.title LIMIT 30`,
            [org, clock.date, all, own],
          )
        ).rows
      : [];
  const data: DigestData = {
    club: context.organization_name,
    name: user.name,
    todos: dash.todos.map((t) => ({ key: t.key, count: t.count })),
    events: (dash.week?.events ?? []).filter((e) => e.status === "scheduled").map((e) => ({ title: e.title, startsAt: e.startsAt, team: e.team, place: e.place })),
    registrations: dash.scopes.includes("registrations") ? count("registrationsReview") : null,
    documents: dash.scopes.includes("documents") ? count("documentsExpiring") : null,
    dues: dash.finance?.dues ? { players: dash.finance.dues.playersLate, cents: dash.finance.dues.late } : null,
    readiness: dash.agenda
      .filter((e) => e.status === "scheduled" && e.readiness?.tone === "low" && soon(e.startsAt))
      .map((e) => ({ title: e.title, startsAt: e.startsAt, team: e.team, players: e.readiness!.players, coaches: e.readiness!.coaches })),
    deadlines: dash.deadlines
      .filter((d): d is typeof d & { kind: "grant" | "partner" | "accounts" } => (d.kind === "grant" || d.kind === "partner" || d.kind === "accounts") && !d.task)
      .map((d) => ({ kind: d.kind, date: d.date, title: d.title })),
    tasks: tasks.map((t) => ({ date: t.date, title: t.title, responsible: t.responsible, late: t.late })),
    treasury: dash.finance ? dash.finance.treasury : null,
  };
  return { data, context, email: user.email, locale: user.locale };
}

/** The person's sections (all by default). */
async function sectionsOf(c: PoolClient, org: string, userId: string) {
  const row = (await c.query("SELECT digest_sections FROM notification_preference WHERE organization_id=$1 AND user_id=$2 AND category='digest'", [org, userId])).rows[0];
  return (row?.digest_sections ?? [...digestSections]) as DigestSection[];
}

/**
 * Builds and queues one digest. The week's row is taken first, so two
 * workers never send it twice; an empty digest keeps its row and no mail.
 */
export async function sendDigest(c: PoolClient, mandateId: string, options: { preview: boolean; now?: Date }) {
  const now = options.now ?? new Date();
  const built = await digestData(c, mandateId, now);
  if (!built) return { sent: false, items: 0 };
  const { data, context, email, locale } = built;
  const org = context.organization_id,
    userId = context.user_id;
  const sections = await sectionsOf(c, org, userId);
  const base = process.env.BETTER_AUTH_URL ?? "";
  const clock = brusselsClock(now);
  const send = (
    await c.query(
      `INSERT INTO digest_send(organization_id,user_id,week,preview,items) VALUES($1,$2,$3,$4,0)
       ON CONFLICT (organization_id,user_id,week) WHERE NOT preview DO NOTHING RETURNING id`,
      [org, userId, clock.week, options.preview],
    )
  ).rows[0]?.id as string | undefined;
  if (!send) return { sent: false, items: 0 };
  const logo = (await c.query("SELECT extract(epoch FROM updated_at)::bigint::text AS v FROM organization_logo WHERE organization_id=$1", [org])).rows[0]?.v as string | undefined;
  const mail = renderDigest(
    data,
    sections,
    locale,
    {
      dashboard: `${base}/${locale}`,
      settings: `${base}/${locale}/settings/notifications#notif-digest`,
      stop: `${base}/${locale}/desinscription/${send}`,
      logo: logo ? `${base}/api/club/logo?org=${org}&v=${logo}` : null,
    },
    options.preview,
  );
  if (!mail) return { sent: false, items: 0 };
  await c.query("UPDATE digest_send SET items=$2 WHERE id=$1", [send, mail.items]);
  await publish(c, {
    organizationId: org,
    userId,
    email,
    kind: "weekly_digest",
    category: "digest",
    resourceType: "digest",
    resourceId: send,
    eventKey: `digest:${send}`,
    locale,
    inApp: false,
    variables: { name: data.name, organization: data.club, url: `${base}/${locale}`, title: mail.subject, message: mail.text },
    html: mail.html,
  });
  return { sent: true, items: mail.items };
}

/**
 * Run by the mail worker about once a minute: every president or coach whose
 * digest is on and whose day and time (theirs, else the club's) are reached
 * in Brussels, and who has no digest yet this ISO week.
 */
export async function digestTick(db: Pool, now = new Date()) {
  const clock = brusselsClock(now);
  const due = (
    await db.query(
      `SELECT DISTINCT ON (r.organization_id,r.user_id) r.id
         FROM role_assignment r JOIN organization o ON o.id=r.organization_id AND o.kind='club'
         JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id AND m.active
         JOIN "user" u ON u.id=r.user_id AND u.active
         LEFT JOIN notification_preference n ON n.organization_id=r.organization_id AND n.user_id=r.user_id AND n.category='digest'
        WHERE r.role IN ('club_president','coach') AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
          AND COALESCE(n.email_enabled,r.role='club_president')
          AND COALESCE(n.digest_day,o.digest_day)=$1 AND COALESCE(n.digest_minute,o.digest_minute)<=$2
          AND NOT EXISTS(SELECT 1 FROM digest_send s WHERE s.organization_id=r.organization_id AND s.user_id=r.user_id AND s.week=$3 AND NOT s.preview)
        ORDER BY r.organization_id,r.user_id,(r.role='club_president') DESC,r.created_at`,
      [clock.day, clock.minute, clock.week],
    )
  ).rows as { id: string }[];
  let sent = 0;
  for (const { id } of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
      if ((await sendDigest(c, id, { preview: false, now })).sent) sent++;
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("Weekly digest:", e instanceof Error ? e.name : "unknown");
    } finally {
      c.release();
    }
  }
  return sent;
}

type Mandate = { id: string; organization_id: string; user_id: string; role: Role; grants: string[]; kind: string };

/** The settings of the active mandate (president or coach of a club), or null. */
export async function digestSettings(c: PoolClient, a: Mandate, now = new Date()) {
  if (a.kind !== "club" || !isManager(a.role)) return null;
  const club = (await c.query("SELECT digest_day,digest_minute FROM organization WHERE id=$1", [a.organization_id])).rows[0] as { digest_day: number; digest_minute: number } | undefined;
  const pref = (
    await c.query("SELECT email_enabled,digest_day,digest_minute,digest_sections FROM notification_preference WHERE organization_id=$1 AND user_id=$2 AND category='digest'", [a.organization_id, a.user_id])
  ).rows[0] as { email_enabled: boolean; digest_day: number | null; digest_minute: number | null; digest_sections: DigestSection[] | null } | undefined;
  const president = !!(
    await c.query(
      "SELECT 1 FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='club_president' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())",
      [a.organization_id, a.user_id],
    )
  ).rowCount;
  const clock = brusselsClock(now);
  const builtThisWeek = !!(await c.query("SELECT 1 FROM digest_send WHERE organization_id=$1 AND user_id=$2 AND week=$3 AND NOT preview", [a.organization_id, a.user_id, clock.week])).rowCount;
  const enabled = pref?.email_enabled ?? president;
  const clubDay = club?.digest_day ?? defaultDigestDay,
    clubMinute = club?.digest_minute ?? defaultDigestMinute;
  const when = { day: pref?.digest_day ?? clubDay, minute: pref?.digest_minute ?? clubMinute };
  return {
    enabled,
    day: pref?.digest_day ?? null,
    minute: pref?.digest_minute ?? null,
    sections: pref?.digest_sections ?? [...digestSections],
    club: { day: clubDay, minute: clubMinute },
    canClub: a.role === "club_president",
    next: enabled ? { date: nextDigestDate(clock, when, builtThisWeek), minute: when.minute } : null,
  };
}

/** Saves the person's choice, the club's moment (president), or sends a preview. */
export async function digestExecute(c: PoolClient, a: Mandate & { twoFactorEnabled: boolean }, command: DigestCommand) {
  if (a.kind !== "club" || !isManager(a.role)) throw new AccessError("FORBIDDEN");
  if (command.action === "digest") {
    if (command.enabled && !command.sections.length) throw new AccessError("DIGEST_SECTIONS", 400);
    await c.query(
      `INSERT INTO notification_preference(organization_id,user_id,category,email_enabled,in_app_enabled,digest_day,digest_minute,digest_sections) VALUES($1,$2,'digest',$3,false,$4,$5,$6)
       ON CONFLICT(organization_id,user_id,category) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,digest_day=EXCLUDED.digest_day,digest_minute=EXCLUDED.digest_minute,digest_sections=EXCLUDED.digest_sections`,
      [a.organization_id, a.user_id, command.enabled, command.day, command.minute, command.sections],
    );
    return { ok: true };
  }
  if (command.action === "digestClub") {
    if (a.role !== "club_president") throw new AccessError("FORBIDDEN");
    requirePermission(a.role, a.grants, "mandates.manage", a.twoFactorEnabled);
    await c.query("UPDATE organization SET digest_day=$2,digest_minute=$3 WHERE id=$1", [a.organization_id, command.day, command.minute]);
    return { ok: true };
  }
  // A preview at most once a minute: a second click is answered as already sent.
  if ((await c.query("SELECT 1 FROM digest_send WHERE organization_id=$1 AND user_id=$2 AND preview AND created_at>now()-interval '1 minute'", [a.organization_id, a.user_id])).rowCount)
    return { ok: true, sent: true };
  const r = await sendDigest(c, a.id, { preview: true });
  return { ok: true, sent: r.sent };
}

/** Public: the stop link at the bottom of a digest (the digest's own id is the key). */
export async function digestUnsubscribeInfo(db: Pool, id: string) {
  const row = (
    await db.query(
      `SELECT o.name AS club,NOT COALESCE(n.email_enabled,EXISTS(SELECT 1 FROM role_assignment r WHERE r.organization_id=s.organization_id AND r.user_id=s.user_id AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()))) AS done
         FROM digest_send s JOIN organization o ON o.id=s.organization_id
         LEFT JOIN notification_preference n ON n.organization_id=s.organization_id AND n.user_id=s.user_id AND n.category='digest'
        WHERE s.id=$1`,
      [id],
    )
  ).rows[0];
  return row ? { club: row.club as string, unsubscribed: row.done as boolean } : null;
}
export async function digestUnsubscribe(db: Pool, id: string, stop: boolean) {
  const s = (await db.query("SELECT s.organization_id,s.user_id FROM digest_send s JOIN organization_membership m ON m.organization_id=s.organization_id AND m.user_id=s.user_id WHERE s.id=$1", [id])).rows[0];
  if (!s) return null;
  await db.query(
    `INSERT INTO notification_preference(organization_id,user_id,category,email_enabled,in_app_enabled) VALUES($1,$2,'digest',$3,false)
     ON CONFLICT(organization_id,user_id,category) DO UPDATE SET email_enabled=EXCLUDED.email_enabled`,
    [s.organization_id, s.user_id, !stop],
  );
  return { unsubscribed: stop };
}
