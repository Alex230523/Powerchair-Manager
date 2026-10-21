"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/locale";
import { Icon } from "./icons";

const copy = {
  fr: {
    open: "Rechercher",
    shortcut: "Raccourci : Ctrl+K ou ⌘K",
    label: "Rechercher un joueur, un coach, une équipe, un événement ou une page",
    placeholder: "Nom, équipe, page…",
    fieldHint: "Rechercher un joueur, une équipe, un événement",
    pages: "Pages",
    people: "Personnes",
    teams: "Équipes",
    events: "Événements",
    player: "Joueur",
    coach: "Coach",
    former: "ancien",
    none: "Aucun résultat.",
    hint: "Tapez au moins deux lettres.",
    close: "Fermer",
    keys: "↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer",
    count: "{n} résultats",
  },
  nl: {
    open: "Zoeken",
    shortcut: "Sneltoets: Ctrl+K of ⌘K",
    label: "Zoek een speler, coach, team, evenement of pagina",
    placeholder: "Naam, team, pagina…",
    fieldHint: "Zoek een speler, een team, een evenement",
    pages: "Pagina's",
    people: "Personen",
    teams: "Teams",
    events: "Evenementen",
    player: "Speler",
    coach: "Coach",
    former: "voormalig",
    none: "Geen resultaten.",
    hint: "Typ minstens twee letters.",
    close: "Sluiten",
    keys: "↑ ↓ om te kiezen, Enter om te openen, Esc om te sluiten",
    count: "{n} resultaten",
  },
  en: {
    open: "Search",
    shortcut: "Shortcut: Ctrl+K or ⌘K",
    label: "Search for a player, coach, team, event or page",
    placeholder: "Name, team, page…",
    fieldHint: "Search a player, a team, an event",
    pages: "Pages",
    people: "People",
    teams: "Teams",
    events: "Events",
    player: "Player",
    coach: "Coach",
    former: "former",
    none: "No results.",
    hint: "Type at least two letters.",
    close: "Close",
    keys: "↑ ↓ to choose, Enter to open, Esc to close",
    count: "{n} results",
  },
};
export type SearchPage = { route: string; label: string };
type Found = {
  people: { id: string; name: string; kind: "player" | "coach"; former: boolean }[];
  teams: { id: string; name: string }[];
  events: { id: string; title: string; starts_at: string }[];
};
type Result = { key: string; group: string; label: string; detail?: string; href: string };
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");

/**
 * Global search. Pages come from the menu the person already sees; people,
 * teams and events come from the server, filtered by the same rules as their
 * own screens.
 */
export function CommandPalette({
  locale,
  pages,
  enabled,
  variant = "icon",
}: {
  locale: Locale;
  pages: SearchPage[];
  enabled: boolean;
  /** "field": the search capsule of the top bar (wave 14); "icon": a round button. */
  variant?: "icon" | "field";
}) {
  const t = copy[locale];
  const mac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(""),
    [found, setFound] = useState<Found | null>(null),
    [active, setActive] = useState(0);

  function open() {
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
    input.current?.select();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!dialog.current?.open) dialog.current?.showModal();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!enabled || q.trim().length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch("/api/search?q=" + encodeURIComponent(q.trim()), { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as Found) : null))
        .then((v) => {
          if (!cancelled) setFound(v);
        })
        .catch(() => {
          if (!cancelled) setFound(null);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, enabled]);

  const when = (d: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Brussels",
    }).format(new Date(d));
  const needle = fold(q.trim());
  const results: Result[] =
    needle.length < 2
      ? []
      : [
          ...pages
            .filter((p) => fold(p.label).includes(needle))
            .slice(0, 6)
            .map((p) => ({
              key: "page" + p.route,
              group: t.pages,
              label: p.label,
              href: `/${locale}${p.route}`,
            })),
          ...(found?.people ?? []).map((p) => ({
            key: "person" + p.id,
            group: t.people,
            label: p.name,
            detail: (p.kind === "coach" ? t.coach : t.player) + (p.former ? ` · ${t.former}` : ""),
            href: `/${locale}/${p.kind === "coach" ? "coaches" : "players"}/${p.id}`,
          })),
          ...(found?.teams ?? []).map((x) => ({
            key: "team" + x.id,
            group: t.teams,
            label: x.name,
            href: `/${locale}/players`,
          })),
          ...(found?.events ?? []).map((e) => ({
            key: "event" + e.id,
            group: t.events,
            label: e.title,
            detail: when(e.starts_at),
            href: `/${locale}/calendar`,
          })),
        ];
  const current = Math.min(active, Math.max(results.length - 1, 0));
  const groups = [...new Set(results.map((r) => r.group))];
  function go(r: Result | undefined) {
    if (!r) return;
    dialog.current?.close();
    setQ("");
    setFound(null);
    router.push(r.href);
  }
  return (
    <>
      {variant === "field" ? (
        <button type="button" className="search-field" aria-label={t.label} title={t.shortcut} aria-keyshortcuts="Control+K Meta+K" onClick={open}>
          <Icon name="search" size={16} />
          <span className="search-field-text">{t.fieldHint}</span>
          <kbd aria-hidden="true">{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      ) : (
        <button
          type="button"
          className="icon-button search-trigger"
          aria-label={t.open}
          title={`${t.open} (${t.shortcut})`}
          aria-keyshortcuts="Control+K Meta+K"
          onClick={open}
        >
          <Icon name="search" />
        </button>
      )}
      <dialog
        ref={dialog}
        className="command-palette"
        aria-label={t.label}
        onClick={(e) => {
          // A tap outside the panel closes it.
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="command-box">
          <div className="command-input">
            <Icon name="search" />
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="command-results"
              aria-activedescendant={results[current] ? "cmd-" + current : undefined}
              aria-label={t.label}
              placeholder={t.placeholder}
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((current + 1) % Math.max(results.length, 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((current - 1 + results.length) % Math.max(results.length, 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(results[current]);
                }
              }}
            />
            <button
              type="button"
              className="text-button"
              onClick={() => dialog.current?.close()}
            >
              {t.close}
            </button>
          </div>
          <div id="command-results" role="listbox" aria-label={t.label}>
            {groups.map((g, gi) => (
              <div key={g} role="group" aria-labelledby={`cmd-group-${gi}`}>
                <div
                  className="command-group"
                  id={`cmd-group-${gi}`}
                  role="presentation"
                >
                  {g}
                </div>
                {results.map((r, i) =>
                  r.group !== g ? null : (
                    <div
                      key={r.key}
                      id={"cmd-" + i}
                      role="option"
                      aria-selected={i === current}
                      className="command-option"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span>{r.label}</span>
                      {r.detail && <small>{r.detail}</small>}
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="command-foot muted" aria-live="polite">
            {needle.length < 2
              ? t.hint
              : results.length
                ? t.count.replace("{n}", String(results.length))
                : t.none}
            <span className="command-keys"> · {t.keys}</span>
          </p>
        </div>
      </dialog>
    </>
  );
}
