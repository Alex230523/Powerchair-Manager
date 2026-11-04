"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { pollByToken, pollsView } from "@/domains/polls/service";
import { errors } from "./access-copy";
import { pollsCopy, fill } from "./polls-copy";
import { useData } from "./use-api";
import { cssVars } from "./css-vars";
import { Badge, Card, DataTable, EmptyState, Field, PageHeader } from "./ui";

/**
 * H3: mini polls. Each recipient answers in two clicks here or from his
 * personal link; the creator follows live results (bars and numbers in
 * words), closes, then turns the chosen date into the event or the chosen
 * option into a task.
 */
type View = Awaited<ReturnType<typeof pollsView>>;
type Kind = "dates" | "single" | "multiple";
type Value = "yes" | "maybe" | "no";
type Option = { id: string; label: string; starts_at?: string | null; startsAt?: string | null };
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const v = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, code: (v.error as string) ?? "", value: v };
};
const message = (locale: Locale, code: string) => pollsCopy[locale].errors[code] ?? errors[code]?.[locale] ?? pollsCopy[locale].unavailable;

/** The answer form, shared by the page and the personal link. */
function AnswerForm({ locale, id, kind, options, initial, submit }: { locale: Locale; id: string; kind: Kind; options: Option[]; initial: Record<string, Value>; submit: (answers: { optionId: string; value: Value }[]) => Promise<string> }) {
  const t = pollsCopy[locale];
  const [values, setValues] = useState<Record<string, Value>>(initial),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const label = (o: Option) => (o.starts_at ?? o.startsAt ? `${o.label} · ${when(locale, (o.starts_at ?? o.startsAt)!)}` : o.label);
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const answers = options.map((o) => ({ optionId: o.id, value: values[o.id] ?? (kind === "dates" ? ("" as Value) : "no") })).filter((a) => a.value);
    setStatus(await submit(answers));
    setBusy(false);
  }
  return (
    <form onSubmit={send} className="poll-answer">
      {kind === "dates" ? (
        options.map((o) => (
          <fieldset key={o.id}>
            <legend>{label(o)}</legend>
            <div className="poll-choices">
              {(["yes", "maybe", "no"] as const).map((v) => (
                <label className="check" key={v} htmlFor={`${id}-${o.id}-${v}`}>
                  <input id={`${id}-${o.id}-${v}`} type="radio" name={`${id}-${o.id}`} required checked={values[o.id] === v} onChange={() => setValues({ ...values, [o.id]: v })} />
                  {t[v]}
                </label>
              ))}
            </div>
          </fieldset>
        ))
      ) : (
        <fieldset>
          <legend>{kind === "single" ? t.pickOne : t.pickSome}</legend>
          {options.map((o) => (
            <label className="check" key={o.id} htmlFor={`${id}-${o.id}`}>
              <input
                id={`${id}-${o.id}`}
                type={kind === "single" ? "radio" : "checkbox"}
                name={id}
                checked={values[o.id] === "yes"}
                onChange={(e) =>
                  setValues(kind === "single" ? Object.fromEntries(options.map((x) => [x.id, x.id === o.id ? "yes" : "no"])) : { ...values, [o.id]: e.target.checked ? "yes" : "no" })
                }
              />
              {label(o)}
            </label>
          ))}
        </fieldset>
      )}
      <p className="actions">
        <button type="submit" className="button" disabled={busy}>
          {t.send}
        </button>
      </p>
      <p role="status" className="muted">
        {status}
      </p>
    </form>
  );
}

