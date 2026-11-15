"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { apiPath } from "@/lib/shared-fetch";

/** Error codes meaning "this profile cannot open the page" rather than a failure. */
export const deniedCodes = [
  "FORBIDDEN",
  "FEDERATION_ONLY",
  "CLUB_ONLY",
  "CONTEXT_REQUIRED",
  "MFA_REQUIRED",
];

/**
 * Loads a JSON view. The first request runs inside the effect (React rule:
 * no synchronous state update in an effect); `reload` refreshes after a command.
 */
export function useData<T>(url: string, failure: (code: string) => string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false);
  // 13/11/2026: the message function is read through a ref: a screen passing a new arrow at each
  // render (national teams, a player's progress) no longer reads its view again in a loop.
  const fail = useRef(failure);
  useEffect(() => {
    fail.current = failure;
  }, [failure]);
  const reload = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }, [url]);
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setData(v);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (deniedCodes.includes(e.message)) setDenied(true);
        else setError(fail.current(e.message));
      });
    // 13/11/2026: a change made elsewhere on the page (another card, the bell, the home) reads this view again;
    // a change of this view itself is already followed by its own reload.
    const changed = (e: Event) => {
      const paths = (e as CustomEvent<{ paths: string[] }>).detail?.paths ?? [];
      if (paths.every((x) => x === apiPath(url))) return;
      fetch(url, { cache: "no-store" })
        .then(async (r) => (r.ok ? await r.json() : null))
        .then((v) => {
          if (!cancelled && v) setData(v);
        })
        .catch(() => undefined);
    };
    window.addEventListener("pfm-changed", changed);
    return () => {
      cancelled = true;
      window.removeEventListener("pfm-changed", changed);
    };
  }, [url]);
  return { data, error, setError, denied, reload };
}

/** Sends a JSON command, reloads the view and reports the outcome. */
export function usePost(
  url: string,
  reload: () => Promise<void>,
  setError: (s: string) => void,
  failure: (code: string) => string,
) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  /** The answer of the server (an id, an undo offer of wave 15), or null when it failed. */
  async function postFor(body: Record<string, unknown>, done: string): Promise<{ undo?: string; id?: string } | null> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      setMessage(done);
      return v as { undo?: string; id?: string };
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function post(body: Record<string, unknown>, done: string) {
    return (await postFor(body, done)) !== null;
  }
  return { busy, message, post, postFor };
}

const more = {
  fr: { more: "Afficher {n} de plus", shown: "{shown} sur {total}" },
  nl: { more: "{n} meer tonen", shown: "{shown} van {total}" },
  en: { more: "Show {n} more", shown: "{shown} of {total}" },
};
/** Long lists are shown by pages of `size`; "Show more" adds the next page. */
export function useShowMore<T>(items: T[], size = 50) {
  const [count, setCount] = useState(size);
  return {
    visible: items.slice(0, count),
    more: {
      shown: Math.min(count, items.length),
      total: items.length,
      step: Math.min(size, Math.max(0, items.length - count)),
      onMore: () => setCount(count + size),
    },
  };
}
export function ShowMore({
  locale,
  shown,
  total,
  step,
  onMore,
}: {
  locale: Locale;
  shown: number;
  total: number;
  step: number;
  onMore: () => void;
}) {
  if (shown >= total) return null;
  const t = more[locale];
  return (
    <p className="show-more">
      <span className="muted" aria-live="polite">
        {t.shown.replace("{shown}", String(shown)).replace("{total}", String(total))}
      </span>{" "}
      <button type="button" className="button secondary" onClick={onMore}>
        {t.more.replace("{n}", String(step))}
      </button>
    </p>
  );
}

const pages = {
  fr: { more: "Afficher plus", shown: "{n} affichés", loading: "Chargement…", failed: "La suite n'a pas pu être chargée. Réessayez." },
  nl: { more: "Meer tonen", shown: "{n} getoond", loading: "Laden…", failed: "Het vervolg kon niet worden geladen. Probeer opnieuw." },
  en: { more: "Show more", shown: "{n} shown", loading: "Loading…", failed: "The next items could not be loaded. Try again." },
};
/**
 * 13.3: a list paged by the server. `url` answers `{ items, next }`; with
 * `after=<cursor>` it gives the page after. A new `url` (another filter)
 * starts again from the first page; `reload` does the same after a change;
 * `all` reads every page, for an export that covers the whole list.
 */
type PagesState<T> = { url: string; items: T[]; next: string | null; loaded: boolean; busy: boolean; failed: boolean };
const withAfter = (url: string, cursor: string) => url + (url.includes("?") ? "&" : "?") + "after=" + encodeURIComponent(cursor);
async function pageAt<T>(url: string): Promise<{ items: T[]; next: string | null }> {
  const r = await fetch(url, { cache: "no-store" });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error);
  return v;
}
export function useServerList<T>(url: string) {
  const [state, setState] = useState<PagesState<T>>({ url, items: [], next: null, loaded: false, busy: false, failed: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    pageAt<T>(url)
      .then((v) => {
        if (!cancelled) setState({ url, items: v.items, next: v.next, loaded: true, busy: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url, items: [], next: null, loaded: true, busy: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url, version]);
  const current = state.url === url ? state : { ...state, items: [] as T[], next: null, loaded: false };
  async function onMore() {
    if (!current.next || current.busy) return;
    const cursor = current.next;
    setState((s) => ({ ...s, busy: true, failed: false }));
    try {
      const v = await pageAt<T>(withAfter(url, cursor));
      setState((s) => (s.url === url ? { ...s, items: [...s.items, ...v.items], next: v.next, busy: false } : s));
    } catch {
      setState((s) => ({ ...s, busy: false, failed: true }));
    }
  }
  async function all(from = url) {
    let page = await pageAt<T>(from);
    const items = [...page.items];
    while (page.next) {
      page = await pageAt<T>(withAfter(from, page.next));
      items.push(...page.items);
    }
    return items;
  }
  return {
    items: current.items,
    loaded: current.loaded,
    all,
    reload: () => setVersion((v) => v + 1),
    more: { shown: current.items.length, hasMore: !!current.next, busy: current.busy, failed: current.failed, onMore },
  };
}
export function LoadMore({
  locale,
  shown,
  hasMore,
  busy,
  failed,
  onMore,
}: {
  locale: Locale;
  shown: number;
  hasMore: boolean;
  busy: boolean;
  failed: boolean;
  onMore: () => void;
}) {
  if (!hasMore && !failed) return null;
  const t = pages[locale];
  return (
    <p className="show-more">
      <span className="muted" role="status" aria-live="polite">
        {failed ? t.failed : busy ? t.loading : t.shown.replace("{n}", String(shown))}
      </span>{" "}
      {hasMore && (
        <button type="button" className="button secondary" onClick={onMore} disabled={busy} aria-busy={busy}>
          {t.more}
        </button>
      )}
    </p>
  );
}
