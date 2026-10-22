import { describe, it, expect } from "vitest";
import { catalog, defaultMessages, isEditable, render, ruleKeys } from "../src/domains/automations/catalog";
import { automationCommand } from "../src/domains/automations/schema";
import { automationsCopy } from "../src/components/automations-copy";
import { clubWrittenKinds } from "../src/domains/notifications/templates";

/** B7: the catalogue of automations and its texts. */
describe("B7 automations", () => {
  it("has the ten rules of the specification, each coherent", () => {
    expect(ruleKeys).toHaveLength(10);
    for (const rule of ruleKeys) {
      const d = catalog[rule];
      expect(d.defaultActions.every((a) => d.actions.includes(a)), rule).toBe(true);
      expect(d.recipients.length, rule).toBeGreaterThan(0);
      if (d.delay) expect(d.delay.value >= d.delay.min && d.delay.value <= d.delay.max, rule).toBe(true);
      // A built-in rule keeps its templates; the others have their own message in three languages.
      expect(isEditable(rule), rule).toBe(!d.builtin);
      if (d.actions.includes("task")) expect(d.category, rule).toBeTruthy();
    }
    // The existing reminders keep running as before the engine.
    expect(ruleKeys.filter((r) => catalog[r].enabled)).toEqual(["callNoAnswer", "licenceExpiring", "grantDeadline", "sponsorRenewal"]);
    // « Tâche en retard » never creates a task: no loop between rules.
    expect(catalog.taskLate.actions).not.toContain("task");
  });
  it("fills a message's variables and leaves unknown ones as they are", () => {
    expect(render(defaultMessages.documentExpiring.fr.subject, { about: "Certificat" })).toBe("Document à renouveler · Certificat");
    expect(render("{person} {unknown}", { person: "Ana" })).toBe("Ana {unknown}");
    for (const rule of Object.keys(defaultMessages) as (keyof typeof defaultMessages)[])
      for (const l of ["fr", "nl", "en"] as const) expect(defaultMessages[rule][l].body.length, `${rule} ${l}`).toBeGreaterThan(10);
    expect(clubWrittenKinds).toContain("automation");
  });
  it("reads the commands", () => {
    expect(automationCommand.parse({ action: "rule", rule: "taskLate", enabled: true, paused: false, delayDays: 2, actions: ["notify"] })).toMatchObject({ rule: "taskLate", delayDays: 2 });
    expect(() => automationCommand.parse({ action: "rule", rule: "sms", enabled: true, paused: false })).toThrow();
    expect(() => automationCommand.parse({ action: "rule", rule: "taskLate", enabled: true, paused: false, actions: ["sms"] })).toThrow();
    expect(automationCommand.parse({ action: "stop", stopped: true })).toEqual({ action: "stop", stopped: true });
  });
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(automationsCopy.nl)).toEqual(keys(automationsCopy.fr));
    expect(keys(automationsCopy.en)).toEqual(keys(automationsCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      expect(Object.keys(automationsCopy[l].rules).sort()).toEqual([...ruleKeys].sort());
      expect(JSON.stringify(automationsCopy[l]) + JSON.stringify(Object.values(defaultMessages).map((m) => m[l]))).not.toMatch(/[–—]/);
    }
  });
});
