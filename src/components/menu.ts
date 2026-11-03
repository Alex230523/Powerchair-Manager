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
    /** B8: approved for tax receipts. */
    tax_approved?: boolean;
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
  // 32: the federation's presidency holds every competence; a delegate, those of his roles.
  const fed = (...p: string[]) => role === "federation_president" || has(...p);
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
              // 27: the parents' space, every child of every club.
              ...item("/family", "family", "home", role === "guardian"),
              ...item("/calendar", "calendar", "calendar"),
              ...item("/tournaments", "tournaments", "trophy"),
              ...item("/players", "myFile", "players"),
              ...item("/documents", "documents", "document"),
              ...item("/dues", "dues", "dues"),
              ...item("/fundraising", "fundraising", "piggyBank", !!state?.fundraisingOpen),
              registrations,
              // Wave 17 (J3): « Visible par les autres clubs », the player's or the parent's choice.
              ...item("/transfers", "transfers", "handshake"),
              // 22: the tasks given to them (A1 sends reminders that lead here).
              ...item("/tasks", "tasks", "clipboardList"),
              // 33: the federation's circulars, for every member of an affiliated club.
              ...item("/circulars", "circulars", "megaphone"),
              // H3: the polls to answer (and, for who may ask, to create).
              ...item("/sondages", "polls", "clipboardList"),
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
                // Wave 16 (E2): the coaches' exercise sheets.
                ...item("/exercises", "exercises", "clipboardList", true),
                ...item("/classification", "classification", "badgeCheck", has("people.read")),
                // Wave 17 (J3): the transfer market between the federation's clubs.
                ...item("/transfers", "transfers", "handshake", has("people.read")),
                ...item("/statistics", "statistics", "chart", has("attendance.manage", "calendar.manage", "people.read", "teams.manage")),
              ],
            },
            {
              id: "activities",
              label: "groupActivities",
              icon: "calendar",
              items: [
                ...item("/calendar", "calendar", "calendar"),
                // B9: events open to the public (registration by a link).
                ...item("/events", "openEvents", "megaphone", has("calendar.manage", "mandates.manage")),
                ...item("/matches", "matches", "trophy", has("calendar.read", "calendar.manage")),
                ...item("/trips", "trips", "bus", has("calendar.read", "calendar.manage")),
                ...item("/venues", "halls", "pin", has("calendar.manage")),
                ...item("/tournaments", "tournaments", "trophy"),
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
                // Wave 17 (N1): one « Finances » page with tabs, and « Cotisations » kept apart (often opened).
                ...item("/funding", "finances", "funding", has("dues.read", "dues.manage")),
                ...item("/dues", "dues", "dues", has("dues.read", "dues.manage")),
                // A2: grants and sponsors in one page, two views.
                ...item("/funding/grants-sponsors", "grantsSponsors", "handshake", has("dues.read", "dues.manage")),
                // 9: the fundraising in the menu (no more row of « Rentrées »).
                ...item("/fundraising", "fundraising", "piggyBank", has("dues.read", "dues.manage")),
              ],
            },
            {
              id: "clubGroup",
              label: "groupClub",
              icon: "club",
              items: [
                // B6: the public page, widgets, API keys and webhooks.
                ...item("/club/public", "publicPage", "globe"),
                // 17: the register of members and the assemblies, for the presidency (the secretary reaches it from the invitation).
                ...item("/club/association", "association", "landmark", president || has("mandates.manage")),
                ...item("/equipment", "equipment", "wheelchair", has("equipment.manage")),
                // B5: incidents and their insurance declaration.
                ...item("/incidents", "incidents", "alert", has("people.manage", "mandates.manage")),
                // 34: the federation's sanctions, the club's appeals and fines.
                ...item("/discipline", "discipline", "shield"),
                ...item("/contacts", "contacts", "message", has("mandates.manage", "people.manage", "notifications.manage")),
                // H1: new players, from the first contact to the registration.
                ...item("/recrutement", "recruitment", "userPlus", has("recruitment.manage")),
                // Wave 17 (O1): the club's tasks, by type.
                ...item("/tasks", "tasks", "clipboardList"),
                // 33: the federation's circulars, for every member of an affiliated club.
                ...item("/circulars", "circulars", "megaphone"),
                // H3: the polls to answer (and, for who may ask, to create).
                ...item("/sondages", "polls", "clipboardList"),
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
                  ...item("/exercises", "exercises", "clipboardList", role === "coach" || has("calendar.manage", "calendar.read")),
                  ...item("/classification", "classification", "badgeCheck", has("people.read")),
                  ...item("/transfers", "transfers", "handshake", has("people.read")),
                  ...item("/statistics", "statistics", "chart", has("attendance.manage", "calendar.manage", "people.read", "teams.manage") || role === "coach"),
                ],
              },
              {
                id: "life",
                label: "club",
                icon: "calendar",
                items: [
                  ...item("/calendar", "calendar", "calendar"),
                  ...item("/events", "openEvents", "megaphone", has("calendar.manage")),
                  ...item("/matches", "matches", "trophy", has("calendar.read", "calendar.manage")),
                  // Trips and halls are reached from the calendar page (wave 11).
                  ...item("/tournaments", "tournaments", "trophy"),
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
                  ...item("/coaches", "coaches", "whistle", has("members.read", "mandates.manage")),
                  ...item("/contacts", "contacts", "message", role === "coach" || has("mandates.manage", "people.manage", "notifications.manage")),
                  ...item("/recrutement", "recruitment", "userPlus", has("recruitment.manage")),
                  ...item("/equipment", "equipment", "wheelchair", has("equipment.manage")),
                  // B5: a coach reports an incident of his players.
                  ...item("/incidents", "incidents", "alert", role === "coach" || has("people.manage")),
                  // 34: the sanctions of the club's players (the coaches see them).
                  ...item("/discipline", "discipline", "shield", role === "coach"),
                  // A1: everyone has a to-do (only one's own tasks unless one plans).
                  ...item("/tasks", "tasks", "clipboardList"),
                  // 33: the federation's circulars, for every member of an affiliated club.
                  ...item("/circulars", "circulars", "megaphone"),
                  // H3: the polls to answer (and, for who may ask, to create).
                  ...item("/sondages", "polls", "clipboardList"),
                ],
              },
              {
                id: "finance",
                label: "groupFinance",
                icon: "funding",
                items: [
                  ...item("/funding", "finances", "funding", has("dues.read", "dues.manage")),
                  ...item("/dues", "dues", "dues", has("dues.read", "dues.manage")),
                  // A2: grants and sponsors in one page, two views.
                  ...item("/funding/grants-sponsors", "grantsSponsors", "handshake", has("dues.read", "dues.manage")),
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
                          // Wave 16 (I3): the order of the federation president's day; 32: each entry by competence.
                          ...item("/federation/clubs", "federationClubs", "club", fed("federation.licences")),
                          ...item("/federation/teams", "federationTeams", "players", fed("federation.licences")),
                          ...item("/tournaments", "tournaments", "trophy", fed("federation.competitions")),
                          ...item("/federation/referees", "designations", "whistle", fed("federation.referees")),
                          // 34: sanctions, appeals and fines.
                          ...item("/federation/discipline", "discipline", "shield", fed("federation.discipline")),
                          ...item("/federation/licenses", "federationLicenses", "badgeCheck", fed("federation.licences", "federation.classification")),
                          ...item("/transfers", "transfers", "handshake", fed("federation.licences")),
                          ...item("/federation/affiliations", "affiliations", "landmark", fed("federation.licences", "federation.finance")),
                          ...item("/federation/courses", "courses", "team", fed("federation.courses")),
                          // 4: the federal library of exercise and tactic sheets.
                          ...item("/exercises", "exercises", "clipboardList", fed("federation.courses")),
                          // Wave 17 (Q1): the federation's own fleet of chairs, lent to the clubs.
                          ...item("/equipment", "equipment", "wheelchair", fed("federation.competitions")),
                          // 32: the presidency's delegates and their roles.
                          ...item("/federation/team", "federationTeam", "userPlus", role === "federation_president"),
                        ]) satisfies NavItem[]),
                    // 33: the circulars (written by communication, read by the referees).
                    ...item("/circulars", "circulars", "megaphone"),
                    // H3: the polls to answer (and, for who may ask, to create).
                    ...item("/sondages", "polls", "clipboardList"),
                    ...(role === "referee" ? ([{ route: "/tournaments", label: "tournaments", icon: "trophy" }] satisfies NavItem[]) : []),
                    { route: "/calendar", label: "calendar", icon: "calendar" },
                    { route: "/venues", label: "venues", icon: "pin" },
                    { route: "/documents", label: "documents", icon: "document" },
                    // A1: the federation's own to-do.
                    { route: "/tasks", label: "tasks", icon: "clipboardList" },
                  ],
                },
                // 35: the federation as an ASBL: its own books and its assembly, by the finance competence.
                {
                  id: "finance",
                  label: "groupFinance",
                  icon: "funding",
                  items: [
                    ...item("/funding", "finances", "funding", role !== "referee" && fed("federation.finance")),
                    ...item("/funding/grants-sponsors", "grantsSponsors", "handshake", role !== "referee" && fed("federation.finance")),
                    ...item("/club/association", "association", "landmark", role !== "referee" && fed("federation.finance")),
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
  // 12: without a profile chosen, the registrations; « Réglages » is the shell's last entry (settingsItem).
  const admin: NavGroup = {
    id: "admin",
    label: "admin",
    icon: "settings",
    items: !state?.selected && state ? [registrations] : [],
  };
  return [...groups, admin].filter((g) => g.items.length > 0);
}

/**
 * The bar at the bottom of a phone screen (wave 15, C5): home and three
 * shortcuts taken from the role's own menu (so rights and switched-off
 * modules apply), then "Plus" opens the whole menu.
 * President: calendar, players, dues. Coach: calendar, attendance, players.
 * Player or parent: calendar, my file (or the child's), dues.
 * With a task of one's own open (22), « Tâches » replaces the third.
 */
/**
 * 12: one « Réglages » at the foot of the menu, for every profile, under the
 * groups (no « Plus » group any more). Personal data, the club's identity,
 * members, seasons and modules are categories of Réglages.
 */
export const settingsItem: NavItem = { route: "/settings", label: "settings", icon: "settings" };

export function bottomNav(state: Workspace | null, openTasks = 0): NavItem[] {
  if (!state?.selected) return [];
  const all = menuGroups(state).flatMap((g) => g.items);
  const role = state.contexts.find((c) => c.id === state.selected?.id)?.role;
  const wanted =
    role === "club_president"
      ? ["/calendar", "/players", "/dues"]
      : role === "coach"
        ? ["/calendar", "/attendance", "/players"]
        : role === "guardian"
          ? // 27: a parent's first shortcut is the family.
            ["/family", "/calendar", "/dues"]
          : role === "player"
            ? ["/calendar", "/players", "/dues"]
          : null;
  const items = wanted
    ? wanted.map((route) => all.find((i) => i.route === route)).filter((i): i is NavItem => !!i)
    : all.filter((i) => i.route !== "/settings").slice(0, 3);
  // 22: with a task open, « Tâches » takes the last shortcut.
  const tasks = all.find((i) => i.route === "/tasks");
  if (openTasks > 0 && tasks && !items.includes(tasks)) items.splice(Math.min(items.length, 2), 1, tasks);
  const home: NavItem = { route: "", label: "home", icon: "home" };
  return [home, ...items].slice(0, 4);
}
