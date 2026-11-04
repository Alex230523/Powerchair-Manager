import type { Pool, PoolClient } from "pg";
import { reservedAt } from "../finance/allocations";
import { mfaSatisfied } from "../../lib/security-policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { moneyRights } from "../access/policy";
import { categories } from "../finance/schema";
import {
  assemblyDeadline,
  controls,
  defaultRubric,
  filingDeadline,
  fiscalYear,
  previousYear,
  statement,
  type AccountsCommand,
  type Category,
  type ManualLine,
  type Rubric,
} from "./schema";

/**
 * Annual accounts (wave 15, C12): money readers see them, money managers
 * complete, verify, approve and file them. Every query is bound to the
 * active club; an approved version is frozen in a snapshot.
 */
type Scope = { c: PoolClient; org: string; userId: string; manage: boolean };
const brusselsToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    // 35: the federation's annual accounts, with its finance competence.
    const money = moneyRights(a);
    if (!money.manage && (write || !money.read)) throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!user.twoFactorEnabled)) throw new AccessError("MFA_REQUIRED");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage: money.manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

type AccountsRecord = {
  id: string;
  year_start: string;
  year_end: string;
  version: number;
  status: "draft" | "verified" | "approved" | "filed";
  manual: ManualLine[];
  commitments: string;
  verified_name: string;
  verified_on: string | null;
  approved_on: string | null;
  filed_on: string | null;
  snapshot: Computed | null;
  previous_id: string | null;
};
const selectRecord =
  "SELECT id,year_start::text,year_end::text,version,status,manual,commitments,verified_name,verified_on::text,approved_on::text,filed_on::text,snapshot,previous_id FROM annual_accounts WHERE organization_id=$1";

async function mappingOf(c: PoolClient, org: string) {
  const rows = (await c.query("SELECT direction,category,rubric FROM accounts_mapping WHERE organization_id=$1", [org])).rows as { direction: "in" | "out"; category: string; rubric: Rubric }[];
  return new Map(rows.map((r) => [`${r.direction}:${r.category}`, r.rubric]));
}

/** Everything the platform knows about one financial year, from the ledger and the modules. */
async function compute(c: PoolClient, org: string, from: string, to: string, manual: ManualLine[]) {
  const lines = (
    await c.query(
      "SELECT direction,category,amount_cents,occurred_on::text FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL AND occurred_on BETWEEN $2 AND $3",
      [org, from, to],
    )
  ).rows as { direction: "in" | "out"; category: string; amount_cents: number; occurred_on: string }[];
  const before = (
    await c.query(
      "SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END),0)::bigint AS n FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL AND occurred_on<$2",
      [org, from],
    )
  ).rows[0].n;
  const opening = Number(before);
  const s = statement(lines, await mappingOf(c, org));
  const closing = opening + s.result;
  // Receivables at the closing: dues issued by then and not paid by then (cancelled later still counts).
  const dues = Number(
    (
      await c.query(
        `SELECT COALESCE(sum(GREATEST(0,d.net_cents-COALESCE((SELECT sum(t.amount_cents) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in' AND t.occurred_on<=$2),0))),0)::bigint AS n
           FROM dues_receivable d WHERE d.organization_id=$1 AND d.created_at::date<=$2 AND (d.status='open' OR d.cancelled_at::date>$2)`,
        [org, to],
      )
    ).rows[0].n,
  );
  const grants = Number(
    (
      await c.query(
        "SELECT COALESCE(sum(granted_cents),0)::bigint AS n FROM grant_application WHERE organization_id=$1 AND status IN ('granted','paid') AND decision_on<=$2 AND (paid_on IS NULL OR paid_on>$2)",
        [org, to],
      )
    ).rows[0].n,
  );
  const equipment = Number(
    (
      await c.query(
        "SELECT COALESCE(sum(purchase_value_cents),0)::bigint AS n FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND purchase_value_cents IS NOT NULL AND (acquired_on IS NULL OR acquired_on<=$2)",
        [org, to],
      )
    ).rows[0].n,
  );
  const today = brusselsToday();
  const assets = { treasury: closing, dues, grants, equipment, manual: manual.filter((m) => m.side === "asset").reduce((a, m) => a + m.cents, 0) };
  const debts = { manual: manual.filter((m) => m.side === "debt").reduce((a, m) => a + m.cents, 0) };
  return {
    from,
    to,
    statement: s,
    opening,
    closing,
    assets,
    debts,
    totalAssets: assets.treasury + assets.dues + assets.grants + assets.equipment + assets.manual,
    totalDebts: debts.manual,
    lineCount: lines.length,
    outside: lines.filter((l) => l.occurred_on > today).length,
    uncategorised: lines.filter((l) => l.category === "other").length,
  };
}
type Computed = Awaited<ReturnType<typeof compute>> & { manual?: ManualLine[]; commitments?: string };

