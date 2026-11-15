"use client";
import type { KeyboardEvent } from "react";
import { localAt, shiftLocal } from "@/domains/calendar/time";
import { answerCounts, hourBounds, isAllDay, layoutDay, spokenTime } from "@/domains/calendar/planner";
import type { Locale } from "@/lib/locale";
import type { MoneyDeadline } from "@/domains/funding/service";
import { DeadlineChip } from "./money-layer";
import { kindLabels } from "./calendar-copy";
import { plannerCopy } from "./calendar-planner-copy";
import { Badge } from "./ui";
import { cssVars } from "./css-vars";

export type BoardEvent = {
  id: string;
  title: string;
  kind: string;
  custom_type?: string;
  starts_at: string;
  ends_at: string;
  local_start: string;
  local_end: string;
  status: string;
  place_name: string | null;
  team_id?: string | null;
  team_name?: string | null;
  team_color?: string | null;
  attendance?: { role: string; response: string }[];
  /** Wave 16 (E1): the club's type, its name and palette colour. */
  type_name?: string | null;
  type_color?: string | null;
  /** 18: a session in a hall that must be booked, without a confirmed booking (staff only). */
  bookingMissing?: boolean;
};
export type ColorBy = "team" | "kind";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const brussels = (iso: string) => localAt(new Date(iso), "Europe/Brussels");
const dayOf = (e: BoardEvent) => brussels(e.starts_at).slice(0, 10);
/** Days an event covers, in Brussels time. */
function covers(e: BoardEvent, day: string) {
  return brussels(e.starts_at).slice(0, 10) <= day && localAt(new Date(new Date(e.ends_at).getTime() - 1), "Europe/Brussels").slice(0, 10) >= day;
}
/** The event in Brussels local time (the grid shows the club's time zone). */
const local = (e: BoardEvent) => ({ ...e, local_start: brussels(e.starts_at), local_end: brussels(e.ends_at) });

export function dayName(locale: Locale, day: string, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(tag(locale), style === "long" ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(day + "T12:00Z"));
}
export function kindName(locale: Locale, e: Pick<BoardEvent, "kind" | "custom_type" | "type_name">) {
  if (e.type_name) return e.type_name;
  return e.kind === "custom" && e.custom_type ? e.custom_type : ((kindLabels[locale] as Record<string, string>)[e.kind] ?? e.kind);
}
/** "Entraînement Équipe A, lundi 19 octobre de 18 h à 20 h, salle X": the full name of an event button. */
export function eventName(locale: Locale, e: BoardEvent) {
  const t = plannerCopy[locale];
  const l = local(e);
  const when = isAllDay(l) ? t.allDayRange : fill(t.hourRange, { from: spokenTime(locale, l.local_start), to: spokenTime(locale, l.local_end) });
  const team = e.team_name && !e.title.includes(e.team_name) ? ` ${e.team_name}` : "";
  return [`${e.title}${team}`, `${dayName(locale, l.local_start.slice(0, 10))} ${when}`, e.place_name, e.status === "cancelled" ? t.cancelledBadge : null].filter(Boolean).join(", ");
}
/** The colour of a capsule: the team's, or the type's. */
export function colorAttrs(e: BoardEvent, by: ColorBy) {
  return by === "kind" ? { "data-kind": e.type_color ?? e.kind } : { "data-color": e.team_id ? (e.team_color ?? "none") : "none" };
}
const time = (iso: string) => brussels(iso).slice(11, 16);

/** Arrow keys move from one event button to the next in reading order. */
function arrows(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-event]")];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1)))]?.focus();
}

