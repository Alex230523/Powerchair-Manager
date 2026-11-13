import { moduleOfPath } from "../domains/access/rights";
import type { Role } from "../domains/access/policy";
import type { Locale } from "../lib/locale";
import type { IconName } from "./icons";
import type { shellCopy } from "./shell-copy";
import type { SeasonOption, TeamOption } from "../domains/scope/service";
type Copy = (typeof shellCopy)[Locale];
export type Workspace = {
  user: { name: string; email?: string };
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
    /** 12/11/2026: null for a club without a federation. */
    federation_id?: string | null;
    logo_version: string | null;
    disabled_modules?: string[];
    /** B8: approved for tax receipts. */
    tax_approved?: boolean;
    /** Console, step 3: suspended by the platform, read only, with the reason. */
    suspended_at?: string | null;
    suspended_reason?: string;
  };
  permissions: string[];
  fundraisingOpen?: boolean;
  /** 13/11/2026: on the staff of a national team. */
  nationalStaff?: boolean;
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
  // 12/11/2026: a club without a federation has no transfers, classification, discipline nor circulars to show.
  const affiliated = kind !== "club" || state?.selected?.federation_id !== null;
  const president = kind === "club" && role === "club_president";
  /*
   * 13/11/2026: one order for every club profile, the president's and the staff's
   * alike (each entry still follows its rights): what one does every day first.
   *   Agenda · Sport · Personnes · Communication · Finances · Club · Fédération
   * The members (players, parents): Mon espace · Au club · Compétitions.
   */
  const staff = president || role === "coach";
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
              ...item("/players", "myFile", "players"),
              ...item("/calendar", "calendar", "calendar"),
              // 22: the tasks given to them (A1 sends reminders that lead here).
              ...item("/tasks", "tasks", "clipboardList"),
            ],
          },
          {
            id: "atClub",
            label: "groupAtClub",
            icon: "club",
            items: [
              ...item("/documents", "documents", "document"),
              ...item("/dues", "dues", "dues"),
              registrations,
              ...item("/fundraising", "fundraising", "piggyBank", !!state?.fundraisingOpen),
            ],
          },
          {
            id: "competitions",
            label: "groupCompetitions",
            icon: "trophy",
            items: [
              ...item("/tournaments", "tournaments", "trophy"),
              // Wave 17 (J3): « Visible par les autres clubs », the player's or the parent's choice.
              ...item("/transfers", "transfers", "handshake", affiliated),
              // 12/11/2026: the federation's page (its circulars, tournaments, transfers, clubs).
              ...item("/club/federation", "clubFederation", "landmark", affiliated),
            ],
          },
        ]
      : kind === "club"
        ? [
            {
              id: "agenda",
              label: "groupAgenda",
              icon: "calendar",
              items: [
                ...item("/calendar", "calendar", "calendar"),
                // A1: everyone has a to-do (only one's own tasks unless one plans).
                ...item("/tasks", "tasks", "clipboardList"),
                ...item("/trips", "trips", "bus", has("calendar.read", "calendar.manage")),
                // B9: events open to the public (registration by a link).
                ...item("/events", "openEvents", "megaphone", has("calendar.manage", "mandates.manage")),
                ...item("/venues", "halls", "pin", has("calendar.manage")),
              ],
            },
            {
              id: "sport",
              label: "groupSport",
              icon: "team",
              items: [
                ...item("/teams", "teams", "team", has("people.read", "teams.manage") || role === "coach"),
                // 13/11/2026: a coach takes the roll of the teams he coaches, whatever his rights.
                ...item("/attendance", "attendance", "attendance", has("attendance.manage", "calendar.manage") || role === "coach"),
                ...item("/matches", "matches", "trophy", has("calendar.read", "calendar.manage")),
                ...item("/tournaments", "tournaments", "trophy"),
                // Wave 16 (E2): the coaches' exercise sheets.
                ...item("/exercises", "exercises", "clipboardList", staff || has("calendar.manage", "calendar.read")),
                ...item("/statistics", "statistics", "chart", has("attendance.manage", "calendar.manage", "people.read", "teams.manage") || role === "coach"),
              ],
            },
            {
              id: "people",
              label: "groupPeople",
              icon: "players",
              items: [
                ...item("/players", "players", "players", has("people.read")),
                ...item("/coaches", "coaches", "whistle", has("members.read", "mandates.manage")),
                ...(manager ? [registrations] : []),
                ...item("/contacts", "contacts", "message", role === "coach" || has("mandates.manage", "people.manage", "notifications.manage")),
              ],
            },
            {
              id: "communication",
              label: "groupCommunication",
              icon: "megaphone",
              items: [
                // Club mails: newsletters (notifications.manage), event mails (planners).
                ...item("/communication", "communication", "megaphone", has("notifications.manage", "calendar.manage") || role === "coach"),
                ...item("/documents", "documents", "document"),
                // B6: the public page, widgets, API keys and webhooks.
                ...item("/club/public", "publicPage", "globe", president || has("mandates.manage")),
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
                // 17: the register of members and the assemblies, for the presidency (the secretary reaches it from the invitation).
                ...item("/club/association", "association", "landmark", president || has("mandates.manage")),
                ...item("/equipment", "equipment", "wheelchair", has("equipment.manage")),
              ],
            },
            {
              id: "federationGroup",
              label: "groupFederation",
              icon: "landmark",
              items: [
                // 12/11/2026: the federation's page (circulars, tournaments, transfers, discipline, clubs).
                ...item("/club/federation", "clubFederation", "landmark", affiliated),
                ...item("/classification", "classification", "badgeCheck", affiliated && has("people.read")),
                // Wave 17 (J3): the transfer market between the federation's clubs.
                ...item("/transfers", "transfers", "handshake", affiliated && has("people.read")),
              ],
            },
          ]
        : kind === "federation" && role === "referee"
          ? [
              {
                id: "federation",
                label: "groupFederation",
                icon: "whistle",
                items: [
                  { route: "/referee", label: "refereeSpace", icon: "whistle" },
                  { route: "/tournaments", label: "tournaments", icon: "trophy" },
                  // 33: the circulars (written by communication, read by the referees).
                  ...item("/circulars", "circulars", "megaphone", affiliated),
                  { route: "/calendar", label: "calendar", icon: "calendar" },
                  { route: "/venues", label: "venues", icon: "pin" },
                  { route: "/documents", label: "documents", icon: "document" },
                  { route: "/tasks", label: "tasks", icon: "clipboardList" },
                ],
              },
            ]
          : kind === "federation"
            ? [
                /*
                 * 13/11/2026: the federation's 21 entries in five groups, the day first:
                 * Agenda · Clubs et licences · Compétitions · Formation · Administration. 32: each entry by competence.
                 */
                {
                  id: "agenda",
                  label: "groupAgenda",
                  icon: "calendar",
                  items: [
                    { route: "/calendar", label: "calendar", icon: "calendar" },
                    // A1: the federation's own to-do.
                    { route: "/tasks", label: "tasks", icon: "clipboardList" },
                    // 33: the circulars (written by communication, read by the clubs and the referees).
                    ...item("/circulars", "circulars", "megaphone", affiliated),
                    { route: "/documents", label: "documents", icon: "document" },
                    { route: "/venues", label: "venues", icon: "pin" },
                  ],
                },
                {
                  id: "clubs",
                  label: "groupClubsLicences",
                  icon: "club",
                  items: [
                    ...item("/federation/clubs", "federationClubs", "club", fed("federation.licences")),
                    ...item("/federation/teams", "federationTeams", "players", fed("federation.licences")),
                    ...item("/federation/licenses", "federationLicenses", "badgeCheck", fed("federation.licences", "federation.classification")),
                    // International, step 3 (06/11/2026): the registry of classifications.
                    ...item("/federation/registry", "registry", "medal", fed("federation.licences", "federation.classification", "federation.competitions", "federation.discipline")),
                    ...item("/federation/affiliations", "affiliations", "landmark", fed("federation.licences", "federation.finance")),
                    ...item("/transfers", "transfers", "handshake", fed("federation.licences")),
                    // International (05/11/2026): the federation's rulebook (amounts) and country.
                    ...item("/federation/policy", "policy", "globe", fed("federation.licences")),
                  ],
                },
                {
                  id: "competitions",
                  label: "groupCompetitions",
                  icon: "trophy",
                  items: [
                    ...item("/tournaments", "tournaments", "trophy", fed("federation.competitions")),
                    // 6: the federation's national teams.
                    ...item("/federation/national", "national", "medal", fed("federation.competitions")),
                    ...item("/federation/referees", "designations", "whistle", fed("federation.referees")),
                    // 34: sanctions, appeals and fines.
                    ...item("/federation/discipline", "discipline", "shield", fed("federation.discipline")),
                    // Lot 6 (05/11/2026): the commission's decisions, signed by its members.
                    ...item("/federation/commission", "commission", "document", fed("federation.licences", "federation.discipline")),
                  ],
                },
                {
                  id: "training",
                  label: "groupTraining",
                  icon: "team",
                  items: [
                    ...item("/federation/courses", "courses", "team", fed("federation.courses")),
                    // 4: the federal library of exercise and tactic sheets.
                    ...item("/exercises", "exercises", "clipboardList", fed("federation.courses")),
                    // Wave 17 (Q1): the federation's own fleet of chairs, lent to the clubs.
                    ...item("/equipment", "equipment", "wheelchair", fed("federation.competitions")),
                  ],
                },
                // 35: the federation as an ASBL: its own books and its assembly, by the finance competence; 32: its team.
                {
                  id: "finance",
                  label: "groupAdministration",
                  icon: "funding",
                  items: [
                    // 32: the presidency's delegates and their roles.
                    ...item("/federation/team", "federationTeam", "userPlus", role === "federation_president"),
                    ...item("/funding", "finances", "funding", fed("federation.finance")),
                    ...item("/funding/grants-sponsors", "grantsSponsors", "handshake", fed("federation.finance")),
                    ...item("/club/association", "association", "landmark", fed("federation.finance")),
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
  // 13/11/2026: the national staff (a club's coach, a federation account) finds its selection, whatever the profile.
  const national: NavGroup[] = state?.nationalStaff ? [{ id: "national", label: "groupNational", icon: "medal", items: [{ route: "/national", label: "nationalStaff", icon: "medal" }] }] : [];
  const groups = [...club.map((g) => ({ ...g, items: shown(g.items) })), ...national].filter((g) => g.items.length > 0);
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
