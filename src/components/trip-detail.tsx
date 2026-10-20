"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { tripsView } from "@/domains/trips/service";
import { tripDays } from "@/domains/trips/schema";
import { storeBook } from "@/lib/offline-book";
import { tripsCopy } from "./trips-copy";
import {
  TripForm,
  dayLabel,
  timeLabel,
  type Detail,
} from "./trips";

type List = Awaited<ReturnType<typeof tripsView>>;
type Post = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const euros = (l: Locale, cents: number) =>
  new Intl.NumberFormat(l === "en" ? "en-GB" : `${l}-BE`, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

export function TripDetailSections({
  locale,
  d,
  list,
  busy,
  post,
}: {
  locale: Locale;
  d: Detail;
  list: List | null;
  busy: boolean;
  post: Post;
}) {
  const t = tripsCopy[locale];
  const org = d.organization_id;
  const send = (body: Record<string, unknown>, done = t.saved) =>
    post({ organizationId: org, ...body }, done);
  const name = (participantId: string) =>
    d.participants.find((p) => p.id === participantId)?.full_name ?? "";
  return (
    <>
      <Summary locale={locale} d={d} list={list} busy={busy} send={send} />
      {d.participants.length > 0 && !d.can.full && (
        <MyAnswer locale={locale} d={d} busy={busy} send={send} />
      )}
      {d.can.full && <Participants locale={locale} d={d} list={list} busy={busy} send={send} />}
      <Transport locale={locale} d={d} list={list} busy={busy} send={send} name={name} />
      <Schedule locale={locale} d={d} busy={busy} send={send} />
      {d.can.full && <Checklist locale={locale} d={d} busy={busy} send={send} />}
      {d.can.full && <Documents locale={locale} d={d} />}
      {d.can.full && d.care && <CareSection locale={locale} d={d} busy={busy} send={send} />}
      {d.budget && <Budget locale={locale} d={d} busy={busy} send={send} />}
      {d.can.full && (d.can.manage || d.can.staff) && <Offline locale={locale} d={d} />}
    </>
  );
}
type Send = (body: Record<string, unknown>, done?: string) => Promise<boolean>;
type Props = { locale: Locale; d: Detail; busy: boolean; send: Send };

function Summary({ locale, d, list, busy, send }: Props & { list: List | null }) {
  const t = tripsCopy[locale],
    f = t.fields,
    trip = d.trip;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const yesNo = (v: boolean | null) => (v === true ? t.yes : v === false ? t.no : t.unknown);
  const destination = trip.venue_name ?? trip.place_name ?? trip.destination;
  const address = trip.venue_address || trip.place_address;
  return (
    <section className="panel" aria-labelledby="trip-summary">
      <div className="panel-head">
        <h2 id="trip-summary">{t.tabs.summary}</h2>
        {d.can.manage && list && (
          <button type="button" className="button secondary" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? t.close : t.edit}
          </button>
        )}
      </div>
      {editing && list ? (
        <TripForm
          locale={locale}
          list={list}
          trip={trip}
          busy={busy}
          onSubmit={(fields) =>
            void send({ action: "update", id: trip.id, version: trip.version, ...fields }).then(
              (ok) => ok && setEditing(false),
            )
          }
        />
      ) : (
        <dl className="trip-facts">
          {destination && (
            <div>
              <dt>{t.labels.destination}</dt>
              <dd>
                {destination}
                {address && <span className="muted"> · {address}</span>}
                {trip.shared_venue_id && (
                  <span className="access-badges">
                    {trip.step_free !== null && <span data-ok={trip.step_free}>♿ {yesNo(trip.step_free)}</span>}
                    {trip.adapted_toilets !== null && <span data-ok={trip.adapted_toilets}>WC {yesNo(trip.adapted_toilets)}</span>}
                    {trip.charging !== null && <span data-ok={trip.charging}>⚡ {yesNo(trip.charging)}</span>}
                  </span>
                )}
              </dd>
            </div>
          )}
          {(trip.meeting_point || trip.departure_at) && (
            <div>
              <dt>{f.meetingPoint}</dt>
              <dd>
                {[trip.meeting_point, trip.departure_at && timeLabel(locale, trip.departure_at)].filter(Boolean).join(" · ")}
              </dd>
            </div>
          )}
          {(trip.return_point || trip.return_at) && (
            <div>
              <dt>{f.returnPoint}</dt>
              <dd>
                {[trip.return_point, trip.return_at && timeLabel(locale, trip.return_at)].filter(Boolean).join(" · ")}
              </dd>
            </div>
          )}
          {trip.accommodation && (
            <div>
              <dt>{t.labels.accommodation}</dt>
              <dd>
                {trip.accommodation}
                <span className="muted"> · {f.accommodationAccessible} : {yesNo(trip.accommodation_accessible)}</span>
              </dd>
            </div>
          )}
          {trip.emergency && (
            <div>
              <dt>{t.labels.emergency}</dt>
              <dd className="pre-line">{trip.emergency}</dd>
            </div>
          )}
          {trip.contact && (
            <div>
              <dt>{f.contact}</dt>
              <dd>{trip.contact}</dd>
            </div>
          )}
          {trip.notes && (
            <div>
              <dt>{f.notes}</dt>
              <dd className="pre-line">{trip.notes}</dd>
            </div>
          )}
        </dl>
      )}
      {d.can.manage && !editing && (
        <div className="actions">
          <label htmlFor="trip-status">
            {t.changeStatus}
            <select
              id="trip-status"
              value={trip.status}
              disabled={busy}
              onChange={(e) => void send({ action: "status", id: trip.id, status: e.target.value })}
            >
              {Object.entries(t.statuses).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button secondary danger"
            disabled={busy}
            onClick={() =>
              void send({ action: "delete", id: trip.id }, t.deleted).then(
                (ok) => ok && router.push(`/${locale}/trips`),
              )
            }
          >
            {t.deleteTrip}
          </button>
        </div>
      )}
    </section>
  );
}

function MyAnswer({ locale, d, busy, send }: Props) {
  const t = tripsCopy[locale];
  return (
    <section className="panel" aria-labelledby="trip-mine">
      <h2 id="trip-mine">{t.yourAnswer}</h2>
      <ul className="profile-list">
        {d.participants.map((p) => (
          <li key={p.id}>
            <div>
              <strong>{p.full_name}</strong>
              <p className="muted small">
                {t.roles[p.role]} · {t.participantStatus[p.status]}
              </p>
            </div>
            <div className="row-actions">
              {(["confirmed", "declined"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={s === "confirmed" ? "button" : "button secondary"}
                  aria-pressed={p.status === s}
                  disabled={busy}
                  onClick={() =>
                    void send({ action: "participant", participantId: p.id, status: s, chair: p.chair, needs: p.needs })
                  }
                >
                  {s === "confirmed" ? t.confirm : t.decline}
                  <span className="sr-only"> : {p.full_name}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Participants({ locale, d, list, busy, send }: Props & { list: List | null }) {
  const t = tripsCopy[locale];
  const [adding, setAdding] = useState(false),
    [role, setRole] = useState("player"),
    [chosen, setChosen] = useState<string[]>([]),
    [q, setQ] = useState(""),
    [editing, setEditing] = useState<string | null>(null);
  const inTrip = new Set(d.participants.map((p) => p.profile_id));
  const candidates = (list?.people ?? []).filter(
    (p) =>
      !inTrip.has(p.id) &&
      p.full_name.toLocaleLowerCase().includes(q.toLocaleLowerCase()) &&
      (role === "player" ? p.directory_roles.includes("player") : role === "coach" ? p.directory_roles.includes("coach") : true),
  );
  function save(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({
      action: "participant",
      participantId: id,
      status: String(f.get("status")),
      chair: String(f.get("chair")),
      needs: String(f.get("needs") ?? ""),
    }).then((ok) => ok && setEditing(null));
  }
  return (
    <section className="panel" aria-labelledby="trip-participants">
      <div className="panel-head">
        <h2 id="trip-participants">
          {t.participants} <span className="muted">({d.participants.filter((p) => p.status !== "declined").length})</span>
        </h2>
        {d.can.manage && (
          <button type="button" className="button secondary" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            {adding ? t.close : t.addPeople}
          </button>
        )}
      </div>
      {adding && (
        <form
          className="add-people"
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              action: "addParticipants",
              tripId: d.trip.id,
              people: chosen.map((profileId) => ({ profileId, role })),
            }).then((ok) => {
              if (ok) {
                setChosen([]);
                setAdding(false);
              }
            });
          }}
        >
          <div className="form-grid">
            <label htmlFor="add-role">
              {t.role}
              <select id="add-role" value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(t.roles).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label htmlFor="add-search">
              {t.person}
              <input id="add-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <fieldset className="people-picker">
            <legend className="sr-only">{t.addPeople}</legend>
            {candidates.slice(0, 60).map((p) => (
              <label key={p.id} className="check">
                <input
                  type="checkbox"
                  checked={chosen.includes(p.id)}
                  onChange={() => setChosen(chosen.includes(p.id) ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}
                />
                {p.full_name}
              </label>
            ))}
          </fieldset>
          <button className="button" disabled={busy || !chosen.length}>
            {t.addSelected} ({chosen.length})
          </button>
        </form>
      )}
      <div className="table-scroll" role="region" aria-label={t.participants} tabIndex={0}>
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">{t.person}</th>
              <th scope="col">{t.role}</th>
              <th scope="col">{t.status}</th>
              <th scope="col">{t.chair}</th>
              <th scope="col">{t.labels.needs}</th>
              {d.can.manage && <th scope="col"><span className="sr-only">{t.edit}</span></th>}
            </tr>
          </thead>
          <tbody>
            {d.participants.map((p) =>
              editing === p.id ? (
                <tr key={p.id}>
                  <td colSpan={d.can.manage ? 6 : 5}>
                    <form className="inline-form" onSubmit={(e) => save(e, p.id)}>
                      <strong>{p.full_name}</strong>
                      <label>
                        {t.status}
                        <select name="status" defaultValue={p.status}>
                          {Object.entries(t.participantStatus).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.chair}
                        <select name="chair" defaultValue={p.chair}>
                          {Object.entries(t.chairs).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.needs}
                        <input name="needs" maxLength={500} defaultValue={p.needs} />
                      </label>
                      <button className="button" disabled={busy}>{t.save}</button>
                      <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} data-cancelled={p.status === "declined" || undefined}>
                  <th scope="row">{p.full_name}</th>
                  <td>{t.roles[p.role]}</td>
                  <td>{t.participantStatus[p.status]}</td>
                  <td>{t.chairs[p.chair]}</td>
                  <td>{p.needs}</td>
                  {d.can.manage && (
                    <td className="row-actions">
                      <button type="button" className="text-button" onClick={() => setEditing(p.id)}>
                        {t.edit}
                        <span className="sr-only"> : {p.full_name}</span>
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => void send({ action: "removeParticipant", participantId: p.id })}
                      >
                        {t.remove}
                        <span className="sr-only"> : {p.full_name}</span>
                      </button>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Transport({ locale, d, list, busy, send, name }: Props & { list: List | null; name: (id: string) => string }) {
  const t = tripsCopy[locale];
  const [editing, setEditing] = useState<string | null>(null);
  const travelling = d.participants.filter((p) => p.status !== "declined");
  function form(v?: Detail["vehicles"][number]) {
    return (
      <VehicleForm
        locale={locale}
        d={d}
        list={list}
        v={v}
        busy={busy}
        travelling={travelling}
        onCancel={() => setEditing(null)}
        onSave={(body) => void send({ action: "vehicle", tripId: d.trip.id, ...body }).then((ok) => ok && setEditing(null))}
      />
    );
  }
  if (!d.vehicles.length && !d.can.manage) return null;
  return (
    <section className="panel" aria-labelledby="trip-transport">
      <div className="panel-head">
        <h2 id="trip-transport">{t.tabs.transport}</h2>
        {d.can.manage && editing === null && (
          <button type="button" className="button secondary" onClick={() => setEditing("new")}>{t.addVehicle}</button>
        )}
      </div>
      {d.can.full && (d.unassigned.out.length > 0 || d.unassigned.back.length > 0) && (
        <div className="notice">
          {d.unassigned.out.length > 0 && (
            <p>
              <strong>{t.unassignedOut}</strong> : {d.unassigned.out.map(name).join(", ")}
            </p>
          )}
          {d.unassigned.back.length > 0 && (
            <p>
              <strong>{t.unassignedBack}</strong> : {d.unassigned.back.map(name).join(", ")}
            </p>
          )}
        </div>
      )}
      {editing === "new" && form()}
      <ul className="vehicle-list">
        {d.vehicles.map((v) =>
          editing === v.id ? (
            <li key={v.id}>{form(v as Detail["vehicles"][number])}</li>
          ) : (
            <li key={v.id} className="vehicle-card">
              <div className="trip-card-head">
                <strong>{v.name}</strong>
                <span className="status-tag">{t.legsLabels[v.legs]}</span>
              </div>
              {(v.driver_name || v.phone) && (
                <p>
                  {t.driver} : {v.driver_name ?? ""} {v.phone && <a href={`tel:${v.phone.replace(/\s+/g, "")}`}>{v.phone}</a>}
                </p>
              )}
              {"load" in v && v.load && (
                <p className="muted small">
                  {t.load
                    .replace("{seated}", String(v.load.seated))
                    .replace("{seats}", String(v.seats))
                    .replace("{chairs}", String(v.load.chairs))
                    .replace("{wheel}", String(v.wheelchair_places))}
                  {(v.load.seatsOver > 0 || v.load.chairsOver > 0) && (
                    <span className="status-tag" data-tone="danger"> {t.over}</span>
                  )}
                </p>
              )}
              {"warnings" in v &&
                v.warnings.map((w: string) => (
                  <p key={w} className="status-tag" data-tone="warning">{t.warnings[w]}</p>
                ))}
              <p className="small">
                {t.passengers} : {v.passengers.map(name).filter(Boolean).join(", ") || "—"}
              </p>
              {d.can.manage && (
                <div className="row-actions">
                  <button type="button" className="text-button" onClick={() => setEditing(v.id)}>
                    {t.edit}
                    <span className="sr-only"> : {v.name}</span>
                  </button>
                  <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "removeVehicle", id: v.id })}>
                    {t.remove}
                    <span className="sr-only"> : {v.name}</span>
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function VehicleForm({
  locale,
  list,
  v,
  busy,
  travelling,
  onSave,
  onCancel,
}: {
  locale: Locale;
  d: Detail;
  list: List | null;
  v?: Detail["vehicles"][number];
  busy: boolean;
  travelling: Detail["participants"];
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const t = tripsCopy[locale];
  const full = v as (Detail["vehicles"][number] & { vehicle_id?: string | null; driver_profile_id?: string | null; driver_phone?: string; notes?: string }) | undefined;
  const [fleetId, setFleetId] = useState(full?.vehicle_id ?? "");
  const fleet = (list?.fleet ?? []).filter((x) => !x.archived);
  const picked = fleet.find((x) => x.id === fleetId);
  const [passengers, setPassengers] = useState<string[]>(v?.passengers ?? []);
  const key = v?.id ?? "new";
  return (
    <form
      className="vehicle-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        onSave({
          ...(v ? { id: v.id } : {}),
          vehicleId: fleetId || null,
          name: s("name"),
          legs: s("legs"),
          driverProfileId: s("driver") || null,
          driverPhone: s("phone"),
          seats: Number(s("seats") || 0),
          wheelchairPlaces: Number(s("wheel") || 0),
          notes: s("notes"),
          passengers,
        });
      }}
    >
      <div className="form-grid">
        <label>
          {t.fromFleet}
          <select value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
            <option value="">{t.noneOption}</option>
            {fleet.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t.vehicleName}
          <input key={`${key}-${fleetId}-n`} name="name" required minLength={2} maxLength={80} defaultValue={v?.name ?? picked?.name ?? ""} />
        </label>
        <label>
          {t.legs}
          <select name="legs" defaultValue={v?.legs ?? "both"}>
            {Object.entries(t.legsLabels).map(([k, x]) => (
              <option key={k} value={k}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          {t.driver}
          <select name="driver" defaultValue={full?.driver_profile_id ?? ""}>
            <option value="">{t.noneOption}</option>
            {(list?.people ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </label>
        <label>
          {t.driverPhone}
          <input name="phone" maxLength={60} defaultValue={full?.driver_phone ?? ""} />
        </label>
        <label>
          {t.seats}
          <input key={`${key}-${fleetId}-s`} name="seats" type="number" min={0} max={80} defaultValue={v?.seats ?? picked?.seats ?? 4} />
        </label>
        <label>
          {t.wheelchairPlaces}
          <input key={`${key}-${fleetId}-w`} name="wheel" type="number" min={0} max={20} defaultValue={v?.wheelchair_places ?? picked?.wheelchair_places ?? 0} />
        </label>
      </div>
      <fieldset className="people-picker">
        <legend>{t.passengers}</legend>
        {travelling.map((p) => (
          <label key={p.id} className="check">
            <input
              type="checkbox"
              checked={passengers.includes(p.id)}
              onChange={() => setPassengers(passengers.includes(p.id) ? passengers.filter((x) => x !== p.id) : [...passengers, p.id])}
            />
            {p.full_name}
            {(p.chair === "powerchair" || p.chair === "both") && <span className="muted"> ({t.chairs.powerchair})</span>}
          </label>
        ))}
      </fieldset>
      <label>
        {t.fields.notes}
        <input name="notes" maxLength={500} defaultValue={full?.notes ?? ""} />
      </label>
      <div className="actions">
        <button className="button" disabled={busy}>{t.save}</button>
        <button type="button" className="button secondary" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}

function Schedule({ locale, d, busy, send }: Props) {
  const t = tripsCopy[locale];
  const days = tripDays(d.trip.starts_on, d.trip.ends_on);
  if (!d.schedule.length && !d.can.manage) return null;
  return (
    <section className="panel" aria-labelledby="trip-schedule">
      <h2 id="trip-schedule">{t.schedule}</h2>
      {days.map((day) => {
        const items = d.schedule.filter((s) => s.day === day);
        if (!items.length) return null;
        return (
          <div key={day} className="schedule-day">
            <h3>{dayLabel(locale, day)}</h3>
            <ul>
              {items.map((s) => (
                <li key={s.id}>
                  <span className="schedule-time">{s.time || "·"}</span>
                  <span>
                    <strong>{s.title}</strong>
                    {s.place && <span className="muted"> · {s.place}</span>}
                    {s.notes && <span className="muted small"> · {s.notes}</span>}
                  </span>
                  {d.can.manage && (
                    <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "removeSchedule", id: s.id })}>
                      {t.remove}
                      <span className="sr-only"> : {s.title}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {d.can.manage && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = (k: string) => String(f.get(k) ?? "");
            const form = e.currentTarget;
            void send({ action: "schedule", tripId: d.trip.id, day: s("day"), time: s("time"), title: s("title"), place: s("place"), notes: "" }).then(
              (ok) => ok && form.reset(),
            );
          }}
        >
          <label htmlFor="sch-day">
            {t.day}
            <select id="sch-day" name="day">
              {days.map((x) => (
                <option key={x} value={x}>{dayLabel(locale, x)}</option>
              ))}
            </select>
          </label>
          <label htmlFor="sch-time">
            {t.time}
            <input id="sch-time" name="time" type="time" />
          </label>
          <label htmlFor="sch-title">
            {t.what}
            <input id="sch-title" name="title" required minLength={2} maxLength={160} placeholder="Ex. Match contre Gand" />
          </label>
          <label htmlFor="sch-place">
            {t.where}
            <input id="sch-place" name="place" maxLength={200} />
          </label>
          <button className="button secondary" disabled={busy}>{t.addItem}</button>
        </form>
      )}
    </section>
  );
}

function Checklist({ locale, d, busy, send }: Props) {
  const t = tripsCopy[locale];
  const can = d.can.manage || d.can.staff;
  const done = d.checklist.filter((c) => c.done_at).length;
  return (
    <section className="panel" aria-labelledby="trip-checklist">
      <h2 id="trip-checklist">
        {t.checklist} <span className="muted">({done}/{d.checklist.length})</span>
      </h2>
      <ul className="checklist">
        {d.checklist.map((c) => (
          <li key={c.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={!!c.done_at}
                disabled={!can || busy}
                onChange={() => void send({ action: "tick", itemId: c.id, done: !c.done_at })}
              />
              <span>{c.label}</span>
            </label>
            {c.done_by && <span className="muted small">{t.doneBy.replace("{name}", c.done_by)}</span>}
            {d.can.manage && (
              <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "removeChecklist", itemId: c.id })}>
                {t.remove}
                <span className="sr-only"> : {c.label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {d.can.manage && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const label = String(new FormData(form).get("label") ?? "");
            void send({ action: "checklist", tripId: d.trip.id, label }).then((ok) => ok && form.reset());
          }}
        >
          <label htmlFor="check-label">
            {t.addCheck}
            <input id="check-label" name="label" required minLength={2} maxLength={200} />
          </label>
          <button className="button secondary" disabled={busy}>{t.addCheck}</button>
        </form>
      )}
    </section>
  );
}

function Documents({ locale, d }: { locale: Locale; d: Detail }) {
  const t = tripsCopy[locale];
  return (
    <section className="panel" aria-labelledby="trip-documents">
      <h2 id="trip-documents">{t.documents}</h2>
      <p className="muted">{t.documentsIntro}</p>
      {d.countdown.urgent && d.documents.length > 0 && (
        <p className="notice">
          {t.urgent.replace("{n}", String(d.countdown.left))}{" "}
          <Link href={`/${locale}/reminders`}>{t.remindLink}</Link>
        </p>
      )}
      {d.documents.length ? (
        <ul className="profile-list">
          {d.documents.map((x) => (
            <li key={x.id}>
              <div>
                <strong>{x.full_name}</strong>
                <p className="muted small">
                  {x.name} · {t.docStatus[x.status] ?? x.status}
                  {x.expires_on && ` · ${dayLabel(locale, x.expires_on)}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.documentsOk}</p>
      )}
    </section>
  );
}

function CareSection({ locale, d, busy, send }: Props) {
  const t = tripsCopy[locale];
  const care = d.care!;
  const can = d.can.manage || d.can.staff;
  const person = (profileId: string) => d.participants.find((p) => p.profile_id === profileId)?.full_name ?? "";
  const done = (id: string, day: string) => care.done.find((x) => x.instruction_id === id && x.day === day);
  const [day, setDay] = useState(() =>
    care.days.includes(d.today) ? d.today : care.days[0],
  );
  return (
    <section className="panel" aria-labelledby="trip-care">
      <h2 id="trip-care">{t.care}</h2>
      <p className="muted">{t.careIntro}</p>
      {d.support.some((s) => s.support_needs || s.safety_notes || s.emergency_contact) && (
        <details className="support-list">
          <summary>{t.support}</summary>
          <ul className="profile-list">
            {d.support
              .filter((s) => s.support_needs || s.safety_notes || s.emergency_contact)
              .map((s) => (
                <li key={s.profile_id}>
                  <div>
                    <strong>{person(s.profile_id)}</strong>
                    {s.support_needs && <p className="small">{s.support_needs}</p>}
                    {s.safety_notes && <p className="small">{t.safety} : {s.safety_notes}</p>}
                    {s.emergency_contact && <p className="small">{t.emergencyContact} : {s.emergency_contact}</p>}
                  </div>
                </li>
              ))}
          </ul>
        </details>
      )}
      {care.instructions.length ? (
        <>
          <div className="segmented day-switch" role="radiogroup" aria-label={t.day}>
            {care.days.map((x) => (
              <label key={x} className="segment">
                <input type="radio" name="care-day" checked={day === x} onChange={() => setDay(x)} />
                <span>{dayLabel(locale, x)}</span>
              </label>
            ))}
          </div>
          <ul className="checklist care-list">
            {care.instructions.map((c) => {
              const row = done(c.id, day);
              return (
                <li key={c.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!row}
                      disabled={!can || busy}
                      onChange={() => void send({ action: "care", tripId: d.trip.id, instructionId: c.id, day, done: !row, note: "" })}
                    />
                    <span>
                      <strong>{person(c.profile_id)}</strong> · {t.moments[c.moment]}
                      {c.time && ` ${c.time}`} · {c.title}
                      {c.details && <span className="muted small"> · {c.details}</span>}
                    </span>
                  </label>
                  {row && <span className="muted small">{t.doneBy.replace("{name}", row.done_by)}</span>}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="muted">{t.careNone}</p>
      )}
    </section>
  );
}

function Budget({ locale, d, busy, send }: Props) {
  const t = tripsCopy[locale];
  const b = d.budget!;
  const [lines, setLines] = useState(b.lines.map((l) => ({ label: l.label, amount: (l.planned_cents / 100).toFixed(2) })));
  const planned = b.lines.reduce((n, l) => n + l.planned_cents, 0);
  return (
    <section className="panel" aria-labelledby="trip-budget">
      <h2 id="trip-budget">{t.budget}</h2>
      <p className="muted">{t.budgetIntro}</p>
      <dl className="report-totals">
        <div>
          <dt>{t.planned}</dt>
          <dd>{euros(locale, planned)}</dd>
        </div>
        <div>
          <dt>{t.spent}</dt>
          <dd>{euros(locale, b.spent)}</dd>
        </div>
        <div>
          <dt>{t.received}</dt>
          <dd>{euros(locale, b.received)}</dd>
        </div>
      </dl>
      {d.can.manage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              action: "budget",
              tripId: d.trip.id,
              lines: lines
                .filter((l) => l.label.trim().length >= 2)
                .map((l) => ({ label: l.label.trim(), plannedCents: Math.round(Number(l.amount.replace(",", ".") || 0) * 100) })),
            });
          }}
        >
          {lines.map((l, i) => (
            <div key={i} className="inline-form">
              <label>
                {t.label}
                <input value={l.label} maxLength={120} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </label>
              <label>
                {t.amount}
                <input inputMode="decimal" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              </label>
              <button type="button" className="text-button" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                {t.remove}
              </button>
            </div>
          ))}
          <div className="actions">
            <button type="button" className="button secondary" onClick={() => setLines([...lines, { label: "", amount: "" }])}>
              {t.addLine}
            </button>
            <button className="button" disabled={busy}>{t.save}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function Offline({ locale, d }: { locale: Locale; d: Detail }) {
  const t = tripsCopy[locale];
  const [state, setState] = useState<"" | "busy" | "done">(""),
    [error, setError] = useState("");
  async function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const code = String(f.get("code") ?? ""),
      again = String(f.get("again") ?? "");
    setError("");
    if (code !== again) return setError(t.codeMismatch);
    setState("busy");
    try {
      const r = await fetch(`/api/trips/offline?id=${d.trip.id}`, { cache: "no-store" });
      const pack = await r.json();
      if (!r.ok) throw new Error(pack.error);
      await storeBook(pack, code);
      // Loading the book page once keeps it (and its scripts) available offline.
      await new Promise<void>((resolve) => {
        const frame = document.createElement("iframe");
        frame.hidden = true;
        frame.src = `/${locale}/offline-book`;
        const done = () => {
          frame.remove();
          resolve();
        };
        frame.onload = done;
        window.setTimeout(done, 8000);
        document.body.appendChild(frame);
      });
      setState("done");
    } catch {
      setState("");
      setError(t.unavailable);
    }
  }
  return (
    <section className="panel" aria-labelledby="trip-offline">
      <h2 id="trip-offline">{t.offline}</h2>
      <p className="muted">{t.offlineIntro}</p>
      <form className="inline-form" onSubmit={prepare}>
        <label htmlFor="book-code">
          {t.code}
          <input id="book-code" name="code" type="password" inputMode="numeric" autoComplete="new-password" required minLength={6} maxLength={64} pattern="[0-9]{6,}" />
        </label>
        <label htmlFor="book-again">
          {t.codeAgain}
          <input id="book-again" name="again" type="password" inputMode="numeric" autoComplete="new-password" required minLength={6} maxLength={64} pattern="[0-9]{6,}" />
        </label>
        <button className="button" disabled={state === "busy"}>{t.prepare}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {state === "done" && (
        <p role="status">
          {t.prepared} <Link href={`/${locale}/offline-book`}>{t.openBook}</Link>
        </p>
      )}
    </section>
  );
}
