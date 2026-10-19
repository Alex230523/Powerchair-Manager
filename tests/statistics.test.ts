import { it, expect } from "vitest";
import {
  summarize,
  percentage,
  statisticsCsv,
  type StatisticalEvent,
} from "../src/domains/statistics/summary";
const invitation = (actual = "present", response = "present") => ({
  profile_id: "p",
  full_name: "Player",
  withdrawn_at: null,
  response,
  actual,
});
const event = (
  overrides: Partial<StatisticalEvent> = {},
): StatisticalEvent => ({
  id: "e",
  kind: "training",
  status: "scheduled",
  starts_at: "2026-10-01T18:00:00Z",
  register: { closed_at: "2026-10-02" },
  invitations: [invitation()],
  ...overrides,
});
it("separates declared responses from observed attendance and excludes cancelled/withdrawn invitations", () => {
  const report = summarize([
    event(),
    event({
      id: "open",
      register: null,
      invitations: [invitation("absent", "none")],
    }),
    event({ status: "cancelled" }),
    event({ invitations: [{ ...invitation(), withdrawn_at: "2026-10-03" }] }),
  ]);
  expect(report.total).toMatchObject({
    invited: 2,
    answered: 1,
    closed: 1,
    attended: 1,
    absent: 0,
  });
  expect(report.people).toHaveLength(1);
  expect(percentage(report.total.answered, report.total.invited)).toBe(50);
});
it("aggregates multiple sessions per person, counts late/early, and filters kinds", () => {
  const report = summarize(
    [
      event({ invitations: [invitation("late")] }),
      event({ invitations: [invitation("early")] }),
      event({ invitations: [invitation("absent")] }),
      event({ kind: "friendly" }),
    ],
    "training",
  );
  expect(report.total).toMatchObject({
    closed: 3,
    attended: 2,
    absent: 1,
    late: 1,
    early: 1,
  });
  expect(percentage(2, 3)).toBe(67);
  expect(percentage(0, 0)).toBeNull();
  expect(report.people).toHaveLength(1);
});
it("groups by Brussels month and produces safe quoted CSV cells", () => {
  expect(
    summarize([event({ starts_at: "2026-09-30T23:30:00Z" })]).months[0].month,
  ).toBe("2026-10");
  expect(statisticsCsv([["=1+2", 'Player "A"', null]])).toBe(
    '\uFEFF"\'=1+2";"Player ""A""";""',
  );
});
