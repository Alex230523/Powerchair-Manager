"use client";
import { localAt, shiftLocal } from "@/domains/calendar/time";
import type { Locale } from "@/lib/locale";
type Event = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  place_name: string | null;
  team_id?: string | null;
  team_color?: string | null;
};
export function CalendarBoard({
  locale,
  view,
  from,
  to,
  events,
  onSelect,
  onCreate,
}: {
  locale: Locale;
  view: string;
  from: string;
  to: string;
  events: Event[];
  onSelect: (id: string) => void;
  onCreate?: (day: string) => void;
}) {
  const month = view === "month",
    first = month
      ? shiftLocal(
          from + "T12:00",
          -((new Date(from + "T12:00Z").getUTCDay() + 6) % 7),
        ).slice(0, 10)
      : from;
  const days = month
    ? Math.ceil((Date.parse(to) - Date.parse(first)) / 86400000 / 7) * 7
    : 7;
  const today = localAt(new Date(), "Europe/Brussels").slice(0, 10);
  const label =
    locale === "fr"
      ? "Ajouter un événement le "
      : locale === "en"
        ? "Add event on "
        : "Evenement toevoegen op ";
  const time = (s: string) => localAt(s, "Europe/Brussels").slice(11, 16);
  const daily = (day: string) =>
    events.filter(
      (e) =>
        localAt(e.starts_at, "Europe/Brussels").slice(0, 10) <= day &&
        localAt(
          new Date(new Date(e.ends_at).getTime() - 1),
          "Europe/Brussels",
        ).slice(0, 10) >= day,
    );
  return (
    <div className="calendar-board-scroll">
      <div
        className={"calendar-board " + (month ? "board-month" : "board-week")}
      >
        {month &&
          Array.from({ length: 7 }, (_, i) => (
            <div className="board-weekday" key={i}>
              {new Intl.DateTimeFormat(locale, {
                weekday: "long",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(2026, 9, 19 + i)))}
            </div>
          ))}
        {Array.from({ length: days }, (_, i) => {
          const day = shiftLocal(first + "T12:00", i).slice(0, 10),
            items = daily(day);
          return (
            <section
              className={
                "board-day " +
                (day < from || day >= to ? "outside-month " : "") +
                (day === today ? "board-today" : "")
              }
              key={day}
              aria-label={day}
            >
              <header>
                <span>
                  {month
                    ? Number(day.slice(8))
                    : new Intl.DateTimeFormat(locale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      }).format(new Date(day + "T12:00Z"))}
                </span>
                {onCreate && (
                  <button
                    type="button"
                    aria-label={label + day}
                    onClick={() => onCreate(day)}
                  >
                    +
                  </button>
                )}
              </header>
              {items.map((e) => (
                <button
                  type="button"
                  className={
                    "board-event " +
                    (e.status === "cancelled" ? "board-cancelled" : "")
                  }
                  data-color={e.team_id ? (e.team_color ?? "none") : undefined}
                  key={e.id}
                  onClick={() => onSelect(e.id)}
                >
                  <span>
                    {time(e.starts_at)}–{time(e.ends_at)}
                  </span>
                  <strong>{e.title}</strong>
                  {!month && e.place_name && <span>{e.place_name}</span>}
                  {e.status === "cancelled" && (
                    <span>
                      {locale === "fr"
                        ? "Annulé"
                        : locale === "en"
                          ? "Cancelled"
                          : "Geannuleerd"}
                    </span>
                  )}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
