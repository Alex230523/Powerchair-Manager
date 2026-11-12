"use client";
import { emptyStart } from "./empty-start-copy";
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
import { presets } from "@/domains/tasks/presets";
import { todoMoreCopy } from "./todo-more-copy";
import { boardCopy } from "./task-board-copy";
import { PlaceCombobox } from "./place-combobox";
import { tasksCopy } from "./tasks-copy";
import { fill, todoCopy } from "./todo-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Toolbar } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";
import { externalHref } from "@/lib/html";

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
  /** 12/11/2026: the club's own categories, and the order of the groups. */
  lists?: { id: string; name: string }[];
  groupOrder?: string[];
};
type BoardGroup = { key: string; category: Category; label: string; list: { id: string; name: string } | null; tasks: TaskRow[] };
/** Done at the bottom; then the order chosen by dragging; then by date, priority and title. */
const boardOrder = (a: TaskRow, b: TaskRow) =>
  Number(a.status === "done") - Number(b.status === "done") ||
  (a.board_position ?? 1e9) - (b.board_position ?? 1e9) ||
  (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") ||
  Number(b.priority === "high") - Number(a.priority === "high") ||
  a.title.localeCompare(b.title);
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
  // 12/11/2026: the next season is prepared from the seasons' settings.
  if (t.source_kind === "seasonNext") return at(`/settings/seasons`);
  // 18: a hall's booking, its follow-up, its invoice, a change to tell.
  if (t.source_kind?.startsWith("venue")) return at(`/venues#bookings`);
  // « Fin de coach »: a step of a departure opens the coach's file.
  if (t.source_kind === "offboarding" && t.source_params?.profile) return at(`/coaches/${t.source_params.profile}#departure`);
  // 34: a fine of the federation.
  if (t.source_kind === "disciplineFine") return at(`/discipline#fines`);
  if (t.source_kind === "federationFine") return at(`/funding/affiliations#fines`);
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
    // 04/11/2026: a ticked task stays, struck through; hiding the done ones is a choice.
    [showDone, setShowDone] = useState(true),
    [opened, setOpened] = useState<Record<string, boolean>>({}),
    [editing, setEditing] = useState<null | { category: Category } | TaskRow>(null),
    [detail, setDetail] = useState<string | null>(openTask ?? null),
    [year, setYear] = useState(false),
    [yearView, setYearView] = useState(false),
    [fromTemplate, setFromTemplate] = useState(false),
    [after, setAfter] = useState<TaskRow | null>(null),
    [asked, setAsked] = useState(create),
    // 12/11/2026: the board: the task dragged, where it would land, the windows of a row.
    [drag, setDrag] = useState<string | null>(null),
    [over, setOver] = useState<{ group: string; id: string | null; after: boolean } | null>(null),
    [assigning, setAssigning] = useState<string | null>(null),
    [packing, setPacking] = useState<string | null>(null),
    [listEdit, setListEdit] = useState<{ id: string | null; name: string } | null>(null),
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
  // What is done goes down the list, still visible.
  rows.sort((p, q) => Number(p.status === "done") - Number(q.status === "done"));
  // 12/11/2026: the board: the platform's categories and the club's own lists, in the club's order; inside, the order chosen by dragging.
  const bc = boardCopy[locale];
  const baseGroups: BoardGroup[] = (data.federation ? federationCategories : clubCategories).map((c) => ({ key: `cat:${c}`, category: c as Category, label: t.categories[c as Category], list: null, tasks: [] }));
  const listGroups: BoardGroup[] = data.federation ? [] : (data.lists ?? []).map((l) => ({ key: `list:${l.id}`, category: "other" as Category, label: l.name, list: l, tasks: [] }));
  const everyGroup = [...baseGroups, ...listGroups];
  const rank = (k: string) => {
    const n = (data.groupOrder ?? []).indexOf(k);
    return n < 0 ? 1000 + everyGroup.findIndex((g) => g.key === k) : n;
  };
  everyGroup.sort((a, b) => rank(a.key) - rank(b.key));
  const inGroup = (g: BoardGroup, x: TaskRow) => (g.list ? x.list_id === g.list.id : !x.list_id && x.category === g.category);
  const groups = everyGroup
    .map((g) => ({ ...g, tasks: rows.filter((x) => inGroup(g, x)).sort(boardOrder) }))
    .filter((g) => (category === "all" || g.category === category) && (!(embedded || linked) || g.tasks.length > 0));
  const send = (body: Record<string, unknown>) => post({ ...body, organizationId: data.organization_id }, t.saved);
  /** A group one step up or down; the whole order is kept by the club. */
  const moveGroup = (key: string, step: number) => {
    const keys = groups.map((g) => g.key);
    const n = keys.indexOf(key);
    if (n < 0 || n + step < 0 || n + step >= keys.length) return;
    [keys[n], keys[n + step]] = [keys[n + step], keys[n]];
    const rest = everyGroup.map((g) => g.key).filter((k) => !keys.includes(k));
    void send({ action: "groupOrder", order: [...keys, ...rest] });
  };
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
  const assigningTask = assigning ? data.tasks.find((x) => x.id === assigning) : undefined;
  const packingTask = packing ? data.tasks.find((x) => x.id === packing) : undefined;
  // Dragging and the group tools: for whoever plans, on the full page.
  const board = data.can.manage && !embedded && !linked;
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
        <>
          {groups.map((g, gi) => {
            const open = g.tasks.filter((x) => x.status !== "done").length,
              late = g.tasks.filter((x) => isLate(x, data.today)).length,
              done = g.tasks.length - open;
            const id = g.list ? `tasks-list-${g.list.id}` : `tasks-${g.category}`;
            const ids = g.tasks.map((x) => x.id);
            /** The group's new order after a drop or a move, sent at once. */
            const place = (moving: string, before: string | null) => {
              const rest = ids.filter((x) => x !== moving);
              const at = before ? rest.indexOf(before) : rest.length;
              rest.splice(at < 0 ? rest.length : at, 0, moving);
              void send({ action: "reorder", group: g.key, ids: rest });
            };
            return (
              <details
                key={g.key}
                className="task-group"
                id={id}
                data-drop-group={drag && over?.group === g.key && over.id === null ? "" : undefined}
                open={opened[g.key] ?? (embedded || open > 0 || category === g.category)}
                onToggle={(e) => {
                  const now = e.currentTarget.open;
                  setOpened((o) => (o[g.key] === now ? o : { ...o, [g.key]: now }));
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  if (!(e.target as HTMLElement).closest(".task-row")) setOver({ group: g.key, id: null, after: true });
                }}
                onDrop={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  const target = over && over.group === g.key ? over : { group: g.key, id: null, after: true };
                  const before = target.id ? (target.after ? (ids[ids.indexOf(target.id) + 1] ?? null) : target.id) : null;
                  if (before !== drag) place(drag, before);
                  setDrag(null);
                  setOver(null);
                }}
              >
                <summary>
                  <span className="task-group-name">{g.label}</span>
                  <span className="task-group-count muted small">{fill(bc.doneCount, { done, total: g.tasks.length })}</span>
                  <Badge>{fill(t.openCount, { n: open })}</Badge>
                  {late > 0 && (
                    <Badge tone="danger">
                      <Icon name="alert" size={14} /> {fill(t.lateCount, { n: late })}
                    </Badge>
                  )}
                </summary>
                {board && (
                  <div className="task-group-tools">
                    <button type="button" className="icon-button sm" aria-label={fill(bc.groupUp, { name: g.label })} title={fill(bc.groupUp, { name: g.label })} disabled={busy || gi === 0} onClick={() => moveGroup(g.key, -1)}>
                      <Icon name="arrowUp" size={16} />
                    </button>
                    <button type="button" className="icon-button sm" aria-label={fill(bc.groupDown, { name: g.label })} title={fill(bc.groupDown, { name: g.label })} disabled={busy || gi === groups.length - 1} onClick={() => moveGroup(g.key, 1)}>
                      <Icon name="arrowDown" size={16} />
                    </button>
                    {g.list && (
                      <>
                        <button type="button" className="icon-button sm" aria-label={fill(bc.renameCategory, { name: g.label })} title={fill(bc.renameCategory, { name: g.label })} onClick={() => setListEdit({ id: g.list!.id, name: g.list!.name })}>
                          <Icon name="pencil" size={16} />
                        </button>
                        <button type="button" className="icon-button sm" aria-label={fill(bc.deleteCategory, { name: g.label })} title={fill(bc.deleteCategory, { name: g.label })} disabled={busy} onClick={() => void send({ action: "deleteList", id: g.list!.id })}>
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
                {g.tasks.length ? (
                  <ul className="task-list task-page task-board">
                    {g.tasks.map((x, n) => (
                      <TaskItem
                        key={x.id}
                        locale={locale}
                        task={x}
                        today={data.today}
                        busy={busy}
                        work={canWork(x)}
                        tick={tick}
                        details={() => setDetail(x.id)}
                        edit={canWork(x) && (canAdd(x.category) || mineTask(x)) ? () => setEditing(x) : undefined}
                        assign={canWork(x) && !data.federation ? () => setAssigning(x.id) : undefined}
                        materials={canWork(x) ? () => setPacking(x.id) : undefined}
                        board={
                          board
                            ? {
                                drop: over && over.id === x.id ? (over.after ? "after" : "before") : undefined,
                                dragging: drag === x.id,
                                start: () => setDrag(x.id),
                                end: () => {
                                  setDrag(null);
                                  setOver(null);
                                },
                                over: (after: boolean) => setOver((o) => (o && o.id === x.id && o.after === after && o.group === g.key ? o : { group: g.key, id: x.id, after })),
                                up: n > 0 ? () => place(x.id, ids[n - 1]) : undefined,
                                down: n < ids.length - 1 ? () => place(x.id, ids[n + 2] ?? null) : undefined,
                                to: groups.filter((o) => o.key !== g.key && canAdd(o.category)).map((o) => ({ key: o.key, label: o.label })),
                                moveTo: (key: string) => void send({ action: "reorder", group: key, ids: [...(groups.find((o) => o.key === key)?.tasks.map((y) => y.id) ?? []), x.id] }),
                              }
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{view === "mine" ? t.emptyMine : t.empty}</p>
                )}
                {canAdd(g.category) && <QuickAdd locale={locale} category={g.category} listId={g.list?.id ?? null} label={g.label} people={data.federation ? null : data.people} busy={busy} send={send} />}
              </details>
            );
          })}
          {board && !data.federation && (
            <p className="task-new-category">
              <Button variant="secondary" icon="plus" onClick={() => setListEdit({ id: null, name: "" })}>
                {bc.newCategory}
              </Button>
            </p>
          )}
        </>
      ) : (
        <EmptyState
          title={view === "mine" || embedded ? t.emptyMine : t.empty}
          // Point 19: the way to start, right there.
          action={
            !embedded && all.some(canAdd) ? (
              <Button icon="plus" onClick={() => setEditing({ category: all.find(canAdd)! })}>
                {emptyStart[locale]}
              </Button>
            ) : undefined
          }
        />
      )}
      {assigningTask && (
        <AssignWindow locale={locale} task={assigningTask} people={data.people} own={data.can.manage ? null : data.own} busy={busy} send={send} close={() => setAssigning(null)} />
      )}
      {packingTask && <MaterialsWindow locale={locale} task={packingTask} busy={busy} send={send} close={() => setPacking(null)} />}
      {listEdit && (
        <Modal title={listEdit.id ? fill(bc.renameCategory, { name: listEdit.name }) : bc.newCategory} close={() => setListEdit(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              void send({ action: "saveList", id: listEdit.id, name }).then((ok) => ok && setListEdit(null));
            }}
          >
            <label htmlFor="task-list-name">
              {bc.categoryName}
              <input id="task-list-name" name="name" required minLength={2} maxLength={80} defaultValue={listEdit.name} />
            </label>
            <div className="actions">
              <Button disabled={busy}>{bc.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setListEdit(null)}>
                {bc.cancel}
              </Button>
            </div>
          </form>
        </Modal>
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
          remove={data.can.manage && !embedded && current.kind !== "sponsor" && current.kind !== "grant" && !current.source_kind}
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

type BoardRow = {
  /** The coloured line where the dragged task would land. */
  drop?: "before" | "after";
  dragging: boolean;
  start: () => void;
  end: () => void;
  over: (after: boolean) => void;
  up?: () => void;
  down?: () => void;
  to: { key: string; label: string }[];
  moveTo: (key: string) => void;
};
/**
 * 12/11/2026: one row of the board, like a checklist: the handle to drag (or
 * to move with the arrows), the box to tick, the title and its date, then the
 * people in charge, the material and the edit, each in one click.
 */
function TaskItem({
  locale,
  task: x,
  today,
  busy,
  work,
  tick,
  details,
  edit,
  assign,
  materials,
  board,
}: {
  locale: Locale;
  task: TaskRow;
  today: string;
  busy: boolean;
  work: boolean;
  tick: (x: TaskRow, done: boolean) => Promise<boolean>;
  details: () => void;
  edit?: () => void;
  assign?: () => void;
  materials?: () => void;
  board?: BoardRow;
}) {
  const t = todoCopy[locale];
  const more = todoMoreCopy[locale];
  const bc = boardCopy[locale];
  const [menu, setMenu] = useState(false);
  const progress = x.completion === "each" && (x.assignees ?? []).length > 1 ? progressOf(x.assignees) : null;
  const rule = recurrenceText(locale, x.recurrence, x.due_on, x.recurrence_until);
  const title = titleOf(locale, x);
  const link = href(locale, x);
  const ticked = x.checklist.filter((i) => i.done).length;
  const names = namesOf(x);
  return (
    <li
      className="task-row"
      data-status={x.status}
      data-priority={x.priority}
      data-drop={board?.drop}
      data-dragging={board?.dragging ? "" : undefined}
      draggable={!!board}
      onDragStart={(e) => {
        if (!board) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", x.id);
        board.start();
      }}
      onDragEnd={() => board?.end()}
      onDragOver={(e) => {
        if (!board) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        board.over(e.clientY > r.top + r.height / 2);
      }}
    >
      {board && (
        <span className="task-grip-wrap">
          <button
            type="button"
            className="icon-button sm task-grip"
            aria-label={fill(bc.move, { title })}
            title={bc.moveHelp}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" && board.up) {
                e.preventDefault();
                board.up();
              } else if (e.key === "ArrowDown" && board.down) {
                e.preventDefault();
                board.down();
              }
            }}
          >
            <Icon name="grip" size={16} />
          </button>
          {menu && (
            <span className="task-move-menu" role="group" aria-label={fill(bc.move, { title })}>
              <Button type="button" variant="secondary" size="sm" icon="arrowUp" disabled={busy || !board.up} onClick={() => (board.up?.(), setMenu(false))}>
                {bc.moveUp}
              </Button>
              <Button type="button" variant="secondary" size="sm" icon="arrowDown" disabled={busy || !board.down} onClick={() => (board.down?.(), setMenu(false))}>
                {bc.moveDown}
              </Button>
              {board.to.length > 0 && (
                <label>
                  {bc.moveTo}
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) board.moveTo(e.target.value);
                      setMenu(false);
                    }}
                  >
                    <option value="" />
                    {board.to.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </span>
          )}
        </span>
      )}
      <input
        type="checkbox"
        className="task-tick"
        checked={x.status === "done"}
        disabled={busy || !work}
        aria-label={fill(x.status === "done" ? t.untickOf : t.tickOf, { title })}
        onChange={(e) => void tick(x, e.target.checked)}
      />
      <div className="task-main">
        <button type="button" className="task-title-button" aria-label={fill(t.detailsOf, { title })} onClick={details}>
          <span className="task-title">{title}</span>
        </button>
        {/* A light line: when, who, and late; the rest is in the task's window. */}
        <p className="task-meta muted small">
          <span className="task-chip">
            <Icon name="calendar" size={14} /> {x.due_on ? fill(bc.dueFor, { day: dayLabel(locale, x.due_on) }) : t.noDate}
          </span>
          {x.priority === "high" && <Badge tone="warning">{t.priorities.high}</Badge>}
          {x.status === "doing" && <Badge tone="info">{t.statuses.doing}</Badge>}
          {isLate(x, today) && x.status !== "done" && (
            <Badge tone="danger">
              <Icon name="alert" size={14} /> {t.views.late}
            </Badge>
          )}
          {x.about && link && (
            <Link href={link} aria-label={fill(t.openOf, { about: x.about })}>
              {x.about}
            </Link>
          )}
          {names && <span>{names}</span>}
          {progress && <span>{fill(more.progress, { done: progress.done, total: progress.total })}</span>}
          {rule && (
            <span className="task-rule" title={rule}>
              <Icon name="clock" size={14} />
              <span className="sr-only">{rule}</span>
            </span>
          )}
          {x.checklist.length > 0 && <span>{`${ticked}/${x.checklist.length}`}</span>}
          {(x.materials ?? []).length > 0 && <span className="task-materials">{x.materials.join(", ")}</span>}
        </p>
      </div>
      <span className="task-actions">
        {assign && (
          <button type="button" className="icon-button sm" aria-label={fill(bc.assign, { title })} title={fill(bc.assign, { title })} onClick={assign}>
            <Icon name="userPlus" size={16} />
          </button>
        )}
        {materials && (
          <button type="button" className="icon-button sm" aria-label={fill(bc.materials, { title })} title={fill(bc.materials, { title })} onClick={materials}>
            <Icon name="package" size={16} />
            {(x.materials ?? []).length > 0 && <span className="task-action-count">{x.materials.length}</span>}
          </button>
        )}
        {edit && (
          <button type="button" className="icon-button sm" aria-label={fill(bc.edit, { title })} title={fill(bc.edit, { title })} onClick={edit}>
            <Icon name="pencil" size={16} />
          </button>
        )}
      </span>
    </li>
  );
}

/** 12/11/2026: who takes care of a task, from its row. */
function AssignWindow({ locale, task, people, own, busy, send, close }: { locale: Locale; task: TaskRow; people: Person[]; own: string[] | null; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean>; close: () => void }) {
  const bc = boardCopy[locale];
  const title = titleOf(locale, task);
  const current = new Set((task.assignees ?? []).map((a) => a.profile_id).filter(Boolean) as string[]);
  // Not planning: one only takes the task for oneself.
  const shown = own ? people.filter((p) => own.includes(p.id)) : people;
  return (
    <Modal title={bc.assignTitle} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const ids = new FormData(e.currentTarget).getAll("who").map(String);
          void send({ action: "assign", id: task.id, assignees: ids }).then((ok) => ok && close());
        }}
      >
        <p className="muted">{title}</p>
        {shown.length ? (
          <fieldset className="task-assignee-list">
            <legend className="sr-only">{bc.assignTitle}</legend>
            {shown.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" name="who" value={p.id} defaultChecked={current.has(p.id)} />
                {p.full_name}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="muted">{bc.assignNone}</p>
        )}
        <div className="actions">
          <Button disabled={busy}>{bc.save}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {bc.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** 12/11/2026: what to bring for a task. */
function MaterialsWindow({ locale, task, busy, send, close }: { locale: Locale; task: TaskRow; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean>; close: () => void }) {
  const bc = boardCopy[locale];
  const [items, setItems] = useState<string[]>(task.materials ?? []);
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v) && items.length < 30) setItems([...items, v.slice(0, 120)]);
    setDraft("");
  };
  return (
    <Modal title={bc.materialsTitle} close={close}>
      <div className="stack-form">
        <p className="muted">
          {titleOf(locale, task)} · {bc.materialsIntro}
        </p>
        {items.length > 0 && (
          <ul className="task-material-list">
            {items.map((m) => (
              <li key={m}>
                <span>{m}</span>
                <button type="button" className="icon-button sm" aria-label={fill(bc.materialsRemove, { item: m })} title={fill(bc.materialsRemove, { item: m })} onClick={() => setItems(items.filter((x) => x !== m))}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="task-material-add">
          <label htmlFor="task-material-new" className="sr-only">
            {bc.materialsLabel}
          </label>
          <input
            id="task-material-new"
            maxLength={120}
            placeholder={bc.materialsLabel}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="secondary" icon="plus" onClick={add}>
            {bc.materialsAdd}
          </Button>
        </div>
        <div className="actions">
          <Button type="button" disabled={busy} onClick={() => void send({ action: "materials", id: task.id, items }).then((ok) => ok && close())}>
            {bc.save}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {bc.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function QuickAdd({ locale, category, listId = null, label, people, busy, send }: { locale: Locale; category: Category; listId?: string | null; label?: string; people: Person[] | null; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = todoCopy[locale];
  const more = todoMoreCopy[locale];
  const bc = boardCopy[locale];
  const id = listId ? `quick-list-${listId}` : `quick-${category}`;
  const name = label ?? t.categories[category];
  return (
    <form
      className="task-quick"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const title = String(f.get("title") ?? "").trim();
        if (title.length < 2) return;
        // 04/11/2026: the person(s) in charge, a place and a date, right when adding.
        const crew = f.getAll("assignee").map(String).filter(Boolean);
        void send({
          action: "create",
          category,
          ...(listId ? { listId } : {}),
          title,
          dueOn: f.get("due") || null,
          freeLocation: String(f.get("where") ?? "").trim(),
          ...(crew.length ? { assignees: crew } : {}),
        }).then((ok) => ok && form.reset());
      }}
    >
      <div className="task-quick-main">
        <label htmlFor={id} className="sr-only">
          {fill(t.quickLabel, { category: name })}
        </label>
        <input id={id} name="title" required minLength={2} maxLength={200} placeholder={bc.quickPlaceholder} />
        <label htmlFor={id + "-due"} className="sr-only">
          {bc.quickDate}
        </label>
        <input id={id + "-due"} name="due" type="date" className="task-quick-date" />
        <Button icon="plus" disabled={busy} aria-label={fill(t.quickAdd, { category: name })}>
          {t.add}
        </Button>
      </div>
      <details className="task-quick-more">
        <summary>{more.quickMore}</summary>
        <div className="task-quick-fields">
          {people && people.length > 0 && (
            <label>
              {t.responsible}
              <select name="assignee" multiple size={Math.min(4, people.length)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {more.quickWhere}
            <input name="where" maxLength={200} />
          </label>
        </div>
      </details>
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
  remove = false,
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
  remove?: boolean;
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
            <a className="button secondary" href={externalHref(x.link_url)} target="_blank" rel="noopener noreferrer">
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
          {/* The status and the removal live here, not on every line of the list. */}
          {(work || remove) && (
            <div className="actions task-detail-tools">
              {work && (
                <label className="compact-field">
                  {fill(t.statusOf, { title })}
                  <select value={x.status} disabled={busy} onChange={(e) => void send({ action: "status", id: x.id, status: e.target.value as Status })}>
                    {(["todo", "doing", "done"] as const).map((st) => (
                      <option key={st} value={st}>
                        {t.statuses[st]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {remove && (
                <Button
                  type="button"
                  variant="ghost"
                  icon="trash"
                  disabled={busy}
                  onClick={() => void send({ action: "delete", id: x.id }).then((ok) => ok && close())}
                >
                  {fill(t.removeOf, { title })}
                </Button>
              )}
            </div>
          )}
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
  // 12/11/2026: the ready-made lists (match at home or away, assembly, discovery day, fundraising) too.
  const ready = presets.filter((p) => !data.templates.some((x) => x.name === p.name[locale]));
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
      {suggested.length + ready.length > 0 && (
        <div className="affiliation-examples">
          <p className="muted">{t.suggested}</p>
          {suggested.map((s) => (
            <Button key={s.key} variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "saveTemplate", kind: s.kind, name: s.name, items: s.items })}>
              {fill(t.addSuggested, { name: s.name })}
            </Button>
          ))}
          {ready.map((p) => (
            <Button key={p.key} variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "copyPreset", preset: p.key, locale, name: p.name[locale] })}>
              {fill(t.addSuggested, { name: p.name[locale] })}
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
  // 12/11/2026: the ready-made lists are offered beside the club's own templates.
  const [templateId, setTemplateId] = useState(live[0]?.id ?? `preset:${presets[0].key}`),
    [date, setDate] = useState(data.today);
  const preset = templateId.startsWith("preset:") ? presets.find((p) => `preset:${p.key}` === templateId) : undefined;
  const tpl = preset ? { items: preset.items.map((x) => ({ title: x.title[locale], detail: "", daysBefore: x.daysBefore })) } : live.find((x) => x.id === templateId);
  const due = (days: number) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  return (
    <Modal title={more.fromTemplate} close={close}>
      {
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
            void send(preset ? { action: "fromPreset", preset: preset.key, locale, date, assignments, excluded } : { action: "fromTemplate", templateId, date, assignments, excluded }).then((ok) => ok && close());
          }}
        >
          <p className="muted">{more.templateIntro}</p>
          <label htmlFor="from-template">
            {more.template}
            <select id="from-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {live.length > 0 && (
                <optgroup label={boardCopy[locale].ownTemplates}>
                  {live.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={boardCopy[locale].readyTemplates}>
                {presets.map((p) => (
                  <option key={p.key} value={`preset:${p.key}`}>
                    {p.name[locale]}
                  </option>
                ))}
              </optgroup>
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
      }
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
