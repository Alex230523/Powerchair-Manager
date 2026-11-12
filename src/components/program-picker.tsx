"use client";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { exercisesCopy } from "./exercises-copy";
import { Button } from "./ui";

type Option = { id: string; title: string; duration_minutes: number };
type Item = { exerciseId: string; title: string; minutes: number; notes: string };

/**
 * Wave 16 (E2): « Fiches exercices » of a training in the event form: sheets
 * from the library, in order, each with its planned minutes and the coach's
 * notes, and the total duration. The choice travels in one hidden field.
 */
export function ProgramPicker({ locale, options, initial }: { locale: Locale; options: Option[]; initial: { id: string; title: string; minutes: number; notes?: string }[] }) {
  const t = exercisesCopy[locale].program;
  const [items, setItems] = useState<Item[]>(initial.map((x) => ({ exerciseId: x.id, title: x.title, minutes: x.minutes, notes: x.notes ?? "" })));
  const [pick, setPick] = useState("");
  const total = items.reduce((n, x) => n + (Number(x.minutes) || 0), 0);
  const update = (i: number, change: Partial<Item>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const move = (i: number, d: number) =>
    setItems((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const free = options.filter((o) => !items.some((x) => x.exerciseId === o.id));
  return (
    <fieldset className="event-section" id="event-program">
      <legend>{exercisesCopy[locale].title}</legend>
      <input type="hidden" name="exercises" value={JSON.stringify(items.map(({ exerciseId, minutes, notes }) => ({ exerciseId, minutes: Math.min(180, Math.max(1, Number(minutes) || 1)), notes })))} />
      {items.length ? (
        <ol className="program-list">
          {items.map((x, i) => (
            <li key={x.exerciseId}>
              <strong>{x.title}</strong>
              <span className="program-minutes">
                <input type="number" min={1} max={180} value={x.minutes} onChange={(e) => update(i, { minutes: Number(e.target.value) })} aria-label={t.planned(x.title)} />
                <span aria-hidden="true">min</span>
              </span>
              <input className="program-notes" maxLength={1000} value={x.notes} onChange={(e) => update(i, { notes: e.target.value })} aria-label={t.notes(x.title)} placeholder={t.notes("").replace(/\s*:\s*$/, "")} />
              <span className="program-actions">
                {i > 0 && (
                  <Button type="button" size="sm" variant="ghost" aria-label={t.up(x.title)} onClick={() => move(i, -1)}>
                    ↑
                  </Button>
                )}
                {i < items.length - 1 && (
                  <Button type="button" size="sm" variant="ghost" aria-label={t.down(x.title)} onClick={() => move(i, 1)}>
                    ↓
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" aria-label={t.remove(x.title)} onClick={() => setItems((list) => list.filter((_, j) => j !== i))}>
                  ×
                </Button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{t.empty}</p>
      )}
      <p className="program-total" aria-live="polite">
        {t.total(total)}
      </p>
      {free.length > 0 ? (
        <div className="program-add">
          <label htmlFor="program-pick">{t.choose}</label>
          <select id="program-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t.choose}</option>
            {free.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {o.duration_minutes} min
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!pick}
            onClick={() => {
              const o = options.find((x) => x.id === pick);
              if (o) setItems((list) => [...list, { exerciseId: o.id, title: o.title, minutes: o.duration_minutes, notes: "" }]);
              setPick("");
            }}
          >
            {t.add}
          </Button>
        </div>
      ) : (
        <p>
          <Link className="button secondary" href={`/${locale}/exercises`}>{t.library}</Link>
        </p>
      )}
    </fieldset>
  );
}
