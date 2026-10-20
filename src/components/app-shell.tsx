"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { labels, type Role } from "@/domains/access/policy";
import { moduleOfPath } from "@/domains/access/rights";
import type { Locale } from "@/lib/locale";
import { BrandLogo, Icon, type IconName } from "./icons";
import { shellCopy } from "./shell-copy";
import { CommandPalette } from "./command-palette";
export { shellCopy };
type Copy = (typeof shellCopy)[Locale];
export type Workspace = {
  user: { name: string };
  contexts: { id: string; name: string; role: Role }[];
  profiles: {
    id: string;
    mandate_id: string;
    name: string;
    is_default: boolean;
  }[];
  selected?: {
    id: string;
    organization_id: string;
    organization_name: string;
    kind: "club" | "federation";
    logo_version: string | null;
    disabled_modules?: string[];
  };
  permissions: string[];
};
type NavItem = { route: string; label: keyof Copy; icon: IconName };
type NavGroup = {
  id: string;
  label: keyof Copy;
  icon: IconName;
  items: NavItem[];
};
/**
 * Menu structure. Club groups appear once a profile is active; each page still
 * enforces its own permissions server-side. Statistics are reached from the
 * home dashboard, not from the menu.
 */
export function menuGroups(state: Workspace | null): NavGroup[] {
  const manager = !!state?.permissions.includes("registrations.manage");
  const kind = state?.selected?.kind;
  const role = state?.contexts.find((c) => c.id === state.selected?.id)?.role;
  const registrations: NavItem = {
    route: manager ? "/registrations" : "/registrations/mine",
    label: manager ? "registrations" : "mine",
    icon: "inbox",
  };
  const club: NavGroup[] =
    kind === "club"
      ? [
          {
            id: "players",
            label: "groupPlayers",
            icon: "players",
            items: [
              { route: "/players", label: "players", icon: "players" },
              registrations,
              { route: "/attendance", label: "attendance", icon: "attendance" },
              { route: "/licenses", label: "licenses", icon: "check" },
            ],
          },
          {
            id: "life",
            label: "club",
            icon: "calendar",
            items: [
              { route: "/calendar", label: "calendar", icon: "calendar" },
              { route: "/matches", label: "matches", icon: "whistle" },
              { route: "/trips", label: "trips", icon: "arrow" },
              { route: "/venues", label: "venues", icon: "club" },
              {
                route: "/federal-calendar",
                label: "federalCalendar",
                icon: "calendar",
              },
              { route: "/documents", label: "documents", icon: "document" },
              { route: "/messages", label: "messages", icon: "message" },
              // Club mails: newsletters (notifications.manage), event mails (planners).
              ...(state?.permissions.includes("notifications.manage") ||
              state?.permissions.includes("calendar.manage") ||
              role === "coach"
                ? [
                    {
                      route: "/communication",
                      label: "communication",
                      icon: "bell",
                    } satisfies NavItem,
                  ]
                : []),
            ],
          },
          {
            id: "management",
            label: "groupManagement",
            icon: "club",
            items: [
              { route: "/club/manage", label: "clubManage", icon: "club" },
              { route: "/coaches", label: "coaches", icon: "whistle" },
              { route: "/equipment", label: "equipment", icon: "wheelchair" },
            ],
          },
          {
            id: "finance",
            label: "groupFinance",
            icon: "dues",
            items: [
              { route: "/funding", label: "funding", icon: "funding" },
              { route: "/dues", label: "dues", icon: "dues" },
              { route: "/fundraising", label: "fundraising", icon: "chart" },
            ],
          },
        ]
      : kind === "federation"
        ? [
            {
              id: "federation",
              label: "groupFederation",
              icon: "club",
              items: [
                ...((role === "referee"
                  ? [
                      {
                        route: "/referee",
                        label: "refereeSpace",
                        icon: "whistle",
                      },
                    ]
                  : [
                      {
                        route: "/federation/clubs",
                        label: "federationClubs",
                        icon: "club",
                      },
                      {
                        route: "/federation/courses",
                        label: "courses",
                        icon: "team",
                      },
                      {
                        route: "/federation/licenses",
                        label: "federationLicenses",
                        icon: "check",
                      },
                      {
                        route: "/federation/referees",
                        label: "designations",
                        icon: "whistle",
                      },
                    ]) satisfies NavItem[]),
                { route: "/calendar", label: "calendar", icon: "calendar" },
                { route: "/venues", label: "venues", icon: "club" },
                { route: "/documents", label: "documents", icon: "document" },
                { route: "/messages", label: "messages", icon: "message" },
              ],
            },
          ]
        : [];
  // Modules the club switched off leave the menu (their routes refuse too).
  const off = new Set(state?.selected?.disabled_modules ?? []);
  const shown = (items: NavItem[]) =>
    items.filter((i) => {
      const m = moduleOfPath(i.route);
      return !m || !off.has(m);
    });
  return [
    ...club
      .map((g) => ({ ...g, items: shown(g.items) }))
      .filter((g) => g.items.length > 0),
    {
      id: "admin",
      label: "admin",
      icon: "settings",
      items: [
        ...(state?.selected
          ? ([
              { route: "/notifications", label: "notifications", icon: "bell" },
              ...(kind === "club"
                ? ([
                    ...(off.has("reminders")
                      ? []
                      : [
                          {
                            route: "/reminders",
                            label: "reminders",
                            icon: "message",
                          } satisfies NavItem,
                        ]),
                    { route: "/privacy", label: "privacy", icon: "lock" },
                  ] satisfies NavItem[])
                : []),
              { route: "/settings", label: "settings", icon: "settings" },
            ] satisfies NavItem[])
          : state
            ? ([registrations] satisfies NavItem[])
            : []),
        ...(kind === "club" && !off.has("trips")
          ? ([
              { route: "/offline-book", label: "offlineBook", icon: "lock" },
            ] satisfies NavItem[])
          : []),
        { route: "/access", label: "access", icon: "user" },
      ],
    },
  ];
}
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
export const themeScript = `try{var t=localStorage.getItem("pfm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
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
function ThemeToggle({ t }: { t: Copy }) {
  // null on the server: the button only appears once the real theme is known.
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => null);
  if (dark === null) return null;
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={dark ? t.light : t.dark}
      title={dark ? t.light : t.dark}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          window.localStorage.setItem("pfm-theme", next);
        } catch {
          /* Preference is kept for this page only. */
        }
        window.dispatchEvent(new Event("pfm-theme"));
      }}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
export function AppShell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const navigation = useRef<HTMLDetailsElement>(null);
  const path = usePathname(),
    t = shellCopy[locale];
  const [state, setState] = useState<Workspace | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");
    const resize = () => {
      if (navigation.current) navigation.current.open = media.matches;
    };
    resize();
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    // On small screens the menu closes after navigating.
    if (navigation.current && !window.matchMedia("(min-width: 761px)").matches)
      navigation.current.open = false;
  }, [path]);
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
  if (path.includes("/registration-widget/")) return children;
  function current(route: string) {
    const href = `/${locale}${route}`;
    if (path === href) return "page" as const;
    if (route && path.startsWith(href + "/")) return "true" as const;
    return undefined;
  }
  function item({ route, label, icon }: NavItem) {
    return (
      <Link
        key={route}
        href={`/${locale}${route}`}
        aria-current={current(route)}
      >
        <span className="nav-icon">
          <Icon name={icon} />
        </span>
        {t[label]}
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
  const role = state?.contexts.find((c) => c.id === state.selected?.id)?.role;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={`/${locale}`}>
          <BrandLogo height={26} />
          <span className="brand-text">Powerchair Football Manager</span>
        </Link>
        <details ref={navigation} className="sidebar-nav" open>
          <summary>
            <Icon name="menu" />
            {t.menu}
          </summary>
          <nav aria-label={t.menu}>
            {item({ route: "", label: "home", icon: "home" })}
            {menuGroups(state).map((group) => {
              const holds = group.items.some(
                (i) => current(i.route) !== undefined,
              );
              return (
                <details
                  key={group.id}
                  className="nav-group"
                  open={holds || undefined}
                  data-current={holds || undefined}
                >
                  <summary>
                    <span className="nav-icon">
                      <Icon name={group.icon} />
                    </span>
                    {t[group.label]}
                  </summary>
                  <div className="nav-items">{group.items.map(item)}</div>
                </details>
              );
            })}
          </nav>
        </details>
        <div className="sidebar-foot">
          {state?.user.name && (
            <span className="avatar" aria-hidden="true">
              {initials(state.user.name)}
            </span>
          )}
          <span>{state?.user.name ?? "Powerchair Football Manager"}</span>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="topbar-context">
            {state?.selected?.logo_version && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="org-logo"
                src={`/api/club/logo?org=${state.selected.organization_id}&v=${state.selected.logo_version}`}
                alt=""
              />
            )}
            <strong>
              {state?.selected?.organization_name ??
                (state ? t.noContext : "Powerchair Football Manager")}
            </strong>
            {role && <span className="role-chip">{labels[role][locale]}</span>}
          </div>
          <div className="topbar-tools">
            <div className="profile-switch">
              {state ? (
                <label>
                  {t.profile}
                  <select
                    aria-label={t.profile}
                    value={state.selected?.id ?? ""}
                    disabled={busy}
                    onChange={(e) => void change(e.target.value)}
                  >
                    <option value="" disabled>
                      {t.choose}
                    </option>
                    {state.contexts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {state.profiles?.find((p) => p.mandate_id === c.id)
                          ?.name ?? `${c.name} · ${labels[c.role][locale]}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <Link className="button secondary" href={`/${locale}/access`}>
                  {t.access}
                </Link>
              )}
            </div>
            <CommandPalette
              locale={locale}
              enabled={!!state?.selected}
              pages={[
                { route: "", label: t.home },
                ...menuGroups(state).flatMap((g) =>
                  g.items.map((i) => ({ route: i.route, label: t[i.label] })),
                ),
              ]}
            />
            <ThemeToggle t={t} />
          </div>
          {error && <p role="alert">{error}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}
