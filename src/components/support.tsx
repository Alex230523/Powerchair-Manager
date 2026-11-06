"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { supportView } from "@/domains/support/service";
import { ticketCategories } from "@/domains/support/schema";
import { errors } from "./access-copy";
import { supportCopy, fill } from "./support-copy";
import { useData, usePost } from "./use-api";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";

type View = Awaited<ReturnType<typeof supportView>>;
const tone = { open: "warning", answered: "info", closed: "neutral" } as const;

/** Console, series C (06/11/2026): « Support », a person's tickets to the platform's operator. */
export function SupportDesk({ locale }: { locale: Locale }) {
  const t = supportCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, setError, reload } = useData<View>("/api/support", failure);
  const { post, busy, message } = usePost("/api/support", reload, setError, failure);
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
  return (
    <main id="main" className="access support">
      <PageHeader title={t.title} subtitle={t.intro} actions={<Button onClick={() => setOpen((o) => !o)}>{t.open}</Button>} />
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      {!data && !error && <p role="status">{t.loading}</p>}
      {open && data && (
        <Card title={t.open} labelledBy="support-new" headingId="support-new">
          {data.organization && <p className="muted small">{fill(t.from, { organization: data.organization })}</p>}
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({ action: "open", category: f.get("category"), subject: f.get("subject"), text: f.get("text") }, t.sent).then((ok) => {
                if (ok) setOpen(false);
              });
            }}
          >
            <label>
              {t.category}
              <select name="category" defaultValue="question">
                {ticketCategories.map((c) => (
                  <option key={c} value={c}>
                    {t.categories[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.subject}
              <input name="subject" required minLength={3} maxLength={160} />
            </label>
            <label>
              {t.text}
              <textarea name="text" required rows={5} maxLength={4000} />
            </label>
            <div className="console-row-actions">
              <Button type="submit" disabled={busy}>
                {t.send}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      {data && (
        <Card title={t.mine} labelledBy="support-mine" headingId="support-mine">
          {data.tickets.length ? (
            <ul className="message-list">
              {data.tickets.map((k) => (
                <li key={k.id}>
                  <h3>
                    {k.subject} <Badge tone={tone[k.state]}>{t.states[k.state]}</Badge>
                  </h3>
                  <p className="muted small">
                    {t.categories[k.category]}
                    {k.organization ? ` · ${k.organization}` : ""} · {when(k.created_at)}
                  </p>
                  <div className="assistant-log" role="log" aria-label={k.subject}>
                    {(data.threads[k.id] ?? []).map((m) => (
                      <div key={m.id} className={`assistant-message ${m.by_operator ? "" : "user"}`}>
                        <div className="assistant-who">
                          {m.by_operator ? t.operator : t.you} · {when(m.created_at)}
                        </div>
                        <div className="assistant-text">{m.text}</div>
                      </div>
                    ))}
                  </div>
                  {k.state === "closed" && <p className="muted small">{t.closedHint}</p>}
                  {replying === k.id ? (
                    <form
                      className="stack-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void post({ action: "reply", id: k.id, text: f.get("text") }, t.replied).then((ok) => {
                          if (ok) setReplying(null);
                        });
                      }}
                    >
                      <label>
                        {t.replyText}
                        <textarea name="text" required rows={4} maxLength={4000} />
                      </label>
                      <div className="console-row-actions">
                        <Button type="submit" disabled={busy}>
                          {t.send}
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setReplying(null)}>
                          {t.cancel}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="console-row-actions">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setReplying(k.id)}>
                        {t.reply}
                        <span className="sr-only"> : {k.subject}</span>
                      </Button>
                      {k.state !== "closed" && (
                        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: "close", id: k.id }, t.closed)}>
                          {t.close}
                          <span className="sr-only"> : {k.subject}</span>
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.none} />
          )}
        </Card>
      )}
    </main>
  );
}
