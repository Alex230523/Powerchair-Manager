"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FirstSteps } from "./first-steps";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { labels } from "@/domains/access/policy";
import type { Locale } from "@/lib/locale";
import { authClient } from "@/lib/auth-client";
import { BrandMark, Icon } from "./icons";
import { languageNames, shellCopy } from "./shell-copy";
import { helpFor, helpRole } from "@/domains/guide/help";
import { FeedbackDialog } from "./feedback";
import { CommandPalette, scopeFocusEvent } from "./command-palette";
import { paletteActions } from "./palette";
import { ToastHost } from "./toast";
import { defaultSeasonId, ScopeProvider, useScope } from "./use-scope";
import type { Todo } from "@/domains/dashboard/summary";
import { SeasonCheckPrompt } from "./season-check";
import { bottomNav, menuGroups, settingsItem, type NavItem, type Workspace } from "./menu";
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
export const themeScript = `try{var d=document.documentElement,t=localStorage.getItem("pfm-theme"),z=localStorage.getItem("pfm-text-size"),c=localStorage.getItem("pfm-contrast"),x=localStorage.getItem("pfm-lexicon");if(x==="off")d.dataset.lexicon="off";if(t==="light"||t==="dark")d.dataset.theme=t;if(z==="large"||z==="xlarge")d.dataset.textSize=z;if(c==="more"||c==="normal")d.dataset.contrast=c}catch(e){}`;
/** What themeScript does, again after mounting (same keys, same values). */
function reapplyDisplay() {
  try {
    const d = document.documentElement.dataset,
      read = (k: string) => window.localStorage.getItem(k);
    const theme = read("pfm-theme"),
      size = read("pfm-text-size"),
      contrast = read("pfm-contrast");
    if (read("pfm-lexicon") === "off") d.lexicon = "off";
    if (theme === "light" || theme === "dark") d.theme = theme;
    if (size === "large" || size === "xlarge") d.textSize = size;
    if (contrast === "more" || contrast === "normal") d.contrast = contrast;
  } catch {
    /* Storage refused: the defaults stay. */
  }
}
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
/** Light or dark: two round icon buttons (wave 16, M1), each named for screen readers and in a tooltip. */
export function ThemeChoice({ t }: { t: Copy }) {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => null);
  if (dark === null) return null;
  return (
    <div className="theme-icons" role="group" aria-label={t.theme}>
      <button type="button" className="theme-icon" aria-pressed={!dark} aria-label={t.themeLightName} title={t.themeLightName} onClick={() => setTheme("light")}>
        <Icon name="sun" size={16} />
      </button>
      <button type="button" className="theme-icon" aria-pressed={dark} aria-label={t.themeDarkName} title={t.themeDarkName} onClick={() => setTheme("dark")}>
        <Icon name="moon" size={16} />
      </button>
    </div>
  );
}
/** The language as a compact list (wave 16, M1): choosing one opens the same page in that language. */
export function LanguageChoice({ t, locale, id }: { t: Copy; locale: Locale; id: string }) {
  const path = usePathname(),
    router = useRouter();
  return (
    <select
      id={id}
      className="compact-select"
      value={locale}
      onChange={(e) => router.push(path.replace(/^\/(fr|nl|en)(?=\/|$)/, `/${e.target.value}`))}
    >
      {(["fr", "nl", "en"] as const).map((l) => (
        <option key={l} value={l} lang={l}>
          {languageNames[l]}
        </option>
      ))}
    </select>
  );
}
/**
 * Before signing in: a discreet « FR » that opens a short list of the other
 * languages (NL, EN), instead of a long selector.
 */
