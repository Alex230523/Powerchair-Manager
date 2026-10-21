import { describe, it, expect } from "vitest";
import { addDays, conditionTasks, examplePackages, paymentState, proposedRenewal } from "../src/domains/funding/schema";
import { validIban, formatIban } from "../src/lib/iban";
import { sponsorsCopy } from "../src/components/sponsors-copy";
import { editableKinds } from "../src/domains/notifications/templates";

/** Wave 15 (C1): conditions as tasks, payment badge, renewal date, IBAN, texts. */
const keys = (o: object): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]))
    .sort();
const texts = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? texts(v) : [String(v)]));

describe("sponsor conditions", () => {
  const conditions = [
    { id: "a", title: "Logo sur les maillots", description: "Face avant", quantity: "", offset_days: 30, position: 0 },
    { id: "b", title: "Publications", description: "", quantity: "3 publications", offset_days: 60, position: 1 },
    { id: "c", title: "Invitation", description: "", quantity: "", offset_days: null, position: 2 },
  ];
  it("dates each condition from the signing day, or leaves it to be set", () => {
    expect(conditionTasks(conditions, "2026-10-21").map((t) => [t.title, t.due_on, t.detail])).toEqual([
      ["Logo sur les maillots", "2026-11-20", "Face avant"],
      ["Publications · 3 publications", "2026-12-20", ""],
      ["Invitation", null, ""],
    ]);
    expect(conditionTasks(conditions, null).every((t) => t.due_on === null)).toBe(true);
  });
  it("adds days across months and years", () => {
    expect(addDays("2026-12-20", 15)).toBe("2027-01-04");
    expect(proposedRenewal("2027-06-30")).toBe("2027-05-01");
  });
  it("says paid, expected or late for a payment", () => {
    expect(paymentState({ paid_on: "2026-10-01", payment_due_on: "2026-09-01" }, "2026-10-21")).toEqual({ kind: "paid", date: "2026-10-01" });
    expect(paymentState({ paid_on: null, payment_due_on: "2026-10-01" }, "2026-10-21")).toEqual({ kind: "late", date: "2026-10-01" });
    expect(paymentState({ paid_on: null, payment_due_on: "2026-11-01" }, "2026-10-21")).toEqual({ kind: "expected", date: "2026-11-01" });
    expect(paymentState({ paid_on: null, payment_due_on: null }, "2026-10-21")).toBeNull();
  });
  it("offers the example in three languages, with the same amounts and places", () => {
    for (const l of ["nl", "en"] as const)
      expect(examplePackages[l].map((k) => [k.amountCents, k.places, k.featured, k.conditions.length])).toEqual(
        examplePackages.fr.map((k) => [k.amountCents, k.places, k.featured, k.conditions.length]),
      );
    expect(examplePackages.fr.map((k) => k.amountCents)).toEqual([70000, 100000, 200000]);
  });
});

describe("club IBAN", () => {
  it("accepts a valid IBAN with or without spaces and refuses a wrong check digit", () => {
    expect(validIban("BE68 5390 0754 7034")).toBe(true);
    expect(validIban("be68539007547034")).toBe(true);
    expect(validIban("BE69 5390 0754 7034")).toBe(false);
    expect(validIban("BE68")).toBe(false);
    expect(formatIban("BE68539007547034")).toBe("BE68 5390 0754 7034");
  });
});

describe("sponsor texts", () => {
  it("have the same keys in fr, nl and en, without long dashes", () => {
    expect(keys(sponsorsCopy.nl)).toEqual(keys(sponsorsCopy.fr));
    expect(keys(sponsorsCopy.en)).toEqual(keys(sponsorsCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) for (const x of texts(sponsorsCopy[l])) expect(x).not.toMatch(/[–—]/);
  });
  it("declare the task reminder as an editable mail", () => {
    expect(editableKinds).toContain("funding_task");
  });
});
