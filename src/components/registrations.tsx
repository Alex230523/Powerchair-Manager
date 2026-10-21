"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { Panel, Button, PageHeader, Card, Badge, Toolbar, type Tone, EmptyState } from "./ui";
import {
  fieldVisible,
  mappings,
  type Answers,
  type Field,
  type Status,
} from "@/domains/registrations/schema";
import {
  registrationCopy,
  statusLabels,
  typeLabels,
  registrationErrors,
  registrationExtras,
  fieldExtras,
} from "./registrations-copy";
import { tigerstormTemplate } from "@/domains/registrations/templates";
import { ageOn } from "@/domains/people/schema";
import { Modal } from "./modal";
const statusTone: Record<string, Tone> = {
  draft: "neutral",
  submitted: "info",
  incomplete: "warning",
  review: "info",
  waiting: "warning",
  accepted: "success",
  refused: "danger",
  withdrawn: "neutral",
};
type Form = {
  id: string;
  organization_id: string;
  season_id: string;
  title: string;
  description: string;
  fields: Field[];
  published: boolean;
  capacity: number | null;
  version: number;
  organization_name?: string;
  season_name?: string;
  logo_version?: string | null;
};
type Application = {
  id: string;
  organization_id: string;
  form_id: string;
  season_id: string;
  subject_kind: "self" | "represented";
  subject_name: string;
  birth_date: string;
  locale: Locale;
  status: Status;
  version: number;
  answers: Answers;
  form_snapshot: { title: string; fields: Field[] };
  applicant_name: string;
  applicant_email: string;
  organization_name: string;
  decided_at: string | null;
  submitted_at?: string | null;
  confidential_hidden?: boolean;
  history: {
    id: string;
    status: Status | "attachment" | "note" | "saved";
    message: string;
    internal: boolean;
    created_at: string;
    actor: string;
  }[];
  attachments: { id: string; field_key: string; filename: string }[];
};
type View = {
  context?: { organization_id: string; organization_name: string };
  forms?: Form[];
  seasons?: { id: string; name: string }[];
  teams?: { id: string; name: string; season_id: string }[];
  profiles?: { id: string; full_name: string; birth_date: string | null }[];
  applications: Application[];
};
function FieldLabel({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
/** No account: sign in, or receive a personal link by email. */
function GuestLink({ locale, formId }: { locale: Locale; formId: string }) {
  const x = registrationExtras[locale];
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="guest-link">
      <p>
        <Link href={"/" + locale + "/access"}>{x.haveAccount}</Link>
      </p>
      <h3>{x.guestTitle}</h3>
      <p className="muted">{x.guestIntro}</p>
      {sent ? (
        <p role="status" className="notice">
          {x.guestSent}
        </p>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            fetch("/api/registrations/guest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                formId,
                name: d.get("guest-name"),
                email: d.get("guest-email"),
                locale,
                website: d.get("guest-website") || undefined,
              }),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json()).error);
                setSent(true);
              })
              .catch(() => setError(x.guestSent))
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor="guest-name">
            {x.guestName}
            <input
              id="guest-name"
              name="guest-name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label htmlFor="guest-email">
            {x.guestEmail}
            <input
              id="guest-email"
              name="guest-email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="guest-website">Website</label>
            <input
              id="guest-website"
              name="guest-website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <button className="button" disabled={busy}>
            {x.guestSend}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
