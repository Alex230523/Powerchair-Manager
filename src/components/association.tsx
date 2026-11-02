"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/locale";
import type { associationView } from "@/domains/association/service";
import { boardRoles, itemKinds, majorities, memberStatuses, type Rules } from "@/domains/association/schema";
import { associationCopy } from "./association-copy";
import { errors } from "./access-copy";
import { fromLocalInput } from "./trips";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "./ui";

/**
 * 17: « Vie de l'ASBL ». The register of members (a decided status, a dated
 * line per decision, corrections as new lines) and the meetings (general
 * assembly, board): agenda, invitation, answers and proxies, presence and
 * quorum, votes, minutes and signatures. An effective member reads the
 * register, answers and gives a proxy.
 */
type View = Awaited<ReturnType<typeof associationView>>;
type Meeting = View["meetings"][number];
type Send = (body: Record<string, unknown>, done?: string) => Promise<boolean>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const dayText = (l: Locale, d: string | null) => (d ? new Intl.DateTimeFormat(tag(l), { dateStyle: "long", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "…");
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));

function useAssociation(locale: Locale) {
  const t = associationCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [denied, setDenied] = useState(false),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/association?locale=${locale}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (!live) return;
        if (v) setData(v);
        else setDenied(true);
      })
      .catch(() => {
        if (live) setDenied(true);
      });
    return () => {
      live = false;
    };
  }, [locale, version]);
  const send: Send = useCallback(
    async (body, done = t.saved) => {
      if (!data) return false;
      setBusy(true);
      setFailed("");
      setStatus("");
      try {
        const r = await fetch("/api/association", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: data.organization_id, ...body }) });
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        setStatus(done);
        setVersion((n) => n + 1);
        return true;
      } catch (e) {
        const code = (e as Error).message;
        setFailed(t.errors[code] ?? errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [data, locale, t],
  );
  return { data, denied, busy, status, failed, send };
}

export function Association({ locale }: { locale: Locale }) {
  const t = associationCopy[locale];
  const { data, denied, busy, status, failed, send } = useAssociation(locale);
  // The invitation's link (?meeting=) opens the meetings.
  const [tab, setTab] = useState<"register" | "meetings">(useSearchParams().get("meeting") ? "meetings" : "register");
  return (
    <main id="main" className="access association">
      <PageHeader title={t.title} subtitle={t.intro} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {!data ? (
        <p role={denied ? "alert" : "status"}>{denied ? t.denied : t.loading}</p>
      ) : !data.can.read && !data.meetings.length ? (
        <p role="alert">{t.denied}</p>
      ) : (
        <>
          <Tabs label={t.title} items={(["register", "meetings"] as const).map((id) => ({ id, label: t.tabs[id] }))} value={tab} onChange={(v) => setTab(v as "register" | "meetings")} idPrefix="asbl-tab" panelId={(v) => `asbl-panel-${v}`} />
          <div role="tabpanel" id={`asbl-panel-${tab}`} aria-labelledby={`asbl-tab-${tab}`}>
            {tab === "register" ? <RegisterTab locale={locale} data={data} busy={busy} send={send} /> : <MeetingsTab locale={locale} data={data} busy={busy} send={send} />}
          </div>
        </>
      )}
    </main>
  );
}

