/**
 * Attendance taken without network: marks wait on the device and are sent when
 * the connection comes back. Only identifiers and the recorded presence are
 * stored, never names; the last attendance view is kept 24 hours at most.
 */
const QUEUE = "pfm-attendance-queue";
const SNAPSHOT = "pfm-attendance-snapshot";
const DAY = 24 * 3600 * 1000;

export type QueuedMark = { key: string; body: Record<string, unknown>; queuedAt: number };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or disabled: the mark stays in memory for this page. */
  }
}
export function pendingMarks(): QueuedMark[] {
  return read<QueuedMark[]>(QUEUE, []);
}
/** A newer mark for the same invitation replaces the older one. */
export function queueMark(invitationId: string, body: Record<string, unknown>) {
  const next = pendingMarks().filter((m) => m.key !== invitationId);
  next.push({ key: invitationId, body, queuedAt: Date.now() });
  write(QUEUE, next);
  return next.length;
}
export function dropMark(invitationId: string) {
  write(QUEUE, pendingMarks().filter((m) => m.key !== invitationId));
}
/**
 * Sends waiting marks one by one. Network failures keep them; refusals from the
 * server (changed register, closed event) drop them and are counted.
 */
export async function flushMarks(send: (body: Record<string, unknown>) => Promise<Response>) {
  let sent = 0,
    refused = 0;
  for (const m of pendingMarks()) {
    try {
      const r = await send(m.body);
      dropMark(m.key);
      if (r.ok) sent++;
      else refused++;
    } catch {
      break;
    }
  }
  return { sent, refused, left: pendingMarks().length };
}
/**
 * A5: the same waiting line for the match day (goals, cards, substitutions).
 * Each event carries its own id, so one sent twice is written once by the
 * server; only ids and the event are kept, never names.
 */
const MATCH_QUEUE = "pfm-match-live-queue";
export type QueuedLive = { key: string; body: Record<string, unknown>; queuedAt: number };
export function pendingLive(matchId?: string): QueuedLive[] {
  const all = read<QueuedLive[]>(MATCH_QUEUE, []);
  return matchId ? all.filter((m) => m.body.id === matchId) : all;
}
export function queueLive(clientId: string, body: Record<string, unknown>) {
  const next = pendingLive().filter((m) => m.key !== clientId);
  next.push({ key: clientId, body, queuedAt: Date.now() });
  write(MATCH_QUEUE, next);
  return next.length;
}
export function dropLive(clientId: string) {
  write(MATCH_QUEUE, pendingLive().filter((m) => m.key !== clientId));
}
/** Sends the match day's waiting events in order; a network failure keeps the rest. */
export async function flushLive(send: (body: Record<string, unknown>) => Promise<Response>) {
  let sent = 0,
    refused = 0;
  for (const m of pendingLive()) {
    try {
      const r = await send(m.body);
      dropLive(m.key);
      if (r.ok) sent++;
      else refused++;
    } catch {
      break;
    }
  }
  return { sent, refused, left: pendingLive().length };
}
export function saveSnapshot(filter: string, data: unknown) {
  write(SNAPSHOT, { savedAt: Date.now(), filter, data });
}
export function loadSnapshot<T>(filter: string): { savedAt: number; data: T } | null {
  const s = read<{ savedAt: number; filter: string; data: T } | null>(SNAPSHOT, null);
  if (!s || s.filter !== filter || Date.now() - s.savedAt > DAY) return null;
  return s;
}
/** Called at sign-out: nothing from the club stays on a shared device. */
export function clearOfflineData() {
  try {
    window.localStorage.removeItem(QUEUE);
    window.localStorage.removeItem(SNAPSHOT);
    window.localStorage.removeItem(MATCH_QUEUE);
    window.localStorage.removeItem("pfm-referee-report-queue");
  } catch {
    /* Nothing to clear. */
  }
  // The former offline trip books (removed in wave 17): whatever a device still holds goes too.
  try {
    indexedDB.deleteDatabase("pcm-offline-books");
  } catch {
    /* No storage: nothing to clear. */
  }
}

