"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { notificationView } from "@/domains/notifications/service";
import { editableKinds } from "@/domains/notifications/templates";
import { labels } from "@/domains/access/policy";
import { notificationCopy, notificationErrors } from "./notifications-copy";
import { errors } from "./access-copy";
import { peopleErrors } from "./people-copy";
import { Panel, Button, PageHeader, Card } from "./ui";
import { PushSettings } from "./push-settings";
import { WeeklyDigest } from "./weekly-digest";
type View = Awaited<ReturnType<typeof notificationView>>;
const variables: Record<string, string[]> = {
  invitation: ["organization", "role", "url"],
  access_changed: ["organization", "url"],
  team_assignment: ["organization", "url"],
  family_access: ["organization", "url"],
  test_self: ["name", "organization", "url"],
  attendance_update: ["name", "organization", "url"],
  calendar_update: ["name", "organization", "url"],
  document_update: ["name", "organization", "url"],
  registration_update: ["name", "organization", "url"],
  dues_reminder: [
    "name",
    "person",
    "amount",
    "due",
    "details",
    "organization",
    "url",
  ],
  document_reminder: ["name", "person", "details", "organization", "url"],
  training_update: [
    "name",
    "person",
    "course",
    "status",
    "organization",
    "url",
  ],
  match_update: ["name", "match", "status", "organization", "url"],
  registration_link: ["name", "organization", "url"],
  license_update: ["name", "person", "status", "organization", "url"],
  funding_task: ["name", "title", "due", "organization", "url"],
  dues_issued: ["name", "person", "amount", "due", "details", "organization", "url"],
};
/** `embedded`: rendered inside Réglages (wave 11) as a section instead of a page. */
export function Notifications({ locale, embedded = false }: { locale: Locale; embedded?: boolean }) {
  const t = notificationCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState(""),
    [unreadOnly, setUnreadOnly] = useState(false),
    [selection, setSelection] = useState("test_self:fr"),
    [preview, setPreview] = useState<{ subject: string; text: string } | null>(
      null,
    );
  const explain = useCallback(
    (code: string) =>
      notificationErrors[code]?.[locale] ??
      peopleErrors[code]?.[locale] ??
      errors[code]?.[locale] ??
      t.unavailable,
    [locale, t.unavailable],
  );
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    setData(value);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) setFailure(explain(e.message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [explain]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setFailure(explain(e instanceof Error ? e.message : "UNAVAILABLE"));
    } finally {
      setBusy(false);
    }
  }
  async function send(command: Record<string, unknown>) {
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...command, organizationId: data?.context.id }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    await load();
    setMessage(t.saved);
  }
  /** The weekly digest's commands (wave 15, C7): the answer matters (a preview may find nothing to say). */
  async function digestSend(command: Record<string, unknown>) {
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...command, organizationId: data?.context.id }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(explain(value.error));
    await load();
    return value as { sent?: boolean };
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const f = new FormData(
      e.currentTarget,
      (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null,
    );
    void task(() => fn(f));
  }
  const template =
    data?.templates.find((v) => `${v.kind}:${v.locale}` === selection) ??
    data?.templates[0];
  const kindName = (kind: string) =>
    t[kind as (typeof editableKinds)[number]] ?? kind;
  const stateName = (state: string) =>
    state === "local"
      ? t.localState
      : state === "uncertain"
        ? t.uncertainState
        : (t[
            state as "pending" | "processing" | "sent" | "failed" | "cancelled"
          ] ?? state);
  const date = (value: string | Date) =>
    new Date(value).toLocaleString(locale, { timeZone: "Europe/Brussels" });
  const reason = (code: string) =>
    code === "PREFERENCES"
      ? locale === "en"
        ? "Recipient preferences"
        : locale === "fr"
          ? "Préférences du destinataire"
          : "Voorkeuren van de ontvanger"
      : code === "ACCESS_REVOKED_OR_EXPIRED"
        ? locale === "en"
          ? "Access or link is no longer valid"
          : locale === "fr"
            ? "Accès ou lien devenu invalide"
            : "Toegang of link niet meer geldig"
        : code === "ADMIN_CANCELLED"
          ? locale === "en"
            ? "Cancelled by administrator"
            : locale === "fr"
              ? "Annulé par le responsable"
              : "Geannuleerd door de beheerder"
          : code === "PAYLOAD_UNREADABLE"
            ? locale === "en"
              ? "Content unavailable — check configuration"
              : locale === "fr"
                ? "Contenu indisponible — vérifier la configuration"
                : "Inhoud niet beschikbaar — controleer configuratie"
            : code === "PAUSED"
              ? t.paused
              : code.includes("UNCERTAIN") || code.includes("UNKNOWN")
                ? t.uncertain
                : locale === "en"
                  ? "Delivery error; contact the technical administrator."
                  : locale === "fr"
                    ? "Erreur de transport ; consulter le responsable technique."
                    : "Transportfout; raadpleeg de technische beheerder.";
  return (
    <>
      <Wrapper embedded={embedded} title={t.title}>
        <p className="muted">{t.intro}</p>
        <div role="status" aria-live="polite">
          {loading ? t.loading : message}
        </div>
        {failure && (
          <p className="error-message" role="alert">
            {failure}
          </p>
        )}
        {!data && !loading && (
          <p>
            <Link className="button secondary" href={`/${locale}/access`}>{t.missing}</Link>
          </p>
        )}
        {data && (
          <>
            <p className="notice">
              <strong>{data.context.name}</strong> ·{" "}
              {labels[data.context.role][locale]}
            </p>
            <p className="muted">
              {data.transport === "smtp" ? t.smtp : t.local}
            </p>
            <Panel id="notif-inbox" title={`${t.inbox} · ${t.unread} : ${data.unread}`}>
              <p className="muted">{t.inboxLimit}</p>
              <label className="check">
                <input
                  type="checkbox"
                  data-nodirty=""
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                />
                {t.onlyUnread}
              </label>
              <Button
                disabled={busy || !data.unread}
                onClick={() => void task(() => send({ action: "readAll" }))}
              >
                {t.readAll}
              </Button>
              <ul className="records">
                {data.inbox
                  .filter((n) => !unreadOnly || !n.read_at)
                  .map((n) => (
                    <li key={n.id}>
                      <h3>{n.title}</h3>
                      <p className="muted">
                        {date(n.created_at)} ·{" "}
                        {n.read_at ? t.readStatus : t.newStatus}
                      </p>
                      <p className="message-text">{n.body}</p>
                      <div className="actions">
                        <Link className="button secondary" href={n.href}>{t.open}</Link>
                        {!n.read_at && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void task(() =>
                                send({ action: "read", id: n.id }),
                              )
                            }
                          >
                            {t.read}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
              {!data.inbox.some((n) => !unreadOnly || !n.read_at) && (
                <p>{t.empty}</p>
              )}
            </Panel>
            <Panel id="notif-preferences" title={t.preferences}>
              <p>{t.security}</p>
              {!data.globalEnabled && (
                <p className="notice">
                  {t.globalOff}{" "}
                  <Link href={`/${locale}/access`}>{t.access}</Link>
                </p>
              )}
              {data.preferences.map((pref) => (
                <form
                  className="preference-form"
                  key={`${pref.category}-${pref.email}-${pref.inApp}`}
                  onSubmit={(e) =>
                    submit(e, async (f) => {
                      await send({
                        action: "preferences",
                        category: pref.category,
                        email: f.has("email"),
                        inApp: f.has("inApp"),
                      });
                    })
                  }
                >
                  <fieldset>
                    <legend>
                      {pref.category === "sport" ? t.sport : t.administrative}
                    </legend>
                    <label className="check">
                      <input
                        name="email"
                        type="checkbox"
                        defaultChecked={pref.email}
                      />
                      {t.email}
                    </label>
                    <label className="check">
                      <input
                        name="inApp"
                        type="checkbox"
                        defaultChecked={pref.inApp}
                      />
                      {t.inApp}
                    </label>
                  </fieldset>
                  <Button disabled={busy}>{t.save}</Button>
                </form>
              ))}
              <p className="muted">{t.testHint}</p>
              <Button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await send({ action: "testSelf" });
                    setMessage(t.testSaved);
                  })
                }
              >
                {t.test}
              </Button>
            </Panel>
            <PushSettings locale={locale} />
            {data.digest && <WeeklyDigest locale={locale} digest={data.digest} send={digestSend} />}
            {data.manage && (
              <>
                <Panel id="notif-templates" title={t.templates}>
                  <label>
                    {t.kind}
                    <select
                      data-nodirty=""
                      value={
                        template ? `${template.kind}:${template.locale}` : ""
                      }
                      onChange={(e) => {
                        setSelection(e.target.value);
                        setPreview(null);
                      }}
                    >
                      {data.templates.map((v) => (
                        <option
                          key={`${v.kind}:${v.locale}`}
                          value={`${v.kind}:${v.locale}`}
                        >
                          {kindName(v.kind)} ·{" "}
                          {v.locale === "en"
                            ? "English"
                            : v.locale === "fr"
                              ? "Français"
                              : "Nederlands"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {template && (
                    <form
                      key={`${template.kind}-${template.locale}-${template.version}`}
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          const body = {
                            kind: template.kind,
                            locale: template.locale,
                            subject: String(f.get("subject")),
                            body: String(f.get("body")),
                            organizationId: data.context.id,
                          };
                          if (f.get("operation") === "preview") {
                            const response = await fetch(
                              "/api/notifications/preview",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(body),
                              },
                            );
                            const value = await response.json();
                            if (!response.ok) throw new Error(value.error);
                            setPreview(value);
                          } else {
                            await send({
                              action: "template",
                              ...body,
                              expectedVersion: template.version,
                            });
                            setPreview(null);
                          }
                        })
                      }
                    >
                      <p>
                        {t.version} : {template.version} · {t.variables} :{" "}
                        {variables[template.kind]
                          ?.map((v) => `{${v}}`)
                          .join(", ")}
                      </p>
                      <label htmlFor="notification-subject">{t.subject}</label>
                      <input
                        id="notification-subject"
                        name="subject"
                        required
                        minLength={2}
                        maxLength={180}
                        defaultValue={template.subject}
                      />
                      <label htmlFor="notification-body">{t.body}</label>
                      <textarea
                        id="notification-body"
                        name="body"
                        required
                        minLength={5}
                        maxLength={5000}
                        rows={7}
                        defaultValue={template.body}
                      />
                      <div className="actions">
                        <Button
                          disabled={busy}
                          name="operation"
                          value="preview"
                        >
                          {t.preview}
                        </Button>
                        <Button disabled={busy} name="operation" value="save">
                          {t.save}
                        </Button>
                      </div>
                    </form>
                  )}
                  {preview && (
                    <section className="notification-preview">
                      <h3>{t.previewTitle}</h3>
                      <strong>{preview.subject}</strong>
                      <pre>{preview.text}</pre>
                    </section>
                  )}
                </Panel>
                <Panel id="notif-queue" title={t.queue}>
                  <p className="muted">{t.queueLimit}</p>
                  {data.paused && <p className="notice">{t.paused}</p>}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void task(() =>
                        send({ action: "pause", paused: !data.paused }),
                      )
                    }
                  >
                    {data.paused ? t.resume : t.pause}
                  </Button>
                  <ul className="records">
                    {data.jobs.map((job) => (
                      <li key={job.id}>
                        <h3>
                          {kindName(job.kind)} ·{" "}
                          {job.locale === "en"
                            ? "English"
                            : job.locale === "fr"
                              ? "Français"
                              : "Nederlands"}
                        </h3>
                        <p>
                          {t.recipient} : {job.recipient_name ?? t.invitee}
                        </p>
                        <p>
                          {t.state} : <strong>{stateName(job.state)}</strong> ·{" "}
                          {t.attempts} : {job.attempts} · {t.version} :{" "}
                          {job.template_version}
                        </p>
                        {job.error_code && (
                          <p className="muted">
                            {t.reason} : {reason(job.error_code)}
                          </p>
                        )}
                        {job.state === "pending" && (
                          <p className="muted">
                            {t.scheduled} : {date(job.available_at)}
                          </p>
                        )}
                        <details>
                          <summary>{t.history}</summary>
                          <ul>
                            {data.attempts
                              .filter((a) => a.job_id === job.id)
                              .map((a) => (
                                <li key={a.id}>
                                  {date(a.started_at)} · {stateName(a.outcome)}
                                </li>
                              ))}
                          </ul>
                        </details>
                        {job.state === "failed" && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void task(() =>
                                send({ action: "retry", id: job.id }),
                              )
                            }
                          >
                            {t.retry}
                          </Button>
                        )}
                        {job.state === "uncertain" && (
                          <form
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await send({
                                  action: "retry",
                                  id: job.id,
                                  confirmUncertain: f.has("confirmUncertain"),
                                });
                              })
                            }
                          >
                            <p>{t.uncertain}</p>
                            <label className="check">
                              <input
                                name="confirmUncertain"
                                type="checkbox"
                                required
                              />
                              {t.confirmUncertain}
                            </label>
                            <Button disabled={busy}>{t.retry}</Button>
                          </form>
                        )}
                        {["pending", "failed", "uncertain"].includes(
                          job.state,
                        ) && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void task(() =>
                                send({ action: "cancel", id: job.id }),
                              )
                            }
                          >
                            {t.cancel}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!data.jobs.length && <p>{t.empty}</p>}
                </Panel>
              </>
            )}
          </>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void task(load)}
        >
          {t.refresh}
        </button>
      </Wrapper>
    </>
  );
}

function Wrapper({ embedded, title, children }: { embedded: boolean; title: string; children: ReactNode }) {
  return embedded ? (
    <Card title={title} labelledBy="settings-notifications" headingId="settings-notifications" className="settings-notifications">
      {children}
    </Card>
  ) : (
    <main id="main" className="access notifications">
      <PageHeader title={title} />
      {children}
    </main>
  );
}
