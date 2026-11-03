"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { progressView } from "@/domains/progress/service";
import { delta, goalCategories, goalStatuses, type Figures } from "@/domains/progress/schema";
import { errors } from "./access-copy";
import { progressCopy } from "./progress-copy";
import { Badge, Button, Card } from "./ui";
import { useData } from "./use-api";

export type ProgressView = Awaited<ReturnType<typeof progressView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** 31: loads the follow-up; nothing (no tab) for those who may not see it. */
export function useProgress(locale: Locale, id: string) {
  const t = progressCopy[locale];
  return useData<ProgressView>(`/api/progress?id=${id}`, (code) => t.errors[code] ?? errors[code]?.[locale] ?? t.failed);
}

/** The season's numbers next to last season's, in a table (no ranking, no other player). */
function FiguresTable({ locale, now, before, labels }: { locale: Locale; now: Figures; before: Figures; labels: { now: string; before: string } }) {
  const t = progressCopy[locale];
  const sign = (n: number | null) => (n === null ? "" : n > 0 ? `+${n}` : String(n));
  const rows: { label: string; now: string; before: string; diff: string }[] = [
    { label: t.trainings, now: t.rate(now.trainings.rate), before: t.rate(before.trainings.rate), diff: sign(delta(now.trainings.rate, before.trainings.rate)) },
    { label: t.matches, now: t.rate(now.matches.rate), before: t.rate(before.matches.rate), diff: sign(delta(now.matches.rate, before.matches.rate)) },
    { label: t.played, now: String(now.played), before: String(before.played), diff: sign(delta(now.played, before.played)) },
    { label: t.minutes, now: String(now.minutes), before: String(before.minutes), diff: sign(delta(now.minutes, before.minutes)) },
    { label: t.goals, now: String(now.goals), before: String(before.goals), diff: sign(delta(now.goals, before.goals)) },
    { label: t.assists, now: String(now.assists), before: String(before.assists), diff: sign(delta(now.assists, before.assists)) },
    { label: t.cards, now: t.cardsValue(now.yellow, now.red), before: t.cardsValue(before.yellow, before.red), diff: "" },
  ];
  return (
    <div className="table-wrap">
      <table className="data-table progress-table">
        <caption className="sr-only">{t.tableCaption(labels.now, labels.before)}</caption>
        <thead>
          <tr>
            <th scope="col">{t.measure}</th>
            <th scope="col">{t.season(labels.now)}</th>
            <th scope="col">{t.previous(labels.before)}</th>
            <th scope="col">{t.difference}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.now}</td>
              <td>{r.before}</td>
              <td>{r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The form of an objective: area, title, details (and the period for the coach). */
function GoalForm({ locale, profileId, coach, period, busy, submit }: { locale: Locale; profileId: string; coach: boolean; period: string; busy: boolean; submit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const t = progressCopy[locale];
  return (
    <form
      className="federation-form progress-form"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void submit({
          action: coach ? "goalCreate" : "goalPropose",
          profileId,
          category: f.get("category"),
          title: String(f.get("title") ?? "").trim(),
          detail: String(f.get("detail") ?? ""),
          ...(coach ? { period: String(f.get("period") ?? period).trim() || period } : {}),
        }).then((ok) => ok && form.reset());
      }}
    >
      <div className="form-pair">
        <label>
          {t.category}
          <select name="category" defaultValue="technique">
            {goalCategories.map((c) => (
              <option key={c} value={c}>
                {t.categories[c]}
              </option>
            ))}
          </select>
        </label>
        {coach && (
          <label>
            {t.period}
            <input name="period" defaultValue={period} maxLength={40} required />
          </label>
        )}
      </div>
      <label>
        {t.goalTitle}
        <input name="title" required minLength={2} maxLength={200} />
      </label>
      <label>
        {t.goalDetail}
        <textarea name="detail" rows={2} maxLength={1000} />
      </label>
      <Button type="submit" disabled={busy}>
        {coach ? t.addGoal : t.proposeGoal}
      </Button>
    </form>
  );
}

/** A feedback the family answers: « Vu » and a short reaction. */
function Reaction({ locale, id, busy, seen, submit }: { locale: Locale; id: string; busy: boolean; seen: boolean; submit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const t = progressCopy[locale];
  const [text, setText] = useState("");
  return (
    <div className="progress-reaction">
      {!seen && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void submit({ action: "feedbackSeen", id })}>
          {t.seen}
        </Button>
      )}
      <form
        className="progress-react-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void submit({ action: "feedbackReact", id, reaction: text.trim() }).then((ok) => ok && setText(""));
        }}
      >
        <label>
          {t.react}
          <input value={text} maxLength={280} onChange={(e) => setText(e.target.value)} />
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !text.trim()}>
          {t.reactSend}
        </Button>
      </form>
    </div>
  );
}

