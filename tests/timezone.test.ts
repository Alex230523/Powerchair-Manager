import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { brusselsDay } from "../src/lib/today";
import { sessionGuards } from "../src/lib/env";

/** 13/11/2026: « aujourd'hui » est le jour de Bruxelles, en base comme dans le code. */
describe("today in Brussels", () => {
  it("is the next day from 23:00 UTC in winter, 22:00 UTC in summer", () => {
    expect(brusselsDay(new Date("2026-11-12T22:59:00Z"))).toBe("2026-11-12");
    expect(brusselsDay(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
    expect(brusselsDay(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(brusselsDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });
  it("sets the sessions of the application to Europe/Brussels", () => {
    expect(sessionGuards).toContain("SET TIME ZONE 'Europe/Brussels'");
    expect(readFileSync("db/migrations/0148_timezone_brussels.sql", "utf8")).toMatch(/ALTER DATABASE %I SET timezone TO %L/);
  });
  it("never takes the day in UTC for « today » on the server or in the screens", () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    const offenders = files("src").filter((f) => /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
