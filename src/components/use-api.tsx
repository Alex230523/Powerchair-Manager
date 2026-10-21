"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";

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
        else setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [url, failure]);
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
