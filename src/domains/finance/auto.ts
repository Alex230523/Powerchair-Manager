import type { PoolClient } from "pg";

/**
 * 35: an operation the application writes by itself in an organisation's
 * books (a federation's income from a club's payment, its referees'
 * expenses, a club's fine). Written once per cause: a second call adds
 * nothing; an undo cancels it (and a new payment writes it again).
 */
export type AutoEntry = {
  org: string;
  source: "affiliation" | "fine" | "refereeExpense";
  ref: string;
  direction: "in" | "out";
  category: "affiliation" | "competition";
  amountCents: number;
  label: string;
  counterparty: string;
  occurredOn: string;
  by: string;
};
export async function autoEntry(c: PoolClient, e: AutoEntry) {
  if (e.amountCents <= 0) return null;
  const r = await c.query(
    `INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by,auto_source,auto_ref)
     VALUES($1,$2,$3,$4,$5,$6,'transfer',$7,'','',$8,$9,$10)
     ON CONFLICT (organization_id,auto_source,auto_ref) WHERE auto_source IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL DO NOTHING RETURNING id`,
    [e.org, e.occurredOn, e.label.slice(0, 160), e.direction, e.category, e.amountCents, e.counterparty.slice(0, 160), e.by, e.source, e.ref],
  );
  return (r.rows[0]?.id as string | undefined) ?? null;
}
export async function cancelAuto(c: PoolClient, org: string, source: AutoEntry["source"], ref: string, by: string, reason: string) {
  await c.query(
    "UPDATE finance_transaction SET cancelled_at=now(),cancelled_by=$4,cancel_reason=$5 WHERE organization_id=$1 AND auto_source=$2 AND auto_ref=$3 AND cancelled_at IS NULL AND deleted_at IS NULL",
    [org, source, ref, by, reason],
  );
}