async function live(c: PoolClient, org: string, from: string) {
  return ((await c.query(selectRecord + " AND year_start=$2 AND superseded_at IS NULL", [org, from])).rows[0] ?? null) as AccountsRecord | null;
}
async function fiscalStart(c: PoolClient, org: string) {
  return (await c.query("SELECT fiscal_year_start FROM organization WHERE id=$1", [org])).rows[0].fiscal_year_start as string;
}

/** The accounts of one financial year (the last closed one by default), with the year before beside it. */
export async function accountsView(db: Pool, p: Principal, yearStart?: string) {
  return scope(db, p, false, async (s) => {
    const start = await fiscalStart(s.c, s.org);
    const today = brusselsToday();
    const current = fiscalYear(start, today);
    const year = yearStart && /^\d{4}-\d{2}-\d{2}$/.test(yearStart) ? fiscalYear(start, yearStart) : previousYear(start, current.from);
    const before = previousYear(start, year.from);
    const record = await live(s.c, s.org, year.from);
    const frozen = record && (record.status === "approved" || record.status === "filed") && record.snapshot;
    const figures: Computed = frozen ? (record.snapshot as Computed) : await compute(s.c, s.org, year.from, year.to, record?.manual ?? []);
    const prevRecord = await live(s.c, s.org, before.from);
    const previous: Computed = prevRecord?.snapshot ? (prevRecord.snapshot as Computed) : await compute(s.c, s.org, before.from, before.to, prevRecord?.manual ?? []);
    const previousClosing = prevRecord?.snapshot ? (prevRecord.snapshot as Computed).closing : null;
    const first = (await s.c.query("SELECT min(occurred_on)::text AS d FROM finance_transaction WHERE organization_id=$1", [s.org])).rows[0].d as string | null;
    const years: { from: string; to: string; label: string }[] = [];
    for (let y = fiscalYear(start, first ?? today); y.from <= current.from && years.length < 30; y = fiscalYear(start, new Date(Date.parse(y.to + "T12:00:00Z") + 86400000).toISOString().slice(0, 10))) years.push(y);
    if (!years.some((y) => y.from === year.from)) years.push(year);
    years.sort((a, b) => b.from.localeCompare(a.from));
    const mapping = await mappingOf(s.c, s.org);
    const identity = (
      await s.c.query(
        "SELECT o.name,o.company_number,o.address,extract(epoch FROM l.updated_at)::bigint::text AS logo_version FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id WHERE o.id=$1",
        [s.org],
      )
    ).rows[0];
    // Suggestions for the rights and commitments: chairs on loan, sponsorship running after the closing.
    const loans = (await s.c.query("SELECT name FROM equipment_chair WHERE organization_id=$1 AND ownership='loan' AND status<>'retired' ORDER BY name", [s.org])).rows.map((r) => r.name as string);
    const partners = (
      await s.c.query("SELECT name,ends_on::text AS ends_on,amount_cents FROM partner WHERE organization_id=$1 AND status='active' AND ends_on>$2 ORDER BY ends_on", [s.org, year.to])
    ).rows as { name: string; ends_on: string; amount_cents: number }[];
    const versions = (
      await s.c.query(
        "SELECT id,version,status,approved_on::text,filed_on::text,superseded_at::text FROM annual_accounts WHERE organization_id=$1 AND year_start=$2 ORDER BY version DESC",
        [s.org, year.from],
      )
    ).rows;
    return {
      organization_id: s.org,
      can: { manage: s.manage },
      fiscalStart: start,
      today,
      years,
      year,
      previousYear: before,
      record,
      versions,
      figures,
      previous,
      controls: controls({ ...figures.statement, opening: figures.opening, closing: figures.closing, outside: figures.outside, uncategorised: figures.uncategorised, previousClosing }),
      mapping: (["in", "out"] as const).flatMap((direction) =>
        categories.map((category) => ({ direction, category, rubric: mapping.get(`${direction}:${category}`) ?? defaultRubric(direction, category as Category), custom: mapping.has(`${direction}:${category}`) })),
      ),
      suggestions: { loans, partners },
      /** 9: the reserved funds still left at the closing. */
      reserved: await reservedAt(s.c, s.org, year.to),
      deadlines: { assembly: assemblyDeadline(year.to), filing: record?.approved_on ? filingDeadline(record.approved_on) : null },
      club: { name: identity.name as string, company_number: identity.company_number as string, address: identity.address as string, logo_version: identity.logo_version as string | null },
    };
  });
}

