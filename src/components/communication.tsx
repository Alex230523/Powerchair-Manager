"use client";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { communicationView } from "@/domains/communication/service";
import {
  audiences,
  blockTypes,
  renderNewsletter,
  type Block,
} from "@/domains/communication/schema";
import { localAt, shiftLocal, toInstant } from "@/domains/calendar/time";
import { communicationCopy } from "./communication-copy";
import { errors } from "./access-copy";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";
import { Badge, EmptyState, PageHeader, Tabs } from "./ui";

type View = Awaited<ReturnType<typeof communicationView>>;
type Tab = "events" | "newsletter" | "groups" | "alumni" | "sender";
type Copy = (typeof communicationCopy)["fr"];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) =>
  Object.entries(v).reduce((t, [k, x]) => t.replaceAll(`{${k}}`, String(x)), s);

export function Communication({
  locale,
  eventId,
}: {
  locale: Locale;
  eventId?: string;
}) {
  const t = communicationCopy[locale] as Copy;
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [locale, t],
  );
  const { data, error, setError, denied, reload } = useData<View>(
    "/api/communication",
    failure,
  );
  const { busy, message, post } = usePost(
    "/api/communication",
    reload,
    setError,
    failure,
  );
  const [chosen, setChosen] = useState<Tab | null>(null);
  if (!data)
    return (
      <main id="main" className="access communication">
        <PageHeader title={t.title} />
        {denied ? (
          <p className="notice">{t.denied}</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">{t.loading}</p>
        )}
      </main>
    );
  const tabs: Tab[] = [
    ...(data.can.plan ? (["events"] as const) : []),
    ...(data.can.manage
      ? (["newsletter", "groups", "alumni", "sender"] as const)
      : []),
  ];
  const tab =
    chosen && tabs.includes(chosen)
      ? chosen
      : eventId && data.can.plan
        ? "events"
        : tabs[data.can.manage ? Math.min(1, tabs.length - 1) : 0];
  const send = (body: Record<string, unknown>, done = t.saved) =>
    post({ organizationId: data.organization_id, ...body }, done);
  return (
    <main id="main" className="access communication">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Tabs label={t.title} items={tabs.map((key) => ({ id: key, label: t.tabs[key] }))} value={tab} onChange={(id) => setChosen(id as typeof tab)} idPrefix="com-tab" panelId={(id) => `com-panel-${id}`} />
      <section
        role="tabpanel"
        id={`com-panel-${tab}`}
        aria-labelledby={`com-tab-${tab}`}
        className="tab-panel"
      >
        {tab === "events" && (
          <EventMails data={data} t={t} locale={locale} busy={busy} send={send} eventId={eventId} />
        )}
        {tab === "newsletter" && (
          <Newsletters data={data} t={t} locale={locale} busy={busy} send={send} />
        )}
        {tab === "groups" && <Groups data={data} t={t} busy={busy} send={send} />}
        {tab === "alumni" && <Alumni data={data} t={t} locale={locale} busy={busy} send={send} />}
        {tab === "sender" && data.sender && (
          <form
            className="panel"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({
                action: "sender",
                senderName: String(f.get("senderName") ?? "").trim(),
                replyTo: String(f.get("replyTo") ?? "").trim(),
              });
            }}
          >
            <p className="muted">{t.senderIntro}</p>
            <div className="form-grid">
              <label>
                {t.senderName}
                <input
                  name="senderName"
                  maxLength={80}
                  defaultValue={data.sender.mail_sender_name}
                  placeholder={data.sender.name}
                />
              </label>
              <label>
                {t.replyTo}
                <input
                  name="replyTo"
                  type="email"
                  maxLength={254}
                  defaultValue={data.sender.mail_reply_to}
                  placeholder={data.sender.contact_email}
                  aria-describedby="reply-hint"
                />
              </label>
            </div>
            <p id="reply-hint" className="muted small">
              {fill(t.replyHint, { email: data.sender.contact_email || "…" })}
            </p>
            <button className="button" disabled={busy}>
              {t.save}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

type Props = {
  data: View;
  t: Copy;
  locale: Locale;
  busy: boolean;
  send: (body: Record<string, unknown>, done?: string) => Promise<boolean>;
};

function EventMails({ data, t, locale, busy, send, eventId }: Props & { eventId?: string }) {
  const preset = eventId && data.plannable.some((e) => e.id === eventId) ? eventId : null;
  const [editing, setEditing] = useState<string | null>(preset ? "new" : null);
  const [event, setEvent] = useState<string>(preset ?? data.plannable[0]?.id ?? "");
  const when = (local: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
      new Date(local.slice(0, 16) + ":00Z"),
    );
  const at = (iso: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(
      new Date(iso),
    );
  /** Two days before the event at 18:00, or in one hour when that is already past. */
  const defaultSendAt = (local: string) => {
    const proposal = shiftLocal(local.slice(0, 10) + "T18:00", -2);
    const soon = localAt(new Date().getTime() + 3600000, "Europe/Brussels").slice(0, 16);
    return proposal > soon ? proposal : soon;
  };
  const groups = data.groups.filter((g) => !g.archived);
  function form(mail?: View["eventMails"][number]) {
    const current = data.plannable.find((e) => e.id === (mail?.event_id ?? event));
    return (
      <form
        className="panel"
        aria-label={t.newEventMail}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          let sendAt: string;
          try {
            sendAt = toInstant(String(f.get("sendAt")), "Europe/Brussels", "earlier").toISOString();
          } catch {
            sendAt = "";
          }
          void send({
            action: "eventMail",
            ...(mail ? { id: mail.id, expectedVersion: mail.version } : {}),
            eventId: String(f.get("event")),
            groupId: String(f.get("group") ?? "") || null,
            subject: String(f.get("subject") ?? ""),
            body: String(f.get("body") ?? ""),
            sendAt,
          }).then((ok) => ok && setEditing(null));
        }}
      >
        <div className="form-grid">
          <label>
            {t.event}
            <select
              name="event"
              required
              disabled={!!mail}
              value={mail?.event_id ?? event}
              onChange={(e) => setEvent(e.target.value)}
            >
              {mail && !current && <option value={mail.event_id}>{mail.event.title}</option>}
              {data.plannable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {when(e.local_start)}
                  {e.team ? ` · ${e.team}` : ""}
                </option>
              ))}
            </select>
            {mail && <input type="hidden" name="event" value={mail.event_id} />}
          </label>
          <label>
            {t.recipients}
            <select name="group" defaultValue={mail?.group_id ?? ""}>
              <option value="">{fill(t.participants, { n: current?.audience ?? 0 })}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.sendAt}
            <input
              name="sendAt"
              type="datetime-local"
              required
              key={(mail?.id ?? "") + (current?.id ?? "")}
              defaultValue={
                mail
                  ? localAt(mail.send_at, "Europe/Brussels").slice(0, 16)
                  : current
                    ? defaultSendAt(current.local_start)
                    : ""
              }
            />
          </label>
        </div>
        <label>
          {t.subject}
          <input name="subject" required minLength={2} maxLength={160} defaultValue={mail?.subject ?? t.defaultSubject} />
        </label>
        <label>
          {t.body}
          <textarea
            name="body"
            rows={7}
            required
            maxLength={5000}
            defaultValue={mail?.body ?? t.defaultBody}
            aria-describedby="placeholders-hint"
          />
        </label>
        <p id="placeholders-hint" className="muted small">
          {t.placeholders}
        </p>
        <div className="actions">
          <button className="button" disabled={busy || !data.plannable.length}>
            {t.save}
          </button>
          <button type="button" className="button secondary" onClick={() => setEditing(null)}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }
  return (
    <>
      <div className="panel-head">
        <p className="muted">{t.eventsIntro}</p>
        {editing !== "new" && (
          <button type="button" className="button" onClick={() => setEditing("new")} disabled={!data.plannable.length}>
            {t.newEventMail}
          </button>
        )}
      </div>
      {!data.plannable.length && <p className="muted">{t.noPlannable}</p>}
      {editing === "new" && form()}
      {!data.eventMails.length && <EmptyState title={t.noEventMail} />}
      <ul className="records com-list">
        {data.eventMails.map((m) => (
          <li key={m.id}>
            {editing === m.id ? (
              form(m)
            ) : (
              <>
                <div className="panel-head">
                  <h3>
                    {m.subject}
                    <span className="muted"> · {m.event.title}</span>
                  </h3>
                  <Badge tone={
                      m.state === "review" ? "warning" : m.state === "sent" ? "success" : m.state === "scheduled" ? undefined : "danger"
                    }>
                    {t.states[m.state]}
                  </Badge>
                </div>
                <p className="muted small">
                  {m.state === "sent" && m.sent_at
                    ? `${fill(t.sentTo, { n: m.recipients })} · ${at(m.sent_at)}`
                    : fill(t.plannedFor, { d: at(m.send_at) })}{" "}
                  · {fill(t.by, { name: m.author })}
                </p>
                {m.state === "review" && (
                  <div className="notice" role="note">
                    {m.prepared.local_start !== m.event.local_start && (
                      <p>
                        {fill(t.changed, {
                          before: when(m.prepared.local_start),
                          after: when(m.event.local_start),
                        })}
                      </p>
                    )}
                    {m.prepared.place !== m.event.place && (
                      <p>{fill(t.placeChanged, { before: m.prepared.place || "…", after: m.event.place || "…" })}</p>
                    )}
                  </div>
                )}
                {(m.state === "scheduled" || m.state === "review") && (
                  <div className="row-actions">
                    {m.state === "review" && (
                      <button type="button" className="button" disabled={busy} onClick={() => void send({ action: "reviewEventMail", id: m.id })}>
                        {t.review}
                      </button>
                    )}
                    <button type="button" className="text-button" onClick={() => setEditing(m.id)}>
                      {t.edit}
                      <span className="sr-only"> : {m.subject}</span>
                    </button>
                    {m.state === "scheduled" && (
                      <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "sendEventMail", id: m.id })}>
                        {t.sendNow}
                        <span className="sr-only"> : {m.subject}</span>
                      </button>
                    )}
                    <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "cancelEventMail", id: m.id })}>
                      {t.cancelMail}
                      <span className="sr-only"> : {m.subject}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

type Draft = { key: number; block: Block };
function emptyBlock(type: (typeof blockTypes)[number]): Block {
  if (type === "heading") return { type, text: "" };
  if (type === "text") return { type, text: "" };
  if (type === "button") return { type, label: "", url: "https://" };
  if (type === "events") return { type, eventIds: [] };
  return { type: "divider" };
}
function Newsletters({ data, t, locale, busy, send }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<View["newsletters"][number] | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const sizes = useMemo(() => new Map(data.groups.map((g) => [g.id, g.size ?? 0])), [data.groups]);
  const estimate = (n: View["newsletters"][number]) =>
    n.group_ids.reduce((sum, g) => sum + (sizes.get(g) ?? 0), 0) +
    (n.include_alumni ? data.alumni.filter((a) => a.reachable && !a.unsubscribed).length : 0);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(iso));
  const previewHtml = (subject: string, blocks: Block[]) =>
    renderNewsletter(
      blocks,
      data.clubEvents.map((e) => ({
        id: e.id,
        title: e.title,
        when: new Intl.DateTimeFormat(tag(locale), { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(
          new Date(e.local_start.slice(0, 16) + ":00Z"),
        ),
        place: e.place,
      })),
      { organization: data.sender?.mail_sender_name || data.sender?.name || subject, locale, unsubscribeUrl: "https://…" },
    ).html;
  const shown = data.newsletters.find((n) => n.id === previewing);
  return (
    <>
      <div className="panel-head">
        <p className="muted">{t.newsIntro}</p>
        {editing !== "new" && (
          <button type="button" className="button" onClick={() => setEditing("new")}>
            {t.newNewsletter}
          </button>
        )}
      </div>
      {editing === "new" && (
        <NewsletterEditor data={data} t={t} busy={busy} send={send} close={() => setEditing(null)} preview={previewHtml} />
      )}
      {!data.newsletters.length && <EmptyState title={t.noNewsletter} />}
      <ul className="records com-list">
        {data.newsletters.map((n) =>
          editing === n.id ? (
            <li key={n.id}>
              <NewsletterEditor data={data} t={t} busy={busy} send={send} close={() => setEditing(null)} preview={previewHtml} current={n} />
            </li>
          ) : (
            <li key={n.id}>
              <div className="panel-head">
                <h3>{n.subject}</h3>
                <Badge tone={n.status === "sent" ? "success" : undefined}>
                  {n.status === "sent" ? t.sent : t.draft}
                </Badge>
              </div>
              <p className="muted small">
                {n.status === "sent" && n.sent_at
                  ? `${fill(t.sentTo, { n: n.recipients })} · ${day(n.sent_at)}`
                  : `${fill(t.estimate, { n: estimate(n) })} · ${day(n.updated_at)}`}{" "}
                · {fill(t.by, { name: n.author })}
              </p>
              <div className="row-actions">
                <button type="button" className="text-button" onClick={() => setPreviewing(n.id)}>
                  {t.preview}
                  <span className="sr-only"> : {n.subject}</span>
                </button>
                {n.status === "draft" && (
                  <>
                    <button type="button" className="text-button" onClick={() => setEditing(n.id)}>
                      {t.edit}
                      <span className="sr-only"> : {n.subject}</span>
                    </button>
                    <button type="button" className="button" disabled={busy} onClick={() => setConfirming(n)}>
                      {t.sendNewsletter}
                      <span className="sr-only"> : {n.subject}</span>
                    </button>
                    <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "deleteNewsletter", id: n.id })}>
                      {t.remove}
                      <span className="sr-only"> : {n.subject}</span>
                    </button>
                  </>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {shown && (
        <Modal title={t.previewTitle} close={() => setPreviewing(null)} className="player-dialog wide-dialog">
          <iframe sandbox="" className="newsletter-preview" title={t.previewTitle} srcDoc={previewHtml(shown.subject, shown.blocks)} />
        </Modal>
      )}
      {confirming && (
        <Modal title={t.sendNewsletter} close={() => setConfirming(null)}>
          <p>{fill(t.sendConfirm, { subject: confirming.subject, n: estimate(confirming) })}</p>
          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void send({ action: "sendNewsletter", id: confirming.id, expectedVersion: confirming.version }).then(() =>
                  setConfirming(null),
                )
              }
            >
              {t.confirm}
            </button>
            <button type="button" className="button secondary" onClick={() => setConfirming(null)}>
              {t.cancel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function NewsletterEditor({
  data,
  t,
  busy,
  send,
  close,
  preview,
  current,
}: Omit<Props, "locale"> & {
  close: () => void;
  preview: (subject: string, blocks: Block[]) => string;
  current?: View["newsletters"][number];
}) {
  const [subject, setSubject] = useState(current?.subject ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (current?.blocks ?? [{ type: "heading", text: "" } as Block, { type: "text", text: "" } as Block]).map((block, key) => ({
      key,
      block,
    })),
  );
  // Stable keys for added blocks (React needs them when blocks move).
  const [nextKey, setNextKey] = useState(1000);
  const [showPreview, setShowPreview] = useState(false);
  const update = (key: number, block: Block) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, block } : x)));
  const move = (i: number, step: number) =>
    setDrafts((d) => {
      const next = [...d];
      const [item] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + step)), 0, item);
      return next;
    });
  const groups = data.groups.filter((g) => !g.archived);
  const blocks = drafts.map((d) => d.block);
  return (
    <form
      className="panel newsletter-editor"
      aria-label={current ? current.subject : t.newNewsletter}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void send({
          action: "newsletter",
          ...(current ? { id: current.id, expectedVersion: current.version } : {}),
          subject,
          blocks: blocks.filter((b) => b.type !== "events" || b.eventIds.length),
          groupIds: f.getAll("groups").map(String),
          includeAlumni: f.get("alumni") === "on",
        }).then((ok) => ok && close());
      }}
    >
      <label>
        {t.subject}
        <input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={2} maxLength={160} />
      </label>
      <fieldset>
        <legend>{t.groups}</legend>
        {!groups.length && <p className="muted small">{t.noGroupYet}</p>}
        <div className="check-grid">
          {groups.map((g) => (
            <label key={g.id} className="check">
              <input type="checkbox" name="groups" value={g.id} defaultChecked={current?.group_ids.includes(g.id)} />
              {g.name} <span className="muted small">({fill(t.size, { n: g.size ?? 0 })})</span>
            </label>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" name="alumni" defaultChecked={current?.include_alumni} />
          {t.includeAlumni}
        </label>
      </fieldset>
      <fieldset>
        <legend>{t.blocks}</legend>
        <ol className="block-list">
          {drafts.map(({ key, block }, i) => (
            <li key={key} className="block-item">
              <div className="panel-head">
                <strong>{t.blockTypes[block.type]}</strong>
                <div className="row-actions">
                  <button type="button" className="text-button" disabled={i === 0} onClick={() => move(i, -1)}>
                    {t.up}
                    <span className="sr-only"> : {t.blockTypes[block.type]} {i + 1}</span>
                  </button>
                  <button type="button" className="text-button" disabled={i === drafts.length - 1} onClick={() => move(i, 1)}>
                    {t.down}
                    <span className="sr-only"> : {t.blockTypes[block.type]} {i + 1}</span>
                  </button>
                  <button type="button" className="text-button" onClick={() => setDrafts((d) => d.filter((x) => x.key !== key))}>
                    {t.remove}
                    <span className="sr-only"> : {t.blockTypes[block.type]} {i + 1}</span>
                  </button>
                </div>
              </div>
              {block.type === "heading" && (
                <input
                  aria-label={`${t.blockTypes.heading} ${i + 1}`}
                  value={block.text}
                  maxLength={160}
                  required
                  onChange={(e) => update(key, { ...block, text: e.target.value })}
                />
              )}
              {block.type === "text" && (
                <textarea
                  aria-label={`${t.blockTypes.text} ${i + 1}`}
                  value={block.text}
                  rows={5}
                  maxLength={5000}
                  required
                  onChange={(e) => update(key, { ...block, text: e.target.value })}
                />
              )}
              {block.type === "button" && (
                <div className="form-grid">
                  <label>
                    {t.buttonLabel}
                    <input value={block.label} maxLength={60} required onChange={(e) => update(key, { ...block, label: e.target.value })} />
                  </label>
                  <label>
                    {t.buttonUrl}
                    <input
                      type="url"
                      value={block.url}
                      maxLength={500}
                      required
                      pattern="https?://.+"
                      onChange={(e) => update(key, { ...block, url: e.target.value })}
                    />
                  </label>
                </div>
              )}
              {block.type === "events" && (
                <div className="check-grid" role="group" aria-label={t.eventsPick}>
                  {!data.clubEvents.length && <p className="muted small">{t.noClubEvent}</p>}
                  {data.clubEvents.slice(0, 40).map((ev) => (
                    <label key={ev.id} className="check">
                      <input
                        type="checkbox"
                        checked={block.eventIds.includes(ev.id)}
                        onChange={(e) =>
                          update(key, {
                            ...block,
                            eventIds: e.target.checked
                              ? [...block.eventIds, ev.id].slice(0, 10)
                              : block.eventIds.filter((x) => x !== ev.id),
                          })
                        }
                      />
                      {ev.title} <span className="muted small">{ev.local_start.replace("T", " ")}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="row-actions block-add">
          <span className="muted small">{t.add}</span>
          {blockTypes.map((type) => (
            <button
              key={type}
              type="button"
              className="chip-button"
              disabled={drafts.length >= 40}
              onClick={() => {
                setDrafts((d) => [...d, { key: nextKey, block: emptyBlock(type) }]);
                setNextKey(nextKey + 1);
              }}
            >
              + {t.blockTypes[type]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="actions">
        <button className="button" disabled={busy}>
          {t.save}
        </button>
        <button type="button" className="button secondary" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
          {t.preview}
        </button>
        <button type="button" className="button secondary" onClick={close}>
          {t.cancel}
        </button>
      </div>
      {showPreview && (
        <iframe sandbox="" className="newsletter-preview" title={t.previewTitle} srcDoc={preview(subject, blocks)} />
      )}
    </form>
  );
}

function Groups({ data, t, busy, send }: Omit<Props, "locale">) {
  const [editing, setEditing] = useState<string | null>(null);
  const teamName = new Map(data.teams.map((x) => [x.id, x.name]));
  function form(g?: View["groups"][number]) {
    return (
      <form
        className="panel"
        aria-label={g?.name ?? t.newGroup}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send({
            action: "group",
            ...(g ? { id: g.id, expectedVersion: g.version } : {}),
            name: String(f.get("name") ?? ""),
            audiences: f.getAll("audiences").map(String),
            teamIds: f.getAll("teams").map(String),
            profileIds: f.getAll("people").map(String),
            archived: f.get("archived") === "on",
          }).then((ok) => ok && setEditing(null));
        }}
      >
        <label>
          {t.groupName}
          <input name="name" required minLength={2} maxLength={80} defaultValue={g?.name} />
        </label>
        <fieldset>
          <legend>{t.audiences}</legend>
          <div className="check-grid">
            {audiences.map((a) => (
              <label key={a} className="check">
                <input type="checkbox" name="audiences" value={a} defaultChecked={g?.audiences.includes(a)} />
                {t.audienceLabels[a]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t.teams}</legend>
          <div className="check-grid">
            {data.teams.map((x) => (
              <label key={x.id} className="check">
                <input type="checkbox" name="teams" value={x.id} defaultChecked={g?.team_ids.includes(x.id)} />
                {x.name} <span className="muted small">{x.season}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          {t.extra}
          <select name="people" multiple size={6} defaultValue={g?.profile_ids ?? []}>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        {g && (
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={g.archived} />
            {t.archived}
          </label>
        )}
        <div className="actions">
          <button className="button" disabled={busy}>
            {t.save}
          </button>
          <button type="button" className="button secondary" onClick={() => setEditing(null)}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }
  return (
    <>
      <div className="panel-head">
        <p className="muted">{t.groupsIntro}</p>
        {editing !== "new" && (
          <button type="button" className="button" onClick={() => setEditing("new")}>
            {t.newGroup}
          </button>
        )}
      </div>
      {editing === "new" && form()}
      {!data.groups.length && <EmptyState title={t.noGroup} />}
      <ul className="records com-list">
        {data.groups.map((g) => (
          <li key={g.id}>
            {editing === g.id ? (
              form(g)
            ) : (
              <>
                <div className="panel-head">
                  <h3>
                    {g.name}
                    {g.archived && <span className="muted"> · {t.archived}</span>}
                  </h3>
                  {g.size !== null && <Badge>{fill(t.size, { n: g.size })}</Badge>}
                </div>
                <p className="muted small">
                  {[
                    ...g.audiences.map((a) => t.audienceLabels[a]),
                    g.team_ids.length ? g.team_ids.map((x) => teamName.get(x) ?? "").join(", ") : t.allTeams,
                    g.profile_ids.length ? `+${g.profile_ids.length}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="row-actions">
                  <button type="button" className="text-button" onClick={() => setEditing(g.id)}>
                    {t.edit}
                    <span className="sr-only"> : {g.name}</span>
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Alumni({ data, t, locale, busy, send }: Props) {
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  return (
    <>
      <p className="muted">{t.alumniIntro}</p>
      {!data.alumni.length && <EmptyState title={t.noAlumni} />}
      <ul className="records com-list">
        {data.alumni.map((a) => (
          <li key={a.id}>
            <div className="panel-head">
              <h3>
                {a.full_name}
                {a.former_player && <span className="muted small"> · {t.formerPlayer}</span>}
              </h3>
              <Badge tone={!a.reachable ? undefined : a.unsubscribed ? "warning" : "success"}>
                {!a.reachable
                  ? t.unreachable
                  : !a.unsubscribed
                    ? t.subscribed
                    : a.stop_source === "link"
                      ? t.unsubscribedLink
                      : t.unsubscribedStaff}
              </Badge>
            </div>
            <p className="muted small">{fill(t.left, { d: day(a.left_on) })}</p>
            {a.reachable && a.stop_source !== "link" && (
              <div className="row-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => void send({ action: a.unsubscribed ? "resubscribe" : "unsubscribe", profileId: a.id })}
                >
                  {a.unsubscribed ? t.resume : t.stop}
                  <span className="sr-only"> : {a.full_name}</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
