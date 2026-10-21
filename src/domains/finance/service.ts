import type { Pool, PoolClient } from "pg";
import { resolveScope } from "../scope/service";
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
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    // dues.read opens the accounts without changing them (auditor, committee).
    const rights = permissions(a.role, a.grants);
    if (
      !rights.includes("dues.manage") &&
      (write || !rights.includes("dues.read"))
    )
      throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    const out = await fn(
      c,
      a.organization_id,
      p.userId,
      rights.includes("dues.manage"),
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

export async function financeView(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}) {
  return scope(db, p, false, async (c, org, _user, edit, actor) => {
    const today = brusselsToday(),
      season = seasonOf(today);
    // The team chosen in the top bar (wave 12): the ledger, the budget and the figures follow it.
    const teamId = (await resolveScope(c, { organization_id: org, role: actor.role, user_id: p.userId, team_id: actor.team_id }, raw)).teamId;
    const entries = (
      await c.query(
        `SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.notes,t.source,t.cancelled_at,t.cancel_reason,t.receivable_id,t.trip_id,COALESCE(t.team_id,tr.team_id) AS team_id,tm.name AS team_name,tm.color AS team_color,u.name AS author,
                COALESCE((SELECT json_agg(json_build_object('id',r.id,'filename',r.filename) ORDER BY r.uploaded_at) FROM finance_receipt r WHERE r.transaction_id=t.id AND r.removed_at IS NULL),'[]') AS receipts
           FROM finance_transaction t JOIN "user" u ON u.id=t.created_by LEFT JOIN trip tr ON tr.id=t.trip_id LEFT JOIN team tm ON tm.id=COALESCE(t.team_id,tr.team_id)
          WHERE t.organization_id=$1 AND ($2::uuid IS NULL OR COALESCE(t.team_id,tr.team_id)=$2) ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 2000`,
        [org, teamId],
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
      team_id: string | null;
      team_name: string | null;
      team_color: string | null;
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
        "SELECT t.id,t.occurred_on::text,t.label,t.direction,t.category,t.amount_cents,t.method,t.counterparty,t.reference,t.cancelled_at,COALESCE(t.team_id,tr.team_id) AS team_id,tm.name AS team_name,(SELECT count(*)::int FROM finance_receipt r WHERE r.transaction_id=t.id AND r.removed_at IS NULL) AS receipts FROM finance_transaction t LEFT JOIN trip tr ON tr.id=t.trip_id LEFT JOIN team tm ON tm.id=COALESCE(t.team_id,tr.team_id) WHERE t.organization_id=$1 AND t.occurred_on<=$2 ORDER BY t.occurred_on,t.created_at",
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
    const club = (
      await c.query("SELECT name FROM organization WHERE id=$1", [org])
    ).rows[0].name as string;
    return {
      club,
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
