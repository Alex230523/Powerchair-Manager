"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { PlanChoices, seasonPlanView } from "@/domains/seasons/plan";
import { planSteps, type PlanStep } from "@/domains/seasons/plan-steps";
import { seasonPlanCopy } from "./season-plan-copy";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";

/**
 * 16: « Préparer la saison suivante ». The nine steps in order, each with
 * its state; the choices are saved step by step (the assistant can be left
 * and resumed), « Lancer » at the end, the scheduled sendings cancellable.
 */
type View = Awaited<ReturnType<typeof seasonPlanView>>;
type Ready = Extract<View, { material: unknown }>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

async function post(body: unknown) {
  const r = await fetch("/api/seasons/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v;
}

export function SeasonPlan({ locale }: { locale: Locale }) {
  const t = seasonPlanCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [failure, setFailure] = useState(""),
    [version, setVersion] = useState(0),
    [open, setOpen] = useState<PlanStep | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/seasons/plan", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        return v as View;
      })
      .then((v) => {
        if (live) {
          setData(v);
          setFailure("");
        }
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
      <main id="main" className="access season-plan">
        {header}
        {failure ? <p role="alert">{failure === "FORBIDDEN" || failure === "MFA_REQUIRED" ? t.forbidden : t.error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  if (!data.from || !data.plan || !("material" in data))
    return (
      <main id="main" className="access season-plan">
        {header}
        <EmptyState title={t.noSeason} />
      </main>
    );
  const d = data as Ready;
  const m = d.material;
  const ch = d.plan.choices as Required<PlanChoices>;
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso.slice(0, 10) + "T12:00:00Z"));
  const money = (cents: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
  const settled = planSteps.filter((s) => d.plan.steps[s] !== "todo").length;

  async function run(body: Record<string, unknown>, done: (v: Record<string, number>) => string) {
    setBusy(true);
    setError("");
    try {
      const v = await post(body);
      setStatus(done(v));
      setVersion((x) => x + 1);
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(t.errors[code] ?? t.error);
      setVersion((x) => x + 1);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const save = (step: PlanStep, extra: { state?: "todo" | "done" | "skipped"; choices?: PlanChoices }) => run({ action: "save", expectedVersion: d.plan.version, step, ...extra }, () => t.saved);
  const submit = (step: PlanStep, read: (f: FormData) => PlanChoices) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void save(step, { choices: read(new FormData(e.currentTarget)), state: "done" });
  };
  const controls = (step: PlanStep) => (
    <p className="actions">
      {d.plan.steps[step] === "skipped" ? (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void save(step, { state: "todo" })}>
          {t.reopen}
        </Button>
      ) : (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(step, { state: "skipped" })}>
          {t.skip}
        </Button>
      )}
    </p>
  );
  const body: Record<PlanStep, ReactNode> = {
    review: (
      <>
        <dl className="season-plan-review">
          {(
            [
              ["players", String(m.review.players)],
              ["teams", String(m.review.teams)],
              ["events", String(m.review.events)],
              ["duesOpen", `${money(m.review.duesOpenCents)} (${m.review.duesOpenCount})`],
              ["expiredDocuments", String(m.review.expiredDocuments)],
              ["chairsToService", String(m.review.chairsToService)],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt>{t.review[k]}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p>
          <Link href={`/${locale}/statistics/report`}>{t.reportLink}</Link>
        </p>
        <p className="actions">
          <Button disabled={busy} onClick={() => void save("review", { state: "done" })}>
            {t.markDone}
          </Button>
        </p>
      </>
    ),
    season: (
      <form
        className="form-grid"
        onSubmit={submit("season", (f) => ({
          season: { name: String(f.get("name")), startsOn: String(f.get("startsOn")), endsOn: String(f.get("endsOn")), teams: f.getAll("team").map(String) },
        }))}
      >
        <label className="wide">
          {t.name}
          <input name="name" required minLength={2} maxLength={80} defaultValue={ch.season.name} />
        </label>
        <label>
          {t.startsOn}
          <input name="startsOn" type="date" required defaultValue={ch.season.startsOn} />
        </label>
        <label>
          {t.endsOn}
          <input name="endsOn" type="date" required defaultValue={ch.season.endsOn} />
        </label>
        <fieldset className="wide">
          <legend>{t.steps.season.title}</legend>
          {m.teams.map((team) => (
            <label key={team.id} className="check">
              <input type="checkbox" name="team" value={team.id} defaultChecked={ch.season.teams.includes(team.id)} />
              {fill(t.copyTeam, { team: team.name })}
            </label>
          ))}
        </fieldset>
        <p className="actions wide">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ),
    players: (
      <form
        onSubmit={submit("players", (f) => ({
          players: { teams: m.teams.map((team) => ({ teamId: team.id, profiles: f.getAll(`p-${team.id}`).map(String) })) },
        }))}
      >
        {m.teams
          .filter((team) => ch.season.teams.includes(team.id))
          .map((team) => (
            <fieldset key={team.id} className="season-plan-team">
              <legend>{team.name}</legend>
              {team.members.map((x) => (
                <label key={x.id + x.role} className="check">
                  <input type="checkbox" name={`p-${team.id}`} value={x.id} defaultChecked={(ch.players.teams.find((y) => y.teamId === team.id)?.profiles ?? []).includes(x.id)} />
                  {x.name}
                  {x.leaving && <span className="muted small"> ({t.leaving})</span>}
                </label>
              ))}
            </fieldset>
          ))}
        {m.former > 0 && (
          <p className="muted">
            {fill(t.former, { n: m.former })} <Link href={`/${locale}/players/former`}>{t.formerLink}</Link>
          </p>
        )}
        <p className="actions">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ),
    dues: m.plans.length ? (
      <form
        className="form-grid"
        onSubmit={submit("dues", (f) => ({
          dues: {
            copyPlans: f.get("copyPlans") === "on",
            amounts: Object.fromEntries(m.plans.map((p) => [p.id, Math.round(Number(String(f.get(`a-${p.id}`) ?? "0").replace(",", ".")) * 100)])),
            issueOn: String(f.get("issueOn") ?? "") || null,
          },
        }))}
      >
        <label className="check wide">
          <input type="checkbox" name="copyPlans" defaultChecked={ch.dues.copyPlans} />
          {t.copyPlans}
        </label>
        {m.plans.map((p) => (
          <label key={p.id}>
            {fill(t.amountOf, { category: p.category })}
            <input name={`a-${p.id}`} inputMode="decimal" required defaultValue={String((ch.dues.amounts[p.id] ?? p.amount_cents) / 100)} />
          </label>
        ))}
        <label className="wide">
          {t.issueOn}
          <input name="issueOn" type="date" defaultValue={ch.dues.issueOn ?? ""} aria-describedby="plan-issue-hint" />
        </label>
        <p className="muted small wide" id="plan-issue-hint">
          {t.issueHint}
        </p>
        <p className="actions wide">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ) : (
      <>
        <p className="muted">{t.noPlan}</p>
        <p className="actions">
          <Button disabled={busy} onClick={() => void save("dues", { state: "done" })}>
            {t.markDone}
          </Button>
        </p>
      </>
    ),
    affiliations: (
      <form onSubmit={submit("affiliations", (f) => ({ affiliations: { fees: f.getAll("fee").map(String) } }))}>
        {m.fees.length ? (
          <fieldset>
            <legend>{t.steps.affiliations.title}</legend>
            {m.fees.map((x) => (
              <label key={x.id} className="check">
                <input type="checkbox" name="fee" value={x.id} defaultChecked={ch.affiliations.fees.includes(x.id)} />
                {fill(t.feeLine, { name: x.name, period: x.period, amount: money(x.amountCents), date: day(x.dueOn) })}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="muted">{t.noFee}</p>
        )}
        <p className="actions">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ),
    reminders: (
      <form onSubmit={submit("reminders", (f) => ({ reminders: { items: f.getAll("item").map(String) } }))}>
        {m.reminders.length ? (
          <fieldset>
            <legend>{t.steps.reminders.title}</legend>
            {m.reminders.map((x) => (
              <label key={x.key} className="check">
                <input type="checkbox" name="item" value={x.key} defaultChecked={ch.reminders.items.includes(x.key)} />
                {t.reminderKinds[x.kind]} : {x.name} <span className="muted small">({fill(t.dueOn, { date: day(x.dueOn) })})</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="muted">{t.noReminder}</p>
        )}
        <p className="actions">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ),
    check: (
      <form className="form-grid" onSubmit={submit("check", (f) => ({ check: { launchOn: String(f.get("launchOn") ?? "") || null } }))}>
        <label className="wide">
          {t.launchOn}
          <input name="launchOn" type="date" defaultValue={ch.check.launchOn ?? ""} aria-describedby="plan-check-hint" />
        </label>
        <p className="muted small wide" id="plan-check-hint">
          {t.launchHint}
        </p>
        <p className="actions wide">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ),
    communication: (
      <form
        className="form-grid"
        onSubmit={submit("communication", (f) => ({
          communication: { subject: String(f.get("subject")), text: String(f.get("text")), sendOn: String(f.get("sendOn") ?? "") || null },
        }))}
      >
        <label className="wide">
          {t.subject}
          <input name="subject" required minLength={2} maxLength={160} defaultValue={ch.communication.subject} />
        </label>
        <label className="wide">
          {t.text}
          <textarea name="text" required rows={7} maxLength={5000} defaultValue={ch.communication.text} />
        </label>
        <label className="wide">
          {t.sendOn}
          <input name="sendOn" type="date" defaultValue={ch.communication.sendOn ?? ""} aria-describedby="plan-send-hint" />
        </label>
        <p className="muted small wide" id="plan-send-hint">
          {t.sendHint}
        </p>
        <p className="actions wide">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
    ),
    summary: (
      <>
        <p>{t.summaryIntro}</p>
        {d.summary.length ? (
          <ul className="records">
            {d.summary.map((x, i) => {
              const label =
                x.what === "season"
                  ? fill(t.summaryItems.season, { name: ch.season.name, n: x.count ?? 0 })
                  : x.what === "players"
                    ? fill(t.summaryItems.players, { n: x.count ?? 0 })
                    : x.what === "plans"
                      ? fill(t.summaryItems.plans, { n: x.count ?? 0 })
                      : x.what === "issue"
                        ? t.summaryItems.issue
                        : x.what === "check"
                          ? t.summaryItems.check
                          : x.what;
              return (
                <li key={i}>
                  <strong>{t.steps[x.step].title}</strong> · {label}
                  {x.on && <span className="muted"> {fill(t.summaryOn, { date: day(x.on) })}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{t.nothing}</p>
        )}
        {d.plan.launchedAt && (
          <p className="muted">
            {fill(t.launchedOn, { date: day(String(d.plan.launchedAt)) })} {t.relaunchHint}
          </p>
        )}
        <p className="actions">
          <Button disabled={busy || !d.plan.version || !d.summary.length} onClick={() => void run({ action: "launch", expectedVersion: d.plan.version }, (v) => fill(t.launched, { tasks: v.tasks ?? 0, actions: v.actions ?? 0 }))}>
            {t.launch}
          </Button>
        </p>
      </>
    ),
  };

  return (
    <main id="main" className="access season-plan">
      {header}
      <p>
        {fill(t.ending, { name: d.from.name, date: day(d.from.ends_on) })} · {d.daysLeft !== null && d.daysLeft >= 0 ? fill(t.daysLeft, { n: d.daysLeft }) : ""}
      </p>
      <p className="muted">{fill(t.progress, { done: settled, total: planSteps.length })}</p>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <ol className="season-plan-steps">
        {planSteps.map((step, i) => {
          const state = d.plan.steps[step];
          const shown = open === step;
          return (
            <li key={step} className="season-plan-step" data-state={state}>
              <h2 className="season-plan-step-title">
                <button type="button" className="season-plan-toggle" aria-expanded={shown} aria-controls={`plan-${step}`} onClick={() => setOpen(shown ? null : step)}>
                  <span className="season-plan-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{t.steps[step].title}</span>
                  <Badge tone={state === "done" ? "success" : state === "skipped" ? "neutral" : "warning"}>{t.states[state]}</Badge>
                </button>
              </h2>
              {shown && (
                <div id={`plan-${step}`} className="season-plan-body">
                  <p className="muted">{t.steps[step].text}</p>
                  {state === "skipped" ? null : body[step]}
                  {step !== "summary" && controls(step)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {d.plan.actions.length > 0 && (
        <Card title={t.scheduled}>
          <ul className="records">
            {d.plan.actions.map((a) => (
              <li key={a.id}>
                <strong>{t.actionKinds[a.kind as keyof typeof t.actionKinds]}</strong> · {day(a.run_on)} ·{" "}
                <Badge tone={a.status === "done" ? "success" : a.status === "failed" ? "danger" : a.status === "cancelled" ? "neutral" : "info"}>{t.actionStates[a.status as keyof typeof t.actionStates]}</Badge>
                {a.status === "scheduled" && (
                  <>
                    {" "}
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run({ action: "cancel", actionId: a.id }, () => t.cancelled)}>
                      {t.cancel}
                      <span className="sr-only"> : {t.actionKinds[a.kind as keyof typeof t.actionKinds]}</span>
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

/** The card on the president's home, from 45 days before the end of the season until « Lancer ». */
export function SeasonPlanCard({ locale }: { locale: Locale }) {
  const t = seasonPlanCopy[locale];
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/seasons/plan", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live && v?.show && v.daysLeft !== null) setDays(v.daysLeft);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (days === null) return null;
  return (
    <Card title={fill(t.cardTitle, { n: Math.max(0, days) })} className="season-plan-card">
      <p>{t.cardText}</p>
      <p>
        <Link className="button" href={`/${locale}/club/season-plan`}>
          {t.cardLink}
        </Link>
      </p>
    </Card>
  );
}
