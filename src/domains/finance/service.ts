import type { Pool, PoolClient } from "pg";
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
import {
  commandSchema,
  ledgerSummary,
  seasonOf,
  type Command,
  type Entry,
} from "./schema";
export { commandSchema };

/**
 * Club finances are private to the club and to the people trusted with money:
 * the dues.manage permission (treasurer, president). The federation never sees them.
 */
async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (c: PoolClient, org: string, userId: string) => Promise<T>,
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
    if (!permissions(a.role, a.grants).includes("dues.manage"))
      throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    const out = await fn(c, a.organization_id, p.userId);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function financeView(db: Pool, p: Principal) {
  return scope(db, p, false, async (c, org) => {
    const today = brusselsToday(),
      season = seasonOf(today);
    const entries = (
      await c.query(
        'SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.notes,t.source,t.cancelled_at,t.cancel_reason,u.name AS author FROM finance_transaction t JOIN "user" u ON u.id=t.created_by WHERE t.organization_id=$1 ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 2000',
        [org],
      )
    ).rows as (Entry & {
      id: string;
      label: string;
      method: string;
      counterparty: string;
      reference: string;
      notes: string;
      source: string;
      cancel_reason: string | null;
      author: string;
    })[];
    // Dues are scheduled amounts: payments are only reconciled with lot 09.
    const dues = (
      await c.query(
        "SELECT COALESCE(sum(i.amount_cents),0)::int AS total,COALESCE(sum(i.amount_cents) FILTER (WHERE i.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30),0)::int AS next30 FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND i.due_on BETWEEN $2 AND $3",
        [org, season.from, season.to],
      )
    ).rows[0];
    return {
      organization_id: org,
      today,
      season,
      summary: ledgerSummary(entries, season.from, season.to),
      dues: { season: dues.total as number, next30: dues.next30 as number },
      entries,
    };
  });
}

export async function financeExecute(
  db: Pool,
  p: Principal,
  input: Command,
  org: string,
) {
  return scope(
    db,
    p,
    true,
    async (c, organization, userId) => {
      if (input.action === "record") {
        if (input.occurredOn > brusselsToday())
          throw new AccessError("INVALID_DATE", 400);
        const row = (
          await c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
            [
              organization,
              input.occurredOn,
              input.label,
              input.direction,
              input.category,
              input.amountCents,
              input.method,
              input.counterparty,
              input.reference,
              input.notes,
              userId,
            ],
          )
        ).rows[0];
        await audit(c, organization, userId, "finance.record", row.id);
        return { id: row.id as string };
      }
      const changed = await c.query(
        "UPDATE finance_transaction SET cancelled_at=now(),cancelled_by=$3,cancel_reason=$4 WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL RETURNING id",
        [input.id, organization, userId, input.reason],
      );
      if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
      await audit(c, organization, userId, "finance.cancel", input.id);
      return { id: input.id };
    },
    org,
  );
}
