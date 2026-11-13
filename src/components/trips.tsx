"use client";
import { emptyStart } from "./empty-start-copy";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import type { tripsView, tripDetail } from "@/domains/trips/service";
import { licenceCategories, youngDriver } from "@/domains/trips/schema";
import { tripsCopy } from "./trips-copy";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { TripDetailSections } from "./trip-detail";
import { Badge, EmptyState, PageHeader, Card } from "./ui";
import { Modal } from "./modal";
import { tripTransportCopy } from "./trip-transport-copy";

type List = Awaited<ReturnType<typeof tripsView>>;
export type Detail = Awaited<ReturnType<typeof tripDetail>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
export const dayLabel = (l: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(l), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(d + "T12:00:00Z"));
/** A licence's dates keep their year (« 15 juin 2010 »). */
const fullDay = (l: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
export const timeLabel = (l: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(l), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  }).format(new Date(d));
/** "2026-10-24T08:30" in the device's time zone, for datetime-local inputs. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
export function useTripFailure(locale: Locale) {
  const t = tripsCopy[locale];
  return useCallback(
    (code: string) => t.errors[code] ?? tripTransportCopy[locale].errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
}
export function Countdown({
  locale,
  c,
}: {
  locale: Locale;
  c: { left: number; urgent: boolean; past: boolean };
}) {
  const t = tripsCopy[locale];
  return (
    <Badge tone={c.past ? undefined : c.urgent ? "warning" : "info"}>
      {c.past ? t.past : c.left === 0 ? t.today : t.days.replace("{n}", String(c.left))}
    </Badge>
  );
}

/** Create or edit the main data of a trip. */
export function TripForm({
  locale,
  list,
  trip,
  busy,
  onSubmit,
}: {
  locale: Locale;
  list: Pick<List, "venues" | "places"> & Partial<Pick<List, "teams" | "links">>;
  trip?: Detail["trip"];
  busy: boolean;
  onSubmit: (fields: Record<string, unknown>) => void;
}) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const [kind, setKind] = useState(trip?.kind ?? "tournament");
  // 3: transport (one day) or stay (several), and what the trip serves.
  const [mode, setMode] = useState<"transport" | "stay">((trip?.mode as "transport" | "stay" | undefined) ?? "transport");
  const [link, setLink] = useState(trip?.match_id ? `match:${trip.match_id}` : trip?.tournament_day_id ? `day:${trip.tournament_day_id}` : trip?.calendar_event_id ? `event:${trip.calendar_event_id}` : "");
  const form = useRef<HTMLFormElement>(null);
  /** The date, time and place of what the trip serves fill the form (still editable). */
  function serve(value: string) {
    setLink(value);
    const [what, id] = value.split(":");
    const set = (name: string, v: string) => {
      const el = form.current?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el && v) el.value = v;
    };
    const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
    if (what === "event") {
      const e = list.links?.events.find((x) => x.id === id);
      if (!e) return;
      set("startsOn", e.local_start.slice(0, 10));
      set("endsOn", day(e.ends_at));
      set("placeId", e.place_id ?? "");
      set("destination", [e.place_name, e.place_address].filter(Boolean).join(", "));
      const title = form.current?.elements.namedItem("title") as HTMLInputElement | null;
      if (title && !title.value) title.value = e.title.slice(0, 120);
    } else if (what === "match") {
      const m = list.links?.matches.find((x) => x.id === id);
      if (!m) return;
      set("startsOn", day(m.starts_at));
      set("endsOn", day(m.starts_at));
      set("destination", m.venue);
    } else if (what === "day") {
      const d = list.links?.days.find((x) => x.id === id);
      if (!d) return;
      set("startsOn", d.day);
      set("endsOn", d.day);
      set("destination", d.venue);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    const acc = s("accommodationAccessible");
    const [what, linked] = link.split(":");
    onSubmit({
      mode,
      ...(list.links
        ? { calendarEventId: what === "event" ? linked : null, matchId: what === "match" ? linked : null, tournamentDayId: what === "day" ? linked : null }
        : {}),
      title: s("title"),
      kind: s("kind"),
      startsOn: s("startsOn"),
      endsOn: s("endsOn"),
      sharedVenueId: s("sharedVenueId") || null,
      placeId: s("placeId") || null,
      destination: s("destination"),
      meetingPoint: s("meetingPoint"),
      departureAt: fromLocalInput(s("departureAt")),
      returnAt: fromLocalInput(s("returnAt")),
      returnPoint: s("returnPoint"),
      accommodation: s("accommodation"),
      accommodationAccessible: acc === "" ? null : acc === "yes",
      emergency: s("emergency"),
      contact: s("contact"),
      notes: s("notes"),
      ...(list.teams?.length ? { teamId: s("teamId") || null } : {}),
      ...(kind === "tournament"
        ? { finalRank: s("finalRank") ? Number(s("finalRank")) : null, teamsCount: s("teamsCount") ? Number(s("teamsCount")) : null, resultNote: s("resultNote") }
        : {}),
    });
  }
  const f = t.fields;
  const id = trip?.id ?? "new";
  return (
    <form className="trip-form" onSubmit={submit} ref={form}>
      <div className="form-grid">
        <label htmlFor={`${id}-mode`}>
          {tt.mode}
          <select id={`${id}-mode`} name="mode" value={mode} onChange={(e) => setMode(e.target.value as "transport" | "stay")} aria-describedby={`${id}-mode-hint`}>
            <option value="transport">{tt.modes.transport}</option>
            <option value="stay">{tt.modes.stay}</option>
          </select>
          <span className="muted small" id={`${id}-mode-hint`}>
            {tt.modeHint}
          </span>
        </label>
        {list.links && (
          <label htmlFor={`${id}-serves`}>
            {tt.serves}
            <select id={`${id}-serves`} value={link} onChange={(e) => serve(e.target.value)} aria-describedby={`${id}-serves-hint`}>
              <option value="">{tt.servesNone}</option>
              {list.links.events.length > 0 && (
                <optgroup label={tt.servesKinds.event}>
                  {list.links.events.map((x) => (
                    <option key={x.id} value={`event:${x.id}`}>
                      {x.title} · {timeLabel(locale, x.starts_at)}
                    </option>
                  ))}
                </optgroup>
              )}
              {list.links.matches.length > 0 && (
                <optgroup label={tt.servesKinds.match}>
                  {list.links.matches.map((x) => (
                    <option key={x.id} value={`match:${x.id}`}>
                      {[x.team, x.opponent].filter(Boolean).join(" · ")} · {timeLabel(locale, x.starts_at)}
                    </option>
                  ))}
                </optgroup>
              )}
              {list.links.days.length > 0 && (
                <optgroup label={tt.servesKinds.tournamentDay}>
                  {list.links.days.map((x) => (
                    <option key={x.id} value={`day:${x.id}`}>
                      {[x.tournament, x.label].filter(Boolean).join(" · ")} · {dayLabel(locale, x.day)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="muted small" id={`${id}-serves-hint`}>
              {tt.servesHint}
            </span>
          </label>
        )}
        <label htmlFor={`${id}-title`}>
          {f.title}
          <input id={`${id}-title`} name="title" required minLength={2} maxLength={120} defaultValue={trip?.title} placeholder={t.examples.title} />
        </label>
        <label htmlFor={`${id}-kind`}>
          {f.kind}
          <select id={`${id}-kind`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(t.kinds).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-starts`}>
          {f.startsOn}
          <input id={`${id}-starts`} name="startsOn" type="date" required defaultValue={trip?.starts_on} />
        </label>
        <label htmlFor={`${id}-ends`}>
          {f.endsOn}
          <input id={`${id}-ends`} name="endsOn" type="date" required defaultValue={trip?.ends_on} />
        </label>
        {kind === "tournament" && (
          <fieldset className="trip-result">
            <legend>{f.result}</legend>
            <p className="muted small">{f.resultHint}</p>
            <label htmlFor={`${id}-rank`}>
              {f.finalRank}
              <input id={`${id}-rank`} name="finalRank" type="number" min={1} max={500} defaultValue={trip?.final_rank ?? ""} />
            </label>
            <label htmlFor={`${id}-teams`}>
              {f.teamsCount}
              <input id={`${id}-teams`} name="teamsCount" type="number" min={1} max={500} defaultValue={trip?.teams_count ?? ""} />
            </label>
            <label htmlFor={`${id}-note`}>
              {f.resultNote}
              <input id={`${id}-note`} name="resultNote" maxLength={160} defaultValue={trip?.result_note ?? ""} />
            </label>
          </fieldset>
        )}
        <label htmlFor={`${id}-venue`}>
          {f.venue}
          <select id={`${id}-venue`} name="sharedVenueId" defaultValue={trip?.shared_venue_id ?? ""}>
            <option value="">{t.noneOption}</option>
            {list.venues.map((v) => (
              <option key={v.id} value={v.id}>{v.city ? `${v.name} (${v.city})` : v.name}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-place`}>
          {f.place}
          <select id={`${id}-place`} name="placeId" defaultValue={trip?.place_id ?? ""}>
            <option value="">{t.noneOption}</option>
            {list.places.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-dest`}>
          {f.destination}
          <input id={`${id}-dest`} name="destination" maxLength={300} defaultValue={trip?.destination} />
        </label>
        <label htmlFor={`${id}-meet`}>
          {f.meetingPoint}
          <input id={`${id}-meet`} name="meetingPoint" maxLength={300} defaultValue={trip?.meeting_point} placeholder={t.examples.meeting} />
        </label>
        <label htmlFor={`${id}-dep`}>
          {f.departureAt}
          <input id={`${id}-dep`} name="departureAt" type="datetime-local" defaultValue={toLocalInput(trip?.departure_at ?? null)} />
        </label>
        <label htmlFor={`${id}-ret`}>
          {f.returnAt}
          <input id={`${id}-ret`} name="returnAt" type="datetime-local" defaultValue={toLocalInput(trip?.return_at ?? null)} />
        </label>
        <label htmlFor={`${id}-retp`}>
          {f.returnPoint}
          <input id={`${id}-retp`} name="returnPoint" maxLength={300} defaultValue={trip?.return_point} />
        </label>
        {(list.teams?.length ?? 0) > 0 && (
          <label htmlFor={`${id}-team`}>
            {t.team}
            <select id={`${id}-team`} name="teamId" defaultValue={trip?.team_id ?? ""}>
              <option value="">{t.wholeClub}</option>
              {list.teams?.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor={`${id}-contact`}>
          {f.contact}
          <input id={`${id}-contact`} name="contact" maxLength={200} defaultValue={trip?.contact} placeholder={t.examples.contact} />
        </label>
      </div>
      {/* 3: the accommodation belongs to a stay; a transport keeps what it had, hidden. */}
      <label htmlFor={`${id}-acc`} hidden={mode !== "stay"}>
        {f.accommodation}
        <textarea id={`${id}-acc`} name="accommodation" maxLength={1000} rows={2} defaultValue={trip?.accommodation} />
      </label>
      <label htmlFor={`${id}-acca`} hidden={mode !== "stay"}>
        {f.accommodationAccessible}
        <select
          id={`${id}-acca`}
          name="accommodationAccessible"
          defaultValue={trip?.accommodation_accessible === true ? "yes" : trip?.accommodation_accessible === false ? "no" : ""}
        >
          <option value="">{t.unknown}</option>
          <option value="yes">{t.yes}</option>
          <option value="no">{t.no}</option>
        </select>
      </label>
      <label htmlFor={`${id}-emerg`}>
        {f.emergency}
        <textarea id={`${id}-emerg`} name="emergency" maxLength={1000} rows={2} defaultValue={trip?.emergency} />
      </label>
      <label htmlFor={`${id}-notes`}>
        {f.notes}
        <textarea id={`${id}-notes`} name="notes" maxLength={2000} rows={2} defaultValue={trip?.notes} />
      </label>
      <button className="button" disabled={busy}>{t.save}</button>
    </form>
  );
}

export function TripsPage({ locale }: { locale: Locale }) {
  const t = tripsCopy[locale];
  const failure = useTripFailure(locale);
  const { data, error, setError, denied, reload } = useData<List>("/api/trips", failure);
  const { busy, message, post } = usePost("/api/trips", reload, setError, failure);
  const [creating, setCreating] = useState(false),
    [preview, setPreview] = useState<string | null>(null);
  const tt = tripTransportCopy[locale];
  // The team chosen in the top bar (wave 15): its trips and the whole-club ones.
  const team = useScope().teamId;
  if (!data)
    return (
      <main id="main" className="access trips">
        <PageHeader title={t.title} />
        {error || denied ? <p role="alert">{error || t.unavailable}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const org = data.organization_id;
  return (
    <main id="main" className="access trips">
      <PageHeader title={t.title} subtitle={t.intro} actions={data.can.manage && (
          <button type="button" className="button" aria-expanded={creating} onClick={() => setCreating(!creating)}>
            {creating ? t.close : t.create}
          </button>
        )} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {creating && (
        <Card label={t.create}>
          <TripForm
            locale={locale}
            list={data}
            busy={busy}
            onSubmit={(fields) =>
              void post({ action: "create", locale, organizationId: org, ...fields }, t.saved).then(
                (ok) => ok && setCreating(false),
              )
            }
          />
        </Card>
      )}
      {data.trips.some((x) => !team || !x.team_id || x.team_id === team) ? (
        <ul className="trip-list">
          {data.trips.filter((x) => !team || !x.team_id || x.team_id === team).map((x) => (
            <Card as="li" key={x.id} className="trip-card" data={{ status: x.status }}>
              <div className="trip-card-head">
                {/* 3: a click opens the trip's window; the full page is one link away. */}
                <button type="button" className="text-button name-link trip-open" onClick={() => setPreview(x.id)} aria-label={tt.preview.replace("{title}", x.title)}>
                  <strong>{x.title}</strong>
                </button>
                <Countdown locale={locale} c={x.countdown} />
              </div>
              <p className="muted">
                {t.kinds[x.kind]} · {dayLabel(locale, x.starts_on)}
                {x.ends_on !== x.starts_on && ` → ${dayLabel(locale, x.ends_on)}`}
                {x.serves && ` · ${x.serves}`}
                {x.destination && ` · ${x.destination}`}
              </p>
              {(x.departure_at || x.arrival_at) && (
                <p className="small">
                  {[x.departure_at && tt.departure.replace("{time}", hourLabel(locale, x.departure_at)), x.arrival_at && tt.arrival.replace("{time}", hourLabel(locale, x.arrival_at))].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="trip-meta">
                <Badge>{t.statuses[x.status]}</Badge>
                <Badge tone="info">{tt.modes[x.mode as "transport" | "stay"]}</Badge>
                {x.vehicles > 0 && <span>{tt.vehicles.replace("{n}", String(x.vehicles))}</span>}
                {x.team_name && (
                  <span className="team-chip" data-color={x.team_color ?? "none"}>
                    <span className="team-dot" aria-hidden="true" />
                    {x.team_name}
                  </span>
                )}
                <span>{t.travelling.replace("{n}", String(x.travelling))}</span>
                {x.powerchairs > 0 && <span>{t.powerchairs.replace("{n}", String(x.powerchairs))}</span>}
              </p>
            </Card>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t.none}
          // Point 19: the way to start, right there.
          action={
            data.can.manage && !creating ? (
              <button type="button" className="button" onClick={() => setCreating(true)}>
                {emptyStart[locale]}
              </button>
            ) : undefined
          }
        />
      )}
      {preview && <TripPreview locale={locale} id={preview} close={() => setPreview(null)} />}
      {(data.can.manage || data.fleet.length > 0) && (
        <Fleet locale={locale} data={data} busy={busy} post={post} />
      )}
      {data.can.manage && <Drivers locale={locale} data={data} busy={busy} post={post} />}
    </main>
  );
}

/** « 08:30 » in Brussels. */
export const hourLabel = (l: Locale, iso: string) =>
  new Intl.DateTimeFormat(tag(l), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));

/** 3: the trip's window from the list: when, what for, each vehicle with its driver and departure. */
function TripPreview({ locale, id, close }: { locale: Locale; id: string; close: () => void }) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const failure = useTripFailure(locale);
  const { data, error } = useData<Detail>(`/api/trips?id=${id}`, failure);
  return (
    <Modal title={data?.trip.title ?? t.title} close={close}>
      {!data ? (
        <p role={error ? "alert" : "status"}>{error || t.loading}</p>
      ) : (
        <>
          <p>
            {dayLabel(locale, data.trip.starts_on)}
            {data.trip.ends_on !== data.trip.starts_on && ` → ${dayLabel(locale, data.trip.ends_on)}`} · {tt.modes[data.trip.mode as "transport" | "stay"]}
            {data.serves && ` · ${tt.servesKinds[data.serves.kind]} : ${data.serves.title}`}
          </p>
          <ul className="plain-list trip-preview">
            {data.vehicles.map((v) => {
              const first = v.stops[0],
                arrive = v.stops.find((st) => st.kind === "arrive");
              return (
                <li key={v.id}>
                  <strong>{v.name}</strong> <Badge>{tt.kinds[v.kind as "club" | "rental" | "private"]}</Badge>
                  <br />
                  <span className="small">
                    {[
                      v.drivers.map((d) => d.full_name).join(", "),
                      first?.at && tt.departure.replace("{time}", hourLabel(locale, first.at)),
                      arrive?.at && tt.arrival.replace("{time}", hourLabel(locale, arrive.at)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="actions">
            <Link className="button" href={`/${locale}/trips/${id}`}>
              {tt.openFull}
            </Link>
            <Link className="button secondary" href={`/${locale}/trips/${id}/roadsheet`}>
              {tt.sheet}
            </Link>
          </p>
        </>
      )}
    </Modal>
  );
}

type Post = (body: Record<string, unknown>, done: string) => Promise<boolean>;
function Fleet({ locale, data, busy, post }: { locale: Locale; data: List; busy: boolean; post: Post }) {
  const t = tripsCopy[locale];
  const [editing, setEditing] = useState<string | null>(null);
  const today = data.today;
  function submit(e: FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    void post(
      {
        action: "fleet",
        ...(id ? { id } : {}),
        name: s("name"),
        kind: s("kind"),
        plate: s("plate"),
        owner: s("owner"),
        seats: Number(s("seats") || 0),
        wheelchairPlaces: Number(s("wheelchairPlaces") || 0),
        rampOrLift: f.get("rampOrLift") === "on",
        licence: s("licence"),
        insuranceUntil: s("insuranceUntil") || null,
        inspectionUntil: s("inspectionUntil") || null,
        notes: s("notes"),
        archived: f.get("archived") === "on",
        organizationId: data.organization_id,
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  }
  const form = (v?: List["fleet"][number]) => (
    <form className="fleet-form" onSubmit={(e) => submit(e, v?.id)}>
      <div className="form-grid">
        <label>
          {t.vehicleName}
          <input name="name" required minLength={2} maxLength={80} defaultValue={v?.name} />
        </label>
        <label>
          {t.kind}
          <input name="kind" maxLength={60} defaultValue={v?.kind} placeholder={t.examples.vehicleKind} />
        </label>
        <label>
          {t.plate}
          <input name="plate" maxLength={20} defaultValue={v?.plate} />
        </label>
        <label>
          {t.owner}
          <input name="owner" maxLength={120} defaultValue={v?.owner} />
        </label>
        <label>
          {t.seats}
          <input name="seats" type="number" min={0} max={80} defaultValue={v?.seats ?? 8} />
        </label>
        <label>
          {t.wheelchairPlaces}
          <input name="wheelchairPlaces" type="number" min={0} max={20} defaultValue={v?.wheelchair_places ?? 0} />
        </label>
        <label>
          {t.licenceNeeded}
          <select name="licence" defaultValue={v?.licence ?? "B"}>
            {licenceCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          {t.insuranceUntil}
          <input name="insuranceUntil" type="date" defaultValue={v?.insurance_until ?? ""} />
        </label>
        <label>
          {t.inspectionUntil}
          <input name="inspectionUntil" type="date" defaultValue={v?.inspection_until ?? ""} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="rampOrLift" defaultChecked={v?.ramp_or_lift} />
        {t.rampOrLift}
      </label>
      {v && (
        <label className="check">
          <input type="checkbox" name="archived" defaultChecked={v.archived} />
          {t.archived}
        </label>
      )}
      <label>
        {t.fields.notes}
        <input name="notes" maxLength={1000} defaultValue={v?.notes} />
      </label>
      <div className="actions">
        <button className="button" disabled={busy}>{t.save}</button>
        <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
      </div>
    </form>
  );
  return (
    <Card title={t.fleet} labelledBy="trips-fleet" headingId="trips-fleet" actions={data.can.manage && (
          <button type="button" className="button secondary" onClick={() => setEditing("new")}>{t.addFleet}</button>
        )}>
      <p className="muted">{t.fleetIntro}</p>
      {/* 04/11/2026: adding or changing a vehicle opens in a window. */}
      {editing !== null && (
        <Modal title={editing === "new" ? t.addFleet : t.editFleet} close={() => setEditing(null)} className="player-dialog event-editor-dialog">
          {form(data.fleet.find((v) => v.id === editing))}
        </Modal>
      )}
      <ul className="profile-list">
        {data.fleet.map((v) => (
          <li key={v.id} data-archived={v.archived || undefined}>
            {(
              <>
                <div>
                  <strong>{v.name}</strong>
                  <p className="muted small">
                    {[v.kind, v.plate, `${v.seats} ${t.seats.toLowerCase()}`, `${v.wheelchair_places} ${t.wheelchairPlaces.toLowerCase()}`, v.ramp_or_lift ? t.rampOrLift : "", `${t.licenceNeeded} ${v.licence}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {v.insurance_until && v.insurance_until < today && (
                    <p><Badge tone="danger">{t.warnings.insurance}</Badge></p>
                  )}
                  {v.inspection_until && v.inspection_until < today && (
                    <p><Badge tone="danger">{t.warnings.inspection}</Badge></p>
                  )}
                </div>
                {data.can.manage && (
                  <button type="button" className="text-button" onClick={() => setEditing(v.id)}>
                    {t.edit}
                    <span className="sr-only"> : {v.name}</span>
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Drivers({ locale, data, busy, post }: { locale: Locale; data: List; busy: boolean; post: Post }) {
  const t = tripsCopy[locale];
  // 04/11/2026: « Ajouter un permis » and « Modifier » open a window (who, categories, since, valid until).
  const [open, setOpen] = useState<string | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const current = data.drivers.find((d) => d.profile_id === open);
  const show = (id: string) => {
    setCats(data.drivers.find((d) => d.profile_id === id)?.categories ?? []);
    setOpen(id);
  };
  return (
    <Card
      title={t.drivers}
      labelledBy="trips-drivers"
      headingId="trips-drivers"
      actions={
        <button type="button" className="button secondary" onClick={() => show("new")}>
          {t.addLicence}
        </button>
      }
    >
      <p className="muted">{t.driversIntro}</p>
      {data.drivers.length > 0 && (
        <ul className="profile-list">
          {data.drivers.map((d) => (
            <li key={d.profile_id}>
              <div>
                <strong>{d.full_name}</strong>
                <p className="muted small">
                  {d.categories.join(", ")}
                  {d.obtained_on && ` · ${t.since} ${fullDay(locale, d.obtained_on)}`}
                  {d.valid_until && ` · ${t.validUntil} ${fullDay(locale, d.valid_until)}`}
                </p>
                {/* Point 15: checked by the club, and a young driver (less than two years). */}
                <p className="driver-badges">
                  {d.verified && <Badge tone="success">{t.verifiedByClub}</Badge>}
                  {youngDriver(d.obtained_on, data.today) && <Badge tone="warning">{t.youngDriver}</Badge>}
                </p>
              </div>
              <button type="button" className="text-button" onClick={() => show(d.profile_id)}>
                {t.edit}
                <span className="sr-only"> : {d.full_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && (
        <Modal title={current ? t.editLicence : t.addLicence} close={() => setOpen(null)}>
          <form
            className="stack-form licence-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post(
                {
                  action: "licence",
                  profileId: current?.profile_id ?? String(f.get("profileId")),
                  categories: cats,
                  validUntil: String(f.get("validUntil") ?? "") || null,
                  obtainedOn: String(f.get("obtainedOn") ?? "") || null,
                  organizationId: data.organization_id,
                },
                t.saved,
              ).then((ok) => ok && setOpen(null));
            }}
          >
            {current ? (
              <p>
                <strong>{current.full_name}</strong>
              </p>
            ) : (
              <label htmlFor="driver-person">
                {t.person}
                <select id="driver-person" name="profileId" required defaultValue="">
                  <option value="" disabled>{t.person}</option>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="inline-checks">
              <legend>{t.categories}</legend>
              {licenceCategories.map((c) => (
                <label key={c} className="check">
                  <input
                    type="checkbox"
                    checked={cats.includes(c)}
                    onChange={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}
                  />
                  {c}
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <label htmlFor="driver-since">
                {t.since}
                <input id="driver-since" name="obtainedOn" type="date" defaultValue={current?.obtained_on ?? ""} />
              </label>
              <label htmlFor="driver-until">
                {t.validUntil}
                <input id="driver-until" name="validUntil" type="date" defaultValue={current?.valid_until ?? ""} />
              </label>
            </div>
            <div className="actions">
              <button className="button" disabled={busy}>{t.saveLicence}</button>
              <button type="button" className="button secondary" onClick={() => setOpen(null)}>{t.cancel}</button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

export function TripPage({ locale, id }: { locale: Locale; id: string }) {
  const t = tripsCopy[locale];
  const failure = useTripFailure(locale);
  const detail = useData<Detail>(`/api/trips?id=${id}`, failure);
  const list = useData<List>("/api/trips", failure);
  const reload = useCallback(async () => {
    await Promise.all([detail.reload(), list.reload()]);
  }, [detail, list]);
  const { busy, message, post } = usePost("/api/trips", reload, detail.setError, failure);
  const d = detail.data;
  if (!d)
    return (
      <main id="main" className="access trips">
        <p className="back-link">
          <Link className="button secondary" href={`/${locale}/trips`}>{t.back}</Link>
        </p>
        <h1>{t.title}</h1>
        {detail.error || detail.denied ? (
          <p role="alert">{detail.error || t.unavailable}</p>
        ) : (
          <p role="status">{t.loading}</p>
        )}
      </main>
    );
  return (
    <main id="main" className="access trips">
      <p className="back-link">
        <Link className="button secondary" href={`/${locale}/trips`}>{t.back}</Link>
      </p>
      <PageHeader title={d.trip.title} subtitle={<>{t.kinds[d.trip.kind]} · {dayLabel(locale, d.trip.starts_on)}
            {d.trip.ends_on !== d.trip.starts_on && ` → ${dayLabel(locale, d.trip.ends_on)}`}{" "}
            <Countdown locale={locale} c={d.countdown} />{" "}
            <Badge>{t.statuses[d.trip.status]}</Badge></>} />
      {detail.error && <p role="alert">{detail.error}</p>}
      {message && <p role="status">{message}</p>}
      <TripDetailSections locale={locale} d={d} list={list.data} busy={busy} post={post} />
    </main>
  );
}
