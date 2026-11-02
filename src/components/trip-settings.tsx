"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { tripTransportCopy } from "./trip-transport-copy";
import { errors } from "./access-copy";
import { Button, Card } from "./ui";

/**
 * 3: Réglages › Activités › Déplacements. The rate of the mileage allowance
 * paid for private vehicles. Hidden when the trips are switched off or the
 * person may not read them.
 */
export function TripSettings({ locale }: { locale: Locale }) {
  const t = tripTransportCopy[locale];
  const [data, setData] = useState<{ organization_id: string; mileageRateCents: number | null } | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/trips", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { organization_id: string; mileageRateCents: number | null; can: { manage: boolean } }) : null))
      .then((v) => {
        if (live && v?.can.manage) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!data) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const raw = String(new FormData(e.currentTarget).get("rate") ?? "").trim();
    const cents = raw === "" ? null : Math.round(Number(raw.replace(",", ".")) * 100);
    setBusy(true);
    setFailed("");
    setStatus("");
    try {
      const r = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: data.organization_id, action: "settings", mileageRateCents: cents }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      setData({ ...data, mileageRateCents: cents });
      setStatus(t.rateSaved);
    } catch (x) {
      setFailed(errors[(x as Error).message]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? "");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t.settingsTitle} labelledBy="settings-mileage" headingId="settings-mileage">
      <p className="muted">{t.settingsIntro}</p>
      <form className="stack-form" onSubmit={(e) => void submit(e)}>
        <label htmlFor="settings-mileage-rate">
          {t.rate}
          <input id="settings-mileage-rate" name="rate" type="number" min={0} max={5} step="0.01" defaultValue={data.mileageRateCents === null ? "" : (data.mileageRateCents / 100).toFixed(2)} />
        </label>
        <div className="actions">
          <Button type="submit" disabled={busy}>
            {t.rateSave}
          </Button>
        </div>
      </form>
      <p role="status">{status}</p>
      {failed && <p role="alert">{failed}</p>}
    </Card>
  );
}