/* ---------- Month: up to three capsules a day, then "+n" ---------- */
export function MonthBoard({
  locale,
  from,
  to,
  events,
  colorBy,
  onSelect,
  onCreate,
  onMore,
  deadlines = [],
}: {
  locale: Locale;
  from: string;
  to: string;
  events: BoardEvent[];
  colorBy: ColorBy;
  onSelect: (id: string) => void;
  onCreate?: (day: string) => void;
  /** Opens the list of a day when it has more than three events. */
  onMore: (day: string) => void;
  /** The "Échéances" layer (wave 15): whole-day capsules on top of each day. */
  deadlines?: MoneyDeadline[];
}) {
  const t = plannerCopy[locale];
  const first = shiftLocal(from + "T12:00", -((new Date(from + "T12:00Z").getUTCDay() + 6) % 7)).slice(0, 10);
  const days = Math.ceil((Date.parse(to) - Date.parse(first)) / 86400000 / 7) * 7;
  const today = localAt(new Date(), "Europe/Brussels").slice(0, 10);
  const label = locale === "fr" ? "Ajouter un événement le " : locale === "en" ? "Add event on " : "Evenement toevoegen op ";
  return (
    <div className="calendar-board-scroll">
      <div className="calendar-board board-month" onKeyDown={arrows}>
        {Array.from({ length: 7 }, (_, i) => (
          <div className="board-weekday" key={i}>
            {new Intl.DateTimeFormat(tag(locale), { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 19 + i)))}
          </div>
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = shiftLocal(first + "T12:00", i).slice(0, 10),
            items = events.filter((e) => covers(e, day)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const shown = items.slice(0, 3),
            hidden = items.length - shown.length;
          return (
            <section className={"board-day " + (day < from || day >= to ? "outside-month " : "") + (day === today ? "board-today" : "")} key={day} aria-label={dayName(locale, day)}>
              <header>
                <span>{Number(day.slice(8))}</span>
                {onCreate && (
                  <button type="button" aria-label={label + day} onClick={() => onCreate(day)}>
                    +
                  </button>
                )}
              </header>
              {deadlines
                .filter((d) => d.date === day)
                .map((d) => (
                  <DeadlineChip key={d.id} locale={locale} d={d} />
                ))}
              {shown.map((e) => (
                <button type="button" className={"board-event " + (e.status === "cancelled" ? "board-cancelled" : "")} {...colorAttrs(e, colorBy)} key={e.id} data-event="" aria-label={eventName(locale, e)} onClick={() => onSelect(e.id)}>
                  <span aria-hidden="true">{isAllDay(local(e)) ? t.allDay : time(e.starts_at)}</span>
                  <strong aria-hidden="true">{e.title}</strong>
                </button>
              ))}
              {hidden > 0 && (
                <button type="button" className="board-more" aria-label={fill(t.moreLabel, { n: hidden, day: dayName(locale, day) })} onClick={() => onMore(day)}>
                  {fill(t.more, { n: hidden })}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Week (or three days): an hour grid ---------- */
const HOUR = 48;
export function WeekGrid({
  locale,
  from,
  days: count,
  events,
  colorBy,
  onSelect,
  deadlines = [],
  onCreate,
}: {
  locale: Locale;
  from: string;
  days: number;
  events: BoardEvent[];
  colorBy: ColorBy;
  onSelect: (id: string) => void;
  deadlines?: MoneyDeadline[];
  /** Wave 16 (E1): « + » on each day, the form opens on that day. */
  onCreate?: (day: string) => void;
}) {
  const t = plannerCopy[locale];
  const days = Array.from({ length: count }, (_, i) => shiftLocal(from + "T12:00", i).slice(0, 10));
  const now = localAt(new Date(), "Europe/Brussels"),
    today = now.slice(0, 10);
  const timed = events.map(local).filter((e) => !isAllDay(e));
  const allDay = events.filter((e) => isAllDay(local(e)));
  const bounds = hourBounds(timed);
  const height = (bounds.to - bounds.from) * HOUR;
  const y = (m: number) => ((m - bounds.from * 60) * HOUR) / 60;
  const nowMinutes = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16));
  const banded = days.some((d) => allDay.some((e) => covers(e, d)) || deadlines.some((x) => x.date === d));
  return (
    <div className="planner-scroll">
      <div className="planner" style={cssVars({ "planner-days": count })} onKeyDown={arrows} aria-describedby="planner-keys">
        <p id="planner-keys" className="sr-only">{t.gridKeys}</p>
        <div className="planner-head">
          <div className="planner-corner" aria-hidden="true" />
          {days.map((d) => (
            <div key={d} className="planner-dayhead" data-today={d === today || undefined}>
              <span className="planner-dayname">{dayName(locale, d, "short")}</span>
              {onCreate && (
                <button type="button" className="planner-add" aria-label={(locale === "fr" ? "Ajouter un événement le " : locale === "en" ? "Add event on " : "Evenement toevoegen op ") + dayName(locale, d)} onClick={() => onCreate(d)}>
                  +
                </button>
              )}
            </div>
          ))}
        </div>
        {banded && (
          <div className="planner-allday">
            <div className="planner-corner">{t.allDay}</div>
            {days.map((d) => (
              <div key={d} className="planner-allday-cell">
                {deadlines
                  .filter((x) => x.date === d)
                  .map((x) => (
                    <DeadlineChip key={x.id} locale={locale} d={x} />
                  ))}
                {allDay
                  .filter((e) => covers(e, d))
                  .map((e) => (
                    <button type="button" key={e.id} className="week-event planner-allday-event" data-status={e.status} {...colorAttrs(e, colorBy)} data-event="" aria-label={eventName(locale, e)} onClick={() => onSelect(e.id)}>
                      <span className="week-event-title" aria-hidden="true">{e.title}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
        <div className="planner-body" style={cssVars({ height: `${height}px` })}>
          <div className="planner-hours" aria-hidden="true">
            {Array.from({ length: bounds.to - bounds.from }, (_, i) => (
              <span key={i} style={cssVars({ top: `${i * HOUR}px` })}>
                {String(bounds.from + i).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(timed.filter((e) => e.local_start.slice(0, 10) === d));
            return (
              <div key={d} className="planner-col" data-today={d === today || undefined} aria-label={dayName(locale, d)} role="group">
                {Array.from({ length: bounds.to - bounds.from }, (_, i) => (
                  <span key={i} className="planner-line" style={cssVars({ top: `${i * HOUR}px` })} aria-hidden="true" />
                ))}
                {placed.map(({ e, start, end, col, cols }) => {
                  const original = events.find((x) => x.id === e.id) as BoardEvent;
                  return (
                    <button
                      type="button"
                      key={e.id}
                      className="week-event planner-event"
                      data-status={e.status}
                      {...colorAttrs(original, colorBy)}
                      data-event=""
                      data-start={e.local_start.slice(11, 16)}
                      aria-label={eventName(locale, original)}
                      style={cssVars({ top: `${y(start)}px`, height: `${Math.max(y(end) - y(start) - 2, 22)}px`, col, cols })}
                      onClick={() => onSelect(e.id)}
                    >
                      <span className="week-event-title" aria-hidden="true">{e.title}</span>
                      <span className="week-event-time" aria-hidden="true">
                        {time(original.starts_at)}-{time(original.ends_at)}
                        {e.place_name ? ` · ${e.place_name}` : ""}
                      </span>
                      {e.status === "cancelled" && (
                        <span aria-hidden="true">
                          <Badge tone="neutral">{t.cancelledBadge}</Badge>
                        </span>
                      )}
                    </button>
                  );
                })}
                {d === today && nowMinutes >= bounds.from * 60 && nowMinutes <= bounds.to * 60 && (
                  <span className="planner-now" style={cssVars({ top: `${y(nowMinutes)}px` })} role="img" aria-label={`${t.now} ${now.slice(11, 16)}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- List: grouped by day ---------- */
export function EventList({
  locale,
  events,
  colorBy,
  onSelect,
  emptyText,
}: {
  locale: Locale;
  events: BoardEvent[];
  colorBy: ColorBy;
  onSelect: (id: string) => void;
  emptyText: string;
}) {
  const t = plannerCopy[locale];
  const days = [...new Set(events.map(dayOf))].sort();
  if (!events.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="planner-list" onKeyDown={arrows}>
      {days.map((d) => (
        <section key={d} aria-labelledby={`day-${d}`}>
          <h3 id={`day-${d}`} className="planner-list-day">{dayName(locale, d)}</h3>
          <ul>
            {events
              .filter((e) => dayOf(e) === d)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((e) => {
                const a = answerCounts(e.attendance ?? []);
                return (
                  <li key={e.id} className="planner-row" data-status={e.status}>
                    <span className="planner-row-time">{isAllDay(local(e)) ? t.allDay : `${time(e.starts_at)}-${time(e.ends_at)}`}</span>
                    <span className="planner-dot" {...colorAttrs(e, colorBy)} aria-hidden="true" />
                    <span className="planner-row-main">
                      <button type="button" className="text-button name-link planner-row-title" data-event="" aria-label={eventName(locale, e)} onClick={() => onSelect(e.id)}>
                        {e.title}
                      </button>
                      <span className="muted small">{[kindName(locale, e), e.team_name, e.place_name].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="planner-row-status">
                      {e.status === "cancelled" ? <Badge tone="neutral">{t.cancelledBadge}</Badge> : <span className="muted small">{a.total ? fill(t.answers, a) : t.noAnswers}</span>}
                      {e.bookingMissing && <Badge tone="warning">{t.bookingMissing}</Badge>}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
