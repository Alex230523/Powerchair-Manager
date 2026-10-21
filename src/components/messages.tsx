"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { messagesCopy } from "./messages-copy";
import { Modal } from "./modal";
import { Button, Panel, Badge, PageHeader } from "./ui";
type Thread = {
  id: string;
  subject: string;
  kind: "direct" | "team" | "parents";
  team_id: string | null;
  team_name: string | null;
  locked_at: string | null;
};
type View = {
  organizationId: string;
  moderator: boolean;
  recipients: { id: string; name: string }[];
  threads: Thread[];
  teamOptions: { id: string; name: string; open: string[] }[];
  thread: Thread | null;
  messages: {
    id: string;
    body: string;
    hidden: boolean;
    sender: string;
    created_at: string;
    mine: boolean;
    reported: boolean;
  }[];
  participants: { name: string; reason: "member" | "guardian" }[];
  reports: {
    id: string;
    message_id: string;
    reason: string;
    comment: string;
    body: string;
    sender: string;
    reporter: string;
    thread_id: string;
    subject: string;
    kind: string;
    team_name: string | null;
  }[];
};
type Copy = (typeof messagesCopy)["fr"];
const titleOf = (t: Copy, v: Pick<Thread, "kind" | "subject" | "team_name">) =>
  v.kind === "direct" ? v.subject : `${v.team_name ?? v.subject} · ${t.kinds[v.kind]}`;

