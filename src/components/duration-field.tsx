"use client";
import { useId, useState } from "react";
import type { Locale } from "@/lib/locale";
import { brusselsEndOfDay, durationCopy } from "./duration-copy";

/**
 * How long rights last (wave 17, G3): « Jusqu'à nouvel ordre » by default, a
 * date only when « Jusqu'au... » is chosen. The form reads `${name}` (the
 * date, empty for no end) and `${name}-mode`.
 */
export function DurationField({ locale, name, initial }: { locale: Locale; name: string; initial?: string | null }) {
  const t = durationCopy[locale];
  const id = useId();
  const [mode, setMode] = useState<"forever" | "until">(initial ? "until" : "forever");
  return (
    <fieldset className="duration-field">
      <legend>{t.label}</legend>
      <label className="check">
        <input type="radio" name={`${name}-mode`} value="forever" checked={mode === "forever"} onChange={() => setMode("forever")} />
        {t.forever}
      </label>
      <label className="check">
        <input type="radio" name={`${name}-mode`} value="until" checked={mode === "until"} onChange={() => setMode("until")} />
        {t.until}
      </label>
      {mode === "until" && (
        <label htmlFor={id}>
          {t.date}
          <input id={id} name={name} type="date" required defaultValue={initial ? initial.slice(0, 10) : ""} />
        </label>
      )}
    </fieldset>
  );
}

/** The chosen end, as an ISO date-time at the end of that day in Brussels, or null for « jusqu'à nouvel ordre ». */
export function readDuration(form: FormData, name: string) {
  const day = String(form.get(name) ?? "");
  return form.get(`${name}-mode`) === "until" && day ? brusselsEndOfDay(day) : null;
}

