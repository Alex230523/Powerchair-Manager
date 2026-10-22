import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { commandSchema, freeFor, holdingLoan, itemCategories, loanMoves, modelLabel, overlaps, returnReminderDue } from "../src/domains/equipment/schema";
import { fleetCopy } from "../src/components/fleet-copy";
import { stockCopy } from "../src/components/equipment-stock-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const uuid = "00000000-0000-4000-8000-000000000001";

/** Wave 17 (Q1): equipment models, storage places and loans. */
describe("wave 17, Q1: equipment", () => {
  it("adds cones to the small material, in three languages", () => {
    expect(itemCategories).toContain("cone");
    for (const l of ["fr", "nl", "en"] as const) expect(stockCopy[l].categories.cone).toBeTruthy();
    expect(readFileSync("db/migrations/0061_equipment_models_storage_loans.sql", "utf8")).toMatch(/'cone'/);
  });

  it("starts the model list with Equalizer, Storm and Strike Force, and takes over the old texts", () => {
    const sql = readFileSync("db/migrations/0061_equipment_models_storage_loans.sql", "utf8");
    expect(sql).toMatch(/\('Equalizer', 'validated'\), \('Storm', 'validated'\), \('Strike Force', 'validated'\)/);
    expect(sql).toMatch(/UPDATE equipment_chair c SET model_id/);
    expect(sql).toMatch(/UPDATE equipment_chair c SET storage_location_id/);
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE/);
    expect(modelLabel({ brand: "", name: "Storm" })).toBe("Storm");
    expect(modelLabel({ brand: "Acme", name: "Viper" })).toBe("Acme · Viper");
  });

  it("tells when a chair is free and what comes next in a loan", () => {
    const loan = { status: "ongoing", starts_on: "2026-11-02", ends_on: "2026-11-10" };
    expect(overlaps(loan, { starts_on: "2026-11-10", ends_on: "2026-11-12" })).toBe(true);
    expect(overlaps(loan, { starts_on: "2026-11-11", ends_on: "2026-11-12" })).toBe(false);
    expect(freeFor([loan], { starts_on: "2026-11-05", ends_on: "2026-11-06" })).toBe(false);
    expect(freeFor([{ ...loan, status: "requested" }], { starts_on: "2026-11-05", ends_on: "2026-11-06" })).toBe(true);
    expect(freeFor([{ ...loan, status: "returned" }], { starts_on: "2026-11-05", ends_on: "2026-11-06" })).toBe(true);
    expect(["requested", "accepted", "ongoing"].every(holdingLoan)).toBe(true);
    expect(holdingLoan("returned")).toBe(false);
    expect(loanMoves("requested", "lender")).toEqual(["accept", "refuse"]);
    expect(loanMoves("accepted", "lender")).toEqual(["handOver", "cancel"]);
    expect(loanMoves("ongoing", "lender")).toEqual(["return"]);
    expect(loanMoves("ongoing", "borrower")).toEqual([]);
    expect(loanMoves("requested", "borrower")).toEqual(["cancel"]);
  });

  it("reminds seven days before the return, once", () => {
    expect(returnReminderDue("2026-11-10", "2026-11-02", null)).toBe(false);
    expect(returnReminderDue("2026-11-10", "2026-11-03", null)).toBe(true);
    expect(returnReminderDue("2026-11-10", "2026-11-10", null)).toBe(true);
    expect(returnReminderDue("2026-11-10", "2026-11-11", null)).toBe(false);
    expect(returnReminderDue("2026-11-10", "2026-11-05", "2026-11-04")).toBe(false);
  });

  it("accepts the new commands only when well formed", () => {
    expect(commandSchema.safeParse({ action: "requestLoan", chairId: uuid, startsOn: "2026-11-02", endsOn: "2026-11-10", message: "" }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "lend", chairId: uuid, borrowerId: uuid, startsOn: "2026-11-02", endsOn: "2026-11-10", conditions: "", depositCents: -1 }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "decideModel", id: uuid, decision: "proposed", note: "" }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "storage", name: "Local", placeId: null, address: "", contact: "", access: "", notes: "" }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "item", name: "Cônes", category: "cone", quantity: 20, storage: "", expiresOn: null, notes: "", storageLocationId: uuid }).success).toBe(true);
  });

  it("has every text in the three languages, without long dashes", () => {
    expect(shape(fleetCopy.nl)).toEqual(shape(fleetCopy.fr));
    expect(shape(fleetCopy.en)).toEqual(shape(fleetCopy.fr));
    expect(JSON.stringify(fleetCopy)).not.toMatch(/[–—]/);
  });
});
