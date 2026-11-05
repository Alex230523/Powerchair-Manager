import { z } from "zod";
import { stopKinds, tripModes, vehicleKinds } from "./transport";

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const date = z.iso.date();
const cents = z.number().int().min(0).max(10000000);
const time = z.union([z.literal(""), z.string().regex(/^[0-2]\d:[0-5]\d$/)]);
export const tripKinds = ["tournament", "away_match", "camp", "other"] as const;
export const tripStatuses = ["planned", "confirmed", "done", "cancelled"] as const;
export const participantRoles = ["player", "coach", "staff", "assistant", "guardian"] as const;
export const chairKinds = ["none", "powerchair", "manual", "both"] as const;
export const licenceCategories = ["B", "BE", "C1", "D1", "D"] as const;
export const careMoments = [
  "morning",
  "midday",
  "evening",
  "night",
  "before_play",
  "after_play",
  "as_needed",
] as const;

const tripFields = z.object({
  title: text(120).min(2),
  kind: z.enum(tripKinds),
  startsOn: date,
  endsOn: date,
  sharedVenueId: id.nullable(),
  placeId: id.nullable(),
  destination: text(300),
  meetingPoint: text(300),
  departureAt: z.iso.datetime({ offset: true }).nullable(),
  returnAt: z.iso.datetime({ offset: true }).nullable(),
  returnPoint: text(300),
  accommodation: text(1000),
  accommodationAccessible: z.boolean().nullable(),
  emergency: text(1000),
  contact: text(200),
  notes: text(2000),
  /** The team the trip belongs to (wave 15); null or absent: the whole club. */
  teamId: id.nullable().optional(),
  /** A tournament's result (wave 15, C11), for the activity report; absent: unchanged. */
  finalRank: z.number().int().min(1).max(500).nullable().optional(),
  teamsCount: z.number().int().min(1).max(500).nullable().optional(),
  resultNote: text(160).optional(),
  /** 3: transport (one day) or stay; absent: from the dates on creation, unchanged on update. */
  mode: z.enum(tripModes).optional(),
  /** 3: what the trip serves (one event, one match or one tournament day); absent: unchanged. */
  calendarEventId: id.nullable().optional(),
  matchId: id.nullable().optional(),
  tournamentDayId: id.nullable().optional(),
});
export const tripCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    ...tripFields.shape,
    locale: z.enum(["fr", "nl", "en"]),
  }),
  z.object({
    action: z.literal("update"),
    id,
    version: z.number().int().positive(),
    ...tripFields.shape,
  }),
  z.object({ action: z.literal("status"), id, status: z.enum(tripStatuses) }),
  z.object({ action: z.literal("delete"), id }),
  z.object({
    action: z.literal("addParticipants"),
    tripId: id,
    people: z
      .array(z.object({ profileId: id, role: z.enum(participantRoles) }))
      .min(1)
      .max(80),
  }),
  z.object({
    action: z.literal("participant"),
    participantId: id,
    status: z.enum(["invited", "confirmed", "declined"]),
    chair: z.enum(chairKinds),
    needs: text(500),
  }),
  z.object({ action: z.literal("removeParticipant"), participantId: id }),
  z.object({
    action: z.literal("vehicle"),
    tripId: id,
    id: id.optional(),
    vehicleId: id.nullable(),
    name: text(80).min(2),
    legs: z.enum(["both", "out", "back"]),
    driverProfileId: id.nullable(),
    driverPhone: text(60),
    seats: z.number().int().min(0).max(80),
    wheelchairPlaces: z.number().int().min(0).max(20),
    notes: text(500),
    passengers: z.array(id).max(80),
    /* 3: the kind of vehicle and what goes with it. */
    kind: z.enum(vehicleKinds).default("club"),
    rentalContactId: id.nullable().default(null),
    pickupAddress: text(300).default(""),
    returnAddress: text(300).default(""),
    bookingRef: text(80).default(""),
    plannedCostCents: cents.nullable().default(null),
    depositCents: cents.nullable().default(null),
    ownerProfileId: id.nullable().default(null),
    ownerContactId: id.nullable().default(null),
    ramp: z.boolean().default(false),
    mileage: z.boolean().default(false),
    distanceKm: z.number().int().min(0).max(10000).nullable().default(null),
    fuelCents: cents.nullable().default(null),
    equipment: text(1000).default(""),
    /** Several drivers (out and back); absent: the single driver above. */
    drivers: z.array(z.object({ profileId: id, legs: z.enum(["both", "out", "back"]) })).max(6).optional(),
    chairs: z.array(id).max(20).default([]),
  }),
  /** 4: the round of a vehicle, in order; the list replaces the former one. */
  z.object({
    action: z.literal("stops"),
    vehicleId: id,
    stops: z
      .array(
        z.object({
          id: id.optional(),
          kind: z.enum(stopKinds),
          label: text(160).default(""),
          placeId: id.nullable().default(null),
          sharedVenueId: id.nullable().default(null),
          address: text(300).default(""),
          at: z.iso.datetime({ offset: true }).nullable().default(null),
          minutes: z.number().int().min(0).max(2000).nullable().default(null),
          notes: text(500).default(""),
          people: z.array(id).max(10).default([]),
        }),
      )
      .max(30),
  }),
  /** 4: the steps proposed for the vehicle's kind, when its round is empty. */
  z.object({ action: z.literal("suggestStops"), vehicleId: id }),
  /** 7: the tasks drawn from the steps, checked then sent to the to-do (once each). */
  z.object({
    action: z.literal("tasks"),
    tripId: id,
    items: z
      .array(
        z.object({
          key: z.string().regex(/^(book|stop):[0-9a-f-]{36}$/),
          title: text(200).min(2),
          dueOn: date,
          time,
          people: z.array(id).max(10),
          remove: z.boolean().default(false),
        }),
      )
      .max(80),
  }),
  /** 8: the driving time from the previous step, by the estimator when one is on. */
  z.object({ action: z.literal("estimate"), stopId: id }),
  /** 5: the people invited to the linked event join the trip. */
  z.object({ action: z.literal("importInvited"), tripId: id }),
  /** 3: the mileage allowance's rate (Réglages › Activités). */
  z.object({ action: z.literal("settings"), mileageRateCents: z.number().int().min(0).max(500).nullable() }),
  z.object({ action: z.literal("removeVehicle"), id }),
  z.object({
    action: z.literal("schedule"),
    tripId: id,
    id: id.optional(),
    day: date,
    time,
    title: text(160).min(2),
    place: text(200),
    notes: text(500),
  }),
  z.object({ action: z.literal("removeSchedule"), id }),
  z.object({ action: z.literal("checklist"), tripId: id, label: text(200).min(2) }),
  z.object({ action: z.literal("tick"), itemId: id, done: z.boolean() }),
  z.object({ action: z.literal("removeChecklist"), itemId: id }),
  z.object({
    action: z.literal("budget"),
    tripId: id,
    lines: z
      .array(z.object({ label: text(120).min(2), plannedCents: z.number().int().min(0).max(100000000) }))
      .max(40),
  }),
  z.object({
    action: z.literal("care"),
    tripId: id,
    instructionId: id,
    day: date,
    done: z.boolean(),
    note: text(300),
  }),
  z.object({
    action: z.literal("fleet"),
    id: id.optional(),
    name: text(80).min(2),
    kind: text(60),
    plate: text(20),
    owner: text(120),
    seats: z.number().int().min(0).max(80),
    wheelchairPlaces: z.number().int().min(0).max(20),
    rampOrLift: z.boolean(),
    licence: z.enum(licenceCategories),
    insuranceUntil: date.nullable(),
    inspectionUntil: date.nullable(),
    notes: text(1000),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("licence"),
    profileId: id,
    categories: z.array(z.enum(licenceCategories)).max(5),
    validUntil: date.nullable(),
    /** 04/11/2026: since when the licence is held (optional). */
    obtainedOn: date.nullable().optional(),
  }),
]);
export type TripCommand = z.infer<typeof tripCommand>;

