"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { MoneyDeadline } from "@/domains/funding/service";
import { sponsorsCopy } from "./sponsors-copy";
import { Icon } from "./icons";

/**
 * The calendar's "Échéances" layer (wave 15, C1 and C2): sponsor conditions,
 * partner payments and renewals, grant dates. Read from the files each time;
 * offered only when the server answers (finance module on, a right or a task).
 */
export function useMoneyDeadlines(from: string, to: string, on: boolean) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<{ key: string; items: MoneyDeadline[] }>({ key: "", items: [] });
  useEffect(() => {
    // Probed once per page: rights do not change with the period.
    let cancelled = false;
    const day = new Date().toISOString().slice(0, 10);
    fetch(`/api/funding/deadlines?from=${day}&to=${day}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const v = (await r.json()) as { can: { layer: boolean } };
        if (!cancelled) setAvailable(v.can.layer);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const key = `${from}:${to}`;
  useEffect(() => {
    if (!on || !available) return;
    let cancelled = false;
    fetch(`/api/funding/deadlines?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { items: MoneyDeadline[] }) : { items: [] }))
      .then((v) => {
        if (!cancelled) setState({ key: `${from}:${to}`, items: v.items });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [on, available, from, to]);
  return { available, items: on && state.key === key ? state.items : [] };
}

/** A whole-day capsule of the layer: icon, kind in words, title; a link to the file. */
export function DeadlineChip({ locale, d }: { locale: Locale; d: MoneyDeadline }) {
  const s = sponsorsCopy[locale];
  return (
    <Link className="board-deadline" data-source={d.source} href={`/${locale}${d.href}`}>
      <Icon name={d.source === "partner" ? "handshake" : d.source === "accounts" ? "document" : "landmark"} size={14} />
      {/* The accounts' title is only the year: their kind is written out. */}
      <span className={d.source === "accounts" ? undefined : "sr-only"}>{s.layerKinds[d.kind]} · </span>
      <span>{d.title}</span>
    </Link>
  );
}

/** The checkbox of the calendar toolbar. */
export function LayerToggle({ locale, on, onChange }: { locale: Locale; on: boolean; onChange: (v: boolean) => void }) {
  const s = sponsorsCopy[locale];
  return (
    <label className="check layer-toggle" title={s.layerHint}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <Icon name="handshake" size={16} /> {s.layer}
    </label>
  );
}
