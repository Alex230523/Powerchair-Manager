"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/locale";
import { familyCopy } from "./family-copy";

/**
 * 27: the child switcher at the top of « Mon espace » (« Tous », Lucas,
 * Emma). The choice is remembered in this browser and shared by every page
 * of the family; a child of another club is simply not offered here.
 */
const key = "pfm-family-child";
export type FamilyChild = { id: string; name: string; first: string; organizationId: string; club: string };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("pfm-child", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("pfm-child", onChange);
  };
}
function read() {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
export function chooseChild(id: string) {
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    // Storage refused: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event("pfm-child"));
}
/** The remembered child ('' for « Tous »). */
export function useChildChoice() {
  return useSyncExternalStore(subscribe, read, () => "");
}

/** The account's children in every club (empty for a staff account). */
export function useFamilyChildren(enabled: boolean) {
  const [children, setChildren] = useState<FamilyChild[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/family?children=1", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { children: FamilyChild[] }) : { children: [] }))
      .then((v) => {
        if (live) setChildren(v.children);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);
  return children;
}

/** The initial shown beside a first name, so a child is never told apart by a colour alone. */
export const initialOf = (name: string) => (name.trim()[0] ?? "?").toLocaleUpperCase();

export function ChildSwitcher({ locale, items, value, onChange, showClub = false }: { locale: Locale; items: FamilyChild[]; value: string; onChange: (id: string) => void; showClub?: boolean }) {
  const t = familyCopy[locale];
  return (
    <div className="child-switcher" role="group" aria-label={t.show}>
      <span className="muted small" aria-hidden="true">
        {t.show}
      </span>
      {[{ id: "", label: t.all, initial: "" }, ...items.map((c) => ({ id: c.id, label: showClub ? `${c.first} (${c.club})` : c.first, initial: initialOf(c.first) }))].map((o) => (
        <button key={o.id || "all"} type="button" aria-pressed={value === o.id} className="child-chip" onClick={() => onChange(o.id)}>
          {o.initial && (
            <span className="child-initial" aria-hidden="true">
              {o.initial}
            </span>
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * For a page of one club: the switcher of that club's children (shown from
 * two children on) and the child to keep, or null for all.
 */
export function useClubChildFilter(locale: Locale, organizationId: string | undefined, enabled: boolean) {
  const all = useFamilyChildren(enabled);
  const chosen = useChildChoice();
  const items = all.filter((c) => c.organizationId === organizationId);
  const child = items.some((c) => c.id === chosen) ? chosen : null;
  const node = items.length > 1 ? <ChildSwitcher locale={locale} items={items} value={child ?? ""} onChange={chooseChild} /> : null;
  return { child, node, items };
}
