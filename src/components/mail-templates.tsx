"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { mailTemplatesView, MailTemplate } from "@/domains/mail-templates/service";
import { locales, optional, usages, variables, type Texts, type Usage } from "@/domains/mail-templates/schema";
import { errors } from "./access-copy";
import { mailTemplatesCopy } from "./mail-templates-copy";
import { Badge, Button, EmptyState, PageHeader, Tabs } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof mailTemplatesView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

function useTemplates(locale: Locale) {
  const t = mailTemplatesCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false);
  const load = useCallback(
    () =>
      fetch(`/api/mail-templates?locale=${locale}`, { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setData(v);
        })
        .catch((e: Error) => {
          if (["FORBIDDEN", "CLUB_ONLY"].includes(e.message)) setDenied(true);
          else setError(t.failed);
        }),
    [locale, t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/mail-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data?.organization_id }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v as Record<string, unknown>;
  }
  return { data, error, setError, denied, load, post };
}
const message = (locale: Locale, code: string) => mailTemplatesCopy[locale].errors[code] ?? errors[code]?.[locale] ?? mailTemplatesCopy[locale].failed;

/** The three languages of a template, with the variables menu inserting at the cursor. */
function TextsEditor({ locale, texts, onChange }: { locale: Locale; texts: Texts; onChange: (t: Texts) => void }) {
  const t = mailTemplatesCopy[locale];
  const [lang, setLang] = useState<(typeof locales)[number]>(locale);
  const [variable, setVariable] = useState<string>(variables[0]);
  const last = useRef<{ field: "subject" | "body"; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  function insert() {
    const target = last.current ?? { field: "body" as const, el: null as unknown as HTMLTextAreaElement };
    const current = texts[lang][target.field];
    const at = target.el?.selectionStart ?? current.length,
      end = target.el?.selectionEnd ?? at;
    const token = `{${variable}}`;
    onChange({ ...texts, [lang]: { ...texts[lang], [target.field]: current.slice(0, at) + token + current.slice(end) } });
    requestAnimationFrame(() => {
      target.el?.focus();
      target.el?.setSelectionRange(at + token.length, at + token.length);
    });
  }
  return (
    <div className="template-texts">
      <Tabs label={t.languages[lang]} items={locales.map((l) => ({ id: l, label: t.languages[l] }))} value={lang} onChange={(v) => setLang(v as typeof lang)} idPrefix="template-lang" panelId="template-lang-panel" />
      <div id="template-lang-panel" role="tabpanel" aria-labelledby={`template-lang-${lang}`} className="federation-form">
        <label>
          {t.subject}
          <input
            value={texts[lang].subject}
            maxLength={200}
            required
            onFocus={(e) => (last.current = { field: "subject", el: e.currentTarget })}
            onChange={(e) => onChange({ ...texts, [lang]: { ...texts[lang], subject: e.target.value } })}
          />
        </label>
        <label>
          {t.body}
          <textarea
            rows={9}
            value={texts[lang].body}
            maxLength={8000}
            required
            onFocus={(e) => (last.current = { field: "body", el: e.currentTarget })}
            onChange={(e) => onChange({ ...texts, [lang]: { ...texts[lang], body: e.target.value } })}
          />
        </label>
        <div className="template-insert">
          <label className="compact-field">
            {t.insert}
            <select value={variable} onChange={(e) => setVariable(e.target.value)}>
              {variables.map((v) => (
                <option key={v} value={v}>
                  {t.variables[v]} {`{${v}}`}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={insert}>
            {t.insert}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A template's form: name, use and the three languages. */
function TemplateForm({ locale, row, busy, error, save, close }: { locale: Locale; row: MailTemplate | null; busy: boolean; error: string; save: (b: Record<string, unknown>) => void; close: () => void }) {
  const t = mailTemplatesCopy[locale];
  const blank = { subject: "", body: "" };
  const [name, setName] = useState(row?.name ?? ""),
    [usage, setUsage] = useState<Usage>(row?.usage ?? "free"),
    [texts, setTexts] = useState<Texts>(row?.texts ?? { fr: blank, nl: blank, en: blank });
  return (
    <Modal title={row ? row.name : t.add} close={close}>
      {error && <p role="alert">{error}</p>}
      <form
        className="federation-form"
        onSubmit={(e) => {
          e.preventDefault();
          save({ action: "save", ...(row ? { id: row.id, version: row.version } : {}), name: name.trim(), usage, texts });
        }}
      >
        <div className="form-pair">
          <label>
            {t.name}
            <input value={name} required minLength={2} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {t.usage}
            <select value={usage} onChange={(e) => setUsage(e.target.value as Usage)}>
              {usages.map((u) => (
                <option key={u} value={u}>
                  {t.usages[u]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TextsEditor locale={locale} texts={texts} onChange={setTexts} />
        <Button type="submit" loading={busy}>
          {t.save}
        </Button>
      </form>
    </Modal>
  );
}

/** « Envoyer »: groups of the club, or those invited to an event; the texts may change for this sending. */
function SendDialog({
  locale,
  data,
  template,
  eventId,
  busy,
  error,
  send,
  close,
  choose,
}: {
  locale: Locale;
  data: View;
  template: MailTemplate;
  eventId?: string;
  busy: boolean;
  error: string;
  send: (b: Record<string, unknown>) => void;
  close: () => void;
  /** From an event: the template to start from. */
  choose?: { options: MailTemplate[]; onChange: (id: string) => void };
}) {
  const t = mailTemplatesCopy[locale];
  const [groups, setGroups] = useState<string[]>([]),
    [event, setEvent] = useState(eventId ?? ""),
    [invited, setInvited] = useState(!!eventId),
    [texts, setTexts] = useState<Texts>(template.texts);
  const event_ = data.events.find((e) => e.id === event);
  return (
    <Modal title={eventId && event_ ? t.inviteTitle(event_.title) : t.sendTitle(template.name)} close={close}>
      {error && <p role="alert">{error}</p>}
      <form
        className="federation-form"
        onSubmit={(e) => {
          e.preventDefault();
          send({ action: "send", id: template.id, groupIds: groups, eventId: event || null, toInvited: invited && !!event, texts });
        }}
      >
        {eventId && <p className="muted">{t.inviteHint}</p>}
        {choose && (
          <label>
            {t.template}
            <select value={template.id} onChange={(e) => choose.onChange(e.target.value)}>
              {choose.options.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t.event}
          <select value={event} onChange={(e) => setEvent(e.target.value)} disabled={!!eventId}>
            <option value="">{t.noEvent}</option>
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} · {new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(e.starts_at))}
              </option>
            ))}
          </select>
        </label>
        {event && (
          <label className="check">
            <input type="checkbox" checked={invited} onChange={(e) => setInvited(e.target.checked)} />
            {t.invited}
          </label>
        )}
        {data.groups.length > 0 && (
          <fieldset className="template-groups">
            <legend>{t.groups}</legend>
            {(data.groups as { id: string; name: string }[]).map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={groups.includes(g.id)} onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </fieldset>
        )}
        <TextsEditor locale={locale} texts={texts} onChange={setTexts} />
        <p className="muted small">{t.limit(data.dailyLimit)}</p>
        <Button type="submit" loading={busy} disabled={!groups.length && !(invited && event)}>
          {t.send}
        </Button>
      </form>
    </Modal>
  );
}

/** The preview with a real person of the club (or oneself), in that person's language. */
function Preview({ locale, data, template, post }: { locale: Locale; data: View; template: MailTemplate; post: (b: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
  const t = mailTemplatesCopy[locale];
  const [profile, setProfile] = useState(""),
    [event, setEvent] = useState(""),
    [shown, setShown] = useState<{ subject: string; body: string; locale: string } | null>(null),
    [error, setError] = useState("");
  const refresh = (profileId: string, eventId: string) =>
    post({ action: "preview", id: template.id, profileId: profileId || null, eventId: eventId || null })
      .then((r) => setShown(r as { subject: string; body: string; locale: string }))
      .catch((e: Error) => setError(message(locale, e.message)));
  return (
    <section className="template-preview" aria-label={t.preview}>
      <div className="form-pair">
        <label>
          {t.previewWith}
          <select
            value={profile}
            onChange={(e) => {
              setProfile(e.target.value);
              void refresh(e.target.value, event);
            }}
          >
            <option value="">{t.me}</option>
            {(data.people as { id: string; full_name: string }[]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.previewEvent}
          <select
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              void refresh(profile, e.target.value);
            }}
          >
            <option value="">{t.noEvent}</option>
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!shown && (
        <Button size="sm" variant="secondary" onClick={() => void refresh(profile, event)}>
          {t.preview}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
      {shown && (
        <div className="template-mail" aria-live="polite">
          <p className="muted small">{t.previewIn(t.languages[shown.locale as Locale] ?? shown.locale)}</p>
          <p>
            <strong>{shown.subject}</strong>
          </p>
          <p className="prewrap">{shown.body}</p>
        </div>
      )}
    </section>
  );
}

/** 10: the library (/[locale]/communication/templates). */
export function MailTemplates({ locale }: { locale: Locale }) {
  const t = mailTemplatesCopy[locale];
  const { data, error, setError, denied, load, post } = useTemplates(locale);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<MailTemplate | "new" | null>(null),
    [sending, setSending] = useState<MailTemplate | null>(null),
    [previewing, setPreviewing] = useState<string | null>(null);
  async function run(body: Record<string, unknown>, done: (r: Record<string, unknown>) => string, after?: () => void) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await post(body);
      after?.();
      await load();
      setNotice(done(r));
    } catch (e) {
      const code = (e as Error).message;
      setError(message(locale, code));
      if (code === "STALE_VERSION") await load();
    } finally {
      setBusy(false);
    }
  }
  if (denied)
    return (
      <main id="main" className="access">
        <PageHeader title={t.title} />
        <p>{t.forbidden}</p>
      </main>
    );
  const name = (id: string) => data?.templates.find((x) => x.id === id)?.name ?? "";
  return (
    <main id="main" className="access mail-templates">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          data?.can.manage && (
            <Button icon="plus" onClick={() => setEditing("new")}>
              {t.add}
            </Button>
          )
        }
      />
      {error && !editing && !sending && <p role="alert">{error}</p>}
      <p role="status">{!data && !error ? t.loading : notice}</p>
      {data && (
        <>
          <ul className="template-list">
            {data.templates.map((x) => (
              <li key={x.id} className="card template-card">
                <h2>{x.name}</h2>
                <p className="exercise-badges">
                  <Badge tone="info">{t.usages[x.usage]}</Badge>
                  {optional.includes(x.usage) && <Badge>{t.optional}</Badge>}
                  {x.archived && <Badge tone="warning">{t.archived}</Badge>}
                </p>
                <p className="muted small">
                  {t.sends(x.sends)}
                  {x.last_sent ? ` · ${new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(x.last_sent))}` : ""}
                </p>
                <p className="template-subject">{x.texts[locale]?.subject}</p>
                <div className="exercise-actions">
                  {!x.archived && (
                    <Button size="sm" onClick={() => setSending(x)}>
                      {t.send}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" aria-expanded={previewing === x.id} onClick={() => setPreviewing(previewing === x.id ? null : x.id)}>
                    {t.preview}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run({ action: "test", id: x.id }, () => t.testSent)}>
                    {t.test}
                  </Button>
                  {data.can.manage && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(x)}>
                        {t.edit}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ action: "duplicate", id: x.id }, () => t.saved)}>
                        {t.duplicate}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ action: "archive", id: x.id, archived: !x.archived }, () => t.saved)}>
                        {x.archived ? t.restore : t.archive}
                      </Button>
                    </>
                  )}
                </div>
                {previewing === x.id && <Preview locale={locale} data={data} template={x} post={post} />}
              </li>
            ))}
          </ul>
          <section aria-labelledby="template-history">
            <h2 id="template-history">{t.history}</h2>
            {data.history.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.columns.template}</th>
                      <th scope="col">{t.columns.kind}</th>
                      <th scope="col">{t.columns.recipients}</th>
                      <th scope="col">{t.columns.event}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h) => (
                      <tr key={h.id}>
                        <th scope="row">
                          {name(h.template_id)}
                          <span className="muted small"> · {new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(h.sent_at))}</span>
                        </th>
                        <td>{t.kinds[h.kind as keyof typeof t.kinds] ?? h.kind}</td>
                        <td>{t.recipients(h.recipients)}</td>
                        <td>{h.event ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="inbox" title={t.noHistory} />
            )}
          </section>
        </>
      )}
      {editing && data && (
        <TemplateForm
          locale={locale}
          row={editing === "new" ? null : editing}
          busy={busy}
          error={error}
          close={() => setEditing(null)}
          save={(b) => void run(b, () => t.saved, () => setEditing(null))}
        />
      )}
      {sending && data && (
        <SendDialog
          locale={locale}
          data={data}
          template={sending}
          busy={busy}
          error={error}
          close={() => setSending(null)}
          send={(b) => void run(b, (r) => t.sent(Number(r.recipients ?? 0)), () => setSending(null))}
        />
      )}
    </main>
  );
}

