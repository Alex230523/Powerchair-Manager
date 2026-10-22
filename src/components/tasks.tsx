"use client";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import {
  clubCategories,
  federationCategories,
  groupTasks,
  isLate,
  moneyCategories,
  ownKinds,
  recurrences,
  suggestedTemplates,
  thisWeek,
  yearTemplate,
  type Category,
  type OwnKind,
  type Status,
  type TaskKind,
  type TemplateItem,
} from "@/domains/tasks/schema";
import type { TaskRow } from "@/domains/tasks/service";
import { tasksCopy } from "./tasks-copy";
import { fill, todoCopy } from "./todo-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Toolbar } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";

/**
 * A1: the central to-do of the club or the federation. One collapsible
 * section per category with its open count and a red badge for the late
 * ones; « Mes tâches », « En retard », « Cette semaine » and a person in
 * charge to filter; a quick add in each category; status, priority,
 * sub-tasks and comments in the task's window. The tasks the application
 * creates by itself (a grant's deadline, a chair to service, a document
 * that expires, a pot to close, the annual accounts) come with a link to
 * what they are about and close by themselves. The same list is the « À
 * faire » tab of a coach's profile.
 */
type Person = { id: string; full_name: string; account: boolean };
type View = {
  organization_id: string;
  federation: boolean;
  today: string;
  fiscalStart: string;
  can: { manage: boolean; money: boolean; moneyManage: boolean };
  own: string[];
  userId: string;
  people: Person[];
  teams: { id: string; name: string }[];
  tasks: TaskRow[];
  templates: { id: string; kind: TaskKind; name: string; items: TemplateItem[] }[];
};
type Filter = "all" | "mine" | "late" | "week";
const dayLabel = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const isMoney = (c: Category) => moneyCategories.includes(c);
function href(locale: Locale, t: TaskRow) {
  const at = (p: string) => `/${locale}${p}`;
  if (t.partner_id) return at(`/funding/grants-sponsors?vue=sponsoring&partner=${t.partner_id}`);
  if (t.grant_id) return at(`/funding/grants-sponsors?vue=subsides&grant=${t.grant_id}`);
  if (t.event_id) return at(`/calendar?event=${t.event_id}`);
  if (t.match_id) return at(`/matches`);
  if (t.trip_id) return at(`/trips/${t.trip_id}`);
  if (t.obligation_id) return at(`/settings/club#settings-obligations`);
  if (t.chair_id) return at(`/equipment`);
  if (t.pot_id) return at(`/fundraising`);
  if (t.document_id) return at(`/documents`);
  if (t.receivable_id) return at(`/dues`);
  if (t.source_kind === "accountsAssembly" || t.source_kind === "accountsFiling") return at(`/funding/annual-accounts`);
  return null;
}
/** The application's own tasks read in the reader's language. */
function titleOf(locale: Locale, x: TaskRow) {
  const pattern = todoCopy[locale].sources[x.source_kind];
  return pattern ? fill(pattern, { about: x.source_params?.about ?? x.about ?? "" }) : x.title;
}

