"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { PublicLive } from "@/domains/competitions/live-public";
import { publicLiveCopy } from "./public-live-copy";
import { Badge } from "./ui";

const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

/** Lot 3 (05/11/2026): the public page of a match, refreshed every 20 seconds while it is on. */
export function PublicLivePage({ locale, token, initial }: { locale: Locale; token: string; initial: PublicLive }) {
  const t = publicLiveCopy[locale];
  const [x, setX] = useState(initial),
    [gone, setGone] = useState(false);
  useEffect(() => {
    if (x.status !== "live" && x.status !== "scheduled") return;
    const load = () =>
      fetch(`/api/public/live/${token}`, { cache: "no-store" })
        .then(async (r) => (r.ok ? setX(await r.json()) : r.status === 404 ? setGone(true) : undefined))
        .catch(() => undefined);
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [token, x.status]);
  const when = new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(x.starts_at));
  const updated = new Intl.DateTimeFormat(tag(locale), { hour: "2-digit", minute: "2-digit" }).format(new Date(x.updated_at));
  const tone = x.status === "live" ? "success" : x.status === "played" ? "neutral" : x.status === "cancelled" ? "danger" : "info";
  return (
    <main id="main" className="access public-page public-live">
      <header className="public-hero">
        <div>
          <p className="eyebrow">{t.title}</p>
          <h1>
            {x.team} <span className="muted">{x.home === null ? "" : x.home ? `(${t.home})` : `(${t.away})`}</span>
          </h1>
          <p className="muted">
            {x.club} · {when}
          </p>
        </div>
        <Badge tone={tone}>{t.statuses[x.status]}</Badge>
      </header>
      {gone && <p role="alert">{t.gone}</p>}
      <section className="live-score" aria-live="polite" aria-atomic="true">
        <div className="live-side">
          <span className="live-name">{x.team}</span>
        </div>
        <div className="live-figures">{x.score ? `${x.score.ours} - ${x.score.theirs}` : "…"}</div>
        <div className="live-side">
          <span className="live-name">{x.opponent}</span>
        </div>
      </section>
      {!x.score && <p className="muted">{t.noScore}</p>}
      <section aria-labelledby="live-events">
        <h2 id="live-events">{t.events}</h2>
        {x.events.length ? (
          <ol className="live-events">
            {x.events.map((e, i) => (
              <li key={i} data-kind={e.kind}>
                <span className="live-minute">{e.minute !== null ? `${e.minute}'` : ""}</span>
                <span>{t.kinds[e.kind] ?? e.kind}</span>
                {(e.who || e.number !== null) && <span className="muted">{e.who ?? fill(t.number, { n: e.number! })}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t.noEvents}</p>
        )}
      </section>
      <p className="muted small">
        {fill(t.updated, { time: updated })}{" "}
        <button type="button" className="text-button" onClick={() => window.location.reload()}>
          {t.refresh}
        </button>
      </p>
      <footer className="app-footer">{t.poweredBy}</footer>
    </main>
  );
}
