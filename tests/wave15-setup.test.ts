import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { setupDone, setupLinks, setupShown, setupSteps } from "../src/domains/setup/schema";
import { setupCopy } from "../src/components/setup-copy";
import { settingsEntries } from "../src/components/settings-nav";

/** Wave 15 (C3): getting started of a new club. */
describe("getting started", () => {
  const state = (done: number, hidden = false) => ({ hidden, steps: setupSteps.map((id, i) => ({ id, done: i < done })) });
  it("counts the steps done and shows the card until all are done or it is hidden", () => {
    expect(setupDone(state(3))).toBe(3);
    expect(setupShown(state(0))).toBe(true);
    expect(setupShown(state(9))).toBe(false);
    expect(setupShown(state(2, true))).toBe(false);
  });
  it("opens existing forms and anchors", () => {
    const anchors = settingsEntries.map((e) => `/settings/${e.category}#${e.anchor}`);
    for (const step of ["identity", "dues", "modules", "presence", "palette"] as const) expect(anchors).toContain(setupLinks[step]);
    expect(setupLinks.players).toBe("/players?import=1");
    expect(readFileSync("src/components/access.tsx", "utf8")).toContain('id="access-invite"');
    expect(readFileSync("src/components/people.tsx", "utf8")).toContain('<section id="teams">');
  });
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(setupCopy.nl)).toEqual(keys(setupCopy.fr));
    expect(keys(setupCopy.en)).toEqual(keys(setupCopy.fr));
    expect(JSON.stringify(setupCopy)).not.toMatch(/[–—]/);
  });
});
