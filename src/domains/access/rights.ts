import type { delegable } from "./policy";

/**
 * Rights shown module by module, on three levels: nothing, read, change.
 * The stored form stays the list of grants; a level is only a way to read and
 * write that list. Extras are independent switches inside a module (export,
 * health data, sensitive documents).
 */
export type Grant = (typeof delegable)[number];
export type Level = "none" | "read" | "edit";
export type RightsModule = {
  key: string;
  read?: Grant[];
  edit?: Grant[];
  extras?: Grant[];
};
export const rightsModules: RightsModule[] = [
  {
    key: "people",
    read: ["people.read"],
    edit: ["people.read", "people.manage"],
    extras: ["people.export", "people.sensitive"],
  },
  { key: "teams", edit: ["teams.manage"] },
  {
    key: "calendar",
    read: ["calendar.read"],
    edit: ["calendar.read", "calendar.manage"],
  },
  { key: "attendance", edit: ["attendance.manage"] },
  { key: "registrations", edit: ["registrations.manage"] },
  // H1: new players, from the first contact to the registration.
  { key: "recruitment", edit: ["recruitment.manage"] },
  {
    key: "documents",
    read: ["documents.read"],
    edit: ["documents.read", "documents.manage"],
    extras: ["documents.sensitive"],
  },
  { key: "money", read: ["dues.read"], edit: ["dues.read", "dues.manage"] },
  { key: "equipment", edit: ["equipment.manage"] },
  { key: "notifications", edit: ["notifications.manage"] },
  {
    key: "admin",
    extras: ["members.read", "invitations.create", "audit.read"],
  },
];

const has = (grants: readonly string[], list: readonly string[] = []) =>
  list.length > 0 && list.every((g) => grants.includes(g));

/** Current level of a module. dues.manage alone still counts as "change". */
export function levelOf(grants: readonly string[], m: RightsModule): Level {
  if (has(grants, m.edit) || (m.edit && grants.includes(m.edit.at(-1)!)))
    return "edit";
  if (has(grants, m.read)) return "read";
  return "none";
}
/** Levels a module offers ("read" only where a read grant exists). */
export function levelsOf(m: RightsModule): Level[] {
  if (!m.edit && !m.read) return [];
  return m.read ? ["none", "read", "edit"] : ["none", "edit"];
}
/** Sets a module to a level; extras are dropped when the module goes to "none". */
export function withLevel(
  grants: readonly string[],
  m: RightsModule,
  level: Level,
): Grant[] {
  const own = new Set([...(m.read ?? []), ...(m.edit ?? [])]);
  const kept = grants.filter(
    (g) => !own.has(g as Grant) && !(level === "none" && m.extras?.includes(g as Grant)),
  ) as Grant[];
  const added = level === "edit" ? (m.edit ?? []) : level === "read" ? (m.read ?? []) : [];
  return [...new Set([...kept, ...added])];
}
/** A delegator never grants more than they hold: the level is capped. */
export function allowedLevels(own: readonly string[], m: RightsModule): Level[] {
  return levelsOf(m).filter(
    (l) => l === "none" || (l === "read" ? has(own, m.read) : has(own, m.edit)),
  );
}

/** Ready-made profiles, applied in one click then adjustable. */
export const builtInProfiles: Record<string, Grant[]> = {
  field: ["people.read", "calendar.read", "attendance.manage", "documents.read"],
  head: [
    "people.read",
    "teams.manage",
    "calendar.read",
    "calendar.manage",
    "attendance.manage",
    "documents.read",
    "equipment.manage",
  ],
  treasurer: [
    "dues.read",
    "dues.manage",
    "people.read",
    "documents.read",
    "members.read",
  ],
  secretary: [
    "people.read",
    "people.manage",
    "registrations.manage",
    "documents.read",
    "documents.manage",
    "notifications.manage",
    "calendar.read",
    "members.read",
    "invitations.create",
  ],
  equipment: ["equipment.manage", "people.read", "calendar.read"],
  care: [
    "people.read",
    "people.sensitive",
    "documents.read",
    "documents.sensitive",
    "calendar.read",
  ],
  auditor: ["dues.read", "members.read", "audit.read"],
  none: [],
};

/** Modules a club may switch off. The core of the app always stays on. */
export const optionalModules = [
  "finance",
  "dues",
  "equipment",
  "matches",
  "licenses",
  "reminders",
  "communication",
  "statistics",
  "trips",
  "fundraising",
] as const;
export type OptionalModule = (typeof optionalModules)[number];
/** Menu routes and API paths owned by each optional module. */
export const moduleRoutes: Record<OptionalModule, string[]> = {
  finance: ["/funding", "/api/finance", "/api/funding", "/api/accounts", "/api/affiliations", "/api/bank"],
  dues: ["/dues", "/api/dues"],
  equipment: ["/equipment", "/api/equipment"],
  matches: ["/matches", "/api/matches"],
  licenses: ["/licenses", "/classification", "/federal-calendar", "/api/licenses", "/api/federal-calendar"],
  reminders: ["/reminders", "/api/reminders"],
  communication: ["/communication", "/api/communication"],
  statistics: ["/statistics", "/api/statistics/report"],
  trips: ["/trips", "/api/trips"],
  fundraising: ["/fundraising", "/api/fundraising"],
};
/** The module a path belongs to, if it is an optional one. */
export function moduleOfPath(path: string): OptionalModule | null {
  for (const m of optionalModules)
    if (moduleRoutes[m].some((r) => path === r || path.startsWith(r + "/")))
      return m;
  return null;
}
/** Known modules only, in a stable order. */
export function normalizeModules(disabled: readonly string[]): OptionalModule[] {
  return optionalModules.filter((m) => disabled.includes(m));
}
