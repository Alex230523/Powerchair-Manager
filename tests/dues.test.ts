import { it, expect } from "vitest";
import { schedule } from "../src/domains/dues/schema";
it("splits a single 250 EUR debt without multiplying its principal", () => {
  const rows = schedule(25000, 4, "2026-10-31");
  expect(rows.map((r) => r.amount_cents)).toEqual([6250, 6250, 6250, 6250]);
  expect(rows.map((r) => r.due_on)).toEqual([
    "2026-10-31",
    "2026-11-30",
    "2026-12-31",
    "2027-01-31",
  ]);
});
it("preserves every cent and the original month-day anchor through February", () => {
  const rows = schedule(10000, 3, "2028-01-31");
  expect(rows.map((r) => r.amount_cents)).toEqual([3334, 3333, 3333]);
  expect(rows.map((r) => r.due_on)).toEqual([
    "2028-01-31",
    "2028-02-29",
    "2028-03-31",
  ]);
  expect(schedule(0, 1, "2026-01-01")[0].amount_cents).toBe(0);
});
it("rejects invalid or unsafe schedules", () => {
  for (const args of [
    [1, 0, "2026-01-01"],
    [-1, 1, "2026-01-01"],
    [1, 13, "2026-01-01"],
    [1, 1, "2026-02-30"],
    [0.5, 1, "2026-01-01"],
  ] as const)
    expect(() => schedule(args[0],args[1],args[2])).toThrow();
});
