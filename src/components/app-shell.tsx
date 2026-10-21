"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { labels } from "@/domains/access/policy";
import type { Locale } from "@/lib/locale";
import { authClient } from "@/lib/auth-client";
import { BrandMark, Icon } from "./icons";
import { shellCopy } from "./shell-copy";
import { CommandPalette } from "./command-palette";
import { ToastHost } from "./toast";
import { ScopeProvider, useScope } from "./use-scope";
import type { Todo } from "@/domains/dashboard/summary";
import { menuGroups, type NavItem, type Workspace } from "./menu";
export { menuGroups, type Workspace };
import { Badge } from "./ui";
import { settingsEntries, visibleCategories } from "./settings-nav";
import { settingsHubCopy } from "./settings-hub-copy";
export { shellCopy };
type Copy = (typeof shellCopy)[Locale];
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
export function contextChanged() {
  try {
    window.localStorage.setItem("pfm-context-event", crypto.randomUUID());
  } catch {
    /* Storage may be disabled; the current page still reloads. */
  }
}
// Runs before paint (see layout) so the stored theme never flashes.
// Text size and contrast (wave 15, C4) are applied the same way.
export const themeScript = `try{var d=document.documentElement,t=localStorage.getItem("pfm-theme"),z=localStorage.getItem("pfm-text-size"),c=localStorage.getItem("pfm-contrast");if(t==="light"||t==="dark")d.dataset.theme=t;if(z==="large"||z==="xlarge")d.dataset.textSize=z;if(c==="more"||c==="normal")d.dataset.contrast=c}catch(e){}`;
const darkQuery = "(prefers-color-scheme: dark)";
function subscribeTheme(change: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", change);
  window.addEventListener("pfm-theme", change);
  return () => {
    media.removeEventListener("change", change);
    window.removeEventListener("pfm-theme", change);
  };
}
function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : window.matchMedia(darkQuery).matches;
}
function setTheme(next: "light" | "dark") {
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem("pfm-theme", next);
  } catch {
    /* Preference is kept for this page only. */
  }
  window.dispatchEvent(new Event("pfm-theme"));
}
/** Light or dark, as a segmented pair in the account menu. */
export function ThemeChoice({ t }: { t: Copy }) {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => null);
  if (dark === null) return null;
  return (
    <div className="segmented account-theme" role="group" aria-label={t.theme}>
      <button type="button" aria-pressed={!dark} onClick={() => setTheme("light")}>
        <Icon name="sun" size={16} /> {t.themeLight}
      </button>
      <button type="button" aria-pressed={dark} onClick={() => setTheme("dark")}>
        <Icon name="moon" size={16} /> {t.themeDark}
      </button>
    </div>
  );
}
/* Text size and contrast (wave 15, C4): kept on this device, applied before paint by themeScript. */
const textSizes = ["normal", "large", "xlarge"] as const;
type TextSize = (typeof textSizes)[number];
const contrastQuery = "(prefers-contrast: more)";
function subscribeDisplay(change: () => void) {
  const media = window.matchMedia(contrastQuery);
  media.addEventListener("change", change);
  window.addEventListener("pfm-display", change);
  return () => {
    media.removeEventListener("change", change);
    window.removeEventListener("pfm-display", change);
  };
}
function displayState() {
  const d = document.documentElement.dataset;
  const size = (textSizes as readonly string[]).includes(d.textSize ?? "") ? (d.textSize as TextSize) : "normal";
  const more = d.contrast ? d.contrast === "more" : window.matchMedia(contrastQuery).matches;
  return `${size}|${more ? "more" : "normal"}`;
}
function setDisplay(key: "textSize" | "contrast", value: string) {
  const d = document.documentElement.dataset;
  if (key === "textSize" && value === "normal") delete d.textSize;
  else d[key] = value;
  try {
    window.localStorage.setItem(key === "textSize" ? "pfm-text-size" : "pfm-contrast", value);
  } catch {
    /* Kept for this page only. */
  }
  window.dispatchEvent(new Event("pfm-display"));
}
/** Text size and stronger contrast, in the account menu and in Settings > My account. */
export function DisplayChoice({ t }: { t: Copy }) {
  const state = useSyncExternalStore(subscribeDisplay, displayState, () => null);
  if (state === null) return null;
  const [size, contrast] = state.split("|");
  const label: Record<TextSize, string> = { normal: t.textNormal, large: t.textLarge, xlarge: t.textXLarge };
  return (
    <div className="display-choice">
      <div className="segmented text-size" role="group" aria-label={t.textSize}>
        {textSizes.map((s) => (
          <button key={s} type="button" aria-pressed={size === s} onClick={() => setDisplay("textSize", s)}>
            {label[s]}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" data-nodirty="" checked={contrast === "more"} onChange={(e) => setDisplay("contrast", e.target.checked ? "more" : "normal")} />
        {t.contrast}
      </label>
    </div>
  );
}
const drawerQuery = "(max-width: 1023px)";
const counterRoutes: Record<string, Todo["key"]> = {
  "/registrations": "registrationsReview",
  "/attendance": "registersToClose",
  "/dues": "duesLate",
};
type Brief = { unread: number; latest: { id: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }[] };

export function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const path = usePathname(),
    t = shellCopy[locale];
  const [state, setState] = useState<Workspace | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [todos, setTodos] = useState<Todo[]>([]),
    [brief, setBrief] = useState<Brief | null>(null),
    [drawer, setDrawer] = useState(false),
    [bell, setBell] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    aside = useRef<HTMLElement>(null),
    bellButton = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    account = useRef<HTMLDetailsElement>(null);
  const panelId = useId();
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/workspace", { cache: "no-store" })
        .then(async (r) => (r.ok ? await r.json() : null))
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {
          if (!cancelled) setState(null);
        });
    };
    load();
    window.addEventListener("pfm-workspace", load);
    const sync = (e: StorageEvent) => {
      if (e.key === "pfm-context-event") window.location.reload();
    };
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("pfm-workspace", load);
      window.removeEventListener("storage", sync);
    };
  }, [path]);
  const role = state?.contexts.find((c) => c.id === state.selected?.id)?.role;
  const member = role === "player" || role === "guardian";
  const club = state?.selected?.kind === "club";
  const selectedId = state?.selected?.id ?? null;
  // Counters of the menu and the bell: real figures from the dashboard and the inbox, refreshed with the page.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = () => {
      if (club && !member)
        fetch("/api/dashboard", { cache: "no-store" })
          .then(async (r) => (r.ok ? ((await r.json()) as { todos?: Todo[] }) : null))
          .then((d) => {
            if (!cancelled) setTodos(d?.todos ?? []);
          })
          .catch(() => {
            if (!cancelled) setTodos([]);
          });
      fetch("/api/notifications?brief=1", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as Brief) : null))
        .then((b) => {
          if (!cancelled) setBrief(b);
        })
        .catch(() => {
          if (!cancelled) setBrief(null);
        });
    };
    load();
    window.addEventListener("pfm-workspace", load);
    return () => {
      cancelled = true;
      window.removeEventListener("pfm-workspace", load);
    };
  }, [selectedId, club, member, path]);
  // The drawer: Escape closes it, focus stays inside while it is open, and goes back to the menu button after.
  useEffect(() => {
    if (!drawer) return;
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", key);
    document.body.dataset.drawer = "open";
    return () => {
      document.removeEventListener("keydown", key);
      delete document.body.dataset.drawer;
      menuButton.current?.focus();
    };
  }, [drawer]);
  // The notification panel: Escape or a click elsewhere closes it; focus goes back to the bell.
  useEffect(() => {
    if (!bell) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBell(false);
    };
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !bellButton.current?.contains(target)) setBell(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
      bellButton.current?.focus();
    };
  }, [bell]);
  const trapFocus = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || !aside.current || !window.matchMedia(drawerQuery).matches) return;
    const focusables = [...aside.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null,
    );
    if (!focusables.length) return;
    const first = focusables[0],
      last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);
  if (path.includes("/registration-widget/")) return children;
  function current(route: string) {
    const href = `/${locale}${route}`;
    if (path === href) return "page" as const;
    if (route && path.startsWith(href + "/")) return "true" as const;
    return undefined;
  }
  const counts = new Map(todos.map((x) => [x.key, x]));
  function item({ route, label, icon }: NavItem) {
    const todo = counterRoutes[route] ? counts.get(counterRoutes[route]) : undefined;
    return (
      <Link key={route} href={`/${locale}${route}`} aria-current={current(route)}>
        <span className="nav-icon">
          <Icon name={icon} />
        </span>
        <span className="nav-label">{t[label]}</span>
        {todo && todo.count > 0 && (
          <>
            <span className="nav-count" aria-hidden="true">
              <Badge tone={todo.tone === "danger" ? "danger" : "warning"}>{todo.count}</Badge>
            </span>
            <span className="sr-only"> · {t.pendingCount.replace("{n}", String(todo.count))}</span>
          </>
        )}
      </Link>
    );
  }
  async function change(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "context", mandateId: id }),
      });
      if (!r.ok) throw new Error();
      contextChanged();
      // A full reload discards cached data from the previous authorised profile.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/${locale}/access`);
    } catch {
      setError(t.error);
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/${locale}/access`);
    }
  }
  const localePath = (l: Locale) => path.replace(/^\/(fr|nl|en)(?=\/|$)/, `/${l}`);
  const unread = brief?.unread ?? 0;
  const unreadText = unread === 0 ? t.noUnread : unread === 1 ? t.unreadOne : t.unreadCount.replace("{n}", String(unread));
  const groups = menuGroups(state);
  // Settings are found by Ctrl+K too (wave 15): each category and each setting it holds.
  const h = settingsHubCopy[locale];
  const shownSettings = state?.selected
    ? visibleCategories({ kind: state.selected.kind, role, permissions: state.permissions ?? [], disabled: state.selected.disabled_modules })
    : [];
  const settingsPages = [
    ...shownSettings.map((c) => ({ route: `/settings/${c}`, label: `${t.settings} · ${h.categories[c].title}` })),
    ...settingsEntries
      .filter((e) => shownSettings.includes(e.category))
      .map((e) => ({ route: `/settings/${e.category}#${e.anchor}`, label: `${h.entries[e.id].title} · ${t.settings}` })),
  ];
  const orgName = state?.selected?.organization_name ?? (state ? t.noContext : "");
  return (
    <ScopeProvider
      organizationId={state?.selected?.kind === "club" ? state.selected.organization_id : null}
      seasons={state?.seasons ?? []}
      teams={state?.teams ?? []}
    >
      <div className="app-shell">
        {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />}
        <aside className="sidebar" ref={aside} data-open={drawer || undefined} onKeyDown={trapFocus} aria-label={t.mainMenu}>
          <div className="sidebar-head">
            <Link className="brand" href={`/${locale}`} onClick={() => setDrawer(false)}>
              {state?.selected?.logo_version ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="brand-mark" src={`/api/club/logo?org=${state.selected.organization_id}&v=${state.selected.logo_version}`} alt="" />
              ) : (
                <BrandMark />
              )}
              <span className="brand-words">
                <span className="brand-name">{t.brandName}</span>
                {orgName && <span className="brand-org">{orgName}</span>}
              </span>
            </Link>
            <button type="button" ref={closeButton} className="icon-button drawer-close" aria-label={t.closeMenu} onClick={() => setDrawer(false)}>
              <Icon name="close" />
            </button>
          </div>
          <nav
            aria-label={t.menu}
            onClick={(e) => {
              if ((e.target as Element).closest("a")) setDrawer(false);
            }}
          >
            {item({ route: "", label: "home", icon: "home" })}
            {groups.map((group) => {
              const holds = group.items.some((i) => current(i.route) !== undefined);
              return (
                <details key={group.id} className="nav-group" open={holds || undefined} data-current={holds || undefined} data-folded={group.folded || undefined}>
                  <summary>
                    <span className="nav-group-label">{t[group.label]}</span>
                    <span className="nav-chevron" aria-hidden="true">
                      <Icon name="chevronDown" size={16} />
                    </span>
                  </summary>
                  <div className="nav-items">{group.items.map(item)}</div>
                </details>
              );
            })}
          </nav>
          {/* The account corner: photo, name and role open the account menu. */}
          <details className="profile-menu" ref={account}>
            <summary className="sidebar-foot" aria-label={`${t.accountMenu} · ${state?.user.name ?? ""}`}>
              {state?.user.name &&
                (state.avatarVersion ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar" src={`/api/account/avatar?v=${state.avatarVersion}`} alt="" />
                ) : (
                  <span className="avatar" aria-hidden="true">
                    {initials(state.user.name)}
                  </span>
                ))}
              <span className="foot-words">
                <span className="foot-name">{state?.user.name ?? t.brandName}</span>
                {role && <span className="foot-role">{labels[role][locale]}</span>}
              </span>
              <span className="nav-chevron" aria-hidden="true">
                <Icon name="chevronDown" size={16} />
              </span>
            </summary>
            <div className="profile-menu-body">
              {state && state.contexts.length > 0 && (
                <label>
                  <span className="menu-heading">{t.changeProfile}</span>
                  <select aria-label={t.profile} value={state.selected?.id ?? ""} disabled={busy} onChange={(e) => void change(e.target.value)}>
                    <option value="" disabled>
                      {t.choose}
                    </option>
                    {state.contexts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {state.profiles?.find((p) => p.mandate_id === c.id)?.name ?? `${c.name} · ${labels[c.role][locale]}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {state && (
                <Link className="menu-link" href={`/${locale}/settings/account`}>
                  <Icon name="userRound" size={16} /> {t.myAccount}
                </Link>
              )}
              <Link className="menu-link" href={`/${locale}/access`}>
                <Icon name="lock" size={16} /> {t.access}
              </Link>
              {state && (
                <Link className="menu-link" href={`/${locale}/settings`}>
                  <Icon name="settings" size={16} /> {t.settings}
                </Link>
              )}
              <div className="menu-row">
                <span className="menu-heading">
                  <Icon name="globe" size={16} /> {t.language}
                </span>
                <span className="menu-langs">
                  {(["fr", "nl", "en"] as const).map((l) => (
                    <Link key={l} href={localePath(l)} aria-current={l === locale ? "true" : undefined} lang={l}>
                      {l.toUpperCase()}
                    </Link>
                  ))}
                </span>
              </div>
              <div className="menu-row">
                <span className="menu-heading">{t.theme}</span>
                <ThemeChoice t={t} />
              </div>
              <div className="menu-row">
                <span className="menu-heading">{t.textSize}</span>
                <DisplayChoice t={t} />
              </div>
              {state && (
                <button type="button" className="menu-link" disabled={busy} onClick={() => void signOut()}>
                  <Icon name="logOut" size={16} /> {t.signOut}
                </button>
              )}
              {error && <p role="alert">{error}</p>}
            </div>
          </details>
        </aside>
        <div className="app-content">
          <header className="topbar">
            <button type="button" ref={menuButton} className="icon-button drawer-open" aria-label={t.openMenu} aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <Icon name="menu" />
            </button>
            <Link className="topbar-mark" href={`/${locale}`} aria-label={t.home}>
              {state?.selected?.logo_version ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="brand-mark" src={`/api/club/logo?org=${state.selected.organization_id}&v=${state.selected.logo_version}`} alt="" />
              ) : (
                <BrandMark size={28} />
              )}
            </Link>
            <div className="topbar-search">
              <CommandPalette
                locale={locale}
                enabled={!!state?.selected}
                variant="field"
                pages={[{ route: "", label: t.home }, ...groups.flatMap((g) => g.items.map((i) => ({ route: i.route, label: t[i.label] }))), ...settingsPages]}
              />
            </div>
            <div className="topbar-tools">
              {!state && (
                <Link className="button secondary" href={`/${locale}/access`}>
                  {t.access}
                </Link>
              )}
              {club && !member && <ScopeBar t={t} />}
              {state?.selected && (
                <div className="bell">
                  <button
                    type="button"
                    ref={bellButton}
                    className="icon-button bell-button"
                    aria-label={`${t.notificationsButton} · ${unreadText}`}
                    aria-expanded={bell}
                    aria-controls={panelId}
                    onClick={() => setBell((v) => !v)}
                  >
                    <Icon name="bell" />
                    {unread > 0 && (
                      <span className="bell-count" aria-hidden="true">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </button>
                  {bell && (
                    <div className="bell-panel" role="dialog" aria-modal="false" aria-label={t.notificationsButton} id={panelId} ref={panel}>
                      <div className="bell-head">
                        <strong>{t.notificationsButton}</strong>
                        <span className="muted">{unreadText}</span>
                        <button type="button" className="icon-button sm" aria-label={t.closePanel} onClick={() => setBell(false)}>
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                      {brief?.latest.length ? (
                        <ul className="bell-list">
                          {brief.latest.map((n) => (
                            <li key={n.id} data-unread={!n.read_at || undefined}>
                              {n.href ? (
                                <Link href={n.href.startsWith("/") && !n.href.startsWith(`/${locale}/`) ? `/${locale}${n.href}` : n.href} onClick={() => setBell(false)}>
                                  <strong>{n.title}</strong>
                                  {n.body && <span>{n.body}</span>}
                                </Link>
                              ) : (
                                <div>
                                  <strong>{n.title}</strong>
                                  {n.body && <span>{n.body}</span>}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted bell-empty">{t.noNotifications}</p>
                      )}
                      <Link className="menu-link bell-all" href={`/${locale}/settings/notifications`} onClick={() => setBell(false)}>
                        {t.seeAll} <Icon name="arrow" size={16} />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>
          <ScopeChip t={t} />
          {children}
          <ToastHost locale={locale} />
        </div>
      </div>
    </ScopeProvider>
  );
}
/** Season and team capsules of the top bar (wave 12): the choice every page follows. */
function ScopeBar({ t }: { t: Copy }) {
  const scope = useScope();
  if (!scope.organizationId || !scope.seasons.length) return null;
  const open = scope.seasons.filter((s) => !s.archived),
    archived = scope.seasons.filter((s) => s.archived);
  return (
    <div className="scope-bar">
      <label className="capsule">
        <span className="capsule-label">{t.season}</span>
        <select aria-label={t.season} value={scope.seasonId ?? ""} onChange={(e) => scope.setSeason(e.target.value || null)}>
          {open.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {archived.length > 0 && (
            <optgroup label={t.archivedSeasons}>
              {archived.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {scope.seasonTeams.length > 1 && (
        <label className="capsule">
          <span className="team-dot" data-color={scope.team?.color ?? "none"} aria-hidden="true" />
          <span className="capsule-label">{t.team}</span>
          <select aria-label={t.team} value={scope.teamId ?? ""} onChange={(e) => scope.setTeam(e.target.value || null)}>
            <option value="">{t.allTeams}</option>
            {scope.seasonTeams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
/** Under the top bar when one team is chosen: "Équipe A · 2026-2027", with a cross. */
function ScopeChip({ t }: { t: Copy }) {
  const scope = useScope();
  if (!scope.team) return null;
  return (
    <div className="scope-chip-row">
      <span className="scope-chip">
        <span className="team-dot" data-color={scope.team.color ?? "none"} aria-hidden="true" />
        {scope.team.name}
        {scope.season && <span className="muted"> · {scope.season.name}</span>}
        <button type="button" className="scope-clear" aria-label={t.scopeClear} onClick={() => scope.setTeam(null)}>
          ×
        </button>
      </span>
    </div>
  );
}
