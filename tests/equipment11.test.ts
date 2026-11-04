import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { available, chairLabel, commandSchema, placePath } from "../src/domains/equipment/schema";
import { equipmentMoreCopy } from "../src/components/equipment-more-copy";

/** 11: the equipment page: labels, paths, loans of material, categories, tabs. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
const id = "6f1c2a52-6a7e-4c55-9d8f-1f2e3d4c5b6a";

describe("11: labels and paths", () => {
  it("writes « Nom du fauteuil · Marque Modèle » and « Local du club › Étagère A »", () => {
    expect(chairLabel({ name: "Strike 3", model_brand: "Permobil", model_name: "Strike Force" })).toBe("Strike 3 · Permobil Strike Force");
    expect(chairLabel({ name: "Strike 3", model_brand: "", model_name: "Storm" })).toBe("Strike 3 · Storm");
    expect(chairLabel({ name: "Vieux", model_brand: null, model_name: null })).toBe("Vieux");
    expect(placePath({ name: "Étagère A", parent_name: "Local du club" })).toBe("Local du club › Étagère A");
    expect(placePath({ name: "Local du club", parent_name: null })).toBe("Local du club");
    expect(available(8, 5)).toBe(3);
    expect(available(2, 5)).toBe(0);
  });
});

describe("11: the commands", () => {
  it("lends a chair or a quantity of material, to a club or to a player", () => {
    expect(commandSchema.safeParse({ action: "lendDirect", itemId: id, quantity: 5, borrowerId: id, startsOn: "2026-11-05", endsOn: "2026-11-12" }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "lendDirect", chairId: id, profileId: id, startsOn: "2026-11-05", endsOn: "2026-11-12" }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "lendDirect", itemId: id, quantity: 0, borrowerId: id, startsOn: "2026-11-05", endsOn: "2026-11-12" }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "categoryCreate", name: "Signalétique" }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "storage", name: "Étagère A", placeId: null, address: "", contact: "", access: "", notes: "", parentId: id }).success).toBe(true);
  });
  it("keeps two levels of places in the database and the system categories", () => {
    const sql = readFileSync("db/migrations/0109_equipment_more.sql", "utf8");
    expect(sql).toContain("CREATE TRIGGER storage_two_levels");
    expect(sql).toContain("CHECK (system_key IS NULL OR NOT archived)");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION chair_label");
  });
});

describe("11: page and texts", () => {
  it("separates « Ce que nous possédons » and « Où et chez qui »", () => {
    const page = readFileSync("src/components/equipment.tsx", "utf8");
    expect(page).toContain('["owned", tabs.filter((k) => k === "chairs" || k === "workshop" || k === "small")]');
    expect(page).toContain('["where", tabs.filter((k) => k === "lending" || k === "places")]');
    expect(page).toContain("<LendDialog");
    expect(readFileSync("src/app/globals.css", "utf8")).toContain(".tab-groups {");
  });
  it("has the same texts in three languages, without long dashes nor the banned words", () => {
    expect(keys(equipmentMoreCopy.nl)).toEqual(keys(equipmentMoreCopy.fr));
    expect(keys(equipmentMoreCopy.en)).toEqual(keys(equipmentMoreCopy.fr));
    const all = JSON.stringify(equipmentMoreCopy) + Object.values(equipmentMoreCopy).map((c) => Object.values(c).map(String).join(" ")).join(" ");
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    expect(equipmentMoreCopy.fr.createCategory("Signalétique")).toBe("+ Créer « Signalétique »");
  });
});
