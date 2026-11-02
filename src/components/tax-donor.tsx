"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { taxCopy } from "./tax-copy";
import { fill } from "./fleet-copy";
import { useData } from "./use-api";
import { Button, PageHeader } from "./ui";

/**
 * B8, public: reached from the private link the club sent a donor. The
 * donor types their national number once; it is checked (modulo 97), sealed
 * and only used for Belcotax. The link works once and for 30 days.
 */
export function DonorIdentity({ locale, token }: { locale: Locale; token: string }) {
  const t = taxCopy[locale];
  const failure = useCallback(() => t.donorGone, [t.donorGone]);
  const { data, error } = useData<{ name: string; organization: string }>(`/api/tax/identity?token=${encodeURIComponent(token)}`, failure);
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [problem, setProblem] = useState("");
  return (
    <main id="main" className="access public-pot tax-donor">
      <PageHeader title={t.donorTitle} />
      {error && <p role="alert">{error}</p>}
      {data && !done && (
        <form
          className="stack-form"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("national") ?? "");
            setBusy(true);
            setProblem("");
            void fetch("/api/tax/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, value }) })
              .then(async (r) => {
                const v = await r.json();
                if (!r.ok) throw new Error(v.error);
                setDone(true);
              })
              .catch((x: Error) => setProblem(t.errors[x.message] ?? t.donorGone))
              .finally(() => setBusy(false));
          }}
        >
          <p>{fill(t.donorIntro, { organization: data.organization })}</p>
          <label htmlFor="donor-national">
            {t.donorField}
            <input id="donor-national" name="national" required inputMode="numeric" maxLength={15} autoComplete="off" spellCheck={false} aria-describedby="donor-national-hint" />
            <span id="donor-national-hint" className="muted">
              {t.donorHint}
            </span>
          </label>
          {problem && <p role="alert">{problem}</p>}
          <p>
            <Button disabled={busy}>{t.donorSend}</Button>
          </p>
        </form>
      )}
      {done && <p role="status">{t.donorDone}</p>}
    </main>
  );
}
