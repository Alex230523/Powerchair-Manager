import { ensureStorage } from "../storage/service";
import type { Pool, PoolClient } from "pg";
import { randomBytes } from "node:crypto";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { moneyRights, permissions } from "../access/policy";
import { ownProfiles } from "../calendar/access";
import { brusselsToday } from "../people/service";
import { receiptMaxBytes, receiptType } from "../finance/schema";
import { publish } from "../notifications/queue";
import { accountsDeadlines } from "../accounts/service";
import { obligationRows } from "../club/obligations";
import { logInteraction } from "../crm/log";
import {
  conditionTasks,
  examplePackages,
  grantChecklist,
  nextYearDate,
  grantNext,
  partnerNext,
  paymentState,
  type FundingCommand,
  type GrantStatus,
  type TaskStatus,
} from "./schema";

export type Scope = {
  c: PoolClient;
  org: string;
  userId: string;
  /** Money: dues.read sees grants and partners, dues.manage changes them. */
  moneyRead: boolean;
  moneyManage: boolean;
  /** Contact book: staff read it; people or mail managers and the president edit it. */
  contactsRead: boolean;
  contactsManage: boolean;
  /** The actor's own club profiles: a task's person in charge sees and ticks it (wave 15). */
  own: Set<string>;
  federation?: boolean;
};

/** Also the scope of the contact book (A4, crm/service). */
export async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: Scope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [
      a.organization_id,
    ]);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const has = (...r: string[]) => mfa && a.kind === "club" && r.some((x) => rights.includes(x as (typeof rights)[number]));
    const staff = a.kind === "club" && (a.role === "club_president" || a.role === "coach");
    // 35: the federation's grants and sponsors, with its finance competence.
    const money = moneyRights(a);
    const s: Scope = {
      c,
      org: a.organization_id,
      userId: p.userId,
      moneyRead: mfa && money.read,
      moneyManage: mfa && money.manage,
      contactsRead: staff && mfa,
      contactsManage: has("mandates.manage", "people.manage", "notifications.manage"),
      own: mfa ? await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled }) : new Set(),
      federation: a.kind === "federation",
    };
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    if ((e as { code?: string }).code === "23503") throw new AccessError("NOT_FOUND", 404);
    throw e;
  } finally {
    c.release();
  }
}
export async function log(s: Scope, action: string, target: string, details: unknown = {}) {
  await s.c.query(
    "INSERT INTO audit_log(organization_id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
    [s.org, s.userId, action, target, JSON.stringify(details)],
  );
}

export type GrantRow = {
  id: string;
  season_id: string | null;
  season_name: string | null;
  funder: string;
  program: string;
  purpose: string;
  requested_cents: number;
  granted_cents: number | null;
  status: GrantStatus;
  deadline_on: string | null;
  submitted_on: string | null;
  decision_on: string | null;
  paid_on: string | null;
  report_due_on: string | null;
  contact_id: string | null;
  contact_name: string | null;
  notes: string;
  version: number;
  next: ReturnType<typeof grantNext>;
  funder_id: string | null;
  program_url: string;
  conditions: string;
  explanation: string;
  ends_on: string | null;
  recheck_on: string | null;
  previous_id: string | null;
  /** Next year's application already prepared (wave 15). */
  next_id: string | null;
  tasks_done: number;
  tasks_total: number;
  /** A2: the call opens, the period starts, the money received (sum of the instalments). */
  opens_on: string | null;
  starts_on: string | null;
  received_cents: number;
  /** A4: the last exchange with the grant's contact. */
  contact_last_on: string | null;
};
export type FunderRow = {
  id: string;
  name: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  contact_id: string | null;
  contact_name: string | null;
};
export type PartnerRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  amount_cents: number;
  in_kind: string;
  counterpart: string;
  starts_on: string | null;
  ends_on: string | null;
  next_action_on: string | null;
  next_action: string;
  contact_id: string | null;
  contact_name: string | null;
  notes: string;
  version: number;
  next: ReturnType<typeof partnerNext>;
  package_id: string | null;
  package_name: string | null;
  signed_on: string | null;
  payment_due_on: string | null;
  paid_on: string | null;
  renewal_on: string | null;
  payment_transaction_id: string | null;
  report_token: string | null;
  /** A2: the person of the club in charge and the last contact. */
  responsible_id: string | null;
  responsible_name: string | null;
  last_contact_on: string | null;
  package_season_id: string | null;
  payment: ReturnType<typeof paymentState>;
  tasks_done: number;
  tasks_total: number;
  tasks_late: number;
  /** The nearest date among conditions, payment and renewal (wave 15). */
  nearest: { kind: "condition" | "payment" | "renewal" | "action"; date: string } | null;
};
export type PackageRow = {
  id: string;
  season_id: string | null;
  season_name: string | null;
  name: string;
  amount_cents: number;
  description: string;
  places: number | null;
  featured: boolean;
  public_visible: boolean;
  position: number;
  archived: boolean;
  version: number;
  /** Partners currently on this package (not ended). */
  taken: number;
  conditions: { id: string; title: string; description: string; quantity: string; offset_days: number | null; position: number }[];
};
export type TaskRow = {
  id: string;
  partner_id: string | null;
  grant_id: string | null;
  title: string;
  detail: string;
  due_on: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  status: TaskStatus;
  done_on: string | null;
  proof_url: string;
  position: number;
  origin: "condition" | "manual" | "template";
  condition_id: string | null;
  proofs: { id: string; filename: string }[];
  /** 9: a yearly reminder comes back each year. */
  recurrence: string;
  source_kind: string;
};
const selectTasks =
  "SELECT t.id,t.partner_id,t.grant_id,t.title,t.detail,t.due_on::text AS due_on,t.responsible_id,cp.full_name AS responsible_name,t.status,t.recurrence,t.source_kind,t.done_on::text AS done_on,t.proof_url,t.position,t.origin,t.condition_id,COALESCE((SELECT json_agg(json_build_object('id',f.id,'filename',f.filename) ORDER BY f.uploaded_at) FROM task_proof f WHERE f.task_id=t.id AND f.removed_at IS NULL),'[]') AS proofs FROM task t LEFT JOIN club_person cp ON cp.id=t.responsible_id WHERE t.organization_id=$1 AND t.kind IN ('sponsor','grant') AND t.source_key IS NULL";
/** The nearest open date of a partner: a condition to deliver, the payment, the renewal or a planned step. */
export function partnerNearest(
  p: { status: string; paid_on: string | null; payment_due_on: string | null; renewal_on: string | null; next_action_on: string | null },
  tasks: { status: string; due_on: string | null }[],
) {
  if (p.status === "ended") return null;
  const dates: { kind: "condition" | "payment" | "renewal" | "action"; date: string }[] = [
    ...tasks.filter((t) => t.status !== "done" && t.due_on).map((t) => ({ kind: "condition" as const, date: t.due_on as string })),
    ...(p.payment_due_on && !p.paid_on ? [{ kind: "payment" as const, date: p.payment_due_on }] : []),
    ...(p.renewal_on ? [{ kind: "renewal" as const, date: p.renewal_on }] : []),
    ...(p.next_action_on ? [{ kind: "action" as const, date: p.next_action_on }] : []),
  ];
  return dates.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}
const selectGrants =
  "SELECT g.id,g.season_id,se.name AS season_name,g.funder,g.program,g.purpose,g.requested_cents,g.granted_cents,g.status,g.deadline_on::text AS deadline_on,g.submitted_on::text AS submitted_on,g.decision_on::text AS decision_on,g.paid_on::text AS paid_on,g.report_due_on::text AS report_due_on,g.contact_id,c.full_name AS contact_name,g.notes,g.version,g.funder_id,g.program_url,g.conditions,g.explanation,g.ends_on::text AS ends_on,g.recheck_on::text AS recheck_on,g.previous_id,(SELECT n.id FROM grant_application n WHERE n.previous_id=g.id LIMIT 1) AS next_id,g.opens_on::text AS opens_on,g.starts_on::text AS starts_on,(SELECT COALESCE(sum(x.amount_cents),0)::int FROM grant_payment x WHERE x.grant_id=g.id AND x.organization_id=g.organization_id) AS received_cents,(SELECT max(i.happened_on)::text FROM contact_interaction i WHERE i.contact_id=g.contact_id AND i.organization_id=g.organization_id AND i.kind<>'note') AS contact_last_on FROM grant_application g LEFT JOIN season se ON se.id=g.season_id LEFT JOIN contact c ON c.id=g.contact_id WHERE g.organization_id=$1";
