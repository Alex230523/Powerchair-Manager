"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  progressOf,
  recurrenceText,
  thisWeek,
  yearTemplate,
  type Category,
  type OwnKind,
  type Status,
  type TaskKind,
  type TemplateItem,
} from "@/domains/tasks/schema";
import type { TaskRow, YearItem } from "@/domains/tasks/service";
import { todoMoreCopy } from "./todo-more-copy";
import { PlaceCombobox } from "./place-combobox";
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
  places: { id: string; name: string; address: string }[];
  sharedVenues: { id: string; name: string; address: string }[];
  templates: { id: string; kind: TaskKind; name: string; items: TemplateItem[]; archived: boolean; category: Category | null }[];
};
type Filter = "all" | "mine" | "late" | "week" | "recurring";
/** 2: given to me: one of my profiles, or my account, among the people in charge. */
const isMine = (data: Pick<View, "own" | "userId">, x: TaskRow) =>
  (x.assignees ?? []).some((a) => (!!a.profile_id && data.own.includes(a.profile_id)) || a.user_id === data.userId) ||
  (!!x.responsible_id && data.own.includes(x.responsible_id)) ||
  x.responsible_user_id === data.userId;
const namesOf = (x: TaskRow) => ((x.assignees ?? []).length ? x.assignees.map((a) => a.name).join(", ") : x.responsible_name);
const dayLabel = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const isMoney = (c: Category) => moneyCategories.includes(c);
function href(locale: Locale, t: TaskRow) {
  const at = (p: string) => `/${locale}${p}`;
  if (t.partner_id) return at(`/funding/grants-sponsors?vue=sponsoring&partner=${t.partner_id}`);
  if (t.grant_id) return at(`/funding/grants-sponsors?vue=subsides&grant=${t.grant_id}`);
  // 3: a step of a trip opens its trip, even when the trip serves a match.
  if (t.trip_id) return at(`/trips/${t.trip_id}`);
  if (t.event_id) return at(`/calendar?event=${t.event_id}`);
  if (t.match_id) return at(`/matches`);
  if (t.obligation_id) return at(`/settings/club#settings-obligations`);
  if (t.chair_id) return at(`/equipment`);
  if (t.pot_id) return at(`/fundraising`);
  if (t.document_id) return at(`/documents`);
  if (t.receivable_id) return at(`/dues`);
  if (t.contact_id) return at(`/contacts?contact=${t.contact_id}`);
  if (t.source_kind === "accountsAssembly" || t.source_kind === "accountsFiling") return at(`/funding/annual-accounts`);
  // 18: a hall's booking, its follow-up, its invoice, a change to tell.
  if (t.source_kind?.startsWith("venue")) return at(`/venues#bookings`);
  // « Fin de coach »: a step of a departure opens the coach's file.
  if (t.source_kind === "offboarding" && t.source_params?.profile) return at(`/coaches/${t.source_params.profile}#departure`);
  // 34: a fine of the federation.
  if (t.source_kind === "disciplineFine") return at(`/discipline#fines`);
  // 9: reserved funds whose use-by date comes.
  if (t.source_kind === "allocationDeadline") return at(`/funding/reserved`);
  // H4: the cash forecast under the threshold.
  if (t.source_kind === "forecastLow") return at(`/funding/forecast`);
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
    [yearView, setYearView] = useState(false),
    [fromTemplate, setFromTemplate] = useState(false),
    [after, setAfter] = useState<TaskRow | null>(null),
    [asked, setAsked] = useState(create),
    [lastCreate, setLastCreate] = useState(create);
  // Ctrl+K on the tasks page itself: the same page gets « ?new=1 » without remounting.
  if (create !== lastCreate) {
    setLastCreate(create);
    if (create) setAsked(true);
  }
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
  const mineTask = (x: TaskRow) => isMine(data, x);
  const more = todoMoreCopy[locale];
  // « Mes tâches » by default for whoever does not plan for others.
  const view: Filter = embedded || linked ? (filter ?? "all") : (filter ?? (data.can.manage || data.can.money ? "all" : "mine"));
  const linkedAbout = linked ? data.tasks.find((x) => (linked.grant && x.grant_id === linked.grant) || (linked.partner && x.partner_id === linked.partner))?.about : undefined;
  const rows = data.tasks.filter(
    (x) =>
      (responsibleId ? x.responsible_id === responsibleId || (x.assignees ?? []).some((a) => a.profile_id === responsibleId) : true) &&
      (!linked?.grant || x.grant_id === linked.grant) &&
      (!linked?.partner || x.partner_id === linked.partner) &&
      (embedded && !responsibleId ? mineTask(x) : true) &&
      (showDone || x.status !== "done") &&
      (category === "all" || x.category === category) &&
      (!who || x.responsible_id === who || x.responsible_user_id === who || (x.assignees ?? []).some((a) => a.profile_id === who || a.user_id === who)) &&
      (view === "mine" ? mineTask(x) : view === "late" ? isLate(x, data.today) : view === "week" ? thisWeek(x, data.today) : view === "recurring" ? x.recurrence !== "none" : true),
  );
  const groups = groupTasks(rows, data.federation).filter((g) => (category === "all" || g.category === category) && (!(embedded || linked) || g.tasks.length > 0));
  const send = (body: Record<string, unknown>) => post({ ...body, organizationId: data.organization_id }, t.saved);
  /** 2: once ticked, a task with an amount proposes its expense, an affiliation its « en ordre ». */
  const tick = async (x: TaskRow, done: boolean) => {
    const ok = await send({ action: "done", id: x.id, done });
    const money = isMoney(x.category) ? data.can.moneyManage : data.can.manage;
    if (ok && done && !data.federation && ((x.affiliation_due_id && data.can.moneyManage) || (x.amount_cents !== null && !x.transaction_id && money))) setAfter(x);
    return ok;
  };
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
            {data.can.manage && (
              <Button variant="secondary" icon="clipboardList" onClick={() => setYear(true)}>
                {t.yearOpen}
              </Button>
            )}
            {data.can.manage && (
              <Button variant="secondary" icon="calendar" onClick={() => setYearView(true)}>
                {more.year}
              </Button>
            )}
            {!data.federation && data.can.manage && (
              <Button variant="secondary" icon="copy" onClick={() => setFromTemplate(true)}>
                {more.fromTemplate}
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
          <Segmented
            label={t.filters}
            items={(["all", "mine", "late", "week", "recurring"] as const).map((id) => ({ id, label: id === "recurring" ? more.recurringFilter : t.views[id] }))}
            value={view}
            onChange={(v) => setFilter(v as Filter)}
          />
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
                      tick={tick}
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
          saveAsTemplate={!data.federation && data.can.manage}
          send={send}
          close={() => setDetail(null)}
        />
      )}
      {year && <YearModel locale={locale} data={data} busy={busy} send={send} close={() => setYear(false)} />}
      {yearView && <YearView locale={locale} close={() => setYearView(false)} />}
      {fromTemplate && <FromTemplate locale={locale} data={data} busy={busy} send={send} close={() => setFromTemplate(false)} />}
      {after && <AfterDone locale={locale} task={after} today={data.today} organizationId={data.organization_id} send={send} reload={reload} close={() => setAfter(null)} />}
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
  tick,
  details,
}: {
  locale: Locale;
  task: TaskRow;
  today: string;
  busy: boolean;
  work: boolean;
  remove: boolean;
  send: (b: Record<string, unknown>) => Promise<boolean>;
  tick: (x: TaskRow, done: boolean) => Promise<boolean>;
  details: () => void;
}) {
  const t = todoCopy[locale];
  const more = todoMoreCopy[locale];
  const progress = x.completion === "each" && (x.assignees ?? []).length > 1 ? progressOf(x.assignees) : null;
  const rule = recurrenceText(locale, x.recurrence, x.due_on, x.recurrence_until);
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
          onChange={(e) => void tick(x, e.target.checked)}
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
        {t.responsible} : {namesOf(x) ?? t.nobody}
        {progress && ` · ${fill(more.progress, { done: progress.done, total: progress.total })}`}
        {rule && (
          <>
            {" · "}
            <span className="task-rule">
              <Icon name="clock" size={14} /> {rule}
            </span>
          </>
        )}
        {x.meeting_starts_at && ` · ${more.meeting} ${new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(x.meeting_starts_at))}`}
        {(x.place_name || x.free_location) && ` · ${x.place_name ?? x.free_location}`}
        {x.amount_cents !== null && ` · ${new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { style: "currency", currency: "EUR" }).format(x.amount_cents / 100)}`}
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
  const more = todoMoreCopy[locale];
  const choices = categories.includes(category) ? categories : [category, ...categories];
  return (
    <Modal title={task ? `${t.edit} · ${titleOf(locale, task)}` : t.newTask} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const crew = f.getAll("assignee").map(String);
          const at = (v: FormDataEntryValue | null) => (v ? new Date(String(v)).toISOString() : null);
          const amount = String(f.get("amount") ?? "").trim();
          const body = {
            category: f.get("category"),
            title: f.get("title"),
            detail: f.get("detail") ?? "",
            dueOn: f.get("due") || null,
            ...(data.federation ? { assigneeUserIds: crew } : { assignees: crew }),
            completion: f.get("completion") ?? "any",
            meetingStartsAt: at(f.get("meetingStart")),
            meetingEndsAt: at(f.get("meetingEnd")),
            placeId: f.get("place") || null,
            sharedVenueId: f.get("sharedVenue") || null,
            freeLocation: String(f.get("freeLocation") ?? ""),
            linkUrl: String(f.get("link") ?? "").trim(),
            amountCents: amount ? Math.round(Number(amount.replace(",", ".")) * 100) : null,
            priority: f.get("priority"),
            recurrence: f.get("recurrence"),
            recurrenceUntil: f.get("until") || null,
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
        <label htmlFor="task-until">
          {more.until}
          <input id="task-until" name="until" type="date" defaultValue={task?.recurrence_until ?? ""} />
        </label>
        <fieldset className="task-meeting">
          <legend>{more.meeting}</legend>
          <label htmlFor="task-meeting-start">
            {more.meetingStart}
            <input id="task-meeting-start" name="meetingStart" type="datetime-local" defaultValue={localInput(task?.meeting_starts_at ?? null)} />
          </label>
          <label htmlFor="task-meeting-end">
            {more.meetingEnd}
            <input id="task-meeting-end" name="meetingEnd" type="datetime-local" defaultValue={localInput(task?.meeting_ends_at ?? null)} />
          </label>
          {!data.federation && (
            <div className="field">
              <span>{more.place}</span>
              <PlaceCombobox
                locale={locale}
                places={data.places}
                shared={data.sharedVenues}
                initial={{ placeId: task?.place_id ?? null, sharedId: task?.shared_venue_id ?? null, free: task?.free_location ?? "" }}
                canCreate={false}
                create={() => undefined}
              />
            </div>
          )}
        </fieldset>
        <label htmlFor="task-link">
          {more.link}
          <input id="task-link" name="link" type="url" maxLength={500} placeholder="https://" defaultValue={task?.link_url ?? ""} />
        </label>
        <label htmlFor="task-amount">
          {more.amount}
          <input id="task-amount" name="amount" inputMode="decimal" defaultValue={task?.amount_cents != null ? String(task.amount_cents / 100) : ""} />
        </label>
        <Assignees locale={locale} data={data} task={task} />
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
  saveAsTemplate = false,
}: {
  locale: Locale;
  task: TaskRow;
  today: string;
  busy: boolean;
  work: boolean;
  edit?: () => void;
  saveAsTemplate?: boolean;
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
          {t.responsible} : {namesOf(x) ?? t.nobody} · {t.priority} : {t.priorities[x.priority]} · {t.recurrence} :{" "}
          {recurrenceText(locale, x.recurrence, x.due_on, x.recurrence_until) || t.recurrences[x.recurrence]}
        </p>
        {x.completion === "each" && (x.assignees ?? []).length > 1 && (
          <ul className="plain-list task-parts">
            {x.assignees.map((a) => (
              <li key={a.profile_id ?? a.user_id}>
                <Badge tone={a.done_on ? "success" : "neutral"}>{a.done_on ? todoMoreCopy[locale].states.done : todoMoreCopy[locale].states.upcoming}</Badge> {a.name}
              </li>
            ))}
          </ul>
        )}
        {x.detail && <p>{x.detail}</p>}
        {x.link_url && (
          <p>
            <a href={x.link_url} target="_blank" rel="noopener noreferrer">
              {todoMoreCopy[locale].linkOpen}
            </a>
          </p>
        )}
        {link && x.about && (
          <p>
            <Link href={link} className="button secondary sm">
              {fill(t.openOf, { about: x.about })}
            </Link>
          </p>
        )}
        {saveAsTemplate && (
          <details className="task-save-template">
            <summary>{todoMoreCopy[locale].saveAsTemplate}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                if (name.length >= 2) void send({ action: "saveAsTemplate", id: x.id, name });
              }}
            >
              <label htmlFor={`template-name-${x.id}`}>
                {todoMoreCopy[locale].templateName}
                <input id={`template-name-${x.id}`} name="name" required minLength={2} maxLength={120} defaultValue={title.slice(0, 120)} />
              </label>
              <Button size="sm" disabled={busy}>
                {todoMoreCopy[locale].saveAsTemplate}
              </Button>
            </form>
          </details>
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
  const items = yearTemplate(data.fiscalStart, year, data.federation);
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
            // 35: in a federation, the responsible is a person with an account.
            items: items.map((i) => ({
              key: i.key,
              title: f.get(`title-${i.key}`),
              dueOn: f.get(`due-${i.key}`) || null,
              responsibleId: data.federation ? null : f.get(`who-${i.key}`) || null,
              responsibleUserId: data.federation ? f.get(`who-${i.key}`) || null : null,
            })),
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
  const [editing, setEditing] = useState<null | "new" | { id: string; kind: OwnKind; name: string; items: TemplateItem[]; category: Category | null }>(null);
  const more = todoMoreCopy[locale];
  const cats = todoCopy[locale].categories;
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
                {x.archived && <Badge tone="neutral">{more.archived}</Badge>}
                <Button variant="secondary" size="sm" aria-label={fill(t.editTemplate, { name: x.name })} onClick={() => setEditing({ ...x, kind: x.kind as OwnKind })}>
                  {t.edit}
                </Button>
                {/* 2: duplicated, archived (kept) or restored rather than lost. */}
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void send({ action: "duplicateTemplate", id: x.id, name: fill(more.copyOf, { name: x.name }).slice(0, 120) })}>
                  {more.duplicate}
                  <span className="sr-only"> : {x.name}</span>
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void send({ action: "archiveTemplate", id: x.id, archived: !x.archived })}>
                  {x.archived ? more.restore : more.archive}
                  <span className="sr-only"> : {x.name}</span>
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
              void send({ action: "saveTemplate", id: current?.id, kind: f.get("kind"), category: f.get("category") || undefined, name: f.get("name"), items }).then((ok) => ok && setEditing(null));
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
            <label htmlFor="template-category">
              {more.category}
              <select id="template-category" name="category" defaultValue={current?.category ?? ""}>
                <option value="">{t.kind}</option>
                {clubCategories.map((c) => (
                  <option key={c} value={c}>
                    {cats[c]}
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

/** « 2026-11-02T18:30 » for a datetime-local field, in Brussels time. */
function localInput(iso: string | null) {
  if (!iso) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

/** 2: the people in charge, one or several, found by name; the mode of completion when several. */
function Assignees({ locale, data, task }: { locale: Locale; data: View; task: TaskRow | null }) {
  const more = todoMoreCopy[locale];
  const start = task ? (task.assignees ?? []).map((a) => a.profile_id ?? a.user_id ?? "").filter(Boolean) : [];
  const [chosen, setChosen] = useState<string[]>(start),
    [query, setQuery] = useState("");
  // Someone who does not plan gives a task to himself only.
  if (!data.people.length) {
    const me = data.federation ? data.userId : (data.own[0] ?? "");
    return me ? <input type="hidden" name="assignee" value={start[0] ?? me} /> : null;
  }
  const q = query.trim().toLocaleLowerCase();
  const shown = data.people.filter((p) => !q || p.full_name.toLocaleLowerCase().includes(q) || chosen.includes(p.id)).slice(0, 40);
  return (
    <fieldset className="task-assignees">
      <legend>{more.assignees}</legend>
      <p className="muted small" id="task-assignees-hint">
        {more.assigneesHint}
      </p>
      <label htmlFor="task-assignee-search">
        {more.search}
        <input id="task-assignee-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-describedby="task-assignees-hint" />
      </label>
      <div className="task-assignee-list">
        {shown.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" name="assignee" value={p.id} checked={chosen.includes(p.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} />
            {p.full_name}
          </label>
        ))}
      </div>
      {!chosen.length && <p className="muted small">{more.nobody}</p>}
      {chosen.length > 1 && (
        <fieldset>
          <legend>{more.completion}</legend>
          {(["any", "each"] as const).map((m) => (
            <label key={m} className="check">
              <input type="radio" name="completion" value={m} defaultChecked={(task?.completion ?? "any") === m} />
              {m === "any" ? more.completionAny : more.completionEach}
            </label>
          ))}
        </fieldset>
      )}
    </fieldset>
  );
}

/** 2 (4): « Depuis un modèle »: a template, a reference date, each line's people, then the tasks. */
function FromTemplate({ locale, data, busy, send, close }: { locale: Locale; data: View; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean>; close: () => void }) {
  const more = todoMoreCopy[locale];
  const live = data.templates.filter((x) => !x.archived);
  const [templateId, setTemplateId] = useState(live[0]?.id ?? ""),
    [date, setDate] = useState(data.today);
  const tpl = live.find((x) => x.id === templateId);
  const due = (days: number) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  return (
    <Modal title={more.fromTemplate} close={close}>
      {!live.length ? (
        <p className="muted">{more.noTemplate}</p>
      ) : (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const assignments: Record<string, string[]> = {};
            const excluded: number[] = [];
            tpl?.items.forEach((_, n) => {
              assignments[String(n)] = f.getAll(`line-${n}`).map(String);
              if (f.get(`skip-${n}`) === "on") excluded.push(n);
            });
            void send({ action: "fromTemplate", templateId, date, assignments, excluded }).then((ok) => ok && close());
          }}
        >
          <p className="muted">{more.templateIntro}</p>
          <label htmlFor="from-template">
            {more.template}
            <select id="from-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {live.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="from-template-date">
            {more.referenceDate}
            <input id="from-template-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {tpl?.items.map((item, n) => (
            <fieldset key={`${templateId}-${n}`} className="template-line">
              <legend>{fill(more.line, { title: item.title, date: dayLabel(locale, due(item.daysBefore)) })}</legend>
              {data.people.length > 0 && (
                <div className="task-assignee-list">
                  {data.people.map((p) => (
                    <label key={p.id} className="check">
                      <input type="checkbox" name={`line-${n}`} value={p.id} />
                      {p.full_name}
                    </label>
                  ))}
                </div>
              )}
              <label className="check">
                <input type="checkbox" name={`skip-${n}`} />
                {more.skipLine}
              </label>
            </fieldset>
          ))}
          <div className="actions">
            <Button disabled={busy || !tpl}>{more.createTasks}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** 2 (6): the next twelve months, a line per category, each date with its state in words (not by colour only). */
function YearView({ locale, close }: { locale: Locale; close: () => void }) {
  const more = todoMoreCopy[locale];
  const t = todoCopy[locale];
  const [data, setData] = useState<{ items: YearItem[]; federation: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/tasks?year=1", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : { items: [], federation: false }))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => {
        if (live) setData({ items: [], federation: false });
      });
    return () => {
      live = false;
    };
  }, []);
  const months = data ? [...new Set(data.items.map((i) => i.date.slice(0, 7)))] : [];
  const monthName = (m: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-15T12:00:00Z"));
  const icon = (s: YearItem["state"]) => (s === "done" ? "check" : s === "late" ? "alert" : "clock");
  return (
    <Modal title={more.yearTitle} close={close} className="task-year-window">
      <p className="muted">{more.yearIntro}</p>
      <p>
        <a className="button secondary" href={`/api/tasks?year=pdf&locale=${locale}`}>
          <Icon name="download" size={16} /> {more.yearPdf}
        </a>
      </p>
      {!data ? (
        <p role="status">…</p>
      ) : !data.items.length ? (
        <p className="muted">{more.yearEmpty}</p>
      ) : (
        <ol className="task-year">
          {months.map((m) => (
            <li key={m}>
              <h3>{monthName(m)}</h3>
              <ul className="plain-list">
                {data.items
                  .filter((i) => i.date.startsWith(m))
                  .map((i, n) => (
                    <li key={n} className="task-year-item" data-state={i.state}>
                      <Icon name={icon(i.state)} size={16} />
                      <span>
                        {dayLabel(locale, i.date)} · <strong>{t.categories[i.category]}</strong> · {i.title}
                        {i.recurring && ` · ${more.recurring}`} · {more.states[i.state]}
                      </span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/** 2 (7, 8): after « fait », the expense to record once, or the affiliation to mark as settled. */
function AfterDone({
  locale,
  task: x,
  today,
  organizationId,
  send,
  reload,
  close,
}: {
  locale: Locale;
  task: TaskRow;
  today: string;
  organizationId: string;
  send: (b: Record<string, unknown>) => Promise<boolean>;
  reload: () => void;
  close: () => void;
}) {
  const more = todoMoreCopy[locale];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const affiliation = !!x.affiliation_due_id;
  return (
    <Modal title={affiliation ? more.affiliationTitle : more.expenseTitle} close={close}>
      <p className="muted">{affiliation ? more.affiliationText : more.expenseText}</p>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          const done = affiliation
            ? fetch("/api/affiliations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "markPaid", id: x.affiliation_due_id, paidOn: f.get("date"), createExpense: true, method: "transfer", organizationId }),
              }).then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "");
                reload();
                return true;
              })
            : send({ action: "expense", id: x.id, occurredOn: f.get("date"), amountCents: Math.round(Number(String(f.get("amount")).replace(",", ".")) * 100), label: f.get("label") });
          void done
            .then((ok) => ok && close())
            .catch((err: Error) => setError(more.errors[err.message] ?? err.message))
            .finally(() => setBusy(false));
        }}
      >
        <label htmlFor="after-date">
          {more.expenseDate}
          <input id="after-date" name="date" type="date" required defaultValue={today} max={today} />
        </label>
        {!affiliation && (
          <>
            <label htmlFor="after-amount">
              {more.amount}
              <input id="after-amount" name="amount" inputMode="decimal" required defaultValue={String((x.amount_cents ?? 0) / 100)} />
            </label>
            <label htmlFor="after-label">
              {more.expenseLabel}
              <input id="after-label" name="label" required minLength={2} maxLength={160} defaultValue={x.title.slice(0, 160)} />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <Button disabled={busy}>{affiliation ? more.affiliationSave : more.expenseSave}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {more.expenseLater}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