export function PollsPage({ locale }: { locale: Locale }) {
  const t = pollsCopy[locale];
  const search = useSearchParams();
  const [creating, setCreating] = useState(search.get("new") === "1"),
    [notice, setNotice] = useState("");
  const failure = useCallback((code: string) => message(locale, code), [locale]);
  const { data, error, reload } = useData<View>("/api/polls", failure);
  return (
    <main id="main" className="access polls">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          data?.can.create && !creating ? (
            <button type="button" className="button" onClick={() => setCreating(true)}>
              {t.create}
            </button>
          ) : null
        }
      />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      <p role="status" className="muted">
        {notice}
      </p>
      {data && (
        <>
          {creating && data.can.create && (
            <PollForm
              locale={locale}
              data={data}
              eventId={search.get("event")}
              team={search.get("team")}
              done={async (n) => {
                setCreating(false);
                if (n !== null) {
                  setNotice(fill(t.createdOk, { n }));
                  await reload();
                }
              }}
            />
          )}
          <section aria-labelledby="polls-answer">
            <h2 id="polls-answer">{t.toAnswer}</h2>
            {data.toAnswer.length ? (
              <ul className="poll-list">
                {data.toAnswer.map((p) => (
                  <li key={p.recipient_id}>
                    <Card title={p.question} labelledBy={`poll-a-${p.recipient_id}`} headingId={`poll-a-${p.recipient_id}`}>
                      <p className="muted">
                        {fill(t.closes, { date: when(locale, p.closes_at) })}
                        {p.child && <> · {fill(t.forChild, { child: p.child })}</>}
                      </p>
                      {p.detail && <p>{p.detail}</p>}
                      {p.anonymous && <p className="muted">{t.anonymousNote}</p>}
                      {p.answered_at && (
                        <p>
                          <Badge tone="success">{t.answered}</Badge>
                        </p>
                      )}
                      <AnswerForm
                        locale={locale}
                        id={`pa-${p.recipient_id}`}
                        kind={p.kind}
                        options={p.options}
                        initial={Object.fromEntries(p.answers.map((a) => [a.option, a.value as Value]))}
                        submit={async (answers) => {
                          const r = await post("/api/polls", { action: "answer", recipientId: p.recipient_id, answers, organizationId: data.organization_id });
                          if (r.ok) await reload();
                          return r.ok ? t.sent : message(locale, r.code);
                        }}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.nothingToAnswer} />
            )}
          </section>
          {data.can.create && (
            <section aria-labelledby="polls-asked">
              <h2 id="polls-asked">{t.asked}</h2>
              {data.created.length ? (
                <ul className="poll-list">
                  {data.created.map((p) => (
                    <li key={p.id}>
                      <Results locale={locale} poll={p} organizationId={data.organization_id} reload={reload} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title={t.nothingAsked} />
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

type Created = View["created"][number];
function Results({ locale, poll, organizationId, reload }: { locale: Locale; poll: Created; organizationId: string; reload: () => Promise<void> }) {
  const t = pollsCopy[locale];
  const r = poll.results;
  const [choice, setChoice] = useState(r.leading ?? r.options[0]?.id ?? ""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const max = Math.max(1, r.total);
  const labelOf = (id: string) => r.options.find((o) => o.id === id)?.label ?? "";
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const x = await post("/api/polls", { ...body, id: poll.id, organizationId });
    setBusy(false);
    if (!x.ok) return setStatus(message(locale, x.code));
    setStatus(x.value.eventId ? fill(t.eventCreated, { n: x.value.invited }) : x.value.taskId ? t.taskCreated : "");
    await reload();
  }
  return (
    <Card title={poll.question} labelledBy={`poll-r-${poll.id}`} headingId={`poll-r-${poll.id}`}>
      <p className="muted">
        <Badge tone={poll.status === "open" ? "info" : "neutral"}>{poll.status === "open" ? t.open : t.closed}</Badge> {t.kinds[poll.kind]} · {t.audiences[poll.audience]} · {fill(t.closes, { date: when(locale, String(poll.closes_at)) })}
      </p>
      <h3>{t.results}</h3>
      <p>{fill(t.answeredCount, { answered: r.answered, total: r.total })}</p>
      <ul className="poll-bars">
        {r.tally.map((x) => (
          <li key={x.id}>
            <span>
              {fill(poll.kind === "dates" ? t.optionResult : t.optionResultChoice, { label: labelOf(x.id), yes: x.yes, maybe: x.maybe, no: x.no })}
              {r.leading === x.id && x.yes > 0 && (
                <>
                  {" "}
                  <Badge tone="success">{t.leading}</Badge>
                </>
              )}
            </span>
            <span className="poll-bar" style={cssVars({ value: Math.round((x.yes * 100) / max) })} aria-hidden="true" />
          </li>
        ))}
      </ul>
      {poll.anonymous ? (
        <p className="muted">{t.anonymousNote}</p>
      ) : (
        r.people &&
        r.people.length > 0 && (
          <DataTable label={t.who} caption={t.who}>
            <thead>
              <tr>
                <th scope="col">{t.person}</th>
                <th scope="col">{t.answer}</th>
              </tr>
            </thead>
            <tbody>
              {r.people.map((x) => (
                <tr key={x.id}>
                  <td>{x.child ? `${x.name} (${fill(t.forChild, { child: x.child })})` : x.name}</td>
                  <td>
                    {x.answered
                      ? x.answers
                          .filter((a) => poll.kind === "dates" || a.value === "yes")
                          .map((a) => (poll.kind === "dates" ? `${labelOf(a.option)} : ${t[a.value as Value]}` : labelOf(a.option)))
                          .join(", ")
                      : t.noAnswer}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )
      )}
      {poll.status === "open" ? (
        <p className="actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => void act({ action: "close" })}>
            {t.close}
          </button>
        </p>
      ) : poll.outcome_event_id ? (
        <p>
          <Link href={`/${locale}/calendar`}>{t.seeEvent}</Link>
        </p>
      ) : poll.outcome_task_id ? (
        <p>
          <Link href={`/${locale}/tasks`}>{t.seeTask}</Link>
        </p>
      ) : (
        <div className="poll-outcome">
          <Field id={`poll-o-${poll.id}`} label={t.outcomeOption}>
            <select id={`poll-o-${poll.id}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
              {r.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.starts_at ? `${o.label} · ${when(locale, o.starts_at)}` : o.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="actions">
            <button type="button" className="button" disabled={busy || !choice} onClick={() => void act({ action: "outcome", optionId: choice })}>
              {poll.kind === "dates" ? t.outcomeEvent : t.outcomeTask}
            </button>
          </p>
        </div>
      )}
      <p role="status" className="muted">
        {status}
      </p>
    </Card>
  );
}

type Draft = { label: string; at: string };
function PollForm({ locale, data, eventId, team, done }: { locale: Locale; data: View; eventId: string | null; team: string | null; done: (n: number | null) => Promise<void> }) {
  const t = pollsCopy[locale];
  const [kind, setKind] = useState<Kind>("dates"),
    [question, setQuestion] = useState(""),
    [detail, setDetail] = useState(""),
    [anonymous, setAnonymous] = useState(false),
    [audience, setAudience] = useState<string>(team ? "team" : data.audiences[0]),
    [teamId, setTeamId] = useState(team ?? data.teams[0]?.id ?? ""),
    [perChild, setPerChild] = useState(false),
    [closesAt, setClosesAt] = useState(""),
    [options, setOptions] = useState<Draft[]>([
      { label: "", at: "" },
      { label: "", at: "" },
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const forTeam = audience === "team" || audience === "team_parents";
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/polls", {
      action: "create",
      kind,
      question,
      detail,
      anonymous,
      audience,
      teamId: forTeam ? teamId : null,
      perChild: audience === "team_parents" && perChild,
      closesAt: new Date(closesAt).toISOString(),
      options: options.map((o) => ({ label: o.label, startsAt: kind === "dates" && o.at ? new Date(o.at).toISOString() : null })),
      sourceEventId: eventId,
      organizationId: data.organization_id,
    });
    setBusy(false);
    if (!r.ok) return setError(message(locale, r.code));
    await done(r.value.recipients as number);
  }
  const set = (i: number, d: Partial<Draft>) => setOptions(options.map((o, j) => (j === i ? { ...o, ...d } : o)));
  return (
    <form className="poll-form" onSubmit={submit} aria-labelledby="poll-form-title">
      <h2 id="poll-form-title">{t.formTitle}</h2>
      {eventId && <p className="muted">{t.fromEvent}</p>}
      <fieldset>
        <legend>{t.kind}</legend>
        {(["dates", "single", "multiple"] as const).map((k) => (
          <label className="check" key={k} htmlFor={`poll-kind-${k}`}>
            <input id={`poll-kind-${k}`} type="radio" name="poll-kind" checked={kind === k} onChange={() => setKind(k)} />
            {t.kinds[k]}
          </label>
        ))}
      </fieldset>
      <Field id="poll-question" label={t.question} required>
        <input id="poll-question" required minLength={3} maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </Field>
      <Field id="poll-detail" label={t.detail}>
        <textarea id="poll-detail" maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <Field id="poll-audience" label={t.audience} required>
        <select id="poll-audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
          {data.audiences.map((a) => (
            <option key={a} value={a}>
              {t.audiences[a]}
            </option>
          ))}
        </select>
      </Field>
      {forTeam && (
        <Field id="poll-team" label={t.team} required>
          <select id="poll-team" required value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {data.teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {audience === "team_parents" && (
        <div>
          <label className="check" htmlFor="poll-per-child">
            <input id="poll-per-child" type="checkbox" aria-describedby="poll-per-child-help" checked={perChild} onChange={(e) => setPerChild(e.target.checked)} />
            {t.perChild}
          </label>
          <p className="field-help" id="poll-per-child-help">
            {t.perChildHelp}
          </p>
        </div>
      )}
      <label className="check" htmlFor="poll-anonymous">
        <input id="poll-anonymous" type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        {t.anonymous}
      </label>
      <Field id="poll-closes" label={t.closesAt} help={t.closesHelp} required>
        <input id="poll-closes" type="datetime-local" required aria-describedby="poll-closes-help" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
      </Field>
      <fieldset>
        <legend>{t.options}</legend>
        <ol className="poll-options">
          {options.map((o, i) => (
            <li key={i}>
              <Field id={`poll-opt-${i}`} label={fill(t.optionLabel, { n: i + 1 })} required>
                <input id={`poll-opt-${i}`} required maxLength={120} value={o.label} onChange={(e) => set(i, { label: e.target.value })} />
              </Field>
              {kind === "dates" && (
                <Field id={`poll-at-${i}`} label={fill(t.optionDate, { n: i + 1 })} required>
                  <input id={`poll-at-${i}`} type="datetime-local" required value={o.at} onChange={(e) => set(i, { at: e.target.value })} />
                </Field>
              )}
              {options.length > 2 && (
                <button type="button" className="text-button" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  {fill(t.removeOption, { n: i + 1 })}
                </button>
              )}
            </li>
          ))}
        </ol>
        {options.length < 20 && (
          <button type="button" className="button secondary sm" onClick={() => setOptions([...options, { label: "", at: "" }])}>
            {t.addOption}
          </button>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <p className="actions">
        <button type="button" className="button secondary" onClick={() => void done(null)}>
          {t.cancel}
        </button>
        <button type="submit" className="button" disabled={busy}>
          {t.submit}
        </button>
      </p>
    </form>
  );
}

/** The personal link: no account needed, one answer. */
export function PollLink({ locale, token }: { locale: Locale; token: string }) {
  const t = pollsCopy[locale];
  const [data, setData] = useState<Awaited<ReturnType<typeof pollByToken>> | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/polls/answer?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!live) return;
        if (r.ok) setData(v);
        else setError(message(locale, v.error));
      })
      .catch(() => live && setError(t.unavailable));
    return () => {
      live = false;
    };
  }, [token, locale, t]);
  return (
    <main id="main" className="access polls poll-link">
      <PageHeader title={data?.question ?? t.linkTitle} subtitle={data?.detail || undefined} />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      {data &&
        (done ? (
          <p role="status">
            <Badge tone="success">{t.linkDone}</Badge>
          </p>
        ) : !data.open ? (
          <p>{t.linkClosed}</p>
        ) : data.used ? (
          <p>
            {t.linkUsed}{" "}
            <Link href={`/${locale}/access`}>{t.signIn}</Link>
          </p>
        ) : (
          <>
            <p className="muted">
              {fill(t.closes, { date: when(locale, data.closesAt) })}
              {data.child && <> · {fill(t.forChild, { child: data.child })}</>}
            </p>
            <AnswerForm
              locale={locale}
              id="pl"
              kind={data.kind}
              options={data.options}
              initial={{}}
              submit={async (answers) => {
                const r = await post("/api/polls/answer", { token, answers });
                if (r.ok) setDone(true);
                return r.ok ? t.linkDone : message(locale, r.code);
              }}
            />
          </>
        ))}
    </main>
  );
}
