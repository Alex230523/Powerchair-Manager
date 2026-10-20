"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import type { attendanceView } from "@/domains/attendance/service";
import { gridCopy } from "./attendance-grid-copy";
export { gridCopy };

type View = Awaited<ReturnType<typeof attendanceView>>;
type Ev = View["events"][number];

const cycle = ["present", "absent", "late", "early", "unchecked"] as const;
const tone = (v: string) =>
  v === "present" ? "ok" : v === "absent" ? "low" : v === "late" || v === "early" || v === "uncertain" ? "warn" : "";

/**
 * People x sessions grid (wave 10, after PRÊT). Clicking a cell of a started
 * session cycles the mark (present, absent, late, left early, not marked) for
 * managers; clicking a header opens the session below the table.
 */
export function AttendanceGrid({
  locale,
  events,
  selected,
  busy,
  onSelect,
  onMark,
}: {
  locale: Locale;
  events: Ev[];
  selected: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onMark: (invitationId: string, version: number, actual: string, closed: boolean) => void;
}) {
  const t = gridCopy[locale] as (typeof gridCopy)["fr"];
  const shown = events.filter((e) => e.status !== "cancelled" && e.register);
  if (!shown.length) return <p className="muted">{t.empty}</p>;
  const people = new Map<string, string>();
  for (const e of shown) for (const i of e.invitations) if (!i.withdrawn_at) people.set(i.profile_id, i.full_name);
  const rows = [...people.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  // Fixed at first render: a cell does not flip while the coach is looking at it.
  const [now] = useState(() => Date.now());
  const day = (d: string | Date) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Brussels",
    }).format(new Date(d));
  const totals = shown.map((e) => e.invitations.filter((i) => !i.withdrawn_at && i.actual === "present").length);
  return (
    <div className="table-scroll attendance-grid" role="region" aria-label={t.title} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col" className="grid-person">{t.person}</th>
            {shown.map((e) => (
              <th scope="col" key={e.id} className={selected === e.id ? "grid-selected" : undefined}>
                <button type="button" className="grid-head" onClick={() => onSelect(e.id)} aria-pressed={selected === e.id}>
                  <span>{day(e.starts_at)}</span>
                  <small>{e.title}</small>
                  <span className="sr-only"> · {t.open}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([pid, name]) => (
            <tr key={pid}>
              <th scope="row" className="grid-person">{name}</th>
              {shown.map((e) => {
                const i = e.invitations.find((x) => x.profile_id === pid && !x.withdrawn_at);
                if (!i)
                  return (
                    <td key={e.id} className="grid-cell grid-none">
                      <span aria-label={t.none}>·</span>
                    </td>
                  );
                const started = new Date(e.starts_at).getTime() <= now;
                const value = started ? i.actual : i.response;
                const label = started ? t.actuals[i.actual] : t.responses[i.response];
                const text = started ? t.short[i.actual] : t.answer[i.response];
                const canMark = e.manage && started;
                return (
                  <td key={e.id} className="grid-cell" data-tone={tone(value)}>
                    {canMark ? (
                      <button
                        type="button"
                        className="grid-mark"
                        disabled={busy}
                        title={`${name} · ${label}`}
                        aria-label={`${name}, ${day(e.starts_at)} : ${label}. ${t.mark}`}
                        onClick={() =>
                          onMark(
                            i.id,
                            i.version,
                            cycle[(cycle.indexOf(i.actual as (typeof cycle)[number]) + 1) % cycle.length],
                            !!e.register?.closed_at,
                          )
                        }
                      >
                        {text}
                      </button>
                    ) : (
                      <span title={label} aria-label={`${name}, ${day(e.starts_at)} : ${label}`}>{text}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="grid-person">{t.total}</th>
            {shown.map((e, k) => (
              <td key={e.id} className="grid-cell grid-total">
                {new Date(e.starts_at).getTime() <= now
                  ? `${totals[k]}/${e.invitations.filter((i) => !i.withdrawn_at).length}`
                  : `${e.invitations.filter((i) => !i.withdrawn_at && i.response === "present").length}/${e.invitations.filter((i) => !i.withdrawn_at).length}`}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
