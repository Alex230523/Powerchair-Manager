import { boundTemplate, logSend, viaTemplate } from "../mail-templates/service";
import type { Pool, PoolClient } from "pg";
import { receivesMoneySql } from "../family/split";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import { brusselsToday } from "../people/service";
import { duesRules, reminderDue } from "../dues/rules";
import { receivableTeamsSql } from "../dues/teams";
import { publish, templateFor } from "../notifications/queue";
import {
  applyPayments,
  commandSchema,
  duesStatus,
  pendingDocumentStatuses,
  type Command,
  type Installment,
  type ReminderKind,
} from "./schema";
export { commandSchema };

type Scope = {
  c: PoolClient;
  org: string;
  orgName: string;
  userId: string;
  dues: boolean;
  documents: boolean;
  templates: boolean;
};
/**
 * Reminders for dues (dues.manage) and documents (documents.manage), with MFA.
 * Recipients are the person's own account and their active representatives;
 * the club email on file is used when nobody has an account.
 */
async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: Scope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [a.organization_id],
    );
    const user = await account(c, p);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    if (!mfaSatisfied(!!user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    const rights = permissions(a.role, a.grants);
    const s: Scope = {
      c,
      org: a.organization_id,
      orgName: a.organization_name,
      userId: p.userId,
      dues: rights.includes("dues.manage"),
      documents: rights.includes("documents.manage"),
      templates: rights.includes("notifications.manage"),
    };
    if (!s.dues && !s.documents) throw new AccessError("FORBIDDEN");
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

type Recipient = {
  profile_id: string;
  user_id: string | null;
  email: string;
  name: string;
  locale: "fr" | "nl" | "en";
};
/** 29: for money (dues), only the representatives of the child's split, when the club chose one. */
async function recipients(s: Scope, profileIds: string[], money = false) {
  const rows = (
    await s.c.query(
      `SELECT cp.id AS profile_id,u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale
         FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id
        WHERE cp.organization_id=$2 AND cp.id=ANY($1) AND u.active
       UNION
       SELECT g.subject_profile_id,u.id,u.email,u.name,COALESCE(pe.locale,'fr')
         FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id
        WHERE g.organization_id=$2 AND g.subject_profile_id=ANY($1) AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND u.active${money ? " AND " + receivesMoneySql("g") : ""}`,
      [profileIds, s.org],
    )
  ).rows as Recipient[];
  const covered = new Set(rows.map((r) => r.profile_id));
  // Nobody with an account: the address recorded on the club profile.
  const fallback = (
    await s.c.query(
      "SELECT id AS profile_id,NULL AS user_id,email,full_name AS name,'fr' AS locale FROM club_person WHERE organization_id=$2 AND id=ANY($1) AND email IS NOT NULL AND email<>''",
      [profileIds.filter((id) => !covered.has(id)), s.org],
    )
  ).rows as Recipient[];
  return [...rows, ...fallback];
}

async function duesRows(s: Scope, today: string) {
  const rows = (
    await s.c.query(
      `SELECT d.id,d.profile_id,cp.full_name,d.category,d.net_cents,
              COALESCE((SELECT json_agg(json_build_object('due_on',i.due_on::text,'amount_cents',i.amount_cents) ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id),'[]') AS installments,
              (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents,
              ${receivableTeamsSql("d", "p")} AS team_ids
         FROM dues_receivable d JOIN dues_plan p ON p.id=d.plan_id JOIN club_person cp ON cp.id=d.profile_id
        WHERE d.organization_id=$1 AND d.status='open' AND cp.status='active' ORDER BY cp.full_name`,
      [s.org],
    )
  ).rows as {
    id: string;
    profile_id: string;
    full_name: string;
    category: string;
    net_cents: number;
    installments: Installment[];
    paid_cents: number;
    team_ids: string[];
  }[];
  return rows
    .map((r) => ({
      ...r,
      ...duesStatus(r.installments, today, 14, r.paid_cents),
    }))
    .filter((r) => r.concerned);
}
async function documentRows(s: Scope) {
  return (
    await s.c.query(
      `SELECT d.profile_id,cp.full_name,json_agg(json_build_object('name',d.name,'status',d.status,'expires_on',d.expires_on::text) ORDER BY d.name) AS documents
         FROM club_document d JOIN club_person cp ON cp.id=d.profile_id
        WHERE d.organization_id=$1 AND d.status=ANY($2) AND cp.status='active'
        GROUP BY d.profile_id,cp.full_name ORDER BY cp.full_name`,
      [s.org, pendingDocumentStatuses],
    )
  ).rows as {
    profile_id: string;
    full_name: string;
    documents: { name: string; status: string; expires_on: string | null }[];
  }[];
}
async function lastSent(s: Scope, kind: ReminderKind) {
  return Object.fromEntries(
    (
      await s.c.query(
        "SELECT profile_id,max(sent_at) AS sent_at FROM reminder_log WHERE organization_id=$1 AND kind=$2 GROUP BY profile_id",
        [s.org, kind],
      )
    ).rows.map((r) => [r.profile_id, r.sent_at as string]),
  );
}

export async function remindersView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const today = brusselsToday();
    const withContacts = async <T extends { profile_id: string }>(
      rows: T[],
      kind: ReminderKind,
    ) => {
      const to = await recipients(s, [
        ...new Set(rows.map((r) => r.profile_id)),
      ], kind === "dues");
      const sent = await lastSent(s, kind);
      return rows.map((r) => ({
        ...r,
        recipients: to
          .filter((x) => x.profile_id === r.profile_id)
          .map((x) => x.name),
        last_sent: sent[r.profile_id] ?? null,
      }));
    };
    const templates = [];
    for (const kind of ["dues_reminder", "document_reminder"] as const)
      for (const locale of ["fr", "nl", "en"] as const) {
        const t = await templateFor(s.c, s.org, kind, locale);
        templates.push({
          kind,
          locale,
          subject: t.subject,
          body: t.body,
          version: t.version,
        });
      }
    return {
      organization_id: s.org,
      today,
      can: { dues: s.dues, documents: s.documents, templates: s.templates },
      dues: s.dues ? await withContacts(await duesRows(s, today), "dues") : [],
      documents: s.documents
        ? await withContacts(await documentRows(s), "documents")
        : [],
      templates,
    };
  });
}

