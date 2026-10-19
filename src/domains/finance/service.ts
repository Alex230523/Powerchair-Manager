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
  budgetComparison,
  commandSchema,
  ledgerSummary,
  receiptMaxBytes,
  receiptType,
  seasonBounds,
  seasonOf,
  type BudgetLine,
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
        `SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.notes,t.source,t.cancelled_at,t.cancel_reason,t.receivable_id,u.name AS author,
                COALESCE((SELECT json_agg(json_build_object('id',r.id,'filename',r.filename) ORDER BY r.uploaded_at) FROM finance_receipt r WHERE r.transaction_id=t.id AND r.removed_at IS NULL),'[]') AS receipts
           FROM finance_transaction t JOIN "user" u ON u.id=t.created_by WHERE t.organization_id=$1 ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 2000`,
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
      receivable_id: string | null;
      author: string;
      receipts: { id: string; filename: string }[];
    })[];
    // Dues are scheduled amounts: payments are only reconciled with lot 09.
    const dues = (
      await c.query(
        "SELECT COALESCE(sum(i.amount_cents),0)::int AS total,COALESCE(sum(i.amount_cents) FILTER (WHERE i.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30),0)::int AS next30 FROM dues_installment i JOIN dues_receivable d ON d.id=i.receivable_id WHERE d.organization_id=$1 AND d.status='open' AND i.due_on BETWEEN $2 AND $3",
        [org, season.from, season.to],
      )
    ).rows[0];
    // Open receivables of the season, with what the ledger already recorded as paid.
    const receivables = (
      await c.query(
        `SELECT d.id,cp.full_name,d.category,d.net_cents,
                (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents
           FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id JOIN season s ON s.id=d.season_id
          WHERE d.organization_id=$1 AND d.status='open' AND s.ends_on>=$2::date ORDER BY cp.full_name`,
        [org, season.from],
      )
    ).rows as {
      id: string;
      full_name: string;
      category: string;
      net_cents: number;
      paid_cents: number;
    }[];
    const summary = ledgerSummary(entries, season.from, season.to);
    const budget = await budgetLines(c, org, season.label);
    return {
      organization_id: org,
      today,
      season,
      seasons: seasonsOf(entries, season.label),
      summary,
      dues: {
        season: dues.total as number,
        next30: dues.next30 as number,
        collected: receivables.reduce((n, r) => n + r.paid_cents, 0),
      },
      receivables,
      budget,
      comparison: budgetComparison(budget, summary.byCategory),
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
      if (input.action === "budget") {
        await c.query(
          "DELETE FROM finance_budget WHERE organization_id=$1 AND season=$2",
          [organization, input.season],
        );
        for (const l of input.lines.filter((x) => x.amountCents > 0))
          await c.query(
            "INSERT INTO finance_budget(organization_id,season,direction,category,amount_cents,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,season,direction,category) DO UPDATE SET amount_cents=EXCLUDED.amount_cents,updated_by=EXCLUDED.updated_by,updated_at=now()",
            [
              organization,
              input.season,
              l.direction,
              l.category,
              l.amountCents,
              userId,
            ],
          );
        await audit(c, organization, userId, "finance.budget", organization);
        return { id: organization };
      }
      if (input.action === "removeReceipt") {
        const changed = await c.query(
          "UPDATE finance_receipt SET removed_at=now() WHERE id=$1 AND organization_id=$2 AND removed_at IS NULL RETURNING id",
          [input.id, organization],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(
          c,
          organization,
          userId,
          "finance.receipt.remove",
          input.id,
        );
        return { id: input.id };
      }
      if (input.action === "record") {
        if (input.occurredOn > brusselsToday())
          throw new AccessError("INVALID_DATE", 400);
        if (input.receivableId) {
          // A dues payment: income, dues category, an open receivable of this club.
          if (input.direction !== "in" || input.category !== "dues")
            throw new AccessError("INVALID_INPUT", 400);
          const open = await c.query(
            "SELECT 1 FROM dues_receivable WHERE id=$1 AND organization_id=$2 AND status='open'",
            [input.receivableId, organization],
          );
          if (!open.rowCount) throw new AccessError("NOT_FOUND", 404);
        }
        const row = (
          await c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by,receivable_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
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
              input.receivableId ?? null,
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

async function budgetLines(c: PoolClient, org: string, season: string) {
  return (
    await c.query(
      "SELECT direction,category,amount_cents FROM finance_budget WHERE organization_id=$1 AND season=$2 ORDER BY direction,category",
      [org, season],
    )
  ).rows as BudgetLine[];
}
/** Seasons that have ledger lines, newest first, always including the current one. */
function seasonsOf(entries: { occurred_on: string }[], current: string) {
  return [
    ...new Set([current, ...entries.map((e) => seasonOf(e.occurred_on).label)]),
  ].sort((a, b) => b.localeCompare(a));
}

/** Attaches an invoice or ticket (PDF, PNG, JPEG, WebP, 5 MB) to a ledger line. */
export async function financeReceiptUpload(
  db: Pool,
  p: Principal,
  transactionId: string,
  file: { name: string; bytes: Uint8Array },
  org: string,
) {
  return scope(
    db,
    p,
    true,
    async (c, organization, userId) => {
      const type = receiptType(file.bytes);
      if (!type || file.bytes.length > receiptMaxBytes)
        throw new AccessError("INVALID_FILE", 400);
      const line = await c.query(
        "SELECT 1 FROM finance_transaction WHERE id=$1 AND organization_id=$2",
        [transactionId, organization],
      );
      if (!line.rowCount) throw new AccessError("NOT_FOUND", 404);
      const name =
        file.name
          .replace(/[\\/\u0000-\u001f]/g, "_")
          .trim()
          .slice(0, 200) || "justificatif";
      const id = (
        await c.query(
          "INSERT INTO finance_receipt(organization_id,transaction_id,filename,media_type,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [
            organization,
            transactionId,
            name,
            type,
            Buffer.from(file.bytes),
            userId,
          ],
        )
      ).rows[0].id as string;
      await audit(c, organization, userId, "finance.receipt", id);
      return { id };
    },
    org,
  );
}
export async function financeReceiptFile(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (c, org) => {
    const row = (
      await c.query(
        "SELECT filename,media_type,content FROM finance_receipt WHERE id=$1 AND organization_id=$2 AND removed_at IS NULL",
        [id, org],
      )
    ).rows[0];
    if (!row) throw new AccessError("NOT_FOUND", 404);
    return row as { filename: string; media_type: string; content: Buffer };
  });
}

/**
 * Season report for the general assembly: opening and closing cash, income and
 * expenses per category, budget comparison and every line of the season.
 */
export async function financeReport(db: Pool, p: Principal, label: string) {
  // Without a season in the link, the report covers the current one.
  if (!label) label = seasonOf(brusselsToday()).label;
  if (!/^\d{4}-\d{2}$/.test(label)) throw new AccessError("INVALID_INPUT", 400);
  return scope(db, p, false, async (c, org) => {
    const season = seasonBounds(label);
    const all = (
      await c.query(
        "SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.cancelled_at,(SELECT count(*)::int FROM finance_receipt r WHERE r.transaction_id=t.id AND r.removed_at IS NULL) AS receipts FROM finance_transaction t WHERE t.organization_id=$1 AND t.occurred_on<=$2 ORDER BY t.occurred_on,t.created_at",
        [org, season.to],
      )
    ).rows as (Entry & {
      id: string;
      label: string;
      method: string;
      counterparty: string;
      reference: string;
      receipts: number;
    })[];
    const opening = ledgerSummary(
      all.filter((e) => e.occurred_on < season.from),
      season.from,
      season.to,
    ).balance;
    const summary = ledgerSummary(all, season.from, season.to);
    const budget = await budgetLines(c, org, label);
    const club = (
      await c.query("SELECT name FROM organization WHERE id=$1", [org])
    ).rows[0].name as string;
    return {
      club,
      season,
      generated_on: brusselsToday(),
      opening,
      closing: summary.balance,
      summary,
      comparison: budgetComparison(budget, summary.byCategory),
      entries: all.filter(
        (e) => !e.cancelled_at && e.occurred_on >= season.from,
      ),
    };
  });
}
