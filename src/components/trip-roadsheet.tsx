"use client";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { roadSheet } from "@/domains/trips/service";
import { tripsCopy } from "./trips-copy";
import { tripTransportCopy } from "./trip-transport-copy";
import { useData } from "./use-api";
import { dayLabel, timeLabel, useTripFailure } from "./trips";
import { SheetVehicle } from "./trip-transport";
import { Button, PageHeader } from "./ui";

type Sheet = Awaited<ReturnType<typeof roadSheet>>;

/** 3 (9): each driver's and passenger's road sheet; the whole trip for who prepares it. */
export function TripRoadSheet({ locale, id }: { locale: Locale; id: string }) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const failure = useTripFailure(locale);
  const { data, error, denied } = useData<Sheet>(`/api/trips?id=${id}&sheet=1`, failure);
  return (
    <main id="main" className="access trips road-sheet">
      <p className="back-link no-print">
        <Link href={`/${locale}/trips/${id}`}>{t.back}</Link>
      </p>
      {!data ? (
        <>
          <h1>{tt.sheet}</h1>
          {error || denied ? <p role="alert">{error || t.unavailable}</p> : <p role="status">{t.loading}</p>}
        </>
      ) : (
        <>
          <PageHeader
            title={tt.sheetTitle.replace("{title}", data.trip.title)}
            subtitle={
              <>
                {dayLabel(locale, data.trip.starts_on)}
                {data.trip.ends_on !== data.trip.starts_on && ` → ${dayLabel(locale, data.trip.ends_on)}`}
                {data.serves && ` · ${tt.servesKinds[data.serves.kind]} : ${data.serves.title}`}
                {data.serves?.starts_at && ` · ${timeLabel(locale, data.serves.starts_at)}`}
                {data.trip.destination && ` · ${data.trip.destination}`}
              </>
            }
            actions={
              <Button type="button" variant="secondary" className="no-print" onClick={() => window.print()}>
                {tt.print}
              </Button>
            }
          />
          <p className="muted">{tt.sheetIntro}</p>
          {(data.trip.contact || data.trip.emergency) && (
            <dl className="trip-facts">
              {data.trip.contact && (
                <div>
                  <dt>{tt.contact}</dt>
                  <dd>{data.trip.contact}</dd>
                </div>
              )}
              {data.trip.emergency && (
                <div>
                  <dt>{tt.emergency}</dt>
                  <dd className="pre-line">{data.trip.emergency}</dd>
                </div>
              )}
            </dl>
          )}
          {data.vehicles.length ? data.vehicles.map((v) => <SheetVehicle key={v.id} locale={locale} v={v} />) : <p>{tt.nothing}</p>}
        </>
      )}
    </main>
  );
}