const statusLabel: Record<string, Record<"fr" | "nl" | "en", string>> = {
  missing: { fr: "à fournir", nl: "te bezorgen", en: "to provide" },
  requested: { fr: "demandé", nl: "gevraagd", en: "requested" },
  refused: {
    fr: "refusé, à renvoyer",
    nl: "geweigerd, opnieuw indienen",
    en: "refused, please resend",
  },
  expired: {
    fr: "expiré, à renouveler",
    nl: "vervallen, te vernieuwen",
    en: "expired, please renew",
  },
};
const euro = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
const date = (d: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(d + "T12:00:00Z"));

export async function remindersExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expected: string,
) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (input.kind === "dues" ? !s.dues : !s.documents)
        throw new AccessError("FORBIDDEN");
      const today = brusselsToday();
      const wanted = new Set(input.profileIds);
      const base = process.env.BETTER_AUTH_URL ?? "";
      let people = 0,
        messages = 0;
      const duesTemplate = input.kind === "dues" ? await boundTemplate(s.c, s.org, "dues_reminder") : null,
        docTemplate = input.kind === "documents" ? await boundTemplate(s.c, s.org, "documents_reminder") : null;
      if (input.kind === "dues") {
        const rows = (await duesRows(s, today)).filter((r) =>
          wanted.has(r.profile_id),
        );
        const to = await recipients(
          s,
          rows.map((r) => r.profile_id),
          true,
        );
        for (const profileId of new Set(rows.map((r) => r.profile_id))) {
          const mine = rows.filter((r) => r.profile_id === profileId);
          const targets = to.filter((x) => x.profile_id === profileId);
          for (const t of targets) {
            const owed = mine.reduce(
              (n, r) => n + (r.overdueCents || r.upcomingCents),
              0,
            );
            const next = mine
              .map((r) => r.next?.due_on)
              .filter(Boolean)
              .sort()[0];
            await publish(s.c, {
              organizationId: s.org,
              userId: t.user_id,
              email: t.email,
              kind: "dues_reminder",
              category: "administrative",
              resourceType: "dues",
              resourceId: profileId,
              eventKey: `reminder:dues:${profileId}:${today}`,
              locale: t.locale,
              variables: {
                name: t.name,
                organization: s.orgName,
                url: `${base}/${t.locale}/dues`,
                person: mine[0].full_name,
                amount: euro(owed, t.locale),
                due: next ? date(next, t.locale) : date(today, t.locale),
                details: mine
                  .map((r) => `${r.category} : ${euro(r.net_cents, t.locale)}`)
                  .join("\n"),
              },
              // 10: the club's chosen template, when there is one.
              ...(duesTemplate
                ? viaTemplate(duesTemplate, t.locale, t.name, s.orgName, {
                    montant: euro(owed, t.locale),
                    échéance: next ? date(next, t.locale) : date(today, t.locale),
                    lien: `${base}/${t.locale}/dues`,
                  })
                : {}),
            });
            messages++;
          }
          await s.c.query(
            "INSERT INTO reminder_log(organization_id,profile_id,kind,recipients,sent_by) VALUES($1,$2,'dues',$3,$4)",
            [s.org, profileId, targets.length, s.userId],
          );
          people++;
        }
      } else {
        const rows = (await documentRows(s)).filter((r) =>
          wanted.has(r.profile_id),
        );
        const to = await recipients(
          s,
          rows.map((r) => r.profile_id),
        );
        for (const r of rows) {
          const targets = to.filter((x) => x.profile_id === r.profile_id);
          for (const t of targets) {
            await publish(s.c, {
              organizationId: s.org,
              userId: t.user_id,
              email: t.email,
              kind: "document_reminder",
              category: "administrative",
              resourceType: "document",
              resourceId: r.profile_id,
              eventKey: `reminder:documents:${r.profile_id}:${today}`,
              locale: t.locale,
              variables: {
                name: t.name,
                organization: s.orgName,
                url: `${base}/${t.locale}/documents`,
                person: r.full_name,
                details: r.documents
                  .map(
                    (d) =>
                      `- ${d.name} (${statusLabel[d.status]?.[t.locale] ?? d.status})`,
                  )
                  .join("\n"),
              },
              ...(docTemplate ? viaTemplate(docTemplate, t.locale, t.name, s.orgName, { lien: `${base}/${t.locale}/documents` }) : {}),
            });
            messages++;
          }
          await s.c.query(
            "INSERT INTO reminder_log(organization_id,profile_id,kind,recipients,sent_by) VALUES($1,$2,'documents',$3,$4)",
            [s.org, r.profile_id, targets.length, s.userId],
          );
          people++;
        }
      }
      const used = duesTemplate ?? docTemplate;
      if (used && messages) await logSend(s.c, s.org, used.id, "reminder", messages, s.userId);
      await audit(s.c, s.org, s.userId, "reminder." + input.kind, s.org);
      return { ok: true as const, people, messages };
    },
    expected,
  );
}

