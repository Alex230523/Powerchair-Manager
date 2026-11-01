import type { PoolClient } from "pg";
import { duesAccount } from "../bank/service";
import { formatReference } from "../bank/reference";
import { formatIban } from "../../lib/iban";
import { AccessError } from "../access/service";
import { publish } from "../notifications/queue";
import { installmentsFrom } from "../registrations/schema";
import { log, recomputeSiblings, writeSchedule, type DuesCtx } from "./core";
import { previewLine, siblingRanks, type IssueTarget } from "./schema";

/**
 * A3: issuing many fees at once (the wizard), and the fee issued by itself
 * when a registration is accepted. Everything happens in the caller's
 * transaction: a whole team is issued, or nothing.
 */
export type Plan = {
  id: string;
  season_id: string;
  category: string;
  amount_cents: number;
  max_installments: number;
  first_due: string;
  team_id: string | null;
  sibling_second_percent: number;
  sibling_next_percent: number;
};

export async function activePlan(c: PoolClient, org: string, id: string) {
  const plan = (
    await c.query(
      "SELECT p.*,p.first_due::text AS first_due FROM dues_plan p JOIN season se ON se.id=p.season_id WHERE p.id=$1 AND p.organization_id=$2 AND NOT p.archived AND NOT se.archived",
      [id, org],
    )
  ).rows[0] as Plan | undefined;
  if (!plan) throw new AccessError("NOT_FOUND", 404);
  return plan;
}

const live = "NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)";
type Candidate = { profile_id: string; full_name: string; birth_date: string | null; application_id: string | null; installments: number | null };

