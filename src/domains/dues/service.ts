import { installmentsFrom } from "../registrations/schema";
import { duesState, settle } from "./schema";
import type { Pool, PoolClient } from "pg";
import {
  active,
  account,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { ownProfiles, today, type Actor } from "../calendar/access";
import {
  commandSchema,
  schedule,
  siblingDiscount,
  siblingRanks,
  type Command,
} from "./schema";
export { commandSchema };
type Scope = {
  c: PoolClient;
  p: Principal;
  a: Actor;
  manage: boolean;
  /** Sees every debt without changing anything (dues.read). */
  readAll: boolean;
};
async function scope<T>(
  db: Pool,
  p: Principal,
  fn: (s: Scope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const initial = await active(c, p);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      initial.organization_id,
    ]);
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const a = {
      ...(await active(c, p)),
      twoFactorEnabled: !!(await account(c, p)).twoFactorEnabled,
    };
    if (
      a.organization_id !== initial.organization_id ||
      (expected && expected !== a.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const out = await fn({
      c,
      p,
      a,
      manage:
        mfaSatisfied(a.twoFactorEnabled) &&
        permissions(a.role, a.grants).includes("dues.manage"),
      readAll:
        mfaSatisfied(a.twoFactorEnabled) &&
        permissions(a.role, a.grants).some(
          (g) => g === "dues.manage" || g === "dues.read",
        ),
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}
async function log(
  s: Scope,
  action: string,
  planId: string,
  receivableId: string | null,
  before: unknown,
  after: unknown,
  reason = "",
) {
  await s.c.query(
    "INSERT INTO dues_history(organization_id,plan_id,receivable_id,actor_id,action,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      s.a.organization_id,
      planId,
      receivableId,
      s.p.userId,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
    ],
  );
  await audit(
    s.c,
    s.a.organization_id,
    s.p.userId,
    "dues." + action,
    receivableId ?? planId,
  );
}
/**
 * Applies the sibling rule of a plan to its open dues. Dues with a payment, or
 * with a discount set by hand, are left as they are.
 */
async function recomputeSiblings(s: Scope, planId: string) {
  const plan = (await s.c.query("SELECT *,first_due::text AS first_due FROM dues_plan WHERE id=$1", [planId])).rows[0];
  if (!plan) return;
  const open = (
    await s.c.query(
      `SELECT d.id,d.profile_id,d.discount_cents,d.sibling_rank,d.gross_cents,cp.birth_date::text AS birth_date,cp.full_name,
              (SELECT count(*) FROM dues_installment i WHERE i.receivable_id=d.id)::int AS n,
              (SELECT min(due_on)::text FROM dues_installment i WHERE i.receivable_id=d.id) AS first_due,
              EXISTS(SELECT 1 FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL) AS paid
         FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id
        WHERE d.plan_id=$1 AND d.status='open'`,
      [planId],
    )
  ).rows;
  if (!open.length) return;
  const links = (
    await s.c.query(
      "SELECT subject_profile_id,guardian_profile_id FROM guardian_relationship WHERE organization_id=$1 AND revoked_at IS NULL AND subject_profile_id=ANY($2::uuid[])",
      [plan.organization_id, open.map((r) => r.profile_id)],
    )
  ).rows;
  const guardiansOf = new Map<string, Set<string>>();
  for (const l of links)
    guardiansOf.set(
      l.subject_profile_id,
      new Set([...(guardiansOf.get(l.subject_profile_id) ?? []), l.guardian_profile_id]),
    );
  const ranks = siblingRanks(
    open.map((r) => ({ id: r.profile_id, birth_date: r.birth_date, full_name: r.full_name })),
    guardiansOf,
  );
  for (const r of open) {
    if (r.paid || (r.sibling_rank === null && r.discount_cents > 0)) continue;
    const rank = ranks.get(r.profile_id) ?? 1;
    const discount = siblingDiscount(
      r.gross_cents,
      rank,
      plan.sibling_second_percent,
      plan.sibling_next_percent,
    );
    const newRank = discount > 0 ? rank : null;
    if (discount === r.discount_cents && newRank === r.sibling_rank) continue;
    const after = (
      await s.c.query(
        "UPDATE dues_receivable SET discount_cents=$2,sibling_rank=$3,reason=$4,version=version+1 WHERE id=$1 RETURNING *",
        [r.id, discount, newRank, discount > 0 ? `Réduction fratrie (${rank}e enfant)` : ""],
      )
    ).rows[0];
    await writeSchedule(s, r.id, after.net_cents, Math.max(1, r.n), r.first_due ?? plan.first_due);
    await log(s, "sibling", planId, r.id, { discount_cents: r.discount_cents }, { discount_cents: discount, sibling_rank: newRank });
  }
}
async function writeSchedule(
  s: Scope,
  id: string,
  cents: number,
  count: number,
  first: string,
) {
  const rows = schedule(cents, count, first);
  await s.c.query("DELETE FROM dues_installment WHERE receivable_id=$1", [id]);
  for (const r of rows)
    await s.c.query(
      "INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents) VALUES($1,$2,$3,$4)",
      [id, r.ordinal, r.due_on, r.amount_cents],
    );
  return rows;
}
/**
 * Open receivables of a season with their instalments and payments, for the
 * totals (duesTotals). Shared by the dues page, the dashboard and the sidebar.
 */
export async function duesSeasonRows(c: PoolClient, org: string, seasonId: string | null, profiles: string[] | null = null) {
  const rows = (
    await c.query(
      "SELECT d.id,d.status,d.net_cents,d.profile_id,(SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents FROM dues_receivable d WHERE d.organization_id=$1 AND ($2::uuid IS NULL OR d.season_id=$2) AND ($3::uuid[] IS NULL OR d.profile_id=ANY($3::uuid[]))",
      [org, seasonId, profiles],
    )
  ).rows as { id: string; status: string; net_cents: number; profile_id: string; paid_cents: number; installments: { ordinal: number; due_on: string; amount_cents: number }[] }[];
  if (!rows.length) return rows;
  const installments = (
    await c.query("SELECT receivable_id,ordinal,due_on::text AS due_on,amount_cents FROM dues_installment WHERE receivable_id=ANY($1::uuid[]) ORDER BY ordinal", [rows.map((r) => r.id)])
  ).rows as { receivable_id: string; ordinal: number; due_on: string; amount_cents: number }[];
  for (const r of rows) r.installments = installments.filter((i) => i.receivable_id === r.id);
  return rows;
}
export async function duesView(db: Pool, p: Principal) {
  return scope(db, p, async (s) => {
    const own = s.readAll ? [] : [...(await ownProfiles(s.c, s.a))],
      o = s.a.organization_id;
    const debts = (
      await s.c.query(
        "SELECT d.*,c.full_name,se.name AS season_name,(SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents FROM dues_receivable d JOIN club_person c ON c.id=d.profile_id JOIN season se ON se.id=d.season_id WHERE d.organization_id=$1 AND ($2 OR d.profile_id=ANY($3::uuid[])) ORDER BY se.starts_on DESC,c.full_name",
        [o, s.readAll, own],
      )
    ).rows;
    for (const d of debts) {
      d.installments = (
        await s.c.query(
          "SELECT ordinal,due_on::text,amount_cents FROM dues_installment WHERE receivable_id=$1 ORDER BY ordinal",
          [d.id],
        )
      ).rows;
      d.history = (
        await s.c.query(
          "SELECT action,reason,created_at FROM dues_history WHERE receivable_id=$1 ORDER BY created_at DESC",
          [d.id],
        )
      ).rows;
      // Payments settle the earliest instalments first; the rest is still due.
      d.settled = settle(d.installments, d.paid_cents);
      d.state = duesState(d, d.settled, today());
      d.overdue_cents =
        d.status === "open"
          ? d.settled
              .filter((i: { due_on: string }) => i.due_on < today())
              .reduce(
                (sum: number, i: { left_cents: number }) => sum + i.left_cents,
                0,
              )
          : 0;
      d.payments = (
        await s.c.query(
          "SELECT id,occurred_on::text AS occurred_on,amount_cents,method,reference,cancelled_at FROM finance_transaction WHERE receivable_id=$1 AND direction='in' ORDER BY occurred_on,created_at",
          [d.id],
        )
      ).rows;
    }
    return {
      organizationId: o,
      manage: s.manage,
      readOnly: s.readAll && !s.manage,
      debts,
      plans: s.readAll
        ? (
            await s.c.query(
              "SELECT p.*,p.first_due::text AS first_due,se.name AS season_name,t.name AS team_name,(SELECT count(*)::int FROM dues_receivable d WHERE d.plan_id=p.id AND d.status='open') AS issued_count FROM dues_plan p JOIN season se ON se.id=p.season_id LEFT JOIN team t ON t.id=p.team_id WHERE p.organization_id=$1 ORDER BY p.created_at DESC",
              [o],
            )
          ).rows
        : [],
      seasons: s.manage
        ? (
            await s.c.query(
              "SELECT id,name FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC",
              [o],
            )
          ).rows
        : [],
      // Teams of the open seasons, for a rate by team (wave 12).
      teams: s.manage
        ? ((await s.c.query("SELECT id,name,season_id FROM team WHERE organization_id=$1 AND NOT archived ORDER BY name", [o])).rows as { id: string; name: string; season_id: string }[])
        : [],
      profiles: s.manage
        ? (
            await s.c.query(
              "SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name",
              [o],
            )
          ).rows
        : [],
      followups: s.manage
        ? (
            await s.c.query(
              "SELECT a.id,a.profile_id,a.season_id,a.subject_name,a.answers,a.form_snapshot FROM registration_application a JOIN registration_followup f ON f.application_id=a.id WHERE a.organization_id=$1 AND a.status='accepted' AND f.kind='dues' AND f.state='awaiting_module' ORDER BY a.decided_at",
              [o],
            )
          ).rows.map(({ answers, form_snapshot, ...a }) => {
            // Number of payments the family chose on the registration form, if asked.
            const field = (form_snapshot?.fields ?? []).find(
              (f: { maps?: string }) => f.maps === "installments",
            );
            return {
              ...a,
              installments: field
                ? installmentsFrom(answers?.[field.key])
                : null,
            } as {
              id: string;
              profile_id: string;
              season_id: string;
              subject_name: string;
              installments: number | null;
            };
          })
        : [],
    };
  });
}
export async function duesExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expected: string,
) {
  return scope(
    db,
    p,
    async (s) => {
      const cmd = commandSchema.parse(input),
        o = s.a.organization_id;
      if (!s.manage)
        throw new AccessError(
          mfaSatisfied(s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
        );
      if (cmd.action === "pay") {
        const d = (
          await s.c.query(
            "SELECT d.*,c.full_name FROM dues_receivable d JOIN club_person c ON c.id=d.profile_id WHERE d.id=$1 AND d.organization_id=$2 FOR UPDATE",
            [cmd.id, o],
          )
        ).rows[0];
        if (!d) throw new AccessError("NOT_FOUND", 404);
        if (d.status !== "open") throw new AccessError("INVALID_TRANSITION", 409);
        if (cmd.occurredOn > today()) throw new AccessError("INVALID_DATE", 400);
        const paid = (
          await s.c.query(
            "SELECT COALESCE(sum(amount_cents),0)::int AS n FROM finance_transaction WHERE receivable_id=$1 AND cancelled_at IS NULL AND direction='in'",
            [d.id],
          )
        ).rows[0].n as number;
        if (paid + cmd.amountCents > d.net_cents) throw new AccessError("OVERPAID", 409);
        const row = (
          await s.c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by,receivable_id) VALUES($1,$2,$3,'in','dues',$4,$5,$6,$7,'',$8,$9) RETURNING id",
            [
              o,
              cmd.occurredOn,
              `Cotisation ${d.full_name}`.slice(0, 160),
              cmd.amountCents,
              cmd.method,
              d.full_name,
              cmd.reference,
              p.userId,
              d.id,
            ],
          )
        ).rows[0];
        await log(
          s,
          "payment",
          d.plan_id,
          d.id,
          { paid_cents: paid },
          { paid_cents: paid + cmd.amountCents, transaction: row.id, method: cmd.method },
          `${(cmd.amountCents / 100).toFixed(2)} € · ${cmd.method}`,
        );
        return { id: row.id as string };
      }
      if (cmd.action === "plan") {
        if (
          !(
            await s.c.query(
              "SELECT 1 FROM season WHERE id=$1 AND organization_id=$2 AND NOT archived",
              [cmd.seasonId, o],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        if (cmd.teamId && !(await s.c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2 AND season_id=$3", [cmd.teamId, o, cmd.seasonId])).rowCount)
          throw new AccessError("NOT_FOUND", 404);
        const row = (
          await s.c.query(
            "INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due,team_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [
              o,
              cmd.seasonId,
              cmd.category,
              cmd.amountCents,
              cmd.maxInstallments,
              cmd.firstDue,
              cmd.teamId ?? null,
            ],
          )
        ).rows[0];
        await log(s, "plan", row.id, null, null, row);
        return { id: row.id };
      }
      if (cmd.action === "updatePlan") {
        const issued = (
          await s.c.query(
            "SELECT count(*)::int AS n FROM dues_receivable WHERE plan_id=$1 AND organization_id=$2 AND status='open'",
            [cmd.id, o],
          )
        ).rows[0].n as number;
        if (issued > 0 && !cmd.confirm) throw new AccessError("SEASON_STARTED", 409);
        if (cmd.teamId && !(await s.c.query("SELECT 1 FROM team t JOIN dues_plan p ON p.season_id=t.season_id WHERE t.id=$1 AND t.organization_id=$2 AND p.id=$3", [cmd.teamId, o, cmd.id])).rowCount)
          throw new AccessError("NOT_FOUND", 404);
        const row = (
          await s.c.query(
            "UPDATE dues_plan SET category=$3,amount_cents=$4,max_installments=$5,first_due=$6,team_id=$7,version=version+1 WHERE id=$1 AND organization_id=$2 AND NOT archived RETURNING *",
            [cmd.id, o, cmd.category, cmd.amountCents, cmd.maxInstallments, cmd.firstDue, cmd.teamId ?? null],
          )
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
        await log(s, "updatePlan", row.id, null, null, { ...row, issued });
        return { id: row.id, issued };
      }
      if (cmd.action === "siblingRule") {
        const row = (
          await s.c.query(
            "UPDATE dues_plan SET sibling_second_percent=$3,sibling_next_percent=$4,version=version+1 WHERE id=$1 AND organization_id=$2 AND NOT archived RETURNING *",
            [cmd.planId, o, cmd.secondPercent, cmd.nextPercent],
          )
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
        await log(s, "siblingRule", row.id, null, null, row);
        await recomputeSiblings(s, row.id);
        return { id: row.id };
      }
      if (cmd.action === "archivePlan") {
        const row = (
          await s.c.query(
            "UPDATE dues_plan SET archived=true,version=version+1 WHERE id=$1 AND organization_id=$2 AND NOT archived RETURNING *",
            [cmd.id, o],
          )
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
        await log(s, "archivePlan", row.id, null, null, row);
        return { id: row.id };
      }
      if (cmd.action === "issue") {
        const plan = (
          await s.c.query(
            "SELECT p.*,p.first_due::text FROM dues_plan p JOIN season se ON se.id=p.season_id WHERE p.id=$1 AND p.organization_id=$2 AND NOT p.archived AND NOT se.archived",
            [cmd.planId, o],
          )
        ).rows[0];
        if (
          !plan ||
          !(
            await s.c.query(
              "SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'",
              [cmd.profileId, o],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        if (
          cmd.discountCents > plan.amount_cents ||
          cmd.installments > plan.max_installments ||
          (cmd.discountCents > 0 && cmd.reason.length < 5)
        )
          throw new AccessError("INVALID_INPUT", 400);
        if (
          cmd.applicationId &&
          !(
            await s.c.query(
              "SELECT 1 FROM registration_application a JOIN registration_followup f ON f.application_id=a.id WHERE a.id=$1 AND a.organization_id=$2 AND a.profile_id=$3 AND a.season_id=$4 AND a.status='accepted' AND f.kind='dues' AND f.state='awaiting_module'",
              [cmd.applicationId, o, cmd.profileId, plan.season_id],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        const d = (
          await s.c.query(
            "INSERT INTO dues_receivable(organization_id,profile_id,season_id,plan_id,category,plan_snapshot,gross_cents,discount_cents,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
            [
              o,
              cmd.profileId,
              plan.season_id,
              plan.id,
              plan.category,
              JSON.stringify(plan),
              plan.amount_cents,
              cmd.discountCents,
              cmd.reason,
              p.userId,
            ],
          )
        ).rows[0];
        const installments = await writeSchedule(
          s,
          d.id,
          d.net_cents,
          cmd.installments,
          cmd.firstDue,
        );
        if (cmd.applicationId)
          await s.c.query(
            "UPDATE registration_followup SET state='processed' WHERE application_id=$1 AND kind='dues'",
            [cmd.applicationId],
          );
        await log(
          s,
          "issue",
          plan.id,
          d.id,
          null,
          { ...d, installments },
          cmd.reason,
        );
        // A new child of a family can change everybody's rank in the plan.
        if (plan.sibling_second_percent > 0 || plan.sibling_next_percent > 0)
          await recomputeSiblings(s, plan.id);
        return { id: d.id };
      }
      const d = (
        await s.c.query(
          "SELECT * FROM dues_receivable WHERE id=$1 AND organization_id=$2 AND status='open' FOR UPDATE",
          [cmd.id, o],
        )
      ).rows[0];
      if (!d) throw new AccessError("NOT_FOUND", 404);
      if (d.version !== cmd.version)
        throw new AccessError("STALE_VERSION", 409);
      const before = {
        ...d,
        installments: (
          await s.c.query(
            "SELECT * FROM dues_installment WHERE receivable_id=$1 ORDER BY ordinal",
            [d.id],
          )
        ).rows,
      };
      if (cmd.action === "cancel") {
        await s.c.query(
          "UPDATE dues_receivable SET status='cancelled',cancelled_at=now(),version=version+1 WHERE id=$1",
          [d.id],
        );
        await log(
          s,
          "cancel",
          d.plan_id,
          d.id,
          before,
          { status: "cancelled" },
          cmd.reason,
        );
        // The siblings who remain may move up a rank.
        await recomputeSiblings(s, d.plan_id);
      } else {
        if (cmd.installments > d.plan_snapshot.max_installments)
          throw new AccessError("INVALID_INPUT", 400);
        const installments = await writeSchedule(
          s,
          d.id,
          d.net_cents,
          cmd.installments,
          cmd.firstDue,
        );
        await s.c.query(
          "UPDATE dues_receivable SET version=version+1 WHERE id=$1",
          [d.id],
        );
        await log(
          s,
          "schedule",
          d.plan_id,
          d.id,
          before,
          { installments },
          cmd.reason,
        );
      }
      return { id: d.id };
    },
    expected,
  );
}