/** 10: « Envoyer une invitation » from an event: the invitation template, filled with the event. */
export function EventInvitation({ locale, eventId, close }: { locale: Locale; eventId: string; close: () => void }) {
  const t = mailTemplatesCopy[locale];
  const { data, error, setError, post } = useTemplates(locale);
  const [busy, setBusy] = useState(false),
    [choice, setChoice] = useState(""),
    [done, setDone] = useState("");
  const usable = (data?.templates ?? []).filter((x) => !x.archived);
  const chosen = usable.find((x) => x.id === choice) ?? usable.find((x) => x.usage === "event_invitation") ?? usable[0];
  if (!data || !chosen)
    return (
      <Modal title={t.invite} close={close}>
        <p role={error ? "alert" : "status"}>{error || t.loading}</p>
      </Modal>
    );
  if (done)
    return (
      <Modal title={t.invite} close={close}>
        <p role="status">{done}</p>
      </Modal>
    );
  return (
    <SendDialog
      key={chosen.id}
      locale={locale}
      data={data}
      template={chosen}
      eventId={eventId}
      busy={busy}
      error={error}
      close={close}
      choose={{ options: usable, onChange: setChoice }}
      send={(b) => {
        setBusy(true);
        setError("");
        void post(b)
          .then((r) => setDone(t.sent(Number(r.recipients ?? 0))))
          .catch((e: Error) => setError(message(locale, e.message)))
          .finally(() => setBusy(false));
      }}
    />
  );
}