export function Tasks({
  locale,
  initialCategory = "all",
  embedded = false,
  responsibleId,
  openTask,
  create = false,
  linked,
}: {
  locale: Locale;
  initialCategory?: Category | "all";
  embedded?: boolean;
  /** On another person's profile: that person's tasks (otherwise one's own). */
  responsibleId?: string;
  /** « ?task= »: the task a reminder points to opens at once. */
  openTask?: string;
  /** « ?new=1 » (Ctrl+K): the new task window opens at once. */
  create?: boolean;
  /** A2: « ?grant= » or « ?partner= »: the tasks of one grant or one sponsor. */
  linked?: { grant?: string; partner?: string };
}) {
  const t = todoCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/tasks", failure);
  const { busy, message, post } = usePost("/api/tasks", reload, setError, failure);
  const [filter, setFilter] = useState<Filter | null>(null),
    [category, setCategory] = useState<Category | "all">(initialCategory),
    [who, setWho] = useState(""),
    [showDone, setShowDone] = useState(false),
    [opened, setOpened] = useState<Record<string, boolean>>({}),
    [editing, setEditing] = useState<null | { category: Category } | TaskRow>(null),
    [detail, setDetail] = useState<string | null>(openTask ?? null),
    [year, setYear] = useState(false),
    [asked, setAsked] = useState(create);
  // « ?new=1 » waits for the rights before opening, once.
  if (asked && data) {
    setAsked(false);
    if ((data.can.manage || data.can.moneyManage) && !embedded) setEditing({ category: data.federation ? (data.can.manage ? "fed_other" : "fed_finance") : data.can.manage ? "other" : "grants" });
  }
  if (!data)
    return (
      <Wrapper embedded={embedded} title={t.title}>
        {error ? <p role="alert">{error}</p> : <p role="status">…</p>}
      </Wrapper>
    );
  const own = new Set(data.own);
  const mineTask = (x: TaskRow) => (!!x.responsible_id && own.has(x.responsible_id)) || x.responsible_user_id === data.userId;
  // « Mes tâches » by default for whoever does not plan for others.
  const view: Filter = embedded || linked ? (filter ?? "all") : (filter ?? (data.can.manage || data.can.money ? "all" : "mine"));
  const linkedAbout = linked ? data.tasks.find((x) => (linked.grant && x.grant_id === linked.grant) || (linked.partner && x.partner_id === linked.partner))?.about : undefined;
  const rows = data.tasks.filter(
    (x) =>
      (responsibleId ? x.responsible_id === responsibleId : true) &&
      (!linked?.grant || x.grant_id === linked.grant) &&
      (!linked?.partner || x.partner_id === linked.partner) &&
      (embedded && !responsibleId ? mineTask(x) : true) &&
      (showDone || x.status !== "done") &&
      (category === "all" || x.category === category) &&
      (!who || x.responsible_id === who || x.responsible_user_id === who) &&
      (view === "mine" ? mineTask(x) : view === "late" ? isLate(x, data.today) : view === "week" ? thisWeek(x, data.today) : true),
  );
  const groups = groupTasks(rows, data.federation).filter((g) => (category === "all" || g.category === category) && (!(embedded || linked) || g.tasks.length > 0));
  const send = (body: Record<string, unknown>) => post({ ...body, organizationId: data.organization_id }, t.saved);
  const canAdd = (c: Category) => !embedded && (isMoney(c) ? data.can.moneyManage || data.can.manage : data.can.manage);
  const canWork = (x: TaskRow) => mineTask(x) || (isMoney(x.category) ? data.can.moneyManage : data.can.manage);
  const all = (data.federation ? federationCategories : clubCategories) as readonly Category[];
  const current = detail ? data.tasks.find((x) => x.id === detail) : undefined;
  const anyAdd = all.some(canAdd);
  return (
    <Wrapper
      embedded={embedded}
      title={t.title}
      intro={t.intro}
      actions={
        anyAdd ? (
          <>
            {!data.federation && data.can.manage && (
              <Button variant="secondary" icon="clipboardList" onClick={() => setYear(true)}>
                {t.yearOpen}
              </Button>
            )}
            <Button icon="plus" onClick={() => setEditing({ category: category !== "all" && canAdd(category) ? category : all.find(canAdd)! })}>
              {t.newTask}
            </Button>
          </>
        ) : undefined
      }
    >
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {linked && (
        <p className="notice task-linked">
          {fill(t.linked, { about: linkedAbout ?? "…" })}{" "}
          <Link href={`/${locale}/tasks`}>{t.showAll}</Link>
        </p>
      )}
      {!embedded && (
        <Toolbar label={t.filters}>
          <Segmented label={t.filters} items={(["all", "mine", "late", "week"] as const).map((id) => ({ id, label: t.views[id] }))} value={view} onChange={(v) => setFilter(v as Filter)} />
          <label className="toolbar-field">
            {t.category}
            <select value={category} onChange={(e) => setCategory(e.target.value as Category | "all")}>
              <option value="all">{t.views.all}</option>
              {all.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c]}
                </option>
              ))}
            </select>
          </label>
          {data.people.length > 0 && (
            <label className="toolbar-field">
              {t.responsible}
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">{t.everyone}</option>
                {data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            {t.showDone}
          </label>
        </Toolbar>
      )}
      {groups.some((g) => g.tasks.length > 0) || groups.some((g) => canAdd(g.category)) ? (
        groups.map((g) => {
          const open = g.tasks.filter((x) => x.status !== "done").length,
            late = g.tasks.filter((x) => isLate(x, data.today)).length;
          const id = `tasks-${g.category}`;
          return (
            <details
              key={g.category}
              className="task-group"
              id={id}
              open={opened[g.category] ?? (embedded || open > 0 || category === g.category)}
              onToggle={(e) => {
                const now = e.currentTarget.open;
                setOpened((o) => (o[g.category] === now ? o : { ...o, [g.category]: now }));
              }}
            >
              <summary>
                <span className="task-group-name">{t.categories[g.category]}</span>
                <Badge>{fill(t.openCount, { n: open })}</Badge>
                {late > 0 && (
                  <Badge tone="danger">
                    <Icon name="alert" size={14} /> {fill(t.lateCount, { n: late })}
                  </Badge>
                )}
              </summary>
              {g.tasks.length ? (
                <ul className="task-list task-page">
                  {g.tasks.map((x) => (
                    <TaskItem
                      key={x.id}
                      locale={locale}
                      task={x}
                      today={data.today}
                      busy={busy}
                      work={canWork(x)}
                      remove={data.can.manage && !embedded && x.kind !== "sponsor" && x.kind !== "grant" && !x.source_kind}
                      send={send}
                      details={() => setDetail(x.id)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="muted">{view === "mine" ? t.emptyMine : t.empty}</p>
              )}
              {canAdd(g.category) && <QuickAdd locale={locale} category={g.category} busy={busy} send={send} />}
            </details>
          );
        })
      ) : (
        <EmptyState title={view === "mine" || embedded ? t.emptyMine : t.empty} />
      )}
      {editing && (
        <TaskForm
          locale={locale}
          data={data}
          task={"id" in editing ? editing : null}
          category={editing.category}
          categories={all.filter(canAdd)}
          busy={busy}
          close={() => setEditing(null)}
          send={send}
        />
      )}
      {current && !editing && (
        <TaskDetail
          locale={locale}
          task={current}
          today={data.today}
          busy={busy}
          work={canWork(current)}
          edit={canWork(current) && (canAdd(current.category) || mineTask(current)) ? () => setEditing(current) : undefined}
          send={send}
          close={() => setDetail(null)}
        />
      )}
      {year && <YearModel locale={locale} data={data} busy={busy} send={send} close={() => setYear(false)} />}
    </Wrapper>
  );
}

function TaskItem({
  locale,
  task: x,
  today,
  busy,
  work,
  remove,
  send,
  details,
}: {
  locale: Locale;
  task: TaskRow;
  today: string;
  busy: boolean;
  work: boolean;
  remove: boolean;
  send: (b: Record<string, unknown>) => Promise<boolean>;
  details: () => void;
}) {
  const t = todoCopy[locale];
  const title = titleOf(locale, x);
  const link = href(locale, x);
  const ticked = x.checklist.filter((i) => i.done).length;
  return (
    <li data-status={x.status} data-priority={x.priority}>
      <label className="check task-check">
        <input
          type="checkbox"
          checked={x.status === "done"}
          disabled={busy || !work}
          aria-label={fill(x.status === "done" ? t.untickOf : t.tickOf, { title })}
          onChange={(e) => void send({ action: "done", id: x.id, done: e.target.checked })}
        />
        <span className="task-title">{title}</span>
      </label>
      <p className="task-meta muted small">
        {x.priority === "high" && <Badge tone="warning">{t.priorities.high}</Badge>}
        {x.status === "doing" && <Badge tone="info">{t.statuses.doing}</Badge>}
        {x.about && link && (
          <>
            <Link href={link} aria-label={fill(t.openOf, { about: x.about })}>
              {x.about}
            </Link>
            {" · "}
          </>
        )}
        {x.due_on ? `${t.due} ${dayLabel(locale, x.due_on)}` : t.noDate}
        {isLate(x, today) && (
          <Badge tone="danger">
            <Icon name="alert" size={14} /> {t.views.late}
          </Badge>
        )}
        {" · "}
        {t.responsible} : {x.responsible_name ?? t.nobody}
        {x.checklist.length > 0 && ` · ${t.checklist} ${ticked}/${x.checklist.length}`}
        {x.comments.length > 0 && ` · ${t.comments} ${x.comments.length}`}
        {x.auto_closed ? ` · ${t.autoClosed}` : x.source_kind && !x.source_kind.startsWith("year_") ? ` · ${t.auto}` : ""}
      </p>
      <div className="task-actions">
        {work && (
          <select aria-label={fill(t.statusOf, { title })} value={x.status} disabled={busy} onChange={(e) => void send({ action: "status", id: x.id, status: e.target.value as Status })}>
            {(["todo", "doing", "done"] as const).map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
        )}
        <Button variant="secondary" size="sm" aria-label={fill(t.detailsOf, { title })} onClick={details}>
          {t.open}
        </Button>
        {remove && (
          <button type="button" className="icon-button sm" aria-label={fill(t.removeOf, { title })} title={fill(t.removeOf, { title })} disabled={busy} onClick={() => void send({ action: "delete", id: x.id })}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function QuickAdd({ locale, category, busy, send }: { locale: Locale; category: Category; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = todoCopy[locale];
  const id = `quick-${category}`;
  const name = t.categories[category];
  return (
    <form
      className="task-quick"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const title = String(new FormData(form).get("title") ?? "").trim();
        if (title.length < 2) return;
        void send({ action: "create", category, title }).then((ok) => ok && form.reset());
      }}
    >
      <label htmlFor={id} className="sr-only">
        {fill(t.quickLabel, { category: name })}
      </label>
      <input id={id} name="title" required minLength={2} maxLength={200} placeholder={fill(t.quickLabel, { category: name })} />
      <Button size="sm" icon="plus" disabled={busy} aria-label={fill(t.quickAdd, { category: name })}>
        {t.add}
      </Button>
    </form>
  );
}

function TaskForm({
  locale,
  data,
  task,
  category,
  categories,
  busy,
  close,
  send,
}: {
  locale: Locale;
  data: View;
  task: TaskRow | null;
  category: Category;
  categories: Category[];
  busy: boolean;
  close: () => void;
  send: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = todoCopy[locale];
  const choices = categories.includes(category) ? categories : [category, ...categories];
  const responsible = task ? (task.responsible_user_id ?? task.responsible_id ?? "") : "";
  return (
    <Modal title={task ? `${t.edit} · ${titleOf(locale, task)}` : t.newTask} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const who = String(f.get("responsible") ?? "") || null;
          const body = {
            category: f.get("category"),
            title: f.get("title"),
            detail: f.get("detail") ?? "",
            dueOn: f.get("due") || null,
            responsibleId: data.federation ? null : who,
            responsibleUserId: data.federation ? who : null,
            priority: f.get("priority"),
            recurrence: f.get("recurrence"),
            teamId: f.get("team") || null,
          };
          const checklist = String(f.get("checklist") ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          void send(task ? { action: "update", id: task.id, ...body } : { action: "create", ...body, checklist }).then((ok) => ok && close());
        }}
      >
        <label htmlFor="task-category">
          {t.category}
          <select id="task-category" name="category" defaultValue={category}>
            {choices.map((c) => (
              <option key={c} value={c}>
                {t.categories[c]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-title">
          {t.taskTitle}
          <input id="task-title" name="title" required minLength={2} maxLength={200} defaultValue={task ? titleOf(locale, task) : ""} />
        </label>
        <label htmlFor="task-detail">
          {t.detail}
          <textarea id="task-detail" name="detail" maxLength={2000} defaultValue={task?.detail ?? ""} />
        </label>
        <label htmlFor="task-due">
          {t.due}
          <input id="task-due" name="due" type="date" defaultValue={task?.due_on ?? ""} />
        </label>
        <label htmlFor="task-priority">
          {t.priority}
          <select id="task-priority" name="priority" defaultValue={task?.priority ?? "normal"}>
            {(["normal", "high"] as const).map((p) => (
              <option key={p} value={p}>
                {t.priorities[p]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-recurrence">
          {t.recurrence}
          <select id="task-recurrence" name="recurrence" defaultValue={task?.recurrence ?? "none"}>
            {recurrences.map((r) => (
              <option key={r} value={r}>
                {t.recurrences[r]}
              </option>
            ))}
          </select>
        </label>
        {data.people.length > 0 ? (
          <label htmlFor="task-responsible">
            {t.responsible}
            <select id="task-responsible" name="responsible" defaultValue={responsible}>
              <option value="">{t.nobody}</option>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="responsible" value={responsible || (data.federation ? data.userId : (data.own[0] ?? ""))} />
        )}
        {data.teams.length > 0 && (
          <label htmlFor="task-team">
            {t.team}
            <select id="task-team" name="team" defaultValue={task?.team_id ?? ""}>
              <option value="">{t.noTeam}</option>
              {data.teams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!task && (
          <label htmlFor="task-checklist">
            {t.checklist}
            <textarea id="task-checklist" name="checklist" rows={3} aria-describedby="task-checklist-help" />
            <span id="task-checklist-help" className="muted">
              {t.checklistHelp}
            </span>
          </label>
        )}
        <div className="actions">
          <Button disabled={busy}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDetail({
  locale,
  task: x,
  today,
  busy,
  work,
  edit,
  send,
  close,
}: {
  locale: Locale;
  task: TaskRow;
  today: string;
  busy: boolean;
  work: boolean;
  edit?: () => void;
  send: (b: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
}) {
  const t = todoCopy[locale];
  const title = titleOf(locale, x);
  const link = href(locale, x);
  return (
    <Modal title={title} close={close}>
      <div className="task-detail-window">
        <p className="task-meta muted">
          {t.categories[x.category]} · {t.statuses[x.status]} · {x.due_on ? `${t.due} ${dayLabel(locale, x.due_on)}` : t.noDate}
          {isLate(x, today) && (
            <Badge tone="danger">
              <Icon name="alert" size={14} /> {t.views.late}
            </Badge>
          )}
          {" · "}
          {t.responsible} : {x.responsible_name ?? t.nobody} · {t.priority} : {t.priorities[x.priority]} · {t.recurrence} : {t.recurrences[x.recurrence]}
        </p>
        {x.detail && <p>{x.detail}</p>}
        {link && x.about && (
          <p>
            <Link href={link} className="button secondary sm">
              {fill(t.openOf, { about: x.about })}
            </Link>
          </p>
        )}
        <h3>{t.checklist}</h3>
        {x.checklist.length > 0 && (
          <ul className="task-checklist">
            {x.checklist.map((i, n) => (
              <li key={n}>
                <label className="check">
                  <input type="checkbox" checked={i.done} disabled={busy || !work} onChange={(e) => void send({ action: "check", id: x.id, index: n, done: e.target.checked })} />
                  <span>{i.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {work && (
          <form
            className="task-quick"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const text = String(new FormData(form).get("item") ?? "").trim();
              if (text) void send({ action: "addItem", id: x.id, text }).then((ok) => ok && form.reset());
            }}
          >
            <label htmlFor="task-item" className="sr-only">
              {t.addItem}
            </label>
            <input id="task-item" name="item" required maxLength={200} placeholder={t.addItem} />
            <Button size="sm" icon="plus" disabled={busy}>
              {t.add}
            </Button>
          </form>
        )}
        <h3>{t.comments}</h3>
        {x.comments.length ? (
          <ul className="task-comments">
            {x.comments.map((k) => (
              <li key={k.id}>
                <p className="muted small">
                  {k.author} · {dayLabel(locale, k.created_at.slice(0, 10))}
                </p>
                <p>{k.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noComment}</p>
        )}
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = String(new FormData(form).get("body") ?? "").trim();
            if (body) void send({ action: "comment", id: x.id, body }).then((ok) => ok && form.reset());
          }}
        >
          <label htmlFor="task-comment">
            {t.comment}
            <textarea id="task-comment" name="body" required maxLength={2000} rows={2} />
          </label>
          <div className="actions">
            <Button disabled={busy}>{t.post}</Button>
            {edit && (
              <Button type="button" variant="secondary" onClick={edit}>
                {t.edit}
              </Button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

/** « Année administrative de l'ASBL »: the yearly duties, checked and changed before they are added. */
function YearModel({ locale, data, busy, send, close }: { locale: Locale; data: View; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean>; close: () => void }) {
  const t = todoCopy[locale];
  const [year, setYear] = useState(Number(data.today.slice(0, 4)));
  const items = yearTemplate(data.fiscalStart, year);
  return (
    <Modal title={t.yearTitle} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send({
            action: "applyYear",
            year,
            items: items.map((i) => ({ key: i.key, title: f.get(`title-${i.key}`), dueOn: f.get(`due-${i.key}`) || null, responsibleId: f.get(`who-${i.key}`) || null })),
          }).then((ok) => ok && close());
        }}
      >
        <p className="muted">{t.yearIntro}</p>
        <label htmlFor="year-year">
          {t.yearLabel}
          <input id="year-year" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
        </label>
        {items.map((i) => (
          <fieldset key={`${year}-${i.key}`} className="year-item">
            <legend>{t.yearItems[i.key]}</legend>
            <label htmlFor={`title-${i.key}`}>
              {t.taskTitle}
              <input id={`title-${i.key}`} name={`title-${i.key}`} required minLength={2} maxLength={200} defaultValue={t.yearItems[i.key]} />
            </label>
            <label htmlFor={`due-${i.key}`}>
              {t.due}
              <input id={`due-${i.key}`} name={`due-${i.key}`} type="date" defaultValue={i.dueOn ?? ""} />
            </label>
            {data.people.length > 0 && (
              <label htmlFor={`who-${i.key}`}>
                {t.responsible}
                <select id={`who-${i.key}`} name={`who-${i.key}`} defaultValue="">
                  <option value="">{t.nobody}</option>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
        ))}
        <div className="actions">
          <Button disabled={busy}>{t.yearApply}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
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
