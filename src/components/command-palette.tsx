"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/locale";
import { Icon, type IconName } from "./icons";
import { IconTile } from "./ui";
import { paletteCopy } from "./command-palette-copy";
import { fold, matchActions, pushRecent, readRecent, writeRecent, type PaletteAction, type Recent } from "./palette";

export type SearchPage = { route: string; label: string };
type Found = {
  people: { id: string; name: string; kind: "player" | "coach"; former: boolean }[];
  teams: { id: string; name: string }[];
  events: { id: string; title: string; starts_at: string }[];
};
type Result = { key: string; group: string; label: string; detail?: string; icon: IconName; href?: string; scope?: "season" | "team" };

/** Asks the season or team capsule of the top bar to take the focus (wave 15, C6). */
export const scopeFocusEvent = "pfm-scope-focus";

/**
 * Global search and actions (Ctrl+K). Sections in this order: Actions,
 * People, Teams, Events, Pages. Actions come with the person's rights
 * (palette.ts); people, teams and events come from the server, filtered by
 * the same rules as their own screens; pages from the menu the person sees.
 * With an empty field: the actions and the last five items opened.
 */
export function CommandPalette({
  locale,
  pages,
  actions = [],
  collect = false,
  enabled,
  variant = "icon",
}: {
  locale: Locale;
  pages: SearchPage[];
  actions?: PaletteAction[];
  /** The person may collect dues: a player found offers "Encaisser la cotisation de …". */
  collect?: boolean;
  enabled: boolean;
  /** "field": the search capsule of the top bar (wave 14); "icon": a round button. */
  variant?: "icon" | "field";
}) {
  const t = paletteCopy[locale];
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
    [active, setActive] = useState(0),
    [recent, setRecent] = useState<Recent[]>([]);

  function open() {
    setRecent(readRecent());
    setActive(0);
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
    input.current?.select();
  }
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openRef.current();
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
  const searching = needle.length >= 2;
  const actionResults: Result[] = matchActions(actions, t, q).map((a) => ({
    key: "action-" + a.id,
    group: t.actions,
    label: t[a.id],
    icon: a.icon,
    ...(a.route ? { href: `/${locale}${a.route}` } : {}),
    ...(a.scope ? { scope: a.scope } : {}),
  }));
  const people = searching ? (found?.people ?? []) : [];
  const results: Result[] = [
    ...(needle.length === 0 || actionResults.length ? actionResults : []),
    ...(searching
      ? [
          ...people.map((p) => ({
            key: "person" + p.id,
            group: t.people,
            label: p.name,
            detail: (p.kind === "coach" ? t.coach : t.player) + (p.former ? ` · ${t.former}` : ""),
            icon: (p.kind === "coach" ? "whistle" : "user") as IconName,
            href: `/${locale}/${p.kind === "coach" ? "coaches" : "players"}/${p.id}`,
          })),
          // The fee of a player found, straight to their line in Cotisations.
          ...(collect
            ? people
                .filter((p) => p.kind === "player" && !p.former)
                .slice(0, 3)
                .map((p) => ({
                  key: "collect" + p.id,
                  group: t.people,
                  label: t.collectFor.replace("{name}", p.name),
                  detail: t.collectDues,
                  icon: "dues" as IconName,
                  href: `/${locale}/dues?pay=${p.id}`,
                }))
            : []),
          ...(found?.teams ?? []).map((x) => ({ key: "team" + x.id, group: t.teams, label: x.name, icon: "team" as IconName, href: `/${locale}/teams/${x.id}` })),
          ...(found?.events ?? []).map((e) => ({
            key: "event" + e.id,
            group: t.events,
            label: e.title,
            detail: when(e.starts_at),
            icon: "calendar" as IconName,
            href: `/${locale}/calendar`,
          })),
          ...pages
            .filter((p) => fold(p.label).includes(needle))
            .slice(0, 6)
            .map((p) => ({ key: "page" + p.route, group: t.pages, label: p.label, icon: "arrow" as IconName, href: `/${locale}${p.route}` })),
        ]
      : needle.length === 0
        ? recent.map((r) => ({ ...r, key: "recent-" + r.key, group: t.recent }))
        : []),
  ];
  const current = Math.min(active, Math.max(results.length - 1, 0));
  const groups = [...new Set(results.map((r) => r.group))];
  function go(r: Result | undefined) {
    if (!r) return;
    dialog.current?.close();
    setQ("");
    setFound(null);
    if (r.scope) {
      window.dispatchEvent(new CustomEvent(scopeFocusEvent, { detail: r.scope }));
      return;
    }
    if (!r.href) return;
    const key = r.key.replace(/^recent-/, "");
    const next = pushRecent(readRecent(), { key, label: r.label, detail: r.detail, href: r.href, icon: r.icon });
    writeRecent(next);
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
        <button type="button" className="icon-button search-trigger" aria-label={t.open} title={`${t.open} (${t.shortcut})`} aria-keyshortcuts="Control+K Meta+K" onClick={open}>
          <Icon name="search" />
        </button>
      )}
      <dialog
        ref={dialog}
        className="command-palette"
        aria-label={t.label}
        onClose={() => {
          // Each opening starts clean: the actions and the recent items.
          setQ("");
          setFound(null);
        }}
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
            <button type="button" className="text-button" onClick={() => dialog.current?.close()}>
              {t.close}
            </button>
          </div>
          <div id="command-results" role="listbox" aria-label={t.label}>
            {groups.map((g, gi) => (
              <div key={g} role="group" aria-labelledby={`cmd-group-${gi}`}>
                <div className="command-group" id={`cmd-group-${gi}`} role="presentation">
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
                      <IconTile icon={r.icon} size={28} />
                      <span className="command-text">
                        <span className="command-label">{r.label}</span>
                        {r.detail && <small>{r.detail}</small>}
                      </span>
                      {i === current && (
                        <kbd className="command-enter" aria-hidden="true">
                          {t.enter}
                        </kbd>
                      )}
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="command-foot muted" aria-live="polite">
            {!searching ? t.hint : results.length ? t.count.replace("{n}", String(results.length)) : t.none}
            <span className="command-keys"> · {t.keys}</span>
          </p>
        </div>
      </dialog>
    </>
  );
}