/** Default preparation list, written in the creator's language. */
export const defaultChecklist = {
  fr: [
    "Transport adapté réservé (places fauteuil, rampe ou lift)",
    "Chargeurs et batteries des fauteuils",
    "Fauteuils de jeu et pare-chocs vérifiés",
    "Licences des joueurs valables",
    "Documents et autorisations des joueurs complets",
    "Consignes de soin relues avec les accompagnants",
    "Hébergement accessible confirmé",
    "Trousse de secours",
    "Carnet hors ligne préparé",
  ],
  nl: [
    "Aangepast vervoer gereserveerd (rolstoelplaatsen, oprijplaat of lift)",
    "Laders en batterijen van de rolstoelen",
    "Sportrolstoelen en bumpers nagekeken",
    "Licenties van de spelers geldig",
    "Documenten en toelatingen van de spelers volledig",
    "Zorginstructies overlopen met de begeleiders",
    "Toegankelijk verblijf bevestigd",
    "EHBO-koffer",
    "Offline boekje voorbereid",
  ],
  en: [
    "Adapted transport booked (wheelchair places, ramp or lift)",
    "Chair chargers and batteries",
    "Sport chairs and bumpers checked",
    "Player licences valid",
    "Player documents and authorisations complete",
    "Care instructions reviewed with the assistants",
    "Accessible accommodation confirmed",
    "First aid kit",
    "Offline book prepared",
  ],
};

