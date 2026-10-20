import { describe, expect, it } from "vitest";
import {
  countdown,
  defaultChecklist,
  driverWarnings,
  tripCommand,
  tripDays,
  unassigned,
  vehicleLoad,
} from "../src/domains/trips/schema";
import { accessibilityScore } from "../src/domains/venues/service";

describe("vehicle load", () => {
  it("puts powerchair users on wheelchair places and counts the driver", () => {
    const load = vehicleLoad({ seats: 3, wheelchair_places: 1, driver: true }, [
      { wheelchair: true },
      { wheelchair: true },
      { wheelchair: false },
      { wheelchair: false },
      { wheelchair: false },
    ]);
    expect(load).toEqual({ chairs: 2, seated: 4, chairsOver: 1, seatsOver: 1 });
  });
});

describe("unassigned travellers", () => {
  it("checks the way out and the way back separately, ignoring those not coming", () => {
    const people = [
      { id: "a", status: "confirmed" },
      { id: "b", status: "invited" },
      { id: "c", status: "declined" },
    ];
    expect(
      unassigned(people, [
        { legs: "out", passengers: ["a", "b"] },
        { legs: "back", passengers: ["a"] },
      ]),
    ).toEqual({ out: [], back: ["b"] });
    expect(unassigned(people, [{ legs: "both", passengers: ["a"] }])).toEqual({
      out: ["b"],
      back: ["b"],
    });
  });
});

describe("countdown", () => {
  it("flags documents as urgent from 14 days before departure", () => {
    expect(countdown("2026-11-01", "2026-10-20")).toEqual({ left: 12, urgent: true, past: false });
    expect(countdown("2026-12-01", "2026-10-20").urgent).toBe(false);
    expect(countdown("2026-10-19", "2026-10-20")).toEqual({ left: -1, urgent: false, past: true });
  });
  it("lists every day of the trip", () => {
    expect(tripDays("2026-10-30", "2026-11-01")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
});

describe("drivers and vehicles", () => {
  const minibus = { licence: "D1", insurance_until: "2026-12-31", inspection_until: "2026-10-01" };
  it("warns about an expired test and a licence that does not cover the vehicle", () => {
    expect(
      driverWarnings(minibus, { categories: ["B"], valid_until: null }, "2026-10-25"),
    ).toEqual(["inspection", "licenceCategory"]);
  });
  it("accepts a D licence for a D1 minibus and B for a car", () => {
    expect(
      driverWarnings({ ...minibus, inspection_until: null }, { categories: ["D"], valid_until: "2030-01-01" }, "2026-10-25"),
    ).toEqual([]);
    expect(
      driverWarnings({ licence: "B", insurance_until: null, inspection_until: null }, { categories: ["C1"], valid_until: null }, "2026-10-25"),
    ).toEqual([]);
  });
  it("asks for the licence of a driver of a club vehicle", () => {
    expect(driverWarnings(minibus, null, "2026-09-01")).toEqual(["noLicence"]);
  });
});

describe("trip commands", () => {
  it("rejects a schedule time that is not HH:MM", () => {
    const base = {
      action: "schedule",
      tripId: "7f1d6c2e-8f43-4c1b-9a51-2f0d7d6e1a11",
      day: "2026-10-30",
      title: "Match",
      place: "",
      notes: "",
    };
    expect(tripCommand.safeParse({ ...base, time: "9h" }).success).toBe(false);
    expect(tripCommand.safeParse({ ...base, time: "09:30" }).success).toBe(true);
    expect(tripCommand.safeParse({ ...base, time: "" }).success).toBe(true);
  });
  it("offers the same preparation list in the three languages", () => {
    expect(defaultChecklist.nl).toHaveLength(defaultChecklist.fr.length);
    expect(defaultChecklist.en).toHaveLength(defaultChecklist.fr.length);
  });
});

describe("venue accessibility", () => {
  it("does not count unknown answers as no", () => {
    expect(
      accessibilityScore({ step_free: true, adapted_toilets: null, changing_rooms: false, parking: true, charging: null }),
    ).toEqual({ yes: 2, known: 3, unknown: 2 });
  });
});
