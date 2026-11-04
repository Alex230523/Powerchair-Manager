"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { scheduleView } from "@/domains/calendar/season-schedule";
import type { PlannedDate, Skip } from "@/domains/calendar/holidays";
import { schoolYearOf } from "@/domains/calendar/holidays";
import { seasonScheduleCopy } from "./season-schedule-copy";
import { Badge, Button, Card, PageHeader } from "./ui";

/**
 * H9: « Planifier la saison ». The holidays of reference (and the club's
 * corrections), the closures, then the slots: a preview of every date with
 * the skipped ones and their reason, a date brought back with one click,
 * the series created at once (never twice).
 */
type View = Awaited<ReturnType<typeof scheduleView>>;
type SlotForm = {
  key: number;
  teamId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  placeId: string;
  eventTypeId: string;
  responsibleId: string;
  title: string;
  from: string;
  to: string;
  reactivated: string[];
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

async function post(body: unknown) {
  const r = await fetch("/api/calendar/season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v;
}

export function SeasonSchedule({ locale }: { locale: Locale }) {
  const t = seasonScheduleCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [failure, setFailure] = useState(""),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [seasonId, setSeasonId] = useState(""),
    [slots, setSlots] = useState<SlotForm[]>([]),
    [preview, setPreview] = useState<{ teamId: string; dates: PlannedDate[] }[] | null>(null),
    [email, setEmail] = useState(true),
    [results, setResults] = useState<{ teamId: string; weekday: number; created: boolean; sessions: number; error: string | null }[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/calendar/season", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        return v as View;
      })
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e: Error) => {
        if (live) setFailure(e.message);
      });
    return () => {
      live = false;
    };
  }, [version]);

  const header = <PageHeader title={t.title} subtitle={t.intro} />;
  if (!data)
    return (
      <main id="main" className="access season-schedule">
        {header}
        {failure ? <p role="alert">{failure === "FORBIDDEN" ? t.forbidden : t.error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const season = data.seasons.find((s) => s.id === seasonId) ?? data.seasons[0];
  const day = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
  const why = (s: Skip) => (s.kind === "public" ? t.publicHolidays[s.key] : s.kind === "closure" ? fill(t.closed, { label: s.name }) : s.name);
  const year = season ? schoolYearOf(season.starts_on) : null;

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      const v = await post(body);
      setStatus(done);
      setVersion((x) => x + 1);
      return v;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(t.errors[code] ?? t.error);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const newSlot = (): SlotForm => ({
    key: Date.now() + Math.random(),
    teamId: season?.teams[0]?.id ?? "",
    weekday: 3,
    startTime: "18:00",
    endTime: "19:30",
    placeId: data.places[0]?.id ?? "",
    eventTypeId: data.types.find((x) => x.family === "training")?.id ?? "",
    responsibleId: data.responsibles[0]?.id ?? "",
    title: t.defaultTitle,
    from: season?.starts_on ?? "",
    to: season?.ends_on ?? "",
    reactivated: [],
  });
  const change = (key: number, patch: Partial<SlotForm>) => {
    setSlots((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setPreview(null);
  };
  const body = (list: SlotForm[]) =>
    list.map((s) => ({
      teamId: s.teamId,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      placeId: s.placeId || null,
      eventTypeId: s.eventTypeId || null,
      responsibleId: s.responsibleId,
      title: s.title,
      from: s.from,
      to: s.to,
      reactivated: s.reactivated,
    }));

  return (
    <main id="main" className="access season-schedule">
      {header}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {data.kind === "club" && (
        <Card title={t.referenceTitle}>
          <p className="muted">{t.referenceText}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run({ action: "reference", communities: f.getAll("community").map(String) }, t.saveReference);
            }}
          >
            <fieldset>
              <legend>{t.community}</legend>
              {(["fwb", "vl"] as const).map((c) => (
                <label key={c} className="check">
                  <input type="checkbox" name="community" value={c} defaultChecked={data.reference.includes(c)} />
                  {t.communities[c]}
                </label>
              ))}
            </fieldset>
            <p className="actions">
              <Button disabled={busy}>{t.saveReference}</Button>
            </p>
          </form>
        </Card>
      )}
      <Card title={year ? `${t.holidaysTitle} ${year}` : t.holidaysTitle}>
        <ul className="records">
          {data.holidays
            .filter((h) => !year || h.school_year === year)
            .map((h) => (
              <li key={h.id}>
                <strong>{h.name}</strong> · {day(h.starts_on)} → {day(h.ends_on)} <Badge tone="neutral">{t.communities[h.community as "fwb" | "vl"]}</Badge>{" "}
                <Badge tone={h.origin === "club" ? "info" : "neutral"}>{t.origin[h.origin]}</Badge>{" "}
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run({ action: "hideHoliday", id: h.id }, t.hide)}>
                  {t.hide}
                  <span className="sr-only"> : {h.name}</span>
                </Button>
              </li>
            ))}
        </ul>
        <details>
          <summary>{t.addHoliday}</summary>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                {
                  action: "holiday",
                  community: f.get("community"),
                  schoolYear: f.get("schoolYear"),
                  name: f.get("name"),
                  startsOn: f.get("startsOn"),
                  endsOn: f.get("endsOn"),
                  overrides: f.get("overrides") || null,
                },
                t.addHoliday,
              );
            }}
          >
            <label>
              {t.holidayName}
              <input name="name" required minLength={2} maxLength={120} />
            </label>
            <label>
              {t.community}
              <select name="community" defaultValue={data.reference[0] ?? "fwb"}>
                {(["fwb", "vl"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t.communities[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.schoolYear}
              <input name="schoolYear" required pattern="\d{4}-\d{4}" defaultValue={year ?? ""} />
            </label>
            <label>
              {t.from}
              <input name="startsOn" type="date" required />
            </label>
            <label>
              {t.to}
              <input name="endsOn" type="date" required />
            </label>
            <label>
              {t.replaces}
              <select name="overrides" defaultValue="">
                <option value="">{t.replacesNone}</option>
                {data.holidays.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.school_year})
                  </option>
                ))}
              </select>
            </label>
            <p className="actions wide">
              <Button disabled={busy}>{t.addHoliday}</Button>
            </p>
          </form>
        </details>
      </Card>
      {data.kind === "club" && (
        <>
          <Card title={t.closuresTitle}>
            <p className="muted">{t.closuresText}</p>
            {data.closures.length ? (
              <ul className="records">
                {data.closures.map((k) => (
                  <li key={k.id}>
                    <strong>{k.label}</strong> · {k.place ?? t.closureClub} · {day(k.starts_on)} → {day(k.ends_on)}{" "}
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run({ action: "removeClosure", id: k.id }, t.remove)}>
                      {t.remove}
                      <span className="sr-only"> : {k.label}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noClosure}</p>
            )}
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run({ action: "closure", placeId: f.get("placeId") || null, label: f.get("label"), startsOn: f.get("startsOn"), endsOn: f.get("endsOn") }, t.addClosure);
              }}
            >
              <label>
                {t.closurePlace}
                <select name="placeId" defaultValue="">
                  <option value="">{t.closureClub}</option>
                  {data.places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.closureLabel}
                <input name="label" required minLength={2} maxLength={120} />
              </label>
              <label>
                {t.from}
                <input name="startsOn" type="date" required />
              </label>
              <label>
                {t.to}
                <input name="endsOn" type="date" required />
              </label>
              <p className="actions wide">
                <Button disabled={busy}>{t.addClosure}</Button>
              </p>
            </form>
          </Card>
          <Card title={t.planTitle}>
            <p className="muted">{t.planText}</p>
            {data.seasons.length > 0 && (
              <label>
                {t.season}
                <select
                  value={season?.id ?? ""}
                  onChange={(e) => {
                    setSeasonId(e.target.value);
                    setSlots([]);
                    setPreview(null);
                  }}
                >
                  {data.seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {slots.map((s, i) => (
              <fieldset key={s.key} className="form-grid season-slot">
                <legend>
                  {t.planTitle} {i + 1}
                </legend>
                <label>
                  {t.team}
                  <select value={s.teamId} onChange={(e) => change(s.key, { teamId: e.target.value })}>
                    {(season?.teams ?? []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.weekday}
                  <select value={s.weekday} onChange={(e) => change(s.key, { weekday: Number(e.target.value) })}>
                    {t.weekdays.map((w, k) => (
                      <option key={w} value={k + 1}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.start}
                  <input type="time" value={s.startTime} required onChange={(e) => change(s.key, { startTime: e.target.value })} />
                </label>
                <label>
                  {t.end}
                  <input type="time" value={s.endTime} required onChange={(e) => change(s.key, { endTime: e.target.value })} />
                </label>
                <label>
                  {t.place}
                  <select value={s.placeId} onChange={(e) => change(s.key, { placeId: e.target.value })}>
                    <option value="">{t.noPlace}</option>
                    {data.places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.type}
                  <select value={s.eventTypeId} onChange={(e) => change(s.key, { eventTypeId: e.target.value })}>
                    <option value="">{t.noType}</option>
                    {data.types.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.responsible}
                  <select value={s.responsibleId} onChange={(e) => change(s.key, { responsibleId: e.target.value })}>
                    {data.responsibles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.sessionTitle}
                  <input value={s.title} required minLength={2} maxLength={160} onChange={(e) => change(s.key, { title: e.target.value })} />
                </label>
                <label>
                  {t.from}
                  <input type="date" value={s.from} min={season?.starts_on} max={season?.ends_on} onChange={(e) => change(s.key, { from: e.target.value })} />
                </label>
                <label>
                  {t.to}
                  <input type="date" value={s.to} min={season?.starts_on} max={season?.ends_on} onChange={(e) => change(s.key, { to: e.target.value })} />
                </label>
                <p className="actions wide">
                  <Button type="button" variant="ghost" onClick={() => setSlots((all) => all.filter((x) => x.key !== s.key))}>
                    {t.removeSlot}
                  </Button>
                </p>
                {preview?.[i] && (
                  <div className="wide season-slot-preview">
                    <p>
                      <strong>{fill(t.kept, { n: preview[i].dates.filter((d) => !d.skip).length })}</strong> · {fill(t.skipped, { n: preview[i].dates.filter((d) => d.skip).length })}
                    </p>
                    <ul className="plain-list season-slot-dates">
                      {preview[i].dates
                        .filter((d) => d.skip || d.was)
                        .map((d) => (
                          <li key={d.date}>
                            {day(d.date)} · {d.skip ? why(d.skip) : `${why(d.was!)} (${t.reactivated})`}
                            {d.skip && (
                              <>
                                {" "}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const next = slots.map((x) => (x.key === s.key ? { ...x, reactivated: [...x.reactivated, d.date] } : x));
                                    setSlots(next);
                                    void post({ action: "preview", seasonId: season!.id, slots: body(next) }).then((v) => setPreview(v.slots));
                                  }}
                                >
                                  {t.reactivate}
                                  <span className="sr-only"> : {day(d.date)}</span>
                                </Button>
                              </>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </fieldset>
            ))}
            {season && season.teams.length > 0 && (
              <p className="actions">
                <Button type="button" variant="secondary" onClick={() => setSlots((all) => [...all, newSlot()])}>
                  {t.addSlot}
                </Button>
                {slots.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        setError("");
                        try {
                          setPreview((await post({ action: "preview", seasonId: season.id, slots: body(slots) })).slots);
                        } catch (e) {
                          setError(t.errors[e instanceof Error ? e.message : ""] ?? t.error);
                        }
                      })()
                    }
                  >
                    {t.preview}
                  </Button>
                )}
              </p>
            )}
            {preview && slots.length > 0 && (
              <>
                <label className="check">
                  <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} aria-describedby="season-email-hint" />
                  {t.email}
                </label>
                <p className="muted small" id="season-email-hint">
                  {t.emailHint}
                </p>
                <p className="actions">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run({ action: "plan", seasonId: season!.id, slots: body(slots), email }, "").then((v) => {
                        if (!v) return;
                        setResults(v.results);
                        setStatus(fill(t.created, { n: v.results.filter((r: { created: boolean }) => r.created).length }));
                        setSlots([]);
                        setPreview(null);
                      })
                    }
                  >
                    {t.create}
                  </Button>
                </p>
              </>
            )}
            {results.length > 0 && (
              <ul className="records">
                {results.map((r, i) => (
                  <li key={i}>
                    {season?.teams.find((x) => x.id === r.teamId)?.name} · {t.weekdays[r.weekday - 1]} ·{" "}
                    {r.error ? fill(t.failed, { reason: t.errors[r.error] ?? r.error }) : r.created ? fill(t.sessions, { n: r.sessions }) : t.existing}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t.planned}>
            {data.slots.length ? (
              <ul className="records">
                {data.slots.map((s: { id: string; team: string; weekday: number; start_time: string; end_time: string; sessions: number }) => (
                  <li key={s.id}>
                    <strong>{s.team}</strong> · {t.weekdays[s.weekday - 1]} {s.start_time} → {s.end_time} · {fill(t.sessions, { n: s.sessions })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noPlanned}</p>
            )}
            <p className="muted small">{t.seriesHint}</p>
          </Card>
        </>
      )}
    </main>
  );
}
