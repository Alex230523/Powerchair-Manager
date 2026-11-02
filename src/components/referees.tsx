"use client";
import Link from "next/link";
import { ClassificationDays } from "./classification-days";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { refereeView } from "@/domains/competitions/service";
import { refereesCopy, weekendDays } from "./referees-copy";
import { errors } from "./access-copy";
import { useData } from "./use-api";
import { PageHeader, Card } from "./ui";
import { RefereeRoster } from "./federation-referees";
import { FederationRefereeing, RefereeDesk } from "./refereeing";

const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function RefereeSpace({ locale }: { locale: Locale }) {
  const t = refereesCopy[locale];
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const { data, error, setError, denied, reload } = useData<
    Awaited<ReturnType<typeof refereeView>>
  >("/api/referee", failure);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/referee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: data?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      setMessage(done);
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  const days = data ? weekendDays(data.today) : [];
  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(d + "T12:00:00Z"));

  return (
    <main id="main" className="access referees">
      <PageHeader
        title={t.refereeTitle}
        subtitle={t.refereeIntro}
        actions={
          <>
            <Link className="button secondary" href={`/${locale}/guide/game`}>
              {t.guideGame}
            </Link>
            <Link className="button secondary" href={`/${locale}/guide/chair`}>
              {t.guideChair}
            </Link>
          </>
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.denied}</p>}
      {!data && !denied && !error && <p role="status">{t.loading}</p>}
      {data && <RefereeDesk locale={locale} />}
      {data && (
        <div className="grid">
          <Card title={t.availability} labelledBy="ref-availability" headingId="ref-availability">
            <p className="muted">{t.availabilityHint}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send(
                  {
                    action: "availability",
                    days: days.map((day) => ({
                      day,
                      available: f.has(day),
                      note: "",
                    })),
                  },
                  t.saved,
                );
              }}
            >
              <ul className="availability-grid">
                {days.map((d) => (
                  <li key={d}>
                    <label className="check">
                      <input
                        type="checkbox"
                        name={d}
                        defaultChecked={
                          !!data.availability.find(
                            (x) => x.day === d && x.available,
                          )
                        }
                      />
                      {dayLabel(d)}
                    </label>
                  </li>
                ))}
              </ul>
              <button className="button" disabled={busy}>
                {t.saveAvailability}
              </button>
            </form>
          </Card>
        </div>
      )}
      {data && <ClassificationDays locale={locale} />}
    </main>
  );
}

export function Designations({ locale }: { locale: Locale }) {
  const t = refereesCopy[locale];
  return (
    <main id="main" className="access referees">
      <PageHeader title={t.designTitle} subtitle={t.designIntro} />
      <RefereeRoster locale={locale} />
      <FederationRefereeing locale={locale} />
    </main>
  );
}
