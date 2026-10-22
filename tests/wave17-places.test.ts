import { describe, it, expect } from "vitest";
import { currentRates, placeCommand, placesFor, publicFields, type Rate } from "../src/domains/venues/schema";
import { placesCopy } from "../src/components/places-copy";
import { shellCopy } from "../src/components/shell-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const rate = (id: string, label: string, valid_from: string, created_at = valid_from): Rate => ({ id, label, amount_cents: 100, unit: "", valid_from, created_at, created_by_name: "X" });

/** Wave 17 (C4): places, their rates and their sharing. */
describe("wave 17, C4: places", () => {
  it("offers training and match places first for a training or a match", () => {
    const places = [
      { name: "Restaurant", category: "other" },
      { name: "Salle B", category: "training" },
      { name: "Local", category: "other" },
      { name: "Salle A", category: "training" },
    ];
    expect(placesFor(places, "training").map((p) => p.name)).toEqual(["Salle A", "Salle B", "Local", "Restaurant"]);
    expect(placesFor(places, "friendly")[0].name).toBe("Salle A");
    expect(placesFor(places, "meeting").map((p) => p.name)).toEqual(["Local", "Restaurant", "Salle A", "Salle B"]);
  });
  it("puts forward the rate in force for each label, and keeps the history", () => {
    const rates = [rate("old", "Terrain 2 h", "2025-09-01"), rate("now", "Terrain 2 h", "2026-01-01"), rate("next", "Terrain 2 h", "2027-01-01"), rate("hall", "Vestiaire", "2024-01-01")];
    expect([...currentRates(rates, "2026-10-22")].sort()).toEqual(["hall", "now"]);
  });
  it("shares only the name, address, category and accessibility", () => {
    const shared = publicFields({ name: "Salle", address: "Rue 1", category: "training", accessible: true, toilets: false, parking: true, charging: false, ...({ food_policy: "x", contact_id: "y", logistics: "z" } as object) } as never);
    expect(Object.keys(shared).sort()).toEqual(["adapted_toilets", "address", "category", "charging", "name", "parking", "step_free"]);
    expect(shared).toMatchObject({ step_free: true, adapted_toilets: null });
  });
  it("checks a place, a rate and a refusal", () => {
    expect(placeCommand.safeParse({ action: "savePlace", name: "Salle", address: "", category: "hall" }).success).toBe(false);
    expect(placeCommand.safeParse({ action: "savePlace", name: "Salle", address: "", category: "other" }).success).toBe(true);
    expect(placeCommand.safeParse({ action: "addRate", placeId: "00000000-0000-4000-8000-000000000001", label: "T", amountCents: 100, validFrom: "2026-01-01" }).success).toBe(false);
    expect(placeCommand.safeParse({ action: "withdraw", venueId: "00000000-0000-4000-8000-000000000001", reason: "" }).success).toBe(false);
  });
  it("names the page « Lieux » and has every text in three languages", () => {
    expect([shellCopy.fr.halls, shellCopy.nl.halls, shellCopy.en.halls]).toEqual(["Lieux", "Locaties", "Places"]);
    expect(shape(placesCopy.nl)).toEqual(shape(placesCopy.fr));
    expect(shape(placesCopy.en)).toEqual(shape(placesCopy.fr));
    expect(JSON.stringify(placesCopy)).not.toMatch(/[–—]/);
  });
});
