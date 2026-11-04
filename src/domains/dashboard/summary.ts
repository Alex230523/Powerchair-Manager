import type { Focus } from "./focus";
// Pure dashboard shaping. No I/O here so ordering and visibility rules are unit-tested.
import type { Readiness } from "./presence";
import type { SetupState } from "../setup/schema";
export type Tone = "danger" | "warning" | "info";
export const todoKeys = [
  "documentsExpired",
  "registersToClose",
  "myAttendance",
  "myDocuments",
  "myApplications",
  "myTasks",
  "registrationsReview",
  "duesLate",
  "sponsorTasks",
  "grantTasks",
  "documentsReview",
  "registrationFollowups",
  "equipmentService",
  "courseRequests",
  "coursesExpiring",
  "documentsMissing",
  "documentsExpiring",
  "teamsOverCapacity",
  "minorsWithoutGuardian",
] as const;
export type TodoKey = (typeof todoKeys)[number];
export type Todo = { key: TodoKey; count: number; href: string; tone: Tone };
const todoMeta: Record<TodoKey, { href: string; tone: Tone }> = {
  documentsExpired: { href: "/documents", tone: "danger" },
  registersToClose: { href: "/attendance", tone: "danger" },
  myAttendance: { href: "/attendance", tone: "warning" },
  myDocuments: { href: "/documents", tone: "warning" },
  myApplications: { href: "/registrations/mine", tone: "warning" },
  myTasks: { href: "/tasks", tone: "warning" },
  registrationsReview: { href: "/registrations", tone: "warning" },
  duesLate: { href: "/dues?state=late", tone: "danger" },
  sponsorTasks: { href: "/tasks", tone: "warning" },
  grantTasks: { href: "/tasks?kind=grant", tone: "warning" },
  documentsReview: { href: "/documents", tone: "warning" },
  registrationFollowups: { href: "/registrations", tone: "warning" },
  equipmentService: { href: "/equipment", tone: "warning" },
  courseRequests: { href: "/federation/courses", tone: "warning" },
  coursesExpiring: { href: "/coaches", tone: "info" },
  documentsMissing: { href: "/documents", tone: "info" },
  documentsExpiring: { href: "/documents", tone: "info" },
  teamsOverCapacity: { href: "/teams", tone: "warning" },
  // 8: minors nobody answers for.
  minorsWithoutGuardian: { href: "/players?missing=guardian", tone: "danger" },
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
/* ------------------------------------------------------- Board (wave 16, A) */
/** The squares of « À faire »: a fixed set that turns green when up to date, instead of disappearing. */
export type BoardKey = TodoKey | "documents" | "moneyTasks" | "clubStatus";
export type ClubStatusSquare = { done: number; total: number; late: number; next: { title: string; due: string | null }[] };
export type Square = {
  key: BoardKey;
  count: number;
  href: string;
  tone: Tone;
  /** Documents: expiring within 30 days, said but not counted as a problem. */
  expiring?: number;
  status?: ClubStatusSquare;
};
export type Board = { squares: Square[]; also: Square[] };
const boardMeta: Record<"documents" | "moneyTasks" | "clubStatus", { href: string; tone: Tone }> = {
  documents: { href: "/documents", tone: "danger" },
  moneyTasks: { href: "/tasks", tone: "warning" },
  clubStatus: { href: "/settings/club#settings-obligations", tone: "warning" },
};
/** The president's six squares, always in this order when available. */
export const presidentSquares: BoardKey[] = ["documents", "registersToClose", "registrationsReview", "duesLate", "moneyTasks", "clubStatus"];
/** What takes the place of a square whose module is off or out of reach. */
const replacements: BoardKey[] = ["equipmentService", "registrationFollowups", "documentsReview", "teamsOverCapacity", "coursesExpiring", "courseRequests"];
/** Coaches, players and parents: their own squares first. */
const memberSquares: BoardKey[] = ["myAttendance", "myDocuments", "myApplications", "myTasks", "registersToClose", "documents", "registrationsReview", "duesLate", "moneyTasks"];
/** Counted inside a merged square, never shown on their own. */
const merged = new Set<BoardKey>(["documentsExpired", "documentsMissing", "documentsExpiring", "sponsorTasks", "grantTasks"]);
const defined = (n: number | undefined): n is number => Number.isInteger(n);

/**
 * The board of « À faire ». A square exists when its figure was computed for
 * this actor (module on, right held); at 0 it stays, green. Up to six squares;
 * the other non-zero figures go on the discreet « Aussi : » line.
 */
export function buildBoard(counts: Partial<Record<TodoKey, number>>, opts: { president: boolean; status?: ClubStatusSquare | null }): Board {
  const sum = (...keys: TodoKey[]) => (keys.some((k) => defined(counts[k])) ? keys.reduce((n, k) => n + (counts[k] ?? 0), 0) : undefined);
  const value: Partial<Record<BoardKey, number>> = { ...counts };
  value.documents = sum("documentsExpired", "documentsMissing");
  value.moneyTasks = sum("sponsorTasks", "grantTasks");
  value.clubStatus = opts.status ? opts.status.total - opts.status.done : undefined;
  const square = (key: BoardKey): Square => ({
    key,
    count: value[key] as number,
    ...(key in boardMeta ? boardMeta[key as keyof typeof boardMeta] : todoMeta[key as TodoKey]),
    // Only grant steps to do: the tasks page opens on them.
    ...(key === "moneyTasks" && !counts.sponsorTasks && counts.grantTasks ? { href: todoMeta.grantTasks.href } : {}),
    ...(key === "documents" && defined(counts.documentsExpiring) ? { expiring: counts.documentsExpiring } : {}),
    ...(key === "clubStatus" && opts.status ? { status: opts.status } : {}),
  });
  const order = [...(opts.president ? presidentSquares : memberSquares), ...replacements];
  const squares = order.filter((k) => defined(value[k])).slice(0, 6);
  const shown = new Set(squares);
  const also = ([...todoKeys, "documents", "moneyTasks"] as BoardKey[]).filter((k) => !shown.has(k) && !merged.has(k) && defined(value[k]) && (value[k] as number) > 0);
  return { squares: squares.map(square), also: also.map(square) };
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
  // 9: the cash minus the reserved funds.
  "available",
  // H4: the certain forecast under the threshold within three months.
  "forecastLow",
  "myNextDue",
  // The president's key figures (wave 16, A), for the season in view.
  "seasonPlayers",
  "seasonTeams",
  "seasonCoaches",
  "chairs",
  "trainingsDone",
  "matchesPlayed",
] as const;
export type MetricKey = (typeof metricKeys)[number];
export type Metric = {
  key: MetricKey;
  value: number;
  format: "count" | "cents";
  href?: string;
  date?: string;
  /** A second figure said in the hint (chairs in service, say). */
  extra?: number;
  /** The season's players by classification (04/11/2026: a small chart on hover). */
  split?: { pf1: number; pf2: number; other: number };
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
  kind: "documents" | "dues" | "fundraising" | "trip" | "grant" | "partner" | "accounts";
  /** YYYY-MM-DD */
  date: string;
  title: string;
  count: number;
  cents?: number;
  href: string;
  /** A sponsor condition or a grant step (wave 15), not a date of the file itself. */
  task?: boolean;
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
  /** « À faire » in fixed squares (wave 16, A). */
  board?: Board;
  metrics: Metric[];
  agenda: AgendaItem[];
  deadlines: Deadline[];
  /** Modules whose figures were computed for this actor; others are hidden, not zero. */
  scopes: string[];
  /** Only for people trusted with the club's money, with the modules on. */
  finance?: FinanceCard;
  /** The week asked for (?week=YYYY-MM-DD, a Monday), with its events. */
  week?: { from: string; to: string; events: WeekEvent[] };
  /** Getting started of players and parents (wave 15, C9). */
  start?: { calendarSubscribed: boolean };
  /** Getting started of a new club, for its president (wave 15, C3). */
  setup?: SetupState;
  /** 15: the home by role (player or parent, coach, federation). */
  focus?: Focus;
};
export function formatCents(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
