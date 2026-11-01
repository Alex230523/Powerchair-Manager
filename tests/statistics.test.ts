import { it, expect } from "vitest";
import { percentage, statisticsCsv } from "../src/domains/statistics/summary";

it("rounds a rate and has none without a denominator", () => {
  expect(percentage(1, 2)).toBe(50);
  expect(percentage(2, 3)).toBe(67);
  expect(percentage(0, 0)).toBeNull();
});
it("produces safe quoted CSV cells", () => {
  expect(statisticsCsv([["=1+2", 'Player "A"', null]])).toBe('﻿"\'=1+2";"Player ""A""";""');
});