export async function accountsExecute(db: Pool, p: Principal, cmd: AccountsCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (cmd.action === "fiscalStart") {
        await s.c.query("UPDATE organization SET fiscal_year_start=$2 WHERE id=$1", [s.org, cmd.start]);
        await audit(s.c, s.org, s.userId, "accounts.fiscalStart", s.org);
        return { id: s.org };
      }
      if (cmd.action === "mapping") {
        if ((cmd.direction === "in") !== ["dues", "gifts", "subsidies", "goods_in", "other_in"].includes(cmd.rubric)) throw new AccessError("INVALID_INPUT", 400);
        await s.c.query(
          "INSERT INTO accounts_mapping(organization_id,direction,category,rubric,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT (organization_id,direction,category) DO UPDATE SET rubric=EXCLUDED.rubric,updated_by=EXCLUDED.updated_by,updated_at=now()",
          [s.org, cmd.direction, cmd.category, cmd.rubric, s.userId],
        );
        await audit(s.c, s.org, s.userId, "accounts.mapping", s.org);
        return { id: s.org };
      }
      const start = await fiscalStart(s.c, s.org);
      const year = fiscalYear(start, cmd.yearStart);
      if (year.from !== cmd.yearStart) throw new AccessError("INVALID_INPUT", 400);
      let r = await live(s.c, s.org, year.from);
      const ensure = async () =>
        r ??
        (r = (
          await s.c.query(
            "INSERT INTO annual_accounts(organization_id,year_start,year_end,created_by) VALUES($1,$2,$3,$4) RETURNING id,year_start::text,year_end::text,version,status,manual,commitments,verified_name,verified_on::text,approved_on::text,filed_on::text,snapshot,previous_id",
            [s.org, year.from, year.to, s.userId],
          )
        ).rows[0] as AccountsRecord);
      const locked = () => new AccessError("ACCOUNTS_LOCKED", 409);
      if (cmd.action === "save") {
        const rec = await ensure();
        if (rec.status !== "draft") throw locked();
        await s.c.query("UPDATE annual_accounts SET manual=$2,commitments=$3,updated_at=now(),row_version=row_version+1 WHERE id=$1", [rec.id, JSON.stringify(cmd.manual), cmd.commitments]);
        await audit(s.c, s.org, s.userId, "accounts.save", rec.id);
        return { id: rec.id };
      }
      if (cmd.action === "verify") {
        const rec = await ensure();
        if (rec.status !== "draft") throw locked();
        await s.c.query("UPDATE annual_accounts SET status='verified',verified_name=$2,verified_on=$3,updated_at=now(),row_version=row_version+1 WHERE id=$1", [rec.id, cmd.name, cmd.on]);
        await audit(s.c, s.org, s.userId, "accounts.verify", rec.id);
        return { id: rec.id };
      }
      if (cmd.action === "approve") {
        if (!r || r.status !== "verified") throw locked();
        if (cmd.on < year.to) throw new AccessError("INVALID_DATE", 400);
        // The approved version is frozen: figures, manual lines and commitments as the assembly saw them.
        const snapshot = { ...(await compute(s.c, s.org, year.from, year.to, r.manual)), manual: r.manual, commitments: r.commitments };
        await s.c.query("UPDATE annual_accounts SET status='approved',approved_on=$2,snapshot=$3,updated_at=now(),row_version=row_version+1 WHERE id=$1", [r.id, cmd.on, JSON.stringify(snapshot)]);
        await audit(s.c, s.org, s.userId, "accounts.approve", r.id);
        return { id: r.id };
      }
      if (cmd.action === "file") {
        if (!r || r.status !== "approved") throw locked();
        if (r.approved_on && cmd.on < r.approved_on) throw new AccessError("INVALID_DATE", 400);
        await s.c.query("UPDATE annual_accounts SET status='filed',filed_on=$2,updated_at=now(),row_version=row_version+1 WHERE id=$1", [r.id, cmd.on]);
        await audit(s.c, s.org, s.userId, "accounts.file", r.id);
        return { id: r.id };
      }
      // reopen: a verified draft goes back to draft; approved accounts get a new version.
      if (!r || r.status === "draft") throw locked();
      if (r.status === "verified") {
        await s.c.query("UPDATE annual_accounts SET status='draft',verified_name='',verified_on=NULL,updated_at=now(),row_version=row_version+1 WHERE id=$1", [r.id]);
        await audit(s.c, s.org, s.userId, "accounts.reopen", r.id);
        return { id: r.id };
      }
      await s.c.query("UPDATE annual_accounts SET superseded_at=now() WHERE id=$1", [r.id]);
      const id = (
        await s.c.query(
          "INSERT INTO annual_accounts(organization_id,year_start,year_end,version,manual,commitments,previous_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
          [s.org, year.from, year.to, r.version + 1, JSON.stringify(r.manual), r.commitments, r.id, s.userId],
        )
      ).rows[0].id as string;
      await audit(s.c, s.org, s.userId, "accounts.correct", id);
      return { id };
    },
    expected,
  );
}

