"use client";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { groupTasks, ownKinds, suggestedTemplates, taskKinds, type OwnKind, type TaskKind, type TemplateItem } from "@/domains/tasks/schema";
import type { TaskRow } from "@/domains/tasks/service";
import { tasksCopy } from "./tasks-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Toolbar } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";

/**
 * Wave 17 (O1): the club's tasks. A « Type » menu and one group per type,
 * never mixed, each sorted by due date; a box to tick, a link to what the
 * task is about. « Mes tâches » is on by default for those who only see
 * their own. The same list is the « À faire » tab of a coach's profile.
 */
type View = {
  organization_id: string;
  today: string;
  can: { manage: boolean; money: boolean };
  own: string[];
  people: { id: string; full_name: string }[];
  tasks: TaskRow[];
  templates: { id: string; kind: TaskKind; name: string; items: TemplateItem[] }[];
};
const fill = (text: string, v: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const dayLabel = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
function href(locale: Locale, t: TaskRow) {
  const at = (p: string) => `/${locale}${p}`;
  if (t.partner_id) return at(`/funding/partners?partner=${t.partner_id}`);
  if (t.grant_id) return at(`/funding/grants?grant=${t.grant_id}`);
  if (t.event_id) return at(`/calendar?event=${t.event_id}`);
  if (t.match_id) return at(`/matches`);
  if (t.trip_id) return at(`/trips/${t.trip_id}`);
  if (t.obligation_id) return at(`/settings/club#settings-obligations`);
  if (t.chair_id) return at(`/equipment`);
  return null;
}

export function Tasks({
  locale,
  initialKind = "all",
  embedded = false,
  responsibleId,
}: {
  locale: Locale;
  initialKind?: TaskKind | "all";
  embedded?: boolean;
  /** On another person's profile: that person's tasks (otherwise one's own). */
  responsibleId?: string;
}) {
  const t = tasksCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.none, [locale, t.none]);
  const { data, error, setError, reload } = useData<View>("/api/tasks", failure);
  const { busy, message, post } = usePost("/api/tasks", reload, setError, failure);
  const [kind, setKind] = useState<TaskKind | "all">(initialKind),
    [show, setShow] = useState<"todo" | "done">("todo"),
    [mineChoice, setMine] = useState<boolean | null>(null),
    [adding, setAdding] = useState<null | "task" | "template">(null);
  if (!data)
    return (
      <Wrapper embedded={embedded} title={t.title}>
        {error ? <p role="alert">{error}</p> : <p role="status">…</p>}
      </Wrapper>
    );
  // « Mes tâches » by default for whoever does not plan for others.
  const mine = embedded || (mineChoice ?? !data.can.manage);
  const own = new Set(data.own);
  const whose = (x: TaskRow) => (responsibleId ? x.responsible_id === responsibleId : !mine || (!!x.responsible_id && own.has(x.responsible_id)));
  const rows = data.tasks.filter((x) => x.status === show && (kind === "all" || x.kind === kind) && whose(x));
  const groups = groupTasks(rows);
  const present = taskKinds.filter((k) => data.tasks.some((x) => x.kind === k));
  const send = (body: Record<string, unknown>) => post({ ...body, organizationId: data.organization_id }, t.saved);
  return (
    <Wrapper
      embedded={embedded}
      title={t.title}
      intro={t.intro}
      actions={
        data.can.manage && !embedded ? (
          <>
            {data.templates.length > 0 && (
              <Button variant="secondary" onClick={() => setAdding("template")}>
                {t.fromTemplate}
              </Button>
            )}
            <Button icon="plus" onClick={() => setAdding("task")}>
              {t.add}
            </Button>
          </>
        ) : undefined
      }
    >
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <Toolbar label={t.type}>
        <label className="toolbar-field">
          {t.type}
          <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind | "all")}>
            <option value="all">{t.all}</option>
            {(present.length ? present : taskKinds).map((k) => (
              <option key={k} value={k}>
                {t.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <Segmented label={t.status} items={[{ id: "todo", label: t.pending }, { id: "done", label: t.done }]} value={show} onChange={(v) => setShow(v as "todo" | "done")} />
        {!embedded && (data.can.manage || data.can.money) && (
          <label className="check">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            {t.mine}
          </label>
        )}
      </Toolbar>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.kind} className="task-group" aria-labelledby={`tasks-${g.kind}`}>
            <h3 id={`tasks-${g.kind}`}>
              {t.kinds[g.kind]} <span className="muted">({g.tasks.length})</span>
            </h3>
            <ul className="task-list task-page">
              {g.tasks.map((x) => {
                const late = x.status === "todo" && x.due_on && x.due_on < data.today;
                const link = href(locale, x);
                const canTick = (x.responsible_id && own.has(x.responsible_id)) || (x.kind === "sponsor" || x.kind === "grant" ? data.can.money : data.can.manage);
                return (
                  <li key={x.id} data-status={x.status}>
                    <label className="check task-check">
                      <input
                        type="checkbox"
                        checked={x.status === "done"}
                        disabled={busy || !canTick}
                        aria-label={fill(x.status === "done" ? t.untick : t.tick, { title: x.title })}
                        onChange={(e) => void send({ action: "done", id: x.id, done: e.target.checked })}
                      />
                      <span className="task-title">{x.title}</span>
                    </label>
                    <p className="task-meta muted small">
                      {x.about && (
                        <>
                          {link ? <Link href={link}>{x.about}</Link> : x.about}
                          {" · "}
                        </>
                      )}
                      {x.due_on ? `${t.dueOn} ${dayLabel(locale, x.due_on)}` : t.noDate}
                      {late && (
                        <>
                          {" "}
                          <Badge tone="danger">
                            <Icon name="alert" size={14} /> {t.late}
                          </Badge>
                        </>
                      )}
                      {" · "}
                      {t.responsible} : {x.responsible_name ?? t.nobody}
                    </p>
                    {x.detail && <p className="task-detail">{x.detail}</p>}
                    {data.can.manage && !embedded && x.kind !== "sponsor" && x.kind !== "grant" && (
                      <button type="button" className="icon-button sm task-remove" aria-label={fill(t.removeOf, { title: x.title })} title={fill(t.removeOf, { title: x.title })} disabled={busy} onClick={() => void send({ action: "delete", id: x.id })}>
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState title={mine ? t.noneMine : t.none} />
      )}
      {adding === "task" && (
        <Modal title={t.add} close={() => setAdding(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({
                action: "create",
                kind: f.get("kind"),
                title: f.get("title"),
                detail: f.get("detail") ?? "",
                dueOn: f.get("due") || null,
                responsibleId: f.get("responsible") || null,
              }).then((ok) => ok && setAdding(null));
            }}
          >
            <label htmlFor="task-kind">
              {t.kind}
              <select id="task-kind" name="kind" defaultValue={kind !== "all" && (ownKinds as readonly string[]).includes(kind) ? kind : "other"}>
                {ownKinds.map((k) => (
                  <option key={k} value={k}>
                    {t.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="task-title">
              {t.taskTitle}
              <input id="task-title" name="title" required minLength={2} maxLength={200} />
            </label>
            <label htmlFor="task-detail">
              {t.detail}
              <textarea id="task-detail" name="detail" maxLength={2000} />
            </label>
            <label htmlFor="task-due">
              {t.due}
              <input id="task-due" name="due" type="date" />
            </label>
            <Responsible locale={locale} people={data.people} />
            <div className="actions">
              <Button disabled={busy}>{t.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {adding === "template" && (
        <Modal title={t.fromTemplate} close={() => setAdding(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({ action: "fromTemplate", templateId: f.get("template"), date: f.get("date"), responsibleId: f.get("responsible") || null }).then((ok) => ok && setAdding(null));
            }}
          >
            <label htmlFor="task-template">
              {t.template}
              <select id="task-template" name="template" required>
                {data.templates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t.kinds[x.kind]} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="task-date">
              {t.date}
              <input id="task-date" name="date" type="date" required defaultValue={data.today} aria-describedby="task-date-hint" />
              <span id="task-date-hint" className="muted">
                {t.dateHint}
              </span>
            </label>
            <Responsible locale={locale} people={data.people} />
            <div className="actions">
              <Button disabled={busy}>{t.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Wrapper>
  );
}

function Responsible({ locale, people }: { locale: Locale; people: { id: string; full_name: string }[] }) {
  const t = tasksCopy[locale];
  return (
    <label htmlFor="task-responsible">
      {t.responsible}
      <select id="task-responsible" name="responsible" defaultValue="">
        <option value="">{t.nobody}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Wrapper({ embedded, title, intro, actions, children }: { embedded: boolean; title: string; intro?: string; actions?: ReactNode; children: ReactNode }) {
  if (embedded) return <div className="tasks-embedded">{children}</div>;
  return (
    <main id="main" className="access tasks-page">
      <PageHeader title={title} subtitle={intro} actions={actions} />
      <Card title={title}>{children}</Card>
    </main>
  );
}

/** Settings > Activities: the task templates of the club, and the ones the platform suggests. */
export function TaskTemplates({ locale }: { locale: Locale }) {
  const t = tasksCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.none, [locale, t.none]);
  const { data, error, setError, reload } = useData<View>("/api/tasks", failure);
  const { busy, message, post } = usePost("/api/tasks", reload, setError, failure);
  const [editing, setEditing] = useState<null | "new" | { id: string; kind: OwnKind; name: string; items: TemplateItem[] }>(null);
  if (!data?.can.manage) return null;
  const send = (body: Record<string, unknown>) => post({ ...body, organizationId: data.organization_id }, t.saved);
  const suggested = suggestedTemplates[locale].filter((s) => !data.templates.some((x) => x.name === s.name));
  const current = editing && editing !== "new" ? editing : null;
  return (
    <section className="settings-section" aria-labelledby="settings-task-templates" id="settings-task-templates">
      <h2 id="settings-task-templates">{t.templates}</h2>
      <p className="muted">{t.templatesIntro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.templates.length > 0 && (
        <ul className="template-list">
          {data.templates.map((x) => (
            <li key={x.id}>
              <div>
                <strong>
                  {t.kinds[x.kind]} · {x.name}
                </strong>
                <p className="muted small">{x.items.map((i) => `${i.title} (${fill(t.daysBefore, { n: i.daysBefore })})`).join(" · ")}</p>
              </div>
              <div className="row-actions">
                <Button variant="secondary" size="sm" aria-label={fill(t.editTemplate, { name: x.name })} onClick={() => setEditing({ ...x, kind: x.kind as OwnKind })}>
                  {t.edit}
                </Button>
                <button type="button" className="icon-button sm" aria-label={fill(t.deleteTemplate, { name: x.name })} title={fill(t.deleteTemplate, { name: x.name })} disabled={busy} onClick={() => void send({ action: "deleteTemplate", id: x.id })}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {suggested.length > 0 && (
        <div className="affiliation-examples">
          <p className="muted">{t.suggested}</p>
          {suggested.map((s) => (
            <Button key={s.key} variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "saveTemplate", kind: s.kind, name: s.name, items: s.items })}>
              {fill(t.addSuggested, { name: s.name })}
            </Button>
          ))}
        </div>
      )}
      <Button variant="secondary" icon="plus" onClick={() => setEditing("new")}>
        {t.newTemplate}
      </Button>
      {editing && (
        <Modal title={current ? fill(t.editTemplate, { name: current.name }) : t.newTemplate} close={() => setEditing(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const items = String(f.get("items") ?? "")
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => {
                  const [title, days] = l.split("|").map((x) => x.trim());
                  return { title, detail: "", daysBefore: Math.max(0, Math.min(365, Number.parseInt(days ?? "0", 10) || 0)) };
                });
              void send({ action: "saveTemplate", id: current?.id, kind: f.get("kind"), name: f.get("name"), items }).then((ok) => ok && setEditing(null));
            }}
          >
            <label htmlFor="template-kind">
              {t.kind}
              <select id="template-kind" name="kind" defaultValue={current?.kind ?? "transport"}>
                {ownKinds.map((k) => (
                  <option key={k} value={k}>
                    {t.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="template-name">
              {t.templateName}
              <input id="template-name" name="name" required minLength={2} maxLength={120} defaultValue={current?.name ?? ""} />
            </label>
            <label htmlFor="template-items">
              {t.items}
              <textarea
                id="template-items"
                name="items"
                required
                rows={6}
                aria-describedby="template-items-hint"
                defaultValue={current?.items.map((i) => `${i.title} | ${i.daysBefore}`).join("\n") ?? ""}
              />
              <span id="template-items-hint" className="muted">
                {t.itemsHint}
              </span>
            </label>
            <div className="actions">
              <Button disabled={busy}>{t.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
