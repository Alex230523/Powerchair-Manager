"use client";
import Link from "next/link";
import { useScope } from "./use-scope";
import type { Locale } from "@/lib/locale";
import { financeNavCopy, financeSections, incomeSections, type FinanceSection, type IncomeSection } from "./finance-nav-copy";
export { financeSections, type FinanceSection };

/**
 * Wave 17 (N1): the tabs of the « Finances » page, each with its own address,
 * in a logical order; « Rentrées » has its own small row (dues, sponsors,
 * grants, fundraising). Financial settings stay in Settings > Finances.
 */
const href: Record<FinanceSection, string> = {
  overview: "/funding",
  operations: "/funding/operations",
  budget: "/funding/budget",
  income: "/funding/grants-sponsors",
  affiliations: "/funding/affiliations",
  statements: "/funding/statements",
  accounts: "/funding/annual-accounts",
  tax: "/funding/tax",
};
const incomeHref: Record<IncomeSection, string> = { dues: "/dues", support: "/funding/grants-sponsors", fundraising: "/fundraising" };

export function FinanceNav({ locale, current, income }: { locale: Locale; current: FinanceSection; income?: IncomeSection }) {
  const t = financeNavCopy[locale];
  // B8: nothing about tax receipts for a club that is not approved.
  const { taxApproved } = useScope();
  const sections = financeSections.filter((s) => s !== "tax" || taxApproved || current === "tax");
  return (
    <>
      <nav className="finance-nav" aria-label={t.label}>
        <ul>
          {sections.map((s) => (
            <li key={s}>
              <Link href={`/${locale}${href[s]}`} aria-current={s === current ? "page" : undefined}>
                {t.sections[s]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {current === "income" && (
        <nav className="finance-nav finance-subnav" aria-label={t.income}>
          <ul>
            {incomeSections.map((s) => (
              <li key={s}>
                <Link href={`/${locale}${incomeHref[s]}`} aria-current={s === income ? "page" : undefined}>
                  {t.incomes[s]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
