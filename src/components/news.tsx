"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { newsView } from "@/domains/news/service";
import type { NewsEntry } from "@/domains/news/schema";
import { newsCopy } from "./news-copy";
import { useData } from "./use-api";
import { Badge, Card, EmptyState, PageHeader } from "./ui";

/**
 * 20: « Nouveautés » for the users: what changed for them, in a few plain
 * sentences, newest first, filtered on the role of the profile in use (all
 * of them on demand). Opening the page marks what it shows as read.
 */
type View = Awaited<ReturnType<typeof newsView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const markRead = (ids: string[]) =>
  ids.length ? fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", ids }) }).catch(() => undefined) : Promise.resolve(undefined);

export function NewsPage({ locale }: { locale: Locale }) {
  const t = newsCopy[locale];
  const [all, setAll] = useState(false);
  const failure = useCallback(() => t.unavailable, [t]);
  const { data, error } = useData<View>(`/api/news${all ? "?all=1" : ""}`, failure);
  // What the page shows is read (the « Nouveau » badges go).
  useEffect(() => {
    if (data) void markRead(data.entries.filter((e) => !e.read).map((e) => e.id));
  }, [data]);
  return (
    <main id="main" className="access news">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      {data && (
        <>
          <label className="check news-all" htmlFor="news-all">
            <input id="news-all" type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {t.showAll}
          </label>
          {data.entries.length ? (
            <ol className="news-list">
              {data.entries.map((e) => (
                <li key={e.id}>
                  <Card title={e[locale].title} labelledBy={`news-${e.id}`} headingId={`news-${e.id}`}>
                    <p className="muted">
                      {day(locale, e.date)} {!e.read && <Badge tone="info">{t.newBadge}</Badge>}
                    </p>
                    <p>{e[locale].text}</p>
                    <p>
                      <Link href={`/${locale}${e.link === "/" ? "" : e.link}`}>
                        {t.open}
                        <span className="sr-only"> : {e[locale].title}</span>
                      </Link>
                    </p>
                  </Card>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title={t.none} />
          )}
        </>
      )}
    </main>
  );
}

/** The small window on the home after signing in, once per new delivery for this role; never blocking. */
export function NewsPopup({ locale }: { locale: Locale }) {
  const failure = useCallback(() => "", []);
  const { data } = useData<View>("/api/news", failure);
  const [gone, setGone] = useState<string | null>(null);
  if (!data?.popup || gone === data.popup.id) return null;
  const entry = data.popup;
  return <NewsWindow locale={locale} entry={entry} done={() => setGone(entry.id)} />;
}
function NewsWindow({ locale, entry, done }: { locale: Locale; entry: NewsEntry; done: () => void }) {
  const t = newsCopy[locale];
  const close = (off = false) => {
    void markRead([entry.id]);
    if (off) void fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "popup", off: true }) }).catch(() => undefined);
    done();
  };
  return (
    <aside className="news-popup" aria-labelledby="news-popup-title">
      <p className="muted">{t.title}</p>
      <h2 id="news-popup-title">{entry[locale].title}</h2>
      <p>{entry[locale].text}</p>
      <p className="actions">
        <Link className="button" href={`/${locale}/nouveautes`} onClick={() => close()}>
          {t.seeAll}
        </Link>
        <button type="button" className="button secondary" onClick={() => close()}>
          {t.close}
        </button>
        <button type="button" className="text-button" onClick={() => close(true)}>
          {t.never}
        </button>
      </p>
    </aside>
  );
}

/** Réglages › Mon compte: the window after a new delivery, on or off. */
export function NewsSetting({ locale }: { locale: Locale }) {
  const t = newsCopy[locale];
  const failure = useCallback(() => t.unavailable, [t]);
  const { data, reload } = useData<View>("/api/news", failure);
  const [saved, setSaved] = useState("");
  if (!data) return null;
  return (
    <div className="news-setting">
      <label className="check" htmlFor="news-popup-on">
        <input
          id="news-popup-on"
          type="checkbox"
          checked={!data.popupOff}
          onChange={async (e) => {
            setSaved("");
            const r = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "popup", off: !e.target.checked }) });
            if (r.ok) {
              await reload();
              setSaved(t.saved);
            }
          }}
        />
        {t.popupSetting}
      </label>
      <p role="status" className="muted">
        {saved}
      </p>
    </div>
  );
}