/** The people a target means, active in the club. */
async function candidates(c: PoolClient, org: string, plan: Plan, target: IssueTarget): Promise<Candidate[]> {
  const base = "SELECT DISTINCT cp.id AS profile_id,cp.full_name,cp.birth_date::text AS birth_date,NULL::uuid AS application_id,NULL::int AS installments FROM club_person cp";
  if (target.kind === "person")
    return (await c.query(`${base} WHERE cp.id=$1 AND cp.organization_id=$2 AND cp.status='active'`, [target.profileId, org])).rows;
  if (target.kind === "team") {
    if (!(await c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2 AND season_id=$3", [target.teamId, org, plan.season_id])).rowCount) throw new AccessError("NOT_FOUND", 404);
    return (
      await c.query(`${base} JOIN team_membership m ON m.profile_id=cp.id AND m.organization_id=cp.organization_id WHERE m.team_id=$1 AND cp.organization_id=$2 AND cp.status='active' AND m.role='player' AND ${live} ORDER BY cp.full_name`, [
        target.teamId,
        org,
      ])
    ).rows;
  }
  if (target.kind === "season")
    return (
      await c.query(
        `${base} JOIN team_membership m ON m.profile_id=cp.id AND m.organization_id=cp.organization_id JOIN team t ON t.id=m.team_id
          WHERE t.season_id=$1 AND cp.organization_id=$2 AND cp.status='active' AND m.role='player' AND ${live} AND ($3::uuid IS NULL OR t.id=$3) ORDER BY cp.full_name`,
        [plan.season_id, org, plan.team_id],
      )
    ).rows;
  // The admissions waiting for their fee, with the number of payments chosen on the form.
  const rows = (
    await c.query(
      `SELECT a.id AS application_id,a.profile_id,cp.full_name,cp.birth_date::text AS birth_date,a.answers,a.form_snapshot FROM registration_application a
         JOIN registration_followup f ON f.application_id=a.id JOIN club_person cp ON cp.id=a.profile_id AND cp.organization_id=a.organization_id
        WHERE a.organization_id=$1 AND a.season_id=$2 AND a.status='accepted' AND f.kind='dues' AND f.state='awaiting_module' AND cp.status='active' ORDER BY cp.full_name`,
      [org, plan.season_id],
    )
  ).rows;
  return rows.map((r) => ({ profile_id: r.profile_id, full_name: r.full_name, birth_date: r.birth_date, application_id: r.application_id, installments: chosenInstallments(r) }));
}
/** The number of payments chosen on a registration form, if the form asked it. */
function chosenInstallments(a: { answers?: Record<string, unknown>; form_snapshot?: { fields?: { key: string; maps?: string }[] } }) {
  const field = (a.form_snapshot?.fields ?? []).find((f) => f.maps === "installments");
  return field ? installmentsFrom(a.answers?.[field.key]) : null;
}

/** The wizard's preview: one line per person, with the amount after the sibling discount. */
export async function preview(c: PoolClient, org: string, plan: Plan, target: IssueTarget, exemptions: Map<string, string> = new Map()) {
  const people = await candidates(c, org, plan, target);
  const covered = new Set(
    (
      await c.query("SELECT profile_id FROM dues_receivable WHERE organization_id=$1 AND season_id=$2 AND lower(trim(category))=lower(trim($3)) AND status='open' AND profile_id=ANY($4::uuid[])", [
        org,
        plan.season_id,
        plan.category,
        people.map((p) => p.profile_id),
      ])
    ).rows.map((r) => r.profile_id as string),
  );
  // Ranks among the children who will owe this rate: those already issued and the new ones.
  const already = (
    await c.query("SELECT cp.id,cp.full_name,cp.birth_date::text AS birth_date FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id WHERE d.plan_id=$1 AND d.status='open'", [plan.id])
  ).rows as { id: string; full_name: string; birth_date: string | null }[];
  const children = [...already, ...people.filter((p) => !covered.has(p.profile_id)).map((p) => ({ id: p.profile_id, full_name: p.full_name, birth_date: p.birth_date }))];
  const links = (
    await c.query("SELECT subject_profile_id,guardian_profile_id FROM guardian_relationship WHERE organization_id=$1 AND revoked_at IS NULL AND subject_profile_id=ANY($2::uuid[])", [
      org,
      children.map((x) => x.id),
    ])
  ).rows as { subject_profile_id: string; guardian_profile_id: string }[];
  const guardiansOf = new Map<string, Set<string>>();
  for (const l of links) guardiansOf.set(l.subject_profile_id, new Set([...(guardiansOf.get(l.subject_profile_id) ?? []), l.guardian_profile_id]));
  const ranks = siblingRanks(children, guardiansOf);
  return people.map((p) => {
    const line = previewLine(plan.amount_cents, covered.has(p.profile_id), ranks.get(p.profile_id) ?? 1, { second: plan.sibling_second_percent, next: plan.sibling_next_percent }, exemptions.get(p.profile_id) ?? null);
    return { profile_id: p.profile_id, full_name: p.full_name, covered: covered.has(p.profile_id), gross: plan.amount_cents, ...line, application_id: p.application_id, installments: p.installments };
  });
}

/** One fee: the receivable, its schedule and its trace. */
export async function createReceivable(
  s: DuesCtx,
  plan: Plan,
  profileId: string,
  o: { discountCents: number; reason: string; installments: number; firstDue: string; applicationId?: string | null },
) {
  const d = (
    await s.c.query(
      "INSERT INTO dues_receivable(organization_id,profile_id,season_id,plan_id,category,plan_snapshot,gross_cents,discount_cents,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      [s.org, profileId, plan.season_id, plan.id, plan.category, JSON.stringify(plan), plan.amount_cents, o.discountCents, o.reason, s.userId],
    )
  ).rows[0];
  const installments = await writeSchedule(s, d.id, d.net_cents, Math.min(Math.max(1, o.installments), plan.max_installments), o.firstDue);
  if (o.applicationId) await s.c.query("UPDATE registration_followup SET state='processed' WHERE application_id=$1 AND kind='dues'", [o.applicationId]);
  await log(s, "issue", plan.id, d.id, null, { ...d, installments }, o.reason);
  return { id: d.id as string, installments };
}

/** The wizard's last step: every included line in one transaction, then the sibling rule once. */
export async function issueMany(
  s: DuesCtx,
  plan: Plan,
  cmd: { target: IssueTarget; installments: number; firstDue: string; exemptions: { profileId: string; reason: string }[]; excluded: string[] },
) {
  if (cmd.installments > plan.max_installments) throw new AccessError("INVALID_INPUT", 400);
  const exemptions = new Map(cmd.exemptions.map((e) => [e.profileId, e.reason]));
  const all = await preview(s.c, s.org, plan, cmd.target, exemptions);
  const lines = all.filter((l) => l.included && !cmd.excluded.includes(l.profile_id));
  const ids: string[] = [];
  for (const l of lines) {
    // Exempted lines keep their reason; the others start at full price and the sibling rule follows.
    const exempt = exemptions.get(l.profile_id);
    const made = await createReceivable(s, plan, l.profile_id, {
      discountCents: exempt ? plan.amount_cents : 0,
      reason: exempt ?? "",
      installments: l.installments ?? cmd.installments,
      firstDue: cmd.firstDue,
      applicationId: l.application_id,
    });
    ids.push(made.id);
  }
  if (ids.length && (plan.sibling_second_percent > 0 || plan.sibling_next_percent > 0)) await recomputeSiblings(s, plan.id);
  return { ids, skipped: all.length - ids.length };
}

/** The email « Cotisation émise » to the player and the parents, with the schedule. */
export async function tellFamilies(c: PoolClient, org: string, ids: string[]) {
  const base = process.env.BETTER_AUTH_URL ?? "";
  const rows = (
    await c.query(
      `SELECT d.id,d.profile_id,cp.full_name,d.net_cents,o.name AS organization,d.reference,
              COALESCE((SELECT json_agg(json_build_object('due_on',i.due_on::text,'amount_cents',i.amount_cents,'reference',i.reference) ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id),'[]') AS installments
         FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id JOIN organization o ON o.id=d.organization_id WHERE d.id=ANY($1::uuid[]) AND d.organization_id=$2 AND d.net_cents>0`,
      [ids, org],
    )
  ).rows as { id: string; profile_id: string; full_name: string; net_cents: number; organization: string; reference: string; installments: { due_on: string; amount_cents: number; reference: string }[] }[];
  // B1: the account the families pay to; without one, the e-mail points to their space.
  const account = await duesAccount(c, org);
  let sent = 0;
  for (const r of rows) {
    const people = (
      await c.query(
        `SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id WHERE cp.id=$1 AND cp.organization_id=$2 AND u.active
         UNION
         SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id
          WHERE g.organization_id=$2 AND g.subject_profile_id=$1 AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND u.active`,
        [r.profile_id, org],
      )
    ).rows as { id: string; email: string; name: string; locale: "fr" | "nl" | "en" }[];
    for (const u of people) {
      const tag = u.locale === "en" ? "en-GB" : `${u.locale}-BE`;
      const money = (v: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(v / 100);
      const day = (d: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
      await publish(c, {
        organizationId: org,
        userId: u.id,
        email: u.email,
        kind: "dues_issued",
        category: "administrative",
        resourceType: "dues",
        resourceId: r.id,
        eventKey: `dues_issued:${r.id}:${u.id}`,
        locale: u.locale,
        variables: {
          name: u.name,
          organization: r.organization,
          url: `${base}/${u.locale}/dues`,
          person: r.full_name,
          amount: money(r.net_cents),
          due: r.installments[0] ? day(r.installments[0].due_on) : "",
          details: r.installments.map((i) => `${day(i.due_on)} : ${money(i.amount_cents)} · ${formatReference(i.reference)}`).join("\n"),
          iban: account ? formatIban(account.iban) : ({ fr: "indiqué dans votre espace", nl: "vermeld in uw ruimte", en: "shown in your space" } as const)[u.locale],
          reference: formatReference(r.reference),
        },
      });
      sent++;
    }
  }
  return sent;
}

/**
 * Réglages › Argent: the rate issued when a registration is accepted. Only
 * for the rate's season, never twice for the same category, with the number
 * of payments the family chose. Returns the receivable (for the undo).
 */
export async function issueOnAcceptance(c: PoolClient, org: string, userId: string, application: { id: string; profile_id: string; season_id: string; answers?: Record<string, unknown>; form_snapshot?: { fields?: { key: string; maps?: string }[] } }) {
  const club = (await c.query("SELECT dues_auto_plan_id,'dues'=ANY(disabled_modules) AS off FROM organization WHERE id=$1", [org])).rows[0] as { dues_auto_plan_id: string | null; off: boolean } | undefined;
  const planId = club && !club.off ? club.dues_auto_plan_id : null;
  if (!planId) return null;
  const plan = (await c.query("SELECT p.*,p.first_due::text AS first_due FROM dues_plan p JOIN season se ON se.id=p.season_id WHERE p.id=$1 AND p.organization_id=$2 AND NOT p.archived AND NOT se.archived", [planId, org]))
    .rows[0] as Plan | undefined;
  if (!plan || plan.season_id !== application.season_id) return null;
  const covered = await c.query("SELECT 1 FROM dues_receivable WHERE organization_id=$1 AND profile_id=$2 AND season_id=$3 AND lower(trim(category))=lower(trim($4)) AND status='open'", [
    org,
    application.profile_id,
    plan.season_id,
    plan.category,
  ]);
  if (covered.rowCount) return null;
  const s = { c, org, userId };
  const made = await createReceivable(s, plan, application.profile_id, {
    discountCents: 0,
    reason: "",
    installments: chosenInstallments(application) ?? 1,
    firstDue: plan.first_due,
    applicationId: application.id,
  });
  if (plan.sibling_second_percent > 0 || plan.sibling_next_percent > 0) await recomputeSiblings(s, plan.id);
  return made.id;
}
