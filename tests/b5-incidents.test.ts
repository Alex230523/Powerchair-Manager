import { describe, it, expect } from "vitest";
import { deadlineOf, incidentCommand, incidentStats, insuranceState, validImage } from "../src/domains/incidents/service";
import { incidentsCopy } from "../src/components/incidents-copy";

/** B5: the insurance deadline, its state, anonymous statistics, files and texts. */
describe("B5 incidents", () => {
  it("counts the declaration delay from the day of the incident", () => {
    expect(deadlineOf("2026-10-28", 8)).toBe("2026-11-05");
    expect(deadlineOf("2026-12-30", 8)).toBe("2027-01-07");
  });
  it("tells a claim on time, close to its deadline, late or handled", () => {
    expect(insuranceState("to_declare", "2026-11-10", "2026-11-01")).toBe("ok");
    expect(insuranceState("to_declare", "2026-11-03", "2026-11-01")).toBe("soon");
    expect(insuranceState("to_declare", "2026-10-31", "2026-11-01")).toBe("overdue");
    expect(insuranceState("sent", "2026-10-31", "2026-11-01")).toBe("done");
  });
  it("counts by kind, context and month, never by person, and copes with nothing", () => {
    expect(incidentStats([])).toEqual({ total: 0, minors: 0, byKind: {}, byContext: {}, byMonth: {} });
    const s = incidentStats([
      { kind: "fall", context: "training", occurred_on: "2026-10-02", minor: true },
      { kind: "fall", context: "match", occurred_on: "2026-10-20", minor: false },
      { kind: "collision", context: "match", occurred_on: "2026-11-01", minor: true },
    ]);
    expect(s).toEqual({ total: 3, minors: 2, byKind: { fall: 2, collision: 1 }, byContext: { training: 1, match: 2 }, byMonth: { "2026-10": 2, "2026-11": 1 } });
    expect(JSON.stringify(s)).not.toMatch(/profile|name/);
  });
  it("accepts only real images and PDF papers", () => {
    expect(validImage("image/png", Buffer.from("89504e470d0a1a0a00", "hex"))).toBe(true);
    expect(validImage("image/jpeg", Buffer.from("89504e470d0a1a0a00", "hex"))).toBe(false);
    expect(validImage("application/pdf", Buffer.from("%PDF-1.7"))).toBe(true);
    expect(validImage("application/pdf", Buffer.from("<html>"))).toBe(false);
  });
  it("keeps the health part apart from the facts in a report", () => {
    const ok = incidentCommand.parse({ action: "declare", occurredAt: "2026-11-01T10:30", context: "training", kind: "fall", circumstances: "Chute lors d'un transfert", profileIds: ["00000000-0000-4000-8000-000000000001"], health: { injuries: "Hématome" } });
    expect(ok.action === "declare" && ok.health).toEqual({ injuries: "Hématome", firstAid: "", care: "", hospital: false });
    expect(incidentCommand.safeParse({ action: "declare", occurredAt: "2026-11-01T10:30", context: "training", kind: "fall", circumstances: "x", profileIds: [] }).success).toBe(false);
  });
  it("has every text in French, Dutch and English, with the invitation vocabulary", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(incidentsCopy.nl)).toEqual(keys(incidentsCopy.fr));
    expect(keys(incidentsCopy.en)).toEqual(keys(incidentsCopy.fr));
    expect(JSON.stringify(incidentsCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
