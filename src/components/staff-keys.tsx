"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { keysView } from "@/domains/keys/service";
import { keysCopy } from "./keys-copy";
import { Card } from "./player-profile";
import { Button } from "./ui";

/** H10: « Clés et badges » in the profile of a coach or a member of staff. */
type View = Awaited<ReturnType<typeof keysView>>;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

export function StaffKeys({ locale, profileId }: { locale: Locale; profileId: string }) {
  const t = keysCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/keys?profile=${profileId}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profileId, version]);
  if (!data) return null;
  const day = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) setStatus(t.saved);
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t.title} icon="lock">
      {data.keys.length ? (
        <ul className="records">
          {data.keys.map((k) => (
            <li key={k.id}>
              <strong>{k.label}</strong>
              <span className="muted small">
                {k.handed_on && ` · ${fill(t.since, { date: day(k.handed_on) })}`}
                {k.returned_on && ` · ${fill(t.returnedOn, { date: day(k.returned_on) })}`}
              </span>
              {k.note && <p className="muted small">{k.note}</p>}
              {data.can.edit && (
                <p className="actions">
                  {!k.returned_on && (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "returned", id: k.id, on: today })}>
                      {t.markReturned}
                      <span className="sr-only"> : {k.label}</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void send({ action: "remove", id: k.id })}>
                    {t.remove}
                    <span className="sr-only"> : {k.label}</span>
                  </Button>
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.empty}</p>
      )}
      {data.can.edit && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            void send({ action: "add", profileId, label: String(f.get("label") ?? ""), handedOn: String(f.get("handedOn") ?? "") || null, note: String(f.get("note") ?? "") }).then(() => form.reset());
          }}
        >
          <label className="wide">
            {t.label}
            <input name="label" required minLength={2} maxLength={120} aria-describedby={`keys-hint-${profileId}`} />
          </label>
          <p className="muted small wide" id={`keys-hint-${profileId}`}>
            {t.labelHint}
          </p>
          <label>
            {t.handedOn}
            <input name="handedOn" type="date" defaultValue={today} />
          </label>
          <label>
            {t.note}
            <input name="note" maxLength={300} />
          </label>
          <p className="actions wide">
            <Button disabled={busy}>{t.add}</Button>
          </p>
        </form>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </Card>
  );
}
