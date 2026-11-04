"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { offboardingSettings, offboardingView } from "@/domains/offboarding/service";
import { optionalKinds } from "@/domains/offboarding/schema";
import { offboardingCopy } from "./offboarding-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, Field, describedBy } from "./ui";
import { cssVars } from "./css-vars";

/**
 * « Fin de coach » on the coach's file. For who manages the members: the
 * button, then the departure's steps with what to do on each. For the coach
 * himself: his part (three questions, his private sheets) and his
 * volunteering certificate.
 */
type View = Awaited<ReturnType<typeof offboardingView>>;
type Step = NonNullable<View["run"]>["steps"][number];
type Send = (b: Record<string, unknown>, done?: string) => Promise<Record<string, unknown> | null>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const dayText = (l: Locale, d: string) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

export function CoachDeparture({ locale, profileId }: { locale: Locale; profileId: string }) {
  const t = offboardingCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/offboarding?profile=${encodeURIComponent(profileId)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profileId, version]);
  const send: Send = useCallback(
    async (body, done) => {
      if (!data) return null;
      setBusy(true);
      setFailed("");
      setStatus("");
      try {
        const r = await fetch("/api/offboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: data.organization_id, ...body }) });
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        setStatus(typeof v.sent === "number" ? fill(t.sent, { n: v.sent }) : (done ?? t.saved));
        setVersion((n) => n + 1);
        return v as Record<string, unknown>;
      } catch (e) {
        const code = (e as Error).message;
        setFailed(t.errors[code] ?? errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [data, locale, t],
  );
  if (!data) return null;
  const run = data.run;
  // Nothing to show to the coach himself before a departure exists.
  if (!run && !data.can.manage) return null;
  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send({ action: "start", profileId, endsOn: f.get("endsOn"), reason: f.get("reason"), note: f.get("note") ?? "", notifyCoach: f.get("notifyCoach") === "on", locale }, t.started);
    if (ok) setOpening(false);
  }
  const certificate = `/api/offboarding?profile=${encodeURIComponent(profileId)}&certificate=1&locale=${locale}`;
  return (
    <Card title={t.title} icon="logOut" id="departure" headingId={`departure-${profileId}`} labelledBy={`departure-${profileId}`}>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {!run || run.status !== "active" ? (
        <>
          {run && <p className="muted">{run.status === "done" ? t.closed : t.cancelled}</p>}
          {data.can.manage && !opening && (
            <>
              <p className="muted">{t.intro}</p>
              <p className="actions">
                <Button type="button" variant="secondary" icon="logOut" onClick={() => setOpening(true)}>
                  {t.start}
                </Button>
              </p>
            </>
          )}
          {data.can.manage && opening && (
            <form className="stack" onSubmit={(e) => void start(e)}>
              <Field id={`dep-end-${profileId}`} label={t.endsOn} required>
                <input id={`dep-end-${profileId}`} name="endsOn" type="date" min={data.today} defaultValue={data.today} required />
              </Field>
              <Field id={`dep-reason-${profileId}`} label={t.reason}>
                <select id={`dep-reason-${profileId}`} name="reason" defaultValue="unknown">
                  {(["stopped", "moved", "unknown"] as const).map((r) => (
                    <option key={r} value={r}>
                      {t.reasons[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`dep-note-${profileId}`} label={t.note} help={t.noteHelp}>
                <textarea id={`dep-note-${profileId}`} name="note" maxLength={1000} rows={2} aria-describedby={`dep-note-${profileId}-help`} />
              </Field>
              <label className="check">
                <input type="checkbox" name="notifyCoach" defaultChecked /> {t.notifyCoach}
              </label>
              <p className="actions">
                <Button type="submit" loading={busy}>
                  {t.confirmStart}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpening(false)}>
                  {t.cancelForm}
                </Button>
              </p>
            </form>
          )}
        </>
      ) : (
        <>
          {!data.can.manage && <p>{t.selfIntro}</p>}
          <p>
            <strong>{fill(t.endsAt, { date: dayText(locale, run.ends_on) })}</strong>
            {data.can.manage && <span className="muted small"> · {t.reasons[run.reason as "stopped" | "moved" | "unknown"]}</span>}
          </p>
          {run.note && <p className="small muted pre-line">{run.note}</p>}
          <div
            className="journey-progress"
            role="progressbar"
            aria-label={t.title}
            aria-valuemin={0}
            aria-valuemax={run.progress.total}
            aria-valuenow={run.progress.done}
            aria-valuetext={fill(t.progress, { done: run.progress.done, total: run.progress.total })}
          >
            <span style={cssVars({ value: run.progress.percent })} />
          </div>
          <p className="small">{fill(t.progress, { done: run.progress.done, total: run.progress.total })}</p>
          <ol className="journey-steps">
            {run.steps.map((s) => (
              <li key={s.key} data-done={!!s.done_at || undefined}>
                <DepartureStep locale={locale} runId={run.id} s={s} data={data} busy={busy} send={send} />
              </li>
            ))}
          </ol>
          {data.can.manage && (
            <p className="actions">
              <Button type="button" variant="danger" disabled={busy} onClick={() => void send({ action: "cancel", runId: run.id }, t.cancelled)}>
                {t.cancel}
              </Button>
            </p>
          )}
        </>
      )}
      <p>
        <a href={certificate} className="button secondary" download>
          {t.certificate}
        </a>
      </p>
    </Card>
  );
}

function PersonPick({ id, data, accountOnly, label, help }: { id: string; data: View; accountOnly?: boolean; label: string; help?: boolean }) {
  return (
    <select id={id} name="to" required defaultValue="" aria-describedby={describedBy(id, help)}>
      <option value="" disabled>
        {label}
      </option>
      {data.people
        .filter((p) => !accountOnly || p.account)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
    </select>
  );
}

function DepartureStep({ locale, runId, s, data, busy, send }: { locale: Locale; runId: string; s: Step; data: View; busy: boolean; send: Send }) {
  const t = offboardingCopy[locale];
  const manage = data.can.manage,
    self = data.can.self;
  const late = !s.done_at && s.due_on < data.today;
  const fid = `dep-${runId}-${s.key.replace(/[^a-z0-9]/gi, "")}`;
  function to(action: string) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void send({ action, runId, toProfileId: new FormData(e.currentTarget).get("to") });
    };
  }
  function survey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({ action: "survey", runId, answers: { liked: f.get("liked") ?? "", change: f.get("change") ?? "", back: f.get("back") ?? "" } });
  }
  function skip(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send({ action: "skip", runId, key: s.key, reason: new FormData(e.currentTarget).get("reason") });
  }
  return (
    <>
      <p>
        <strong>{s.label}</strong> <span className="muted small">({dayText(locale, s.due_on)})</span>{" "}
        {s.done_at ? (
          <Badge tone={s.done_how === "skipped" ? "neutral" : "success"}>{s.done_how === "skipped" ? t.skipped : s.done_how === "auto" ? t.auto : t.done}</Badge>
        ) : (
          <>
            {s.blocking && <Badge tone="warning">{t.blocking}</Badge>} {late && <Badge tone="danger">{t.late}</Badge>}
          </>
        )}
      </p>
      {s.skip_reason && <p className="small muted">{s.skip_reason}</p>}
      {!s.done_at && (
        <>
          {s.kind === "replace" && (
            <p className="small">
              {t.replaceHelp}{" "}
              {manage && s.ref && (
                <Link href={`/${locale}/teams/${s.ref}`}>
                  {t.openTeam}
                </Link>
              )}
            </p>
          )}
          {manage && s.kind === "tasks" && (
            <form className="inline-form" onSubmit={to("reassignTasks")}>
              <Field id={`${fid}-to`} label={t.to}>
                <PersonPick id={`${fid}-to`} data={data} label={t.choose} />
              </Field>
              <Button type="submit" size="sm" disabled={busy}>
                {t.reassignTasks}
              </Button>
            </form>
          )}
          {manage && s.kind === "duties" && (
            <form className="inline-form" onSubmit={to("reassignDuties")}>
              <Field id={`${fid}-to`} label={t.to} help={t.dutiesHelp}>
                <PersonPick id={`${fid}-to`} data={data} accountOnly help label={t.choose} />
              </Field>
              <Button type="submit" size="sm" disabled={busy}>
                {t.reassignDuties}
              </Button>
            </form>
          )}
          {s.kind === "keys" && <p className="small">{t.keysHelp}</p>}
          {manage && s.kind === "rights" && (
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "rightsEnd", runId })}>
              {t.rightsEnd}
            </Button>
          )}
          {manage && s.kind === "notify" && (
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "notify", runId, locale })}>
              {t.notifySend}
            </Button>
          )}
          {manage && s.kind === "thanks" && (
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "thanks", runId, locale })}>
              {t.thanksSend}
            </Button>
          )}
          {s.kind === "survey" &&
            (self ? (
              <form className="stack" onSubmit={survey} aria-label={t.survey.title}>
                <p>
                  <strong>{t.survey.title}</strong>
                </p>
                {(["liked", "change", "back"] as const).map((k) => (
                  <Field key={k} id={`${fid}-${k}`} label={t.survey[k]}>
                    <textarea id={`${fid}-${k}`} name={k} maxLength={1000} rows={2} />
                  </Field>
                ))}
                <p className="actions">
                  <Button type="submit" size="sm" disabled={busy}>
                    {t.survey.send}
                  </Button>
                </p>
              </form>
            ) : null)}
          {s.kind === "exercises" &&
            (self ? (
              <>
                <p className="small">{t.exercises.text}</p>
                <p className="actions">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void send({ action: "exercises", runId, choice: "copy" })}>
                    {t.exercises.copy}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "exercises", runId, choice: "keep" })}>
                    {t.exercises.keep}
                  </Button>
                </p>
              </>
            ) : null)}
          {!manage && !["survey", "exercises"].includes(s.kind) && <p className="small muted">{t.waiting}</p>}
          {manage && s.kind !== "close" && (
            <details>
              <summary>{t.skip}</summary>
              <form className="inline-form" onSubmit={skip}>
                <Field id={`${fid}-skip`} label={t.skipReason}>
                  <input id={`${fid}-skip`} name="reason" minLength={3} maxLength={300} required />
                </Field>
                <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                  {t.skipSave}
                </Button>
              </form>
            </details>
          )}
        </>
      )}
    </>
  );
}