function RegisterTab({ locale, data, busy, send }: { locale: Locale; data: View; busy: boolean; send: Send }) {
  const t = associationCopy[locale];
  const [event, setEvent] = useState("admission"),
    [person, setPerson] = useState(""),
    [correcting, setCorrecting] = useState<string | null>(null);
  const defaultStatus = event === "admission" ? "effective" : event === "resignation" || event === "exclusion" ? "none" : "effective";
  function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    void send({
      action: "status",
      profileId: person,
      event,
      status: s("status"),
      decisionBody: s("body") || null,
      decisionOn: s("decisionOn") || null,
      boardRole: event === "board_start" ? s("boardRole") : null,
      boardUntil: event === "board_start" ? s("boardUntil") || null : null,
      reason: s("reason"),
    });
  }
  return (
    <>
      <Card title={t.members} headingId="asbl-members" labelledBy="asbl-members" actions={data.can.read && <a className="button secondary" href={`/api/association?pdf=1&locale=${locale}`}>{t.exportPdf}</a>}>
        {data.members.length ? (
          <ul className="plain-list asbl-members">
            {data.members.map((m) => (
              <li key={m.profile_id}>
                <strong>{m.full_name}</strong> <Badge tone={m.status === "effective" ? "success" : "neutral"}>{t.statuses[m.status as keyof typeof t.statuses]}</Badge>
                <span className="muted small">
                  {m.admitted_on && ` · ${fill(t.admitted, { date: dayText(locale, m.admitted_on) })}`}
                  {m.board_role && ` · ${fill(t.mandateUntil, { role: t.roles[m.board_role as keyof typeof t.roles] ?? m.board_role, date: dayText(locale, m.board_until) })}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t.noMember} />
        )}
      </Card>
      {data.can.manage && (
        <Card title={t.record} headingId="asbl-record" labelledBy="asbl-record">
          <p className="muted">{t.recordIntro}</p>
          <form className="form-grid" onSubmit={record}>
            <label htmlFor="asbl-person">
              {t.person}
              <select id="asbl-person" required value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">…</option>
                {data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="asbl-event">
              {t.event}
              <select id="asbl-event" value={event} onChange={(e) => setEvent(e.target.value)}>
                {(["admission", "resignation", "exclusion", "status", "board_start", "board_end"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.events[k]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="asbl-status">
              {t.status}
              <select id="asbl-status" name="status" key={event} defaultValue={defaultStatus}>
                {memberStatuses.map((k) => (
                  <option key={k} value={k}>
                    {t.statuses[k]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="asbl-body">
              {t.body}
              <select id="asbl-body" name="body" defaultValue="assembly">
                <option value="">{t.noBody}</option>
                <option value="assembly">{t.bodies.assembly}</option>
                <option value="board">{t.bodies.board}</option>
              </select>
            </label>
            <label htmlFor="asbl-on">
              {t.decisionOn}
              <input id="asbl-on" name="decisionOn" type="date" />
            </label>
            {event === "board_start" && (
              <>
                <label htmlFor="asbl-role">
                  {t.boardRole}
                  <select id="asbl-role" name="boardRole" defaultValue="director">
                    {boardRoles.map((k) => (
                      <option key={k} value={k}>
                        {t.roles[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="asbl-until">
                  {t.boardUntil}
                  <input id="asbl-until" name="boardUntil" type="date" />
                </label>
              </>
            )}
            <label htmlFor="asbl-reason">
              {t.reason}
              <input id="asbl-reason" name="reason" maxLength={1000} />
            </label>
            <div className="actions">
              <Button type="submit" disabled={busy || !person}>
                {t.save}
              </Button>
            </div>
          </form>
          {data.suggestions.length > 0 && (
            <>
              <h3>{t.suggestions}</h3>
              <p className="muted small">{t.suggestionsIntro}</p>
              <ul className="plain-list">
                {data.suggestions.map((s) => (
                  <li key={s.id} className="asbl-suggestion">
                    <span>
                      {s.full_name} <span className="muted small">({t.why[s.why as "adult" | "parent"]})</span>
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setPerson(s.id);
                        setEvent("admission");
                        document.getElementById("asbl-person")?.focus();
                      }}
                    >
                      {t.prepare}
                      <span className="sr-only"> : {s.full_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
      {data.can.read && (
        <Card title={t.history} headingId="asbl-history" labelledBy="asbl-history">
          <ol className="plain-list asbl-history">
            {data.register.map((l) => (
              <li key={l.id}>
                <span>
                  <strong>{l.full_name}</strong> · {t.events[l.event as keyof typeof t.events]} · {t.statuses[l.status_after as keyof typeof t.statuses]}
                  {l.decision_body && ` · ${t.bodies[l.decision_body as "assembly" | "board"]} ${dayText(locale, l.decision_on)}`}
                  {l.corrects_id && <span className="muted small"> · {t.corrects}</span>}
                  {l.reason && <span className="muted small"> · {l.reason}</span>}
                  <span className="muted small">
                    {" "}
                    · {dayText(locale, String(l.recorded_at))} · {fill(t.recordedBy, { name: l.recorded_by })}
                  </span>
                </span>
                {data.can.manage && (
                  <button type="button" className="text-button" aria-expanded={correcting === l.id} onClick={() => setCorrecting(correcting === l.id ? null : l.id)}>
                    {t.correct}
                    <span className="sr-only"> : {l.full_name}</span>
                  </button>
                )}
                {correcting === l.id && (
                  <form
                    className="form-grid"
                    aria-label={fill(t.correctOf, { name: l.full_name })}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void send({ action: "correct", lineId: l.id, status: f.get("status"), reason: f.get("reason") }).then((ok) => ok && setCorrecting(null));
                    }}
                  >
                    <label htmlFor={`${l.id}-status`}>
                      {t.status}
                      <select id={`${l.id}-status`} name="status" defaultValue={l.status_after}>
                        {memberStatuses.map((k) => (
                          <option key={k} value={k}>
                            {t.statuses[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor={`${l.id}-reason`}>
                      {t.correctReason}
                      <input id={`${l.id}-reason`} name="reason" required minLength={3} maxLength={1000} />
                    </label>
                    <div className="actions">
                      <Button type="submit" disabled={busy}>
                        {t.correctSave}
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}

function MeetingsTab({ locale, data, busy, send }: { locale: Locale; data: View; busy: boolean; send: Send }) {
  const t = associationCopy[locale];
  const [kind, setKind] = useState<"assembly" | "board">("assembly");
  function plan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({
      action: "plan",
      kind,
      title: f.get("title"),
      startsAt: fromLocalInput(String(f.get("startsAt") ?? "")),
      place: f.get("place") ?? "",
      fiscalYearStart: kind === "assembly" ? data.year.from : null,
      locale,
    });
  }
  return (
    <>
      {data.can.manage && (
        <Card title={t.plan} headingId="asbl-plan" labelledBy="asbl-plan">
          <p className={data.year.planned ? "muted" : "notice"}>
            {fill(t.deadline, { year: data.year.label, date: dayText(locale, data.year.deadline) })} {data.year.planned && t.deadlinePlanned}
          </p>
          <form className="form-grid" onSubmit={plan}>
            <label htmlFor="asbl-kind">
              {t.kind}
              <select id="asbl-kind" value={kind} onChange={(e) => setKind(e.target.value as "assembly" | "board")}>
                <option value="assembly">{t.kinds.assembly}</option>
                <option value="board">{t.kinds.board}</option>
              </select>
            </label>
            <label htmlFor="asbl-title">
              {t.meetingTitle}
              <input id="asbl-title" name="title" key={kind} required minLength={2} maxLength={160} defaultValue={kind === "assembly" ? `${t.kinds.assembly} ${data.year.label}` : t.kinds.board} />
            </label>
            <label htmlFor="asbl-when">
              {t.when}
              <input id="asbl-when" name="startsAt" type="datetime-local" required />
            </label>
            <label htmlFor="asbl-place">
              {t.place}
              <input id="asbl-place" name="place" maxLength={300} />
            </label>
            <div className="actions">
              <Button type="submit" disabled={busy}>
                {t.planSave}
              </Button>
            </div>
          </form>
        </Card>
      )}
      {data.meetings.map((m) => (
        <MeetingCard key={m.id} locale={locale} m={m} data={data} busy={busy} send={send} />
      ))}
    </>
  );
}

function MeetingCard({ locale, m, data, busy, send }: { locale: Locale; m: Meeting; data: View; busy: boolean; send: Send }) {
  const t = associationCopy[locale];
  const manage = data.can.manage;
  const open = m.status === "planned";
  const name = (id: string | null) => m.attendees.find((a) => a.profile_id === id)?.full_name ?? data.people.find((p) => p.id === id)?.full_name ?? "";
  const base = `meeting-${m.id}`;
  return (
    <Card title={m.title} headingId={`${base}-title`} labelledBy={`${base}-title`} className="asbl-meeting">
      <p className="trip-meta">
        <Badge tone={m.status === "closed" ? "success" : m.status === "cancelled" ? "neutral" : "info"}>{t.meetingStatuses[m.status as keyof typeof t.meetingStatuses]}</Badge>
        <span>{t.kinds[m.kind as "assembly" | "board"]}</span>
        <span>{when(locale, String(m.starts_at))}</span>
        {m.place && <span>{m.place}</span>}
      </p>
      {manage && m.steps && open && <p className="small muted">{fill(t.stepsText, { prepare: dayText(locale, m.steps.prepare), agenda: dayText(locale, m.steps.agenda), invite: dayText(locale, m.steps.invite), reminder: dayText(locale, m.steps.reminder) })}</p>}
      {open && (
        <p className="small">
          {m.invite_sent_at ? fill(t.inviteSent, { date: dayText(locale, String(m.invite_sent_at)) }) : fill(t.inviteNotSent, { days: data.rules.noticeDays })}{" "}
          {manage && !m.invite_sent_at && (
            <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "sendInvite", meetingId: m.id })}>
              {t.sendInvite}
            </button>
          )}
        </p>
      )}
      {/* An invited member: his answer and his proxy. */}
      {m.mine.map((pid) => {
        const me = m.attendees.find((a) => a.profile_id === pid)!;
        return (
          open && (
            <fieldset key={pid} className="asbl-answer">
              <legend>
                {t.myAnswer} ({me.full_name}) : {t.answers[me.answer as keyof typeof t.answers]}
              </legend>
              <div className="actions">
                <Button type="button" disabled={busy} aria-pressed={me.answer === "present"} onClick={() => void send({ action: "answer", meetingId: m.id, profileId: pid, answer: "present" })}>
                  {t.iAttend}
                </Button>
                <Button type="button" variant="secondary" disabled={busy} aria-pressed={me.answer === "absent"} onClick={() => void send({ action: "answer", meetingId: m.id, profileId: pid, answer: "absent" })}>
                  {t.iCannot}
                </Button>
              </div>
              {m.kind === "assembly" && data.rules.maxProxies > 0 && (
                <label htmlFor={`${base}-proxy-${pid}`}>
                  {t.giveProxy}
                  <select id={`${base}-proxy-${pid}`} value={me.holder_id ?? ""} disabled={busy} onChange={(e) => void send({ action: "proxy", meetingId: m.id, giverId: pid, holderId: e.target.value || null })}>
                    <option value="">{t.noProxy}</option>
                    {m.attendees
                      .filter((a) => a.profile_id !== pid)
                      .map((a) => (
                        <option key={a.profile_id} value={a.profile_id}>
                          {a.full_name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </fieldset>
          )
        );
      })}
      {manage && (
        <>
          <h3>{t.agenda}</h3>
          <ol className="asbl-agenda">
            {m.items.map((it, i) => (
              <AgendaItem key={it.id} locale={locale} it={it} index={i} count={m.items.length} open={open} busy={busy} send={send} />
            ))}
          </ol>
          {open && <AddItem locale={locale} m={m} data={data} busy={busy} send={send} />}
          <h3>{t.attendees}</h3>
          {m.quorum && (
            <p className={m.quorum.reached ? "small" : "notice"}>
              {fill(t.quorum, { present: m.quorum.present, represented: m.quorum.represented, members: m.quorum.members })}{" "}
              {m.quorum.needed ? fill(m.quorum.reached ? t.quorumOk : t.quorumMissing, { needed: m.quorum.needed }) : t.quorumNone}
            </p>
          )}
          <ul className="plain-list asbl-attendees">
            {m.attendees.map((a) => (
              <li key={a.profile_id}>
                <label className="check" htmlFor={`${base}-present-${a.profile_id}`}>
                  <input id={`${base}-present-${a.profile_id}`} type="checkbox" checked={a.present} disabled={busy || !open} onChange={(e) => void send({ action: "presence", meetingId: m.id, profileId: a.profile_id, present: e.target.checked })} />
                  {a.full_name}
                </label>
                <span className="muted small">
                  {t.answers[a.answer as keyof typeof t.answers]}
                  {a.holder_id && ` · ${fill(t.proxyTo, { name: name(a.holder_id) })}`}
                  {a.holds > 0 && ` · ${fill(t.holds, { n: a.holds })}`}
                </span>
              </li>
            ))}
          </ul>
          {open && m.kind === "assembly" && m.quorum && !m.quorum.reached && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void send({ action: "second", meetingId: m.id, startsAt: fromLocalInput(String(new FormData(e.currentTarget).get("when") ?? "")), locale });
              }}
            >
              <label htmlFor={`${base}-second`}>
                {t.secondWhen}
                <input id={`${base}-second`} name="when" type="datetime-local" required />
              </label>
              <div className="actions">
                <Button type="submit" variant="secondary" disabled={busy}>
                  {t.second}
                </Button>
              </div>
            </form>
          )}
          {open && (
            <div className="actions">
              <Button type="button" disabled={busy} onClick={() => void send({ action: "close", meetingId: m.id, locale })}>
                {t.close}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void send({ action: "cancel", meetingId: m.id })}>
                {t.cancel}
              </Button>
            </div>
          )}
          {m.status === "closed" && <Minutes locale={locale} m={m} busy={busy} send={send} />}
        </>
      )}
    </Card>
  );
}

function AgendaItem({ locale, it, index, count, open, busy, send }: { locale: Locale; it: Meeting["items"][number]; index: number; count: number; open: boolean; busy: boolean; send: Send }) {
  const t = associationCopy[locale];
  const base = `item-${it.id}`;
  return (
    <li>
      <p>
        <strong>{it.title}</strong> <span className="muted small">({t.itemKinds[it.kind as keyof typeof t.itemKinds]} · {t.majorities[it.majority as keyof typeof t.majorities]})</span>{" "}
        {it.result && <Badge tone={it.result === "adopted" ? "success" : "danger"}>{t.results[it.result as "adopted" | "rejected"]}</Badge>}
      </p>
      {open && (
        <>
          <form
            className="asbl-vote"
            aria-label={fill(t.votes, { title: it.title })}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({ action: "vote", itemId: it.id, for: Number(f.get("for") || 0), against: Number(f.get("against") || 0), abstain: Number(f.get("abstain") || 0) });
            }}
          >
            {(["for", "against", "abstain"] as const).map((k) => (
              <label key={k} htmlFor={`${base}-${k}`}>
                {t[k]}
                <input id={`${base}-${k}`} name={k} type="number" min={0} max={10000} defaultValue={(k === "for" ? it.votes_for : k === "against" ? it.votes_against : it.votes_abstain) ?? 0} />
              </label>
            ))}
            <Button type="submit" variant="secondary" disabled={busy}>
              {t.saveVote}
            </Button>
          </form>
          <div className="row-actions">
            <button type="button" className="text-button" disabled={busy || index === 0} onClick={() => void send({ action: "moveItem", id: it.id, direction: "up" })}>
              {t.up}
              <span className="sr-only"> : {it.title}</span>
            </button>
            <button type="button" className="text-button" disabled={busy || index === count - 1} onClick={() => void send({ action: "moveItem", id: it.id, direction: "down" })}>
              {t.down}
              <span className="sr-only"> : {it.title}</span>
            </button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "removeItem", id: it.id })}>
              {t.remove}
              <span className="sr-only"> : {it.title}</span>
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function AddItem({ locale, m, data, busy, send }: { locale: Locale; m: Meeting; data: View; busy: boolean; send: Send }) {
  const t = associationCopy[locale];
  const [kind, setKind] = useState<(typeof itemKinds)[number]>("free");
  const base = `add-${m.id}`;
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void send({ action: "item", meetingId: m.id, kind, title: f.get("title"), profileId: f.get("person") || null, boardRole: kind === "mandate" ? f.get("role") || "director" : null }).then((ok) => ok && form.reset());
      }}
    >
      <label htmlFor={`${base}-kind`}>
        {t.itemKind}
        <select id={`${base}-kind`} value={kind} onChange={(e) => setKind(e.target.value as (typeof itemKinds)[number])}>
          {itemKinds.map((k) => (
            <option key={k} value={k}>
              {t.itemKinds[k]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${base}-title`}>
        {t.itemTitle}
        <input id={`${base}-title`} name="title" required minLength={2} maxLength={300} />
      </label>
      {(kind === "admission" || kind === "exit" || kind === "mandate") && (
        <label htmlFor={`${base}-person`}>
          {t.itemPerson}
          <select id={`${base}-person`} name="person" required>
            <option value="">…</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "mandate" && (
        <label htmlFor={`${base}-role`}>
          {t.boardRole}
          <select id={`${base}-role`} name="role" defaultValue="director">
            {boardRoles.map((k) => (
              <option key={k} value={k}>
                {t.roles[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="actions">
        <Button type="submit" variant="secondary" disabled={busy}>
          {t.addItem}
        </Button>
      </div>
    </form>
  );
}

function Minutes({ locale, m, busy, send }: { locale: Locale; m: Meeting; busy: boolean; send: Send }) {
  const t = associationCopy[locale];
  const signed = !!(m.signed_president_at || m.signed_secretary_at);
  const base = `minutes-${m.id}`;
  return (
    <>
      <h3>{t.minutes}</h3>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ action: "minutes", meetingId: m.id, text: new FormData(e.currentTarget).get("text") });
        }}
      >
        <label htmlFor={`${base}-text`}>
          <span className="sr-only">{t.minutes}</span>
          <textarea id={`${base}-text`} name="text" rows={14} maxLength={40000} defaultValue={m.minutes} readOnly={signed} />
        </label>
        {!signed && (
          <div className="actions">
            <Button type="submit" variant="secondary" disabled={busy}>
              {t.saveMinutes}
            </Button>
          </div>
        )}
      </form>
      {(["president", "secretary"] as const).map((role) => {
        const at = role === "president" ? m.signed_president_at : m.signed_secretary_at;
        const who = role === "president" ? m.signed_president_name : m.signed_secretary_name;
        return at ? (
          <p key={role} className="small">
            {t.signAs[role]} : {fill(t.signedBy, { name: who ?? "", date: dayText(locale, String(at)) })}
          </p>
        ) : (
          <form
            key={role}
            className="form-grid"
            aria-label={t.signAs[role]}
            onSubmit={(e) => {
              e.preventDefault();
              void send({ action: "sign", meetingId: m.id, role, name: new FormData(e.currentTarget).get("name") });
            }}
          >
            <label htmlFor={`${base}-${role}`}>
              {t.signAs[role]} · {t.signName}
              <input id={`${base}-${role}`} name="name" required minLength={2} maxLength={120} />
            </label>
            <div className="actions">
              <Button type="submit" disabled={busy}>
                {t.sign}
              </Button>
            </div>
          </form>
        );
      })}
      {m.document_id && <p className="small">{t.filed}</p>}
    </>
  );
}

/** 5: Réglages › Club, the statutes' rules (delays, quorum, majorities, proxies). */
export function AssociationRules({ locale }: { locale: Locale }) {
  const t = associationCopy[locale];
  const { data, busy, status, failed, send } = useAssociation(locale);
  if (!data?.can.manage) return null;
  const r = data.rules;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k) ?? 0);
    const rules: Rules = {
      noticeDays: n("noticeDays"),
      quorumPercent: n("quorumPercent"),
      secondWithoutQuorum: f.has("secondWithoutQuorum"),
      majorities: Object.fromEntries(itemKinds.map((k) => [k, String(f.get(`m-${k}`))])) as Rules["majorities"],
      maxProxies: n("maxProxies"),
      remoteVote: f.has("remoteVote"),
      recordDelayDays: n("recordDelayDays"),
      publicationDays: n("publicationDays"),
      uboDays: n("uboDays"),
    };
    void send({ action: "rules", rules }, t.saved);
  }
  const num = (k: keyof Rules, min: number, max: number) => (
    <label htmlFor={`rules-${k}`}>
      {t[k as "noticeDays"]}
      <input id={`rules-${k}`} name={k} type="number" min={min} max={max} required defaultValue={r[k] as number} />
    </label>
  );
  return (
    <Card title={t.rules} labelledBy="settings-assembly-rules" headingId="settings-assembly-rules">
      <p className="muted">{t.rulesIntro}</p>
      <form className="form-grid" onSubmit={submit}>
        {num("noticeDays", 8, 90)}
        {num("quorumPercent", 0, 100)}
        {num("maxProxies", 0, 10)}
        {num("recordDelayDays", 1, 60)}
        {num("publicationDays", 1, 120)}
        {num("uboDays", 1, 120)}
        <label className="check" htmlFor="rules-second">
          <input id="rules-second" name="secondWithoutQuorum" type="checkbox" defaultChecked={r.secondWithoutQuorum} />
          {t.secondWithoutQuorum}
        </label>
        <label className="check" htmlFor="rules-remote">
          <input id="rules-remote" name="remoteVote" type="checkbox" defaultChecked={r.remoteVote} />
          {t.remoteVote}
        </label>
        {itemKinds.map((k) => (
          <label key={k} htmlFor={`rules-m-${k}`}>
            {fill(t.majorityOf, { kind: t.itemKinds[k] })}
            <select id={`rules-m-${k}`} name={`m-${k}`} defaultValue={r.majorities[k]}>
              {majorities.map((x) => (
                <option key={x} value={x}>
                  {t.majorities[x]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="actions">
          <Button type="submit" disabled={busy}>
            {t.saveRules}
          </Button>
        </div>
      </form>
      <p role="status">{status}</p>
      {failed && <p role="alert">{failed}</p>}
    </Card>
  );
}

