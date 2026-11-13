/**
 * 13/11/2026, responsiveness: the screens of one page share their reads, and
 * hear about every change.
 *
 * - `sharedFetch(url, maxAge)`: one request for the same URL while it is
 *   fresh (the menu, the bell and the home asked the dashboard, the shell and
 *   the page the workspace, each on their own, on every page).
 * - `installChangeSignal()`: after any successful change sent to the server
 *   (a POST, PUT, PATCH or DELETE to /api/), the shared reads are dropped and
 *   a `pfm-changed` event tells the shell and the open views to read again,
 *   so a count, a list or a card no longer waits for a manual refresh.
 */
type Entry = { at: number; response: Promise<Response> };
const cache = new Map<string, Entry>();

export function sharedFetch(url: string, maxAge = 5000): Promise<Response> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAge) return hit.response.then((r) => r.clone());
  const response = fetch(url, { cache: "no-store" });
  cache.set(url, { at: Date.now(), response });
  response.then(
    (r) => {
      // A failed read is not kept: the next one asks again.
      if (!r.ok) cache.delete(url);
    },
    () => cache.delete(url),
  );
  return response.then((r) => r.clone());
}

/** Forgets one read, or all of them. */
export function dropShared(url?: string) {
  if (url) cache.delete(url);
  else cache.clear();
}

/** The path of an API URL, without its query: two reads of the same view share it. */
export const apiPath = (url: string) => new URL(url, "http://local").pathname;

/** Changes that are not the person's: reading a news item, the sign-in, a report of a problem. */
const quiet = /^\/api\/(news|auth|feedback|support|telemetry|csp-report)(\/|$)/;
let installed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let changed = new Set<string>();

export function installChangeSignal() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (method !== "GET" && method !== "HEAD" && response.ok && url.origin === window.location.origin && url.pathname.startsWith("/api/") && !quiet.test(url.pathname)) {
        dropShared();
        changed.add(url.pathname);
        clearTimeout(timer);
        // Several changes in a row (a drag, a list of ticks): one signal.
        timer = setTimeout(() => {
          const paths = [...changed];
          changed = new Set();
          window.dispatchEvent(new CustomEvent("pfm-changed", { detail: { paths } }));
        }, 250);
      }
    } catch {
      // The signal never breaks the request itself.
    }
    return response;
  };
}
