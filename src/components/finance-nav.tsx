"use client";
import Link from "next/link";
import { useScope } from "./use-scope";
import type { Locale } from "@/lib/locale";
import { financeNavCopy, financeSections, type FinanceSection } from "./finance-nav-copy";
export { financeSections, type FinanceSection };

/**
 * Wave 17 (N1): the tabs of the « Finances » page, each with its own address,
 * in a logical order. 9: dues, grants and sponsors, fundraising are their own
 * entries in the menu's Finances group, with no extra row of tabs (two levels
 * of tabs at most). Financial settings stay in Settings > Finances.
 */
const href: Record<FinanceSection, string> = {
  overview: "/funding",
  operations: "/funding/operations",
  budget: "/funding/budget",
  forecast: "/funding/forecast",
  reserved: "/funding/reserved",
  affiliations: "/funding/affiliations",
  statements: "/funding/statements",
  accounts: "/funding/annual-accounts",
  tax: "/funding/tax",
};

export function FinanceNav({ locale, current }: { locale: Locale; current: FinanceSection }) {
  const t = financeNavCopy[locale];
  // B8: nothing about tax receipts for a club that is not approved.
  const { taxApproved, federation } = useScope();
  // 35: the federation has neither tax receipts nor affiliations to pay; its income is grants and sponsors.
  const sections = financeSections.filter((s) => (s !== "tax" || taxApproved || current === "tax") && !(federation && (s === "tax" || s === "affiliations")));
  return (
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
  );
}
