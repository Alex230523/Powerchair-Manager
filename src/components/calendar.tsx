"use client";
import Link from "next/link";
import { EventList, MonthBoard, WeekGrid, colorAttrs, dayName, kindName, type ColorBy } from "./calendar-board";
import { SubscribePanel } from "./calendar-subscribe";
import { plannerCopy } from "./calendar-planner-copy";
import { Modal } from "./modal";
import { Icon } from "./icons";
import { movePeriod, planRange, type PlannerView } from "@/domains/calendar/planner";
import { DeadlineChip, LayerToggle, useMoneyDeadlines, useTournamentDays } from "./money-layer";
import { sponsorsCopy } from "./sponsors-copy";
import { attendanceCopy } from "./attendance-copy";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import type { Locale } from "@/lib/locale";
import { useScopedTeam, ApplyScope } from "./use-scope";
import { localAt, shiftLocal } from "@/domains/calendar/time";
import { kinds, visibilities } from "@/domains/calendar/schema";
import {
  calendarCopy,
  calendarCopyWeek,
  kindLabels,
  calendarErrors,
} from "./calendar-copy";
import { registrationErrors } from "./registrations-copy";
import { Badge, Button, Card, Panel, PageHeader, Segmented, Toolbar } from "./ui";
import { setupCopy } from "./setup-copy";
import { eventCopy } from "./calendar-event-copy";
import { InvitePicker, initialInvite } from "./event-invite";
import { ProgramPicker } from "./program-picker";
import { exercisesCopy } from "./exercises-copy";
import { undoToast, showToast } from "./toast";
type Place = {
  id: string;
  name: string;
  address: string;
  contact: string;
  capacity: number | null;
  cost_cents: number;
  accessible: boolean;
  toilets: boolean;
  parking: boolean;
  storage: boolean;
  charging: boolean;
  logistics: string;
  archived: boolean;
  version: number;
};
type Item = {
  id: string;
  title: string;
  kind: (typeof kinds)[number];
  custom_type: string;
  local_start: string;
  local_end: string;
  timezone: string;
  team_id: string | null;
  place_id: string | null;
  shared_venue_id: string | null;
  free_location: string;
  attendance: {
    id: string;
    name: string;
    role: string;
    response: string;
    actual: string;
  }[];
  responsible_user_id: string;
  responsible_name: string;
  visibility: (typeof visibilities)[number];
  equipment: string;
  instructions: string;
  /** A big event of the season (wave 15, C11). */
  highlight?: boolean;
  status: string;
  version: number;
  is_exception: boolean;
  canEdit: boolean;
  starts_at: string;
  ends_at: string;
  place_name: string | null;
  place_address: string | null;
  team_name: string | null;
  team_color?: string | null;
  participants: { id: string; name: string }[];
  explicitParticipants: string[];
  /** Wave 16 (E1). */
  event_type_id?: string | null;
  type_name?: string | null;
  type_color?: string | null;
  inviteGroups?: { kind: string; ref: string | null }[];
  register?: { id: string; version: number; deadline: string; closed: boolean; reminder_sent_at: string | null } | null;
  trip?: { id: string; title: string; status: string; departure_at: string | null; meeting_point: string; vehicles: number } | null;
  /** Wave 16 (E2): the training's programme (notes for staff only). */
  program?: { id: string; title: string; minutes: number; archived: boolean; notes?: string }[];
  documents: { id: string; name: string; versionId: string | null }[];
  history: {
    id: string;
    action: string;
    actor: string;
    created_at: string;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown>;
  }[];
};
type View = {
  context: {
    organization_id: string;
    name: string;
    user_id: string;
    role: string;
  };
  hasMore: boolean;
  sharedVenues: { id: string; name: string; address: string }[];
  manage: boolean;
  canPlan: boolean;
  offModules?: string[];
  events: Item[];
  eventTypes?: {
    id: string;
    name: string;
    family: string;
    legacy_kind: string;
    color: string;
    ask_response: boolean;
    default_groups: string[];
    archived: boolean;
  }[];
  recipientGroups?: { id: string; name: string }[];
  exerciseOptions?: { id: string; title: string; duration_minutes: number; objective: string }[];
  trips?: { id: string; title: string; starts_on: string; calendar_event_id: string | null }[];
  teams: { id: string; name: string; color?: string | null }[];
  places: Place[];
  profiles: { id: string; full_name: string }[];
  documentOptions: { id: string; name: string; category: string }[];
  responsibles: { id: string; name: string }[];
  feeds: {
    id: string;
    name: string;
    team_id: string | null;
    only_mine: boolean;
    include_money: boolean;
    expires_at: string;
    revoked_at: string | null;
  }[];
};
function Field({
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
const fillText = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
export function Calendar({
  locale,
  eventId,
  create = false,
  subscribe = false,
}: {
  locale: Locale;
  eventId?: string;
  /** Opens the event editor at once (the "Créer" menu of the home page). */
  create?: boolean;
  /** Opens the subscription window at once (wave 15, C9: "Bien démarrer" of players and parents). */
  subscribe?: boolean;
}) {
  const extra =
    locale === "fr"
      ? {
          subscribe: "S’abonner au calendrier",
          add: "Ajouter un événement",
          shared: "Lieu du répertoire commun",
          free: "Lieu libre (non enregistré dans le répertoire)",
          venue: "Ajouter un lieu au répertoire commun",
          public:
            "Nom et adresse visibles par les clubs et la fédération. N’indiquez aucune coordonnée privée.",
          exercise:
            "Fiches d’exercice : sélectionnez les documents à joindre à l’entraînement.",
          docs: "Gérer les documents",
          trips: "Déplacements",
          venues: "Annuaire des salles",
          coaches: "Présences des coachs",
          players: "Présences des joueurs",
          attendance: "Gérer les invitations et présences",
          empty:
            "Aucune invitation visible. Les présences ne sont pas déduites des participants.",
          location:
            "Choisissez un seul lieu : club, répertoire commun ou saisie libre.",
          more: "Page suivante",
          back: "Page précédente",
        }
      : locale === "en"
        ? {
            subscribe: "Subscribe to calendar",
            add: "Add event",
            shared: "Shared venue directory",
            free: "Free-text location (not saved in directory)",
            venue: "Add a shared venue",
            public:
              "Name and address are shared with clubs and the federation. Do not include private contact details.",
            exercise:
              "Exercise sheets: select documents to attach to the training session.",
            docs: "Manage documents",
            trips: "Trips",
            venues: "Hall directory",
            coaches: "Coach attendance",
            players: "Player attendance",
            attendance: "Manage invitations and attendance",
            empty:
              "No visible invitations. Attendance is not inferred from participants.",
            location:
              "Choose one location: club, shared directory or free text.",
            more: "Next page",
            back: "Previous page",
          }
        : {
            subscribe: "Abonneren op kalender",
            add: "Evenement toevoegen",
            shared: "Gemeenschappelijke locaties",
            free: "Vrije locatie (niet opgeslagen in het register)",
            venue: "Gedeelde locatie toevoegen",
            public:
              "Naam en adres zijn zichtbaar voor clubs en federatie. Geen privécontactgegevens.",
            exercise: "Oefenfiches: selecteer documenten voor de training.",
            docs: "Documenten beheren",
            trips: "Verplaatsingen",
            venues: "Zalengids",
            coaches: "Aanwezigheid coaches",
            players: "Aanwezigheid spelers",
            attendance: "Uitnodigingen en aanwezigheid beheren",
            empty:
              "Geen zichtbare uitnodigingen. Aanwezigheid wordt niet afgeleid van deelnemers.",
            location:
              "Kies één locatie: club, gedeeld register of vrije tekst.",
            more: "Volgende pagina",
            back: "Vorige pagina",
          };
  const t = calendarCopy[locale],
    kl = kindLabels[locale];
  const { team, setTeam, differs: teamDiffers, apply: applyTeam } = useScopedTeam();
  const [data, setData] = useState<View | null>(null),
    [anchor, setAnchorState] = useState(() =>
      localAt(new Date(), "Europe/Brussels").slice(0, 10),
    ),
    // Opened on one event: the list view spans the coming year so it is found. Under 760 px, the list too.
    [narrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 760px)").matches),
    [view, setView] = useState<PlannerView>(() => (eventId || (typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches) ? "list" : "month")),
    [kindFilter, setKindFilter] = useState(""),
    [colorBy, setColorBy] = useState<ColorBy>("team"),
    [moreDay, setMoreDay] = useState<string | null>(null),
    [editorOpen, setEditorOpen] = useState(create),
    [subscriptionOpen, setSubscriptionOpen] = useState(subscribe),
    [offset, setOffset] = useState(0),
    [place, setPlace] = useState(""),
    [selected, setSelected] = useState(eventId ?? ""),
    [placeEdit, setPlaceEdit] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [feedUrl, setFeedUrl] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    // Wave 9: an event used as a model for a new one, and the week copy result.
    [copyOf, setCopyOf] = useState<Item | null>(null),
    [copyReport, setCopyReport] = useState<string[]>([]),
    // Wave 15: the "Échéances" layer (sponsor conditions, payments, renewals, grant dates).
    [moneyLayer, setMoneyLayer] = useState(false),
    // Wave 16 (E1): the type chosen in the form, the team (invitations follow it), a deletion to confirm.
    [typeId, setTypeId] = useState(""),
    [formTeam, setFormTeam] = useState(""),
    [removing, setRemoving] = useState(false),
    [startAt, setStartAt] = useState("");
  const ev = eventCopy[locale];
  const w9 = calendarCopyWeek[locale] as (typeof calendarCopyWeek)["fr"];
  function setAnchor(value: string) {
    if (value >= "2000-01-01" && value <= "2099-12-31") setAnchorState(value);
  }
  const range = planRange(anchor, view),
    money = useMoneyDeadlines(range.from, range.to, moneyLayer),
    tournamentDays = useTournamentDays(range.from, range.to),
    dayChips = [...tournamentDays, ...money.items],
    params =
      "all=" +
      (view === "list" && !eventId ? "true" : "false") +
      "&offset=" +
      offset +
      "&from=" +
      range.from +
      "&to=" +
      range.to +
      "&team=" +
      encodeURIComponent(team) +
      "&place=" +
      encodeURIComponent(place);
  const load = useCallback(async () => {
    const r = await fetch("/api/calendar?" + params, { cache: "no-store" }),
      b = await r.json();
    if (!r.ok) throw new Error(b.error);
    setData(b);
  }, [params]);
  const errorText = useCallback(
    (code: string) =>
      (calendarErrors[code] ?? registrationErrors[code])?.[
        locale === "en" ? 2 : locale === "fr" ? 0 : 1
      ] ??
      (locale === "en"
        ? "Service unavailable. Refresh and try again."
        : locale === "fr"
          ? "Service indisponible. Actualisez puis réessayez."
          : "Dienst niet beschikbaar. Vernieuw en probeer opnieuw."),
    [locale],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calendar?" + params, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        return b;
      })
      .then((b) => {
        if (!controller.signal.aborted) setData(b);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e.message));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, errorText]);

  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      setMessage(t.saved);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  async function send(body: Record<string, unknown>) {
    const r = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: data?.context.organization_id,
        }),
      }),
      b = await r.json();
    if (!r.ok) throw new Error(b.error);
    return b as { id: string; url?: string };
  }
  function form(
    e: FormEvent<HTMLFormElement>,
    fn: (d: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void task(() => fn(d));
  }
  const event = data?.events.find((e) => e.id === selected),
    base = event ?? copyOf ?? undefined,
    venue = data?.places.find((p) => p.id === placeEdit);
  // Wave 16 (E1): the club's types and the form's type and team.
  const types = data?.eventTypes ?? [],
    formType = typeId || base?.event_type_id || types.find((x) => !x.archived)?.id || "",
    teamValue = formTeam === "-" ? "" : formTeam || base?.team_id || "";
  const count = (e: Item, response: string) => e.attendance.filter((i) => i.response === response).length;
  const answered = (e: Item) => e.attendance.some((i) => i.response !== "none" || i.actual !== "unchecked") || !!e.register?.closed;
  const mapLink = (q: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
  function edit(next: () => void) {
    setTypeId("");
    setFormTeam("");
    next();
  }
  const scopes = (
    <>
      <option value="one">{t.one}</option>
      <option value="following">{t.following}</option>
      <option value="all">{t.whole}</option>
    </>
  );
  const visible = data?.events;
  function openEvent(id: string) {
    setRemoving(false);
    setSelected(id);
    setEditorOpen(false);
  }
  function newEvent(day = anchor, hour = "") {
    setAnchor(day);
    setStartAt(hour ? `${day}T${hour}` : "");
    setCopyOf(null);
    setSelected("");
    setTypeId("");
    setFormTeam("");
    setEditorOpen(true);
    setRequestId(crypto.randomUUID());
    setTimeout(() => document.getElementById("event-title")?.focus(), 0);
  }
  // « N » opens a new event (wave 16, E1), unless typing somewhere.
  useEffect(() => {
    function key(e: globalThis.KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || !data?.canPlan || editorOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      e.preventDefault();
      newEvent();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function move(direction: number) {
    setAnchor(movePeriod(anchor, view, direction));
    setSelected("");
  }
  const when = (value: string) =>
    new Intl.DateTimeFormat(
      locale === "en" ? "en-GB" : locale === "fr" ? "fr-BE" : "nl-BE",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Brussels",
      },
    ).format(new Date(value));
  const p = plannerCopy[locale];
  const kindsShown = (data?.events ?? []).filter((e) => !kindFilter || e.kind === kindFilter);
  const fmt = (o: Intl.DateTimeFormatOptions, d: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { ...o, timeZone: "UTC" }).format(new Date(d + "T12:00Z"));
  const lastDay = shiftLocal(range.to + "T12:00", -1).slice(0, 10);
  const period =
    view === "month"
      ? fmt({ month: "long", year: "numeric" }, range.from).replace(/^./, (c) => c.toUpperCase())
      : fillText(p.weekTitle, {
          from: range.from.slice(0, 7) === lastDay.slice(0, 7) ? String(Number(range.from.slice(8))) : fmt({ day: "numeric", month: "long" }, range.from),
          to: fmt({ day: "numeric", month: "long", year: "numeric" }, lastDay),
        });
  const views: { id: PlannerView; label: string }[] = [
    { id: "week", label: p.week },
    ...(narrow ? [{ id: "days3" as PlannerView, label: p.threeDays }] : []),
    { id: "month", label: p.month },
    { id: "list", label: p.list },
  ];
  const sheetEvent = event && !editorOpen ? event : undefined;
  return (
    <>
      <main id="main" className="access calendar">
        <PageHeader
          title={t.title}
          subtitle={data?.context.name}
          actions={
            data && (
              <>
                <Link className="button secondary" href={"/" + locale + "/documents"}>{extra.docs}</Link>
                {/* Trips and halls left the menu (wave 11): they live here. */}
                {!data.offModules?.includes("trips") && (
                  <Link className="button secondary" href={"/" + locale + "/trips"}>{extra.trips}</Link>
                )}
                {data.canPlan && (
                  <Link className="button secondary" href={"/" + locale + "/venues"}>{extra.venues}</Link>
                )}
                <Link className="button secondary" href={"/" + locale + "/tournaments"}>{ev.tournaments}</Link>
                {data.canPlan && (
                  <Button icon="plus" title={ev.shortcut} aria-keyshortcuts="N" onClick={() => newEvent()}>
                    {ev.newEvent}
                  </Button>
                )}
              </>
            )
          }
        />
        <div role="status">{loading ? t.loading : message}</div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {!data && !loading && <Link href={"/" + locale + "/access"}>{t.access}</Link>}
        {data && (
          <>
            <Card
              id="calendar-agenda"
              className="calendar-card"
              title={period}
              actions={
                <div className="calendar-controls">
                  <Segmented
                    label={p.view}
                    items={views}
                    value={view}
                    onChange={(v) => {
                      setView(v as PlannerView);
                      setOffset(0);
                      setSelected("");
                    }}
                  />
                  <span className="calendar-arrows">
                    <button type="button" className="icon-button round" aria-label={p.previous} title={p.previous} onClick={() => move(-1)}>
                      <Icon name="back" size={16} />
                    </button>
                    <button type="button" className="icon-button round" aria-label={p.next} title={p.next} onClick={() => move(1)}>
                      <Icon name="arrow" size={16} />
                    </button>
                  </span>
                  <Button variant="secondary" onClick={() => setAnchor(localAt(new Date(), "Europe/Brussels").slice(0, 10))}>{p.today}</Button>
                  <Button variant="secondary" icon="calendar" onClick={() => setSubscriptionOpen(true)}>{p.subscribe}</Button>
                </div>
              }
            >
              <Toolbar label={p.filters}>
                <div className="toolbar-field">
                  <label htmlFor="calendar-date">{t.date}</label>
                  <input
                    id="calendar-date"
                    type="date"
                    min="2000-01-01"
                    max="2099-12-31"
                    required
                    value={anchor}
                    onChange={(e) => {
                      if (e.target.value) {
                        setAnchor(e.target.value);
                        setSelected("");
                      }
                    }}
                  />
                </div>
                <div className="toolbar-field">
                  <label htmlFor="calendar-kind">{p.kinds}</label>
                  <select id="calendar-kind" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
                    <option value="">{p.allKinds}</option>
                    {kinds.map((k) => (
                      <option key={k} value={k}>{kl[k]}</option>
                    ))}
                  </select>
                </div>
                <div className="toolbar-field">
                  <label htmlFor="calendar-team">{t.team}</label>
                  <select
                    id="calendar-team"
                    value={team}
                    onChange={(e) => {
                      setTeam(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">{t.all}</option>
                    {data.teams.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <ApplyScope locale={locale} differs={teamDiffers} apply={applyTeam} />
                </div>
                <div className="toolbar-field">
                  <label htmlFor="calendar-place">{t.place}</label>
                  <select
                    id="calendar-place"
                    value={place}
                    onChange={(e) => {
                      setPlace(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">{t.all}</option>
                    {data.places.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <Segmented
                  label={p.colorBy}
                  items={[
                    { id: "team", label: p.byTeam },
                    { id: "kind", label: p.byKind },
                  ]}
                  value={colorBy}
                  onChange={(v) => setColorBy(v as ColorBy)}
                />
                {money.available && <LayerToggle locale={locale} on={moneyLayer} onChange={setMoneyLayer} />}
              </Toolbar>
              {view === "week" && data.canPlan && (
                <details className="calendar-settings">
                  <summary>{w9.copyWeek}</summary>
                  <form
                    className="copy-week"
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        setCopyReport([]);
                        const r = await fetch("/api/calendar", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "copyWeek",
                            fromMonday: range.from,
                            toMonday: d.get("to"),
                            teamId: d.get("team") || null,
                            requestId: crypto.randomUUID(),
                            organizationId: data.context.organization_id,
                          }),
                        });
                        const b = await r.json();
                        if (!r.ok)
                          throw new Error(
                            b.error === "NOTHING_TO_COPY" ? "NOTHING_TO_COPY" : b.error,
                          );
                        setCopyReport([
                          w9.copied.replace("{n}", String(b.created)),
                          ...(b.skipped as { title: string; reason: string }[]).map((x) =>
                            w9.skipped
                              .replace("{title}", x.title)
                              .replace("{reason}", w9.reasons[x.reason] ?? x.reason),
                          ),
                        ]);
                      })
                    }
                  >
                    <Field id="copy-week-to" label={w9.copyTo}>
                      <input
                        id="copy-week-to"
                        name="to"
                        type="date"
                        required
                        step={7}
                        min={shiftLocal(range.from + "T12:00", 7).slice(0, 10)}
                        defaultValue={shiftLocal(range.from + "T12:00", 7).slice(0, 10)}
                        aria-describedby="copy-week-hint"
                      />
                    </Field>
                    {data.teams.length > 1 && (
                      <Field id="copy-week-team" label={w9.copyTeam}>
                        <select id="copy-week-team" name="team">
                          <option value="">{w9.allTeams}</option>
                          {data.teams.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Button disabled={busy}>{w9.copyButton}</Button>
                    <p id="copy-week-hint" className="muted small">
                      {w9.monday}
                    </p>
                  </form>
                  {copyReport.length > 0 && (
                    <ul className="plain-list" role="status">
                      {copyReport.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
              {view === "month" && (
                <MonthBoard
                  locale={locale}
                  from={range.from}
                  to={range.to}
                  events={kindsShown}
                  colorBy={colorBy}
                  onSelect={openEvent}
                  onCreate={data.canPlan ? newEvent : undefined}
                  onMore={setMoreDay}
                  deadlines={dayChips}
                />
              )}
              {(view === "week" || view === "days3") && (
                <WeekGrid locale={locale} from={range.from} days={view === "week" ? 7 : 3} events={kindsShown} colorBy={colorBy} onSelect={openEvent} deadlines={dayChips} onCreate={data.canPlan ? (d) => newEvent(d) : undefined} />
              )}
              {view === "list" && dayChips.length > 0 && (
                <ul className="deadline-list">
                  {dayChips.map((d) => (
                    <li key={d.id}>
                      <span className="muted small">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.date + "T12:00:00Z"))}</span> <DeadlineChip locale={locale} d={d} />
                    </li>
                  ))}
                </ul>
              )}
              {view === "list" && <EventList locale={locale} events={kindsShown} colorBy={colorBy} onSelect={openEvent} emptyText={t.empty} />}
              {/* Getting started (wave 15, C3): an empty calendar offers its first training. */}
              {data.manage && !kindsShown.length && (
                <p>
                  <Button onClick={() => newEvent()}>{setupCopy[locale].empty.calendar}</Button>
                </p>
              )}
              {view !== "list" && !kindsShown.length && <p className="muted">{t.empty}</p>}
              {view !== "list" && colorBy === "team" && data.teams.some((x) => x.color) && (
                <ul className="calendar-legend" aria-label={t.team}>
                  {data.teams.map((x) => (
                    <li key={x.id}>
                      <span className="team-dot" data-color={x.color ?? "none"} aria-hidden="true" />
                      {x.name}
                    </li>
                  ))}
                  <li>
                    <span className="team-dot" data-color="none" aria-hidden="true" />
                    {t.all}
                  </li>
                </ul>
              )}
              {view !== "list" && colorBy === "kind" && (
                <ul className="calendar-legend" aria-label={p.kinds}>
                  {kinds.map((k) => (
                    <li key={k}>
                      <span className="team-dot" data-kind={k} aria-hidden="true" />
                      {kl[k]}
                    </li>
                  ))}
                </ul>
              )}
              <div className="actions">
                {offset > 0 && <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - 100))}>{extra.back}</Button>}
                {data.hasMore && <Button variant="secondary" onClick={() => setOffset(offset + 100)}>{extra.more}</Button>}
              </div>
            </Card>
            {moreDay && (
              <Modal title={fillText(p.dayEvents, { day: dayName(locale, moreDay) })} close={() => setMoreDay(null)}>
                <EventList
                  locale={locale}
                  events={kindsShown.filter((e) => localAt(new Date(e.starts_at), "Europe/Brussels").slice(0, 10) <= moreDay && localAt(new Date(new Date(e.ends_at).getTime() - 1), "Europe/Brussels").slice(0, 10) >= moreDay)}
                  colorBy={colorBy}
                  onSelect={(id) => {
                    setMoreDay(null);
                    openEvent(id);
                  }}
                  emptyText={p.noDayEvents}
                />
              </Modal>
            )}
            {sheetEvent && (
              <Modal title={sheetEvent.title} close={() => setSelected("")} className="player-dialog side-sheet event-sheet">
                <div id="event-details">
                  <p className="event-sheet-badges">
                    <Badge tone={sheetEvent.status === "cancelled" ? "neutral" : "success"} dot>{sheetEvent.status === "cancelled" ? t.cancelled : t.scheduled}</Badge>{" "}
                    <span className="team-chip" {...colorAttrs(sheetEvent, "kind")}>
                      <span className="team-dot" aria-hidden="true" />
                      {kindName(locale, sheetEvent)}
                    </span>{" "}
                    {sheetEvent.team_id && (
                      <span className="team-chip" data-color={sheetEvent.team_color ?? "none"}>
                        <span className="team-dot" aria-hidden="true" />
                        {sheetEvent.team_name}
                      </span>
                    )}
                    {sheetEvent.is_exception && <Badge tone="info">{t.exception}</Badge>}
                  </p>
                  <section aria-labelledby="event-sheet-details">
                    <h3 id="event-sheet-details">{p.details}</h3>
                    <dl className="sheet-facts">
                      <div>
                        <dt>{t.start}</dt>
                        <dd>{when(sheetEvent.starts_at)}</dd>
                      </div>
                      <div>
                        <dt>{t.end}</dt>
                        <dd>{when(sheetEvent.ends_at)}</dd>
                      </div>
                      <div>
                        <dt>{t.place}</dt>
                        <dd>{[sheetEvent.place_name ?? sheetEvent.free_location, sheetEvent.place_address].filter(Boolean).join(" · ") || "…"}</dd>
                      </div>
                      <div>
                        <dt>{t.responsible}</dt>
                        <dd>{sheetEvent.responsible_name}</dd>
                      </div>
                    </dl>
                    {sheetEvent.instructions && (
                      <p>
                        <strong>{t.instructions}</strong> : {sheetEvent.instructions}
                      </p>
                    )}
                    {sheetEvent.equipment && (
                      <p>
                        <strong>{t.equipment}</strong> : {sheetEvent.equipment}
                      </p>
                    )}
                    <div className="row-actions">
                      {sheetEvent.canEdit && <Button size="sm" onClick={() => edit(() => setEditorOpen(true))}>{t.edit}</Button>}
                      {sheetEvent.canEdit && data.canPlan && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setTypeId("");
                            setFormTeam("");
                            setCopyOf(sheetEvent);
                            setSelected("");
                            setRequestId(crypto.randomUUID());
                            setEditorOpen(true);
                            setTimeout(() => document.getElementById("event-title")?.focus(), 0);
                          }}
                        >
                          {w9.duplicate}
                        </Button>
                      )}
                      {sheetEvent.canEdit && sheetEvent.status === "scheduled" && (
                        <Link className="button secondary sm" href={`/${locale}/communication?event=${sheetEvent.id}`}>{w9.mail}</Link>
                      )}
                      {sheetEvent.canEdit && sheetEvent.status === "scheduled" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            edit(() => {
                              setEditorOpen(true);
                              setTimeout(() => document.getElementById("event-invitations")?.scrollIntoView({ block: "start" }), 0);
                            })
                          }
                        >
                          {ev.inviteMore}
                        </Button>
                      )}
                      {sheetEvent.canEdit && (
                        <Button
                          size="sm"
                          variant={removing ? "danger" : "ghost"}
                          disabled={busy}
                          onClick={() => {
                            if (!removing) return setRemoving(true);
                            setRemoving(false);
                            void task(async () => {
                              await send({ action: "delete", id: sheetEvent.id, expectedVersion: sheetEvent.version });
                              setSelected("");
                              showToast({ message: ev.removed, icon: "check" });
                            });
                          }}
                        >
                          {removing ? ev.removeConfirm : ev.remove}
                        </Button>
                      )}
                    </div>
                    {removing && answered(sheetEvent) && <p className="notice">{ev.inUse}</p>}
                    {sheetEvent.trip && (
                      <p className="event-trip">
                        <strong>{ev.trip}</strong> : {sheetEvent.trip.title}
                        {sheetEvent.trip.departure_at && ` · ${ev.tripDeparture} ${when(sheetEvent.trip.departure_at)}`}
                        {sheetEvent.trip.meeting_point && ` · ${sheetEvent.trip.meeting_point}`}
                        {sheetEvent.trip.vehicles > 0 && ` · ${ev.tripVehicles(sheetEvent.trip.vehicles)}`}{" "}
                        <Link href={`/${locale}/trips/${sheetEvent.trip.id}`}>{ev.tripOpen}</Link>
                      </p>
                    )}
                  </section>
                  {!!sheetEvent.program?.length && (
                    <section aria-labelledby="event-sheet-program">
                      <h3 id="event-sheet-program">{exercisesCopy[locale].program.title}</h3>
                      <ol className="plain-list program-sheet">
                        {sheetEvent.program.map((x) => (
                          <li key={x.id}>
                            <strong>{x.title}</strong> · {x.minutes} min
                            {x.notes && <span className="muted small"> · {x.notes}</span>}
                          </li>
                        ))}
                      </ol>
                      <p>
                        {exercisesCopy[locale].program.total(sheetEvent.program.reduce((n, x) => n + x.minutes, 0))}
                        {sheetEvent.canEdit && (
                          <>
                            {" · "}
                            <Link href={`/${locale}/exercises/program/${sheetEvent.id}`}>{exercisesCopy[locale].program.print}</Link>
                          </>
                        )}
                      </p>
                    </section>
                  )}
                  <section aria-labelledby="event-sheet-invitations">
                    <h3 id="event-sheet-invitations">{p.invitations}</h3>
                    {sheetEvent.attendance.length > 0 && (
                      <p className="event-answers">
                        <strong>{ev.responses}</strong> : {ev.yes} {count(sheetEvent, "present")} · {ev.no} {count(sheetEvent, "absent")} · {ev.noAnswer} {count(sheetEvent, "none")}
                        {sheetEvent.register && !sheetEvent.register.closed && count(sheetEvent, "none") > 0 && sheetEvent.status === "scheduled" && (
                          <>
                            {" "}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                void task(async () => {
                                  const r = await fetch("/api/attendance", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "remind", id: sheetEvent.register!.id, expectedVersion: sheetEvent.register!.version, organizationId: data.context.organization_id }),
                                  });
                                  const b = await r.json().catch(() => ({}));
                                  if (!r.ok) throw new Error(b.error);
                                  showToast({ message: ev.reminded, icon: "bell" });
                                })
                              }
                            >
                              {ev.remind}
                            </Button>
                          </>
                        )}
                      </p>
                    )}
                    <div className="calendar-presences">
                      {(["coach", "player"] as const).map((role) => {
                        const rows = sheetEvent.attendance.filter((i) => i.role === role);
                        return (
                          <div key={role}>
                            <h4>{role === "coach" ? extra.coaches : extra.players}</h4>
                            {rows.length ? (
                              <ul className="plain-list">
                                {rows.map((i) => (
                                  <li key={i.id}>
                                    <strong>{i.name}</strong> · {attendanceCopy[locale].response} : {attendanceCopy[locale].responses[i.response as "none"]} · {attendanceCopy[locale].actual} : {attendanceCopy[locale].actuals[i.actual as "unchecked"]}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="muted">{extra.empty}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Link href={"/" + locale + "/attendance"}>{extra.attendance}</Link>
                    {sheetEvent.participants.length > 0 && (
                      <ul className="plain-list">
                        {sheetEvent.participants.map((x) => (
                          <li key={x.id}>{x.name}</li>
                        ))}
                      </ul>
                    )}
                    {sheetEvent.documents.length > 0 && (
                      <ul className="plain-list">
                        {sheetEvent.documents.map((d) => (
                          <li key={d.id}>
                            {d.versionId ? <a href={"/api/documents/file/" + d.versionId + "?organizationId=" + data.context.organization_id}>{d.name}</a> : d.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  {sheetEvent.canEdit && (
                    <>
                      <section aria-labelledby="event-sheet-cancel">
                        <h3 id="event-sheet-cancel">{t.cancel}</h3>
                        <form
                          onSubmit={(e) =>
                            form(e, async (d) => {
                              const r = (await send({
                                action: "cancel",
                                id: sheetEvent.id,
                                expectedVersion: sheetEvent.version,
                                scope: d.get("scope"),
                                reason: d.get("reason"),
                              })) as { undo?: string };
                              // Undo for 8 seconds (wave 15, C10): the events come back.
                              undoToast(locale, ev.cancelledToast, r.undo, data.context.organization_id, () => load());
                            })
                          }
                        >
                          <Field id="cancel-scope" label={t.scope}>
                            <select id="cancel-scope" name="scope">
                              {scopes}
                            </select>
                          </Field>
                          <Field id="cancel-reason" label={t.reason}>
                            <textarea id="cancel-reason" name="reason" required minLength={5} maxLength={1000} />
                          </Field>
                          <Button variant="danger" disabled={busy || sheetEvent.status === "cancelled"}>{t.cancelButton}</Button>
                        </form>
                      </section>
                      <section aria-labelledby="event-sheet-history">
                        <h3 id="event-sheet-history">{t.history}</h3>
                        <ol className="history-list">
                          {sheetEvent.history.map((h) => (
                            <li key={h.id}>
                              <strong>{h.action === "created" ? t.create : h.action === "cancelled" ? t.cancelled : h.action === "venue.updated" ? t.place : t.edit}</strong> · {h.actor}
                              <p className="muted small">
                                {String(h.before_data?.local_start ?? "…")} → {String(h.after_data.local_start)}
                                {!!(h.before_data?.place_name || h.after_data.place_name) && ` · ${String(h.before_data?.place_name ?? "")} → ${String(h.after_data.place_name ?? "")}`}
                              </p>
                              {!!h.after_data.reason && <p>{String(h.after_data.reason)}</p>}
                            </li>
                          ))}
                        </ol>
                      </section>
                    </>
                  )}
                </div>
              </Modal>
            )}

            {data.canPlan && editorOpen && (!selected || event?.canEdit) && (
              <div id="event-editor">
                <Panel title={event ? t.edit : t.create}>
                  <p>{t.official}</p>
                  {!event && copyOf && (
                    <p className="notice">
                      {w9.duplicating.replace("{title}", copyOf.title)}
                    </p>
                  )}
                  <form
                    key={(event?.id ?? copyOf?.id ?? requestId) + ":" + (event?.version ?? 0)}
                    className="event-form"
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        const type = types.find((x) => x.id === d.get("eventType"));
                        const body = {
                          title: d.get("title"),
                          kind: type ? type.legacy_kind : (d.get("kind") ?? "training"),
                          customType: type ? (type.legacy_kind === "custom" ? type.name : "") : (d.get("customType") ?? ""),
                          ...(type ? { eventTypeId: type.id } : {}),
                          timezone: "Europe/Brussels",
                          localStart: d.get("start"),
                          localEnd: d.get("end"),
                          fold: "reject",
                          teamId: d.get("team") || null,
                          placeId: d.get("place") || null,
                          sharedVenueId: d.get("sharedVenue") || null,
                          freeLocation: d.get("freeLocation") || "",
                          responsibleId: d.get("responsible"),
                          visibility: d.get("visibility"),
                          equipment: d.get("equipment"),
                          instructions: d.get("instructions"),
                          highlight: d.has("highlight"),
                          // People come from the invitations (groups and people one by one).
                          participants: [],
                          invite: JSON.parse(String(d.get("invite") ?? "null")) ?? undefined,
                          tripId: d.get("trip") === null ? undefined : String(d.get("trip")) || null,
                          // Wave 16 (E2): the programme, for a training.
                          exercises: d.get("exercises") === null ? undefined : JSON.parse(String(d.get("exercises"))),
                          documents: [
                            ...new Set([
                              ...d.getAll("documents"),
                              ...(type?.family === "training" && d.get("exercise") ? [d.get("exercise")] : []),
                            ]),
                          ],
                        };
                        if (event)
                          await send({
                            ...body,
                            action: "update",
                            id: event.id,
                            expectedVersion: event.version,
                            scope: d.get("scope"),
                          });
                        else
                          await send({
                            ...body,
                            action: "create",
                            intervalDays: Number(d.get("repeat")),
                            occurrences: Number(d.get("count")),
                            requestId,
                          });
                        // Saved: back to the calendar, the event in its place (its sheet stays closed).
                        setSelected("");
                        setEditorOpen(false);
                        if (!event) {
                          setRequestId(crypto.randomUUID());
                          setCopyOf(null);
                        }
                      })
                    }
                  >
                    <fieldset className="event-section">
                      <legend>{ev.sections.essential}</legend>
                      <Field id="event-title" label={t.name}>
                        <input id="event-title" name="title" required minLength={2} maxLength={160} defaultValue={base?.title} />
                      </Field>
                      {types.length ? (
                        <Field id="event-type" label={ev.type}>
                          <select id="event-type" name="eventType" value={formType} onChange={(e) => setTypeId(e.target.value)}>
                            {types
                              .filter((x) => !x.archived || x.id === base?.event_type_id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                      ) : (
                        <>
                          <Field id="event-kind" label={t.kind}>
                            <select id="event-kind" name="kind" defaultValue={base?.kind ?? "training"}>
                              {kinds.map((v) => (
                                <option key={v} value={v}>
                                  {kl[v]}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field id="event-custom" label={t.custom}>
                            <input id="event-custom" name="customType" maxLength={80} defaultValue={base?.custom_type} />
                          </Field>
                        </>
                      )}
                      <div className="form-pair">
                        <Field id="event-start" label={t.start}>
                          <input
                            id="event-start"
                            name="start"
                            type="datetime-local"
                            required
                            defaultValue={
                              event
                                ? localAt(event.starts_at, "Europe/Brussels")
                                : copyOf
                                  ? shiftLocal(localAt(copyOf.starts_at, "Europe/Brussels"), 7)
                                  : startAt || anchor + "T18:00"
                            }
                          />
                        </Field>
                        <Field id="event-end" label={t.end}>
                          <input
                            id="event-end"
                            name="end"
                            type="datetime-local"
                            required
                            defaultValue={
                              event
                                ? localAt(event.ends_at, "Europe/Brussels")
                                : copyOf
                                  ? shiftLocal(localAt(copyOf.ends_at, "Europe/Brussels"), 7)
                                  : startAt
                                    ? shiftLocal(startAt, 0).slice(0, 11) + String(Math.min(23, Number(startAt.slice(11, 13)) + 2)).padStart(2, "0") + startAt.slice(13)
                                    : anchor + "T20:00"
                            }
                          />
                        </Field>
                      </div>
                      {event ? (
                        <>
                          <Field id="event-scope" label={t.scope}>
                            <select id="event-scope" name="scope">
                              {scopes}
                            </select>
                          </Field>
                          <p className="muted small">{t.scopeHint}</p>
                        </>
                      ) : (
                        <div className="form-pair">
                          <Field id="event-repeat" label={t.repeat}>
                            <select id="event-repeat" name="repeat">
                              <option value="0">{t.once}</option>
                              <option value="1">{t.daily}</option>
                              <option value="7">{t.weekly}</option>
                              <option value="14">{t.fortnight}</option>
                            </select>
                          </Field>
                          <Field id="event-count" label={t.count}>
                            <input id="event-count" name="count" type="number" min={1} max={52} required defaultValue={1} />
                          </Field>
                        </div>
                      )}
                      <Field id="event-team" label={t.team}>
                        <select id="event-team" name="team" required={!data.manage} value={teamValue} onChange={(e) => setFormTeam(e.target.value || "-")}>
                          <option value="">{t.none}</option>
                          {data.teams.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </fieldset>
                    <fieldset className="event-section">
                      <legend>{ev.sections.place}</legend>
                      <Field id="event-place" label={t.place}>
                        <select id="event-place" name="place" defaultValue={base?.place_id ?? ""}>
                          <option value="">{t.none}</option>
                          {data.places
                            .filter((v) => !v.archived || v.id === event?.place_id)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <p className="muted small">{extra.location}</p>
                      <Field id="event-shared" label={extra.shared}>
                        <select id="event-shared" name="sharedVenue" defaultValue={base?.shared_venue_id ?? ""}>
                          <option value="">{t.none}</option>
                          {data.sharedVenues.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} · {v.address}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id="event-free" label={extra.free}>
                        <input id="event-free" name="freeLocation" maxLength={500} defaultValue={base?.free_location ?? ""} />
                      </Field>
                      {base && (base.place_address || base.free_location) && (
                        <a href={mapLink(base.place_address || base.free_location)} target="_blank" rel="noopener noreferrer">
                          {ev.openMap}
                        </a>
                      )}
                      {data.manage && (
                        <a
                          href="#shared-venue"
                          onClick={() => {
                            const el = document.getElementById("shared-venue") as HTMLDetailsElement | null;
                            if (el) el.open = true;
                          }}
                        >
                          {extra.venue}
                        </a>
                      )}
                    </fieldset>
                    <InvitePicker
                      key={(event?.id ?? copyOf?.id ?? requestId) + ":" + (event ? "" : formType)}
                      locale={locale}
                      organizationId={data.context.organization_id}
                      teamId={teamValue}
                      manage={data.manage}
                      teams={data.teams}
                      groups={data.recipientGroups ?? []}
                      profiles={data.profiles}
                      initial={initialInvite(
                        base?.inviteGroups ?? null,
                        base?.explicitParticipants ?? [],
                        base?.team_id ?? null,
                        event ? null : (types.find((x) => x.id === formType) ?? null),
                        base?.register ?? null,
                        (iso) => localAt(iso, "Europe/Brussels"),
                      )}
                    />
                    <fieldset className="event-section">
                      <legend>{ev.sections.forAll}</legend>
                      <Field id="event-instructions" label={ev.comment}>
                        <textarea id="event-instructions" name="instructions" maxLength={5000} defaultValue={base?.instructions} />
                      </Field>
                      <Field id="event-equipment" label={t.equipment}>
                        <textarea id="event-equipment" name="equipment" maxLength={2000} defaultValue={base?.equipment} />
                      </Field>
                    </fieldset>
                    {types.find((x) => x.id === formType)?.family === "training" && (
                      <ProgramPicker key={(event?.id ?? copyOf?.id ?? requestId) + ":program"} locale={locale} options={data.exerciseOptions ?? []} initial={base?.program ?? []} />
                    )}
                    {!data.offModules?.includes("trips") && (
                      <fieldset className="event-section">
                        <legend>{ev.sections.transport}</legend>
                        <Field id="event-trip" label={ev.tripLink}>
                          <select id="event-trip" name="trip" defaultValue={event?.trip?.id ?? ""}>
                            <option value="">{ev.tripNone}</option>
                            {(data.trips ?? [])
                              .filter((x) => !x.calendar_event_id || x.calendar_event_id === event?.id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.title} · {x.starts_on}
                                </option>
                              ))}
                          </select>
                        </Field>
                        {event ? (
                          !event.trip && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void task(async () => {
                                  await send({ action: "createTrip", eventId: event.id });
                                  showToast({ message: ev.tripCreated, icon: "bus" });
                                })
                              }
                            >
                              {ev.tripCreate}
                            </Button>
                          )
                        ) : (
                          <p className="muted small">{ev.tripAfterSave}</p>
                        )}
                      </fieldset>
                    )}
                    <details className="event-section">
                      <summary>{ev.sections.advanced}</summary>
                      <Field id="event-responsible" label={t.responsible}>
                        <select id="event-responsible" name="responsible" defaultValue={event?.responsible_user_id ?? data.context.user_id}>
                          {data.responsibles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id="event-visibility" label={t.visibility}>
                        <select id="event-visibility" name="visibility" defaultValue={event?.visibility ?? (data.manage ? "organization" : "team")}>
                          {(data.manage ? visibilities : (["team"] as const)).map((v) => (
                            <option key={v} value={v}>
                              {v === "team" ? t.team : v === "organization" ? t.organization : v === "staff" ? t.staff : t.selected}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="check">
                        <input type="checkbox" name="highlight" defaultChecked={!!base?.highlight} />
                        {plannerCopy[locale].highlight}
                      </label>
                      <Field
                        id="event-exercise"
                        label={locale === "fr" ? "Fiche d’exercice (entraînement uniquement)" : locale === "en" ? "Exercise sheet (training only)" : "Oefenfiche (alleen training)"}
                      >
                        <select id="event-exercise" name="exercise">
                          <option value="">{t.none}</option>
                          {data.documentOptions
                            .filter((d) => d.category === "training")
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field id="event-documents" label={t.documents}>
                        <select id="event-documents" name="documents" multiple size={3} defaultValue={base?.documents.map((d) => d.id) ?? []}>
                          {[...new Map([...data.documentOptions, ...(event?.documents ?? [])].map((d) => [d.id, d])).values()].map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <p className="muted small">{t.documentsHint}</p>
                    </details>
                    <Button disabled={busy || event?.status === "cancelled"}>{t.saveEvent}</Button>
                  </form>
                </Panel>
              </div>
            )}
            <details className="calendar-settings">
              <summary>{t.places}</summary>
              <Panel title={t.places}>
                <p>{t.placeHint}</p>
                <ul className="records">
                  {data.places.map((v) => (
                    <li key={v.id}>
                      <h3>{v.name}</h3>
                      <p>
                        {v.address} · {v.contact}
                      </p>
                      <p>
                        {v.capacity !== null && t.capacity + " : " + v.capacity}{" "}
                        · {t.cost} : {(v.cost_cents / 100).toFixed(2)}
                      </p>
                      <p>
                        {[
                          v.accessible && t.accessible,
                          v.toilets && t.toilets,
                          v.parking && t.parking,
                          v.storage && t.storage,
                          v.charging && t.charging,
                          v.archived && t.archived,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p>{v.logistics}</p>
                      {data.manage && (
                        <Button onClick={() => setPlaceEdit(v.id)}>
                          {t.edit} {v.name}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {data.manage && (
                  <>
                    <Button
                      onClick={() => setPlaceEdit("new:" + crypto.randomUUID())}
                    >
                      {t.newPlace}
                    </Button>
                    <form
                      key={placeEdit + ":" + (venue?.version ?? 0)}
                      onSubmit={(e) =>
                        form(e, async (d) => {
                          const result = await send({
                            action: "place",
                            id: venue?.id,
                            expectedVersion: venue?.version,
                            name: d.get("name"),
                            address: d.get("address"),
                            contact: d.get("contact"),
                            capacity: d.get("capacity")
                              ? Number(d.get("capacity"))
                              : null,
                            costCents: Math.round(
                              Number(d.get("cost") || 0) * 100,
                            ),
                            logistics: d.get("logistics"),
                            accessible: d.has("accessible"),
                            toilets: d.has("toilets"),
                            parking: d.has("parking"),
                            storage: d.has("storage"),
                            charging: d.has("charging"),
                            archived: d.has("archived"),
                          });
                          setPlaceEdit(result.id);
                        })
                      }
                    >
                      <Field id="place-name" label={t.placeName}>
                        <input
                          id="place-name"
                          name="name"
                          required
                          minLength={2}
                          maxLength={120}
                          defaultValue={venue?.name}
                        />
                      </Field>
                      <Field id="place-address" label={t.address}>
                        <input
                          id="place-address"
                          name="address"
                          maxLength={500}
                          defaultValue={venue?.address}
                        />
                      </Field>
                      <Field id="place-contact" label={t.contact}>
                        <input
                          id="place-contact"
                          name="contact"
                          maxLength={250}
                          defaultValue={venue?.contact}
                        />
                      </Field>
                      <Field id="place-capacity" label={t.capacity}>
                        <input
                          id="place-capacity"
                          name="capacity"
                          type="number"
                          min={1}
                          max={100000}
                          defaultValue={venue?.capacity ?? ""}
                        />
                      </Field>
                      <Field id="place-cost" label={t.cost}>
                        <input
                          id="place-cost"
                          name="cost"
                          type="number"
                          min={0}
                          max={1000000}
                          step="0.01"
                          defaultValue={venue ? venue.cost_cents / 100 : 0}
                        />
                      </Field>
                      {(
                        [
                          "accessible",
                          "toilets",
                          "parking",
                          "storage",
                          "charging",
                          "archived",
                        ] as const
                      ).map((v) => (
                        <label className="check" key={v}>
                          <input
                            type="checkbox"
                            name={v}
                            defaultChecked={venue?.[v]}
                          />
                          {t[v]}
                        </label>
                      ))}
                      <Field id="place-logistics" label={t.logistics}>
                        <textarea
                          id="place-logistics"
                          name="logistics"
                          maxLength={2000}
                          defaultValue={venue?.logistics}
                        />
                      </Field>
                      <Button disabled={busy}>{t.savePlace}</Button>
                    </form>
                  </>
                )}
              </Panel>
            </details>
            {data.manage && (
              <details id="shared-venue" className="calendar-settings">
                <summary>{extra.venue}</summary>
                <Panel title={extra.venue}>
                  <p>{extra.public}</p>
                  <form
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        await send({
                          action: "sharedVenue",
                          name: d.get("name"),
                          address: d.get("address"),
                        });
                      })
                    }
                  >
                    <Field
                      id="shared-name"
                      label={extra.shared + " · " + t.placeName}
                    >
                      <input
                        id="shared-name"
                        name="name"
                        minLength={2}
                        maxLength={120}
                        required
                      />
                    </Field>
                    <Field
                      id="shared-address"
                      label={extra.shared + " · " + t.address}
                    >
                      <input
                        id="shared-address"
                        name="address"
                        minLength={2}
                        maxLength={500}
                        required
                      />
                    </Field>
                    <Button disabled={busy}>{extra.venue}</Button>
                  </form>
                </Panel>
              </details>
            )}
            {subscriptionOpen && (
              <Modal title={p.subscribeTitle} close={() => setSubscriptionOpen(false)} className="player-dialog subscribe-dialog">
                <SubscribePanel
                  locale={locale}
                  teams={data.teams}
                  feeds={data.feeds}
                  money={money.available}
                  busy={busy}
                  url={feedUrl}
                  create={(body) =>
                    task(async () => {
                      const result = await send({ action: "feed", ...body });
                      setFeedUrl(result.url ?? "");
                    })
                  }
                  renew={(id) =>
                    task(async () => {
                      const result = await send({ action: "renewFeed", id });
                      setFeedUrl(result.url ?? "");
                    })
                  }
                  revoke={(id) =>
                    task(async () => {
                      await send({ action: "revokeFeed", id });
                      setFeedUrl("");
                    })
                  }
                />
              </Modal>
            )}

          </>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => void task(load)}>
          {t.refresh}
        </Button>
      </main>
    </>
  );
}
