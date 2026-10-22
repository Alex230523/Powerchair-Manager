import { describe, it, expect } from "vitest";
import { defaultDuesRules, duesRules, reminderDue } from "../src/domains/dues/rules";
import { grantNext, partnerNext } from "../src/domains/funding/schema";
import { validImage } from "../src/domains/access/service";
import { fundingCopy } from "../src/components/funding-copy";
import { duesSettingsCopy } from "../src/components/dues-settings-copy";
import { shellCopy } from "../src/components/shell-copy";

function shape(o: unknown): unknown {
  if (o && typeof o === "object")
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, shape((o as Record<string, unknown>)[k])]),
    );
  return typeof o;
}

describe("automatic dues reminders", () => {
  const rules = { ...defaultDuesRules, auto: true };
  it("stays quiet when switched off or when nothing is due", () => {
    expect(reminderDue(defaultDuesRules, [{ due_on: "2026-10-25" }], null, "2026-10-20")).toBeNull();
    expect(reminderDue(rules, [], null, "2026-10-20")).toBeNull();
  });
  it("writes a few days before the instalment, then once it is late, and repeats", () => {
    expect(reminderDue(rules, [{ due_on: "2026-10-27" }], null, "2026-10-20")).toBe("before");
    expect(reminderDue(rules, [{ due_on: "2026-11-15" }], null, "2026-10-20")).toBeNull();
    expect(reminderDue(rules, [{ due_on: "2026-10-10" }], null, "2026-10-14")).toBeNull();
    expect(reminderDue(rules, [{ due_on: "2026-10-10" }], null, "2026-10-17")).toBe("late");
    // Sent 10 days ago: wait for the repeat delay (14 days by default).
    expect(reminderDue(rules, [{ due_on: "2026-10-01" }], "2026-10-10", "2026-10-20")).toBeNull();
    expect(reminderDue(rules, [{ due_on: "2026-10-01" }], "2026-10-05", "2026-10-20")).toBe("late");
  });
  it("completes stored rules with the defaults", () => {
    expect(duesRules(null)).toEqual(defaultDuesRules);
    expect(duesRules({ auto: true, daysBefore: 3 })).toEqual({ ...defaultDuesRules, auto: true, daysBefore: 3 });
    expect(duesRules({ auto: "yes" })).toEqual(defaultDuesRules);
  });
});

describe("grants and partners: the next date", () => {
  it("asks to file an idea before its deadline and to report on a granted one", () => {
    expect(grantNext({ status: "idea", deadline_on: "2026-11-01", report_due_on: null })).toEqual({ kind: "deadline", date: "2026-11-01" });
    expect(grantNext({ status: "submitted", deadline_on: "2026-11-01", report_due_on: null })).toBeNull();
    expect(grantNext({ status: "granted", deadline_on: null, report_due_on: "2027-03-31" })).toEqual({ kind: "report", date: "2027-03-31" });
    expect(grantNext({ status: "closed", deadline_on: null, report_due_on: "2027-03-31" })).toBeNull();
  });
  it("follows up a partner on the planned day, otherwise at the end of the agreement", () => {
    expect(partnerNext({ status: "prospect", ends_on: null, next_action_on: "2026-11-05" })).toEqual({ kind: "action", date: "2026-11-05" });
    expect(partnerNext({ status: "active", ends_on: "2027-06-30", next_action_on: null })).toEqual({ kind: "renewal", date: "2027-06-30" });
    expect(partnerNext({ status: "prospect", ends_on: "2027-06-30", next_action_on: null })).toBeNull();
    expect(partnerNext({ status: "ended", ends_on: "2026-06-30", next_action_on: "2026-11-05" })).toBeNull();
  });
});

describe("profile photo", () => {
  it("checks the file signature and the size", () => {
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(10)]);
    expect(validImage("image/png", png, 262144)).toBe(true);
    expect(validImage("image/jpeg", png, 262144)).toBe(false);
    expect(validImage("image/png", Buffer.alloc(0), 262144)).toBe(false);
    expect(validImage("image/png", Buffer.concat([png, Buffer.alloc(262144)]), 262144)).toBe(false);
    expect(validImage("image/webp", Buffer.from("RIFF0000WEBP"), 262144)).toBe(true);
  });
});

describe("wave 11 texts", () => {
  it.each([
    ["funding", fundingCopy],
    ["dues settings", duesSettingsCopy],
    ["shell", shellCopy],
  ])("%s has the same keys in fr, nl and en", (_name, copy) => {
    const c = copy as Record<string, unknown>;
    expect(shape(c.nl)).toEqual(shape(c.fr));
    expect(shape(c.en)).toEqual(shape(c.fr));
  });
  it("uses no long dashes and names the renamed pages", () => {
    expect(JSON.stringify([fundingCopy, duesSettingsCopy])).not.toMatch(/[–—]/);
    expect(shellCopy.fr.funding).toBe("Finances");
    expect(shellCopy.fr.licenses).toBe("Transferts");
    expect(shellCopy.fr.contacts).toBe("Carnet de contacts");
  });
});