/** 7: Réglages › Membres et droits: the optional steps a club keeps. */
export function OffboardingSettings({ locale }: { locale: Locale }) {
  const t = offboardingCopy[locale].settings;
  const [data, setData] = useState<Awaited<ReturnType<typeof offboardingSettings>> | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/offboarding?settings=1", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Awaited<ReturnType<typeof offboardingSettings>>) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!data) return null;
  const current = data;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const skip = optionalKinds.filter((k) => f.get(k) !== "on");
    setBusy(true);
    try {
      const r = await fetch("/api/offboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: current.organization_id, action: "settings", skip }) });
      setStatus(r.ok ? offboardingCopy[locale].saved : (errors.INVALID_INPUT?.[locale] ?? ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t.title} labelledBy="settings-offboarding" headingId="settings-offboarding">
      <p className="muted">{t.intro}</p>
      <form className="stack" onSubmit={(e) => void save(e)}>
        {optionalKinds.map((k) => (
          <label className="check" key={k}>
            <input type="checkbox" name={k} defaultChecked={!current.skip.includes(k)} /> {t.keep[k as "notify" | "thanks" | "survey" | "exercises"]}
          </label>
        ))}
        <p className="actions">
          <Button type="submit" disabled={busy}>
            {t.save}
          </Button>
        </p>
      </form>
      <p role="status">{status}</p>
    </Card>
  );
}
