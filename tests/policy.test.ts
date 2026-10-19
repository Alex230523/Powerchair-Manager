import { describe, it, expect } from "vitest";
import {
  can,
  isCurrent,
  permissions,
  roleAllowed,
  roles,
  type Mandate,
} from "../src/domains/access/policy";
const now = new Date("2026-10-18T12:00:00Z");
const mandate: Mandate = {
  id: "role-a",
  user_id: "person",
  organization_id: "club-a",
  role: "coach",
  grants: ["members.read"],
  valid_from: "2026-01-01",
  valid_until: null,
  revoked_at: null,
};
describe("mandate authorization policy", () => {
  it("denies foreign organizations, revoked, future and expired mandates", () => {
    expect(can(mandate, "club-b", "members.read", now)).toBe(false);
    for (const change of [
      { revoked_at: now },
      { valid_from: "2027-01-01" },
      { valid_until: now },
    ])
      expect(isCurrent({ ...mandate, ...change }, now)).toBe(false);
  });
  it("does not inherit administrative permission through arbitrary grants", () => {
    expect(permissions("coach", ["mandates.manage"])).toEqual([
      "organization.read",
    ]);
    expect(can(mandate, "club-a", "members.read", now)).toBe(true);
    expect(can(mandate, "club-a", "mandates.manage", now)).toBe(false);
  });
  it("maintains exactly seven compatible roles", () => {
    expect(roles).toHaveLength(7);
    for (const role of roles)
      expect(
        Number(roleAllowed(role, "club")) +
          Number(roleAllowed(role, "federation")),
      ).toBe(1);
    expect(roleAllowed("federation_president", "club")).toBe(false);
  });
});