/** 31: « Mon suivi » / « Suivi »: numbers, objectives, the coach's feedback, his private notes. */
export function PlayerProgress({ locale, data, reload }: { locale: Locale; data: ProgressView; reload: () => Promise<void> }) {
  const t = progressCopy[locale];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const date = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(d));
  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data.organization_id }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await reload();
      setMessage(t.saved);
      return true;
    } catch (e) {
      const code = (e as Error).message;
      setError(t.errors[code] ?? errors[code]?.[locale] ?? t.failed);
      if (code === "STALE_VERSION") await reload();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const coach = data.can.write;
  const current = data.goals.filter((g) => g.period === data.period);
  const periods = [...new Set(data.goals.map((g) => g.period))];
  return (
    <div className="progress">
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <Card title={t.figures} subtitle={t.compare}>
        <FiguresTable locale={locale} now={data.season.now} before={data.season.before} labels={{ now: data.season.label, before: data.season.previous }} />
        <ul className="progress-streaks">
          <li>
            <strong>{t.trainings}</strong> : {t.attended(data.season.now.trainings.present, data.season.now.trainings.invited)} · {t.streak(data.season.now.trainings.streak)}
          </li>
          <li>
            <strong>{t.matches}</strong> : {t.attended(data.season.now.matches.present, data.season.now.matches.invited)} · {t.streak(data.season.now.matches.streak)}
          </li>
        </ul>
      </Card>

      <Card title={t.goalsTitle} subtitle={t.goalsIntro(data.maxGoals)}>
        {periods.length ? (
          periods.map((period) => (
            <section key={period} aria-label={`${t.period} ${period}`}>
              <h3>{t.season(period)}</h3>
              <ul className="progress-goals">
                {data.goals
                  .filter((g) => g.period === period)
                  .map((g) => (
                    <li key={g.id} className="progress-goal">
                      <span className="exercise-badges">
                        <Badge>{t.categories[g.category as keyof typeof t.categories]}</Badge>
                        {g.state === "proposed" ? (
                          <Badge tone="info">{t.proposed}</Badge>
                        ) : (
                          <Badge tone={g.status === "acquired" ? "success" : g.status === "progressing" ? "primary" : "warning"}>{t.statuses[g.status]}</Badge>
                        )}
                      </span>
                      <strong>{g.title}</strong>
                      {g.detail && <span className="prewrap small">{g.detail}</span>}
                      <span className="muted small">{t.by(g.author, date(g.created_at))}</span>
                      <span className="exercise-actions">
                        {coach && g.state === "active" && (
                          <select aria-label={t.statusOf(g.title)} value={g.status} disabled={busy} onChange={(e) => void submit({ action: "goalStatus", id: g.id, status: e.target.value })}>
                            {goalStatuses.map((st) => (
                              <option key={st} value={st}>
                                {t.statuses[st]}
                              </option>
                            ))}
                          </select>
                        )}
                        {coach && g.state === "proposed" && (
                          <>
                            <Button size="sm" disabled={busy} onClick={() => void submit({ action: "goalDecide", id: g.id, accept: true })}>
                              {t.accept}
                            </Button>
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void submit({ action: "goalDecide", id: g.id, accept: false })}>
                              {t.decline}
                            </Button>
                          </>
                        )}
                        {(coach || (data.can.propose && g.state === "proposed")) && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void submit({ action: "goalDelete", id: g.id })}>
                            {t.removeGoal(g.title)}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="muted">{t.noGoals}</p>
        )}
        {(coach || data.can.propose) && current.length < data.maxGoals && <GoalForm locale={locale} profileId={data.player.id} coach={coach} period={data.period} busy={busy} submit={submit} />}
        {(coach || data.can.propose) && current.length >= data.maxGoals && <p className="muted small">{t.full(data.maxGoals)}</p>}
      </Card>

      <Card title={t.feedbackTitle} subtitle={t.feedbackIntro}>
        {data.feedback.length ? (
          <ul className="progress-feedback">
            {data.feedback.map((f) => (
              <li key={f.id} className="progress-note">
                <p className="prewrap">{f.body}</p>
                <p className="muted small">
                  {t.by(f.author, date(f.created_at))}
                  {f.about && (
                    <>
                      {" · "}
                      {f.about_href ? <Link href={`/${locale}${f.about_href}`}>{f.about}</Link> : f.about}
                    </>
                  )}
                  {" · "}
                  {f.seen_at ? t.seenOn(date(f.seen_at)) : t.unseen}
                </p>
                {f.reaction && <p className="small">{t.reaction(f.reaction)}</p>}
                {data.can.react && <Reaction locale={locale} id={f.id} busy={busy} seen={!!f.seen_at} submit={submit} />}
                {coach && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void submit({ action: "feedbackDelete", id: f.id })}>
                    {t.removeFeedback}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noFeedback}</p>
        )}
        {coach && (
          <form
            className="federation-form progress-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const about = String(f.get("about") ?? "");
              const session = data.sessions.find((x) => x.id === about);
              void submit({
                action: "feedbackCreate",
                profileId: data.player.id,
                body: String(f.get("body") ?? "").trim(),
                eventId: session ? session.id : null,
                matchId: session?.match_id ?? null,
              }).then((ok) => ok && form.reset());
            }}
          >
            <label>
              {t.feedbackBody}
              <textarea name="body" rows={3} required minLength={2} maxLength={1000} />
            </label>
            {data.sessions.length > 0 && (
              <label>
                {t.about}
                <select name="about" defaultValue="">
                  <option value="">{t.aboutNone}</option>
                  {data.sessions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title} · {date(x.starts_at)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="submit" disabled={busy}>
              {t.send}
            </Button>
          </form>
        )}
      </Card>

      {data.notes && (
        <Card title={t.notesTitle} subtitle={t.notesIntro}>
          {data.notes.length ? (
            <ul className="progress-feedback">
              {data.notes.map((n) => (
                <li key={n.id} className="progress-note">
                  <p className="prewrap">{n.body}</p>
                  <p className="muted small">{t.by(n.author, date(n.created_at))}</p>
                  {n.mine && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void submit({ action: "noteDelete", id: n.id })}>
                      {t.removeNote}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noNotes}</p>
          )}
          <form
            className="federation-form progress-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = String(new FormData(form).get("note") ?? "").trim();
              void submit({ action: "noteCreate", profileId: data.player.id, body }).then((ok) => ok && form.reset());
            }}
          >
            <label>
              {t.noteBody}
              <textarea name="note" rows={2} required minLength={2} maxLength={2000} />
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t.addNote}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
