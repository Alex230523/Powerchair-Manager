import { describe, it, expect } from "vitest";
import { commandSchema, issueTarget, previewLine } from "../src/domains/dues/schema";
import { duesIssueCopy } from "../src/components/dues-issue-copy";
import { permissions } from "../src/domains/access/policy";
import { builtin, editableKinds, validateTemplate } from "../src/domains/notifications/templates";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const uuid = "00000000-0000-4000-8000-000000000001";

/** A3: « Émettre des cotisations », always findable, many at once. */
describe("A3: issuing membership fees", () => {
  it("gives the president dues.manage", () => {
    expect(permissions("club_president", [])).toContain("dues.manage");
    expect(permissions("coach", [])).not.toContain("dues.manage");
  });

  it("computes each preview line: covered, exempted, sibling discount", () => {
    const rule = { second: 50, next: 25 };
    expect(previewLine(25000, true, 1, rule, null)).toEqual({ included: false, discount: 0, net: 0, reason: "" });
    expect(previewLine(25000, false, 1, rule, null)).toMatchObject({ included: true, discount: 0, net: 25000 });
    expect(previewLine(25000, false, 2, rule, null)).toMatchObject({ discount: 12500, net: 12500 });
    expect(previewLine(25000, false, 3, rule, null)).toMatchObject({ discount: 6250, net: 18750 });
    expect(previewLine(25000, false, 2, rule, "Situation familiale")).toEqual({ included: true, discount: 25000, net: 0, reason: "Situation familiale" });
  });

  it("accepts the wizard's commands only when well formed", () => {
    expect(issueTarget.safeParse({ kind: "team", teamId: uuid }).success).toBe(true);
    expect(issueTarget.safeParse({ kind: "club" }).success).toBe(false);
    const many = { action: "issueMany", planId: uuid, target: { kind: "season" }, installments: 4, firstDue: "2026-11-01" };
    expect(commandSchema.safeParse(many).success).toBe(true);
    expect(commandSchema.safeParse({ ...many, installments: 13 }).success).toBe(false);
    expect(commandSchema.safeParse({ ...many, exemptions: [{ profileId: uuid, reason: "x" }] }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "autoIssue", planId: null }).success).toBe(true);
  });

  it("has the « Cotisation émise » message in three languages", () => {
    expect(editableKinds).toContain("dues_issued");
    for (const l of ["fr", "nl", "en"] as const) {
      expect(builtin.dues_issued[l].body).toMatch(/\{details\}/);
      expect(() => validateTemplate("dues_issued", builtin.dues_issued[l])).not.toThrow();
    }
  });

  it("has every text in the three languages, without long dashes", () => {
    expect(shape(duesIssueCopy.nl)).toEqual(shape(duesIssueCopy.fr));
    expect(shape(duesIssueCopy.en)).toEqual(shape(duesIssueCopy.fr));
    expect(JSON.stringify(duesIssueCopy)).not.toMatch(/[–—]/);
  });
});
