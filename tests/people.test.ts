import { csvCell, csvRows } from "../src/domains/people/csv";
import { describe, it, expect } from "vitest";
import {
  ageOn,
  orderedDates,
  peopleCommand,
} from "../src/domains/people/schema";
describe("person and family boundaries", () => {
  it("changes age on the birthday, including a leap-day birthday", () => {
    expect(ageOn("2008-10-18", "2026-10-17")).toBe(17);
    expect(ageOn("2008-10-18", "2026-10-18")).toBe(18);
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
  });
  it("rejects invalid dates and distinguishes open-ended periods", () => {
    expect(orderedDates("2026-10-18", null)).toBe(true);
    expect(orderedDates("2026-10-18", "2026-10-17")).toBe(false);
    expect(
      peopleCommand.safeParse({
        action: "season",
        name: "2026",
        startsOn: "2026-02-30",
        endsOn: "2026-12-31",
      }).success,
    ).toBe(false);
  });
});

it("quotes CSV fields and prevents spreadsheet formulas in names and contacts", () => {
  expect(csvCell("=SUM(1,1)")).toBe('"\'=SUM(1,1)"');
  expect(csvCell("  +32400")).toBe('"\'  +32400"');
  expect(csvCell('Name;"quote"')).toBe('"Name;""quote"""');
  expect(csvRows([["Name", "Contact"]]).startsWith("\uFEFF")).toBe(true);
});
