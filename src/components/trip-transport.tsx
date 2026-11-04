"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { roadSheet, tripsView } from "@/domains/trips/service";
import type { Round } from "@/domains/trips/rounds";
import { driverCandidates, stopKinds, vehicleKinds, type StopKind, type VehicleKind } from "@/domains/trips/transport";
import { tripsCopy } from "./trips-copy";
import { tripTransportCopy } from "./trip-transport-copy";
import { ContactPicker } from "./contact-picker";
import { fromLocalInput, hourLabel, timeLabel, toLocalInput, type Detail } from "./trips";
import { Badge, Button, Card } from "./ui";

/**
 * 3: the transport of a trip. Each vehicle (club's, rental, private) with
 * its drivers, its load checked against what it holds, and its round:
 * ordered, timed steps with the people in charge and a route link. Then the
 * tasks drawn from the steps, checked before they go to the to-do, and the
 * planned costs. Those who travel see their own vehicle and its round.
 */
type List = Awaited<ReturnType<typeof tripsView>>;
type Send = (body: Record<string, unknown>, done?: string) => Promise<boolean>;
type Any = Detail["vehicles"][number];
const full = (v: Any): v is Round => "check" in v;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const euros = (l: Locale, cents: number) => new Intl.NumberFormat(l === "en" ? "en-GB" : `${l}-BE`, { style: "currency", currency: "EUR" }).format(cents / 100);
const toCents = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Math.round(Number(String(v).replace(",", ".")) * 100));
const fromCents = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

export function TransportSection({ locale, d, list, busy, send, name }: { locale: Locale; d: Detail; list: List | null; busy: boolean; send: Send; name: (id: string) => string }) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const [editing, setEditing] = useState<string | null>(null),
    [round, setRound] = useState<string | null>(null),
    [tasks, setTasks] = useState(false);
  if (!d.vehicles.length && !d.can.manage) return null;
  const people = peopleOf(d);
  return (
    <Card
      title={t.tabs.transport}
      labelledBy="trip-transport"
      headingId="trip-transport"
      actions={
        <>
          <Link className="button secondary" href={`/${locale}/trips/${d.trip.id}/roadsheet`}>
            {tt.sheet}
          </Link>
          {d.can.manage && d.trip.calendar_event_id && (
            <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "importInvited", tripId: d.trip.id })}>
              {tt.importInvited}
            </Button>
          )}
          {d.can.manage && editing === null && (
            <Button variant="secondary" icon="plus" onClick={() => setEditing("new")}>
              {t.addVehicle}
            </Button>
          )}
        </>
      }
    >
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
      {editing === "new" && list && (
        <VehicleForm locale={locale} d={d} list={list} busy={busy} close={() => setEditing(null)} send={send} />
      )}
      <ul className="vehicle-list">
        {d.vehicles.map((v) =>
          editing === v.id && list && full(v) ? (
            <li key={v.id}>
              <VehicleForm locale={locale} d={d} list={list} v={v} busy={busy} close={() => setEditing(null)} send={send} />
            </li>
          ) : (
            <VehicleCard
              key={v.id}
              locale={locale}
              v={v}
              d={d}
              busy={busy}
              send={send}
              name={name}
              editRound={round === v.id}
              people={people}
              places={list?.places ?? []}
              onEdit={() => setEditing(v.id)}
              onRound={(open) => setRound(open ? v.id : null)}
            />
          ),
        )}
      </ul>
      {d.costs && d.costs.total > 0 && (
        <dl className="trip-costs" aria-label={tt.costs}>
          <dt>{tt.costRental}</dt>
          <dd>{euros(locale, d.costs.rental)}</dd>
          <dt>{tt.costFuel}</dt>
          <dd>{euros(locale, d.costs.fuel)}</dd>
          <dt>{tt.costMileage}</dt>
          <dd>{euros(locale, d.costs.mileage)}</dd>
          <dt>{tt.costTotal}</dt>
          <dd>
            <strong>{euros(locale, d.costs.total)}</strong>
          </dd>
        </dl>
      )}
      {d.can.manage && d.vehicles.length > 0 && (
        <>
          <label className="check trip-tasks-toggle">
            <input type="checkbox" checked={tasks} onChange={(e) => setTasks(e.target.checked)} aria-controls={tasks ? "trip-tasks" : undefined} />
            {tt.createTasks}
          </label>
          {tasks && <TaskList locale={locale} d={d} people={people} busy={busy} send={send} />}
        </>
      )}
    </Card>
  );
}

