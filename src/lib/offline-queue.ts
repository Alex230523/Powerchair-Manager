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