export type Seat = { wheelchair: boolean };
/**
 * Places used in a vehicle: a player in a powerchair takes a wheelchair place,
 * everyone else a seat. The driver occupies one seat when they travel in it.
 */
export function vehicleLoad(
  v: { seats: number; wheelchair_places: number; driver: boolean },
  passengers: Seat[],
) {
  const chairs = passengers.filter((p) => p.wheelchair).length;
  const seated = passengers.length - chairs + (v.driver ? 1 : 0);
  return {
    chairs,
    seated,
    chairsOver: Math.max(0, chairs - v.wheelchair_places),
    seatsOver: Math.max(0, seated - v.seats),
  };
}

/** Who still has no vehicle, for the outward and the return journey. */
export function unassigned(
  participants: { id: string; status: string }[],
  vehicles: { legs: string; passengers: string[] }[],
) {
  const coming = participants.filter((p) => p.status !== "declined");
  const on = (leg: "out" | "back") =>
    new Set(
      vehicles
        .filter((v) => v.legs === "both" || v.legs === leg)
        .flatMap((v) => v.passengers),
    );
  const out = on("out"),
    back = on("back");
  return {
    out: coming.filter((p) => !out.has(p.id)).map((p) => p.id),
    back: coming.filter((p) => !back.has(p.id)).map((p) => p.id),
  };
}

const days = (from: string, to: string) =>
  Math.round(
    (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000,
  );
/** Days left before departure; documents become urgent 14 days before. */
export function countdown(startsOn: string, today: string) {
  const left = days(today, startsOn);
  return { left, urgent: left >= 0 && left <= 14, past: left < 0 };
}

/** What can block a driver or a vehicle on the travel dates. */
export function driverWarnings(
  vehicle: { licence: string; insurance_until: string | null; inspection_until: string | null } | null,
  driver: { categories: string[]; valid_until: string | null } | null,
  endsOn: string,
) {
  const out: string[] = [];
  if (vehicle?.insurance_until && vehicle.insurance_until < endsOn) out.push("insurance");
  if (vehicle?.inspection_until && vehicle.inspection_until < endsOn) out.push("inspection");
  if (driver) {
    if (driver.valid_until && driver.valid_until < endsOn) out.push("licenceExpired");
    const need = vehicle?.licence ?? "B";
    // Who holds C1, D1 or D also holds B; D covers D1 (buses up to 16 seats).
    const covers: Record<string, string[]> = {
      B: ["B", "BE", "C1", "D1", "D"],
      BE: ["BE"],
      C1: ["C1"],
      D1: ["D1", "D"],
      D: ["D"],
    };
    if (!driver.categories.some((c) => covers[need]?.includes(c)))
      out.push("licenceCategory");
  } else if (vehicle) out.push("noLicence");
  return out;
}

/** Care instructions of a day, in the order they happen. */
export const momentOrder: Record<string, number> = {
  morning: 0,
  before_play: 1,
  midday: 2,
  after_play: 3,
  evening: 4,
  night: 5,
  as_needed: 6,
};
export function tripDays(startsOn: string, endsOn: string) {
  const n = Math.min(days(startsOn, endsOn), 30);
  return Array.from({ length: n + 1 }, (_, i) =>
    new Date(Date.parse(startsOn + "T12:00:00Z") + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}

/** Point 15 (04/11/2026): a licence held for less than two years (a young driver), on a given day. */
export function youngDriver(obtainedOn: string | null | undefined, today: string) {
  if (!obtainedOn) return false;
  const [y, m, d] = today.split("-");
  return obtainedOn > `${Number(y) - 2}-${m}-${d}`;
}
