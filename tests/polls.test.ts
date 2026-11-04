import { describe, expect, it } from "vitest";
import { dueForReminder, leading, pollCommand, tally, validAnswers } from "../src/domains/polls/schema";
import { pollsCopy } from "../src/components/polls-copy";

/** H3: an answer fits its poll; the results and the leading option; one relaunch the day before; words. */
describe("polls", () => {
  it("accepts an answer only when it fits the poll", () => {
    const o = ["a", "b"];
    expect(validAnswers("dates", o, [{ optionId: "a", value: "yes" }, { optionId: "b", value: "maybe" }])).toBe(true);
    expect(validAnswers("dates", o, [{ optionId: "a", value: "yes" }])).toBe(false);
    expect(validAnswers("single", o, [{ optionId: "a", value: "yes" }, { optionId: "b", value: "no" }])).toBe(true);
    expect(validAnswers("single", o, [{ optionId: "a", value: "yes" }, { optionId: "b", value: "yes" }])).toBe(false);
    expect(validAnswers("single", o, [{ optionId: "a", value: "maybe" }])).toBe(false);
    expect(validAnswers("multiple", o, [{ optionId: "a", value: "yes" }, { optionId: "b", value: "yes" }])).toBe(true);
    expect(validAnswers("multiple", o, [{ optionId: "a", value: "no" }])).toBe(false);
    expect(validAnswers("multiple", o, [{ optionId: "z", value: "yes" }])).toBe(false);
    expect(validAnswers("dates", o, [{ optionId: "a", value: "yes" }, { optionId: "a", value: "no" }])).toBe(false);
  });
  it("counts and points to the option with most yes, then most « if need be »", () => {
    const t = tally([{ id: "a" }, { id: "b" }], [
      { option_id: "a", value: "yes" },
      { option_id: "b", value: "yes" },
      { option_id: "b", value: "maybe" },
      { option_id: "a", value: "no" },
    ]);
    expect(t).toEqual([
      { id: "a", yes: 1, maybe: 0, no: 1 },
      { id: "b", yes: 1, maybe: 1, no: 0 },
    ]);
    expect(leading(t)).toBe("b");
  });
  it("relaunches once, within the last 24 hours, who has not answered", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    const soon = new Date("2026-11-03T08:00:00Z");
    expect(dueForReminder(soon, now, false, false)).toBe(true);
    expect(dueForReminder(soon, now, true, false)).toBe(false);
    expect(dueForReminder(soon, now, false, true)).toBe(false);
    expect(dueForReminder(new Date("2026-11-05T08:00:00Z"), now, false, false)).toBe(false);
    expect(dueForReminder(new Date("2026-11-01T08:00:00Z"), now, false, false)).toBe(false);
  });
  it("refuses a poll without two options or with a bad audience", () => {
    const base = { action: "create", kind: "single", question: "Quel maillot ?", audience: "members", closesAt: "2026-12-01T10:00:00Z", options: [{ label: "Bleu" }, { label: "Rouge" }] };
    expect(pollCommand.safeParse(base).success).toBe(true);
    expect(pollCommand.safeParse({ ...base, options: [{ label: "Bleu" }] }).success).toBe(false);
    expect(pollCommand.safeParse({ ...base, audience: "everyone" }).success).toBe(false);
  });
  it("has the same words in the three languages, never the banned ones", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(pollsCopy.nl)).toEqual(keys(pollsCopy.fr));
    expect(keys(pollsCopy.en)).toEqual(keys(pollsCopy.fr));
    expect(JSON.stringify(pollsCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    expect(JSON.stringify(pollsCopy)).not.toMatch(/[–—]/);
  });
});
