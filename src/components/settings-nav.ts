import type { IconName } from "./icons";

/**
 * Settings categories (wave 15, observation C13). Pure module: the settings
 * pages, the command palette and the tests share it. Visibility follows the
 * same rules as the panels it groups; the services still check every right.
 */
export const settingsCategories = ["account", "notifications", "data", "club", "members", "seasons", "activities", "documents", "money", "journals"] as const;
export type SettingsCategory = (typeof settingsCategories)[number];
export const isSettingsCategory = (x: string): x is SettingsCategory => (settingsCategories as readonly string[]).includes(x);

export const categoryIcons: Record<SettingsCategory, IconName> = {
  account: "userRound",
  notifications: "bell",
  data: "shield",
  club: "club",
  members: "players",
  seasons: "calendar",
  activities: "calendar",
  documents: "document",
  money: "funding",
  journals: "shield",
};

export type SettingsAccess = {
  kind?: string | null;
  role?: string | null;
  permissions: readonly string[];
  disabled?: readonly string[];
};

/** Which categories a profile sees, in menu order. */
export function visibleCategories(a: SettingsAccess): SettingsCategory[] {
  const has = (p: string) => a.permissions.includes(p);
  const club = a.kind === "club";
  const admin = a.role === "club_president" || a.role === "federation_president";
  const off = new Set(a.disabled ?? []);
  const shown: Record<SettingsCategory, boolean> = {
    account: true,
    notifications: true,
    // 12: « Mes données » for everyone; the club's personal data for audit.read or mandates.manage.
    data: true,
    club: club && (admin || has("mandates.manage")),
    // The federation's presidency finds its welcome journeys (referees, staff) here too.
    members: (club && has("mandates.manage")) || (a.kind === "federation" && admin),
    // 12: seasons and teams, and the season's passage (former « Gestion du club »).
    seasons: club && (has("teams.manage") || has("mandates.manage")),
    activities: club && has("mandates.manage"),
    // 28: the parental authorizations' texts.
    documents: club && has("documents.manage"),
    money: club && has("mandates.manage") && !off.has("dues"),
    journals: has("audit.read") || has("mandates.manage") || a.role === "club_president",
  };
  return settingsCategories.filter((c) => shown[c]);
}

/** One searchable setting: where it lives and the id of its heading. */
export const settingsEntries = [
  { id: "photo", category: "account", anchor: "settings-photo" },
  { id: "language", category: "account", anchor: "settings-language" },
  { id: "theme", category: "account", anchor: "settings-theme" },
  { id: "display", category: "account", anchor: "settings-display" },
  { id: "selfCoach", category: "account", anchor: "settings-self" },
  { id: "inbox", category: "notifications", anchor: "notif-inbox" },
  { id: "notifPreferences", category: "notifications", anchor: "notif-preferences" },
  { id: "digest", category: "notifications", anchor: "notif-digest" },
  { id: "templates", category: "notifications", anchor: "notif-templates" },
  { id: "queue", category: "notifications", anchor: "notif-queue" },
  { id: "reminders", category: "notifications", anchor: "settings-reminders" },
  { id: "setup", category: "club", anchor: "settings-setup" },
  { id: "identity", category: "club", anchor: "club-identity-title" },
  { id: "obligations", category: "club", anchor: "settings-obligations" },
  // 21: the agreement, the export, the closure, retention, the people's requests.
  { id: "security", category: "club", anchor: "security" },
  { id: "assemblyRules", category: "club", anchor: "settings-assembly-rules" },
  { id: "tax", category: "club", anchor: "settings-tax" },
  { id: "appearance", category: "club", anchor: "settings-appearance" },
  { id: "hallOfFame", category: "club", anchor: "settings-hall-of-fame" },
  { id: "modules", category: "club", anchor: "settings-modules" },
  { id: "coachRights", category: "members", anchor: "settings-access-title" },
  { id: "staffRoles", category: "members", anchor: "settings-roles" },
  { id: "rightProfiles", category: "members", anchor: "settings-profiles" },
  { id: "onboarding", category: "members", anchor: "settings-onboarding" },
  { id: "offboarding", category: "members", anchor: "settings-offboarding" },
  { id: "presence", category: "activities", anchor: "settings-presence" },
  { id: "teamPlaces", category: "activities", anchor: "settings-team-places" },
  { id: "eventTypes", category: "activities", anchor: "settings-event-types" },
  { id: "holidays", category: "activities", anchor: "settings-holidays" },
  { id: "taskTemplates", category: "activities", anchor: "settings-task-templates" },
  { id: "mileage", category: "activities", anchor: "settings-mileage" },
  { id: "duesRates", category: "money", anchor: "settings-dues-title" },
  { id: "fiscalYear", category: "money", anchor: "settings-fiscal-title" },
  { id: "rightsJournal", category: "journals", anchor: "journal-rights" },
  { id: "healthJournal", category: "journals", anchor: "journal-health" },
  { id: "myData", category: "data", anchor: "settings-my-data" },
  { id: "privacy", category: "data", anchor: "settings-club-data" },
  { id: "presidency", category: "club", anchor: "settings-presidency" },
  { id: "seasons", category: "seasons", anchor: "settings-seasons" },
  { id: "seasonPlan", category: "seasons", anchor: "settings-season-plan" },
  { id: "rollover", category: "seasons", anchor: "settings-rollover" },
  { id: "authorizations", category: "documents", anchor: "settings-authorizations" },
] as const satisfies readonly { id: string; category: SettingsCategory; anchor: string }[];
export type SettingsEntryId = (typeof settingsEntries)[number]["id"];
export type SettingsEntryCopy = Record<SettingsEntryId, { title: string; keywords: string }>;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Settings matching a query (title and keywords, accents ignored), among the categories shown. */
export function searchSettings(query: string, copy: SettingsEntryCopy, visible: readonly SettingsCategory[]) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return settingsEntries.filter((e) => {
    if (!visible.includes(e.category)) return false;
    const text = fold(`${copy[e.id].title} ${copy[e.id].keywords}`);
    return words.every((w) => text.includes(w));
  });
}

/** Anchors of the single settings page before wave 15, and where they live now. */
export const legacyAnchors: Record<string, SettingsCategory> = {
  "settings-self": "account",
  "settings-notifications": "notifications",
  "settings-access": "members",
  "settings-access-title": "members",
  "settings-profiles": "members",
  "settings-presence": "activities",
  "settings-dues": "money",
  "settings-dues-title": "money",
  "settings-modules": "club",
  "journal-rights": "journals",
  "journal-health": "journals",
};
