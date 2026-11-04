"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { authorizationsView } from "@/domains/authorizations/service";
import { authorizationCopy } from "@/domains/authorizations/authorization-copy";
import { authorizationSettingsCopy } from "./family-copy";
import { Button, Card } from "./ui";

/**
 * 28: Réglages › Documents. Each parental authorization: its text in
 * French, Dutch and English, a signature for the season or for one trip,
 * asked by itself on trips or not; a season's authorization can be asked of
 * every family at once.
 */
type View = Awaited<ReturnType<typeof authorizationsView>>;
type Kind = View["kinds"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

async function post(body: unknown) {
  const r = await fetch("/api/authorizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v;
}

export function AuthorizationSettings({ locale }: { locale: Locale }) {
  const t = authorizationSettingsCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/authorizations", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version]);
  if (!data) return null;
  return (
    <Card title={t.title} labelledBy="settings-authorizations" headingId="settings-authorizations">
      <p className="muted">{t.intro}</p>
      {data.kinds.map((k) => (
        <KindForm key={`${k.kind}:${k.version}`} locale={locale} k={k} saved={() => setVersion((v) => v + 1)} />
      ))}
    </Card>
  );
}

function KindForm({ locale, k, saved }: { locale: Locale; k: Kind; saved: () => void }) {
  const t = authorizationSettingsCopy[locale];
  const name = authorizationCopy[locale].kinds[k.kind];
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [validity, setValidity] = useState(k.validity);
  const id = `auth-${k.kind}`;
  async function run(body: unknown, done: (v: { sent?: number }) => string) {
    setBusy(true);
    setError("");
    try {
      setStatus(done(await post(body)));
      saved();
    } catch (e) {
      setError(t.errors[e instanceof Error ? e.message : ""] ?? (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="authorization-kind">
      <summary>
        <strong>{name}</strong>
        <span className="muted small"> · {fill(t.counts, { signed: k.signed, requested: k.requested, refused: k.refused })}</span>
      </summary>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(
            {
              action: "save",
              kind: k.kind,
              validity,
              onTrips: f.get("onTrips") === "on",
              texts: { fr: String(f.get("fr") ?? ""), nl: String(f.get("nl") ?? ""), en: String(f.get("en") ?? "") },
            },
            () => t.saved,
          );
        }}
      >
        <fieldset className="wide">
          <legend>{t.validity}</legend>
          {(["season", "event"] as const).map((v) => (
            <label key={v} className="check">
              <input type="radio" name={`${id}-validity`} value={v} checked={validity === v} onChange={() => setValidity(v)} />
              {v === "season" ? t.season : t.event}
            </label>
          ))}
        </fieldset>
        <label className="check wide">
          <input type="checkbox" name="onTrips" defaultChecked={k.onTrips} aria-describedby={`${id}-trips-hint`} />
          {t.onTrips}
        </label>
        <p className="muted small wide" id={`${id}-trips-hint`}>
          {t.onTripsHint}
        </p>
        {(["fr", "nl", "en"] as const).map((l) => (
          <label key={l} className="wide">
            {fill(t.text, { language: t.languages[l] })}
            <textarea name={l} rows={5} maxLength={10000} defaultValue={k.texts[l]} aria-describedby={`${id}-hint`} />
          </label>
        ))}
        <p className="muted small wide" id={`${id}-hint`}>
          {t.textHint}
        </p>
        <p className="actions wide">
          <Button disabled={busy}>{t.save}</Button>
          {k.validity === "season" && (k.texts.fr || k.texts.nl || k.texts.en) && (
            <Button type="button" variant="secondary" disabled={busy} aria-describedby={`${id}-all-hint`} onClick={() => void run({ action: "requestAll", kind: k.kind }, (v) => fill(t.requested, { n: v.sent ?? 0 }))}>
              {t.requestAll}
            </Button>
          )}
        </p>
        {k.validity === "season" && (
          <p className="muted small wide" id={`${id}-all-hint`}>
            {t.requestAllHint}
          </p>
        )}
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </details>
  );
}
