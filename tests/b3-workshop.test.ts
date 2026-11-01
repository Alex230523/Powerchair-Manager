import { describe, it, expect } from "vitest";
import { ownership, speedState, usable, workshopCommand } from "../src/domains/equipment/workshop";
import { chairReportPdf, chairReportXlsx } from "../src/domains/equipment/chair-report";
import { workshopCopy } from "../src/components/workshop-copy";
import { equipmentCopy } from "../src/components/equipment-copy";
import { chairStatuses } from "../src/domains/equipment/schema";

/** B3: speed checks, the cost of a chair, the report files and the texts. */
describe("B3 chairs' workshop", () => {
  const rules = { limit: 10, days: 180 };
  it("judges the last speed check against the club's rule", () => {
    expect(speedState(null, rules, "2026-11-01")).toBe("missing");
    expect(speedState({ speed: 9.5, on: "2026-10-01" }, rules, "2026-11-01")).toBe("ok");
    expect(speedState({ speed: 10.4, on: "2026-10-01" }, rules, "2026-11-01")).toBe("over");
    expect(speedState({ speed: 9, on: "2026-04-01" }, rules, "2026-11-01")).toBe("old");
    expect(speedState({ speed: 9, on: "2026-05-05" }, rules, "2026-11-01")).toBe("ok");
  });
  it("only counts available or in-use chairs as usable", () => {
    expect(["available", "in_use"].every(usable)).toBe(true);
    expect(["maintenance", "out_of_service", "lent", "retired"].some(usable)).toBe(false);
  });
  it("adds purchase and upkeep, without cancelled lines", () => {
    const c = ownership(450000, [
      { cost_cents: 12000, days_out: 3, kind: "repair", cancelled_at: null },
      { cost_cents: 30000, days_out: 0, kind: "battery", cancelled_at: null },
      { cost_cents: 99999, days_out: 9, kind: "repair", cancelled_at: "2026-10-01" },
      { cost_cents: null, days_out: 1, kind: "breakdown", cancelled_at: null },
    ]);
    expect(c).toEqual({ purchase: 450000, upkeep: 42000, total: 492000, daysOut: 4, byKind: { repair: 12000, battery: 30000, breakdown: 0 } });
    expect(ownership(null, []).total).toBe(0);
  });
  it("refuses a report without description and a photo of another type", () => {
    const chairId = "00000000-0000-4000-8000-000000000001";
    expect(workshopCommand.safeParse({ action: "report", chairId, description: "" }).success).toBe(false);
    expect(workshopCommand.safeParse({ action: "report", chairId, description: "Roue voilée", photo: { type: "image/gif", data: "R0lG" } }).success).toBe(false);
    expect(workshopCommand.safeParse({ action: "report", chairId, description: "Roue voilée" }).success).toBe(true);
    expect(workshopCommand.safeParse({ action: "speedRules", limitKmh: 25, checkDays: 180 }).success).toBe(false);
  });
  it("writes the chair's report as a PDF and a spreadsheet", () => {
    const data = {
      club: "Club A",
      chair: { name: "Strike 4", brand: "Magic", model: "Strike", serial_number: "S-1", acquired_on: "2024-09-01", purchase_value_cents: 450000, warranty_until: "2026-09-01", grant: "Province", partner: null, pot: null },
      lines: [{ occurred_on: "2026-10-02", kind: "repair", diagnosis: "Moteur", parts: "Balais", supplier: "Atelier X", cost_cents: 12000, days_out: 3, invoice: "Facture 12" }],
      cost: ownership(450000, [{ cost_cents: 12000, days_out: 3, kind: "repair", cancelled_at: null }]),
    };
    for (const l of ["fr", "nl", "en"] as const) {
      expect(Buffer.from(chairReportPdf(data, workshopCopy[l], l)).subarray(0, 5).toString()).toBe("%PDF-");
      expect(Buffer.from(chairReportXlsx(data, workshopCopy[l])).subarray(0, 2).toString()).toBe("PK");
    }
  });
  it("has every text in French, Dutch and English, with the invitation vocabulary", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(workshopCopy.nl)).toEqual(keys(workshopCopy.fr));
    expect(keys(workshopCopy.en)).toEqual(keys(workshopCopy.fr));
    expect(JSON.stringify(workshopCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    for (const l of ["fr", "nl", "en"] as const) for (const s of chairStatuses) expect(equipmentCopy[l].statuses[s]).toBeTruthy();
  });
});