/**
 * 25: the referee's report written in a hall without network waits here and
 * leaves when the connection comes back. The players are named by their ids
 * (the server writes the names); one report per match, the newer replaces.
 */
const REPORT_QUEUE = "pfm-referee-report-queue";
export type QueuedReport = { key: string; body: Record<string, unknown>; queuedAt: number };
export function pendingReports(): QueuedReport[] {
  return read<QueuedReport[]>(REPORT_QUEUE, []);
}
export function queueReport(matchId: string, body: Record<string, unknown>) {
  const next = pendingReports().filter((m) => m.key !== matchId);
  next.push({ key: matchId, body, queuedAt: Date.now() });
  write(REPORT_QUEUE, next);
  return next.length;
}
/** Sends the waiting reports; a network failure keeps the rest, a refusal drops it and is counted. */
export async function flushReports(send: (body: Record<string, unknown>) => Promise<Response>) {
  let sent = 0,
    refused = 0;
  for (const m of pendingReports()) {
    try {
      const r = await send(m.body);
      write(REPORT_QUEUE, pendingReports().filter((x) => x.key !== m.key));
      if (r.ok) sent++;
      else refused++;
    } catch {
      break;
    }
  }
  return { sent, refused, left: pendingReports().length };
}

/**
 * 14: « Bord de terrain ». Every action of the day (a presence, a goal, a
 * card, a timeout) waits here in the order it was made and leaves as soon as
 * the network comes back. A refusal by the server (the match changed in the
 * meantime) is told with its label and never blocks the next ones. Only ids,
 * the action and a short label are kept, never a health datum.
 */
const SIDELINE_QUEUE = "pfm-sideline-queue";
export type QueuedAction = { key: string; matchId: string; label: string; body: Record<string, unknown>; queuedAt: number };
export function pendingActions(matchId?: string): QueuedAction[] {
  const all = read<QueuedAction[]>(SIDELINE_QUEUE, []);
  return matchId ? all.filter((a) => a.matchId === matchId) : all;
}
export function queueAction(a: Omit<QueuedAction, "queuedAt">) {
  const next = pendingActions().filter((x) => x.key !== a.key);
  next.push({ ...a, queuedAt: Date.now() });
  write(SIDELINE_QUEUE, next);
  return next.filter((x) => x.matchId === a.matchId).length;
}
export function dropAction(key: string) {
  write(SIDELINE_QUEUE, pendingActions().filter((a) => a.key !== key));
}
/** The last action still waiting for this match, taken back before it leaves. */
export function popAction(matchId: string) {
  const mine = pendingActions(matchId);
  const last = mine[mine.length - 1];
  if (last) dropAction(last.key);
  return last ?? null;
}
/** Sends in order; a network failure stops and keeps the rest, a refusal is counted with its label and dropped. */
export async function flushActions(matchId: string, send: (body: Record<string, unknown>) => Promise<Response>) {
  let sent = 0;
  const refused: string[] = [];
  for (const a of pendingActions(matchId).sort((x, y) => x.queuedAt - y.queuedAt)) {
    try {
      const r = await send(a.body);
      dropAction(a.key);
      if (r.ok) sent++;
      else refused.push(a.label);
    } catch {
      break;
    }
  }
  return { sent, refused, left: pendingActions(matchId).length };
}
/** The match's data kept on the device for a day, so the screen opens without network. */
const SIDELINE_SNAPSHOT = "pfm-sideline-snapshot";
export function saveSideline(matchId: string, data: unknown) {
  const all = read<Record<string, { savedAt: number; data: unknown }>>(SIDELINE_SNAPSHOT, {});
  for (const [k, v] of Object.entries(all)) if (Date.now() - v.savedAt > DAY) delete all[k];
  all[matchId] = { savedAt: Date.now(), data };
  write(SIDELINE_SNAPSHOT, all);
}
export function loadSideline<T>(matchId: string): T | null {
  const v = read<Record<string, { savedAt: number; data: T }>>(SIDELINE_SNAPSHOT, {})[matchId];
  return v && Date.now() - v.savedAt <= DAY ? v.data : null;
}