/**
 * 17: the general assembly approved the accounts. Verified accounts become
 * approved (frozen as the assembly saw them); the filing task follows from
 * accountsDeadlines. Returns whether they were approved.
 */
export async function approveAtAssembly(c: PoolClient, org: string, yearStart: string, on: string, userId: string) {
  const start = await fiscalStart(c, org);
  const year = fiscalYear(start, yearStart);
  const r = await live(c, org, year.from);
  if (!r || r.status !== "verified" || on < year.to) return false;
  const snapshot = { ...(await compute(c, org, year.from, year.to, r.manual)), manual: r.manual, commitments: r.commitments };
  await c.query("UPDATE annual_accounts SET status='approved',approved_on=$2,snapshot=$3,updated_at=now(),row_version=row_version+1 WHERE id=$1", [r.id, on, JSON.stringify(snapshot)]);
  await audit(c, org, userId, "accounts.approve", r.id, { by: "assembly" });
  return true;
}

/** The last closed financial year and the date its assembly must be held by. */
export async function lastClosedYear(c: PoolClient, org: string) {
  const start = await fiscalStart(c, org);
  const last = previousYear(start, fiscalYear(start, brusselsToday()).from);
  const r = await live(c, org, last.from);
  return { ...last, deadline: assemblyDeadline(last.to), status: r?.status ?? null };
}

/** The accounts' deadlines for the calendar layer and the home: the assembly, then the filing. */
export async function accountsDeadlines(c: PoolClient, org: string) {
  const start = await fiscalStart(c, org);
  const today = brusselsToday();
  const last = previousYear(start, fiscalYear(start, today).from);
  const r = await live(c, org, last.from);
  if (!r || r.status === "draft" || r.status === "verified") return [{ kind: "accountsAssembly" as const, date: assemblyDeadline(last.to), year: last }];
  if (r.status === "approved" && r.approved_on) return [{ kind: "accountsFiling" as const, date: filingDeadline(r.approved_on), year: last }];
  return [];
}

/** The ledger of a financial year, for the annex of the export. */
export async function accountsLedger(db: Pool, p: Principal, yearStart: string) {
  return scope(db, p, false, async (s) => {
    const start = await fiscalStart(s.c, s.org);
    const year = fiscalYear(start, yearStart);
    const rows = (
      await s.c.query(
        "SELECT occurred_on::text,label,direction,category,amount_cents,counterparty,reference FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL AND occurred_on BETWEEN $2 AND $3 ORDER BY occurred_on,created_at",
        [s.org, year.from, year.to],
      )
    ).rows as { occurred_on: string; label: string; direction: "in" | "out"; category: string; amount_cents: number; counterparty: string; reference: string }[];
    return { year, rows };
  });
}
