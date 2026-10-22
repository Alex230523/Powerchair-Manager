import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { moveField, removeField, restoreField } from "../src/domains/registrations/editor";
import { fieldsSchema, type Field } from "../src/domains/registrations/schema";
import { platformTemplate, platformTemplates } from "../src/domains/registrations/templates";
import { fill, formsCopy } from "../src/components/registration-forms-copy";
import { undoKinds } from "../src/domains/undo/service";

/** Same keys, at every depth, in the three languages. */
function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const field = (key: string, condition?: string): Field => ({
  key,
  type: "choice",
  label: { fr: key + " fr", nl: key + " nl" },
  required: false,
  options: ["Oui", "Non"],
  confidential: false,
  ...(condition ? { condition: { key: condition, equals: "Oui" } } : {}),
});

describe("wave 17, F1: registration forms", () => {
  it("moves a question and drops a condition that would point forward", () => {
    const fields = [field("a"), field("b", "a"), field("c")];
    expect(moveField(fields, 2, 0).map((f) => f.key)).toEqual(["c", "a", "b"]);
    const moved = moveField(fields, 0, 2);
    expect(moved.map((f) => f.key)).toEqual(["b", "c", "a"]);
    expect(moved[0].condition).toBeUndefined();
    expect(fieldsSchema.safeParse(moved).success).toBe(true);
    expect(moveField(fields, 0, 5)).toBe(fields);
  });
  it("removes a question, then puts it back with the conditions that pointed at it", () => {
    const fields = [field("a"), field("b", "a"), field("c", "a")];
    const { fields: left, removed } = removeField(fields, 0);
    expect(left.map((f) => f.key)).toEqual(["b", "c"]);
    expect(left.every((f) => !f.condition)).toBe(true);
    const back = restoreField(left, removed);
    expect(back).toEqual(fields);
    // Twice: no duplicate.
    expect(restoreField(back, removed)).toEqual(fields);
  });
  it("offers three neutral platform templates, valid in the three languages", () => {
    for (const id of platformTemplates)
      for (const lang of ["fr", "nl", "en"] as const) {
        const t = platformTemplate(id, lang);
        expect(fieldsSchema.safeParse(t.fields).success, `${id} ${lang}`).toBe(true);
        expect(JSON.stringify(t)).not.toMatch(/tigerstorm|BE\d{2} ?\d{4}/i);
      }
  });
  it("leaves no Tigerstorm anywhere in the code of the product", () => {
    const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of files) expect(readFileSync("src/" + f, "utf8"), f).not.toMatch(/tigerstorm/i);
  });
  it("has the same texts in French, Dutch and English", () => {
    expect(shape(formsCopy.nl)).toEqual(shape(formsCopy.fr));
    expect(shape(formsCopy.en)).toEqual(shape(formsCopy.fr));
    expect(fill(formsCopy.fr.acceptOf, { name: "Lucas Martin" })).toBe("Accepter le dossier de Lucas Martin");
    for (const t of Object.values(formsCopy)) expect(JSON.stringify(t)).not.toMatch(/[–—]/);
  });
  it("can undo a decision on an application", () => {
    expect(undoKinds).toContain("registrationDecision");
    const migration = readFileSync("db/migrations/0051_registration_forms.sql", "utf8");
    expect(migration).toContain("registrationDecision");
    expect(migration).toMatch(/opens_on date/);
  });
});
