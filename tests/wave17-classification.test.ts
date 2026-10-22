import { describe, it, expect } from "vitest";
import {
  classificationCommand,
  defaultTexts,
  outcome,
  publishable,
  registrationOpen,
  shownClass,
  textsOf,
  validDates,
} from "../src/domains/classification/schema";
import { classificationCopy } from "../src/components/classification-copy";
import { licensesCopy } from "../src/components/licenses-copy";
import { playerProfileCopy } from "../src/components/player-profile-copy";
import { statisticsCopy } from "../src/components/statistics-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const uuid = "00000000-0000-4000-8000-000000000001";

/** Wave 17 (J4): classification days and the classification badges. */
describe("wave 17, J4: classification", () => {
  it("says « Non définie » for a missing class and « En attente » for pending, everywhere", () => {
    expect([shownClass(null), shownClass(undefined), shownClass(""), shownClass("not_classified"), shownClass("PF3")]).toEqual(Array(5).fill("not_classified"));
    expect(shownClass("pending")).toBe("pending");
    expect(shownClass("PF2")).toBe("PF2");
    for (const labels of [classificationCopy.fr.classes, licensesCopy.fr.classes, playerProfileCopy.fr.classifications, statisticsCopy.fr.headcount.classes]) {
      expect(labels.not_classified).toBe("Non définie");
      expect(labels.pending).toBe("En attente");
    }
    expect(JSON.stringify([licensesCopy, playerProfileCopy, statisticsCopy])).not.toMatch(/Non classé|Évaluation en cours/);
  });

  it("falls back on the default PF1/PF2 texts until the federation writes complete ones", () => {
    expect(textsOf(null)).toEqual(defaultTexts);
    expect(textsOf({ PF1: { fr: "x" } })).toEqual(defaultTexts);
    const own = { PF1: { fr: "Un", nl: "Een", en: "One" }, PF2: { fr: "Deux", nl: "Twee", en: "Two" } };
    expect(textsOf(own)).toEqual(own);
    expect(defaultTexts.PF1.fr).toMatch(/limite le plus la conduite du fauteuil/);
    expect(defaultTexts.PF2.fr).toMatch(/nombre de PF2 en même temps sur le terrain/);
  });

  it("checks the dates, the registration window and when a day can be published", () => {
    expect(validDates("2026-11-20", "2026-11-10", "2026-10-22")).toBe(true);
    expect(validDates("2026-11-20", "2026-11-21", "2026-10-22")).toBe(false);
    expect(validDates("2026-10-21", "2026-10-21", "2026-10-22")).toBe(false);
    expect(validDates("2026-11-20", "2026-10-21", "2026-10-22")).toBe(false);
    expect(validDates("2026-10-22", "2026-10-22", "2026-10-22")).toBe(true);
    expect(registrationOpen({ status: "open", registration_deadline: "2026-10-22" }, "2026-10-22")).toBe(true);
    expect(registrationOpen({ status: "open", registration_deadline: "2026-10-21" }, "2026-10-22")).toBe(false);
    expect(registrationOpen({ status: "published", registration_deadline: "2026-12-01" }, "2026-10-22")).toBe(false);
    expect(publishable([]).ok).toBe(false);
    expect(publishable([{ present: true, decision: "PF1" }, { present: false, decision: null }])).toEqual({ ok: true, unmarked: 0, undecided: 0, decided: 1 });
    expect(publishable([{ present: null, decision: null }, { present: true, decision: null }])).toMatchObject({ ok: false, unmarked: 1, undecided: 1 });
  });

  it("validates PF1 or PF2, and refuses with « À revoir » keeping the class", () => {
    expect(outcome("PF2", "pending", "", "À revoir")).toEqual({ classification: "PF2", status: "validated", note: "" });
    expect(outcome("review", "PF1", "", "À revoir")).toEqual({ classification: "PF1", status: "refused", note: "À revoir" });
    expect(outcome("review", "not_classified", "Revenir en mars", "À revoir").note).toBe("Revenir en mars");
  });

  it("accepts only well formed commands", () => {
    const create = { action: "create", day: "2026-11-20", registrationDeadline: "2026-11-10", sharedVenueId: null, venue: "Namur", clubIds: [uuid], classifierIds: [] };
    expect(classificationCommand.safeParse(create).success).toBe(true);
    expect(classificationCommand.safeParse({ ...create, clubIds: [] }).success).toBe(false);
    expect(classificationCommand.safeParse({ action: "mark", id: uuid, present: true, decision: "PF3", comment: "" }).success).toBe(false);
    expect(classificationCommand.safeParse({ action: "mark", id: uuid, present: true, decision: "review" }).success).toBe(true);
    expect(classificationCommand.safeParse({ action: "texts", texts: { PF1: { fr: "a", nl: "b", en: "c" }, PF2: { fr: "a", nl: "b" } } }).success).toBe(false);
  });

  it("has every text in the three languages, without long dashes", () => {
    expect(shape(classificationCopy.nl)).toEqual(shape(classificationCopy.fr));
    expect(shape(classificationCopy.en)).toEqual(shape(classificationCopy.fr));
    expect(JSON.stringify([classificationCopy, defaultTexts])).not.toMatch(/[–—]/);
  });
});
