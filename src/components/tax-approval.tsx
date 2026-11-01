"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { taxCopy } from "./tax-copy";
import { errors } from "./access-copy";
import { Button, Card } from "./ui";
import { useData } from "./use-api";

/**
 * B8: Réglages › Club, « Notre ASBL est agréée pour délivrer des
 * attestations fiscales ». « Non » by default: nothing else about receipts
 * shows anywhere. « Oui » asks the approval number and period, then the
 * module appears under Finances. Back to « non »: hidden, history kept.
 */
type View = { organization_id: string; canEdit: boolean; approved: boolean; number: string; from: string | null; to: string | null; thresholdCents: number };

export function TaxApproval({ locale }: { locale: Locale }) {
  const t = taxCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? code, [t, locale]);
  const { data, error, setError, reload } = useData<View>("/api/tax?approval=1", failure);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [approved, setApproved] = useState<boolean | null>(null);
  if (!data || !data.canEdit) return null;
  const on = approved ?? data.approved;
  return (
    <Card title={t.approvalTitle} subtitle={t.approvalIntro} id="settings-tax">
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const euros = Number(String(f.get("threshold") ?? "40").replace(",", "."));
          setBusy(true);
          setError("");
          setMessage("");
          void fetch("/api/tax", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: data.organization_id,
              action: "approval",
              approved: on,
              number: String(f.get("number") ?? ""),
              from: String(f.get("from") ?? "") || null,
              to: String(f.get("to") ?? "") || null,
              thresholdCents: Number.isFinite(euros) ? Math.round(euros * 100) : 4000,
            }),
          })
            .then(async (r) => {
              const v = await r.json();
              if (!r.ok) throw new Error(v.error);
              await reload();
              setMessage(t.saved);
              // The menu and the finance tabs follow the new answer.
              window.dispatchEvent(new Event("pfm-workspace"));
            })
            .catch((x: Error) => setError(failure(x.message)))
            .finally(() => setBusy(false));
        }}
      >
        <fieldset>
          <legend>{t.approvalQuestion}</legend>
          <label className="check">
            <input type="radio" name="approved" checked={on} onChange={() => setApproved(true)} />
            {t.yes}
          </label>
          <label className="check">
            <input type="radio" name="approved" checked={!on} onChange={() => setApproved(false)} />
            {t.no}
          </label>
        </fieldset>
        {on ? (
          <>
            <p className="muted small">{t.approvalRequired}</p>
            <label htmlFor="tax-approval-number">
              {t.approvalNumber}
              <input id="tax-approval-number" name="number" required minLength={2} maxLength={60} defaultValue={data.number} />
            </label>
            <div className="form-grid">
              <label htmlFor="tax-approval-from">
                {t.approvalFrom}
                <input id="tax-approval-from" name="from" type="date" required defaultValue={data.from ?? ""} />
              </label>
              <label htmlFor="tax-approval-to">
                {t.approvalTo}
                <input id="tax-approval-to" name="to" type="date" required defaultValue={data.to ?? ""} />
              </label>
            </div>
            <label htmlFor="tax-threshold">
              {t.threshold}
              <input id="tax-threshold" name="threshold" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={(data.thresholdCents / 100).toFixed(2)} aria-describedby="tax-threshold-hint" />
              <span id="tax-threshold-hint" className="muted">
                {t.thresholdHint}
              </span>
            </label>
          </>
        ) : (
          <p className="muted small">{t.offHint}</p>
        )}
        {error && <p role="alert">{error}</p>}
        <p role="status" className="sr-only">
          {message}
        </p>
        <p>
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    </Card>
  );
}