export function Messages({ locale }: { locale: Locale }) {
  const t = messagesCopy[locale] as Copy;
  const [data, setData] = useState<View | null>(null),
    [thread, setThread] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reporting, setReporting] = useState<string | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/messages" + (thread ? "?thread=" + thread : ""), {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t.error);
      });
    return () => c.abort();
  }, [thread, revision, t.error]);
  async function command(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: data?.organizationId, ...body }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      return b as { id: string };
    } catch (e) {
      setError(t.errors[e instanceof Error ? e.message : ""] ?? t.error);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    const b = await command({
      action: thread ? "reply" : "create",
      threadId: thread,
      requestId,
      subject: d.get("subject"),
      recipients: d.getAll("recipients"),
      body: d.get("body"),
    });
    if (!b) return;
    form.reset();
    setRequestId(crypto.randomUUID());
    setThread(b.id);
    setRevision((v) => v + 1);
  }
  function choose(id: string) {
    setThread(id);
    setData(null);
    setNotice("");
    setRequestId(crypto.randomUUID());
  }
  const current = data?.thread ?? null;
  const team = data?.threads.filter((v) => v.kind !== "direct") ?? [];
  const direct = data?.threads.filter((v) => v.kind === "direct") ?? [];
  const locked = !!current?.locked_at;
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const list = (items: Thread[]) => (
    <ul>
      {items.map((v) => (
        <li key={v.id}>
          <Button disabled={busy} aria-pressed={v.id === thread} onClick={() => choose(v.id)}>
            {titleOf(t, v)}
          </Button>
        </li>
      ))}
    </ul>
  );
  return (
    <main id="main" className="access messages-page">
      <PageHeader title={t.title} subtitle={t.intro} />
      <div className="actions">
        <Link href={"/" + locale + "/documents"}>{t.documents}</Link>
        <Link href={"/" + locale + "/access"}>{t.access}</Link>
        <Button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          {t.refresh}
        </Button>
        <Button disabled={busy} onClick={() => choose("")}>
          {t.new}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          {data.moderator && data.reports.length > 0 && (
            <Panel title={t.reports}>
              <ul className="records">
                {data.reports.map((r) => (
                  <li key={r.id}>
                    <p>
                      <strong>{r.sender}</strong> · {titleOf(t, r as unknown as Thread)}
                    </p>
                    <p className="message-body">{r.body}</p>
                    <p className="muted small">
                      {t.reportedBy.replace("{name}", r.reporter).replace("{reason}", t.reasons[r.reason] ?? r.reason)}
                      {r.comment && ` · ${r.comment}`}
                    </p>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void command({ action: "moderate", messageId: r.message_id, outcome: "hidden" }).then(
                            (ok) => ok && setRevision((v) => v + 1),
                          )
                        }
                      >
                        {t.hide}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void command({ action: "moderate", messageId: r.message_id, outcome: "kept" }).then(
                            (ok) => ok && setRevision((v) => v + 1),
                          )
                        }
                      >
                        {t.keep}
                      </button>
                      <button type="button" className="text-button" onClick={() => choose(r.thread_id)}>
                        {t.goTo}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title={t.title}>
            {(team.length > 0 || data.teamOptions.length > 0) && (
              <>
                <h3>{t.teamThreads}</h3>
                {list(team)}
                <div className="row-actions">
                  {data.teamOptions.flatMap((o) =>
                    (["team", "parents"] as const)
                      .filter((k) => !o.open.includes(k))
                      .map((k) => (
                        <button
                          key={o.id + k}
                          type="button"
                          className="chip-button"
                          disabled={busy}
                          onClick={() =>
                            void command({ action: "openTeam", teamId: o.id, kind: k }).then((b) => b && choose(b.id))
                          }
                        >
                          {(k === "team" ? t.openTeam : t.openParents).replace("{team}", o.name)}
                        </button>
                      )),
                  )}
                </div>
                <h3>{t.direct}</h3>
              </>
            )}
            {list(direct)}
            {!data.threads.length && <p>{t.empty}</p>}
          </Panel>
          <Panel title={current ? titleOf(t, current) : t.new}>
            {current && (
              <>
                {current.kind === "direct" ? (
                  <>
                    <p>
                      {t.who}:{" "}
                      {data.participants
                        .map((v) => (v.reason === "guardian" ? `${v.name} (${t.guardianMark})` : v.name))
                        .join(", ")}
                    </p>
                    {data.participants.some((v) => v.reason === "guardian") && (
                      <p className="notice">{t.minorNote}</p>
                    )}
                  </>
                ) : (
                  <p className="notice">{current.kind === "team" ? t.teamNote : t.parentsNote}</p>
                )}
                {locked && <p className="notice">{t.locked}</p>}
                {data.moderator && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void command({ action: "lock", threadId: current.id, locked: !locked }).then(
                          (ok) => ok && setRevision((v) => v + 1),
                        )
                      }
                    >
                      {locked ? t.unlock : t.lock}
                    </button>
                  </div>
                )}
                <ol className="message-list">
                  {data.messages.map((m) => (
                    <li key={m.id}>
                      <strong>{m.sender}</strong>
                      <p>
                        <time dateTime={m.created_at}>{time(m.created_at)}</time>
                        {m.hidden && data.moderator && <Badge tone="warning">{t.hiddenTag}</Badge>}
                      </p>
                      <p className="message-body">{m.hidden && !data.moderator ? <em>{t.hiddenText}</em> : m.body}</p>
                      {!m.mine && !m.hidden && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || m.reported}
                          onClick={() => setReporting(m.id)}
                        >
                          {m.reported ? t.reported : t.report}
                          <span className="sr-only"> : {m.sender}, {time(m.created_at)}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {!(current && locked && !data.moderator) && (
              <form key={thread} onSubmit={submit}>
                {!thread && (
                  <>
                    <label htmlFor="message-subject">{t.subject}</label>
                    <input id="message-subject" name="subject" required minLength={2} maxLength={160} />
                    <label htmlFor="message-recipients">{t.to}</label>
                    <select id="message-recipients" name="recipients" multiple required size={5}>
                      {data.recipients.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {!data.recipients.length && <p>{t.none}</p>}
                  </>
                )}
                <label htmlFor="message-body">{t.body}</label>
                <textarea id="message-body" name="body" required maxLength={5000} rows={5} />
                <Button disabled={busy || (!thread && !data.recipients.length)}>{thread ? t.reply : t.send}</Button>
              </form>
            )}
          </Panel>
        </>
      )}
      {reporting && (
        <Modal title={t.reportTitle} close={() => setReporting(null)}>
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command({
                action: "report",
                messageId: reporting,
                reason: String(f.get("reason")),
                comment: String(f.get("comment") ?? ""),
              }).then((b) => {
                if (!b) return;
                setReporting(null);
                setNotice(t.reportDone);
                setRevision((v) => v + 1);
              });
            }}
          >
            <label htmlFor="report-reason">{t.reason}</label>
            <select id="report-reason" name="reason" required defaultValue="inappropriate">
              {Object.keys(t.reasons).map((r) => (
                <option key={r} value={r}>
                  {t.reasons[r]}
                </option>
              ))}
            </select>
            <label htmlFor="report-comment">{t.comment}</label>
            <textarea id="report-comment" name="comment" maxLength={1000} rows={3} />
            <div className="actions">
              <button className="button" disabled={busy}>
                {t.reportSend}
              </button>
              <button type="button" className="button secondary" onClick={() => setReporting(null)}>
                {t.cancel}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
