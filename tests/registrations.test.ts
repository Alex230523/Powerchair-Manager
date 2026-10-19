import { it, expect } from "vitest";
import {
  fieldsSchema,
  validateAnswers,
  type Field,
} from "../src/domains/registrations/schema";
const choice: Field = {
  key: "choice",
  type: "choice",
  label: { fr: "Choix", nl: "Keuze" },
  required: true,
  options: ["Oui", "Non"],
  confidential: false,
};
it("requires earlier conditional references and unique question identifiers", () => {
  expect(() => fieldsSchema.parse([choice, { ...choice }])).toThrow();
  expect(() =>
    fieldsSchema.parse([
      { ...choice, key: "other", condition: { key: "choice", equals: "Oui" } },
      choice,
    ]),
  ).toThrow();
});
it("ignores hidden answers and rejects missing visible responses", () => {
  const detail: Field = {
    ...choice,
    key: "detail",
    type: "text",
    condition: { key: "choice", equals: "Oui" },
  };
  expect(
    validateAnswers([choice, detail], {
      choice: "Non",
      detail: "hidden",
      injected: "value",
    }),
  ).toEqual({ choice: "Non" });
  expect(() => validateAnswers([choice, detail], { choice: "Oui" })).toThrow(
    "MISSING_FIELDS",
  );
});
it("requires explicit consent and validates choices, dates and phone numbers", () => {
  const consent: Field = { ...choice, key: "consent", type: "consent" };
  expect(() => validateAnswers([consent], { consent: "true" })).toThrow();
  expect(() => validateAnswers([choice], { choice: "Injected" })).toThrow();
  expect(() =>
    validateAnswers([{ ...choice, type: "date" }], { choice: "2026-02-30" }),
  ).toThrow();
  expect(() =>
    validateAnswers([{ ...choice, type: "phone" }], { choice: "<script>" }),
  ).toThrow();
});
it("requires a stored attachment for required files and explains typed attestations separately", () => {
  const file: Field = { ...choice, type: "file" };
  expect(() => validateAnswers([file], { choice: "pretend.pdf" })).toThrow();
  expect(validateAnswers([file], {}, ["choice"])).toEqual({});
  expect(() =>
    validateAnswers([{ ...choice, type: "signature" }], { choice: " " }),
  ).toThrow();
});
