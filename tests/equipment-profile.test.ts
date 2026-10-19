import { describe, expect, it } from "vitest";
import {
  commandSchema as equipmentCommand,
  overMatchSpeed,
  serviceState,
} from "../src/domains/equipment/schema";
import {
  attendanceSummary,
  commandSchema as profileCommand,
  rate,
} from "../src/domains/player-profile/schema";
import { equipmentCopy } from "../src/components/equipment-copy";
import { playerProfileCopy } from "../src/components/player-profile-copy";

describe("chair maintenance", () => {
  const today = "2026-10-19";
  it("flags overdue, upcoming and missing service dates", () => {
    expect(serviceState("2026-10-01", today, "available")).toBe("due");
    expect(serviceState("2026-10-25", today, "in_use")).toBe("soon");
    expect(serviceState("2026-11-02", today, "in_use")).toBe("soon");
    expect(serviceState("2026-11-03", today, "in_use")).toBe("ok");
    expect(serviceState(null, today, "available")).toBe("unknown");
  });
  it("treats maintenance as due and retired chairs as settled", () => {
    expect(serviceState("2027-01-01", today, "maintenance")).toBe("due");
    expect(serviceState("2020-01-01", today, "retired")).toBe("ok");
  });
  it("flags chairs above the 10 km/h match limit", () => {
    expect(overMatchSpeed("10.0")).toBe(false);
    expect(overMatchSpeed(10.5)).toBe(true);
    expect(overMatchSpeed(null)).toBe(false);
  });
  it("rejects unknown statuses and impossible speeds", () => {
    const base = {
      action: "chair",
      name: "Club 1",
      brand: "",
      model: "",
      serialNumber: "",
      ownership: "club",
      status: "available",
      maxSpeedKmh: 10,
      battery: "",
      acquiredOn: null,
      lastServiceOn: null,
      nextServiceOn: null,
      notes: "",
    };
    expect(equipmentCommand.safeParse(base).success).toBe(true);
    expect(
      equipmentCommand.safeParse({ ...base, status: "lost" }).success,
    ).toBe(false);
    expect(
      equipmentCommand.safeParse({ ...base, maxSpeedKmh: 35 }).success,
    ).toBe(false);
  });
});

describe("player attendance figures", () => {
  const row = (
    over: Partial<Parameters<typeof attendanceSummary>[0][number]>,
  ) => ({
    kind: "training",
    status: "scheduled",
    response: "present",
    actual: "present",
    closed: true,
    withdrawn: false,
    ...over,
  });
  it("counts presence only on closed registers and ignores cancellations", () => {
    expect(
      attendanceSummary([
        row({}),
        row({ actual: "late" }),
        row({ actual: "absent", response: "none" }),
        row({ closed: false, actual: "unchecked" }),
        row({ status: "cancelled" }),
        row({ withdrawn: true }),
      ]),
    ).toEqual({
      invited: 4,
      answered: 3,
      closed: 3,
      attended: 2,
      absent: 1,
      late: 1,
    });
  });
  it("returns no rate rather than 0 % when nothing was recorded", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(2, 3)).toBe(67);
  });
  it("accepts only known sport classes and controls", () => {
    const sport = {
      action: "sport",
      id: "7b0c1f8e-0d4b-4a0e-9a57-0d1f7f1c2a10",
      version: 0,
      classification: "PF1",
      classificationValidUntil: null,
      control: "chin",
      sportNotes: "",
    };
    expect(profileCommand.safeParse(sport).success).toBe(true);
    expect(
      profileCommand.safeParse({ ...sport, classification: "A" }).success,
    ).toBe(false);
    expect(
      profileCommand.safeParse({ ...sport, control: "joystick" }).success,
    ).toBe(false);
  });
});

describe("equipment and profile copy", () => {
  it("has the same keys in French, Dutch and English", () => {
    for (const copy of [equipmentCopy, playerProfileCopy] as Record<
      string,
      Record<string, unknown>
    >[])
      for (const locale of ["nl", "en"])
        expect(Object.keys(copy[locale]).sort()).toEqual(
          Object.keys(copy.fr).sort(),
        );
  });
});
