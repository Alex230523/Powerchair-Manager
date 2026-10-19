"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { Button, Panel } from "./ui";
type View = {
  organizationId: string;
  recipients: { id: string; name: string }[];
  threads: { id: string; subject: string }[];
  messages: { id: string; body: string; sender: string; created_at: string }[];
  participants: { name: string }[];
};
export function Messages({ locale }: { locale: Locale }) {
  const t =
    locale === "fr"
      ? {
          title: "Messagerie",
          intro:
            "Conversations internes à votre organisation. Aucun email n’est envoyé.",
          new: "Nouvelle conversation",
          subject: "Objet",
          to: "Destinataires",
          body: "Message",
          send: "Envoyer",
          reply: "Répondre",
          refresh: "Actualiser",
          empty: "Aucune conversation.",
          none: "Aucun destinataire disponible. Un compte actif est nécessaire.",
          error:
            "Impossible de charger ou d’enregistrer. Actualisez puis réessayez.",
          access: "Mon espace",
          documents: "Documents",
          who: "Participants",
        }
      : locale === "en"
        ? {
            title: "Messages",
            intro:
              "Internal conversations in your organisation. No email is sent.",
            new: "New conversation",
            subject: "Subject",
            to: "Recipients",
            body: "Message",
            send: "Send",
            reply: "Reply",
            refresh: "Refresh",
            empty: "No conversations.",
            none: "No recipients available. An active account is required.",
            error: "Unable to load or save. Refresh and try again.",
            access: "My space",
            documents: "Documents",
            who: "Participants",
          }
        : {
            title: "Berichten",
            intro:
              "Interne gesprekken binnen je organisatie. Er wordt geen e-mail verstuurd.",
            new: "Nieuw gesprek",
            subject: "Onderwerp",
            to: "Ontvangers",
            body: "Bericht",
            send: "Versturen",
            reply: "Antwoorden",
            refresh: "Vernieuwen",
            empty: "Geen gesprekken.",
            none: "Geen ontvangers beschikbaar. Een actief account is vereist.",
            error: "Laden of opslaan mislukt. Vernieuw en probeer opnieuw.",
            access: "Mijn omgeving",
            documents: "Documenten",
            who: "Deelnemers",
          };
  const [data, setData] = useState<View | null>(null),
    [thread, setThread] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
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
        setError(false);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [thread, revision]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setBusy(true);
    setError(false);
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: data?.organizationId,
          action: thread ? "reply" : "create",
          threadId: thread,
          requestId,
          subject: d.get("subject"),
          recipients: d.getAll("recipients"),
          body: d.get("body"),
        }),
      });
      if (!r.ok) throw Error();
      const b = await r.json();
      form.reset();
      setRequestId(crypto.randomUUID());
      setThread(b.id);
      setRevision((v) => v + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string) {
    setThread(id);
    setData(null);
    setRequestId(crypto.randomUUID());
  }
  return (
    <main id="main" className="access">
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
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
      {error && <p role="alert">{t.error}</p>}
      {data && (
        <>
          <Panel title={t.title}>
            <ul>
              {data.threads.map((v) => (
                <li key={v.id}>
                  <Button
                    disabled={busy}
                    aria-pressed={v.id === thread}
                    onClick={() => choose(v.id)}
                  >
                    {v.subject}
                  </Button>
                </li>
              ))}
            </ul>
            {!data.threads.length && <p>{t.empty}</p>}
          </Panel>
          <Panel
            title={
              thread
                ? (data.threads.find((v) => v.id === thread)?.subject ??
                  t.reply)
                : t.new
            }
          >
            {thread && (
              <>
                <p>
                  {t.who}: {data.participants.map((v) => v.name).join(", ")}
                </p>
                <ol className="message-list">
                  {data.messages.map((m) => (
                    <li key={m.id}>
                      <strong>{m.sender}</strong>
                      <p>
                        <time dateTime={m.created_at}>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(m.created_at))}
                        </time>
                      </p>
                      <p className="message-body">{m.body}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <form key={thread} onSubmit={submit}>
              {!thread && (
                <>
                  <label htmlFor="message-subject">{t.subject}</label>
                  <input
                    id="message-subject"
                    name="subject"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                  <label htmlFor="message-recipients">{t.to}</label>
                  <select
                    id="message-recipients"
                    name="recipients"
                    multiple
                    required
                    size={5}
                  >
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
              <textarea
                id="message-body"
                name="body"
                required
                maxLength={5000}
                rows={5}
              />
              <Button disabled={busy || (!thread && !data.recipients.length)}>
                {thread ? t.reply : t.send}
              </Button>
            </form>
          </Panel>
        </>
      )}
    </main>
  );
}
