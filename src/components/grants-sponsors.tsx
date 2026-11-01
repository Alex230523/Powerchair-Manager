import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { grantsSponsorsCopy } from "./grants-sponsors-copy";

/**
 * A2: the two views of « Subsides & sponsors ». Each view has its own
 * address (?vue=subsides|sponsoring), so a link, a reminder or the back
 * button lands on the right one.
 */
export function SupportTabs({ locale, current }: { locale: Locale; current: "grants" | "sponsoring" }) {
  const t = grantsSponsorsCopy[locale];
  const items = [
    { id: "grants", vue: "subsides", label: t.grants },
    { id: "sponsoring", vue: "sponsoring", label: t.sponsoring },
  ] as const;
  return (
    <nav className="finance-nav support-tabs" aria-label={t.views}>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <Link href={`/${locale}/funding/grants-sponsors?vue=${i.vue}`} aria-current={i.id === current ? "page" : undefined}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
