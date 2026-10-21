"use client";
import type { Locale } from "@/lib/locale";
import { collectionFigures } from "@/domains/dues/schema";
import { formatCents } from "@/domains/dashboard/summary";
import { collectionCopy } from "./collection-copy";
import { cssVars } from "./css-vars";
import { Icon } from "./icons";

/**
 * The dues collection bar (wave 15, 2.8): the amber bar of the home's money
 * card, "62 % encaissé", then collected, still to collect and of which late.
 * Same figures everywhere (duesTotals, then collectionFigures).
 */
export function CollectionBar({ locale, totals }: { locale: Locale; totals: { due: number; collected: number; late: number } }) {
  const t = collectionCopy[locale];
  const f = collectionFigures(totals);
  const money = (c: number) => formatCents(c, locale);
  if (f.rate === null) return <p className="muted">{t.none}</p>;
  return (
    <div className="collection-bar">
      <div className="collection-head">
        <strong className="collection-rate">{t.rate.replace("{rate}", String(f.rate))}</strong>
      </div>
      <span className="collection-track" role="img" aria-label={t.rate.replace("{rate}", String(f.rate))}>
        <span style={cssVars({ value: Math.min(f.rate, 100) })} />
      </span>
      <dl className="collection-figures">
        <div>
          <dt>{t.collected}</dt>
          <dd className="num">{money(f.collected)}</dd>
        </div>
        <div>
          <dt>{t.remaining}</dt>
          <dd className="num">{money(f.remaining)}</dd>
        </div>
        <div data-late={f.late > 0 || undefined}>
          <dt>{t.late}</dt>
          <dd className="num">
            {f.late > 0 && <Icon name="alert" size={14} />} {money(f.late)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
