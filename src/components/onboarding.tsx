"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { onboardingView } from "@/domains/onboarding/service";
import { audiences, profileFields, selfSteps, stepKinds, type Step, type StepKind } from "@/domains/onboarding/schema";
import { onboardingCopy } from "./onboarding-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState } from "./ui";
import { cssVars } from "./css-vars";

/**
 * Parcours d'accueil. On the home page, the newcomer's « Bienvenue » card:
 * progress, next step, each step with what to do. In Réglages › Membres et
 * droits, the templates (proposed ones to adopt, then changed freely) and
 * the follow-up: who is where, what is late, a grouped reminder.
 */
type View = Awaited<ReturnType<typeof onboardingView>>;
type Run = View["mine"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const dayText = (l: Locale, d: string) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

function useOnboarding(locale: Locale) {
  const t = onboardingCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/onboarding", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live && v) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version]);
  const send = useCallback(
    async (body: Record<string, unknown>, done = t.saved) => {
      if (!data) return null;
      setBusy(true);
      setFailed("");
      setStatus("");
      try {
        const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: data.organization_id, ...body }) });
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        setStatus(typeof v.sent === "number" ? fill(t.reminded, { n: v.sent }) : done);
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
  return { data, busy, status, failed, send };
}

/** 4: the newcomer's card, at the top of the home page, until the journey ends. */
export function WelcomeJourney({ locale }: { locale: Locale }) {
  const { data, busy, status, failed, send } = useOnboarding(locale);
  if (!data?.mine.length) return null;
  return (
    <>
      {data.mine.map((r) => (
        <JourneyCard key={r.id} locale={locale} r={r} today={data.today} busy={busy} send={send} />
      ))}
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
    </>
  );
}

function JourneyCard({ locale, r, today, busy, send }: { locale: Locale; r: Run; today: string; busy: boolean; send: (b: Record<string, unknown>) => Promise<unknown> }) {
  const t = onboardingCopy[locale];
  const next = r.steps.find((s) => s.key === r.progress.next);
  const id = `journey-${r.id}`;
  return (
    <Card title={fill(t.welcome, { name: r.name })} headingId={`${id}-title`} labelledBy={`${id}-title`} className="journey-card">
      <div className="journey-progress" role="progressbar" aria-labelledby={`${id}-title`} aria-valuemin={0} aria-valuemax={r.progress.total} aria-valuenow={r.progress.done} aria-valuetext={fill(t.progress, { done: r.progress.done, total: r.progress.total })}>
        <span style={cssVars({ value: r.progress.percent })} />
      </div>
      <p className="small">{fill(t.progress, { done: r.progress.done, total: r.progress.total })}</p>
      {next && (
        <p>
          <strong>{fill(t.next, { title: next.title })}</strong>
        </p>
      )}
      <details>
        <summary>{t.all}</summary>
        <ol className="journey-steps">
          {r.steps.map((s) => (
            <li key={s.key} data-done={!!s.done_at || undefined}>
              <StepLine locale={locale} runId={r.id} s={s} today={today} busy={busy} send={send} />
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}

function StepLine({ locale, runId, s, today, busy, send }: { locale: Locale; runId: string; s: Run["steps"][number]; today: string; busy: boolean; send: (b: Record<string, unknown>) => Promise<unknown> }) {
  const t = onboardingCopy[locale];
  const kind = s.kind as StepKind;
  const late = !s.done_at && s.required && s.due_on < today;
  function sign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send({ action: "done", runId, key: s.key, signedName: new FormData(e.currentTarget).get("name") });
  }
  return (
    <>
      <p>
        <strong>{s.title}</strong> <span className="muted small">({t.kinds[kind]}, {fill(t.due, { date: dayText(locale, s.due_on) })})</span>{" "}
        {s.done_at ? <Badge tone="success">{t.done}</Badge> : late ? <Badge tone="warning">{t.late}</Badge> : null}
      </p>
      {s.body && <p className="small pre-line">{s.body}</p>}
      {s.signed_name && <p className="small muted">{fill(t.signedAs, { name: s.signed_name })}</p>}
      {!s.done_at &&
        (selfSteps.includes(kind) ? (
          kind === "sign" ? (
            <form className="form-grid" onSubmit={sign} aria-label={`${t.doSelf.sign} : ${s.title}`}>
              <label htmlFor={`${runId}-${s.key}-name`}>
                {t.signName}
                <input id={`${runId}-${s.key}-name`} name="name" required minLength={2} maxLength={120} />
              </label>
              <div className="actions">
                <Button type="submit" disabled={busy}>
                  {t.doSelf.sign}
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "done", runId, key: s.key })}>
              {t.doSelf[kind as "message" | "read" | "training"]}
              <span className="sr-only"> : {s.title}</span>
            </Button>
          )
        ) : (
          <p className="small muted">{t.where[kind as "profile" | "upload" | "task" | "meeting" | "tour"]}</p>
        ))}
    </>
  );
}