/**
 * Automatic dues reminders (wave 11), run by the worker. For each club that
 * switched them on in Réglages: a mail a few days before an instalment, one
 * once it is late, repeated every `repeatDays` while something stays due.
 * The same recipients and wording as a reminder sent by hand; the log line
 * carries no sender.
 */
export async function duesReminderTick(db: Pool) {
  const today = brusselsToday();
  let sent = 0;
  const clubs = (
    await db.query(
      "SELECT id,name,dues_rules FROM organization WHERE kind='club' AND dues_rules->>'auto'='true' AND NOT ('dues'=ANY(disabled_modules)) AND NOT ('reminders'=ANY(disabled_modules))",
    )
  ).rows as { id: string; name: string; dues_rules: unknown }[];
  for (const club of clubs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
      for (const item of await duesReminderPlan(c, club, today)) sent += await duesReminderDeliver(c, club, item, today);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}

/** B7: who gets a dues reminder today in one club (no write: also the simulation). */
export async function duesReminderPlan(c: PoolClient, club: { id: string; name: string; dues_rules: unknown }, today: string) {
  const rules = duesRules(club.dues_rules);
  const s: Scope = { c, org: club.id, orgName: club.name, userId: "", dues: true, documents: false, templates: false };
  const rows = await duesRows(s, today);
  const last = await lastSent(s, "dues");
  const due = rows.filter((r) => {
    const open = applyPayments(r.installments, r.paid_cents).sort((a, b) => a.due_on.localeCompare(b.due_on));
    const lastDay = last[r.profile_id] ? new Date(last[r.profile_id]).toISOString().slice(0, 10) : null;
    return reminderDue(rules, open, lastDay, today) !== null;
  });
  const to = await recipients(s, due.map((r) => r.profile_id), true);
  return [...new Set(due.map((r) => r.profile_id))].map((profileId) => ({
    profileId,
    fullName: due.find((r) => r.profile_id === profileId)!.full_name,
    rows: due.filter((r) => r.profile_id === profileId),
    targets: to.filter((x) => x.profile_id === profileId),
  }));
}
export type DuesReminderItem = Awaited<ReturnType<typeof duesReminderPlan>>[number];

/** B7: the reminder itself, the same mail and log line as before the engine. */
export async function duesReminderDeliver(c: PoolClient, club: { id: string; name: string }, item: DuesReminderItem, today: string) {
  const base = process.env.BETTER_AUTH_URL ?? "";
  const template = await boundTemplate(c, club.id, "dues_reminder");
  for (const t of item.targets) {
    const owed = item.rows.reduce((n, r) => n + (r.overdueCents || r.upcomingCents), 0);
    const next = item.rows.map((r) => r.next?.due_on).filter(Boolean).sort()[0];
    await publish(c, {
      organizationId: club.id,
      userId: t.user_id,
      email: t.email,
      kind: "dues_reminder",
      category: "administrative",
      resourceType: "dues",
      resourceId: item.profileId,
      eventKey: `reminder:dues:auto:${item.profileId}:${today}`,
      locale: t.locale,
      variables: {
        name: t.name,
        organization: club.name,
        url: `${base}/${t.locale}/dues`,
        person: item.fullName,
        amount: euro(owed, t.locale),
        due: next ? date(next, t.locale) : date(today, t.locale),
        details: item.rows.map((r) => `${r.category} : ${euro(r.net_cents, t.locale)}`).join("\n"),
      },
      ...(template ? viaTemplate(template, t.locale, t.name, club.name, { montant: euro(owed, t.locale), échéance: next ? date(next, t.locale) : date(today, t.locale), lien: `${base}/${t.locale}/dues` }) : {}),
    });
  }
  if (template && item.targets.length) await logSend(c, club.id, template.id, "automation", item.targets.length, null);
  await c.query("INSERT INTO reminder_log(organization_id,profile_id,kind,recipients,sent_by,automatic) VALUES($1,$2,'dues',$3,NULL,true)", [club.id, item.profileId, item.targets.length]);
  return item.targets.length;
}