const selectPartners =
  "SELECT p.id,p.name,p.kind,p.status,p.amount_cents,p.in_kind,p.counterpart,p.starts_on::text AS starts_on,p.ends_on::text AS ends_on,p.next_action_on::text AS next_action_on,p.next_action,p.contact_id,c.full_name AS contact_name,p.notes,p.version,p.package_id,pk.name AS package_name,p.signed_on::text AS signed_on,p.payment_due_on::text AS payment_due_on,p.paid_on::text AS paid_on,p.renewal_on::text AS renewal_on,p.payment_transaction_id,p.report_token,p.responsible_id,rp.full_name AS responsible_name,p.last_contact_on::text AS last_contact_on,pk.season_id AS package_season_id FROM partner p LEFT JOIN contact c ON c.id=p.contact_id LEFT JOIN partner_package pk ON pk.id=p.package_id LEFT JOIN club_person rp ON rp.id=p.responsible_id AND rp.organization_id=p.organization_id WHERE p.organization_id=$1";

/** Grants and partners together: one page each, one view (the lists are small). */
export async function fundingView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    if (!s.moneyRead) throw new AccessError("FORBIDDEN");
    const today = brusselsToday();
    const tasks = (await s.c.query(selectTasks + " ORDER BY t.position,t.created_at", [s.org])).rows as TaskRow[];
    const grants = (
      await s.c.query(selectGrants + " ORDER BY COALESCE(g.deadline_on,g.report_due_on,g.submitted_on,g.decision_on) NULLS LAST,g.funder", [s.org])
    ).rows.map((g) => {
      const mine = tasks.filter((t) => t.grant_id === g.id);
      return { ...g, next: grantNext(g), tasks_done: mine.filter((t) => t.status === "done").length, tasks_total: mine.length };
    }) as GrantRow[];
    // A2: the instalments received for each grant.
    const payments = (
      await s.c.query("SELECT id,grant_id,received_on::text AS received_on,amount_cents,note FROM grant_payment WHERE organization_id=$1 ORDER BY received_on,created_at", [s.org])
    ).rows as { id: string; grant_id: string; received_on: string; amount_cents: number; note: string }[];
    const funders = (
      await s.c.query(
        "SELECT f.id,f.name,f.website,f.email,f.phone,f.address,f.notes,f.contact_id,c.full_name AS contact_name FROM grant_funder f LEFT JOIN contact c ON c.id=f.contact_id WHERE f.organization_id=$1 ORDER BY f.name",
        [s.org],
      )
    ).rows as FunderRow[];
    // The club's chairs, to say which ones a grant financed (wave 15).
    const chairs = (
      await s.c.query(
        "SELECT id,name,brand,model,serial_number,acquired_on::text AS acquired_on,grant_id,purchase_value_cents FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' ORDER BY name",
        [s.org],
      )
    ).rows as { id: string; name: string; brand: string; model: string; serial_number: string; acquired_on: string | null; grant_id: string | null; purchase_value_cents: number | null }[];
    const partners = (
      await s.c.query(selectPartners + " ORDER BY p.status='ended',p.name", [s.org])
    ).rows.map((r) => {
      const mine = tasks.filter((t) => t.partner_id === r.id);
      return {
        ...r,
        report_token: s.moneyManage ? r.report_token : null,
        next: partnerNext(r),
        payment: paymentState(r, today),
        tasks_done: mine.filter((t) => t.status === "done").length,
        tasks_total: mine.length,
        tasks_late: mine.filter((t) => t.status !== "done" && t.due_on && t.due_on < today).length,
        nearest: partnerNearest(r, mine),
      };
    }) as PartnerRow[];
    const packages = await packageRows(s.c, s.org);
    // People of the club who have an account: they can be put in charge of a task.
    const people = (
      await s.c.query(
        "SELECT c.id,c.full_name FROM club_person c JOIN person pe ON pe.id=c.person_id WHERE c.organization_id=$1 AND c.status='active' AND pe.user_id IS NOT NULL ORDER BY c.full_name",
        [s.org],
      )
    ).rows as { id: string; full_name: string }[];
    // What changed on each partner: the audit lines written by this module.
    const history = (
      await s.c.query(
        "SELECT a.target_id,a.action,a.details,a.created_at::text AS created_at,u.name AS actor FROM audit_log a LEFT JOIN \"user\" u ON u.id=a.actor_id WHERE a.organization_id=$1 AND (a.action LIKE 'partner.%' OR a.action LIKE 'grant.%') ORDER BY a.created_at DESC LIMIT 800",
        [s.org],
      )
    ).rows as { target_id: string; action: string; details: Record<string, unknown>; created_at: string; actor: string | null }[];
    const contacts = s.contactsRead
      ? ((
          await s.c.query(
            "SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY full_name",
            [s.org],
          )
        ).rows as { id: string; full_name: string; organization_name: string }[])
      : [];
    const seasons = (
      await s.c.query("SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC", [s.org])
    ).rows as { id: string; name: string; starts_on: string; ends_on: string }[];
    // Money actually received this season from grants and partners, from the ledger.
    const received = (
      await s.c.query(
        "SELECT category,COALESCE(sum(amount_cents),0)::int AS cents FROM finance_transaction WHERE organization_id=$1 AND direction='in' AND cancelled_at IS NULL AND category IN ('subsidy','sponsor','donation') AND occurred_on>=CURRENT_DATE-interval '365 days' GROUP BY category",
        [s.org],
      )
    ).rows as { category: string; cents: number }[];
    return {
      organization_id: s.org,
      today,
      can: { manage: s.moneyManage, contacts: s.contactsRead, contactsManage: s.contactsManage },
      /** The actor's own club profiles, for "my tasks". */
      own: [...s.own],
      grants,
      /** H13: the impact reports filed with each grant. */
      attachments: (await s.c.query("SELECT id,grant_id,filename,period_from::text AS period_from,period_to::text AS period_to,created_at FROM grant_attachment WHERE organization_id=$1 ORDER BY created_at DESC", [s.org])).rows as { id: string; grant_id: string; filename: string; period_from: string; period_to: string; created_at: string }[],
      payments,
      funders,
      chairs,
      partners,
      packages,
      tasks,
      people,
      history,
      contacts,
      seasons,
      received: Object.fromEntries(received.map((r) => [r.category, r.cents])) as Record<string, number>,
    };
  });
}

