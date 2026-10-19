import { describe, expect, it } from "vitest";
import {
  clubCommand,
  federationCommand,
  licenseNumber,
} from "../src/domains/federation/schema";
import { guestRequestSchema } from "../src/domains/registrations/guest";
import { licensesCopy } from "../src/components/licenses-copy";
import { registrationExtras } from "../src/components/registrations-copy";

const keys = (o: object) => Object.keys(o).sort();
const id = () => crypto.randomUUID();

describe("licences and classifications", () => {
  it("numbers licences per season", () => {
    expect(licenseNumber("2026-27", 7)).toBe("2026-0007");
    expect(licenseNumber("2027-28", 1234)).toBe("2027-1234");
  });
  it("validates requests and decisions", () => {
    expect(
      clubCommand.safeParse({
        action: "requestLicenses",
        season: "2026",
        profileIds: [id()],
      }).success,
    ).toBe(false);
    expect(
      clubCommand.safeParse({
        action: "requestLicenses",
        season: "2026-27",
        profileIds: [],
      }).success,
    ).toBe(false);
    expect(
      federationCommand.safeParse({
        action: "decideClassification",
        profileId: id(),
        decision: "validated",
        classification: "PF3",
        validUntil: null,
        note: "",
      }).success,
    ).toBe(false);
    expect(
      federationCommand.safeParse({
        action: "suspendLicense",
        id: id(),
        note: "non",
      }).success,
    ).toBe(false);
  });
});

describe("registration by email link", () => {
  it("needs a name, a valid address and an empty honeypot", () => {
    const base = {
      formId: id(),
      name: "Nadia Test",
      email: "nadia@example.test",
      locale: "fr",
    };
    expect(guestRequestSchema.safeParse(base).success).toBe(true);
    expect(
      guestRequestSchema.safeParse({ ...base, email: "nadia" }).success,
    ).toBe(false);
    expect(
      guestRequestSchema.safeParse({ ...base, website: "spam" }).success,
    ).toBe(false);
  });
});

describe("copy", () => {
  it("keeps the three languages aligned", () => {
    for (const copy of [licensesCopy, registrationExtras]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
    }
  });
});
