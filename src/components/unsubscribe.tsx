"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { unsubscribeCopy } from "./communication-copy";
import { useData } from "./use-api";
import { PageHeader } from "./ui";

/** Public page reached from the link at the bottom of a newsletter. */
export function Unsubscribe({ locale, id }: { locale: Locale; id: string }) {
  const t = unsubscribeCopy[locale];
  const failure = useCallback(() => t.invalid, [t.invalid]);
  const { data, error, reload } = useData<{ club: string; unsubscribed: boolean }>(
    `/api/unsubscribe?id=${encodeURIComponent(id)}`,
    failure,
  );
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState(false);
  async function change(stop: boolean) {
    if (!data) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stop }),
      });
      if (!r.ok) throw new Error();
      await reload();
      setStatus((stop ? t.done : t.resumed).replace("{club}", data.club));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="access public-pot">
      <PageHeader title={t.title} />
      {!data ? (
        error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">{t.loading}</p>
        )
      ) : (
        <>
          {failed && <p role="alert">{t.invalid}</p>}
          <p role="status">{status}</p>
          {!data.unsubscribed ? (
            <>
              <p>{t.question.replace("{club}", data.club)}</p>
              <button type="button" className="button" disabled={busy} onClick={() => void change(true)}>
                {t.stop}
              </button>
            </>
          ) : (
            <>
              {!status && <p>{t.done.replace("{club}", data.club)}</p>}
              <button type="button" className="button secondary" disabled={busy} onClick={() => void change(false)}>
                {t.resume}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
