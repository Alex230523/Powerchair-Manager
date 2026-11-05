"use client";
import { brusselsToday } from "./chair-sheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { Panel, Button, PageHeader, Card, Badge, Toolbar, type Tone, EmptyState, ExportButton } from "./ui";
import { exportCopy } from "./export-copy";
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
import { fillDues, platformTemplate } from "@/domains/registrations/templates";
import { moveField, removeField, restoreField } from "@/domains/registrations/editor";
import {
  DecisionButtons,
  FormsList,
  FullDialog,
  MessageDialog,
  NewFormDialog,
  PreviewDialog,
  SaveTemplateDialog,
  ShareDialog,
  TeamDialog,
  type ClubTemplate,
  type FormRow,
} from "./registration-forms";
import { fill, formsCopy } from "./registration-forms-copy";
import { Icon } from "./icons";
import { showToast, undoToast } from "./toast";
import { toastCopy } from "./toast-copy";
import { ageOn } from "@/domains/people/schema";
import { DataGrid } from "./data-grid";
import { eachRow } from "./table-state";
import { bulkCopy } from "./bulk-copy";
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
type Form = FormRow;
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
  templates?: ClubTemplate[];
  seasons?: { id: string; name: string }[];
  teams?: { id: string; name: string; season_id: string; capacity: number | null; players: number }[];
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
  // A « section » title opens a group of the questions that follow, which folds and unfolds.
  const groups: { section: Field | null; fields: Field[] }[] = [{ section: null, fields: [] }];
  for (const f of fields.filter((x) => fieldVisible(x, answers))) {
    if (f.type === "section") groups.push({ section: f, fields: [] });
    else groups[groups.length - 1].fields.push(f);
  }
  const render = (list: Field[]) =>
    list.map((f) => {
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
          // A consent is a box with its sentence, never a stretched field under a label (audit 23).
          if (f.type === "consent")
            return (
              <div key={f.key} className="consent-field">
                <label className="check" htmlFor={fid}>
                  <input id={fid} type="checkbox" checked={answers[f.key] === true} disabled={disabled} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.checked })} />
                  <span>{label}</span>
                </label>
                {notes}
              </div>
            );
          return (
            <FieldLabel key={f.key} id={fid} label={label}>
              {notes}
              {f.type === "choice" ? (
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
        });
  return (
    <>
      {groups.map((g, i) =>
        g.section ? (
          <details
            key={g.section.key}
            className="form-section"
            open
            // A required answer in a folded section: the section opens so it can be filled.
            onInvalidCapture={(e) => {
              e.currentTarget.open = true;
            }}
          >
            <summary>{g.section.label[locale] || g.section.label.fr}</summary>
            {g.section.help && <p className="field-help">{g.section.help[locale] || g.section.help.fr}</p>}
            <div className="form-section-body">{render(g.fields)}</div>
          </details>
        ) : (
          <Fragment key={"top-" + i}>{render(g.fields)}</Fragment>
        ),
      )}
    </>
  );
}
/** The public form as it will be seen, with answers that go nowhere. */
function FormPreview({ locale, form, close }: { locale: Locale; form: Form; close: () => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  return (
    <PreviewDialog locale={locale} form={form} close={close}>
      <Questions fields={form.fields} locale={locale} answers={answers} setAnswers={setAnswers} />
    </PreviewDialog>
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
  heading,
  notice,
  seasons,
  save,
  busy,
}: {
  locale: Locale;
  form?: Form;
  template?: Pick<Form, "title" | "description" | "capacity" | "fields">;
  heading: string;
  notice?: string;
  seasons: { id: string; name: string }[];
  save: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const t = registrationCopy[locale],
    q = formsCopy[locale];
  const [fields, setFields] = useState<Field[]>(form?.fields ?? template?.fields ?? []),
    [preview, setPreview] = useState(false),
    [mobile, setMobile] = useState(false),
    [answers, setAnswers] = useState<Answers>({}),
    [dragging, setDragging] = useState<number | null>(null),
    [moved, setMoved] = useState(""),
    // 1: the questions folded by the editor (their title stays visible).
    [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setFolded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const list = useRef<HTMLDivElement>(null);
  const change = (i: number, next: Field) => setFields((cur) => cur.map((v, n) => (n === i ? next : v)));
  /** Moves a question and keeps the focus on the control that moved it. */
  function move(from: number, to: number, focus?: string) {
    if (to < 0 || to >= fields.length || from === to) return;
    const key = fields[from].key;
    setFields((cur) => moveField(cur, from, to));
    setMoved(fill(q.moved, { n: to + 1 }));
    if (focus) requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-key="${key}"] [data-focus="${focus}"]`)?.focus());
  }
  function remove(i: number) {
    const { removed } = removeField(fields, i);
    setFields((cur) => removeField(cur, cur.findIndex((f) => f.key === removed.field.key)).fields);
    // Removing a question can be undone for a few seconds (C10); nothing is saved before « Enregistrer ».
    showToast({
      message: q.questionRemoved,
      icon: "trash",
      action: {
        label: toastCopy[locale].undo,
        run: async () => {
          setFields((cur) => restoreField(cur, removed));
          showToast({ message: toastCopy[locale].undone, icon: "back" });
        },
      },
    });
    // The focus goes to the next question's bin, or to « Ajouter une question » when none is left.
    requestAnimationFrame(() => {
      const bins = list.current?.querySelectorAll<HTMLElement>(".question-remove");
      (bins?.[Math.min(i, bins.length - 1)] ?? list.current?.parentElement?.querySelector<HTMLElement>(".actions button"))?.focus();
    });
  }
  const label = (f: Field) => f.label[locale] || f.label.fr || q.untitled;
  return (
    <Panel title={heading}>
      {notice && <p className="notice">{notice}</p>}
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
            fields,
          });
        }}
      >
        <FieldLabel id="form-season" label={t.season}>
          <select id="form-season" name="season" required disabled={!!form} defaultValue={form?.season_id}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {form && <input type="hidden" name="season" value={form.season_id} />}
        </FieldLabel>
        <FieldLabel id="form-title" label={t.formTitle}>
          <input id="form-title" name="title" required minLength={2} maxLength={120} defaultValue={form?.title ?? template?.title} />
        </FieldLabel>
        <FieldLabel id="form-description" label={t.description}>
          <textarea id="form-description" name="description" maxLength={2000} defaultValue={form?.description ?? template?.description} />
        </FieldLabel>
        <FieldLabel id="form-capacity" label={t.capacity}>
          <input id="form-capacity" name="capacity" type="number" min={1} max={10000} defaultValue={form?.capacity ?? template?.capacity ?? ""} />
        </FieldLabel>
        {fields.length > 1 && (
          <p className="question-fold-all">
            <button type="button" className="text-button" onClick={() => setFolded(folded.size ? new Set() : new Set(fields.map((f) => f.key)))}>
              {folded.size ? q.unfoldAll : q.foldAll}
            </button>
          </p>
        )}
        <div
          className="question-list"
          ref={list}
          onInvalidCapture={(e) => {
            // A required field of a folded question: the question opens so it can be filled.
            const key = (e.target as HTMLElement).closest("[data-key]")?.getAttribute("data-key");
            if (key && folded.has(key)) toggle(key);
          }}
        >
          {fields.map((f, i) => (
            <fieldset
              key={f.key}
              data-key={f.key}
              className={`question-card ${dragging === i ? "dragging" : ""}`.trim()}
              draggable={dragging === i}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", f.key);
              }}
              onDragOver={(e) => {
                if (dragging !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) move(dragging, i);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
            >
              <legend>
                {fill(q.question, { n: i + 1 })}
                <span className="question-title"> · {fillDues(label(f), null) || q.untitled}</span>
              </legend>
              <div className="question-tools">
                <button
                  type="button"
                  className="icon-button sm"
                  aria-expanded={!folded.has(f.key)}
                  aria-controls={"question-body-" + f.key}
                  aria-label={fill(folded.has(f.key) ? q.unfold : q.fold, { n: i + 1, label: fillDues(label(f), null) || q.untitled })}
                  title={fill(folded.has(f.key) ? q.unfold : q.fold, { n: i + 1, label: fillDues(label(f), null) || q.untitled })}
                  onClick={() => toggle(f.key)}
                >
                  <Icon name={folded.has(f.key) ? "chevronDown" : "chevronUp"} size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button sm question-grip"
                  data-focus="grip"
                  aria-label={fill(q.drag, { n: i + 1 })}
                  title={fill(q.drag, { n: i + 1 })}
                  onPointerDown={() => setDragging(i)}
                  onPointerUp={() => setDragging(null)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(i, e.key === "ArrowUp" ? i - 1 : i + 1, "grip");
                    }
                  }}
                >
                  <Icon name="grip" size={16} />
                </button>
                <button type="button" className="icon-button sm" data-focus="up" aria-label={fill(q.moveUp, { n: i + 1 })} title={fill(q.moveUp, { n: i + 1 })} disabled={i === 0} onClick={() => move(i, i - 1, "up")}>
                  <Icon name="arrowUp" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button sm"
                  data-focus="down"
                  aria-label={fill(q.moveDown, { n: i + 1 })}
                  title={fill(q.moveDown, { n: i + 1 })}
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, i + 1, "down")}
                >
                  <Icon name="arrowDown" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button sm question-remove"
                  aria-label={fill(q.removeQuestion, { n: i + 1, label: fillDues(label(f), null) })}
                  title={fill(q.removeQuestion, { n: i + 1, label: fillDues(label(f), null) })}
                  onClick={() => remove(i)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="question-body" id={"question-body-" + f.key} hidden={folded.has(f.key)}>
              <FieldLabel id={"label-fr-" + i} label={t.labelFr}>
                <input
                  id={"label-fr-" + i}
                  value={f.label.fr}
                  required
                  minLength={2}
                  maxLength={160}
                  onChange={(e) => change(i, { ...f, label: { ...f.label, fr: e.target.value } })}
                />
              </FieldLabel>
              <FieldLabel id={"label-nl-" + i} label={t.labelNl}>
                <input
                  id={"label-nl-" + i}
                  value={f.label.nl}
                  required
                  minLength={2}
                  maxLength={160}
                  onChange={(e) => change(i, { ...f, label: { ...f.label, nl: e.target.value } })}
                />
              </FieldLabel>
              <FieldLabel
                id={"label-en-" + i}
                label={locale === "en" ? "English label (optional)" : locale === "fr" ? "Libellé anglais (facultatif)" : "Engels label (optioneel)"}
              >
                <input
                  id={"label-en-" + i}
                  value={f.label.en ?? ""}
                  minLength={2}
                  maxLength={160}
                  onChange={(e) => change(i, { ...f, label: { ...f.label, en: e.target.value } })}
                />
              </FieldLabel>
              <FieldLabel id={"type-" + i} label={t.type}>
                <select id={"type-" + i} value={f.type} onChange={(e) => change(i, { ...f, type: e.target.value as Field["type"], ...(e.target.value === "section" ? { required: false } : {}) })}>
                  {Object.entries(typeLabels[locale]).map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              {/* A section title is never answered: no « required », no help on an answer, no profile field. */}
              {f.type !== "section" && (
                <>
                  <label className="check">
                    <input type="checkbox" checked={f.required} onChange={(e) => change(i, { ...f, required: e.target.checked })} />
                    {t.required}
                  </label>
                  <FieldEditorExtras locale={locale} field={f} index={i} update={(next) => change(i, next)} />
                </>
              )}
              {(f.type === "choice" || f.type === "multi") && (
                <FieldLabel id={"options-" + i} label={t.options}>
                  <textarea id={"options-" + i} value={f.options.join("\n")} onChange={(e) => change(i, { ...f, options: e.target.value.split("\n") })} />
                </FieldLabel>
              )}
              <FieldLabel id={"condition-" + i} label={t.condition}>
                <select
                  id={"condition-" + i}
                  value={f.condition?.key ?? ""}
                  onChange={(e) => change(i, { ...f, condition: e.target.value ? { key: e.target.value, equals: "" } : undefined })}
                >
                  <option value="">{t.noCondition}</option>
                  {fields
                    .slice(0, i)
                    .filter((v) => v.type === "choice" || v.type === "multi" || v.type === "text")
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
                    onChange={(e) => change(i, { ...f, condition: { key: f.condition!.key, equals: e.target.value } })}
                  />
                </FieldLabel>
              )}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="sr-only" role="status">
          {moved}
        </p>
        <div className="actions">
          <Button
            type="button"
            icon="plus"
            variant="secondary"
            disabled={fields.length >= 20}
            onClick={() =>
              setFields((cur) => [...cur, { key: "q" + Date.now(), type: "text", label: { fr: "", nl: "" }, required: false, options: [], confidential: false }])
            }
          >
            {t.add}
          </Button>
          <Button disabled={busy || !seasons.length}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={() => setPreview(!preview)}>
            {t.preview}
          </Button>
        </div>
      </form>
      {preview && (
        <section className={mobile ? "registration-preview mobile" : "registration-preview"}>
          <h3>{t.preview}</h3>
          <label className="check">
            <input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} />
            {t.mobile}
          </label>
          <Questions locale={locale} fields={fields} answers={answers} setAnswers={setAnswers} />
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
    // Wave 17 (F1): the form shown in the editor ("" = the first one), a new one, a reuse or a template.
    [editing, setEditing] = useState(""),
    [notice, setNotice] = useState(""),
    [sharing, setSharing] = useState(""),
    [previewing, setPreviewing] = useState(""),
    [templating, setTemplating] = useState(""),
    [creating, setCreating] = useState(false),
    [dialog, setDialog] = useState<
      | null
      | { kind: "team"; app: Application }
      | { kind: "full"; app: Application; teamId: string; team: string }
      | { kind: "refuse" | "complement"; app: Application }
    >(null),
    [admission, setAdmission] = useState({ app: "", profile: "", confirm: false, open: false }),
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
  const fc = formsCopy[locale];
  const org = data?.context?.organization_id;
  /** Several steps of the admin page: one at a time, the error said once. */
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  /**
   * Wave 17 (F1): a decision in one click, undone for a few seconds; the
   * email and the invitation leave after that delay. A full team, a file
   * that already exists: the next step is asked instead.
   */
  async function decide(a: Application, status: "accepted" | "refused" | "waiting" | "incomplete", extra: { teamId?: string; message?: string; overCapacity?: boolean } = {}) {
    setBusy(true);
    setError("");
    setMessage("");
    const own = admission.app === a.id;
    try {
      const r = (await send({
        action: "decision",
        id: a.id,
        expectedVersion: a.version,
        status,
        message: extra.message ?? "",
        teamId: extra.teamId || undefined,
        acceptOverCapacity: !!extra.overCapacity,
        confirmDuplicate: own && admission.confirm,
        profileId: (own && admission.profile) || undefined,
      })) as { id: string; undo?: string };
      setDialog(null);
      await load();
      const done = { accepted: fc.accepted, refused: fc.refused, waiting: fc.waited, incomplete: fc.completed }[status];
      undoToast(locale, done, r.undo, org, load, status === "accepted" ? "check" : status === "refused" ? "close" : "clock");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "TEAM_FULL" && extra.teamId) {
        setDialog({ kind: "full", app: a, teamId: extra.teamId, team: data?.teams?.find((x) => x.id === extra.teamId)?.name ?? "" });
        return;
      }
      setDialog(null);
      if (["MATCH_EXISTING", "CONFIRM_IDENTITY", "IDENTITY_MISMATCH"].includes(code)) {
        setSelected(a.id);
        setAdmission((v) => ({ ...(v.app === a.id ? v : { profile: "", confirm: false }), app: a.id, open: true }));
        setError(fc.identity + " " + errorText(code));
        return;
      }
      setError(errorText(code));
    } finally {
      setBusy(false);
    }
  }
  const seasonTeams = (a: Application) => (data?.teams ?? []).filter((x) => x.season_id === a.season_id);
  function accept(a: Application) {
    const teams = seasonTeams(a);
    if (teams.length > 1) setDialog({ kind: "team", app: a });
    else void decide(a, "accepted", { teamId: teams[0]?.id });
  }
  const decisionButtons = (a: Application, labelled = false) => (
    <DecisionButtons
      locale={locale}
      name={a.subject_name}
      status={a.status}
      busy={busy}
      labelled={labelled}
      onAccept={() => accept(a)}
      onRefuse={() => setDialog({ kind: "refuse", app: a })}
      onWaiting={() => void decide(a, "waiting")}
      onComplement={() => setDialog({ kind: "complement", app: a })}
    />
  );
  const b = bulkCopy[locale];
  const applications = (data?.applications ?? []).filter(
    (a) =>
      mode !== "admin" ||
      filter === "all" ||
      (filter === "pending"
        ? ["submitted", "incomplete", "review"].includes(a.status)
        : filter === "recent"
          ? a.status === "accepted" && !!a.decided_at && new Date(a.decided_at).getTime() > recentSince
          : a.status === filter),
  );
  // The editor: a form of the list, a reuse ("clone:"), a template ("platform:", "club:") or a blank one ("new").
  const forms = data?.forms ?? [];
  const chosen = editing || forms.find((f) => !f.archived)?.id || "new";
  const current = forms.find((f) => f.id === chosen);
  const source = chosen.startsWith("clone:") ? forms.find((f) => "clone:" + f.id === chosen) : undefined;
  const clubTemplate = chosen.startsWith("club:") ? data?.templates?.find((x) => "club:" + x.id === chosen) : undefined;
  const platformId = chosen.startsWith("platform:") ? (chosen.slice(9) as Parameters<typeof platformTemplate>[0]) : null;
  const template = source ?? (clubTemplate ? { ...clubTemplate, title: clubTemplate.name } : platformId ? platformTemplate(platformId, locale) : undefined);
  const heading = current ? fill(fc.editing, { form: current.title }) : source ? fill(fc.reusing, { form: source.title }) : template?.title ?? fc.newEditing;
  const editorKey = chosen + "-" + (current?.version ?? 0);
  return (
    <>
      <main id="main" className="access registrations">
        {mode === "admin" && data?.context ? (
          <PageHeader
            title={t.title}
            subtitle={data.context.organization_name}
            actions={
              <Button icon="plus" onClick={() => setCreating(true)}>
                {fc.newForm}
              </Button>
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
                    max={brusselsToday()}
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
            <Card title={fc.forms} id="reg-forms">
              {!data.seasons?.length && <p>{t.closed}</p>}
              {data.forms?.length ? (
                <FormsList
                  locale={locale}
                  forms={data.forms}
                  selected={current?.id ?? ""}
                  onSelect={(f) => {
                    setEditing(f.id);
                    setNotice("");
                  }}
                  onPreview={(f) => setPreviewing(f.id)}
                  onReuse={(f) => {
                    setEditing("clone:" + f.id);
                    setNotice("");
                    requestAnimationFrame(() => document.getElementById("form-title")?.focus());
                  }}
                  onShare={(f) => setSharing(f.id)}
                  onArchive={(f) =>
                    void act(async () => {
                      await send({ action: "archive", id: f.id, archived: !f.archived });
                      await load();
                      showToast({ message: f.archived ? fc.restoredDone : fc.archivedDone, icon: "archive" });
                    })
                  }
                  onSaveTemplate={(f) => setTemplating(f.id)}
                />
              ) : (
                <EmptyState title={fc.empty} />
              )}
            </Card>
            {creating && (
              <NewFormDialog
                locale={locale}
                templates={data.templates ?? []}
                close={() => setCreating(false)}
                remove={(tpl) =>
                  void act(async () => {
                    await send({ action: "deleteTemplate", id: tpl.id });
                    await load();
                    showToast({ message: fc.templateDeleted, icon: "trash" });
                  })
                }
                pick={(c) => {
                  setCreating(false);
                  if (c.kind === "scratch") {
                    setEditing("new");
                    setNotice("");
                  } else if (c.kind === "platform") {
                    setEditing("platform:" + c.id);
                    setNotice(fill(fc.fromTemplateNotice, { name: fc.templateNames[c.id] }));
                  } else {
                    setEditing("club:" + c.template.id);
                    setNotice(fill(fc.fromTemplateNotice, { name: c.template.name }));
                  }
                  requestAnimationFrame(() => document.getElementById("form-title")?.focus());
                }}
              />
            )}
            {previewing && data.forms?.some((f) => f.id === previewing) && (
              <FormPreview locale={locale} form={data.forms.find((f) => f.id === previewing)!} close={() => setPreviewing("")} />
            )}
            {templating && data.forms?.some((f) => f.id === templating) && (
              <SaveTemplateDialog
                locale={locale}
                form={data.forms.find((f) => f.id === templating)!}
                busy={busy}
                close={() => setTemplating("")}
                save={(name) =>
                  void act(async () => {
                    await send({ action: "saveTemplate", formId: templating, name });
                    setTemplating("");
                    await load();
                    showToast({ message: fc.templateSaved, icon: "check" });
                  })
                }
              />
            )}
            {sharing && data.forms?.some((f) => f.id === sharing) && (
              <ShareDialog
                locale={locale}
                form={data.forms.find((f) => f.id === sharing)!}
                club={data.context.organization_name}
                busy={busy}
                close={() => setSharing("")}
                save={(v) =>
                  act(async () => {
                    await send({ action: "publish", id: sharing, ...v });
                    await load();
                    showToast({ message: v.published ? fc.openSaved : fc.closeSaved, icon: "check" });
                  })
                }
              />
            )}
            <FormEditor
              key={editorKey}
              locale={locale}
              form={current}
              template={template}
              heading={heading}
              notice={notice}
              seasons={data.seasons ?? []}
              busy={busy}
              save={(body) =>
                task(async () => {
                  const result = await send(body);
                  if (!body.id) setNotice(fc.savedClosed);
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
                {/* Wave 17 (G2): the applications shown, with the answers to their forms (confidential ones only for those who may read them). */}
                <ExportButton
                  locale={locale}
                  organizationId={data.context?.organization_id ?? ""}
                  dataset="registrations"
                  subject={t.review}
                  rows={applications}
                  columns={[
                    { id: "person", label: b.person, value: (a) => a.subject_name },
                    { id: "birth", label: t.birth, type: "date", value: (a) => a.birth_date },
                    { id: "form", label: b.form, value: (a) => a.form_snapshot.title },
                    { id: "submitted", label: b.submitted, type: "date", value: (a) => a.submitted_at?.slice(0, 10) ?? null },
                    { id: "status", label: b.state, value: (a) => sl[a.status] },
                    { id: "applicant", label: exportCopy[locale].applicant, value: (a) => a.applicant_name },
                    { id: "email", label: exportCopy[locale].email, value: (a) => a.applicant_email },
                    ...[...new Map(applications.flatMap((a) => a.form_snapshot.fields.filter((f) => !["file", "signature", "section"].includes(f.type)).map((f) => [f.key, f] as const))).values()].slice(0, 30).map((f) => ({
                      id: "answer:" + f.key,
                      label: (f.label[locale] ?? f.label.fr).slice(0, 80),
                      type: (f.type === "date" ? "date" : "text") as "date" | "text",
                      value: (a: Application) => {
                        const v = a.answers[f.key];
                        return Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "✓" : "") : (v ?? null);
                      },
                    })),
                  ]}
                />
              </Toolbar>
            )}
            {mode === "admin" ? (
              <DataGrid
                locale={locale}
                label={t.review}
                storageKey="registrations"
                rows={applications}
                rowId={(a) => a.id}
                rowName={(a) => a.subject_name}
                onDone={() => load()}
                reasons={b.reasons}
                columns={[
                  {
                    key: "person",
                    header: b.person,
                    rowHeader: true,
                    hideable: false,
                    sort: (a) => a.subject_name,
                    cell: (a) => (
                      <button type="button" className="record-row" aria-pressed={selected === a.id} aria-label={`${a.subject_name} · ${sl[a.status]}`} onClick={() => setSelected(a.id)}>
                        <strong>{a.subject_name}</strong>
                      </button>
                    ),
                  },
                  { key: "form", header: b.form, sort: (a) => a.form_snapshot.title, cell: (a) => a.form_snapshot.title },
                  { key: "submitted", header: b.submitted, sort: (a) => a.submitted_at ?? "", cell: (a) => (a.submitted_at ? new Date(a.submitted_at).toLocaleDateString(locale === "en" ? "en-GB" : `${locale}-BE`) : "") },
                  {
                    key: "status",
                    header: b.state,
                    sort: (a) => sl[a.status],
                    cell: (a) => (
                      <Badge tone={statusTone[a.status] ?? "neutral"} dot>
                        {sl[a.status]}
                      </Badge>
                    ),
                  },
                  {
                    key: "decision",
                    header: fc.decision,
                    hideable: false,
                    cell: (a) => (["submitted", "incomplete", "review", "waiting"].includes(a.status) ? decisionButtons(a) : null),
                  },
                ]}
                actions={(["accepted", "refused"] as const).map((status) => ({
                  id: status,
                  label: status === "accepted" ? b.accept : b.refuse,
                  icon: status === "accepted" ? ("check" as const) : ("close" as const),
                  confirm: status === "accepted" ? b.acceptConfirm : b.refuseConfirm,
                  run: (rows: Application[]) =>
                    eachRow(rows, (a) => a.id, async (a) => {
                      await send({ action: "decision", id: a.id, expectedVersion: a.version, status, message: "", confirmDuplicate: false });
                    }),
                }))}
              />
            ) : (
              <ul className="records compact-records">
                {applications.map((a) => (
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
            )}
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
                  .filter((f) => f.type !== "section" && fieldVisible(f, application.answers))
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
                {["submitted", "incomplete", "review", "waiting", "refused"].includes(application.status) && (
                  <section className="decision-panel" aria-labelledby="decision-heading">
                    <h3 id="decision-heading">{application.status === "refused" ? fc.change : fc.decision}</h3>
                    {decisionButtons(application, true)}
                    <details
                      open={admission.app === application.id && admission.open}
                      onToggle={(e) => {
                        const open = e.currentTarget.open;
                        setAdmission((v) => (v.app === application.id ? { ...v, open } : { app: application.id, profile: "", confirm: false, open }));
                      }}
                    >
                      <summary>{fc.admission}</summary>
                      <p>{t.matchHint}</p>
                      <FieldLabel id="decision-profile" label={t.profile}>
                        <select
                          id="decision-profile"
                          value={admission.app === application.id ? admission.profile : ""}
                          onChange={(e) => {
                            const profile = e.target.value;
                            setAdmission((v) => ({ ...(v.app === application.id ? v : { confirm: false, open: true }), app: application.id, profile }));
                          }}
                        >
                          <option value="">{t.newProfile}</option>
                          {data?.profiles?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name} · {p.birth_date}
                            </option>
                          ))}
                        </select>
                      </FieldLabel>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={admission.app === application.id && admission.confirm}
                          onChange={(e) => {
                            const confirm = e.target.checked;
                            setAdmission((v) => ({ ...(v.app === application.id ? v : { profile: "", open: true }), app: application.id, confirm }));
                          }}
                        />
                        {t.confirm}
                      </label>
                    </details>
                    <p className="muted small">{fc.mailDelay}</p>
                  </section>
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
        {dialog?.kind === "team" && (
          <TeamDialog
            locale={locale}
            name={dialog.app.subject_name}
            teams={seasonTeams(dialog.app)}
            busy={busy}
            close={() => setDialog(null)}
            accept={(teamId) => void decide(dialog.app, "accepted", { teamId })}
          />
        )}
        {dialog?.kind === "full" && (
          <FullDialog
            locale={locale}
            team={dialog.team}
            busy={busy}
            close={() => setDialog(null)}
            anyway={() => void decide(dialog.app, "accepted", { teamId: dialog.teamId, overCapacity: true })}
            waiting={() => void decide(dialog.app, "waiting")}
          />
        )}
        {(dialog?.kind === "refuse" || dialog?.kind === "complement") && (
          <MessageDialog
            locale={locale}
            kind={dialog.kind}
            name={dialog.app.subject_name}
            busy={busy}
            close={() => setDialog(null)}
            send={(message) => void decide(dialog.app, dialog.kind === "refuse" ? "refused" : "incomplete", { message })}
          />
        )}
        <Button disabled={busy} onClick={() => void task(load)}>
          {t.refresh}
        </Button>
      </main>
    </>
  );
}