function Questions({
  fields,
  locale,
  answers,
  setAnswers,
  disabled = false,
}: {
  fields: Field[];
  locale: Locale;
  answers: Answers;
  setAnswers: (a: Answers) => void;
  disabled?: boolean;
}) {
  const t = registrationCopy[locale];
  return (
    <>
      {fields
        .filter((f) => fieldVisible(f, answers))
        .map((f) => {
          const fid = "answer-" + f.key;
          const x = fieldExtras[locale];
          const label =
            (f.label[locale] || f.label.fr) + (f.required ? " *" : "");
          const help = f.help ? f.help[locale] || f.help.fr : "";
          const notes = (
            <>
              {help && <p className="field-help">{help}</p>}
              {f.confidential && (
                <p className="field-help field-confidential">
                  {x.confidentialHint}
                </p>
              )}
            </>
          );
          if (f.type === "file")
            return (
              <div key={f.key}>
                <p>
                  {label} · {t.fileHint}
                </p>
                {notes}
              </div>
            );
          if (f.type === "multi") {
            const chosen = Array.isArray(answers[f.key])
              ? (answers[f.key] as string[])
              : [];
            const full = f.max !== undefined && chosen.length >= f.max;
            return (
              <fieldset key={f.key} className="choice-group">
                <legend>
                  {label}
                  {f.max ? (
                    <span className="muted">
                      {" "}
                      ({x.upTo.replace("{n}", String(f.max))})
                    </span>
                  ) : null}
                </legend>
                {notes}
                {f.options.map((o) => (
                  <label key={o} className="check">
                    <input
                      type="checkbox"
                      checked={chosen.includes(o)}
                      disabled={disabled || (full && !chosen.includes(o))}
                      onChange={(e) =>
                        setAnswers({
                          ...answers,
                          [f.key]: e.target.checked
                            ? [...chosen, o]
                            : chosen.filter((v) => v !== o),
                        })
                      }
                    />
                    {o}
                  </label>
                ))}
              </fieldset>
            );
          }
          return (
            <FieldLabel key={f.key} id={fid} label={label}>
              {notes}
              {f.type === "consent" ? (
                <input
                  id={fid}
                  type="checkbox"
                  checked={answers[f.key] === true}
                  disabled={disabled}
                  onChange={(e) =>
                    setAnswers({ ...answers, [f.key]: e.target.checked })
                  }
                />
              ) : f.type === "choice" ? (
                <select
                  id={fid}
                  value={String(answers[f.key] ?? "")}
                  disabled={disabled}
                  onChange={(e) =>
                    setAnswers({ ...answers, [f.key]: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={fid}
                  type={
                    f.type === "date"
                      ? "date"
                      : f.type === "phone"
                        ? "tel"
                        : f.type === "email"
                          ? "email"
                          : "text"
                  }
                  autoComplete={f.confidential ? "off" : undefined}
                  maxLength={
                    f.type === "phone" ? 35 : f.type === "email" ? 254 : 5000
                  }
                  value={String(answers[f.key] ?? "")}
                  disabled={disabled}
                  onChange={(e) =>
                    setAnswers({ ...answers, [f.key]: e.target.value })
                  }
                />
              )}
              {f.type === "signature" && <p className="muted">{t.signature}</p>}
            </FieldLabel>
          );
        })}
    </>
  );
}
/** Popup for one form: preview, public link and copy-ready embed codes. */
function ShareDialog({
  locale,
  form,
  close,
}: {
  locale: Locale;
  form: Form;
  close: () => void;
}) {
  const x = registrationExtras[locale];
  const [answers, setAnswers] = useState<Answers>({});
  const [copied, setCopied] = useState("");
  const site = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${site}/${locale}/inscription/${form.id}`;
  const codes = [
    { key: "link", label: x.publicLink, code: url },
    {
      key: "iframe",
      label: x.iframe,
      code: `<iframe title="${form.title.replace(/"/g, "&quot;")}" src="${site}/${locale}/registration-widget/${form.id}" width="100%" height="260" style="border:0"></iframe>`,
    },
    {
      key: "popup",
      label: x.popup,
      code: `<button type="button" onclick="window.open('${url}','inscription','width=720,height=860')">${x.button}</button>`,
    },
  ];
  return (
    <Modal title={`${x.shareTitle} : ${form.title}`} close={close}>
      {form.description && <p className="message-text">{form.description}</p>}
      <section aria-labelledby="share-codes">
        <h3 id="share-codes">{x.share}</h3>
        <p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            {x.open} ↗
          </a>
        </p>
        {codes.map((c) => (
          <div key={c.key} className="embed-block">
            <label htmlFor={"code-" + c.key}>{c.label}</label>
            <textarea
              id={"code-" + c.key}
              readOnly
              value={c.code}
              rows={c.key === "link" ? 1 : 3}
            />
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(c.code)
                  .then(() => setCopied(c.key))
                  .catch(() => setCopied(""))
              }
            >
              {x.copy}
              <span className="sr-only"> : {c.label}</span>
            </button>
            {copied === c.key && <span role="status">{x.copied}</span>}
          </div>
        ))}
      </section>
      <section aria-labelledby="share-questions">
        <h3 id="share-questions">{x.questions}</h3>
        <Questions
          fields={form.fields}
          locale={locale}
          answers={answers}
          setAnswers={setAnswers}
        />
      </section>
    </Modal>
  );
}
/** Help text, confidentiality, multiple-choice limit and profile mapping of a question. */
function FieldEditorExtras({
  locale,
  field: f,
  index: i,
  update,
}: {
  locale: Locale;
  field: Field;
  index: number;
  update: (f: Field) => void;
}) {
  const x = fieldExtras[locale];
  return (
    <div className="field-extras">
      <FieldLabel id={"help-fr-" + i} label={x.helpFr}>
        <input
          id={"help-fr-" + i}
          maxLength={500}
          value={f.help?.fr ?? ""}
          onChange={(e) =>
            update({
              ...f,
              help:
                e.target.value || f.help?.nl
                  ? { fr: e.target.value, nl: f.help?.nl ?? "", en: f.help?.en }
                  : undefined,
            })
          }
        />
      </FieldLabel>
      <FieldLabel id={"help-nl-" + i} label={x.helpNl}>
        <input
          id={"help-nl-" + i}
          maxLength={500}
          value={f.help?.nl ?? ""}
          onChange={(e) =>
            update({
              ...f,
              help:
                e.target.value || f.help?.fr
                  ? { fr: f.help?.fr ?? "", nl: e.target.value, en: f.help?.en }
                  : undefined,
            })
          }
        />
      </FieldLabel>
      {f.type === "multi" && (
        <FieldLabel id={"max-" + i} label={x.max}>
          <input
            id={"max-" + i}
            type="number"
            min={1}
            max={20}
            value={f.max ?? ""}
            onChange={(e) =>
              update({
                ...f,
                max: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </FieldLabel>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!!f.confidential}
          onChange={(e) => update({ ...f, confidential: e.target.checked })}
        />
        {x.confidential}
      </label>
      <FieldLabel id={"maps-" + i} label={x.maps}>
        <select
          id={"maps-" + i}
          value={f.maps ?? ""}
          onChange={(e) =>
            update({
              ...f,
              maps: (e.target.value || undefined) as Field["maps"],
            })
          }
        >
          <option value="">{x.noMap}</option>
          {mappings.map((m) => (
            <option key={m} value={m}>
              {x.mapLabels[m]}
            </option>
          ))}
        </select>
      </FieldLabel>
    </div>
  );
}
function FormEditor({
  locale,
  form,
  template,
  seasons,
  save,
  busy,
}: {
  locale: Locale;
  form?: Form;
  template?: Pick<Form, "title" | "description" | "capacity" | "fields">;
  seasons: { id: string; name: string }[];
  save: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const t = registrationCopy[locale];
  const [fields, setFields] = useState<Field[]>(
      form?.fields ?? template?.fields ?? [],
    ),
    [preview, setPreview] = useState(false),
    [mobile, setMobile] = useState(false),
    [answers, setAnswers] = useState<Answers>({});
  return (
    <Panel title={form?.title ?? t.newForm}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void save({
            action: "form",
            id: form?.id,
            expectedVersion: form?.version,
            seasonId: d.get("season"),
            title: d.get("title"),
            description: d.get("description"),
            capacity: d.get("capacity") ? Number(d.get("capacity")) : null,
            published: d.has("published"),
            fields,
          });
        }}
      >
        <FieldLabel id="form-season" label={t.season}>
          <select
            id="form-season"
            name="season"
            required
            disabled={!!form}
            defaultValue={form?.season_id}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {form && <input type="hidden" name="season" value={form.season_id} />}
        </FieldLabel>
        <FieldLabel id="form-title" label={t.formTitle}>
          <input
            id="form-title"
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={form?.title ?? template?.title}
          />
        </FieldLabel>
        <FieldLabel id="form-description" label={t.description}>
          <textarea
            id="form-description"
            name="description"
            maxLength={2000}
            defaultValue={form?.description ?? template?.description}
          />
        </FieldLabel>
        <FieldLabel id="form-capacity" label={t.capacity}>
          <input
            id="form-capacity"
            name="capacity"
            type="number"
            min={1}
            max={10000}
            defaultValue={form?.capacity ?? template?.capacity ?? ""}
          />
        </FieldLabel>
        <label className="check">
          <input
            type="checkbox"
            name="published"
            defaultChecked={form?.published}
          />
          {t.published}
        </label>
        {fields.map((f, i) => (
          <fieldset key={f.key}>
            <legend>
              {t.field} {i + 1}
            </legend>
            <FieldLabel id={"label-fr-" + i} label={t.labelFr}>
              <input
                id={"label-fr-" + i}
                value={f.label.fr}
                required
                minLength={2}
                maxLength={160}
                onChange={(e) =>
                  setFields(
                    fields.map((v, n) =>
                      n === i
                        ? { ...v, label: { ...v.label, fr: e.target.value } }
                        : v,
                    ),
                  )
                }
              />
            </FieldLabel>
            <FieldLabel id={"label-nl-" + i} label={t.labelNl}>
              <input
                id={"label-nl-" + i}
                value={f.label.nl}
                required
                minLength={2}
                maxLength={160}
                onChange={(e) =>
                  setFields(
                    fields.map((v, n) =>
                      n === i
                        ? { ...v, label: { ...v.label, nl: e.target.value } }
                        : v,
                    ),
                  )
                }
              />
            </FieldLabel>
            <FieldLabel
              id={"label-en-" + i}
              label={
                locale === "en"
                  ? "English label (optional)"
                  : locale === "fr"
                    ? "Libellé anglais (facultatif)"
                    : "Engels label (optioneel)"
              }
            >
              <input
                id={"label-en-" + i}
                value={f.label.en ?? ""}
                minLength={2}
                maxLength={160}
                onChange={(e) =>
                  setFields(
                    fields.map((v, n) =>
                      n === i
                        ? { ...v, label: { ...v.label, en: e.target.value } }
                        : v,
                    ),
                  )
                }
              />
            </FieldLabel>
            <FieldLabel id={"type-" + i} label={t.type}>
              <select
                id={"type-" + i}
                value={f.type}
                onChange={(e) =>
                  setFields(
                    fields.map((v, n) =>
                      n === i
                        ? { ...v, type: e.target.value as Field["type"] }
                        : v,
                    ),
                  )
                }
              >
                {Object.entries(typeLabels[locale]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <label className="check">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) =>
                  setFields(
                    fields.map((v, n) =>
                      n === i ? { ...v, required: e.target.checked } : v,
                    ),
                  )
                }
              />
              {t.required}
            </label>
            <FieldEditorExtras
              locale={locale}
              field={f}
              index={i}
              update={(next) =>
                setFields(fields.map((v, n) => (n === i ? next : v)))
              }
            />
            {(f.type === "choice" || f.type === "multi") && (
              <FieldLabel id={"options-" + i} label={t.options}>
                <textarea
                  id={"options-" + i}
                  value={f.options.join("\n")}
                  onChange={(e) =>
                    setFields(
                      fields.map((v, n) =>
                        n === i
                          ? { ...v, options: e.target.value.split("\n") }
                          : v,
                      ),
                    )
                  }
                />
              </FieldLabel>
            )}
            <FieldLabel id={"condition-" + i} label={t.condition}>
              <select
                id={"condition-" + i}
                value={f.condition?.key ?? ""}
                onChange={(e) =>
                  setFields(
                    fields.map((v, n) =>
                      n === i
                        ? {
                            ...v,
                            condition: e.target.value
                              ? { key: e.target.value, equals: "" }
                              : undefined,
                          }
                        : v,
                    ),
                  )
                }
              >
                <option value="">{t.noCondition}</option>
                {fields
                  .slice(0, i)
                  .filter(
                    (v) =>
                      v.type === "choice" ||
                      v.type === "multi" ||
                      v.type === "text",
                  )
                  .map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label[locale] || v.label.fr}
                    </option>
                  ))}
              </select>
            </FieldLabel>
            {f.condition && (
              <FieldLabel id={"equals-" + i} label={t.conditionValue}>
                <input
                  id={"equals-" + i}
                  maxLength={100}
                  value={f.condition.equals}
                  onChange={(e) =>
                    setFields(
                      fields.map((v, n) =>
                        n === i
                          ? {
                              ...v,
                              condition: {
                                key: v.condition!.key,
                                equals: e.target.value,
                              },
                            }
                          : v,
                      ),
                    )
                  }
                />
              </FieldLabel>
            )}
            <Button
              type="button"
              onClick={() =>
                setFields(
                  fields
                    .filter((_, n) => n !== i)
                    .map((v) =>
                      v.condition?.key === f.key
                        ? { ...v, condition: undefined }
                        : v,
                    ),
                )
              }
            >
              {t.remove}
            </Button>
          </fieldset>
        ))}
        <div className="actions">
          <Button
            type="button"
            disabled={fields.length >= 20}
            onClick={() =>
              setFields([
                ...fields,
                {
                  key: "q" + Date.now(),
                  type: "text",
                  label: { fr: "", nl: "" },
                  required: false,
                  options: [],
                  confidential: false,
                },
              ])
            }
          >
            {t.add}
          </Button>
          <Button disabled={busy || !seasons.length}>{t.save}</Button>
          <Button type="button" onClick={() => setPreview(!preview)}>
            {t.preview}
          </Button>
        </div>
      </form>
      {preview && (
        <section
          className={
            mobile ? "registration-preview mobile" : "registration-preview"
          }
        >
          <h3>{t.preview}</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={mobile}
              onChange={(e) => setMobile(e.target.checked)}
            />
            {t.mobile}
          </label>
          <Questions
            locale={locale}
            fields={fields}
            answers={answers}
            setAnswers={setAnswers}
          />
        </section>
      )}
    </Panel>
  );
}
export function Registrations({
  locale,
  mode = "admin",
  formId,
  guest,
}: {
  locale: Locale;
  mode?: "admin" | "mine" | "public";
  formId?: string;
  /** Personal link received by email (registration without a password). */
  guest?: string;
}) {
  // A guest works on the public page: applicant panels are shown there.
  const applicant = mode === "mine" || (!!guest && mode === "public");
  const guestHeaders: Record<string, string> = guest
    ? { "x-guest-token": guest }
    : {};
  const t = registrationCopy[locale],
    sl = statusLabels[locale];
  const [data, setData] = useState<View | null>(null),
    [publicData, setPublic] = useState<Form | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState(""),
    [editing, setEditing] = useState("new"),
    [sharing, setSharing] = useState(""),
    [filter, setFilter] = useState("pending"),
    [answerDraft, setAnswerDraft] = useState<{
      key: string;
      values: Answers;
    }>({ key: "", values: {} });
  const router = useRouter();
  const [recentSince] = useState(() => Date.now() - 14 * 86400000);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const formatDay = (d: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
  const errorText = useCallback(
    (code: string) =>
      registrationErrors[code]?.[
        locale === "en" ? 2 : locale === "fr" ? 0 : 1
      ] ??
      (locale === "en"
        ? "Service unavailable. Refresh and try again."
        : locale === "fr"
          ? "Service indisponible. Actualisez puis réessayez."
          : "Dienst niet beschikbaar. Vernieuw en probeer opnieuw."),
    [locale],
  );
  const load = useCallback(async () => {
    if (mode === "public") {
      const r = await fetch("/api/registrations/public/" + formId, {
          cache: "no-store",
        }),
        body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setPublic(body);
      const own = await fetch("/api/registrations", {
        cache: "no-store",
        headers: guestHeaders,
      });
      if (own.ok) setData(await own.json());
      return;
    }
    const r = await fetch(
        "/api/registrations" + (mode === "admin" ? "?mode=admin" : ""),
        { cache: "no-store" },
      ),
      body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setData(body);
    // guestHeaders only depends on guest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, formId, guest]);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(load)
      .catch((e) => {
        if (!cancelled) setError(errorText(e.message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, errorText]);
  const application =
    data?.applications.find((a) => a.id === selected) ??
    (applicant ? data?.applications[0] : undefined);
  const answerKey = application
    ? application.id + ":" + application.version
    : "preview";
  const answers =
    answerDraft.key === answerKey
      ? answerDraft.values
      : (application?.answers ?? {});
  function setAnswers(values: Answers) {
    setAnswerDraft({ key: answerKey, values });
  }
  async function task(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
      setMessage(t.saved);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  async function send(body: Record<string, unknown>) {
    const r = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...guestHeaders },
        body: JSON.stringify({
          ...body,
          organizationId: data?.context?.organization_id,
        }),
      }),
      value = await r.json();
    if (!r.ok) throw new Error(value.error);
    return value as { id: string };
  }
  return (
    <>
      <main id="main" className="access registrations">
        {mode === "admin" && data?.context ? (
          <PageHeader
            title={t.title}
            subtitle={data.context.organization_name}
            actions={
              <>
                <button type="button" className="button secondary" onClick={() => setEditing("tigerstorm")}>
                  {registrationExtras[locale].tigerstorm}
                </button>
                <Button onClick={() => setEditing("new")}>{t.newForm}</Button>
              </>
            }
          />
        ) : (
          <h1>{mode === "mine" ? t.mine : t.title}</h1>
        )}
        <div role="status">{loading ? t.loading : message}</div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {!loading && !data && mode !== "public" && (
          <Link href={"/" + locale + "/access"}>{t.access}</Link>
        )}
        {mode === "public" && publicData && (
          <Panel title={publicData.title}>
            <div className="club-banner">
              {publicData.logo_version && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="club-banner-logo"
                  src={`/api/club/logo?form=${publicData.id}&v=${publicData.logo_version}`}
                  alt={publicData.organization_name ?? ""}
                />
              )}
              <p>
                {publicData.organization_name} · {publicData.season_name}
              </p>
            </div>
            <p className="message-text">{publicData.description}</p>
            <p>{t.account}</p>
            {!data ? (
              <GuestLink locale={locale} formId={formId ?? ""} />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void task(async () => {
                    const result = await send({
                      action: "draft",
                      formId,
                      subjectName: d.get("name"),
                      subjectKind: d.has("self") ? "self" : "represented",
                      birthDate: d.get("birth"),
                      locale,
                      answers: {},
                      priorId: d.get("prior") || undefined,
                      website: d.get("website") ?? "",
                    });
                    setSelected(result.id);
                    if (!guest)
                      router.push("/" + locale + "/registrations/mine");
                  });
                }}
              >
                <label className="check">
                  <input type="checkbox" name="self" />
                  {t.self}
                </label>
                <FieldLabel id="candidate-name" label={t.name}>
                  <input
                    id="candidate-name"
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </FieldLabel>
                <FieldLabel id="candidate-birth" label={t.birth}>
                  <input
                    id="candidate-birth"
                    name="birth"
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </FieldLabel>
                <FieldLabel id="prior" label={t.renew}>
                  <select
                    id="prior"
                    name="prior"
                    onChange={(e) => {
                      const prior = data.applications.find(
                        (a) => a.id === e.target.value,
                      );
                      if (prior) {
                        const form = e.target.form!;
                        (
                          form.elements.namedItem("self") as HTMLInputElement
                        ).checked = prior.subject_kind === "self";
                        (
                          form.elements.namedItem("name") as HTMLInputElement
                        ).value = prior.subject_name;
                        (
                          form.elements.namedItem("birth") as HTMLInputElement
                        ).value = prior.birth_date;
                      }
                    }}
                  >
                    <option value="">{t.none}</option>
                    {data.applications
                      .filter((a) => a.status === "accepted")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.subject_name} · {a.form_snapshot.title}
                        </option>
                      ))}
                  </select>
                </FieldLabel>
                <p className="muted">{t.renewHint}</p>
                <label className="check">
                  <input type="checkbox" required />
                  {t.confirmCoordinates}
                </label>
                <div className="honeypot" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
                <Button disabled={busy}>{t.create}</Button>
              </form>
            )}
            <details>
              <summary>{t.preview}</summary>
              <Questions
                fields={publicData.fields}
                locale={locale}
                answers={answers}
                setAnswers={setAnswers}
              />
            </details>
          </Panel>
        )}
        {mode === "admin" && data?.context && (
          <>
            {editing === "tigerstorm" && (
              <p className="notice">{registrationExtras[locale].tigerstormHint}</p>
            )}
            <Card title={t.forms} id="reg-forms">
              {!data.seasons?.length && <p>{t.closed}</p>}
              {data.forms?.length ? (
                <div className="table-scroll">
                  <table className="compact-table">
                    <tbody>
                      {data.forms.map((f) => (
                        <tr key={f.id}>
                          <th scope="row">
                            <button type="button" className="text-button form-open" onClick={() => setSharing(f.id)}>
                              {f.title}
                            </button>
                          </th>
                          <td>
                            <Badge tone={f.published ? "success" : "neutral"} dot>
                              {f.published
                                ? t.formOpen
                                : locale === "en"
                                  ? "Closed"
                                  : locale === "fr"
                                    ? "Fermé"
                                    : "Gesloten"}
                            </Badge>
                          </td>
                          <td className="muted">v{f.version}</td>
                          <td className="row-actions">
                            <button type="button" className="text-button" onClick={() => setEditing(f.id)}>{t.edit}</button>
                            <button type="button" className="text-button" onClick={() => setEditing("clone:" + f.id)}>{t.clone}</button>
                            {f.published && (
                              <>
                                <button type="button" className="text-button" onClick={() => setSharing(f.id)}>
                                  {registrationExtras[locale].share}
                                </button>
                                <Link href={"/" + locale + "/inscription/" + f.id}>{t.public}</Link>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title={t.empty} />
              )}
            </Card>
            {sharing && data.forms?.some((f) => f.id === sharing) && (
              <ShareDialog
                locale={locale}
                form={data.forms.find((f) => f.id === sharing)!}
                close={() => setSharing("")}
              />
            )}
            <FormEditor
              key={
                editing +
                "-" +
                (data.forms?.find((f) => f.id === editing)?.version ?? 0)
              }
              locale={locale}
              form={data.forms?.find((f) => f.id === editing)}
              template={
                editing === "tigerstorm"
                  ? tigerstormTemplate(locale)
                  : data.forms?.find((f) => "clone:" + f.id === editing)
              }
              seasons={data.seasons ?? []}
              busy={busy}
              save={(body) =>
                task(async () => {
                  const result = await send(body);
                  setEditing(result.id);
                })
              }
            />
          </>
        )}
        {data && (mode !== "public" || applicant) && (
          <Card title={mode === "admin" ? t.review : t.mine} subtitle={t.limits} id="reg-apps">
            {mode === "admin" && (
              <Toolbar>
                <div className="toolbar-field">
                  <label htmlFor="registration-filter">{t.filter}</label>
                  <select
                    id="registration-filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="pending">{t.pending}</option>
                    <option value="recent">{t.recent}</option>
                    <option value="waiting">{sl.waiting}</option>
                    <option value="refused">{sl.refused}</option>
                    <option value="all">{t.all}</option>
                  </select>
                </div>
              </Toolbar>
            )}
            <ul className="records compact-records">
              {data.applications
                .filter(
                  (a) =>
                    mode !== "admin" ||
                    filter === "all" ||
                    (filter === "pending"
                      ? ["submitted", "incomplete", "review"].includes(a.status)
                      : filter === "recent"
                        ? a.status === "accepted" &&
                          !!a.decided_at &&
                          new Date(a.decided_at).getTime() > recentSince
                        : a.status === filter),
                )
                .map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="record-row"
                      aria-pressed={selected === a.id}
                      aria-label={`${a.subject_name} · ${sl[a.status]}`}
                      onClick={() => setSelected(a.id)}
                    >
                      <strong>{a.subject_name}</strong>
                      <span className="muted">
                        {a.organization_name} · {a.form_snapshot.title}
                      </span>
                      <Badge tone={statusTone[a.status] ?? "neutral"} dot>
                        {sl[a.status]}
                      </Badge>
                    </button>
                  </li>
                ))}
            </ul>
            {!data.applications.length && <EmptyState title={t.empty} />}
          </Card>
        )}
        {application && (mode !== "public" || applicant) && (
          <Panel title={application.subject_name}>
            <h3>{registrationExtras[locale].summary}</h3>
            <dl className="facts application-summary">
              <dt>{registrationExtras[locale].subject}</dt>
              <dd>{application.subject_name}</dd>
              <dt>{registrationExtras[locale].born}</dt>
              <dd>
                {formatDay(application.birth_date)} ·{" "}
                {ageOn(application.birth_date, today)}{" "}
                {registrationExtras[locale].years}
              </dd>
              <dt>{registrationExtras[locale].status}</dt>
              <dd>{sl[application.status]}</dd>
              <dt>{registrationExtras[locale].form}</dt>
              <dd>{application.form_snapshot.title}</dd>
              <dt>{registrationExtras[locale].kind}</dt>
              <dd>
                {application.subject_kind === "self" ? t.self : t.represented}
              </dd>
              {application.submitted_at && (
                <>
                  <dt>{registrationExtras[locale].submitted}</dt>
                  <dd>{formatDay(application.submitted_at)}</dd>
                </>
              )}
              {mode === "admin" && (
                <>
                  <dt>{registrationExtras[locale].applicant}</dt>
                  <dd>
                    {application.applicant_name} ·{" "}
                    <a href={"mailto:" + application.applicant_email}>
                      {application.applicant_email}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <h3>{t.answers}</h3>
            {applicant ? (
              <>
                <p>{t.draftHint}</p>
                <form
                  key={application.id + ":" + application.version}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void task(async () => {
                      await send({
                        action: "save",
                        subjectName: d.get("subjectName"),
                        birthDate: d.get("birthDate"),
                        subjectKind: d.has("self") ? "self" : "represented",
                        id: application.id,
                        expectedVersion: application.version,
                        answers,
                      });
                    });
                  }}
                >
                  <FieldLabel id="edit-subject-name" label={t.name}>
                    <input
                      id="edit-subject-name"
                      name="subjectName"
                      defaultValue={application.subject_name}
                      required
                      minLength={2}
                      maxLength={120}
                      readOnly={
                        !["draft", "incomplete"].includes(application.status)
                      }
                    />
                  </FieldLabel>
                  <FieldLabel id="edit-subject-birth" label={t.birth}>
                    <input
                      id="edit-subject-birth"
                      name="birthDate"
                      type="date"
                      defaultValue={application.birth_date}
                      required
                      readOnly={
                        !["draft", "incomplete"].includes(application.status)
                      }
                    />
                  </FieldLabel>
                  <label className="check">
                    <input
                      type="checkbox"
                      name="self"
                      defaultChecked={application.subject_kind === "self"}
                      disabled={
                        !["draft", "incomplete"].includes(application.status)
                      }
                    />
                    {t.self}
                  </label>
                  <Questions
                    locale={locale}
                    fields={application.form_snapshot.fields}
                    answers={answers}
                    setAnswers={setAnswers}
                    disabled={
                      !["draft", "incomplete"].includes(application.status)
                    }
                  />
                  {["draft", "incomplete"].includes(application.status) && (
                    <Button disabled={busy}>{t.save}</Button>
                  )}
                </form>
              </>
            ) : (
              <dl className="answer-list">
                {application.form_snapshot.fields
                  .filter((f) => fieldVisible(f, application.answers))
                  .map((f) => {
                    const value = application.answers[f.key];
                    const files = application.attachments.filter(
                      (a) => a.field_key === f.key,
                    );
                    const empty =
                      f.type === "file"
                        ? !files.length
                        : value === undefined ||
                          value === "" ||
                          (Array.isArray(value) && !value.length);
                    return (
                      <div key={f.key} data-empty={empty || undefined}>
                        <dt>
                          {f.label[locale] || f.label.fr}
                          {f.confidential && (
                            <Badge tone="warning">
                              {fieldExtras[locale].confidentialTag}
                            </Badge>
                          )}
                        </dt>
                        <dd>
                          {f.type === "file"
                            ? files.length
                              ? `${registrationExtras[locale].fileGiven} : ${files.map((a) => a.filename).join(", ")}`
                              : registrationExtras[locale].fileMissing
                            : typeof value === "boolean"
                              ? value
                                ? t.yes
                                : t.no
                              : empty
                                ? f.confidential &&
                                  application.confidential_hidden
                                  ? fieldExtras[locale].hidden
                                  : registrationExtras[locale].empty
                                : Array.isArray(value)
                                  ? value.join(", ")
                                  : String(value)}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
            )}
            <h3>{t.attachments}</h3>
            <p>{t.fileHint}</p>
            <ul>
              {application.attachments.map((f) => (
                <li key={f.id}>
                  <a
                    href={
                      "/api/registrations/file/" +
                      f.id +
                      (mode === "admin"
                        ? "?organizationId=" + application.organization_id
                        : guest
                          ? "?guest=" + encodeURIComponent(guest)
                          : "")
                    }
                  >
                    {f.filename}
                  </a>
                </li>
              ))}
            </ul>
            {!application.attachments.length && <p>{t.noFiles}</p>}
            {applicant &&
              ["draft", "incomplete"].includes(application.status) &&
              application.form_snapshot.fields
                .filter(
                  (f) =>
                    f.type === "file" && fieldVisible(f, application.answers),
                )
                .map((f) => (
                  <form
                    key={f.key}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      d.set("key", f.key);
                      d.set("version", String(application.version));
                      void task(async () => {
                        const r = await fetch(
                          "/api/registrations/file/" + application.id,
                          { method: "POST", body: d, headers: guestHeaders },
                        );
                        if (!r.ok) throw new Error((await r.json()).error);
                      });
                    }}
                  >
                    <FieldLabel
                      id={"file-" + f.key}
                      label={f.label[locale] || f.label.fr}
                    >
                      <input
                        id={"file-" + f.key}
                        name="file"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        required
                      />
                    </FieldLabel>
                    <Button disabled={busy}>{t.upload}</Button>
                  </form>
                ))}
            {applicant && (
              <div className="actions">
                {["draft", "incomplete"].includes(application.status) && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        await send({
                          action: "submit",
                          id: application.id,
                          expectedVersion: application.version,
                        });
                      })
                    }
                  >
                    {t.submit}
                  </Button>
                )}
                {[
                  "draft",
                  "submitted",
                  "incomplete",
                  "review",
                  "waiting",
                ].includes(application.status) && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        await send({
                          action: "withdraw",
                          id: application.id,
                          expectedVersion: application.version,
                        });
                      })
                    }
                  >
                    {t.withdraw}
                  </Button>
                )}
              </div>
            )}
            {mode === "admin" && (
              <>
                <p>{t.matchHint}</p>
                {["submitted", "incomplete", "review", "waiting"].includes(
                  application.status,
                ) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void task(async () => {
                        await send({
                          action: "decision",
                          id: application.id,
                          expectedVersion: application.version,
                          status: d.get("status"),
                          message: d.get("message"),
                          profileId: d.get("profile") || undefined,
                          teamId: d.get("team") || undefined,
                          confirmDuplicate: d.has("confirm"),
                        });
                      });
                    }}
                  >
                    <FieldLabel id="decision-status" label={t.status}>
                      <select
                        id="decision-status"
                        name="status"
                        defaultValue="review"
                      >
                        {(
                          [
                            "review",
                            "incomplete",
                            "waiting",
                            "accepted",
                            "refused",
                          ] as const
                        ).map((v) => (
                          <option key={v} value={v}>
                            {sl[v]}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel id="decision-message" label={t.message}>
                      <textarea
                        id="decision-message"
                        name="message"
                        maxLength={3000}
                      />
                    </FieldLabel>
                    <FieldLabel id="decision-profile" label={t.profile}>
                      <select id="decision-profile" name="profile">
                        <option value="">{t.newProfile}</option>
                        {data?.profiles?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name} · {p.birth_date}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                    <label className="check">
                      <input type="checkbox" name="confirm" />
                      {t.confirm}
                    </label>
                    <FieldLabel id="decision-team" label={t.team}>
                      <select id="decision-team" name="team">
                        <option value="">{t.noTeam}</option>
                        {data?.teams
                          ?.filter(
                            (team) => team.season_id === application.season_id,
                          )
                          .map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                      </select>
                    </FieldLabel>
                    <Button disabled={busy}>{t.decide}</Button>
                  </form>
                )}
                <h3>{t.notes}</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const d = new FormData(form);
                    void task(async () => {
                      await send({
                        action: "note",
                        id: application.id,
                        message: d.get("note"),
                      });
                      form.reset();
                    });
                  }}
                >
                  <FieldLabel id="internal-note" label={t.note}>
                    <textarea
                      id="internal-note"
                      name="note"
                      required
                      minLength={2}
                      maxLength={3000}
                    />
                  </FieldLabel>
                  <Button disabled={busy}>{t.addNote}</Button>
                </form>
              </>
            )}
            {application.status === "accepted" && (
              <p className="notice">{t.followup}</p>
            )}
            <h3>{t.history}</h3>
            <ol>
              {application.history.map((h) => (
                <li key={h.id}>
                  <strong>{sl[h.status]}</strong> ·{" "}
                  {new Intl.DateTimeFormat(
                    locale === "en"
                      ? "en-GB"
                      : locale === "fr"
                        ? "fr-BE"
                        : "nl-BE",
                    { dateStyle: "short", timeStyle: "short" },
                  ).format(new Date(h.created_at))}{" "}
                  · {t.by} {h.actor}
                  {h.internal && " · " + t.internal}
                  {h.message && <p>{h.message}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        )}
        <Button disabled={busy} onClick={() => void task(load)}>
          {t.refresh}
        </Button>
      </main>
    </>
  );
}