/** 10: « Modèle d'email » in the settings of a reminder or an automation. */
export function TemplateChoice({ locale, target, usage }: { locale: Locale; target: string; usage?: Usage }) {
  const t = mailTemplatesCopy[locale];
  const { data, load, post } = useTemplates(locale);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (!data?.can.manage) return null;
  const bound = data.bindings.find((b) => b.target === target)?.template_id ?? "";
  const options = data.templates.filter((x) => !x.archived && (!usage || x.usage === usage || x.usage === "free"));
  return (
    <div className="template-choice">
      <label className="compact-field">
        {t.choice}
        <select
          value={bound}
          disabled={busy}
          aria-describedby={`choice-${target.replace(/[^a-z]/gi, "")}`}
          onChange={(e) => {
            setBusy(true);
            void post({ action: "bind", target, templateId: e.target.value || null })
              .then(() => load())
              .then(() => setNotice(t.saved))
              .catch(() => setNotice(t.failed))
              .finally(() => setBusy(false));
          }}
        >
          <option value="">{t.choiceNone}</option>
          {options.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small" id={`choice-${target.replace(/[^a-z]/gi, "")}`}>
        {t.choiceHint} <Link href={`/${locale}/communication/templates`}>{t.library}</Link>
      </p>
      <p role="status" className="sr-only">
        {notice}
      </p>
    </div>
  );
}
