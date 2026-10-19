import { afterEach, it, expect, vi } from "vitest";
import { mfaRequired, mfaSatisfied } from "../src/lib/security-policy";
import { commandSchema } from "../src/domains/attendance/schema";
afterEach(() => vi.unstubAllEnvs());
it("requires MFA by default and for unrecognized override values", () => {
  for (const value of ["", "false", "TRUE"]) {
    vi.stubEnv("PFM_MFA_SUSPENDED", value);
    expect(mfaRequired()).toBe(true);
    expect(mfaSatisfied(false)).toBe(false);
    expect(mfaSatisfied(true)).toBe(true);
  }
});
it("temporarily suspends MFA without changing enrollment and restores strict enforcement", () => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "true");
  expect(mfaRequired()).toBe(false);
  expect(mfaSatisfied(false)).toBe(true);
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
  expect(mfaSatisfied(false)).toBe(false);
});
it("rejects duplicate invitees, unbounded lists and malformed deadlines", () => {
  const id = "4abe9298-004d-4211-91df-104e8db75696",
    base = {
      action: "invite",
      eventId: id,
      expectedVersion: null,
      profiles: [id],
      deadline: "2027-01-01T12:00:00Z",
      minimum: 0,
    };
  expect(commandSchema.safeParse(base).success).toBe(true);
  expect(commandSchema.safeParse({ ...base, profiles: [id, id] }).success).toBe(
    false,
  );
  expect(
    commandSchema.safeParse({ ...base, deadline: "2027-01-01T12:00" }).success,
  ).toBe(false);
});
it("keeps response and observed status commands distinct", () => {
  const id = "4abe9298-004d-4211-91df-104e8db75696";
  expect(
    commandSchema.safeParse({
      action: "respond",
      id,
      expectedVersion: 1,
      response: "late",
      comment: "",
    }).success,
  ).toBe(false);
  expect(
    commandSchema.safeParse({
      action: "mark",
      id,
      expectedVersion: 1,
      actual: "uncertain",
      reason: "",
    }).success,
  ).toBe(false);
});
it("preserves explicit sensitive-document authorization while MFA is suspended", async () => {
  const { Pool } = await import("pg");
  const { docAccess } = await import("../src/domains/documents/access");
  const db = new Pool();
  const actor = {
    id: "mandate",
    organization_id: "club",
    user_id: "admin",
    role: "club_president" as const,
    grants: [] as string[],
    valid_from: "2020-01-01",
    valid_until: null,
    revoked_at: null,
    twoFactorEnabled: false,
  };
  const doc = {
    id: "doc",
    organization_id: "club",
    profile_id: null,
    sensitive: true,
    status: "valid",
    current_version_id: null,
    expires_on: null,
    season_id: "season",
    name: "Private",
    version: 1,
    category: "fitness",
  };
  try {
    vi.stubEnv("PFM_MFA_SUSPENDED", "true");
    expect(await docAccess(db, actor, doc)).toBe(false);
    expect(
      await docAccess(db, { ...actor, grants: ["documents.sensitive"] }, doc),
    ).toBe(true);
    vi.stubEnv("PFM_MFA_SUSPENDED", "false");
    expect(
      await docAccess(db, { ...actor, grants: ["documents.sensitive"] }, doc),
    ).toBe(false);
  } finally {
    await db.end();
  }
});
