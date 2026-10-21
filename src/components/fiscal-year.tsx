"use client";
import { useCallback } from "react";
import type { Locale } from "@/lib/locale";
import { accountsCopy } from "./accounts-copy";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Card } from "./ui";

/** Settings > Money (wave 15, C12): when the financial year starts, for the annual accounts. */
export function FiscalYearPanel({ locale }: { locale: Locale }) {
  const a = accountsCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? a.empty, [locale, a.empty]);
  const { data, error, setError, reload, denied } = useData<{ organization_id: string; fiscalStart: string; can: { manage: boolean } }>("/api/accounts", failure);
  const { busy, message, post } = usePost("/api/accounts", reload, setError, failure);
  if (denied || !data) return error ? <p role="alert">{error}</p> : null;
  return (
    <Card title={a.fiscalStart} labelledBy="settings-fiscal-title" headingId="settings-fiscal-title" subtitle={a.fiscalStartHint}>
      <fieldset className="fiscal-choice" disabled={!data.can.manage || busy}>
        <legend className="sr-only">{a.fiscalStart}</legend>
        {(
          [
            ["01-01", a.fiscalJanuary],
            ["07-01", a.fiscalJuly],
          ] as const
        ).map(([value, label]) => (
          <label className="check" key={value}>
            <input
              type="radio"
              name="fiscal-start"
              value={value}
              data-nodirty=""
              checked={data.fiscalStart === value}
              onChange={() => void post({ organizationId: data.organization_id, action: "fiscalStart", start: value }, a.saved)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
