import { describe, expect, it } from "vitest";
import { indicators, prospectCommand } from "../src/domains/recruitment/schema";
import { recruitmentCopy } from "../src/components/recruitment-copy";
import { delegable, permissions } from "../src/domains/access/policy";

/** H1: a minor needs his parent; the indicators by source; the right; the texts. */
describe("recruitment", () => {
  it("takes a minor only with his parent's name", () => {
    expect(prospectCommand.safeParse({ action: "create", firstName: "Léa", minor: true, source: "rehab" }).success).toBe(false);
    expect(prospectCommand.safeParse({ action: "create", firstName: "Léa", minor: true, parentName: "Sophie", source: "rehab" }).success).toBe(true);
    expect(prospectCommand.safeParse({ action: "create", firstName: "Léa", source: "hospital" }).success).toBe(false);
  });
  it("gives the rates by source, and no rate without data", () => {
    const r = indicators(
      [
        { source: "rehab", reached_trial: true, registered: true },
        { source: "rehab", reached_trial: true, registered: false },
        { source: "social", reached_trial: false, registered: false },
      ],
      [{ source: "rehab", still: true }],
    );
    expect(r[0]).toMatchObject({ source: "rehab", prospects: 2, trialRate: 100, registerRate: 50, kept: 1, keptOf: 1, keptRate: 100 });
    expect(r[1]).toMatchObject({ source: "social", trialRate: 0, keptRate: null });
  });
  it("gives the recruitment right to a club's presidency, never to a federation's", () => {
    expect(delegable).toContain("recruitment.manage");
    expect(permissions("club_president", [])).toContain("recruitment.manage");
    expect(permissions("federation_president", [])).not.toContain("recruitment.manage");
    expect(permissions("coach", [])).not.toContain("recruitment.manage");
  });
  it("has the same words in the three languages, no dash, no banned word", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(recruitmentCopy.nl)).toEqual(keys(recruitmentCopy.fr));
    expect(keys(recruitmentCopy.en)).toEqual(keys(recruitmentCopy.fr));
    expect(JSON.stringify(recruitmentCopy)).not.toMatch(/[–—]|convoqu|opgeroep|summon|call-up/i);
  });
});
