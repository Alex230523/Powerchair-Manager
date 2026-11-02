import { ensureStorage } from "../storage/service";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { cursorSchema, decodeCursor, PAGE_SIZE, pageOf } from "../../lib/cursor";
import { resolveScope } from "../scope/service";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { moneyRights } from "../access/policy";
import { offerUndo } from "../undo/service";
import { brusselsToday } from "../people/service";
import {
  budgetComparison,
  commandSchema,
  csvClosingBalance,
  statementMaxBytes,
  statementType,
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
  fn: (c: PoolClient, org: string, userId: string, edit: boolean, actor: { role: string; team_id: string | null }) => Promise<T>,
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
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    // dues.read opens the accounts without changing them (auditor, committee); 35: the federation's finance competence.
    const money = moneyRights(a);
    if (!money.manage && (write || !money.read)) throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    const out = await fn(
      c,
      a.organization_id,
      p.userId,
      money.manage,
      { role: a.role, team_id: a.team_id ?? null },
    );
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Where an operation comes from when another page made it. */
const originSql = `CASE WHEN t.receivable_id IS NOT NULL THEN 'dues'
  WHEN EXISTS(SELECT 1 FROM partner pa WHERE pa.payment_transaction_id=t.id) THEN 'sponsor'
  WHEN EXISTS(SELECT 1 FROM affiliation_due ad WHERE ad.transaction_id=t.id) THEN 'affiliation' END`;

export async function financeView(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}) {
  return scope(db, p, false, async (c, org, _user, edit, actor) => {
    const today = brusselsToday(),
      season = seasonOf(today);
    // The team chosen in the top bar (wave 12): the ledger, the budget and the figures follow it.
    const teamId = (await resolveScope(c, { organization_id: org, role: actor.role, user_id: p.userId, team_id: actor.team_id }, raw)).teamId;
    // 13.3: the figures come from every line (a light read), the list from its first page.
    const all = (
      await c.query(
        `SELECT t.occurred_on::text,t.direction,t.category,t.amount_cents,t.cancelled_at FROM finance_transaction t LEFT JOIN trip tr ON tr.id=t.trip_id
          WHERE t.organization_id=$1 AND t.deleted_at IS NULL AND ($2::uuid IS NULL OR COALESCE(t.team_id,tr.team_id)=$2)`,
        [org, teamId],
      )
    ).rows as Entry[];
    const first = await operationsPage(c, org, teamId, {});
    const entries = first.items;
    // Dues are scheduled amounts; what is paid comes from the ledger (by hand or from the bank, B1).
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
    const summary = ledgerSummary(all, season.from, season.to);
    const budget = await budgetLines(c, org, season.label, teamId);
    // Trips a line can be attached to (recent and upcoming).
    const trips = (
      await c.query(
        "SELECT id,title,starts_on::text AS starts_on FROM trip WHERE organization_id=$1 AND status<>'cancelled' AND ends_on>=CURRENT_DATE-180 ORDER BY starts_on DESC LIMIT 50",
        [org],
      )
    ).rows as { id: string; title: string; starts_on: string }[];
    return {
      organization_id: org,
      can_edit: edit,
      trips,
      teams: await teamNames(c, org),
      teamId,
      today,
      season,
      seasons: seasonsOf(all, season.label),
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
      entriesNext: first.next,
    };
  });
}

export type Operation = (Entry & {
      id: string;
      label: string;
      method: string;
      counterparty: string;
      reference: string;
      notes: string;
      source: string;
      cancel_reason: string | null;
      receivable_id: string | null;
      team_id: string | null;
      team_name: string | null;
      team_color: string | null;
      author: string;
      receipts: { id: string; filename: string }[];
      /** Wave 17 (N1): an operation made elsewhere (dues, sponsor, affiliation) is deleted from there. */
      origin: "dues" | "sponsor" | "affiliation" | null;
    });
export const operationsFilter = z.object({
  direction: z.enum(["in", "out"]).optional(),
  category: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  after: cursorSchema,
});
/**
 * 13.3: the ledger, a page at a time (newest first), with the page's filters
 * applied by the server. The export reads every page.
 */
