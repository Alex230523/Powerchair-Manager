// Pure dashboard shaping. No I/O here so ordering and visibility rules are unit-tested.
import type { Readiness } from "./presence";
export type Tone = "danger" | "warning" | "info";
export const todoKeys = [
  "documentsExpired",
  "registersToClose",
  "myAttendance",
  "myDocuments",
  "myApplications",
  "registrationsReview",
  "duesLate",
  "documentsReview",
  "registrationFollowups",
  "equipmentService",
  "courseRequests",
  "coursesExpiring",
  "documentsMissing",
  "documentsExpiring",
] as const;
export type TodoKey = (typeof todoKeys)[number];
export type Todo = { key: TodoKey; count: number; href: string; tone: Tone };
const todoMeta: Record<TodoKey, { href: string; tone: Tone }> = {
  documentsExpired: { href: "/documents", tone: "danger" },
  registersToClose: { href: "/attendance", tone: "danger" },
  myAttendance: { href: "/attendance", tone: "warning" },
  myDocuments: { href: "/documents", tone: "warning" },
  myApplications: { href: "/registrations/mine", tone: "warning" },
  registrationsReview: { href: "/registrations", tone: "warning" },
  duesLate: { href: "/dues?state=late", tone: "danger" },
  documentsReview: { href: "/documents", tone: "warning" },
  registrationFollowups: { href: "/registrations", tone: "warning" },
  equipmentService: { href: "/equipment", tone: "warning" },
  courseRequests: { href: "/federation/courses", tone: "warning" },
  coursesExpiring: { href: "/coaches", tone: "info" },
  documentsMissing: { href: "/documents", tone: "info" },
  documentsExpiring: { href: "/documents", tone: "info" },
};
/**
 * Keeps only actionable items (count > 0) that the caller computed under the
 * actor's permissions, most urgent first. A resolved cause simply yields 0 and
 * disappears: nothing is stored, so there is no stale alert to clear.
 */
export function buildTodos(counts: Partial<Record<TodoKey, number>>): Todo[] {
  return todoKeys
    .filter((key) => Number.isInteger(counts[key]) && (counts[key] ?? 0) > 0)
    .map((key) => ({ key, count: counts[key] as number, ...todoMeta[key] }));
}
export const metricKeys = [
  "activeMembers",
  "activePlayers",
  "activeTeams",
  "upcomingEvents",
  "pendingResponses",
  "waitingList",
  "acceptedRecently",
  "duesNext30",
  "treasury",
  "myNextDue",
] as const;
export type MetricKey = (typeof metricKeys)[number];
export type Metric = {
  key: MetricKey;
  value: number;
  format: "count" | "cents";
  href?: string;
  date?: string;
};
export function metric(
  key: MetricKey,
  value: number,
  extra: Partial<Omit<Metric, "key" | "value">> = {},
): Metric {
  return { key, value, format: "count", ...extra };
}
export type AgendaItem = {
  id: string;
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string;
  team: string | null;
  /** The team's palette key (wave 12), for the chip. */
  teamColor?: string | null;
  place: string | null;
  responseNeeded: boolean;
  /** Players and coaches who answered "present", against the club thresholds. */
  readiness?: Readiness;
};
/** An administrative date shown with the events: documents, dues, fundraising, trips. */
export type Deadline = {
  id: string;
  kind: "documents" | "dues" | "fundraising" | "trip" | "grant" | "partner";
  /** YYYY-MM-DD */
  date: string;
  title: string;
  count: number;
  cents?: number;
  href: string;
};
/** The money card of the president's home (wave 14): club-wide figures of the season in view. */
export type FinanceCard = {
  /** Null when the finance module is off (the dues figures stay). */
  treasury: number | null;
  income: number;
  expenses: number;
  dues: { due: number; collected: number; late: number; playersLate: number; rate: number | null } | null;
};
/** One event of the week view (wave 14): the calendar's own visibility rules apply. */
export type WeekEvent = {
  id: string;
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string;
  team: string | null;
  teamColor: string | null;
  place: string | null;
};
export type Dashboard = {
  /** Server time of the snapshot; the page renders dates from it, not from the client clock. */
  generatedAt: string;
  user: { name: string };
  context: null | {
    organization: string;
    kind: "club" | "federation";
    role: string;
    /** False when the club switched the statistics module off. */
    statistics?: boolean;
  };
  /** The season in view (top bar choice, else the current one). */
  season?: { id: string; name: string } | null;
  /** What the "Créer" menu may offer this actor. */
  can?: { event: boolean; player: boolean; operation: boolean; mail: boolean };
  todos: Todo[];
  metrics: Metric[];
  agenda: AgendaItem[];
  deadlines: Deadline[];
  /** Modules whose figures were computed for this actor; others are hidden, not zero. */
  scopes: string[];
  /** Only for people trusted with the club's money, with the modules on. */
  finance?: FinanceCard;
  /** The week asked for (?week=YYYY-MM-DD, a Monday), with its events. */
  week?: { from: string; to: string; events: WeekEvent[] };
};
export function formatCents(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
