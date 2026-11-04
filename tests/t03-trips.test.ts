import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { driverCandidates, licenceCovers, modeFor, routeLinks, suggestStops, transportCheck, transportCosts, transportReady, tripTaskDrafts } from "../src/domains/trips/transport";
import { tripCommand } from "../src/domains/trips/schema";
import { tripTransportCopy } from "../src/components/trip-transport-copy";
import { routeEstimator } from "../src/domains/trips/route";

/** 3: trips as transport logistics (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
const trip = { meetingPoint: "Local, Namur", destination: "Hall, Gand", returnPoint: "", departureAt: "2026-11-14T07:00:00.000Z", returnAt: "2026-11-14T17:00:00.000Z" };

describe("trips as transport", () => {
  it("takes a former trip over as a stay when it lasts more than a day", () => {
    expect(modeFor("2026-11-14", "2026-11-14")).toBe("transport");
    expect(modeFor("2026-11-14", "2026-11-16")).toBe("stay");
  });
  it("proposes the agency for a rental only, and a private car from the driver's home", () => {
    const rental = suggestStops("rental", trip, { pickupAddress: "Ucar Namur" });
    expect(rental.map((s) => s.kind)).toEqual(["pickup_vehicle", "load_equipment", "pick_passengers", "arrive", "reload", "unload", "return_vehicle"]);
    expect(rental[0]).toMatchObject({ address: "Ucar Namur", at: "2026-11-14T05:30:00.000Z" });
    expect(rental.at(-1)).toMatchObject({ address: "Ucar Namur", at: "2026-11-14T18:00:00.000Z" });
    const club = suggestStops("club", trip).map((s) => s.kind);
    expect(club).not.toContain("pickup_vehicle");
    expect(club).not.toContain("return_vehicle");
    expect(suggestStops("private", trip)[0]).toMatchObject({ kind: "pick_passengers", address: "" });
  });
  it("checks the load: a player in his chair and each chair carried take a wheelchair place, and need a ramp", () => {
    expect(transportCheck({ seats: 8, wheelchairPlaces: 2, ramp: true }, [{ inChair: true }, { inChair: true }, { inChair: false }], 1).problems).toEqual(["wheelchair"]);
    expect(transportCheck({ seats: 2, wheelchairPlaces: 1, ramp: false }, [{ inChair: false }, { inChair: false }], 1)).toMatchObject({ seated: 3, problems: ["seats", "ramp"] });
    expect(transportCheck({ seats: 5, wheelchairPlaces: 1, ramp: true }, [{ inChair: true }], 0).problems).toEqual([]);
  });
  it("puts the drivers with the right licence first, checked ones before declared ones", () => {
    const people = [
      { id: "a", full_name: "Anne" },
      { id: "b", full_name: "Bruno" },
      { id: "c", full_name: "Chloé" },
    ];
    const list = driverCandidates(
      people,
      [
        { profile_id: "a", categories: ["B"], valid_until: null, verified: false },
        { profile_id: "b", categories: ["D"], valid_until: null, verified: true },
        { profile_id: "c", categories: ["D1"], valid_until: "2026-01-01", verified: true },
      ],
      "D1",
      "2026-11-14",
    );
    expect(list.map((p) => [p.full_name, p.covers, p.verified])).toEqual([
      ["Bruno", true, true],
      ["Anne", false, false],
      ["Chloé", false, false],
    ]);
    expect(licenceCovers("B", ["C1"])).toBe(true);
    expect(licenceCovers("BE", ["B"])).toBe(false);
  });
  it("links to Google Maps and Waze without a key", () => {
    expect(routeLinks("Local, Namur", "Hall, Gand")).toEqual({
      google: "https://www.google.com/maps/dir/?api=1&origin=Local%2C%20Namur&destination=Hall%2C%20Gand&travelmode=driving",
      waze: "https://waze.com/ul?q=Hall%2C%20Gand&navigate=yes",
    });
    expect(routeLinks("x", " ")).toBeNull();
  });
  it("draws the tasks from the steps: book a rental a week before, then the steps someone does", () => {
    const drafts = tripTaskDrafts("2026-11-14", [
      {
        id: "v",
        kind: "rental",
        drivers: ["d"],
        stops: [
          { id: "s1", kind: "pickup_vehicle", at: "2026-11-14T05:30:00.000Z", people: [] },
          { id: "s2", kind: "arrive", at: null, people: [] },
          { id: "s3", kind: "unload", at: null, people: ["h", "d"] },
        ],
      },
    ]);
    expect(drafts.map((d) => [d.key, d.dueOn, d.time, d.people])).toEqual([
      ["book:v", "2026-11-07", "", ["d"]],
      ["stop:s1", "2026-11-14", "06:30", []],
      ["stop:s3", "2026-11-14", "", ["h", "d"]],
    ]);
  });
  it("adds rentals, fuel and mileage allowances; « en ordre » when each vehicle has a driver and fits", () => {
    expect(
      transportCosts(
        [
          { kind: "rental", planned_cost_cents: 18000, fuel_cents: 4000, mileage: false, distance_km: null },
          { kind: "private", planned_cost_cents: null, fuel_cents: null, mileage: true, distance_km: 120 },
        ],
        30,
      ),
    ).toEqual({ rental: 18000, fuel: 4000, mileage: 3600, total: 25600 });
    expect(transportReady([])).toBe(false);
    expect(transportReady([{ drivers: 1, problems: [] }])).toBe(true);
    expect(transportReady([{ drivers: 1, problems: ["ramp"] }])).toBe(false);
    expect(transportReady([{ drivers: 0, problems: [] }])).toBe(false);
  });
  it("keeps the former vehicle command working, and refuses a task key of something else", () => {
    const v = tripCommand.parse({ action: "vehicle", tripId: "0b6d3d1e-3c4f-4d58-9a5e-2f7d1c9e8b01", vehicleId: null, name: "Voiture", legs: "both", driverProfileId: null, driverPhone: "", seats: 4, wheelchairPlaces: 0, notes: "", passengers: [] });
    expect(v).toMatchObject({ kind: "club", chairs: [], ramp: false });
    expect(() => tripCommand.parse({ action: "tasks", tripId: "0b6d3d1e-3c4f-4d58-9a5e-2f7d1c9e8b01", items: [{ key: "task:x", title: "Xx", dueOn: "2026-11-14", time: "", people: [] }] })).toThrow();
  });
  it("estimates nothing without a key", () => {
    const before = process.env.OPENROUTESERVICE_API_KEY;
    delete process.env.OPENROUTESERVICE_API_KEY;
    expect(routeEstimator()).toBeNull();
    if (before) process.env.OPENROUTESERVICE_API_KEY = before;
  });
  it("speaks three languages, without the banned words", () => {
    expect(keys(tripTransportCopy.nl).sort()).toEqual(keys(tripTransportCopy.fr).sort());
    expect(keys(tripTransportCopy.en).sort()).toEqual(keys(tripTransportCopy.fr).sort());
    for (const f of ["src/components/trip-transport-copy.ts", "src/components/trip-transport.tsx", "src/components/trip-roadsheet.tsx"])
      expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
  it("adds without dropping anything, and takes the former trips over once", () => {
    const sql = readFileSync("db/migrations/0086_trip_transport.sql", "utf8");
    expect(sql).toContain("UPDATE trip SET mode = 'stay' WHERE ends_on > starts_on");
    expect(sql).toContain("INSERT INTO trip_vehicle_driver");
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
