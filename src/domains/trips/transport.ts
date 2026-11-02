/**
 * 3: a trip as transport logistics. Pure functions shared by the service,
 * the pages and the tests: the steps proposed for each kind of vehicle,
 * the load check, the drivers' order, the route links, the tasks drawn from
 * the steps and the costs.
 */
export const tripModes = ["transport", "stay"] as const;
export type TripMode = (typeof tripModes)[number];
export const vehicleKinds = ["club", "rental", "private"] as const;
export type VehicleKind = (typeof vehicleKinds)[number];
export const stopKinds = ["pickup_vehicle", "load_equipment", "pick_passengers", "drive", "arrive", "reload", "unload", "return_vehicle", "other"] as const;
export type StopKind = (typeof stopKinds)[number];

/** The former trips: more than one day is a stay, else a transport. */
export const modeFor = (startsOn: string, endsOn: string): TripMode => (endsOn > startsOn ? "stay" : "transport");

type Draft = { kind: StopKind; address: string; at: string | null };
const minutes = (iso: string | null, n: number) => (iso ? new Date(new Date(iso).getTime() + n * 60000).toISOString() : null);
/**
 * The round proposed for a vehicle. A rental is picked up and returned at
 * the agency; the club's vehicle has no agency; a private car leaves from
 * the driver's home (the first step, address left to fill). Times follow
 * the trip's departure and return when they are known.
 */
export function suggestStops(
  kind: VehicleKind,
  trip: { meetingPoint: string; destination: string; returnPoint: string; departureAt: string | null; returnAt: string | null },
  vehicle: { pickupAddress?: string; returnAddress?: string } = {},
): Draft[] {
  const home = trip.meetingPoint;
  const back = trip.returnPoint || trip.meetingPoint;
  const out: Draft[] = [];
  if (kind === "rental") out.push({ kind: "pickup_vehicle", address: vehicle.pickupAddress ?? "", at: minutes(trip.departureAt, -90) });
  if (kind !== "private") out.push({ kind: "load_equipment", address: home, at: minutes(trip.departureAt, -45) });
  out.push({ kind: "pick_passengers", address: kind === "private" ? "" : home, at: trip.departureAt });
  out.push({ kind: "arrive", address: trip.destination, at: null });
  out.push({ kind: "reload", address: trip.destination, at: null });
  if (kind !== "private") out.push({ kind: "unload", address: back, at: trip.returnAt });
  if (kind === "rental") out.push({ kind: "return_vehicle", address: vehicle.returnAddress || vehicle.pickupAddress || "", at: minutes(trip.returnAt, 60) });
  return out;
}

export type LoadProblem = "seats" | "wheelchair" | "ramp";
/**
 * What the vehicle carries against what it holds. A player who travels in
 * his powerchair takes a wheelchair place, as does each chair carried; the
 * others and the driver take a seat. A chair on board needs a ramp or a lift.
 */
export function transportCheck(
  vehicle: { seats: number; wheelchairPlaces: number; ramp: boolean },
  passengers: { inChair: boolean }[],
  chairsCarried: number,
  driverOnBoard = true,
) {
  const inChair = passengers.filter((p) => p.inChair).length;
  const seated = passengers.length - inChair + (driverOnBoard ? 1 : 0);
  const places = inChair + chairsCarried;
  const problems: LoadProblem[] = [];
  if (seated > vehicle.seats) problems.push("seats");
  if (places > vehicle.wheelchairPlaces) problems.push("wheelchair");
  if (places > 0 && !vehicle.ramp) problems.push("ramp");
  return { seated, seats: vehicle.seats, inChair, chairs: chairsCarried, places, wheelchairPlaces: vehicle.wheelchairPlaces, problems };
}

/** Who holds C1, D1 or D also holds B; D covers D1 (buses up to 16 seats). */
const covers: Record<string, string[]> = { B: ["B", "BE", "C1", "D1", "D"], BE: ["BE"], C1: ["C1"], D1: ["D1", "D"], D: ["D"] };
export const licenceCovers = (need: string, categories: string[], validUntil: string | null = null, on: string | null = null) =>
  categories.some((c) => covers[need]?.includes(c)) && !(validUntil && on && validUntil < on);

