import type { PoolClient } from "pg";
import { audit } from "../access/service";
import { schedule, siblingDiscount, siblingRanks } from "./schema";

/** What the dues writing helpers need: a transaction, the club and the person acting. */
export type DuesCtx = { c: PoolClient; org: string; userId: string };

export async function log(
  s: DuesCtx,
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
      s.org,
      planId,
      receivableId,
      s.userId,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
    ],
  );
  await audit(
    s.c,
    s.org,
    s.userId,
    "dues." + action,
    receivableId ?? planId,
  );
}
/**
 * Applies the sibling rule of a plan to its open dues. Dues with a payment, or
 * with a discount set by hand, are left as they are.
 */
export async function recomputeSiblings(s: DuesCtx, planId: string) {
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
export async function writeSchedule(
  s: DuesCtx,
  id: string,
  cents: number,
  count: number,
  first: string,
) {
  const rows = schedule(cents, count, first);
  // B1: an instalment keeps its structured communication when the schedule changes (by its rank).
  const kept = new Map(
    (
      await s.c.query("SELECT ordinal,reference FROM dues_installment WHERE receivable_id=$1", [id])
    ).rows.map((r: { ordinal: number; reference: string }) => [r.ordinal, r.reference]),
  );
  await s.c.query("DELETE FROM dues_installment WHERE receivable_id=$1", [id]);
  for (const r of rows)
    await s.c.query(
      "INSERT INTO dues_installment(receivable_id,ordinal,due_on,amount_cents,reference) VALUES($1,$2,$3,$4,COALESCE($5,payment_reference()))",
      [id, r.ordinal, r.due_on, r.amount_cents, kept.get(r.ordinal) ?? null],
    );
  return rows;
}
