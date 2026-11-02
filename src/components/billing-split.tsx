"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { billingSplitView } from "@/domains/family/service";
import { authorizationSettingsCopy } from "./family-copy";
import { Button } from "./ui";

/**
 * 29: two homes. Who receives the child's dues and mutual insurance
 * attestations: one parent, the other, or both with a split (in %).
 */
type View = Awaited<ReturnType<typeof billingSplitView>>;

export function BillingSplit({ locale, subjectId }: { locale: Locale; subjectId: string }) {
  const t = authorizationSettingsCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [shares, setShares] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/dues/split?subject=${subjectId}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (!live) return;
        setData(v);
        setShares(Object.fromEntries((v?.guardians ?? []).map((g) => [g.id, g.percent ?? 0])));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [subjectId, version]);
  if (!data || data.guardians.length < 2) return null;
  const total = Object.values(shares).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
  async function save(list: { guardianId: string; percent: number }[]) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/dues/split", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, shares: list }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "");
      setStatus(t.splitSaved);
      setVersion((x) => x + 1);
    } catch (e) {
      setError(t.errors[e instanceof Error ? e.message : ""] ?? "");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="billing-split" aria-labelledby={`split-${subjectId}`}>
      <h3 id={`split-${subjectId}`}>{t.splitTitle}</h3>
      <p className="muted">{t.splitIntro}</p>
      {!data.split && <p className="muted small">{t.splitDefault}</p>}
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save(
            Object.entries(shares)
              .filter(([, v]) => v > 0)
              .map(([guardianId, percent]) => ({ guardianId, percent })),
          );
        }}
      >
        {data.guardians.map((g) => (
          <label key={g.id}>
            {t.splitPercent.replace("{name}", g.full_name)}
            <input type="number" inputMode="numeric" min={0} max={100} step={1} value={shares[g.id] ?? 0} onChange={(e) => setShares((s) => ({ ...s, [g.id]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) }))} />
          </label>
        ))}
        <p className={total === 100 ? "muted small wide" : "notice wide"} aria-live="polite">
          {t.splitTotal.replace("{n}", String(total))}
        </p>
        <p className="actions wide">
          <Button disabled={busy || total !== 100}>{t.splitSave}</Button>
          {data.split && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void save([])}>
              {t.splitReset}
            </Button>
          )}
        </p>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
