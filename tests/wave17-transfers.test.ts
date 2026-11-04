import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { adultOn, amountAllowed, bpcfRules, freeLeave, marketOpen, offerMoves, provinces, requestOpen, rulesOf, transferCommand } from "../src/domains/transfers/schema";
import { transfersCopy } from "../src/components/transfers-copy";
import { shellCopy } from "../src/components/shell-copy";
import { welcomeCopy } from "../src/components/welcome-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const uuid = "00000000-0000-4000-8000-000000000001";

/** Wave 17 (J3): the transfer market between clubs. */
describe("wave 17, J3: transfer market", () => {
  it("keeps every player hidden until the player or a parent ticks it", () => {
    const sql = readFileSync("db/migrations/0062_transfer_market.sql", "utf8");
    expect(sql).toMatch(/visible boolean NOT NULL DEFAULT false/);
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE/);
    expect(adultOn("2008-10-22", "2026-10-22")).toBe(true);
    expect(adultOn("2008-10-23", "2026-10-22")).toBe(false);
    // An unknown birth date counts as a minor: a parent decides.
    expect(adultOn(null, "2026-10-22")).toBe(false);
  });

  it("applies the federation's rules", () => {
    expect(marketOpen({ windows: [] }, "2026-10-22")).toBe(true);
    expect(marketOpen({ windows: [{ from: "2026-06-01", to: "2026-06-30" }] }, "2026-10-22")).toBe(false);
    expect(marketOpen({ windows: [{ from: "2026-06-01", to: "2026-06-30" }, { from: "2026-10-01", to: "2026-10-22" }] }, "2026-10-22")).toBe(true);
    expect(amountAllowed({ amountsAllowed: false, amountCapCents: null }, null)).toBe(true);
    expect(amountAllowed({ amountsAllowed: false, amountCapCents: null }, 100)).toBe(false);
    expect(amountAllowed({ amountsAllowed: true, amountCapCents: 50000 }, 50000)).toBe(true);
    expect(amountAllowed({ amountsAllowed: true, amountCapCents: 50000 }, 50001)).toBe(false);
    expect(rulesOf(undefined).federationValidation).toBe(true);
    expect(rulesOf({ windows: [], federation_validation: false }).federationValidation).toBe(false);
  });

  it("lets the current club accept only once the player agreed, and the federation validate", () => {
    const base = { status: "sent", player_consent: "pending", from_organization_id: uuid };
    expect(offerMoves(base, "from", true)).toEqual(["refuse"]);
    expect(offerMoves({ ...base, player_consent: "given" }, "from", true)).toEqual(["accept", "refuse"]);
    expect(offerMoves(base, "to", true)).toEqual(["withdraw"]);
    expect(offerMoves({ ...base, status: "accepted" }, "federation", true)).toEqual(["validate", "refuse"]);
    expect(offerMoves({ ...base, status: "accepted" }, "federation", false)).toEqual([]);
    expect(offerMoves({ ...base, from_organization_id: null }, "from", true)).toEqual([]);
  });

  it("04/11/2026: follows the BPCF rules (art. 1/12)", () => {
    const r = bpcfRules("2026-11-04", "Texte");
    expect(r.windows).toEqual([
      { from: "2026-07-01", to: "2026-08-31" },
      { from: "2026-12-20", to: "2027-01-10" },
    ]);
    expect(bpcfRules("2027-03-01", "").windows[0].from).toBe("2026-07-01");
    expect(r).toMatchObject({ amountsAllowed: true, amountCapCents: 50000, consentedAnytime: true, maxPerPairSeason: 1, federationValidation: true });
    // Outside a period: closed, but a consented transfer stays possible.
    expect(marketOpen(r, "2026-11-04")).toBe(false);
    expect(requestOpen(r, "2026-11-04")).toBe(true);
    expect(requestOpen({ ...r, consentedAnytime: false }, "2026-11-04")).toBe(false);
    // A refused transfer, agreed by the player: a free leave during a period only.
    const refused = { status: "refused", player_consent: "given", from_organization_id: uuid, federation_at: null };
    expect(freeLeave(refused, r, "2026-12-24")).toBe(true);
    expect(freeLeave(refused, r, "2026-11-04")).toBe(false);
    expect(freeLeave({ ...refused, player_consent: "refused" }, r, "2026-12-24")).toBe(false);
    expect(freeLeave({ ...refused, federation_at: "2026-12-24" }, r, "2026-12-24")).toBe(false);
    expect(offerMoves(refused, "federation", true, true)).toEqual(["validate"]);
    expect(rulesOf({ consented_anytime: true, max_per_pair_season: 1 })).toMatchObject({ consentedAnytime: true, maxPerPairSeason: 1 });
    expect(rulesOf({})).toMatchObject({ consentedAnytime: false, maxPerPairSeason: null });
  });

  it("accepts only well formed commands", () => {
    expect(transferCommand.safeParse({ action: "request", personId: uuid, season: "2026-27", amountCents: null, message: "" }).success).toBe(true);
    expect(transferCommand.safeParse({ action: "request", personId: uuid, season: "2026", amountCents: null, message: "" }).success).toBe(false);
    expect(transferCommand.safeParse({ action: "rules", rules: { windows: [{ from: "2026-07-01", to: "2026-06-01" }], amountsAllowed: false, amountCapCents: null, maxPerClubSeason: null, federationValidation: true, rulesText: "" } }).success).toBe(false);
    expect(transferCommand.safeParse({ action: "province", clubId: uuid, province: "namur" }).success).toBe(true);
    expect(transferCommand.safeParse({ action: "province", clubId: uuid, province: "paris" }).success).toBe(false);
  });

  it("renames « Transferts » to « Licences » and adds the market, in three languages", () => {
    expect(shellCopy.fr.licenses).toBe("Licences");
    expect(shellCopy.fr.transfers).toBe("Bourse aux transferts");
    for (const l of ["nl", "en"] as const) expect(shellCopy[l].transfers).toBeTruthy();
    for (const l of ["fr", "nl", "en"] as const) expect(welcomeCopy[l].transferVisible).toBeTruthy();
    for (const p of provinces) for (const l of ["fr", "nl", "en"] as const) expect(transfersCopy[l].provinces[p]).toBeTruthy();
  });

  it("has every text in the three languages, without long dashes", () => {
    expect(shape(transfersCopy.nl)).toEqual(shape(transfersCopy.fr));
    expect(shape(transfersCopy.en)).toEqual(shape(transfersCopy.fr));
    expect(JSON.stringify(transfersCopy)).not.toMatch(/[–—]/);
  });
});