export async function fundingExecute(db: Pool, p: Principal, cmd: FundingCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      // The person in charge of a task may tick it without money rights; everything else needs them.
      if (!s.moneyManage && !(cmd.action === "taskDone" && (await responsibleOf(s, cmd.id)))) throw new AccessError("FORBIDDEN");
      const contactOk = async (id: string | null | undefined) => {
        if (!id) return;
        if (!(await s.c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [id, s.org])).rowCount)
          throw new AccessError("NOT_FOUND", 404);
      };
      switch (cmd.action) {
        case "grant": {
          await contactOk(cmd.contactId);
          // The funder: chosen in the list, or found (or created) from the name typed in.
          let funderId = cmd.funderId ?? null;
          if (funderId) {
            const f = (await s.c.query("SELECT name FROM grant_funder WHERE id=$1 AND organization_id=$2", [funderId, s.org])).rows[0];
            if (!f) throw new AccessError("NOT_FOUND", 404);
          } else
            funderId = (
              await s.c.query(
                "INSERT INTO grant_funder(organization_id,name) VALUES($1,$2) ON CONFLICT (organization_id,lower(trim(name))) DO UPDATE SET updated_at=grant_funder.updated_at RETURNING id",
                [s.org, cmd.funder],
              )
            ).rows[0].id as string;
          const funderName = (await s.c.query("SELECT name FROM grant_funder WHERE id=$1", [funderId])).rows[0].name as string;
          await publicTag(s, cmd.contactId ?? null);
          const values = [
            cmd.seasonId ?? null,
            funderName,
            cmd.program,
            cmd.purpose,
            cmd.requestedCents,
            cmd.grantedCents ?? null,
            cmd.status,
            cmd.deadlineOn ?? null,
            cmd.submittedOn ?? null,
            cmd.decisionOn ?? null,
            cmd.paidOn ?? null,
            cmd.reportDueOn ?? null,
            cmd.contactId ?? null,
            cmd.notes,
            funderId,
          ];
          // Wave 15 fields: absent means unchanged on an update, empty on a new file.
          const extra = [cmd.programUrl ?? null, cmd.conditions ?? null, cmd.explanation ?? null, cmd.endsOn === undefined, cmd.endsOn ?? null, cmd.recheckOn === undefined, cmd.recheckOn ?? null];
          // A2: the opening of the call and the start of the period, kept when absent.
          const period = [cmd.opensOn === undefined, cmd.opensOn ?? null, cmd.startsOn === undefined, cmd.startsOn ?? null];
          if (cmd.id) {
            const changed = await s.c.query(
              "UPDATE grant_application SET season_id=$3,funder=$4,program=$5,purpose=$6,requested_cents=$7,granted_cents=$8,status=$9,deadline_on=$10,submitted_on=$11,decision_on=$12,paid_on=$13,report_due_on=$14,contact_id=$15,notes=$16,funder_id=$17,program_url=COALESCE($18,program_url),conditions=COALESCE($19,conditions),explanation=COALESCE($20,explanation),ends_on=CASE WHEN $21 THEN ends_on ELSE $22::date END,recheck_on=CASE WHEN $23 THEN recheck_on ELSE $24::date END,opens_on=CASE WHEN $25 THEN opens_on ELSE $26::date END,starts_on=CASE WHEN $27 THEN starts_on ELSE $28::date END,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
              [cmd.id, s.org, ...values, ...extra, ...period],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await log(s, "grant.update", cmd.id, { status: cmd.status });
            return { id: cmd.id };
          }
          const id = (
            await s.c.query(
              "INSERT INTO grant_application(organization_id,season_id,funder,program,purpose,requested_cents,granted_cents,status,deadline_on,submitted_on,decision_on,paid_on,report_due_on,contact_id,notes,funder_id,program_url,conditions,explanation,ends_on,recheck_on,created_by,opens_on,starts_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,COALESCE($17,''),COALESCE($18,''),COALESCE($19,''),$20,$21,$22,$23,$24) RETURNING id",
              [s.org, ...values, extra[0], extra[1], extra[2], extra[4], extra[6], s.userId, period[1], period[3]],
            )
          ).rows[0].id as string;
          await log(s, "grant.create", id, { funder: funderName });
          return { id };
        }
        case "deleteGrant": {
          // The next year's file and the financed chairs stay; they lose the link only.
          await s.c.query("UPDATE grant_application SET previous_id=NULL WHERE previous_id=$1 AND organization_id=$2", [cmd.id, s.org]);
          await s.c.query("UPDATE equipment_chair SET grant_id=NULL WHERE grant_id=$1 AND organization_id=$2", [cmd.id, s.org]);
          const gone = await s.c.query("DELETE FROM grant_application WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "grant.delete", cmd.id);
          return { id: cmd.id };
        }
        case "partner": {
          let contactId = cmd.contactId ?? null;
          if (cmd.newContact) {
            // A contact written in the same window goes to the contact book, tagged sponsor.
            if (!s.contactsManage) throw new AccessError("FORBIDDEN");
            contactId = (
              await s.c.query(
                "INSERT INTO contact(organization_id,full_name,organization_name,email,phone,tags,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
                [s.org, cmd.newContact.fullName, cmd.newContact.organizationName, cmd.newContact.email, cmd.newContact.phone, [cmd.kind === "sponsor" ? "sponsor" : "donor"], s.userId],
              )
            ).rows[0].id as string;
            await log(s, "contact.create", contactId);
          } else await contactOk(contactId);
          const before = cmd.id
            ? ((await s.c.query("SELECT * ,signed_on::text AS signed_on_text FROM partner WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.id, s.org])).rows[0] as
                | { package_id: string | null; status: string; signed_on_text: string | null; paid_on: string | null; payment_transaction_id: string | null; amount_cents: number; name: string }
                | undefined)
            : undefined;
          if (cmd.id && !before) throw new AccessError("NOT_FOUND", 404);
          const packageId = cmd.packageId === undefined ? (before?.package_id ?? null) : cmd.packageId;
          if (packageId) await packageFree(s, packageId, cmd.id ?? null, cmd.status);
          if (cmd.responsibleId && !(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [cmd.responsibleId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const keep = <T,>(v: T | undefined, old: T | null | undefined) => (v === undefined ? (old ?? null) : v);
          const values = [
            cmd.name,
            cmd.kind,
            cmd.status,
            cmd.amountCents,
            cmd.inKind,
            cmd.counterpart,
            cmd.startsOn ?? null,
            cmd.endsOn ?? null,
            cmd.nextActionOn ?? null,
            cmd.nextAction,
            contactId,
            cmd.notes,
            packageId,
          ];
          let id = cmd.id;
          if (cmd.id) {
            const row = before as unknown as Record<string, string | null>;
            await s.c.query(
              "UPDATE partner SET name=$3,kind=$4,status=$5,amount_cents=$6,in_kind=$7,counterpart=$8,starts_on=$9,ends_on=$10,next_action_on=$11,next_action=$12,contact_id=$13,notes=$14,package_id=$15,signed_on=$16,payment_due_on=$17,paid_on=$18,renewal_on=$19,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
              [
                cmd.id,
                s.org,
                ...values,
                keep(cmd.signedOn, row.signed_on_text),
                keep(cmd.paymentDueOn, (await dateText(s, cmd.id, "payment_due_on")) ?? null),
                keep(cmd.paidOn, (await dateText(s, cmd.id, "paid_on")) ?? null),
                keep(cmd.renewalOn, (await dateText(s, cmd.id, "renewal_on")) ?? null),
              ],
            );
            await log(s, "partner.update", cmd.id, { status: cmd.status });
          } else {
            id = (
              await s.c.query(
                "INSERT INTO partner(organization_id,name,kind,status,amount_cents,in_kind,counterpart,starts_on,ends_on,next_action_on,next_action,contact_id,notes,package_id,signed_on,payment_due_on,paid_on,renewal_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id",
                [s.org, ...values, cmd.signedOn ?? null, cmd.paymentDueOn ?? null, cmd.paidOn ?? null, cmd.renewalOn ?? null, s.userId],
              )
            ).rows[0].id as string;
            await log(s, "partner.create", id, { name: cmd.name });
          }
          const partnerId = id as string;
          // A2: absent keeps the person in charge and the last contact.
          await s.c.query(
            "UPDATE partner SET responsible_id=CASE WHEN $3 THEN responsible_id ELSE $4::uuid END,last_contact_on=CASE WHEN $5 THEN last_contact_on ELSE $6::date END WHERE id=$1 AND organization_id=$2",
            [partnerId, s.org, cmd.responsibleId === undefined, cmd.responsibleId ?? null, cmd.lastContactOn === undefined, cmd.lastContactOn ?? null],
          );
          // A new package: its conditions become tasks; the open tasks of the former package go, the done ones stay.
          if (packageId !== (before?.package_id ?? null)) await switchPackage(s, partnerId, before?.package_id ?? null, packageId);
          else if (before && cmd.signedOn !== undefined && cmd.signedOn !== before.signed_on_text)
            // A new signing date moves the open conditions with it.
            await s.c.query(
              "UPDATE task t SET due_on=CASE WHEN $2::date IS NULL THEN NULL ELSE $2::date+c.offset_days END,updated_at=now() FROM partner_package_condition c WHERE t.partner_id=$1 AND t.condition_id=c.id AND t.status<>'done' AND c.offset_days IS NOT NULL",
              [partnerId, cmd.signedOn],
            );
          // The payment, when marked as received, goes to the ledger once.
          const fresh = (await s.c.query("SELECT paid_on::text AS paid_on,payment_transaction_id,amount_cents,name FROM partner WHERE id=$1", [partnerId])).rows[0];
          if (cmd.recordPayment && fresh.paid_on && !fresh.payment_transaction_id && fresh.amount_cents > 0) {
            const line = (
              await s.c.query(
                "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by) VALUES($1,$2,$3,'in','sponsor',$4,'transfer',$5,'','',$6) RETURNING id",
                [s.org, fresh.paid_on, `${fresh.name}`.slice(0, 160), fresh.amount_cents, fresh.name.slice(0, 160), s.userId],
              )
            ).rows[0].id as string;
            await s.c.query("UPDATE partner SET payment_transaction_id=$2 WHERE id=$1", [partnerId, line]);
            await log(s, "partner.payment", partnerId, { cents: fresh.amount_cents, transaction: line });
          }
          return { id: partnerId };
        }
        case "partnerContacted": {
          const done = await s.c.query("UPDATE partner SET last_contact_on=CURRENT_DATE,updated_at=now() WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "partner.contacted", cmd.id);
          return { id: cmd.id };
        }
        case "grantPayment": {
          const g = (await s.c.query("SELECT status,granted_cents FROM grant_application WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.grantId, s.org])).rows[0] as
            | { status: string; granted_cents: number | null }
            | undefined;
          if (!g) throw new AccessError("NOT_FOUND", 404);
          if (!["granted", "paid", "closed"].includes(g.status)) throw new AccessError("GRANT_NOT_GRANTED", 409);
          const id = (
            await s.c.query("INSERT INTO grant_payment(organization_id,grant_id,received_on,amount_cents,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
              s.org,
              cmd.grantId,
              cmd.receivedOn,
              cmd.amountCents,
              cmd.note,
              s.userId,
            ])
          ).rows[0].id as string;
          // Granted and now fully received: the grant is paid (one grant in two instalments stays one grant).
          const total = (await s.c.query("SELECT sum(amount_cents)::int AS n,max(received_on)::text AS last FROM grant_payment WHERE grant_id=$1", [cmd.grantId])).rows[0] as { n: number; last: string };
          if (g.status === "granted" && g.granted_cents && total.n >= g.granted_cents)
            await s.c.query("UPDATE grant_application SET status='paid',paid_on=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [cmd.grantId, s.org, total.last]);
          await log(s, "grant.payment", cmd.grantId, { cents: cmd.amountCents, on: cmd.receivedOn });
          return { id };
        }
        case "deleteGrantPayment": {
          const gone = (await s.c.query("DELETE FROM grant_payment WHERE id=$1 AND organization_id=$2 RETURNING grant_id,amount_cents", [cmd.id, s.org])).rows[0];
          if (!gone) throw new AccessError("NOT_FOUND", 404);
          await log(s, "grant.paymentDeleted", gone.grant_id, { cents: gone.amount_cents });
          return { id: cmd.id };
        }
        case "deletePartner": {
          const gone = await s.c.query("DELETE FROM partner WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "partner.delete", cmd.id);
          return { id: cmd.id };
        }
        case "funder": {
          await contactOk(cmd.contactId);
          const changed = await s.c.query(
            "UPDATE grant_funder SET name=$3,website=$4,email=$5,phone=$6,address=$7,notes=$8,contact_id=$9,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
            [cmd.id, s.org, cmd.name, cmd.website, cmd.email, cmd.phone, cmd.address, cmd.notes, cmd.contactId],
          );
          if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          await publicTag(s, cmd.contactId);
          // The files keep the funder's name in their text column too (wave 11 lists, exports).
          await s.c.query("UPDATE grant_application SET funder=$3 WHERE funder_id=$1 AND organization_id=$2", [cmd.id, s.org, cmd.name]);
          await log(s, "grant.funder", cmd.id, { name: cmd.name });
          return { id: cmd.id };
        }
        case "grantChecklist": {
          if (!(await s.c.query("SELECT 1 FROM grant_application WHERE id=$1 AND organization_id=$2", [cmd.grantId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const have = new Set((await s.c.query("SELECT lower(title) AS t FROM task WHERE grant_id=$1", [cmd.grantId])).rows.map((r) => r.t as string));
          let position = (await s.c.query("SELECT COALESCE(max(position)+1,0)::int AS n FROM task WHERE grant_id=$1", [cmd.grantId])).rows[0].n as number;
          let added = 0;
          for (const title of grantChecklist[cmd.locale])
            if (!have.has(title.toLowerCase())) {
              await s.c.query(
                "INSERT INTO task(organization_id,grant_id,title,position,origin,created_by,kind) VALUES($1,$2,$3,$4,'template',$5,'grant')",
                [s.org, cmd.grantId, title, position++, s.userId],
              );
              added++;
            }
          await log(s, "grant.checklist", cmd.grantId, { added });
          return { id: cmd.grantId, added };
        }
        case "annualReminder": {
          if (!!cmd.grantId === !!cmd.partnerId) throw new AccessError("INVALID_INPUT", 400);
          const file = cmd.grantId
            ? (await s.c.query("SELECT funder AS name FROM grant_application WHERE id=$1 AND organization_id=$2", [cmd.grantId, s.org])).rows[0]
            : (await s.c.query("SELECT name FROM partner WHERE id=$1 AND organization_id=$2", [cmd.partnerId, s.org])).rows[0];
          if (!file) throw new AccessError("NOT_FOUND", 404);
          if (cmd.responsibleId && !(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.responsibleId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          // One running reminder per file: changed in place, otherwise created.
          const open = (
            await s.c.query("SELECT id FROM task WHERE organization_id=$1 AND source_kind='annualReminder' AND status<>'done' AND (grant_id=$2 OR partner_id=$3) LIMIT 1", [s.org, cmd.grantId, cmd.partnerId])
          ).rows[0];
          const params = JSON.stringify({ about: file.name });
          if (open) {
            await s.c.query("UPDATE task SET title=$3,due_on=$4,responsible_id=$5,source_params=$6::jsonb,updated_at=now() WHERE id=$1 AND organization_id=$2", [open.id, s.org, cmd.title, cmd.dueOn, cmd.responsibleId, params]);
            return { id: open.id as string };
          }
          const id = (
            await s.c.query(
              `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_id,grant_id,partner_id,origin,recurrence,created_by,source_kind,source_params,position)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,'manual','yearly',$9,'annualReminder',$10::jsonb,999) RETURNING id`,
              [s.org, cmd.grantId ? "grant" : "sponsor", cmd.grantId ? (s.federation ? "fed_finance" : "grants") : s.federation ? "fed_finance" : "sponsors", cmd.title, cmd.dueOn, cmd.responsibleId, cmd.grantId, cmd.partnerId, s.userId, params],
            )
          ).rows[0].id as string;
          await log(s, cmd.grantId ? "grant.annualReminder" : "partner.annualReminder", (cmd.grantId ?? cmd.partnerId)!, { dueOn: cmd.dueOn });
          return { id };
        }
        case "nextYear": {
          const g = (
            await s.c.query(
              "SELECT g.*,g.deadline_on::text AS d,g.report_due_on::text AS r,g.ends_on::text AS e,g.recheck_on::text AS c,g.opens_on::text AS o,g.starts_on::text AS st,se.ends_on AS season_end FROM grant_application g LEFT JOIN season se ON se.id=g.season_id WHERE g.id=$1 AND g.organization_id=$2 FOR UPDATE OF g",
              [cmd.grantId, s.org],
            )
          ).rows[0];
          if (!g) throw new AccessError("NOT_FOUND", 404);
          const already = (await s.c.query("SELECT id FROM grant_application WHERE previous_id=$1", [g.id])).rows[0];
          if (already) return { id: already.id as string };
          // The season after this one, when it already exists.
          const season = g.season_end
            ? ((await s.c.query("SELECT id FROM season WHERE organization_id=$1 AND starts_on>$2 ORDER BY starts_on LIMIT 1", [s.org, g.season_end])).rows[0]?.id ?? null)
            : null;
          const id = (
            await s.c.query(
              "INSERT INTO grant_application(organization_id,season_id,funder,program,purpose,requested_cents,status,deadline_on,report_due_on,contact_id,notes,funder_id,program_url,conditions,explanation,ends_on,recheck_on,previous_id,created_by,opens_on,starts_on) VALUES($1,$2,$3,$4,$5,$6,'idea',$7,$8,$9,'',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id",
              [s.org, season, g.funder, g.program, g.purpose, g.requested_cents, nextYearDate(g.d), nextYearDate(g.r), g.contact_id, g.funder_id, g.program_url, g.conditions, g.explanation, nextYearDate(g.e), nextYearDate(g.c), g.id, s.userId, nextYearDate(g.o), nextYearDate(g.st)],
            )
          ).rows[0].id as string;
          // The check-list comes along, unticked, one year later; nobody is in charge yet.
          await s.c.query(
            "INSERT INTO task(organization_id,grant_id,title,detail,due_on,position,origin,created_by,kind) SELECT organization_id,$2,title,detail,CASE WHEN due_on IS NULL THEN NULL ELSE (due_on + interval '1 year')::date END,position,origin,$3,'grant' FROM task WHERE grant_id=$1 ORDER BY position",
            [g.id, id, s.userId],
          );
          await log(s, "grant.nextYear", g.id, { next: id });
          await log(s, "grant.create", id, { funder: g.funder, previous: g.id });
          return { id };
        }
        case "grantChairs": {
          if (!(await s.c.query("SELECT 1 FROM grant_application WHERE id=$1 AND organization_id=$2", [cmd.grantId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const ids = cmd.chairs.map((x) => x.id);
          const found = (await s.c.query("SELECT count(*)::int AS n FROM equipment_chair WHERE organization_id=$1 AND id=ANY($2::uuid[])", [s.org, ids])).rows[0].n;
          if (found !== new Set(ids).size) throw new AccessError("NOT_FOUND", 404);
          await s.c.query("UPDATE equipment_chair SET grant_id=NULL,updated_at=now() WHERE grant_id=$1 AND organization_id=$2 AND NOT (id=ANY($3::uuid[]))", [cmd.grantId, s.org, ids]);
          for (const x of cmd.chairs)
            await s.c.query("UPDATE equipment_chair SET grant_id=$3,purchase_value_cents=$4,updated_at=now() WHERE id=$1 AND organization_id=$2", [x.id, s.org, cmd.grantId, x.purchaseValueCents]);
          await log(s, "grant.chairs", cmd.grantId, { count: ids.length });
          return { id: cmd.grantId };
        }
        case "package": {
          if (cmd.seasonId && !(await s.c.query("SELECT 1 FROM season WHERE id=$1 AND organization_id=$2", [cmd.seasonId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          let id = cmd.id;
          if (id) {
            const changed = await s.c.query(
              "UPDATE partner_package SET season_id=$3,name=$4,amount_cents=$5,description=$6,places=$7,featured=$8,public_visible=COALESCE($9,public_visible),version=version+1 WHERE id=$1 AND organization_id=$2",
              [id, s.org, cmd.seasonId, cmd.name, cmd.amountCents, cmd.description, cmd.places, cmd.featured, cmd.publicVisible ?? null],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          } else {
            const position = (await s.c.query("SELECT COALESCE(max(position)+1,0)::int AS n FROM partner_package WHERE organization_id=$1", [s.org])).rows[0].n;
            id = (
              await s.c.query(
                "INSERT INTO partner_package(organization_id,season_id,name,amount_cents,description,places,featured,public_visible,position,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
                [s.org, cmd.seasonId, cmd.name, cmd.amountCents, cmd.description, cmd.places, cmd.featured, cmd.publicVisible ?? false, position, s.userId],
              )
            ).rows[0].id as string;
          }
          await saveConditions(s, id, cmd.conditions);
          await log(s, "package.save", id, { name: cmd.name });
          return { id };
        }
        case "archivePackage": {
          const changed = await s.c.query("UPDATE partner_package SET archived=$3,version=version+1 WHERE id=$1 AND organization_id=$2", [cmd.id, s.org, cmd.archived]);
          if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "package.archive", cmd.id, { archived: cmd.archived });
          return { id: cmd.id };
        }
        case "duplicatePackage": {
          const from = (await packageRows(s.c, s.org)).find((x) => x.id === cmd.id);
          if (!from) throw new AccessError("NOT_FOUND", 404);
          if (cmd.seasonId && !(await s.c.query("SELECT 1 FROM season WHERE id=$1 AND organization_id=$2", [cmd.seasonId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const id = (
            await s.c.query(
              "INSERT INTO partner_package(organization_id,season_id,name,amount_cents,description,places,featured,position,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
              [s.org, cmd.seasonId, from.name, from.amount_cents, from.description, from.places, from.featured, from.position, s.userId],
            )
          ).rows[0].id as string;
          await saveConditions(
            s,
            id,
            from.conditions.map((c) => ({ title: c.title, description: c.description, quantity: c.quantity, offsetDays: c.offset_days })),
          );
          await log(s, "package.duplicate", id, { from: cmd.id });
          return { id };
        }
        case "importPackages": {
          // The example (Supporter, Coéquipier, Capitaine): a starting point the club changes freely.
          const ids: string[] = [];
          const start = (await s.c.query("SELECT COALESCE(max(position)+1,0)::int AS n FROM partner_package WHERE organization_id=$1", [s.org])).rows[0].n as number;
          for (const [i, x] of examplePackages[cmd.locale].entries()) {
            const id = (
              await s.c.query(
                "INSERT INTO partner_package(organization_id,season_id,name,amount_cents,description,places,featured,position,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
                [s.org, cmd.seasonId, x.name, x.amountCents, x.description, x.places, x.featured, start + i, s.userId],
              )
            ).rows[0].id as string;
            await saveConditions(s, id, x.conditions.map((c) => ({ ...c, description: "" })));
            ids.push(id);
          }
          await log(s, "package.import", ids[0] ?? "", { count: ids.length });
          return { id: ids[0] as string, ids };
        }
        case "task": {
          if (!!cmd.partnerId === !!cmd.grantId) throw new AccessError("INVALID_INPUT", 400);
          if (cmd.partnerId && !(await s.c.query("SELECT 1 FROM partner WHERE id=$1 AND organization_id=$2", [cmd.partnerId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          if (cmd.grantId && !(await s.c.query("SELECT 1 FROM grant_application WHERE id=$1 AND organization_id=$2", [cmd.grantId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          if (cmd.responsibleId && !(await accountHolder(s, cmd.responsibleId))) throw new AccessError("NOT_FOUND", 404);
          if (cmd.id) {
            const changed = await s.c.query(
              "UPDATE task SET title=$3,detail=$4,due_on=$5,responsible_id=$6,proof_url=COALESCE($7,proof_url),updated_at=now() WHERE id=$1 AND organization_id=$2 AND (partner_id=$8 OR grant_id=$9) RETURNING id",
              [cmd.id, s.org, cmd.title, cmd.detail, cmd.dueOn ?? null, cmd.responsibleId ?? null, cmd.proofUrl ?? null, cmd.partnerId ?? null, cmd.grantId ?? null],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await logTask(s, cmd.id, "task.update", { title: cmd.title });
            return { id: cmd.id };
          }
          const position = (
            await s.c.query("SELECT COALESCE(max(position)+1,0)::int AS n FROM task WHERE partner_id IS NOT DISTINCT FROM $1 AND grant_id IS NOT DISTINCT FROM $2", [cmd.partnerId ?? null, cmd.grantId ?? null])
          ).rows[0].n;
          const id = (
            await s.c.query(
              "INSERT INTO task(organization_id,partner_id,grant_id,title,detail,due_on,responsible_id,proof_url,position,origin,created_by,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10,CASE WHEN $2::uuid IS NOT NULL THEN 'sponsor' ELSE 'grant' END) RETURNING id",
              [s.org, cmd.partnerId ?? null, cmd.grantId ?? null, cmd.title, cmd.detail, cmd.dueOn ?? null, cmd.responsibleId ?? null, cmd.proofUrl ?? "", position, s.userId],
            )
          ).rows[0].id as string;
          await logTask(s, id, "task.create", { title: cmd.title });
          return { id };
        }
        case "taskDone": {
          const changed = await s.c.query(
            "UPDATE task SET status=$3,done_on=CASE WHEN $3='done' THEN COALESCE($4::date,CURRENT_DATE) ELSE NULL END,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id",
            [cmd.id, s.org, cmd.done ? "done" : "todo", cmd.doneOn ?? null],
          );
          if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          await logTask(s, cmd.id, cmd.done ? "task.done" : "task.reopen");
          // 9: a yearly reminder done here comes back next year (once), on the same file.
          if (cmd.done)
            await s.c.query(
              `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_id,grant_id,partner_id,origin,recurrence,created_by,source_kind,source_params,position)
               SELECT o.organization_id,o.kind,o.category,o.title,(o.due_on+interval '1 year')::date,o.responsible_id,o.grant_id,o.partner_id,o.origin,o.recurrence,$3,o.source_kind,o.source_params,o.position
                 FROM task o WHERE o.id=$1 AND o.organization_id=$2 AND o.recurrence='yearly' AND o.source_kind='annualReminder' AND o.due_on IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM task n WHERE n.organization_id=o.organization_id AND n.source_kind='annualReminder' AND n.status<>'done' AND (n.grant_id=o.grant_id OR n.partner_id=o.partner_id))`,
              [cmd.id, s.org, s.userId],
            );
          return { id: cmd.id };
        }
        case "deleteTask": {
          await logTask(s, cmd.id, "task.delete");
          const gone = await s.c.query("DELETE FROM task WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "removeProof": {
          const gone = await s.c.query("UPDATE task_proof SET removed_at=now() WHERE id=$1 AND organization_id=$2 AND removed_at IS NULL RETURNING task_id", [cmd.id, s.org]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          await logTask(s, gone.rows[0].task_id, "task.proofRemoved");
          return { id: cmd.id };
        }
        case "partnerReport": {
          // The public report (no account) shows the delivered conditions and their proofs.
          const token = cmd.public ? randomBytes(18).toString("base64url") : null;
          const changed = await s.c.query("UPDATE partner SET report_token=$3 WHERE id=$1 AND organization_id=$2", [cmd.partnerId, s.org, token]);
          if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "partner.report", cmd.partnerId, { public: cmd.public });
          // A4: the report shared with the sponsor goes to its contact's exchange log.
          const contact = (await s.c.query("SELECT contact_id FROM partner WHERE id=$1", [cmd.partnerId])).rows[0]?.contact_id as string | null;
          if (contact && cmd.public) await logInteraction(s.c, { org: s.org, contactId: contact, kind: "sent", summary: "Rapport partenaire partagé", authorId: s.userId, source: "partner_report" });
          return { id: cmd.partnerId, token };
        }
      }
    },
    expected,
  );
}

/** Packages with their conditions and how many partners hold each one. */
async function packageRows(c: PoolClient, org: string) {
  const packages = (
    await c.query(
      "SELECT k.id,k.season_id,se.name AS season_name,k.name,k.amount_cents,k.description,k.places,k.featured,k.public_visible,k.position,k.archived,k.version,(SELECT count(*)::int FROM partner p WHERE p.package_id=k.id AND p.status<>'ended') AS taken FROM partner_package k LEFT JOIN season se ON se.id=k.season_id WHERE k.organization_id=$1 ORDER BY k.archived,k.position,k.name",
      [org],
    )
  ).rows as Omit<PackageRow, "conditions">[];
  const conditions = (
    await c.query("SELECT id,package_id,title,description,quantity,offset_days,position FROM partner_package_condition WHERE organization_id=$1 ORDER BY position", [org])
  ).rows as (PackageRow["conditions"][number] & { package_id: string })[];
  return packages.map((k) => ({ ...k, conditions: conditions.filter((x) => x.package_id === k.id).map(({ package_id: _p, ...x }) => x) })) as PackageRow[];
}
/** Conditions of a package, in the given order: kept ones updated, new ones added, missing ones removed. */
async function saveConditions(
  s: Scope,
  packageId: string,
  list: { id?: string; title: string; description: string; quantity: string; offsetDays: number | null }[],
) {
  const kept = list.map((x) => x.id).filter(Boolean) as string[];
  await s.c.query("DELETE FROM partner_package_condition WHERE package_id=$1 AND organization_id=$2 AND NOT (id=ANY($3::uuid[]))", [packageId, s.org, kept]);
  for (const [position, x] of list.entries()) {
    if (x.id) {
      const changed = await s.c.query(
        "UPDATE partner_package_condition SET title=$3,description=$4,quantity=$5,offset_days=$6,position=$7 WHERE id=$1 AND package_id=$2",
        [x.id, packageId, x.title, x.description, x.quantity, x.offsetDays, position],
      );
      if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
    } else
      await s.c.query(
        "INSERT INTO partner_package_condition(organization_id,package_id,title,description,quantity,offset_days,position) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [s.org, packageId, x.title, x.description, x.quantity, x.offsetDays, position],
      );
  }
}
/** A package of this club with a place left (an ended partner frees its place). */
async function packageFree(s: Scope, packageId: string, partnerId: string | null, status: string) {
  const k = (await s.c.query("SELECT places FROM partner_package WHERE id=$1 AND organization_id=$2 FOR UPDATE", [packageId, s.org])).rows[0];
  if (!k) throw new AccessError("NOT_FOUND", 404);
  if (k.places === null || status === "ended") return;
  const taken = (
    await s.c.query("SELECT count(*)::int AS n FROM partner WHERE package_id=$1 AND status<>'ended' AND id IS DISTINCT FROM $2", [packageId, partnerId])
  ).rows[0].n as number;
  if (taken >= k.places) throw new AccessError("PACKAGE_FULL", 409);
}
async function dateText(s: Scope, partnerId: string, column: "payment_due_on" | "paid_on" | "renewal_on") {
  return (await s.c.query(`SELECT ${column}::text AS d FROM partner WHERE id=$1`, [partnerId])).rows[0]?.d as string | null | undefined;
}
/** Conditions of the new package become tasks; open tasks of the former package go, done ones stay. */
async function switchPackage(s: Scope, partnerId: string, from: string | null, to: string | null) {
  const p = (await s.c.query("SELECT signed_on::text AS signed_on,amount_cents FROM partner WHERE id=$1", [partnerId])).rows[0] as { signed_on: string | null; amount_cents: number };
  if (from) {
    const old = (await packageRows(s.c, s.org)).find((x) => x.id === from);
    const done = (
      await s.c.query("SELECT count(*) FILTER (WHERE status='done')::int AS done,count(*)::int AS total FROM task WHERE partner_id=$1 AND origin='condition'", [partnerId])
    ).rows[0];
    await s.c.query(
      "DELETE FROM task WHERE partner_id=$1 AND origin='condition' AND status<>'done' AND (condition_id IS NULL OR condition_id IN (SELECT id FROM partner_package_condition WHERE package_id=$2))",
      [partnerId, from],
    );
    // The former package goes to the history: name, season, amount, conditions delivered.
    await log(s, "partner.package", partnerId, { from: old?.name ?? null, season: old?.season_name ?? null, cents: p.amount_cents, delivered: done.done, total: done.total, to: to ? ((await s.c.query("SELECT name FROM partner_package WHERE id=$1", [to])).rows[0]?.name ?? null) : null });
  } else if (to) await log(s, "partner.package", partnerId, { from: null, to: (await s.c.query("SELECT name FROM partner_package WHERE id=$1", [to])).rows[0]?.name ?? null });
  if (!to) return;
  const conditions = (await packageRows(s.c, s.org)).find((x) => x.id === to)?.conditions ?? [];
  const present = new Set(
    (await s.c.query("SELECT condition_id FROM task WHERE partner_id=$1 AND condition_id IS NOT NULL", [partnerId])).rows.map((r) => r.condition_id as string),
  );
  for (const t of conditionTasks(conditions, p.signed_on).filter((t) => !present.has(t.condition_id)))
    await s.c.query(
      "INSERT INTO task(organization_id,partner_id,title,detail,due_on,position,origin,condition_id,created_by,kind) VALUES($1,$2,$3,$4,$5,$6,'condition',$7,$8,'sponsor')",
      [s.org, partnerId, t.title.slice(0, 200), t.detail, t.due_on, t.position, t.condition_id, s.userId],
    );
}
/** A club person with an account, who can be put in charge of a task. */
async function accountHolder(s: Scope, profileId: string) {
  return !!(
    await s.c.query(
      "SELECT 1 FROM club_person c JOIN person pe ON pe.id=c.person_id WHERE c.id=$1 AND c.organization_id=$2 AND c.status='active' AND pe.user_id IS NOT NULL",
      [profileId, s.org],
    )
  ).rowCount;
}
/** The person in charge of a task may tick it (wave 15). */
async function responsibleOf(s: Scope, taskId: string) {
  const r = (await s.c.query("SELECT responsible_id FROM task WHERE id=$1 AND organization_id=$2", [taskId, s.org])).rows[0];
  return !!r?.responsible_id && s.own.has(r.responsible_id);
}
/** A task's change is logged on its partner (or grant), so the history of the file shows it. */
/** A contact linked to a funder or a grant file is a public authority contact (the "Pouvoirs publics" tag). */
async function publicTag(s: Scope, contactId: string | null) {
  if (contactId)
    await s.c.query("UPDATE contact SET tags=array_append(tags,'public'),updated_at=now() WHERE id=$1 AND organization_id=$2 AND NOT ('public'=ANY(tags))", [contactId, s.org]);
}
async function logTask(s: Scope, taskId: string, action: string, details: Record<string, unknown> = {}) {
  const t = (await s.c.query("SELECT partner_id,grant_id,title FROM task WHERE id=$1 AND organization_id=$2", [taskId, s.org])).rows[0];
  if (!t) throw new AccessError("NOT_FOUND", 404);
  await log(s, `${t.partner_id ? "partner" : "grant"}.${action}`, t.partner_id ?? t.grant_id, { title: t.title, task: taskId, ...details });
}

/** Upload a proof file for a task: money managers, or the person in charge. */
export async function taskProofUpload(db: Pool, p: Principal, taskId: string, file: { name: string; bytes: Uint8Array }, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (!s.moneyManage && !(await responsibleOf(s, taskId))) throw new AccessError("FORBIDDEN");
      const type = receiptType(file.bytes);
      if (!type || file.bytes.length > receiptMaxBytes) throw new AccessError("INVALID_FILE", 400);
      await ensureStorage(s.c, s.org, file.bytes.length);
      const name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200) || "preuve";
      const id = (
        await s.c.query(
          "INSERT INTO task_proof(organization_id,task_id,filename,media_type,content,uploaded_by) SELECT $1,id,$3,$4,$5,$6 FROM task WHERE id=$2 AND organization_id=$1 RETURNING id",
          [s.org, taskId, name, type, Buffer.from(file.bytes), s.userId],
        )
      ).rows[0]?.id as string | undefined;
      if (!id) throw new AccessError("NOT_FOUND", 404);
      await logTask(s, taskId, "task.proof", { file: name });
      return { id };
    },
    expected,
  );
}
/** Download a proof: money readers, or the person in charge of the task. */
export async function taskProofFile(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (s) => {
    const row = (
      await s.c.query(
        "SELECT f.filename,f.media_type,f.content,t.responsible_id FROM task_proof f JOIN task t ON t.id=f.task_id WHERE f.id=$1 AND f.organization_id=$2 AND f.removed_at IS NULL",
        [id, s.org],
      )
    ).rows[0];
    if (!row || !(s.moneyRead || (row.responsible_id && s.own.has(row.responsible_id)))) throw new AccessError("NOT_FOUND", 404);
    return row as { filename: string; media_type: string; content: Buffer };
  });
}

/**
 * Tasks of the funding files (wave 15): every open task for money people, or
 * the ones the actor is in charge of. No amount is ever part of a task.
 */
export async function fundingTasksView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const tasks = (
      await s.c.query(
        selectTasks.replace("FROM task t", ",COALESCE(pa.name,g.funder) AS file_name,COALESCE(g.program,'') AS file_detail FROM task t LEFT JOIN partner pa ON pa.id=t.partner_id LEFT JOIN grant_application g ON g.id=t.grant_id") +
          " AND ($2 OR t.responsible_id=ANY($3::uuid[])) ORDER BY t.status,t.due_on NULLS LAST,t.position",
        [s.org, s.moneyRead, [...s.own]],
      )
    ).rows as (TaskRow & { file_name: string; file_detail: string })[];
    return { organization_id: s.org, today: brusselsToday(), can: { all: s.moneyRead, manage: s.moneyManage }, own: [...s.own], tasks };
  });
}

/**
 * Money deadlines for the calendar layer and the home (wave 15): conditions to
 * deliver, partner payments and renewals, grant dates. Computed each time from
 * the files, never copied into the calendar, so they cannot drift.
 */
export type MoneyDeadline = {
  id: string;
  date: string;
  kind: "condition" | "payment" | "renewal" | "grant" | "grantReport" | "grantEnd" | "grantRecheck" | "task" | "accountsAssembly" | "accountsFiling" | "tournamentDay" | "obligation";
  /** "tournament": a match day shown in the calendar (21/10/2026), always on, not part of the money layer. */
  source: "partner" | "grant" | "accounts" | "tournament";
  title: string;
  href: string;
};
export async function moneyDeadlinesIn(c: PoolClient, org: string, from: string, to: string, all: boolean, own: string[]) {
  const out: MoneyDeadline[] = [];
  const tasks = (
    await c.query(
      // 2 (7): a task with an amount is a money deadline too (« Échéances à 30 jours »).
      "SELECT t.id,t.partner_id,t.grant_id,t.title,t.amount_cents,t.due_on::text AS due_on,COALESCE(pa.name,g.funder) AS file FROM task t LEFT JOIN partner pa ON pa.id=t.partner_id LEFT JOIN grant_application g ON g.id=t.grant_id WHERE t.organization_id=$1 AND (t.kind IN ('sponsor','grant') OR (t.amount_cents IS NOT NULL AND t.transaction_id IS NULL AND $4)) AND t.status<>'done' AND t.due_on BETWEEN $2 AND $3 AND ($4 OR t.responsible_id=ANY($5::uuid[]))",
      [org, from, to, all, own],
    )
  ).rows;
  for (const t of tasks)
    out.push({
      id: "task:" + t.id,
      date: t.due_on,
      kind: t.partner_id ? "condition" : "task",
      source: t.partner_id ? "partner" : "grant",
      title: [t.file, t.title, t.amount_cents !== null ? new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" }).format(t.amount_cents / 100) : null].filter(Boolean).join(" · "),
      href: !t.partner_id && !t.grant_id ? `/tasks?task=${t.id}` : all ? (t.partner_id ? `/funding/grants-sponsors?vue=sponsoring&partner=${t.partner_id}` : `/funding/grants-sponsors?vue=subsides&grant=${t.grant_id}`) : "/tasks",
    });
  if (all) {
    for (const p of (
      await c.query(
        "SELECT id,name,payment_due_on::text AS payment_due_on,paid_on,renewal_on::text AS renewal_on FROM partner WHERE organization_id=$1 AND status<>'ended' AND ((payment_due_on BETWEEN $2 AND $3 AND paid_on IS NULL) OR renewal_on BETWEEN $2 AND $3)",
        [org, from, to],
      )
    ).rows) {
      if (p.payment_due_on && !p.paid_on && p.payment_due_on >= from && p.payment_due_on <= to)
        out.push({ id: "payment:" + p.id, date: p.payment_due_on, kind: "payment", source: "partner", title: p.name, href: `/funding/grants-sponsors?vue=sponsoring&partner=${p.id}` });
      if (p.renewal_on && p.renewal_on >= from && p.renewal_on <= to)
        out.push({ id: "renewal:" + p.id, date: p.renewal_on, kind: "renewal", source: "partner", title: p.name, href: `/funding/grants-sponsors?vue=sponsoring&partner=${p.id}` });
    }
    for (const g of (
      await c.query(
        "SELECT id,funder,program,status,deadline_on::text AS deadline_on,report_due_on::text AS report_due_on,ends_on::text AS ends_on,recheck_on::text AS recheck_on FROM grant_application WHERE organization_id=$1 AND (deadline_on BETWEEN $2 AND $3 OR report_due_on BETWEEN $2 AND $3 OR ends_on BETWEEN $2 AND $3 OR recheck_on BETWEEN $2 AND $3)",
        [org, from, to],
      )
    ).rows) {
      const title = g.program ? `${g.funder} · ${g.program}` : g.funder;
      if (g.status === "idea" && g.deadline_on && g.deadline_on >= from && g.deadline_on <= to)
        out.push({ id: "grant:" + g.id, date: g.deadline_on, kind: "grant", source: "grant", title, href: `/funding/grants-sponsors?vue=subsides&grant=${g.id}` });
      if ((g.status === "granted" || g.status === "paid") && g.report_due_on && g.report_due_on >= from && g.report_due_on <= to)
        out.push({ id: "grantReport:" + g.id, date: g.report_due_on, kind: "grantReport", source: "grant", title, href: `/funding/grants-sponsors?vue=subsides&grant=${g.id}` });
      if ((g.status === "granted" || g.status === "paid") && g.ends_on && g.ends_on >= from && g.ends_on <= to)
        out.push({ id: "grantEnd:" + g.id, date: g.ends_on, kind: "grantEnd", source: "grant", title, href: `/funding/grants-sponsors?vue=subsides&grant=${g.id}` });
      if (g.status !== "refused" && g.recheck_on && g.recheck_on >= from && g.recheck_on <= to)
        out.push({ id: "grantRecheck:" + g.id, date: g.recheck_on, kind: "grantRecheck", source: "grant", title, href: `/funding/grants-sponsors?vue=subsides&grant=${g.id}` });
    }
    // Annual accounts (wave 15, C12): the general assembly, then the filing.
    for (const d of await accountsDeadlines(c, org))
      if (d.date >= from && d.date <= to)
        out.push({ id: `${d.kind}:${d.year.from}`, date: d.date, kind: d.kind, source: "accounts", title: d.year.label, href: `/funding/annual-accounts?year=${d.year.from}` });
    // The club's obligations still to do (wave 16, A): affiliations, insurance, assembly…
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++)
      for (const o of await obligationRows(c, org, y))
        if (!o.done_on && o.due_on && o.due_on >= from && o.due_on <= to)
          out.push({ id: "obligation:" + o.id, date: o.due_on, kind: "obligation", source: "accounts", title: o.title, href: "/settings/club#settings-obligations" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
export async function moneyDeadlines(db: Pool, p: Principal, from: string, to: string) {
  return scope(db, p, false, async (s) => {
    // The layer is offered with the money right, or to the person in charge of an open task.
    const mine = !s.moneyRead && !!(await s.c.query("SELECT 1 FROM task WHERE organization_id=$1 AND kind IN ('sponsor','grant') AND status<>'done' AND responsible_id=ANY($2::uuid[]) LIMIT 1", [s.org, [...s.own]])).rowCount;
    return {
      can: { all: s.moneyRead, layer: s.moneyRead || mine },
      items: await moneyDeadlinesIn(s.c, s.org, from, to, s.moneyRead, [...s.own]),
    };
  });
}
/** Open tasks due within some days (overdue included): all of them, or the actor's. */
export async function openTasksCount(c: PoolClient, org: string, kind: "partner" | "grant", days: number, all: boolean, own: string[]) {
  return (
    await c.query(
      `SELECT count(*)::int AS n FROM task WHERE organization_id=$1 AND status<>'done' AND ${kind === "partner" ? "partner_id" : "grant_id"} IS NOT NULL AND due_on<=CURRENT_DATE+$2::int AND ($3 OR responsible_id=ANY($4::uuid[]))`,
      [org, days, all, own],
    )
  ).rows[0].n as number;
}

/** Public report of a partner (no account): delivered conditions and their link proofs, never amounts. */
export async function partnerReport(db: Pool, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new AccessError("NOT_FOUND", 404);
  const p = (
    await db.query(
      "SELECT p.id,p.name,p.organization_id,o.name AS club,extract(epoch FROM l.updated_at)::bigint::text AS logo_version,pk.name AS package_name,se.name AS season_name FROM partner p JOIN organization o ON o.id=p.organization_id LEFT JOIN organization_logo l ON l.organization_id=o.id LEFT JOIN partner_package pk ON pk.id=p.package_id LEFT JOIN season se ON se.id=pk.season_id WHERE p.report_token=$1",
      [token],
    )
  ).rows[0];
  if (!p) throw new AccessError("NOT_FOUND", 404);
  const tasks = (
    await db.query(
      "SELECT t.title,t.status,t.done_on::text AS done_on,t.proof_url,COALESCE((SELECT json_agg(json_build_object('id',f.id,'filename',f.filename)) FROM task_proof f WHERE f.task_id=t.id AND f.removed_at IS NULL),'[]') AS proofs FROM task t WHERE t.partner_id=$1 ORDER BY t.position,t.created_at",
      [p.id],
    )
  ).rows as { title: string; status: string; done_on: string | null; proof_url: string; proofs: { id: string; filename: string }[] }[];
  return {
    club: p.club as string,
    organizationId: p.organization_id as string,
    logoVersion: p.logo_version as string | null,
    partner: p.name as string,
    package: p.package_name as string | null,
    season: p.season_name as string | null,
    tasks,
  };
}
/** A proof file reachable from a public report: only for a task of that partner. */
export async function partnerReportProof(db: Pool, token: string, proofId: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new AccessError("NOT_FOUND", 404);
  const row = (
    await db.query(
      "SELECT f.filename,f.media_type,f.content FROM task_proof f JOIN task t ON t.id=f.task_id JOIN partner p ON p.id=t.partner_id WHERE f.id=$1 AND p.report_token=$2 AND f.removed_at IS NULL AND t.status='done'",
      [proofId, token],
    )
  ).rows[0];
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return row as { filename: string; media_type: string; content: Buffer };
}

/**
 * Daily: the person in charge of a task hears about it 7 days and 1 day before it is due (A1);
 * the money managers of the club hear about a partner renewal on its day.
 * Idempotent: one message per task (or renewal) and per day.
 */
/**
 * B7: the parts run by the automations engine: the renewals and the grants
 * are rules of the catalogue (on, paused or stopped per club); the task
 * reminders stay here. Absent: everything for every club, as before.
 */
export type FundingTickParts = { tasks?: boolean; renewals?: string[]; grants?: string[] };
export async function fundingTaskTick(db: Pool, parts: FundingTickParts = {}) {
  const today = brusselsToday();
  const all = !("tasks" in parts || "renewals" in parts || "grants" in parts);
  const in7 = new Date(today + "T12:00:00Z");
  in7.setUTCDate(in7.getUTCDate() + 7);
  const week = in7.toISOString().slice(0, 10);
  const base = process.env.BETTER_AUTH_URL ?? "";
  let sent = 0;
  // A1: J-7 and J-1, to the profile or the account (federation) in charge.
  const eve = new Date(today + "T12:00:00Z");
  eve.setUTCDate(eve.getUTCDate() + 1);
  const tomorrow = eve.toISOString().slice(0, 10);
  const tasks = !(all || parts.tasks) ? [] : (
    await db.query(
      // 2: each person in charge, once (in « each » mode, not those who did their part).
      `SELECT DISTINCT t.id,t.organization_id,o.name AS club,t.title,t.due_on::text AS due_on,COALESCE(pa.name,g.funder) AS file,u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale
         FROM task t JOIN organization o ON o.id=t.organization_id JOIN task_assignee a ON a.task_id=t.id AND a.done_on IS NULL
         LEFT JOIN club_person cp ON cp.id=a.profile_id AND cp.organization_id=t.organization_id LEFT JOIN person cpe ON cpe.id=cp.person_id
         JOIN "user" u ON u.id=COALESCE(a.user_id,cpe.user_id) LEFT JOIN person pe ON pe.user_id=u.id
         LEFT JOIN partner pa ON pa.id=t.partner_id LEFT JOIN grant_application g ON g.id=t.grant_id
        WHERE t.status<>'done' AND t.due_on IN ($1::date,$2::date) AND u.active AND (t.category NOT IN ('sponsors','grants','fundraising') OR NOT ('finance'=ANY(o.disabled_modules)))`,
      [week, tomorrow],
    )
  ).rows;
  const renewals = (
    await db.query(
      `SELECT p.id,p.organization_id,o.name AS club,p.name AS partner,u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale
         FROM partner p JOIN organization o ON o.id=p.organization_id JOIN role_assignment r ON r.organization_id=p.organization_id AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
         JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE p.status<>'ended' AND p.renewal_on=$1 AND NOT ('finance'=ANY(o.disabled_modules)) AND ($2::uuid[] IS NULL OR p.organization_id=ANY($2::uuid[]))`,
      [today, all ? null : (parts.renewals ?? [])],
    )
  ).rows;
  // The president hears about a grant deadline 30, 7 and 1 days ahead while the file is not filed
  // (wave 15, C2; A2), and about a call that opens today.
  const ahead = (n: number) => {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const marks = [ahead(30), ahead(7), ahead(1)];
  const grants = (
    await db.query(
      `SELECT g.id,g.organization_id,o.name AS club,CASE WHEN g.program<>'' THEN g.funder||' · '||g.program ELSE g.funder END AS what,
              CASE WHEN g.opens_on=$2::date THEN g.opens_on ELSE g.deadline_on END::text AS when,CASE WHEN g.opens_on=$2::date THEN 'open' ELSE 'deadline' END AS reason,
              u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale
         FROM grant_application g JOIN organization o ON o.id=g.organization_id JOIN role_assignment r ON r.organization_id=g.organization_id AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
         JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE g.status='idea' AND (g.deadline_on=ANY($1::date[]) OR g.opens_on=$2::date) AND NOT ('finance'=ANY(o.disabled_modules)) AND ($3::uuid[] IS NULL OR g.organization_id=ANY($3::uuid[]))`,
      [marks, today, all ? null : (parts.grants ?? [])],
    )
  ).rows;
  for (const x of [
    // Wave 17 (O1): every task of the club, not only sponsors and grants (no file name for those).
    ...tasks.map((t) => ({ ...t, key: `funding_task:${t.id}:${t.due_on === tomorrow ? "j1" : "j7"}:${t.due_on}`, what: t.file ? `${t.file} · ${t.title}` : t.title, when: t.due_on, path: `/tasks?task=${t.id}` })),
    ...renewals.map((r) => ({ ...r, key: `funding_renewal:${r.id}:${today}:${r.user_id}`, what: r.partner, when: today, path: `/funding/grants-sponsors?vue=sponsoring&partner=${r.id}` })),
    ...grants.map((g) => ({ ...g, key: `grant_${g.reason}:${g.id}:${g.when}:${g.reason === "open" ? "0" : marks.indexOf(g.when)}:${g.user_id}`, path: `/funding/grants-sponsors?vue=subsides&grant=${g.id}` })),
  ]) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await publish(c, {
        organizationId: x.organization_id,
        userId: x.user_id,
        email: x.email,
        kind: "funding_task",
        category: "administrative",
        resourceType: "funding",
        resourceId: x.id,
        eventKey: x.key,
        locale: x.locale,
        variables: { name: x.name, organization: x.club, url: `${base}/${x.locale}${x.path}`, title: x.what, due: x.when },
      });
      await c.query("COMMIT");
      sent++;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}

/** Dates within the horizon for the home agenda (money managers and readers). */
export async function fundingDeadlines(c: PoolClient, org: string, days: number) {
  const grants = (await c.query(selectGrants + " AND g.status IN ('idea','submitted','granted','paid')", [org])).rows as GrantRow[];
  const partners = (await c.query(selectPartners + " AND p.status<>'ended'", [org])).rows as PartnerRow[];
  const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const out: { kind: "grant" | "partner"; date: string; title: string; href: string; id: string }[] = [];
  for (const g of grants) {
    const n = grantNext(g);
    if (n && n.date <= limit)
      out.push({ kind: "grant", date: n.date, title: `${g.funder}${g.program ? " · " + g.program : ""}`, href: `/funding/grants-sponsors?vue=subsides&grant=${g.id}`, id: "grant:" + g.id });
  }
  for (const p of partners) {
    const n = partnerNext(p);
    if (n && n.date <= limit)
      out.push({ kind: "partner", date: n.date, title: n.kind === "action" && p.next_action ? `${p.name} · ${p.next_action}` : p.name, href: "/funding/grants-sponsors?vue=sponsoring", id: "partner:" + p.id });
  }
  return out;
}

/** Equipment financed by a grant, as rows for a spreadsheet (wave 15, C2): money readers only. */
export async function grantChairsExport(db: Pool, p: Principal, grantId: string, locale: "fr" | "nl" | "en") {
  return scope(db, p, false, async (s) => {
    if (!s.moneyRead) throw new AccessError("FORBIDDEN");
    const g = (await s.c.query("SELECT funder,program FROM grant_application WHERE id=$1 AND organization_id=$2", [grantId, s.org])).rows[0];
    if (!g) throw new AccessError("NOT_FOUND", 404);
    const chairs = (
      await s.c.query(
        "SELECT name,brand,model,serial_number,acquired_on::text AS acquired_on,purchase_value_cents FROM equipment_chair WHERE grant_id=$1 AND organization_id=$2 ORDER BY name",
        [grantId, s.org],
      )
    ).rows as { name: string; brand: string; model: string; serial_number: string; acquired_on: string | null; purchase_value_cents: number | null }[];
    const head = {
      fr: ["Fauteuil", "Marque", "Modèle", "Numéro de série", "Acquis le", "Valeur d'achat (€)"],
      nl: ["Rolstoel", "Merk", "Model", "Serienummer", "Verworven op", "Aankoopwaarde (€)"],
      en: ["Chair", "Brand", "Model", "Serial number", "Acquired on", "Purchase value (€)"],
    }[locale];
    const rows: unknown[][] = [head, ...chairs.map((c) => [c.name, c.brand, c.model, c.serial_number, c.acquired_on ?? "", c.purchase_value_cents === null ? "" : c.purchase_value_cents / 100])];
    const total = chairs.reduce((n, c) => n + (c.purchase_value_cents ?? 0), 0);
    if (chairs.length) rows.push(["", "", "", "", { fr: "Total", nl: "Totaal", en: "Total" }[locale], total / 100]);
    return { rows, name: `${g.funder}${g.program ? " " + g.program : ""}` };
  });
}
