import { describe, it, expect } from "vitest";
import { currentPeriod, dueAmount, dueState, feeRuleValid } from "../src/domains/affiliations/schema";
import { affiliationsCopy } from "../src/components/affiliations-copy";
import { categories } from "../src/domains/finance/schema";
import { defaultRubric } from "../src/domains/accounts/schema";

function shape(o: unknown): unknown {
  return o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : Array.isArray(o) ? o.length : typeof o;
}
const yearly = { frequency: "annual" as const, opens_month: 8, opens_day: 1, due_days: null, due_month: 9, due_day: 30 };

/** Wave 17 (N2): periods, deadlines and amounts of affiliations. */
describe("wave 17, N2: affiliations", () => {
  it("opens the season's period on 1 August with its deadline", () => {
    expect(currentPeriod(yearly, "2026-10-22")).toEqual({ period: "2026-27", opensOn: "2026-08-01", dueOn: "2026-09-30" });
    expect(currentPeriod(yearly, "2026-07-31")).toEqual({ period: "2025-26", opensOn: "2025-08-01", dueOn: "2025-09-30" });
    // A deadline earlier in the year falls the year after the opening.
    expect(currentPeriod({ ...yearly, due_month: 1, due_day: 15 }, "2026-10-22").dueOn).toBe("2027-01-15");
    expect(currentPeriod({ ...yearly, due_month: null, due_day: null, due_days: 30 }, "2026-08-01").dueOn).toBe("2026-08-31");
  });
  it("opens a monthly period each month", () => {
    const monthly = { frequency: "monthly" as const, opens_month: 1, opens_day: 5, due_days: 10, due_month: null, due_day: null };
    expect(currentPeriod(monthly, "2026-10-22")).toEqual({ period: "2026-10", opensOn: "2026-10-05", dueOn: "2026-10-15" });
    expect(currentPeriod(monthly, "2026-01-02")).toEqual({ period: "2025-12", opensOn: "2025-12-05", dueOn: "2025-12-15" });
  });
  it("counts per club or per licensed player, and says the state", () => {
    expect(dueAmount("club", 15000, 12)).toBe(15000);
    expect(dueAmount("player", 2500, 12)).toBe(30000);
    expect(dueState({ paid_on: null, due_on: "2026-09-30" }, "2026-10-01")).toBe("late");
    expect(dueState({ paid_on: null, due_on: "2026-09-30" }, "2026-09-30")).toBe("open");
    expect(dueState({ paid_on: "2026-09-02", due_on: "2026-09-30" }, "2026-10-01")).toBe("paid");
    expect(feeRuleValid({ frequency: "monthly", dueDays: null, dueMonth: 9, dueDay: 30 })).toBe(false);
    expect(feeRuleValid({ frequency: "annual", dueDays: 30, dueMonth: null, dueDay: null })).toBe(true);
  });
  it("books the expense under « Affiliations », a service in the annual accounts", () => {
    expect(categories).toContain("affiliation");
    expect(defaultRubric("out", "affiliation")).toBe("services");
  });
  it("has the same texts in the three languages", () => {
    expect(shape(affiliationsCopy.nl)).toEqual(shape(affiliationsCopy.fr));
    expect(shape(affiliationsCopy.en)).toEqual(shape(affiliationsCopy.fr));
    for (const t of Object.values(affiliationsCopy)) expect(JSON.stringify(t)).not.toMatch(/[–—]/);
  });
});
