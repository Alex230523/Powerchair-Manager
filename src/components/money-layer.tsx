"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { MoneyDeadline } from "@/domains/funding/service";
import { sponsorsCopy } from "./sponsors-copy";
import { Icon } from "./icons";
import { brusselsDay } from "@/lib/today";

/**
 * The calendar's "Échéances" layer (wave 15, C1 and C2): sponsor conditions,
 * partner payments and renewals, grant dates. Read from the files each time;
 * offered only when the server answers (finance module on, a right or a task).
 */
export function useMoneyDeadlines(from: string, to: string, on: boolean, probe = true) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<{ key: string; items: MoneyDeadline[] }>({ key: "", items: [] });
  useEffect(() => {
    // Probed once per page (a club only): rights do not change with the period.
    if (!probe) return;
    let cancelled = false;
    const day = brusselsDay();
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
  }, [probe]);
  const key = `${from}:${to}`;
  useEffect(() => {
    if (!on || !available || !probe) return;
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
  }, [on, available, probe, from, to]);
  return { available: available && probe, items: on && state.key === key ? state.items : [] };
}

/** A whole-day capsule of the layer: icon, kind in words, title; a link to the file. */
export function DeadlineChip({ locale, d }: { locale: Locale; d: MoneyDeadline }) {
  const s = sponsorsCopy[locale];
  return (
    <Link className="board-deadline" data-source={d.source} href={`/${locale}${d.href}`}>
      <Icon name={d.source === "partner" ? "handshake" : d.source === "accounts" ? "document" : d.source === "tournament" ? "trophy" : "landmark"} size={14} />
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

/**
 * Tournament match days of the shown period (21/10/2026): always in the
 * calendar for the clubs that organise or play, as whole-day capsules
 * linking to the day in the tournament page.
 */
export function useTournamentDays(from: string, to: string) {
  const [state, setState] = useState<{ key: string; items: MoneyDeadline[] }>({ key: "", items: [] });
  const key = `${from}:${to}`;
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tournaments/days?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { items: Omit<MoneyDeadline, "kind" | "source">[] }) : { items: [] }))
      .then((v) => {
        if (!cancelled) setState({ key: `${from}:${to}`, items: v.items.map((d) => ({ ...d, kind: "tournamentDay" as const, source: "tournament" as const })) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [from, to]);
  return state.key === key ? state.items : [];
}
