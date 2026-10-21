import { moduleOfPath } from "../domains/access/rights";
import type { Role } from "../domains/access/policy";
import type { Locale } from "../lib/locale";
import type { IconName } from "./icons";
import type { shellCopy } from "./shell-copy";
import type { SeasonOption, TeamOption } from "../domains/scope/service";
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
  fundraisingOpen?: boolean;
  avatarVersion?: string | null;
  seasons?: SeasonOption[];
  teams?: TeamOption[];
};
export type NavItem = { route: string; label: keyof Copy; icon: IconName };
export type NavGroup = {
  id: string;
  label: keyof Copy;
  icon: IconName;
  items: NavItem[];
  /** Folded unless it holds the current page ("Plus"). */
  folded?: boolean;
};
/**
 * Menu structure. Since wave 10 the menu follows the role: club presidents see
 * every module; coaches see the modules their rights cover; players and
 * guardians see their own space only. Wave 14 regroups the president's menu
 * (Équipes, Activités, Communication, Argent, Club, Plus); the other roles
 * keep the wave 10 groups. Each page still enforces its own permissions
 * server-side. "Mon espace" lives in the account menu at the foot of the bar.
 */
export function menuGroups(state: Workspace | null): NavGroup[] {
  const perms = new Set(state?.permissions ?? []);
  const has = (...p: string[]) => p.some((x) => perms.has(x));
  const manager = perms.has("registrations.manage");
  const kind = state?.selected?.kind;
  const role = state?.contexts.find((c) => c.id === state.selected?.id)?.role;
  const member = role === "player" || role === "guardian";
  const registrations: NavItem = {
    route: manager ? "/registrations" : "/registrations/mine",
    label: manager ? "registrations" : "mine",
    icon: "userPlus",
  };
  const item = (route: string, label: keyof Copy, icon: IconName, allowed = true): NavItem[] =>
    allowed ? [{ route, label, icon }] : [];
  const off = new Set(state?.selected?.disabled_modules ?? []);
  const president = kind === "club" && role === "club_president";
  const club: NavGroup[] =
    kind === "club" && member
      ? [
          {
            id: "mine",
            label: "mySpace",
            icon: "user",
            items: [
              ...item("/calendar", "calendar", "calendar"),
              ...item("/players", "myFile", "players"),
              ...item("/documents", "documents", "document"),
              ...item("/dues", "dues", "dues"),
              ...item("/fundraising", "fundraising", "piggyBank", !!state?.fundraisingOpen),
              registrations,
            ],
          },
        ]
      : president
        ? [
            {
              id: "teams",
              label: "groupTeams",
              icon: "team",
              items: [
                ...item("/teams", "teams", "team", has("people.read", "teams.manage")),
                ...item("/players", "players", "players", has("people.read")),
                ...item("/coaches", "coaches", "whistle", has("members.read", "mandates.manage")),
                ...(manager ? [registrations] : []),
                ...item("/attendance", "attendance", "attendance", has("attendance.manage", "calendar.manage")),
                ...item("/licenses", "licenses", "badgeCheck", has("people.read")),
                ...item("/statistics", "statistics", "chart", has("attendance.manage", "calendar.manage", "people.read")),
              ],
            },
            {
              id: "activities",
              label: "groupActivities",
              icon: "calendar",
              items: [
                ...item("/calendar", "calendar", "calendar"),
                ...item("/matches", "matches", "trophy", has("calendar.read", "calendar.manage")),
                ...item("/trips", "trips", "bus", has("calendar.read", "calendar.manage")),
                ...item("/venues", "halls", "pin", has("calendar.manage")),
                ...item("/federal-calendar", "federalCalendar", "landmark", has("calendar.read", "calendar.manage")),
              ],
            },
            {
              id: "communication",
              label: "groupCommunication",
              icon: "megaphone",
              items: [
                ...item("/communication", "communication", "megaphone", has("notifications.manage", "calendar.manage")),
                ...item("/documents", "documents", "document"),
              ],
            },
            {
              id: "money",
              label: "groupMoney",
              icon: "funding",
              items: [
                ...item("/funding", "finances", "funding", has("dues.read", "dues.manage")),
                ...item("/dues", "dues", "dues", has("dues.read", "dues.manage")),
                ...item("/fundraising", "pots", "piggyBank", has("dues.read", "dues.manage")),
              ],
            },
            {
              id: "clubGroup",
              label: "groupClub",
              icon: "club",
              items: [
                ...item("/club/manage", "clubManage", "club", has("mandates.manage")),
                ...item("/equipment", "equipment", "wheelchair", has("equipment.manage")),
                ...item("/contacts", "contacts", "message", has("mandates.manage", "people.manage", "notifications.manage")),
              ],
            },
            {
              id: "more",
              label: "groupMore",
              icon: "settings",
              folded: true,
              items: [
                ...item("/reminders", "reminders", "bellRing", !off.has("reminders") && has("dues.manage", "documents.manage", "notifications.manage")),
                ...item("/privacy", "privacy", "shield", has("audit.read", "mandates.manage")),
                ...item("/offline-book", "offlineBook", "bookLock", !off.has("trips") && has("calendar.read", "calendar.manage")),
                ...item("/settings", "settings", "settings"),
              ],
            },
          ]
        : kind === "club"
          ? [
              {
                id: "players",
                label: "groupPlayers",
                icon: "players",
                items: [
                  ...item("/players", "players", "players", has("people.read")),
                  ...item("/teams", "teams", "team", has("people.read", "teams.manage") || role === "coach"),
                  ...(manager ? [registrations] : []),
                  ...item("/attendance", "attendance", "attendance", has("attendance.manage", "calendar.manage")),
                  ...item("/licenses", "licenses", "badgeCheck", has("people.read")),
                  ...item("/statistics", "statistics", "chart", has("attendance.manage", "calendar.manage", "people.read")),
                ],
              },
              {
                id: "life",
                label: "club",
                icon: "calendar",
                items: [
                  ...item("/calendar", "calendar", "calendar"),
                  ...item("/matches", "matches", "trophy", has("calendar.read", "calendar.manage")),
                  // Trips and halls are reached from the calendar page (wave 11).
                  ...item("/federal-calendar", "federalCalendar", "landmark", has("calendar.read", "calendar.manage")),
                  ...item("/documents", "documents", "document"),
                  // Club mails: newsletters (notifications.manage), event mails (planners).
                  ...item("/communication", "communication", "megaphone", has("notifications.manage", "calendar.manage") || role === "coach"),
                ],
              },
              {
                id: "management",
                label: "groupManagement",
                icon: "club",
                items: [
                  ...item("/club/manage", "clubManage", "club", has("mandates.manage")),
                  ...item("/coaches", "coaches", "whistle", has("members.read", "mandates.manage")),
                  ...item("/contacts", "contacts", "message", role === "coach" || has("mandates.manage", "people.manage", "notifications.manage")),
                  ...item("/equipment", "equipment", "wheelchair", has("equipment.manage")),
                ],
              },
              {
                id: "finance",
                label: "groupFinance",
                icon: "funding",
                items: [
                  ...item("/funding", "funding", "funding", has("dues.read", "dues.manage")),
                  ...item("/dues", "dues", "dues", has("dues.read", "dues.manage")),
                  ...item("/funding/grants", "grants", "document", has("dues.read", "dues.manage")),
                  ...item("/funding/partners", "partners", "team", has("dues.read", "dues.manage")),
                  ...item("/fundraising", "fundraising", "piggyBank", has("dues.read", "dues.manage")),
                ],
              },
            ]
          : kind === "federation"
            ? [
                {
                  id: "federation",
                  label: "groupFederation",
                  icon: "landmark",
                  items: [
                    ...((role === "referee"
                      ? [{ route: "/referee", label: "refereeSpace", icon: "whistle" }]
                      : [
                          { route: "/federation/clubs", label: "federationClubs", icon: "club" },
                          { route: "/federation/courses", label: "courses", icon: "team" },
                          { route: "/federation/licenses", label: "federationLicenses", icon: "badgeCheck" },
                          { route: "/federation/referees", label: "designations", icon: "whistle" },
                        ]) satisfies NavItem[]),
                    { route: "/calendar", label: "calendar", icon: "calendar" },
                    { route: "/venues", label: "venues", icon: "pin" },
                    { route: "/documents", label: "documents", icon: "document" },
                  ],
                },
              ]
            : [];
  // Modules the club switched off leave the menu (their routes refuse too).
  const shown = (items: NavItem[]) =>
    items.filter((i) => {
      const m = moduleOfPath(i.route);
      return !m || !off.has(m);
    });
  const groups = club.map((g) => ({ ...g, items: shown(g.items) })).filter((g) => g.items.length > 0);
  if (president) return groups;
  const admin: NavGroup = {
      id: "admin",
      label: "admin",
      icon: "settings",
      items: [
        ...(state?.selected
          ? ([
              ...(kind === "club" && !member
                ? ([
                    ...item("/reminders", "reminders", "bellRing", !off.has("reminders") && has("dues.manage", "documents.manage", "notifications.manage")),
                    ...item("/privacy", "privacy", "shield", has("audit.read", "mandates.manage")),
                  ] satisfies NavItem[])
                : []),
              { route: "/settings", label: "settings", icon: "settings" },
            ] satisfies NavItem[])
          : state
            ? ([registrations] satisfies NavItem[])
            : []),
        ...(kind === "club" && !member && !off.has("trips") && has("calendar.read", "calendar.manage")
          ? ([{ route: "/offline-book", label: "offlineBook", icon: "bookLock" }] satisfies NavItem[])
          : []),
      ],
    };
  return [...groups, admin].filter((g) => g.items.length > 0);
}

/**
 * The bar at the bottom of a phone screen (wave 15, C5): home and three
 * shortcuts taken from the role's own menu (so rights and switched-off
 * modules apply), then "Plus" opens the whole menu.
 * President: calendar, players, dues. Coach: calendar, attendance, players.
 * Player or parent: calendar, my file (or the child's), dues.
 */
export function bottomNav(state: Workspace | null): NavItem[] {
  if (!state?.selected) return [];
  const all = menuGroups(state).flatMap((g) => g.items);
  const role = state.contexts.find((c) => c.id === state.selected?.id)?.role;
  const wanted =
    role === "club_president"
      ? ["/calendar", "/players", "/dues"]
      : role === "coach"
        ? ["/calendar", "/attendance", "/players"]
        : role === "player" || role === "guardian"
          ? ["/calendar", "/players", "/dues"]
          : null;
  const items = wanted
    ? wanted.map((route) => all.find((i) => i.route === route)).filter((i): i is NavItem => !!i)
    : all.filter((i) => i.route !== "/settings").slice(0, 3);
  const home: NavItem = { route: "", label: "home", icon: "home" };
  return [home, ...items].slice(0, 4);
}
