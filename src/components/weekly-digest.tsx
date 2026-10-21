"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { clockLabel, digestSections, digestTimes, type DigestSection } from "@/domains/digest/schema";
import { digestCopy } from "./digest-copy";
import { Button, Panel } from "./ui";

export type DigestSettings = {
  enabled: boolean;
  day: number | null;
  minute: number | null;
  sections: DigestSection[];
  club: { day: number; minute: number };
  canClub: boolean;
  next: { date: string; minute: number } | null;
};

/**
 * Settings > Notifications and digest (wave 15, C7): the weekly digest of a
 * president or a coach, the club's default moment for the president, and a
 * preview sent at once.
 */
export function WeeklyDigest({
  locale,
  digest,
  send,
}: {
  locale: Locale;
  digest: DigestSettings;
  /** Posts a command to /api/notifications and reloads; the result comes back. */
  send: (command: Record<string, unknown>) => Promise<{ sent?: boolean }>;
}) {
  const t = digestCopy[locale];
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failure, setFailure] = useState("");
  const dayName = (d: number) => t.days[d - 1];
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const nextDate = (date: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setStatus("");
    setFailure("");
    try {
      setStatus(await fn());
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : t.noSection);
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sections = f.getAll("sections").map(String);
    const enabled = f.has("enabled");
    if (enabled && !sections.length) {
      setFailure(t.noSection);
      return;
    }
    const day = String(f.get("day") ?? ""),
      minute = String(f.get("minute") ?? "");
    void run(async () => {
      await send({ action: "digest", enabled, day: day ? Number(day) : null, minute: minute ? Number(minute) : null, sections });
      return t.saved;
    });
  }
  function saveClub(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await send({ action: "digestClub", day: Number(f.get("clubDay")), minute: Number(f.get("clubMinute")) });
      return t.clubSaved;
    });
  }
  return (
    <Panel id="notif-digest" title={t.title}>
      <p className="muted">{t.intro}</p>
      <form className="digest-form" key={JSON.stringify(digest)} onSubmit={save}>
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={digest.enabled} />
          {t.enabled}
        </label>
        <div className="form-grid">
          <label>
            {t.day}
            <select name="day" defaultValue={digest.day ?? ""}>
              <option value="">{t.clubDay.replace("{day}", dayName(digest.club.day))}</option>
              {t.days.map((name, i) => (
                <option key={name} value={i + 1}>
                  {capital(name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.time}
            <select name="minute" defaultValue={digest.minute ?? ""}>
              <option value="">{t.clubTime.replace("{time}", clockLabel(digest.club.minute, locale))}</option>
              {digestTimes.map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>{t.sections}</legend>
          <p className="muted small">{t.rightsHint}</p>
          <div className="check-grid">
            {digestSections.map((s) => (
              <label className="check" key={s}>
                <input type="checkbox" name="sections" value={s} defaultChecked={digest.sections.includes(s)} />
                {t.sectionNames[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={busy}>
          {t.save}
        </Button>
      </form>
      <p className="muted">
        {digest.next ? t.next.replace("{date}", nextDate(digest.next.date)).replace("{time}", clockLabel(digest.next.minute, locale)) : t.off}
      </p>
      <p className="muted">{t.previewHint}</p>
      <Button
        variant="secondary"
        icon="message"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const r = await send({ action: "digestPreview" });
            return r.sent ? t.previewSent : t.previewEmpty;
          })
        }
      >
        {t.preview}
      </Button>
      {digest.canClub && (
        <form className="digest-club" key={`club-${digest.club.day}-${digest.club.minute}`} onSubmit={saveClub}>
          <h3>{t.clubTitle}</h3>
          <p className="muted">{t.clubHint}</p>
          <div className="form-grid">
            <label>
              {t.clubDayLabel}
              <select name="clubDay" defaultValue={digest.club.day}>
                {t.days.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {capital(name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.clubTimeLabel}
              <select name="clubMinute" defaultValue={digest.club.minute}>
                {digestTimes.map((m) => (
                  <option key={m} value={m}>
                    {clockLabel(m, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>
            {t.clubSave}
          </Button>
        </form>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
    </Panel>
  );
}