async function operationsPage(c: PoolClient, org: string, teamId: string | null, f: z.infer<typeof operationsFilter>) {
  const after = decodeCursor(f.after, 3);
  const rows = (
    await c.query(
      `SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.notes,t.source,t.cancelled_at,t.cancel_reason,t.receivable_id,t.trip_id,COALESCE(t.team_id,tr.team_id) AS team_id,tm.name AS team_name,tm.color AS team_color,u.name AS author,t.created_at::text AS cursor_at,
              COALESCE((SELECT json_agg(json_build_object('id',r.id,'filename',r.filename) ORDER BY r.uploaded_at) FROM finance_receipt r WHERE r.transaction_id=t.id AND r.removed_at IS NULL),'[]') AS receipts,
              ${originSql} AS origin
         FROM finance_transaction t JOIN "user" u ON u.id=t.created_by LEFT JOIN trip tr ON tr.id=t.trip_id LEFT JOIN team tm ON tm.id=COALESCE(t.team_id,tr.team_id)
        WHERE t.organization_id=$1 AND t.deleted_at IS NULL AND ($2::uuid IS NULL OR COALESCE(t.team_id,tr.team_id)=$2)
          AND ($3::text IS NULL OR t.direction=$3) AND ($4::text IS NULL OR t.category=$4)
          AND ($5::text IS NULL OR concat_ws(' ',t.label,t.counterparty,t.reference) ILIKE '%'||$5||'%')
          AND ($6::date IS NULL OR (t.occurred_on,t.created_at,t.id)<($6::date,$7::timestamptz,$8::uuid))
        ORDER BY t.occurred_on DESC,t.created_at DESC,t.id DESC LIMIT ${PAGE_SIZE + 1}`,
      [org, teamId, f.direction ?? null, f.category || null, f.q?.trim().replace(/[\\%_]/g, (m) => "\\" + m) || null, ...(after ?? [null, null, null])],
    )
  ).rows as (Operation & { cursor_at: string })[];
  // The cursor keeps the time to the microsecond (text), a Date would round it.
  const page = pageOf(rows, PAGE_SIZE, (r) => [r.occurred_on, r.cursor_at, r.id]);
  return { items: page.items.map(({ cursor_at: _c, ...r }) => r as Operation), next: page.next };
}
export async function financeOperations(db: Pool, p: Principal, raw: { season?: string; team?: string }, filter: z.infer<typeof operationsFilter>) {
  return scope(db, p, false, async (c, org, _user, _edit, actor) => {
    const teamId = (await resolveScope(c, { organization_id: org, role: actor.role, user_id: p.userId, team_id: actor.team_id }, raw)).teamId;
    return operationsPage(c, org, teamId, filter);
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
        if (
          input.teamId &&
          !(await c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2", [input.teamId, organization])).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        await c.query(
          "DELETE FROM finance_budget WHERE organization_id=$1 AND season=$2 AND team_id IS NOT DISTINCT FROM $3",
          [organization, input.season, input.teamId ?? null],
        );
        for (const l of input.lines.filter((x) => x.amountCents > 0))
          await c.query(
            "INSERT INTO finance_budget(organization_id,season,direction,category,amount_cents,updated_by,team_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,season,direction,category,team_key) DO UPDATE SET amount_cents=EXCLUDED.amount_cents,updated_by=EXCLUDED.updated_by,updated_at=now()",
            [
              organization,
              input.season,
              l.direction,
              l.category,
              l.amountCents,
              userId,
              input.teamId ?? null,
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
        if (
          input.tripId &&
          !(
            await c.query("SELECT 1 FROM trip WHERE id=$1 AND organization_id=$2", [
              input.tripId,
              organization,
            ])
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        if (
          input.teamId &&
          !(await c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2", [input.teamId, organization])).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        // An expense of a team trip counts for that team unless another team is chosen (wave 15).
        const team =
          input.teamId ??
          (input.tripId ? ((await c.query("SELECT team_id FROM trip WHERE id=$1 AND organization_id=$2", [input.tripId, organization])).rows[0]?.team_id ?? null) : null);
        const row = (
          await c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by,receivable_id,trip_id,team_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
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
              input.tripId ?? null,
              team,
            ],
          )
        ).rows[0];
        await audit(c, organization, userId, "finance.record", row.id);
        return { id: row.id as string };
      }
      if (input.action === "delete") {
        const t = (
          await c.query(`SELECT t.id,t.occurred_on::text AS occurred_on,t.amount_cents,t.direction,t.label,t.cancelled_at,${originSql} AS origin FROM finance_transaction t WHERE t.id=$1 AND t.organization_id=$2 AND t.deleted_at IS NULL FOR UPDATE`, [
            input.id,
            organization,
          ])
        ).rows[0];
        if (!t) throw new AccessError("NOT_FOUND", 404);
        // A dues payment, a sponsor payment or an affiliation is deleted from where it was made.
        if (t.origin) throw new AccessError("LINKED_OPERATION", 409);
        // The accounts approved by the assembly (wave 15, C12) do not change any more.
        if (
          (
            await c.query(
              "SELECT 1 FROM annual_accounts WHERE organization_id=$1 AND superseded_at IS NULL AND status IN ('approved','filed') AND $2::date BETWEEN year_start AND year_end",
              [organization, t.occurred_on],
            )
          ).rowCount
        )
          throw new AccessError("YEAR_APPROVED", 409);
        await c.query(
          "UPDATE finance_transaction SET deleted_at=now(),deleted_by=$3,delete_reason=$4,cancelled_at=COALESCE(cancelled_at,now()),cancelled_by=COALESCE(cancelled_by,$3),cancel_reason=CASE WHEN cancelled_at IS NULL THEN left('Supprimée : '||$4,500) ELSE cancel_reason END WHERE id=$1 AND organization_id=$2",
          [t.id, organization, userId, input.reason],
        );
        await audit(c, organization, userId, "finance.delete", t.id, { amountCents: t.amount_cents, direction: t.direction, label: t.label, occurredOn: t.occurred_on, reason: input.reason });
        return { id: t.id, undo: await offerUndo(c, organization, userId, "operationDelete", t.id, { wasCancelled: !!t.cancelled_at }) };
      }
      const changed = await c.query(
        "UPDATE finance_transaction SET cancelled_at=now(),cancelled_by=$3,cancel_reason=$4 WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL AND deleted_at IS NULL RETURNING id",
        [input.id, organization, userId, input.reason],
      );
      if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
      await audit(c, organization, userId, "finance.cancel", input.id);
      return { id: input.id };
    },
    org,
  );
}

async function budgetLines(c: PoolClient, org: string, season: string, teamId: string | null = null) {
  return (
    await c.query(
      "SELECT direction,category,amount_cents FROM finance_budget WHERE organization_id=$1 AND season=$2 AND team_id IS NOT DISTINCT FROM $3 ORDER BY direction,category",
      [org, season, teamId],
    )
  ).rows as BudgetLine[];
}
async function teamNames(c: PoolClient, org: string) {
  return (await c.query("SELECT id,name,color,season_id FROM team WHERE organization_id=$1 AND NOT archived ORDER BY name", [org])).rows as {
    id: string;
    name: string;
    color: string | null;
    season_id: string;
  }[];
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
      await ensureStorage(c, organization, file.bytes.length);
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
export async function financeReport(db: Pool, p: Principal, label: string, raw: { season?: string; team?: string } = {}) {
  // Without a season in the link, the report covers the current one.
  if (!label) label = seasonOf(brusselsToday()).label;
  if (!/^\d{4}-\d{2}$/.test(label)) throw new AccessError("INVALID_INPUT", 400);
  return scope(db, p, false, async (c, org, _user, _edit, actor) => {
    const season = seasonBounds(label);
    const teamId = (await resolveScope(c, { organization_id: org, role: actor.role, user_id: p.userId, team_id: actor.team_id }, raw)).teamId;
    const everything = (
      await c.query(
        "SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.cancelled_at,COALESCE(t.team_id,tr.team_id) AS team_id,tm.name AS team_name,(SELECT count(*)::int FROM finance_receipt r WHERE r.transaction_id=t.id AND r.removed_at IS NULL) AS receipts FROM finance_transaction t LEFT JOIN trip tr ON tr.id=t.trip_id LEFT JOIN team tm ON tm.id=COALESCE(t.team_id,tr.team_id) WHERE t.organization_id=$1 AND t.deleted_at IS NULL AND t.occurred_on<=$2 ORDER BY t.occurred_on,t.created_at",
        [org, season.to],
      )
    ).rows as (Entry & {
      team_id: string | null;
      team_name: string | null;
      id: string;
      label: string;
      method: string;
      counterparty: string;
      reference: string;
      receipts: number;
    })[];
    const all = teamId ? everything.filter((e) => e.team_id === teamId) : everything;
    const opening = ledgerSummary(
      all.filter((e) => e.occurred_on < season.from),
      season.from,
      season.to,
    ).balance;
    const summary = ledgerSummary(all, season.from, season.to);
    const budget = await budgetLines(c, org, label, teamId);
    // Season totals by team, the whole-club lines (no team) kept apart (wave 12).
    const byTeam = new Map<string, { team_id: string | null; name: string | null; income: number; expenses: number }>();
    for (const e of everything) {
      if (e.cancelled_at || e.occurred_on < season.from || e.occurred_on > season.to) continue;
      const key = e.team_id ?? "";
      const row = byTeam.get(key) ?? { team_id: e.team_id, name: e.team_name, income: 0, expenses: 0 };
      if (e.direction === "in") row.income += e.amount_cents;
      else row.expenses += e.amount_cents;
      byTeam.set(key, row);
    }
    const identity = (
      await c.query(
        "SELECT o.name,o.company_number,o.address,extract(epoch FROM l.updated_at)::bigint::text AS logo_version FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id WHERE o.id=$1",
        [org],
      )
    ).rows[0];
    const club = identity.name as string;
    return {
      club,
      /** For the printed header (wave 15, 2.8): logo, company number and address of the club. */
      organization: { id: org, company_number: (identity.company_number ?? "") as string, address: (identity.address ?? "") as string, logo_version: identity.logo_version as string | null },
      season,
      teamId,
      team: teamId ? ((await c.query("SELECT name FROM team WHERE id=$1", [teamId])).rows[0]?.name as string | undefined) ?? null : null,
      byTeam: [...byTeam.values()].sort((a, b) => (a.team_id === null ? -1 : b.team_id === null ? 1 : (a.name ?? "").localeCompare(b.name ?? ""))),
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

/**
 * Wave 17 (N1): bank statements, filed as proof month by month, with their
 * closing balance (entered, or read from a CSV) beside the platform's cash
 * at the same date. The line-by-line reconciliation is in domains/bank (B1).
 */
export async function statementsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (c, org, _user, edit) => {
    const rows = (
      await c.query(
        `SELECT s.id,s.account,s.month,s.filename,s.media_type,s.closing_balance_cents::int AS closing_balance_cents,s.balance_source,s.uploaded_at,u.name AS author,
                (SELECT COALESCE(sum(CASE WHEN t.direction='in' THEN t.amount_cents ELSE -t.amount_cents END),0)::int FROM finance_transaction t
                  WHERE t.organization_id=s.organization_id AND t.cancelled_at IS NULL AND t.occurred_on<=(to_date(s.month,'YYYY-MM')+interval '1 month'-interval '1 day')::date) AS platform_cents
           FROM bank_statement s JOIN "user" u ON u.id=s.uploaded_by
          WHERE s.organization_id=$1 AND s.removed_at IS NULL ORDER BY s.month DESC,s.uploaded_at DESC`,
        [org],
      )
    ).rows as {
      id: string;
      account: string;
      month: string;
      filename: string;
      media_type: string;
      closing_balance_cents: number | null;
      balance_source: "none" | "entered" | "csv";
      uploaded_at: string;
      author: string;
      platform_cents: number;
    }[];
    return {
      organization_id: org,
      can_edit: edit,
      today: brusselsToday(),
      statements: rows.map((r) => ({ ...r, gap_cents: r.closing_balance_cents === null ? null : r.closing_balance_cents - r.platform_cents })),
    };
  });
}

export async function statementUpload(
  db: Pool,
  p: Principal,
  input: { account: string; month: string; balanceCents: number | null; file: { name: string; bytes: Uint8Array } },
  org: string,
) {
  return scope(
    db,
    p,
    true,
    async (c, organization, userId) => {
      const type = statementType(input.file.bytes, input.file.name);
      if (!type || input.file.bytes.length > statementMaxBytes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new AccessError("INVALID_FILE", 400);
      if (input.month > brusselsToday().slice(0, 7)) throw new AccessError("INVALID_DATE", 400);
      await ensureStorage(c, organization, input.file.bytes.length);
      // The balance entered wins; otherwise the CSV's own.
      const read = type === "text/csv" ? csvClosingBalance(new TextDecoder().decode(input.file.bytes)) : null;
      const balance = input.balanceCents ?? read;
      const name = input.file.name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200) || "releve";
      const id = (
        await c.query(
          "INSERT INTO bank_statement(organization_id,account,month,filename,media_type,content,closing_balance_cents,balance_source,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
          [organization, input.account.trim().slice(0, 80), input.month, name, type, Buffer.from(input.file.bytes), balance, input.balanceCents !== null ? "entered" : read !== null ? "csv" : "none", userId],
        )
      ).rows[0].id as string;
      await audit(c, organization, userId, "finance.statement", id, { month: input.month });
      return { id, balanceCents: balance };
    },
    org,
  );
}

export async function statementRemove(db: Pool, p: Principal, id: string, org: string) {
  return scope(
    db,
    p,
    true,
    async (c, organization, userId) => {
      if (!(await c.query("UPDATE bank_statement SET removed_at=now() WHERE id=$1 AND organization_id=$2 AND removed_at IS NULL", [id, organization])).rowCount)
        throw new AccessError("NOT_FOUND", 404);
      await audit(c, organization, userId, "finance.statement.remove", id);
      return { id };
    },
    org,
  );
}

export async function statementFile(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (c, org) => {
    const row = (await c.query("SELECT filename,media_type,content FROM bank_statement WHERE id=$1 AND organization_id=$2 AND removed_at IS NULL", [id, org])).rows[0];
    if (!row) throw new AccessError("NOT_FOUND", 404);
    return row as { filename: string; media_type: string; content: Buffer };
  });
}
