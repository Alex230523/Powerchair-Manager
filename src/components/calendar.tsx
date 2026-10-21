"use client";
import Link from "next/link";
import { CalendarBoard } from "./calendar-board";
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
import { Button, Panel, PageHeader } from "./ui";
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
  teams: { id: string; name: string; color?: string | null }[];
  places: Place[];
  profiles: { id: string; full_name: string }[];
  documentOptions: { id: string; name: string; category: string }[];
  responsibles: { id: string; name: string }[];
  feeds: {
    id: string;
    name: string;
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
function dates(anchor: string, view: string) {
  if (view === "month") {
    const from = anchor.slice(0, 7) + "-01",
      d = new Date(from + "T12:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    return { from, to: d.toISOString().slice(0, 10) };
  }
  if (view === "week") {
    const weekday = new Date(anchor + "T12:00Z").getUTCDay(),
      from = shiftLocal(anchor + "T12:00", -(weekday + 6) % 7).slice(0, 10);
    return { from, to: shiftLocal(from + "T12:00", 7).slice(0, 10) };
  }
  return { from: anchor, to: shiftLocal(anchor + "T12:00", 31).slice(0, 10) };
}
export function Calendar({
  locale,
  eventId,
}: {
  locale: Locale;
  eventId?: string;
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
          attendance: "Gérer les convocations et présences",
          empty:
            "Aucune convocation visible. Les présences ne sont pas déduites des participants.",
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
            attendance: "Oproepen en aanwezigheid beheren",
            empty:
              "Geen zichtbare oproepen. Aanwezigheid wordt niet afgeleid van deelnemers.",
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
    // Opened on one event: the list view spans the coming year so it is found.
    [view, setView] = useState(eventId ? "list" : "month"),
    [editorOpen, setEditorOpen] = useState(false),
    [subscriptionOpen, setSubscriptionOpen] = useState(false),
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
    [copyReport, setCopyReport] = useState<string[]>([]);
  const w9 = calendarCopyWeek[locale] as (typeof calendarCopyWeek)["fr"];
  function setAnchor(value: string) {
    if (value >= "2000-01-01" && value <= "2099-12-31") setAnchorState(value);
  }
  const range = dates(anchor, view),
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
  const scopes = (
    <>
      <option value="one">{t.one}</option>
      <option value="following">{t.following}</option>
      <option value="all">{t.whole}</option>
    </>
  );
  const visible = data?.events;
  function openEvent(id: string) {
    setSelected(id);
    setEditorOpen(false);
    setTimeout(
      () =>
        document
          .getElementById("event-details")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }
  function newEvent(day = anchor) {
    setAnchor(day);
    setCopyOf(null);
    setSelected("");
    setEditorOpen(true);
    setRequestId(crypto.randomUUID());
    setTimeout(() => document.getElementById("event-title")?.focus(), 0);
  }
  function move(direction: number) {
    if (view === "month") {
      const d = new Date(anchor.slice(0, 7) + "-01T12:00Z");
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    } else
      setAnchor(
        shiftLocal(
          anchor + "T12:00",
          direction * (view === "week" ? 7 : 31),
        ).slice(0, 10),
      );
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
  return (
    <>
      <main id="main" className="access calendar">
        <PageHeader title={t.title} />

        <div role="status">{loading ? t.loading : message}</div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {!data && !loading && (
          <Link href={"/" + locale + "/access"}>{t.access}</Link>
        )}
        {data && (
          <>
            <p className="notice">{data.context.name}</p>
            <div className="actions">
              {data.canPlan && (
                <Button onClick={() => newEvent()}>{extra.add}</Button>
              )}
              <a
                href="#calendar-subscribe"
                onClick={() => setSubscriptionOpen(true)}
              >
                {extra.subscribe}
              </a>
              <Link href={"/" + locale + "/documents"}>{extra.docs}</Link>
              {/* Trips and halls left the menu (wave 11): they live here. */}
              {!data.offModules?.includes("trips") && (
                <Link className="button secondary" href={"/" + locale + "/trips"}>
                  {extra.trips}
                </Link>
              )}
              {data.canPlan && (
                <Link className="button secondary" href={"/" + locale + "/venues"}>
                  {extra.venues}
                </Link>
              )}
            </div>
            <Panel title={t.agenda}>
              <h3 className="calendar-period">
                {new Intl.DateTimeFormat(locale, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(anchor + "T12:00Z"))}
              </h3>
              <div className="calendar-toolbar">
                <Field id="calendar-date" label={t.date}>
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
                </Field>
                <Field id="calendar-view" label={t.view}>
                  <select
                    id="calendar-view"
                    value={view}
                    onChange={(e) => {
                      setView(e.target.value);
                      setOffset(0);
                      setSelected("");
                    }}
                  >
                    {["list", "month", "week"].map((v) => (
                      <option key={v} value={v}>
                        {t[v as "list" | "month" | "week" | "agenda"]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="actions" hidden={view === "list"}>
                  <Button
                    aria-label={t.previous}
                    title={t.previous}
                    onClick={() => move(-1)}
                  >
                    ‹
                  </Button>
                  <Button
                    aria-label={t.next}
                    title={t.next}
                    onClick={() => move(1)}
                  >
                    ›
                  </Button>
                </div>
                <Field id="calendar-team" label={t.team}>
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
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                <ApplyScope locale={locale} differs={teamDiffers} apply={applyTeam} />
                </Field>
                <Field id="calendar-place" label={t.place}>
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
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
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
              {view !== "list" && (
                <CalendarBoard
                  locale={locale}
                  view={view}
                  from={range.from}
                  to={range.to}
                  events={data.events}
                  onSelect={openEvent}
                  onCreate={data.canPlan ? newEvent : undefined}
                />
              )}
              {view !== "list" && data.teams.some((x) => x.color) && (
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
              <ul
                hidden={view !== "list"}
                className={
                  "records " + (view === "week" ? "calendar-week" : "")
                }
              >
                {visible?.map((e) => (
                  <li key={e.id}>
                    <Button onClick={() => openEvent(e.id)}>
                      {e.title} ·{" "}
                      {e.status === "cancelled" ? t.cancelled : t.scheduled}
                    </Button>
                    <p>
                      {when(e.starts_at)} → {when(e.ends_at)}
                    </p>
                    <p>
                      {e.team_id && (
                        <span className="team-chip" data-color={e.team_color ?? "none"}>
                          <span className="team-dot" aria-hidden="true" />
                          {e.team_name}
                        </span>
                      )}{" "}
                      {e.place_name && " · " + e.place_name}
                    </p>
                    {e.is_exception && <p>{t.exception}</p>}
                  </li>
                ))}
              </ul>
              {!visible?.length && <p>{t.empty}</p>}
              <div className="actions">
                {offset > 0 && (
                  <Button onClick={() => setOffset(Math.max(0, offset - 100))}>
                    {extra.back}
                  </Button>
                )}
                {data.hasMore && (
                  <Button onClick={() => setOffset(offset + 100)}>
                    {extra.more}
                  </Button>
                )}
              </div>
            </Panel>
            {event && (
              <div id="event-details">
                <Panel title={event.title}>
                  <div className="actions">
                    {event.canEdit && (
                      <Button onClick={() => setEditorOpen(true)}>
                        {t.edit}
                      </Button>
                    )}
                    {event.canEdit && data.canPlan && (
                      <Button
                        onClick={() => {
                          setCopyOf(event);
                          setSelected("");
                          setRequestId(crypto.randomUUID());
                          setEditorOpen(true);
                          setTimeout(
                            () => document.getElementById("event-title")?.focus(),
                            0,
                          );
                        }}
                      >
                        {w9.duplicate}
                      </Button>
                    )}
                    {event.canEdit && event.status === "scheduled" && (
                      <Link href={`/${locale}/communication?event=${event.id}`}>
                        {w9.mail}
                      </Link>
                    )}
                    <Button onClick={() => setSelected("")}>
                      {locale === "fr"
                        ? "Fermer"
                        : locale === "en"
                          ? "Close"
                          : "Sluiten"}
                    </Button>
                  </div>
                  <p>
                    {event.status === "cancelled" ? t.cancelled : t.scheduled} ·{" "}
                    {event.kind === "custom"
                      ? event.custom_type
                      : kl[event.kind]}
                  </p>
                  <p>
                    {when(event.starts_at)} → {when(event.ends_at)}
                  </p>

                  <p>
                    {event.place_name} · {event.place_address}
                  </p>
                  <p>
                    {t.responsible} : {event.responsible_name}
                  </p>
                  <p>
                    {t.instructions} : {event.instructions}
                  </p>
                  <p>
                    {t.equipment} : {event.equipment}
                  </p>
                  <div className="calendar-presences">
                    {(["coach", "player"] as const).map((role) => (
                      <section key={role}>
                        <h3>
                          {role === "coach" ? extra.coaches : extra.players}
                        </h3>
                        {event.attendance.filter((i) => i.role === role)
                          .length ? (
                          <ul>
                            {event.attendance
                              .filter((i) => i.role === role)
                              .map((i) => (
                                <li key={i.id}>
                                  <strong>{i.name}</strong> ·{" "}
                                  {attendanceCopy[locale].response}:{" "}
                                  {
                                    attendanceCopy[locale].responses[
                                      i.response as "none"
                                    ]
                                  }{" "}
                                  · {attendanceCopy[locale].actual}:{" "}
                                  {
                                    attendanceCopy[locale].actuals[
                                      i.actual as "unchecked"
                                    ]
                                  }
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p>{extra.empty}</p>
                        )}
                      </section>
                    ))}
                  </div>
                  <Link href={"/" + locale + "/attendance"}>
                    {extra.attendance}
                  </Link>
                  <ul>
                    {event.participants.map((p) => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                  </ul>
                  <ul>
                    {event.documents.map((d) => (
                      <li key={d.id}>
                        {d.versionId ? (
                          <a
                            href={
                              "/api/documents/file/" +
                              d.versionId +
                              "?organizationId=" +
                              data.context.organization_id
                            }
                          >
                            {d.name}
                          </a>
                        ) : (
                          d.name
                        )}
                      </li>
                    ))}
                  </ul>
                  {event.canEdit && (
                    <>
                      <Button onClick={() => newEvent()}>{t.newEvent}</Button>
                      <form
                        onSubmit={(e) =>
                          form(e, async (d) => {
                            await send({
                              action: "cancel",
                              id: event.id,
                              expectedVersion: event.version,
                              scope: d.get("scope"),
                              reason: d.get("reason"),
                            });
                          })
                        }
                      >
                        <Field id="cancel-scope" label={t.scope}>
                          <select id="cancel-scope" name="scope">
                            {scopes}
                          </select>
                        </Field>
                        <Field id="cancel-reason" label={t.reason}>
                          <textarea
                            id="cancel-reason"
                            name="reason"
                            required
                            minLength={5}
                            maxLength={1000}
                          />
                        </Field>
                        <Button disabled={busy || event.status === "cancelled"}>
                          {t.cancelButton}
                        </Button>
                      </form>
                      <h3>{t.history}</h3>
                      <ol>
                        {event.history.map((h) => (
                          <li key={h.id}>
                            {h.action === "created"
                              ? t.create
                              : h.action === "cancelled"
                                ? t.cancelled
                                : h.action === "venue.updated"
                                  ? t.place
                                  : t.edit}{" "}
                            · {h.actor}
                            <p>
                              {String(h.before_data?.local_start ?? "—")} →{" "}
                              {String(h.after_data.local_start)} ·{" "}
                              {String(h.before_data?.place_name ?? "")} →{" "}
                              {String(h.after_data.place_name ?? "")}
                            </p>
                            {h.after_data.reason !== "" &&
                              !!h.after_data.reason && (
                                <p>{String(h.after_data.reason)}</p>
                              )}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </Panel>
              </div>
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
                    onSubmit={(e) =>
                      form(e, async (d) => {
                        const body = {
                          title: d.get("title"),
                          kind: d.get("kind"),
                          customType: d.get("customType"),
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
                          participants: d.getAll("participants"),
                          documents: [
                            ...new Set([
                              ...d.getAll("documents"),
                              ...(d.get("kind") === "training" &&
                              d.get("exercise")
                                ? [d.get("exercise")]
                                : []),
                            ]),
                          ],
                        };
                        const result = event
                          ? await send({
                              ...body,
                              action: "update",
                              id: event.id,
                              expectedVersion: event.version,
                              scope: d.get("scope"),
                            })
                          : await send({
                              ...body,
                              action: "create",
                              intervalDays: Number(d.get("repeat")),
                              occurrences: Number(d.get("count")),
                              requestId,
                            });
                        setSelected(result.id);
                        setEditorOpen(false);
                        if (!event) {
                          setRequestId(crypto.randomUUID());
                          setCopyOf(null);
                        }
                      })
                    }
                  >
                    <Field id="event-title" label={t.name}>
                      <input
                        id="event-title"
                        name="title"
                        required
                        minLength={2}
                        maxLength={160}
                        defaultValue={base?.title}
                      />
                    </Field>
                    <Field id="event-kind" label={t.kind}>
                      <select
                        id="event-kind"
                        name="kind"
                        defaultValue={base?.kind ?? "training"}
                      >
                        {kinds.map((v) => (
                          <option key={v} value={v}>
                            {kl[v]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="event-custom" label={t.custom}>
                      <input
                        id="event-custom"
                        name="customType"
                        maxLength={80}
                        defaultValue={base?.custom_type}
                      />
                    </Field>
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
                              : anchor + "T18:00"
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
                              : anchor + "T20:00"
                        }
                      />
                    </Field>
                    <Field id="event-team" label={t.team}>
                      <select
                        id="event-team"
                        name="team"
                        required={!data.manage}
                        defaultValue={base?.team_id ?? ""}
                      >
                        <option value="">{t.none}</option>
                        {data.teams.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="event-place" label={t.place}>
                      <select
                        id="event-place"
                        name="place"
                        defaultValue={base?.place_id ?? ""}
                      >
                        <option value="">{t.none}</option>
                        {data.places
                          .filter(
                            (v) => !v.archived || v.id === event?.place_id,
                          )
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <p>{extra.location}</p>
                    <Field id="event-shared" label={extra.shared}>
                      <select
                        id="event-shared"
                        name="sharedVenue"
                        defaultValue={base?.shared_venue_id ?? ""}
                      >
                        <option value="">{t.none}</option>
                        {data.sharedVenues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} — {v.address}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="event-free" label={extra.free}>
                      <input
                        id="event-free"
                        name="freeLocation"
                        maxLength={500}
                        defaultValue={base?.free_location ?? ""}
                      />
                    </Field>
                    {data.manage && (
                      <a
                        href="#shared-venue"
                        onClick={() => {
                          const el = document.getElementById(
                            "shared-venue",
                          ) as HTMLDetailsElement | null;
                          if (el) el.open = true;
                        }}
                      >
                        {extra.venue}
                      </a>
                    )}
                    <Field id="event-responsible" label={t.responsible}>
                      <select
                        id="event-responsible"
                        name="responsible"
                        defaultValue={
                          event?.responsible_user_id ?? data.context.user_id
                        }
                      >
                        {data.responsibles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="event-visibility" label={t.visibility}>
                      <select
                        id="event-visibility"
                        name="visibility"
                        defaultValue={
                          event?.visibility ??
                          (data.manage ? "organization" : "team")
                        }
                      >
                        {(data.manage ? visibilities : (["team"] as const)).map(
                          (v) => (
                            <option key={v} value={v}>
                              {v === "team"
                                ? t.team
                                : v === "organization"
                                  ? t.organization
                                  : v === "staff"
                                    ? t.staff
                                    : t.selected}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field id="event-participants" label={t.participants}>
                      <select
                        id="event-participants"
                        name="participants"
                        multiple
                        size={Math.min(5, Math.max(2, data.profiles.length))}
                        defaultValue={base?.explicitParticipants ?? []}
                      >
                        {data.profiles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.full_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p>
                      {t.participantHint} {t.selectHint}
                    </p>
                    <Field id="event-equipment" label={t.equipment}>
                      <textarea
                        id="event-equipment"
                        name="equipment"
                        maxLength={2000}
                        defaultValue={base?.equipment}
                      />
                    </Field>
                    <Field id="event-instructions" label={t.instructions}>
                      <textarea
                        id="event-instructions"
                        name="instructions"
                        maxLength={5000}
                        defaultValue={base?.instructions}
                      />
                    </Field>
                    <Field
                      id="event-exercise"
                      label={
                        locale === "fr"
                          ? "Fiche d’exercice (entraînement uniquement)"
                          : locale === "en"
                            ? "Exercise sheet (training only)"
                            : "Oefenfiche (alleen training)"
                      }
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
                      <select
                        id="event-documents"
                        name="documents"
                        multiple
                        size={3}
                        defaultValue={base?.documents.map((d) => d.id) ?? []}
                      >
                        {[
                          ...new Map(
                            [
                              ...data.documentOptions,
                              ...(event?.documents ?? []),
                            ].map((d) => [d.id, d]),
                          ).values(),
                        ].map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p>{t.documentsHint}</p>
                    <p>
                      {extra.exercise}{" "}
                      <Link href={"/" + locale + "/documents"}>
                        {extra.docs}
                      </Link>
                    </p>
                    {event ? (
                      <>
                        <Field id="event-scope" label={t.scope}>
                          <select id="event-scope" name="scope">
                            {scopes}
                          </select>
                        </Field>
                        <p>{t.scopeHint}</p>
                      </>
                    ) : (
                      <>
                        <Field id="event-repeat" label={t.repeat}>
                          <select id="event-repeat" name="repeat">
                            <option value="0">{t.once}</option>
                            <option value="1">{t.daily}</option>
                            <option value="7">{t.weekly}</option>
                            <option value="14">{t.fortnight}</option>
                          </select>
                        </Field>
                        <Field id="event-count" label={t.count}>
                          <input
                            id="event-count"
                            name="count"
                            type="number"
                            min={1}
                            max={52}
                            required
                            defaultValue={1}
                          />
                        </Field>
                      </>
                    )}
                    <Button disabled={busy || event?.status === "cancelled"}>
                      {t.saveEvent}
                    </Button>
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
            <details
              id="calendar-subscribe"
              className="calendar-settings"
              open={subscriptionOpen}
              onToggle={(e) => setSubscriptionOpen(e.currentTarget.open)}
            >
              <summary>{extra.subscribe}</summary>
              <Panel title={t.feeds}>
                <p>{t.feedHint}</p>
                <form
                  onSubmit={(e) =>
                    form(e, async (d) => {
                      const result = await send({
                        action: "feed",
                        name: d.get("name"),
                        teamId: d.get("team") || null,
                      });
                      setFeedUrl(result.url ?? "");
                    })
                  }
                >
                  <Field id="feed-name" label={t.feedName}>
                    <input
                      id="feed-name"
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                    />
                  </Field>
                  <Field id="feed-team" label={t.team}>
                    <select id="feed-team" name="team">
                      <option value="">{t.all}</option>
                      {data.teams.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button disabled={busy}>{t.feedCreate}</Button>
                </form>
                {feedUrl && (
                  <Field id="feed-url" label={t.feedUrl}>
                    <input
                      id="feed-url"
                      readOnly
                      value={feedUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                )}
                <ul>
                  {data.feeds.map((f) => (
                    <li key={f.id}>
                      {f.name} · {t.validUntil} : {f.expires_at.slice(0, 10)}{" "}
                      {f.revoked_at ? (
                        t.revoked
                      ) : (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void task(async () => {
                              await send({ action: "revokeFeed", id: f.id });
                              setFeedUrl("");
                            })
                          }
                        >
                          {t.revoke}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            </details>
          </>
        )}
        <Button disabled={busy} onClick={() => void task(load)}>
          {t.refresh}
        </Button>
      </main>
    </>
  );
}
