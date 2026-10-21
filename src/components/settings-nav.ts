import type { IconName } from "./icons";

/**
 * Settings categories (wave 15, observation C13). Pure module: the settings
 * pages, the command palette and the tests share it. Visibility follows the
 * same rules as the panels it groups; the services still check every right.
 */
export const settingsCategories = ["account", "notifications", "club", "members", "activities", "money", "journals"] as const;
export type SettingsCategory = (typeof settingsCategories)[number];
export const isSettingsCategory = (x: string): x is SettingsCategory => (settingsCategories as readonly string[]).includes(x);

export const categoryIcons: Record<SettingsCategory, IconName> = {
  account: "userRound",
  notifications: "bell",
  club: "club",
  members: "players",
  activities: "calendar",
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
    club: club && (admin || has("mandates.manage")),
    members: club && has("mandates.manage"),
    activities: club && has("mandates.manage"),
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
  { id: "setup", category: "club", anchor: "settings-setup" },
  { id: "identity", category: "club", anchor: "club-identity-title" },
  { id: "appearance", category: "club", anchor: "settings-appearance" },
  { id: "modules", category: "club", anchor: "settings-modules" },
  { id: "coachRights", category: "members", anchor: "settings-access-title" },
  { id: "rightProfiles", category: "members", anchor: "settings-profiles" },
  { id: "presence", category: "activities", anchor: "settings-presence" },
  { id: "duesRates", category: "money", anchor: "settings-dues-title" },
  { id: "fiscalYear", category: "money", anchor: "settings-fiscal-title" },
  { id: "rightsJournal", category: "journals", anchor: "journal-rights" },
  { id: "healthJournal", category: "journals", anchor: "journal-health" },
  { id: "privacy", category: "journals", anchor: "settings-privacy" },
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