/** The trip's people who can take a step or a task: travellers and drivers. */
function peopleOf(d: Detail) {
  const out = new Map<string, string>();
  for (const p of d.participants) if (p.status !== "declined") out.set(p.profile_id, p.full_name);
  for (const v of d.vehicles) for (const x of v.drivers) out.set(x.profile_id, x.full_name);
  return [...out].map(([id, full_name]) => ({ id, full_name })).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function VehicleCard({
  locale,
  v,
  d,
  busy,
  send,
  name,
  editRound,
  people,
  places,
  onEdit,
  onRound,
}: {
  locale: Locale;
  v: Any;
  d: Detail;
  busy: boolean;
  send: Send;
  name: (id: string) => string;
  editRound: boolean;
  people: { id: string; full_name: string }[];
  places: { id: string; name: string }[];
  onEdit: () => void;
  onRound: (open: boolean) => void;
}) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const kind = v.kind as VehicleKind;
  return (
    <Card as="li" className="vehicle-card">
      <div className="trip-card-head">
        <strong>{v.name}</strong>
        <span className="trip-meta">
          <Badge tone="info">{tt.kinds[kind]}</Badge>
          <Badge>{t.legsLabels[v.legs]}</Badge>
        </span>
      </div>
      {v.drivers.length > 0 && (
        <ul className="plain-list trip-drivers" aria-label={tt.drivers}>
          {v.drivers.map((x) => (
            <li key={x.profile_id}>
              {x.full_name} <span className="muted small">({t.legsLabels[x.legs]})</span>
              {x.phone && (
                <>
                  {" "}
                  <a href={`tel:${x.phone.replace(/\s+/g, "")}`}>{x.phone}</a>
                </>
              )}
              {"covers" in x && (
                <>
                  {" "}
                  {x.covers ? (
                    <Badge tone="success">{x.verified ? tt.licenceVerified : tt.licenceDeclared}</Badge>
                  ) : (
                    <Badge tone="warning">{fill(tt.licenceMissing, { need: full(v) ? v.need : "B" })}</Badge>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {full(v) && (
        <>
          <p className="small">{fill(tt.load, { seated: v.check.seated, seats: v.check.seats, places: v.check.places, wheel: v.check.wheelchairPlaces })}</p>
          {v.check.problems.length ? (
            <ul className="plain-list" role="list">
              {v.check.problems.map((p) => (
                <li key={p}>
                  <Badge tone="danger">{tt.problems[p]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{tt.fits}</p>
          )}
          {v.warnings.map((w: string) => (
            <p key={w}>
              <Badge tone="warning">{t.warnings[w]}</Badge>
            </p>
          ))}
          {v.chairs.length > 0 && (
            <p className="small">
              {tt.chairs} : {v.chairs.map((c) => `${c.name} (${tt.ownership[c.ownership] ?? c.ownership})`).join(", ")}
            </p>
          )}
          {v.kind === "rental" && (v.rental_company || v.rental_name || v.booking_ref) && (
            <p className="small">
              {tt.renter} : {[v.rental_company || v.rental_name, v.booking_ref && fill(tt.booking, { ref: v.booking_ref })].filter(Boolean).join(" · ")}
            </p>
          )}
          {v.equipment && <p className="small pre-line">{v.equipment}</p>}
        </>
      )}
      <p className="small">
        {t.passengers} : {v.passengers.map(name).filter(Boolean).join(", ") || "0"}
      </p>
      <h3 className="trip-round-title">{tt.round}</h3>
      {editRound && full(v) ? (
        <RoundEditor locale={locale} v={v} people={people} places={places} busy={busy} send={send} estimate={d.estimate} close={() => onRound(false)} />
      ) : v.stops.length ? (
        <ol className="trip-round">
          {v.stops.map((st, i) => (
            <li key={st.id}>
              <span className="trip-stop-time">{st.at ? hourLabel(locale, st.at) : ""}</span>
              <span>
                <strong>{st.label || tt.stopKinds[st.kind]}</strong>
                {st.label && <span className="muted small"> ({tt.stopKinds[st.kind]})</span>}
                {st.where && <span className="small"> · {st.where}</span>}
                {"people_names" in st && st.people_names.length > 0 && <span className="small"> · {st.people_names.join(", ")}</span>}
                {st.minutes !== null && <span className="muted small"> · {fill(tt.minutesText, { n: st.minutes })}</span>}
                {"task_status" in st && st.task_status && (
                  <>
                    {" "}
                    <Badge tone={st.task_status === "done" ? "success" : "info"}>{st.task_status === "done" ? tt.taskDone : tt.taskSent}</Badge>
                  </>
                )}
                {st.route && (
                  <span className="trip-route small">
                    {" "}
                    {tt.route} :{" "}
                    <a href={st.route.google} target="_blank" rel="noreferrer">
                      Google Maps<span className="sr-only"> ({fill(tt.stepOf, { n: i + 1, kind: tt.stopKinds[st.kind] })})</span>
                    </a>
                    {" · "}
                    <a href={st.route.waze} target="_blank" rel="noreferrer">
                      Waze<span className="sr-only"> ({fill(tt.stepOf, { n: i + 1, kind: tt.stopKinds[st.kind] })})</span>
                    </a>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">{tt.noStops}</p>
      )}
      {d.can.manage && !editRound && (
        <div className="row-actions">
          <button type="button" className="text-button" onClick={onEdit}>
            {t.edit}
            <span className="sr-only"> : {v.name}</span>
          </button>
          <button type="button" className="text-button" onClick={() => onRound(true)}>
            {tt.editRound}
            <span className="sr-only"> : {v.name}</span>
          </button>
          {!v.stops.length && (
            <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "suggestStops", vehicleId: v.id })}>
              {tt.suggest}
              <span className="sr-only"> : {v.name}</span>
            </button>
          )}
          <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "removeVehicle", id: v.id })}>
            {t.remove}
            <span className="sr-only"> : {v.name}</span>
          </button>
        </div>
      )}
    </Card>
  );
}

type DriverChoice = { profileId: string; legs: "both" | "out" | "back" };
function VehicleForm({ locale, d, list, v, busy, send, close }: { locale: Locale; d: Detail; list: List; v?: Round; busy: boolean; send: Send; close: () => void }) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const [kind, setKind] = useState<VehicleKind>(v?.kind ?? "club"),
    [fleetId, setFleetId] = useState(v?.vehicle_id ?? ""),
    [drivers, setDrivers] = useState<DriverChoice[]>(v?.drivers.map((x) => ({ profileId: x.profile_id, legs: x.legs as DriverChoice["legs"] })) ?? []),
    [query, setQuery] = useState(""),
    [passengers, setPassengers] = useState<string[]>(v?.passengers ?? []),
    [chairs, setChairs] = useState<string[]>(v?.chairs.map((c) => c.id) ?? []);
  const fleet = list.fleet.filter((x) => !x.archived);
  const picked = fleet.find((x) => x.id === fleetId);
  const need = kind === "club" && picked ? picked.licence : "B";
  const candidates = driverCandidates(list.people, list.drivers, need, d.trip.ends_on).filter((p) => !drivers.some((x) => x.profileId === p.id));
  const shown = candidates.filter((p) => !query.trim() || p.full_name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const travelling = d.participants.filter((p) => p.status !== "declined");
  const key = `${v?.id ?? "new"}-${kind}-${fleetId}`;
  const nameOf = (id: string) => list.people.find((p) => p.id === id)?.full_name ?? "";
  const rate = list.mileageRateCents;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    void send({
      action: "vehicle",
      tripId: d.trip.id,
      ...(v ? { id: v.id } : {}),
      kind,
      vehicleId: kind === "club" ? fleetId || null : null,
      name: s("name"),
      legs: s("legs") || "both",
      driverProfileId: null,
      driverPhone: s("phone"),
      seats: Number(s("seats") || 0),
      wheelchairPlaces: Number(s("wheel") || 0),
      ramp: f.get("ramp") === "on",
      notes: s("notes"),
      passengers,
      drivers,
      chairs,
      rentalContactId: s("rentalContactId") || null,
      pickupAddress: s("pickupAddress"),
      returnAddress: s("returnAddress"),
      bookingRef: s("bookingRef"),
      plannedCostCents: toCents(f.get("plannedCost")),
      depositCents: toCents(f.get("deposit")),
      ownerProfileId: s("ownerProfileId") || null,
      ownerContactId: s("ownerContactId") || null,
      mileage: f.get("mileage") === "on",
      distanceKm: s("distanceKm") ? Number(s("distanceKm")) : null,
      fuelCents: toCents(f.get("fuel")),
      equipment: s("equipment"),
    }).then((ok) => ok && close());
  }
  const id = v?.id ?? "new";
  return (
    <form className="vehicle-form" onSubmit={submit}>
      <fieldset className="segmented-radios">
        <legend>{tt.kind}</legend>
        {vehicleKinds.map((k) => (
          <label key={k} className="check">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            {tt.kinds[k]}
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        {kind === "club" && (
          <label htmlFor={`${id}-fleet`}>
            {t.fromFleet}
            <select id={`${id}-fleet`} value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
              <option value="">{t.noneOption}</option>
              {fleet.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor={`${id}-name`}>
          {t.vehicleName}
          <input id={`${id}-name`} key={`${key}-n`} name="name" required minLength={2} maxLength={80} defaultValue={v?.name ?? picked?.name ?? ""} />
        </label>
        <label htmlFor={`${id}-legs`}>
          {t.legs}
          <select id={`${id}-legs`} name="legs" defaultValue={v?.legs ?? "both"}>
            {Object.entries(t.legsLabels).map(([k, x]) => (
              <option key={k} value={k}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-seats`}>
          {t.seats}
          <input id={`${id}-seats`} key={`${key}-s`} name="seats" type="number" min={0} max={80} defaultValue={v?.seats ?? picked?.seats ?? 4} />
        </label>
        <label htmlFor={`${id}-wheel`}>
          {t.wheelchairPlaces}
          <input id={`${id}-wheel`} key={`${key}-w`} name="wheel" type="number" min={0} max={20} defaultValue={v?.wheelchair_places ?? picked?.wheelchair_places ?? 0} />
        </label>
        <label className="check" htmlFor={`${id}-ramp`}>
          <input id={`${id}-ramp`} key={`${key}-r`} type="checkbox" name="ramp" defaultChecked={v ? v.ramp || !!v.ramp_or_lift : !!picked?.ramp_or_lift} />
          {tt.ramp}
        </label>
        <label htmlFor={`${id}-phone`}>
          {t.driverPhone}
          <input id={`${id}-phone`} name="phone" type="tel" maxLength={60} defaultValue={v?.driver_phone ?? ""} />
        </label>
      </div>
      {kind === "rental" && (
        <div className="form-grid">
          <ContactPicker locale={locale} name="rentalContactId" value={v?.rental_contact_id ?? null} label={tt.renter} none={tt.noRenter} tags={["rental"]} />
          <label htmlFor={`${id}-pickup`}>
            {tt.pickupAddress}
            <input id={`${id}-pickup`} name="pickupAddress" maxLength={300} defaultValue={v?.pickup_address ?? ""} />
          </label>
          <label htmlFor={`${id}-return`}>
            {tt.returnAddress}
            <input id={`${id}-return`} name="returnAddress" maxLength={300} defaultValue={v?.return_address ?? ""} />
          </label>
          <label htmlFor={`${id}-booking`}>
            {tt.bookingRef}
            <input id={`${id}-booking`} name="bookingRef" maxLength={80} defaultValue={v?.booking_ref ?? ""} />
          </label>
          <label htmlFor={`${id}-cost`}>
            {tt.plannedCost}
            <input id={`${id}-cost`} name="plannedCost" type="number" min={0} step="0.01" defaultValue={fromCents(v?.planned_cost_cents)} />
          </label>
          <label htmlFor={`${id}-deposit`}>
            {tt.deposit}
            <input id={`${id}-deposit`} name="deposit" type="number" min={0} step="0.01" defaultValue={fromCents(v?.deposit_cents)} />
          </label>
        </div>
      )}
      {kind === "private" && (
        <div className="form-grid">
          <label htmlFor={`${id}-owner`}>
            {tt.owner}
            <select id={`${id}-owner`} name="ownerProfileId" defaultValue={v?.owner_profile_id ?? ""}>
              <option value="">{tt.noOwner}</option>
              {list.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <ContactPicker locale={locale} name="ownerContactId" value={v?.owner_contact_id ?? null} label={tt.ownerContact} none={tt.noOwner} />
          <label className="check" htmlFor={`${id}-mileage`}>
            <input id={`${id}-mileage`} type="checkbox" name="mileage" defaultChecked={v?.mileage ?? false} aria-describedby={`${id}-rate`} />
            {tt.mileage}
          </label>
          <p className="muted small" id={`${id}-rate`}>
            {rate !== null && rate !== undefined ? fill(tt.mileageAt, { rate: euros(locale, rate) }) : tt.noRate}
          </p>
          <label htmlFor={`${id}-km`}>
            {tt.distance}
            <input id={`${id}-km`} name="distanceKm" type="number" min={0} max={10000} defaultValue={v?.distance_km ?? ""} />
          </label>
        </div>
      )}
      <fieldset className="trip-driver-picker">
        <legend>{tt.drivers}</legend>
        {drivers.length > 0 && (
          <ul className="plain-list">
            {drivers.map((x) => (
              <li key={x.profileId} className="trip-driver-row">
                <span>{nameOf(x.profileId)}</span>
                <label htmlFor={`${id}-legs-${x.profileId}`}>
                  <span className="sr-only">{fill(tt.driverLegs, { name: nameOf(x.profileId) })}</span>
                  <select
                    id={`${id}-legs-${x.profileId}`}
                    value={x.legs}
                    onChange={(e) => setDrivers(drivers.map((y) => (y.profileId === x.profileId ? { ...y, legs: e.target.value as DriverChoice["legs"] } : y)))}
                  >
                    {Object.entries(t.legsLabels).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="text-button" onClick={() => setDrivers(drivers.filter((y) => y.profileId !== x.profileId))}>
                  {fill(tt.removeDriver, { name: nameOf(x.profileId) })}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={`${id}-driver-search`}>
          {tt.driverPick}
          <input id={`${id}-driver-search`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="plain-list trip-driver-candidates">
          {shown.map((p) => (
            <li key={p.id} className="trip-driver-row">
              <span>
                {p.full_name}{" "}
                {p.covers ? (
                  <Badge tone="success">{p.verified ? tt.licenceVerified : tt.licenceDeclared}</Badge>
                ) : (
                  <Badge tone="warning">{fill(tt.licenceMissing, { need })}</Badge>
                )}
              </span>
              <button type="button" className="button secondary sm" onClick={() => setDrivers([...drivers, { profileId: p.id, legs: "both" }])}>
                {tt.addDriver}
                <span className="sr-only"> : {p.full_name}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset className="people-picker">
        <legend>{t.passengers}</legend>
        {travelling.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={passengers.includes(p.id)} onChange={() => setPassengers(passengers.includes(p.id) ? passengers.filter((x) => x !== p.id) : [...passengers, p.id])} />
            {p.full_name}
            {(p.chair === "powerchair" || p.chair === "both") && <span className="muted"> ({t.chairs.powerchair})</span>}
          </label>
        ))}
      </fieldset>
      {list.chairs.length > 0 && (
        <fieldset className="people-picker">
          <legend>{tt.chairs}</legend>
          {list.chairs.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={chairs.includes(c.id)} onChange={() => setChairs(chairs.includes(c.id) ? chairs.filter((x) => x !== c.id) : [...chairs, c.id])} />
              {c.name} <span className="muted">({tt.ownership[c.ownership] ?? c.ownership})</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-grid">
        <label htmlFor={`${id}-fuel`}>
          {tt.fuel}
          <input id={`${id}-fuel`} name="fuel" type="number" min={0} step="0.01" defaultValue={fromCents(v?.fuel_cents)} />
        </label>
      </div>
      <label htmlFor={`${id}-equipment`}>
        {tt.equipment}
        <textarea id={`${id}-equipment`} name="equipment" maxLength={1000} rows={2} defaultValue={v?.equipment ?? ""} />
      </label>
      <label htmlFor={`${id}-notes`}>
        {t.fields.notes}
        <input id={`${id}-notes`} name="notes" maxLength={500} defaultValue={v?.notes ?? ""} />
      </label>
      <div className="actions">
        <Button type="submit" disabled={busy}>{t.save}</Button>
        <Button type="button" variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

type StopDraft = { key: string; id?: string; kind: StopKind; label: string; placeId: string; sharedVenueId: string | null; address: string; at: string; minutes: string; notes: string; people: string[] };
let counter = 0;
const draftOf = (s: Round["stops"][number]): StopDraft => ({
  key: s.id,
  id: s.id,
  kind: s.kind,
  label: s.label,
  placeId: s.place_id ?? "",
  sharedVenueId: s.shared_venue_id,
  address: s.address,
  at: toLocalInput(s.at),
  minutes: s.minutes === null ? "" : String(s.minutes),
  notes: s.notes,
  people: s.people,
});

/** 4: the round edited as a list: change, add, remove, reorder (drag, or Move up / Move down). */
function RoundEditor({
  locale,
  v,
  people,
  places,
  busy,
  send,
  estimate,
  close,
}: {
  locale: Locale;
  v: Round;
  people: { id: string; full_name: string }[];
  places: { id: string; name: string }[];
  busy: boolean;
  send: Send;
  estimate: boolean;
  close: () => void;
}) {
  const t = tripsCopy[locale],
    tt = tripTransportCopy[locale];
  const [stops, setStops] = useState<StopDraft[]>(() => v.stops.map(draftOf)),
    [dragged, setDragged] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length || from === to) return;
    const next = [...stops];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setStops(next);
  };
  const change = (i: number, patch: Partial<StopDraft>) => setStops(stops.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send({
      action: "stops",
      vehicleId: v.id,
      stops: stops.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        kind: s.kind,
        label: s.label,
        placeId: s.placeId || null,
        sharedVenueId: s.sharedVenueId,
        address: s.address,
        at: fromLocalInput(s.at),
        minutes: s.minutes === "" ? null : Number(s.minutes),
        notes: s.notes,
        people: s.people,
      })),
    }).then((ok) => ok && close());
  }
  const drop = (i: number) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (dragged !== null) move(dragged, i);
    setDragged(null);
  };
  return (
    <form className="round-editor" onSubmit={submit}>
      <p className="muted small">{tt.moveHint}</p>
      <ol className="round-steps">
        {stops.map((s, i) => {
          const label = fill(tt.stepOf, { n: i + 1, kind: tt.stopKinds[s.kind] });
          const base = `${v.id}-${s.key}`;
          return (
            <li key={s.key} draggable onDragStart={() => setDragged(i)} onDragOver={(e) => e.preventDefault()} onDrop={drop(i)} data-dragging={dragged === i || undefined}>
              <fieldset>
                <legend>{label}</legend>
                <div className="form-grid">
                  <label htmlFor={`${base}-kind`}>
                    {tt.stopKind}
                    <select id={`${base}-kind`} value={s.kind} onChange={(e) => change(i, { kind: e.target.value as StopKind })}>
                      {stopKinds.map((k) => (
                        <option key={k} value={k}>
                          {tt.stopKinds[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${base}-label`}>
                    {tt.stopLabel}
                    <input id={`${base}-label`} maxLength={160} value={s.label} onChange={(e) => change(i, { label: e.target.value })} />
                  </label>
                  <label htmlFor={`${base}-at`}>
                    {tt.at}
                    <input id={`${base}-at`} type="datetime-local" value={s.at} onChange={(e) => change(i, { at: e.target.value })} />
                  </label>
                  {places.length > 0 && (
                    <label htmlFor={`${base}-place`}>
                      {tt.place}
                      <select id={`${base}-place`} value={s.placeId} onChange={(e) => change(i, { placeId: e.target.value })}>
                        <option value="">{t.noneOption}</option>
                        {places.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label htmlFor={`${base}-address`}>
                    {tt.address}
                    <input id={`${base}-address`} maxLength={300} value={s.address} onChange={(e) => change(i, { address: e.target.value })} />
                  </label>
                  <label htmlFor={`${base}-minutes`}>
                    {tt.minutes}
                    <input id={`${base}-minutes`} type="number" min={0} max={2000} value={s.minutes} onChange={(e) => change(i, { minutes: e.target.value })} />
                  </label>
                  <label htmlFor={`${base}-notes`}>
                    {tt.notes}
                    <input id={`${base}-notes`} maxLength={500} value={s.notes} onChange={(e) => change(i, { notes: e.target.value })} />
                  </label>
                </div>
                {people.length > 0 && (
                  <fieldset className="people-picker">
                    <legend>{tt.people}</legend>
                    {people.map((p) => (
                      <label key={p.id} className="check">
                        <input
                          type="checkbox"
                          checked={s.people.includes(p.id)}
                          onChange={() => change(i, { people: s.people.includes(p.id) ? s.people.filter((x) => x !== p.id) : [...s.people, p.id] })}
                        />
                        {p.full_name}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="row-actions">
                  <button type="button" className="text-button" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    {tt.up}
                    <span className="sr-only"> : {label}</span>
                  </button>
                  <button type="button" className="text-button" disabled={i === stops.length - 1} onClick={() => move(i, i + 1)}>
                    {tt.down}
                    <span className="sr-only"> : {label}</span>
                  </button>
                  {estimate && s.id && i > 0 && (
                    <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "estimate", stopId: s.id })}>
                      {tt.estimate}
                      <span className="sr-only"> : {label}</span>
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={() => setStops(stops.filter((_, n) => n !== i))}>
                    {tt.removeStop}
                    <span className="sr-only"> : {label}</span>
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="actions">
        <Button
          type="button"
          variant="secondary"
          icon="plus"
          onClick={() => setStops([...stops, { key: `new-${++counter}`, kind: "other", label: "", placeId: "", sharedVenueId: null, address: "", at: "", minutes: "", notes: "", people: [] }])}
        >
          {tt.addStop}
        </Button>
        <Button type="submit" disabled={busy}>{tt.saveRound}</Button>
        <Button type="button" variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

type TaskRow = { key: string; title: string; dueOn: string; time: string; people: string[]; remove: boolean; sent: boolean; done: boolean };
/** 7: the tasks drawn from the steps, each editable, then sent once to the to-do. */
function TaskList({ locale, d, people, busy, send }: { locale: Locale; d: Detail; people: { id: string; full_name: string }[]; busy: boolean; send: Send }) {
  const tt = tripTransportCopy[locale];
  const vehicleName = (id: string) => d.vehicles.find((v) => v.id === id)?.name ?? "";
  const [rows, setRows] = useState<TaskRow[]>(() =>
    d.tasks.map((x) => ({
      key: x.key,
      title: x.task?.title ?? `${tt.words[x.kind]} (${vehicleName(x.vehicleId)})`.slice(0, 200),
      dueOn: x.task?.due_on ?? x.dueOn,
      time: x.time,
      people: x.task?.people ?? x.people,
      remove: false,
      sent: !!x.task,
      done: x.task?.status === "done",
    })),
  );
  const change = (i: number, patch: Partial<TaskRow>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  if (!rows.length)
    return (
      <p className="muted" id="trip-tasks">
        {tt.noTasks}
      </p>
    );
  return (
    <form
      id="trip-tasks"
      className="trip-tasks"
      onSubmit={(e) => {
        e.preventDefault();
        void send(
          {
            action: "tasks",
            tripId: d.trip.id,
            items: rows.filter((r) => !r.done && (r.sent || !r.remove)).map(({ key, title, dueOn, time, people: p, remove }) => ({ key, title, dueOn, time, people: p, remove })),
          },
          tt.saved,
        );
      }}
    >
      <p className="muted small">{tt.tasksIntro}</p>
      {rows.map((r, i) => {
        const base = `trip-task-${r.key.replace(":", "-")}`;
        return (
          <fieldset key={r.key} className="trip-task" disabled={r.done}>
            <legend>
              {r.title} {r.sent && <Badge tone={r.done ? "success" : "info"}>{r.done ? tt.taskDone : tt.inTodo}</Badge>}
            </legend>
            <div className="form-grid">
              <label htmlFor={`${base}-title`}>
                {tt.taskTitle}
                <input id={`${base}-title`} required minLength={2} maxLength={200} value={r.title} onChange={(e) => change(i, { title: e.target.value })} />
              </label>
              <label htmlFor={`${base}-day`}>
                {tt.taskDay}
                <input id={`${base}-day`} type="date" required value={r.dueOn} onChange={(e) => change(i, { dueOn: e.target.value })} />
              </label>
              <label htmlFor={`${base}-time`}>
                {tt.taskTime}
                <input id={`${base}-time`} type="time" value={r.time} onChange={(e) => change(i, { time: e.target.value })} />
              </label>
            </div>
            <fieldset className="people-picker">
              <legend>{tt.taskPeople}</legend>
              {people.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={r.people.includes(p.id)} onChange={() => change(i, { people: r.people.includes(p.id) ? r.people.filter((x) => x !== p.id) : [...r.people, p.id] })} />
                  {p.full_name}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input type="checkbox" checked={r.remove} onChange={(e) => change(i, { remove: e.target.checked })} />
              {r.sent ? tt.taskRemoveSent : tt.taskRemove}
            </label>
          </fieldset>
        );
      })}
      <div className="actions">
        <Button type="submit" disabled={busy}>{tt.sendTasks}</Button>
      </div>
    </form>
  );
}

/** 9: the road sheet's vehicle, printable: steps, hours, phones, and care for who may see it. */
export function SheetVehicle({ locale, v }: { locale: Locale; v: Awaited<ReturnType<typeof roadSheet>>["vehicles"][number] }) {
  const tt = tripTransportCopy[locale];
  return (
    <Card as="section" className="sheet-vehicle" title={v.name} headingId={`sheet-${v.id}`} labelledBy={`sheet-${v.id}`}>
      <p className="small">
        {tt.kinds[v.kind]}
        {v.booking_ref && ` · ${fill(tt.booking, { ref: v.booking_ref })}`}
      </p>
      <ol className="trip-round">
        {v.stops.map((st) => (
          <li key={st.id}>
            <span className="trip-stop-time">{st.at ? timeLabel(locale, st.at) : ""}</span>
            <span>
              <strong>{st.label || tt.stopKinds[st.kind]}</strong>
              {st.where && <span> · {st.where}</span>}
              {st.people.length > 0 && <span className="small"> · {st.people.join(", ")}</span>}
              {st.minutes !== null && <span className="muted small"> · {fill(tt.minutesText, { n: st.minutes })}</span>}
              {st.notes && <span className="small"> · {st.notes}</span>}
              {st.route && (
                <span className="trip-route small no-print">
                  {" "}
                  <a href={st.route.google} target="_blank" rel="noreferrer">
                    Google Maps<span className="sr-only"> ({st.where})</span>
                  </a>
                  {" · "}
                  <a href={st.route.waze} target="_blank" rel="noreferrer">
                    Waze<span className="sr-only"> ({st.where})</span>
                  </a>
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {v.passengers.length > 0 && (
        <p>
          <strong>{tt.passengers}</strong> : {v.passengers.join(", ")}
        </p>
      )}
      {v.phones.length > 0 && (
        <>
          <h3>{tt.phones}</h3>
          <ul className="plain-list">
            {v.phones.map((p, i) => (
              <li key={i}>
                {tt.roles[p.role]} · {p.who} : <a href={`tel:${p.phone.replace(/\s+/g, "")}`}>{p.phone}</a>
              </li>
            ))}
          </ul>
        </>
      )}
      {v.care.length > 0 && (
        <>
          <h3>{tt.care}</h3>
          <p className="muted small">{tt.careNote}</p>
          <ul className="plain-list">
            {v.care.map((c) => (
              <li key={c.id}>
                <strong>{c.who}</strong> · {c.title}
                {c.time && ` (${c.time})`}
                {c.details && <span className="pre-line"> · {c.details}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