export function LanguageMenu({ t, locale }: { t: Copy; locale: Locale }) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details className="lang-menu" ref={ref}>
      <summary aria-label={`${t.language} : ${languageNames[locale]}`}>
        <span aria-hidden="true">{locale.toUpperCase()}</span>
      </summary>
      <ul>
        {(["fr", "nl", "en"] as const)
          .filter((l) => l !== locale)
          .map((l) => (
            <li key={l}>
              <Link href={path.replace(/^\/(fr|nl|en)(?=\/|$)/, `/${l}`)} lang={l} hrefLang={l} onClick={() => ref.current?.removeAttribute("open")}>
                <span aria-hidden="true">{l.toUpperCase()}</span>
                <span className="sr-only">{languageNames[l]}</span>
              </Link>
            </li>
          ))}
      </ul>
    </details>
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
/** Text size as a compact list (wave 16, M1). */
export function TextSizeChoice({ t, id }: { t: Copy; id: string }) {
  const state = useSyncExternalStore(subscribeDisplay, displayState, () => null);
  if (state === null) return null;
  const size = state.split("|")[0];
  const label: Record<TextSize, string> = { normal: t.textNormal, large: t.textLarge, xlarge: t.textXLarge };
  return (
    <select id={id} className="compact-select" data-nodirty="" value={size} onChange={(e) => setDisplay("textSize", e.target.value)}>
      {textSizes.map((s) => (
        <option key={s} value={s}>
          {label[s]}
        </option>
      ))}
    </select>
  );
}
/** Stronger contrast: an 18 px box; the whole label is the 44 px target (wave 16, M1). */
export function ContrastChoice({ t }: { t: Copy }) {
  const state = useSyncExternalStore(subscribeDisplay, displayState, () => null);
  if (state === null) return null;
  return (
    <label className="check small-check">
      <input type="checkbox" data-nodirty="" checked={state.split("|")[1] === "more"} onChange={(e) => setDisplay("contrast", e.target.checked ? "more" : "normal")} />
      {t.contrast}
    </label>
  );
}
/** Text size and stronger contrast together, in Settings > My account. */
export function DisplayChoice({ t }: { t: Copy }) {
  const id = useId();
  return (
    <div className="display-choice">
      <div className="menu-row">
        <label className="menu-heading" htmlFor={id}>
          {t.textSize}
        </label>
        <TextSizeChoice t={t} id={id} />
      </div>
      <ContrastChoice t={t} />
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

/** A visitor (wave 16, I1): no menu, no season or team, no bell; the brand, the language and « Se connecter ». */
function GuestShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = shellCopy[locale];
  const path = usePathname();
  const onAccess = /\/access\/?$/.test(path);
  return (
    <div className="guest-shell">
      <header className="guest-bar">
        <Link className="brand" href={`/${locale}/access`}>
          <BrandMark size={28} />
          <span className="brand-name">{t.brandName}</span>
        </Link>
        <div className="guest-tools">
          <LanguageMenu t={t} locale={locale} />
          {!onAccess && (
            <Link className="button sm" href={`/${locale}/access`}>
              {t.signIn}
            </Link>
          )}
        </div>
      </header>
      {children}
      <ToastHost locale={locale} />
    </div>
  );
}

export function AppShell({ locale, signedIn = true, children }: { locale: Locale; signedIn?: boolean; children: ReactNode }) {
  const path = usePathname(),
    t = shellCopy[locale];
  // The display preferences on <html>, set again once mounted: when React redraws the
  // document after a hydration mismatch, <html> loses what the head script had set.
  useEffect(() => {
    reapplyDisplay();
    window.dispatchEvent(new Event("pfm-theme"));
    window.dispatchEvent(new Event("pfm-display"));
  }, []);
  const [state, setState] = useState<Workspace | null>(null),
    [signedOut, setSignedOut] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [todos, setTodos] = useState<Todo[]>([]),
    [myTasks, setMyTasks] = useState({ open: 0, late: 0 }),
    [brief, setBrief] = useState<Brief | null>(null),
    [drawer, setDrawer] = useState(false),
    [bell, setBell] = useState(false),
    [typing, setTyping] = useState(false),
    // 19: « Signaler un problème », over the page the person is on.
    [feedback, setFeedback] = useState(false),
    // 20: the « Nouveau » badges of the menu.
    [news, setNews] = useState<{ badges: string[] } | null>(null);
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
        .then(async (r) => {
          // The session ended (or the sign-in did not hold): the visitor's bar, without the menu.
          if (!cancelled) setSignedOut(r.status === 401);
          return r.ok ? await r.json() : null;
        })
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
      // 20: « Nouveautés » for this profile's role.
      fetch("/api/news", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as { badges: string[] }) : null))
        .then((n) => {
          if (cancelled || !n) return setNews(null);
          // The page of a badge is open: its « Nouveau » is seen, and goes.
          const here = path.replace(new RegExp(`^/${locale}`), "") || "/";
          if (n.badges.includes(here)) {
            void fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seen", route: here }) }).catch(() => undefined);
            setNews({ badges: n.badges.filter((b) => b !== here) });
          } else setNews({ badges: n.badges });
        })
        .catch(() => {
          if (!cancelled) setNews(null);
        });
      // 22: the tasks given to me, for the menu's counter and the phone's shortcut.
      fetch("/api/tasks?count=mine", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as { open: number; late: number }) : { open: 0, late: 0 }))
        .then((c) => {
          if (!cancelled) setMyTasks(c);
        })
        .catch(() => {
          if (!cancelled) setMyTasks({ open: 0, late: 0 });
        });
    };
    load();
    window.addEventListener("pfm-workspace", load);
    return () => {
      cancelled = true;
      window.removeEventListener("pfm-workspace", load);
    };
  }, [selectedId, club, member, path, locale]);
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
  // The bottom bar steps aside while the phone keyboard is open in a form (wave 15, C5).
  useEffect(() => {
    const field = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.matches('textarea, select, [contenteditable="true"]') || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(el.type)));
    const focusIn = (e: FocusEvent) => setTyping(field(e.target));
    const focusOut = () => setTyping(false);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, []);
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
  // Widgets (B6: a club's /c/<slug>/widget/<kind> too) are embedded bare in other sites.
  if (path.includes("/registration-widget/") || path.includes("/hall-of-fame-widget/") || /\/c\/[^/]+\/widget\//.test(path)) return children;
  function current(route: string) {
    const href = `/${locale}${route}`;
    if (path === href) return "page" as const;
    if (route && path.startsWith(href + "/")) return "true" as const;
    return undefined;
  }
  const counts = new Map(todos.map((x) => [x.key, x]));
  /** The counter of a menu entry: the dashboard's figures, and my open tasks (22). */
  const badgeOf = (route: string): { count: number; tone: string } | undefined =>
    route === "/tasks" ? { count: myTasks.open, tone: myTasks.late ? "danger" : "warning" } : counterRoutes[route] ? counts.get(counterRoutes[route]) : undefined;
  function item({ route, label, icon }: NavItem) {
    const todo = badgeOf(route),
      fresh = news?.badges.includes(route);
    // 20: « Nouveau » is a description, not part of the entry's name.
    return (
      <Link key={route} href={`/${locale}${route}`} aria-current={current(route)} aria-describedby={fresh ? "nav-new-description" : undefined}>
        <span className="nav-icon">
          <Icon name={icon} />
        </span>
        <span className="nav-label">{t[label]}</span>
        {fresh && (
          <span className="nav-new" aria-hidden="true">
            <Badge tone="info">{t.newBadge}</Badge>
          </span>
        )}
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
  const unread = brief?.unread ?? 0;
  const unreadText = unread === 0 ? t.noUnread : unread === 1 ? t.unreadOne : t.unreadCount.replace("{n}", String(unread));
  const groups = menuGroups(state);
  const bottom = bottomNav(state, myTasks.open);
  // Settings are found by Ctrl+K too (wave 15): each category and each setting it holds.
  const h = settingsHubCopy[locale];
  const shownSettings = state?.selected
    ? visibleCategories({ kind: state.selected.kind, role, permissions: state.permissions ?? [], disabled: state.selected.disabled_modules })
    : [];
  const sheet = helpFor(path, helpRole(role));
  const helpHref = sheet ? `/${locale}/guide/help/${sheet.id}` : `/${locale}/guide/help`;
  const settingsPages = [
    ...shownSettings.map((c) => ({ route: `/settings/${c}`, label: `${t.settings} · ${h.categories[c].title}` })),
    ...settingsEntries
      .filter((e) => shownSettings.includes(e.category))
      .map((e) => ({ route: `/settings/${e.category}#${e.anchor}`, label: `${h.entries[e.id].title} · ${t.settings}` })),
  ];
  const orgName = state?.selected?.organization_name ?? (state ? t.noContext : "");
  if (!signedIn || signedOut) return <GuestShell locale={locale}>{children}</GuestShell>;
  // Console (05/11/2026): the operator's console has its own bar, never the club menu.
  if (/^\/(fr|nl|en)\/console(\/|$)/.test(path))
    return (
      <div className="guest-shell console-shell">
        <header className="guest-bar console-bar">
          <Link className="brand" href={`/${locale}/console`}>
            <BrandMark size={28} />
            <span className="brand-name">{t.brandName}</span>
            <Badge tone="warning">{t.console}</Badge>
          </Link>
          <div className="guest-tools">
            <LanguageMenu t={t} locale={locale} />
            <Link className="button secondary sm" href={`/${locale}`}>
              {t.consoleBack}
            </Link>
            <button type="button" className="button secondary sm" disabled={busy} onClick={() => void signOut()}>
              {t.signOut}
            </button>
          </div>
        </header>
        {children}
        <ToastHost locale={locale} />
      </div>
    );
  return (
    <ScopeProvider
      organizationId={state?.selected?.kind === "club" ? state.selected.organization_id : null}
      taxApproved={state?.selected?.kind === "club" && !!state.selected.tax_approved}
      federation={state?.selected?.kind === "federation"}
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
            <span id="nav-new-description" hidden>
              {t.newBadge}
            </span>
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
            {/* 12: « Réglages » closes the menu, for every profile. */}
            {state?.selected && <div className="nav-settings">{item(settingsItem)}</div>}
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
              {state && (
                <Link className="menu-link" href={`/${locale}/settings`}>
                  <Icon name="settings" size={16} /> {t.settings}
                </Link>
              )}
              {/* Guide du powerchair football, for every profile. */}
              {state && (
                <Link className="menu-link" href={`/${locale}/guide`}>
                  <Icon name="document" size={16} /> {t.guide}
                </Link>
              )}
              {/* 19: a remark on the application, for every profile; its follow-up in « Mes signalements ». */}
              {state && (
                <button type="button" className="menu-link" onClick={() => setFeedback(true)}>
                  <Icon name="alert" size={16} /> {t.feedback}
                </button>
              )}
              {state && (
                <Link className="menu-link" href={`/${locale}/nouveautes`}>
                  <Icon name="megaphone" size={16} /> {t.news}
                </Link>
              )}
              {state && (
                <Link className="menu-link" href={`/${locale}/signalements`}>
                  <Icon name="clipboardList" size={16} /> {t.myReports}
                </Link>
              )}
              {/* Console, series C: write to the platform's support, for every profile. */}
              {state && (
                <Link className="menu-link" href={`/${locale}/support`}>
                  <Icon name="message" size={16} /> {t.support}
                </Link>
              )}
              {/* Wave 16 (M1): one line per setting, label left, compact control right. */}
              <hr className="menu-separator" />
              <div className="menu-row">
                <label className="menu-heading" htmlFor="account-language">
                  <Icon name="globe" size={16} /> {t.language}
                </label>
                <LanguageChoice t={t} locale={locale} id="account-language" />
              </div>
              <div className="menu-row">
                <span className="menu-heading">{t.theme}</span>
                <ThemeChoice t={t} />
              </div>
              <div className="menu-row">
                <label className="menu-heading" htmlFor="account-text-size">
                  {t.textSize}
                </label>
                <TextSizeChoice t={t} id="account-text-size" />
              </div>
              <ContrastChoice t={t} />
              {state && (
                <>
                  <hr className="menu-separator" />
                  <button type="button" className="menu-link" disabled={busy} onClick={() => void signOut()}>
                    <Icon name="logOut" size={16} /> {t.signOut}
                  </button>
                </>
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
                pages={[{ route: "", label: t.home }, { route: "/guide", label: t.guide }, { route: "/signalements?new=1", label: t.feedback }, { route: "/support", label: t.support }, { route: "/nouveautes", label: t.news }, ...groups.flatMap((g) => g.items.map((i) => ({ route: i.route, label: t[i.label] }))), ...settingsPages]}
                actions={paletteActions({
                  kind: state?.selected?.kind,
                  role,
                  permissions: state?.permissions ?? [],
                  disabled: state?.selected?.disabled_modules ?? [],
                  seasons: state?.seasons?.length ?? 0,
                  teams: state?.teams?.length ?? 0,
                })}
                collect={club && !(state?.selected?.disabled_modules ?? []).includes("dues") && (state?.permissions ?? []).includes("dues.manage")}
              />
            </div>
            <div className="topbar-tools">
              {!state && (
                <Link className="button secondary" href={`/${locale}/access`}>
                  {t.access}
                </Link>
              )}
              {club && !member && <ScopeBar t={t} />}
              {/* G10: « Aide », the how-to sheet of this page for the reader's role (or all the sheets). */}
              {state?.selected && (
                <Link className="icon-button help-link" href={helpHref} aria-label={t.help} title={t.help}>
                  <Icon name="help" size={18} />
                </Link>
              )}
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
          {state?.selected?.suspended_at && (
            <p className="suspended-banner" role="status">
              <Icon name="lock" size={16} /> {t.suspended.replace("{reason}", state.selected.suspended_reason ?? "")}
            </p>
          )}
          {children}
          <ToastHost locale={locale} />
        </div>
        {signedIn && <FirstSteps locale={locale} role={role} />}
        {/* 8: « Vos informations sont-elles toujours exactes ? » once a season, at sign-in. */}
        {signedIn && club && <SeasonCheckPrompt locale={locale} contextId={selectedId} />}
        {bottom.length > 0 && (
          <nav className="bottom-nav" aria-label={t.bottomNav} data-hidden={typing || undefined}>
            {bottom.map((i) => {
              const todo = badgeOf(i.route);
              return (
                <Link key={i.route} href={`/${locale}${i.route}`} aria-current={current(i.route)}>
                  <span className="bottom-icon">
                    <Icon name={i.icon} size={22} />
                    {todo && todo.count > 0 && (
                      <span className="bottom-badge" aria-hidden="true">
                        <Badge tone={todo.tone === "danger" ? "danger" : "warning"}>{todo.count}</Badge>
                      </span>
                    )}
                  </span>
                  <span className="bottom-label">{t[i.label]}</span>
                  {todo && todo.count > 0 && <span className="sr-only"> · {t.pendingCount.replace("{n}", String(todo.count))}</span>}
                </Link>
              );
            })}
            <button type="button" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <span className="bottom-icon">
                <Icon name="menu" size={22} />
              </span>
              <span className="bottom-label">{t.groupMore}</span>
            </button>
          </nav>
        )}
      </div>
      {feedback && <FeedbackDialog locale={locale} close={() => setFeedback(false)} />}
    </ScopeProvider>
  );
}
/** The season capsule of the top bar (wave 12); the team is a filter of the pages that need it (12/11/2026). */
function ScopeBar({ t }: { t: Copy }) {
  const scope = useScope();
  const season = useRef<HTMLSelectElement>(null);
  // "Changer de saison" and "Changer d'équipe" of the Ctrl+K window (wave 15, C6) land here.
  useEffect(() => {
    const focus = (e: Event) => {
      // 12/11/2026: only the season is chosen here; each page that needs it has its own team filter.
      const target = season.current;
      if (!target) return;
      target.focus();
      try {
        target.showPicker();
      } catch {
        /* Some browsers only open a picker on a click; the focus is enough. */
      }
    };
    window.addEventListener(scopeFocusEvent, focus);
    return () => window.removeEventListener(scopeFocusEvent, focus);
  }, []);
  if (!scope.organizationId || !scope.seasons.length) return null;
  const open = scope.seasons.filter((s) => !s.archived),
    archived = scope.seasons.filter((s) => s.archived);
  return (
    <div className="scope-bar">
      {/* Wave 16 (B1): a capsule whose choice narrows the view is tinted; no chip under the bar any more. */}
      <label className="capsule" data-active={scope.seasonId && scope.seasonId !== defaultSeasonId(scope.seasons) ? "" : undefined}>
        <span className="capsule-label">{t.season}</span>
        <select ref={season} aria-label={t.season} value={scope.seasonId ?? ""} onChange={(e) => scope.setSeason(e.target.value || null)}>
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
    </div>
  );
}