/**
 * The drivers proposed for a vehicle: first those whose declared or checked
 * licence covers the one required (checked ones first), then the others,
 * who carry a warning.
 */
export function driverCandidates<P extends { id: string; full_name: string }>(
  people: P[],
  licences: { profile_id: string; categories: string[]; valid_until: string | null; verified: boolean }[],
  need: string,
  on: string,
) {
  const of = new Map(licences.map((l) => [l.profile_id, l]));
  return people
    .map((p) => {
      const l = of.get(p.id);
      const ok = !!l && licenceCovers(need, l.categories, l.valid_until, on);
      return { ...p, covers: ok, verified: ok && !!l?.verified };
    })
    .sort((a, b) => Number(b.covers) - Number(a.covers) || Number(b.verified) - Number(a.verified) || a.full_name.localeCompare(b.full_name));
}

/** « Itinéraire »: Google Maps and Waze, free and without a key. */
export function routeLinks(from: string, to: string) {
  if (!to.trim()) return null;
  const q = (s: string) => encodeURIComponent(s.trim());
  return {
    google: `https://www.google.com/maps/dir/?api=1${from.trim() ? `&origin=${q(from)}` : ""}&destination=${q(to)}&travelmode=driving`,
    waze: `https://waze.com/ul?q=${q(to)}&navigate=yes`,
  };
}

export type TaskDraft = { key: string; stopId: string | null; vehicleId: string; kind: StopKind | "book"; dueOn: string; time: string; people: string[] };
const local = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
};
const before = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);
/**
 * The tasks drawn from the rounds: book the rental (a week before), then one
 * per step that someone does (pick up, load, drive, reload, unload, return),
 * each with the step's people, day and hour. The key is stable: saving again
 * updates the same task.
 */
export function tripTaskDrafts(
  tripDay: string,
  vehicles: { id: string; kind: VehicleKind; drivers: string[]; stops: { id: string; kind: StopKind; at: string | null; people: string[] }[] }[],
): TaskDraft[] {
  const out: TaskDraft[] = [];
  for (const v of vehicles) {
    if (v.kind === "rental") out.push({ key: `book:${v.id}`, stopId: null, vehicleId: v.id, kind: "book", dueOn: before(tripDay, 7), time: "", people: v.drivers.slice(0, 1) });
    for (const s of v.stops) {
      if (s.kind === "arrive" || s.kind === "other") continue;
      const when = s.at ? local(s.at) : { day: tripDay, time: "" };
      const people = s.people.length ? s.people : s.kind === "drive" || s.kind === "pick_passengers" ? v.drivers : [];
      out.push({ key: `stop:${s.id}`, stopId: s.id, vehicleId: v.id, kind: s.kind, dueOn: when.day, time: when.time, people });
    }
  }
  return out;
}

/** The mileage allowance of a private car, in cents. */
export const mileageCents = (km: number | null, rateCents: number | null) => (km && rateCents ? km * rateCents : 0);

/** The transport's planned costs: rentals, fuel and mileage allowances. */
export function transportCosts(vehicles: { kind: VehicleKind; planned_cost_cents: number | null; fuel_cents: number | null; mileage: boolean; distance_km: number | null }[], rateCents: number | null) {
  let rental = 0,
    fuel = 0,
    mileage = 0;
  for (const v of vehicles) {
    if (v.kind === "rental") rental += v.planned_cost_cents ?? 0;
    fuel += v.fuel_cents ?? 0;
    if (v.kind === "private" && v.mileage) mileage += mileageCents(v.distance_km, rateCents);
  }
  return { rental, fuel, mileage, total: rental + fuel + mileage };
}

/**
 * 11: the match line's « En ordre » for transport: at least one vehicle, each
 * with a driver and a load that fits.
 */
export function transportReady(vehicles: { drivers: number; problems: LoadProblem[] }[]) {
  return vehicles.length > 0 && vehicles.every((v) => v.drivers > 0 && !v.problems.length);
}
