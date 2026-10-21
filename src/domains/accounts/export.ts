import { expenseRubrics, incomeRubrics } from "./schema";
import type { accountsView, accountsLedger } from "./service";
import type { AccountsCopy } from "../../components/accounts-copy";

type View = Awaited<ReturnType<typeof accountsView>>;
type Ledger = Awaited<ReturnType<typeof accountsLedger>>;

/** One sheet for the accountant (wave 15, C12): the two statements, the checks, then the ledger as annex. */
export function accountsSheet(v: View, ledger: Ledger, t: AccountsCopy, money: (cents: number) => number = (c) => c / 100) {
  const f = v.figures,
    p = v.previous;
  const rows: unknown[][] = [
    [`${t.title} · ${v.club.name}`],
    [t.companyNumber, v.club.company_number, t.seat, v.club.address],
    [t.year, `${v.year.from} / ${v.year.to}`, t.status, t.statuses[v.record?.status ?? "draft"]],
    [t.banner],
    [],
    [t.statement, v.year.label, v.previousYear.label],
    [t.income],
    ...incomeRubrics.map((r) => [t.rubrics[r], money(f.statement.income[r]), money(p.statement.income[r])]),
    [t.totalIncome, money(f.statement.totalIn), money(p.statement.totalIn)],
    [t.expenses],
    ...expenseRubrics.map((r) => [t.rubrics[r], money(f.statement.expenses[r]), money(p.statement.expenses[r])]),
    [t.totalExpenses, money(f.statement.totalOut), money(p.statement.totalOut)],
    [t.result, money(f.statement.result), money(p.statement.result)],
    [],
    [t.patrimony.replace("{date}", v.year.to), v.year.label, v.previousYear.label],
    [t.assets],
    [t.treasury, money(f.assets.treasury), money(p.assets.treasury)],
    [t.receivableDues, money(f.assets.dues), money(p.assets.dues)],
    [t.receivableGrants, money(f.assets.grants), money(p.assets.grants)],
    [t.equipment, money(f.assets.equipment), money(p.assets.equipment)],
    ...(v.record?.manual ?? []).filter((m) => m.side === "asset").map((m) => [m.label, money(m.cents), "", m.comment]),
    [t.totalAssets, money(f.totalAssets), money(p.totalAssets)],
    [t.debts],
    ...(v.record?.manual ?? []).filter((m) => m.side === "debt").map((m) => [m.label, money(m.cents), "", m.comment]),
    [t.totalDebts, money(f.totalDebts), money(p.totalDebts)],
    [],
    [t.commitments],
    [v.record?.commitments ?? ""],
    [],
    [t.checks],
    ...Object.entries(v.controls).map(([k, state]) => [t.checkNames[k], t.checkStates[state]]),
    [],
    [t.ledger],
    [t.date, t.operation, t.category, t.counterparty, t.amount],
    ...ledger.rows.map((r) => [r.occurred_on, r.label, `${t.direction[r.direction]} · ${r.category}`, r.counterparty, money(r.direction === "in" ? r.amount_cents : -r.amount_cents)]),
  ];
  return rows;
}