/** 5: Réglages › Membres et droits: the templates and the follow-up. */
export function OnboardingSettings({ locale }: { locale: Locale }) {
  const t = onboardingCopy[locale];
  const { data, busy, status, failed, send } = useOnboarding(locale);
  const [editing, setEditing] = useState<string | null>(null);
  if (!data?.can.manage) return null;
  const club = data.kind === "club";
  const proposals = club ? (["coach", "family"] as const) : (["referee"] as const);
  return (
    <Card title={t.title} labelledBy="settings-onboarding" headingId="settings-onboarding">
      <p className="muted">{t.intro}</p>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      <h3>{t.templates}</h3>
      {!data.templates.length && <p className="muted">{t.noTemplate}</p>}
      <p className="actions">
        {proposals.map((k) => (
          <Button key={k} type="button" variant="secondary" disabled={busy} onClick={() => void send({ action: "adopt", key: k, locale })}>
            {fill(t.adopt, { name: t.suggestions[k] })}
          </Button>
        ))}
      </p>
      <ul className="plain-list onboarding-templates">
        {data.templates.map((tpl) => (
          <li key={tpl.id}>
            {editing === tpl.id ? (
              <TemplateEditor locale={locale} tpl={tpl} data={data} busy={busy} close={() => setEditing(null)} send={send} />
            ) : (
              <>
                <span>
                  <strong>{tpl.name}</strong>{" "}
                  <span className="muted small">
                    {t.audiences[tpl.audience as keyof typeof t.audiences]} · {t.triggers[tpl.trigger as "invitation" | "manual"]} · {tpl.steps.length} {t.steps.toLowerCase()}
                  </span>{" "}
                  {tpl.archived && <Badge>{t.archive}</Badge>}
                </span>
                <span className="row-actions">
                  <button type="button" className="text-button" onClick={() => setEditing(tpl.id)}>
                    {t.edit}
                    <span className="sr-only"> : {tpl.name}</span>
                  </button>
                  <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "archiveTemplate", id: tpl.id, archived: !tpl.archived })}>
                    {tpl.archived ? t.restore : t.archive}
                    <span className="sr-only"> : {tpl.name}</span>
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <h3>{t.follow}</h3>
      <p className="actions">
        <Button type="button" variant="secondary" disabled={busy || !data.runs.some((r) => r.progress.late > 0 && r.status === "active")} onClick={() => void send({ action: "remind" })}>
          {t.remind}
        </Button>
      </p>
      {data.runs.length ? (
        <ul className="plain-list onboarding-runs">
          {data.runs.map((r) => (
            <li key={r.id}>
              <details>
                <summary>
                  {fill(t.runLine, { person: r.user_name, name: r.name, progress: fill(t.progress, { done: r.progress.done, total: r.progress.total }) })} <Badge tone={r.status === "done" ? "success" : r.progress.late ? "warning" : "info"}>{r.progress.late && r.status === "active" ? t.late : t.statuses[r.status as keyof typeof t.statuses]}</Badge>
                </summary>
                <ol className="journey-steps">
                  {r.steps.map((s) => (
                    <li key={s.key} data-done={!!s.done_at || undefined}>
                      <span>
                        {s.title} <span className="muted small">({t.kinds[s.kind as StepKind]}, {fill(t.due, { date: dayText(locale, s.due_on) })})</span>{" "}
                        {s.done_at ? <Badge tone="success">{t.done}</Badge> : s.required && s.due_on < data.today ? <Badge tone="warning">{t.late}</Badge> : null}
                      </span>
                      {r.status !== "cancelled" && (
                        <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "mark", runId: r.id, key: s.key, done: !s.done_at })}>
                          {s.done_at ? t.markUndone : t.markDone}
                          <span className="sr-only"> : {s.title}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                {r.status === "active" && (
                  <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "cancel", runId: r.id })}>
                    {t.stopRun}
                  </Button>
                )}
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.noRun} />
      )}
      {data.templates.some((x) => !x.archived) && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send({ action: "start", templateId: f.get("template"), userId: f.get("person") });
          }}
        >
          <label htmlFor="onboarding-person">
            {t.person}
            <select id="onboarding-person" name="person" required>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="onboarding-template">
            {t.template}
            <select id="onboarding-template" name="template" required>
              {data.templates
                .filter((x) => !x.archived)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="actions">
            <Button type="submit" variant="secondary" disabled={busy}>
              {t.start}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

let counter = 0;
type Draft = Step & { uid: string };
function TemplateEditor({ locale, tpl, data, busy, close, send }: { locale: Locale; tpl: View["templates"][number]; data: View; busy: boolean; close: () => void; send: (b: Record<string, unknown>) => Promise<unknown> }) {
  const t = onboardingCopy[locale];
  const [steps, setSteps] = useState<Draft[]>(() => tpl.steps.map((s) => ({ ...s, uid: s.key })));
  const change = (i: number, patch: Partial<Draft>) => setSteps(steps.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const move = (i: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [x] = next.splice(i, 1);
    next.splice(to, 0, x);
    setSteps(next);
  };
  const owners = data.owners;
  const club = data.kind === "club";
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({
      action: "saveTemplate",
      id: tpl.id,
      name: f.get("name"),
      audience: f.get("audience"),
      trigger: f.get("trigger"),
      steps: steps.map(({ uid: _uid, ...s }) => (void _uid, s)),
    }).then((ok) => ok && close());
  }
  return (
    <form className="onboarding-editor" onSubmit={submit}>
      <div className="form-grid">
        <label htmlFor={`${tpl.id}-name`}>
          {t.name}
          <input id={`${tpl.id}-name`} name="name" required minLength={2} maxLength={120} defaultValue={tpl.name} />
        </label>
        <label htmlFor={`${tpl.id}-audience`}>
          {t.audience}
          <select id={`${tpl.id}-audience`} name="audience" defaultValue={tpl.audience}>
            {audiences
              .filter((a) => (club ? ["coach", "player", "guardian"] : ["referee", "federation_worker"]).includes(a))
              .map((a) => (
                <option key={a} value={a}>
                  {t.audiences[a]}
                </option>
              ))}
          </select>
        </label>
        <label htmlFor={`${tpl.id}-trigger`}>
          {t.trigger}
          <select id={`${tpl.id}-trigger`} name="trigger" defaultValue={tpl.trigger}>
            <option value="invitation">{t.triggers.invitation}</option>
            <option value="manual">{t.triggers.manual}</option>
          </select>
        </label>
      </div>
      <h4>{t.steps}</h4>
      <ol className="onboarding-step-editor">
        {steps.map((s, i) => {
          const base = `${tpl.id}-${s.uid}`;
          return (
            <li key={s.uid}>
              <fieldset>
                <legend>{s.title[locale] || s.title.fr || `${i + 1}`}</legend>
                <div className="form-grid">
                  <label htmlFor={`${base}-kind`}>
                    {t.stepKind}
                    <select id={`${base}-kind`} value={s.kind} onChange={(e) => change(i, { kind: e.target.value as StepKind })}>
                      {stepKinds.map((k) => (
                        <option key={k} value={k}>
                          {t.kinds[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${base}-title`}>
                    {t.stepTitle}
                    <input
                      id={`${base}-title`}
                      required
                      maxLength={300}
                      value={s.title[locale]}
                      // A new text in this language; the other languages keep theirs (or take this one when empty).
                      onChange={(e) => change(i, { title: { fr: s.title.fr || e.target.value, nl: s.title.nl || e.target.value, en: s.title.en || e.target.value, [locale]: e.target.value } })}
                    />
                  </label>
                  <label htmlFor={`${base}-days`}>
                    {t.stepDays}
                    <input id={`${base}-days`} type="number" min={0} max={365} value={s.daysAfter} onChange={(e) => change(i, { daysAfter: Number(e.target.value) })} />
                  </label>
                  {s.kind === "profile" && (
                    <label htmlFor={`${base}-field`}>
                      {t.stepLink}
                      <select id={`${base}-field`} value={s.link} onChange={(e) => change(i, { link: e.target.value })}>
                        {profileFields.map((k) => (
                          <option key={k} value={k}>
                            {t.fields[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {s.kind === "upload" && (
                    <label htmlFor={`${base}-doc`}>
                      {t.stepLink}
                      <input id={`${base}-doc`} maxLength={200} value={s.link} onChange={(e) => change(i, { link: e.target.value })} />
                    </label>
                  )}
                  {s.kind === "meeting" && (
                    <label htmlFor={`${base}-owner`}>
                      {t.stepOwner}
                      <select id={`${base}-owner`} value={s.ownerId ?? ""} onChange={(e) => change(i, { ownerId: e.target.value || null })}>
                        <option value="">{t.noOwner}</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="check" htmlFor={`${base}-required`}>
                    <input id={`${base}-required`} type="checkbox" checked={s.required} onChange={(e) => change(i, { required: e.target.checked })} />
                    {t.stepRequired}
                  </label>
                </div>
                <div className="row-actions">
                  <button type="button" className="text-button" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    {t.up}
                    <span className="sr-only"> : {s.title[locale]}</span>
                  </button>
                  <button type="button" className="text-button" disabled={i === steps.length - 1} onClick={() => move(i, i + 1)}>
                    {t.down}
                    <span className="sr-only"> : {s.title[locale]}</span>
                  </button>
                  <button type="button" className="text-button" onClick={() => setSteps(steps.filter((_, n) => n !== i))}>
                    {t.removeStep}
                    <span className="sr-only"> : {s.title[locale]}</span>
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="actions">
        <Button
          type="button"
          variant="secondary"
          icon="plus"
          onClick={() => {
            const key = `step-${Date.now().toString(36)}-${++counter}`;
            setSteps([...steps, { uid: key, key: key.slice(0, 40), kind: "task", title: { fr: "", nl: "", en: "" }, body: { fr: "", nl: "", en: "" }, link: "", daysAfter: 7, required: true, ownerId: null }]);
          }}
        >
          {t.addStep}
        </Button>
        <Button type="submit" disabled={busy}>
          {t.save}
        </Button>
        <Button type="button" variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
