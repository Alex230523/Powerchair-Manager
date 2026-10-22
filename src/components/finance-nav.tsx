import Link from "next/link";
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
  income: "/funding/partners",
  affiliations: "/funding/affiliations",
  statements: "/funding/statements",
  accounts: "/funding/annual-accounts",
};
const incomeHref: Record<IncomeSection, string> = { dues: "/dues", partners: "/funding/partners", grants: "/funding/grants", fundraising: "/fundraising" };

export function FinanceNav({ locale, current, income }: { locale: Locale; current: FinanceSection; income?: IncomeSection }) {
  const t = financeNavCopy[locale];
  return (
    <>
      <nav className="finance-nav" aria-label={t.label}>
        <ul>
          {financeSections.map((s) => (
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
