import { describe, it, expect } from "vitest";
import { databaseUrl } from "../src/lib/env";
import { copy, isLocale } from "../src/lib/locale";
describe("environment boundary", () => {
  it("rejects absent or incompatible database configuration", () => {
    expect(() => databaseUrl({})).toThrow();
    expect(() =>
      databaseUrl({ DATABASE_URL: "https://example.org" }),
    ).toThrow();
  });
  it("accepts PostgreSQL configuration", () => {
    expect(databaseUrl({ DATABASE_URL: "postgresql://localhost/pfm" })).toBe(
      "postgresql://localhost/pfm",
    );
  });
});
describe("language contract", () => {
  it("accepts only supported languages", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("nl")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
  it("provides nonempty copies for all three languages", () => {
    expect(Object.keys(copy.fr).sort()).toEqual(Object.keys(copy.nl).sort());
    expect(Object.keys(copy.fr).sort()).toEqual(Object.keys(copy.en).sort());
    for (const text of [...Object.values(copy.nl), ...Object.values(copy.en)])
      expect(text.length).toBeGreaterThan(0);
  });
});

import { accessCopy } from "../src/components/access-copy";
import { attendanceCopy } from "../src/components/attendance-copy";
import { calendarCopy, kindLabels } from "../src/components/calendar-copy";
import {
  documentCopy,
  categoryLabels,
  documentStatuses,
} from "../src/components/documents-copy";
import { notificationCopy } from "../src/components/notifications-copy";
import { peopleCopy } from "../src/components/people-copy";
import {
  registrationCopy,
  statusLabels,
  typeLabels,
} from "../src/components/registrations-copy";
it("provides English labels for every existing module dictionary", () => {
  for (const map of [
    accessCopy,
    attendanceCopy,
    calendarCopy,
    kindLabels,
    documentCopy,
    categoryLabels,
    documentStatuses,
    notificationCopy,
    peopleCopy,
    registrationCopy,
    statusLabels,
    typeLabels,
  ])
    expect(Object.keys(map.en).sort()).toEqual(Object.keys(map.fr).sort());
});
