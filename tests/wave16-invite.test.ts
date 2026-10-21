import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { welcomeCopy } from "../src/components/welcome-copy";
import { inviteCopy, isMinor } from "../src/components/invite-copy";
import { builtin, validateTemplate } from "../src/domains/notifications/templates";
import { welcomeCommand } from "../src/domains/access/invite";
import { errors } from "../src/components/access-copy";
import { peopleErrors } from "../src/components/people-copy";

/** Wave 16 (I2): invitations sent from a file and the guided account creation. */
describe("invitations and guided creation", () => {
  it("says who invites whom, as what, and where to click, in three languages", () => {
    for (const l of ["fr", "nl", "en"] as const) {
      const t = builtin.invitation[l];
      for (const v of ["{name}", "{organization}", "{role}", "{team}", "{url}"]) expect(t.body).toContain(v);
      expect(() => validateTemplate("invitation", t)).not.toThrow();
    }
    expect(readFileSync("src/domains/notifications/events.ts", "utf8")).toContain(`"/" + locale + "/welcome/" + token`);
  });
  it("keeps the same keys in every language, without dashes", () => {
    for (const copy of [welcomeCopy, inviteCopy]) {
      const keys = Object.keys(copy.fr).sort();
      expect(Object.keys(copy.nl).sort()).toEqual(keys);
      expect(Object.keys(copy.en).sort()).toEqual(keys);
      expect(JSON.stringify(copy)).not.toMatch(/[–—]/);
    }
    for (const l of ["fr", "nl", "en"] as const) {
      expect(welcomeCopy[l].steps).toHaveLength(4);
      expect(errors.ACCOUNT_EXISTS[l]).toBeTruthy();
      expect(peopleErrors.GUARDIAN_REQUIRED[l]).toBeTruthy();
      expect(inviteCopy[l].batch(18)).toContain("18");
    }
    expect(inviteCopy.fr.batch(18)).toBe("18 invitations vont partir.");
  });
  it("sends a minor's invitation to the parent", () => {
    expect(isMinor("2015-06-01", "2026-10-21")).toBe(true);
    expect(isMinor("2008-10-21", "2026-10-21")).toBe(false);
    expect(isMinor("2008-10-22", "2026-10-21")).toBe(true);
    expect(isMinor("", "2026-10-21")).toBe(false);
  });
  it("asks for a strong password and the privacy agreement", () => {
    const base = { action: "create", firstName: "A", lastName: "B", birthDate: null, phone: "", locale: "fr", privacy: true, classification: null, chair: null, care: "" };
    expect(welcomeCommand.safeParse({ ...base, password: "court" }).success).toBe(false);
    expect(welcomeCommand.safeParse({ ...base, password: "un-mot-de-passe-solide", privacy: false }).success).toBe(false);
    expect(welcomeCommand.safeParse({ ...base, password: "un-mot-de-passe-solide" }).success).toBe(true);
    expect(welcomeCommand.safeParse({ action: "dispute", note: "Je suis le parent" }).success).toBe(true);
  });
  it("creates the account on the server and signs the person in, never through the public sign-up", () => {
    const route = readFileSync("src/app/api/welcome/[token]/route.ts", "utf8");
    expect(route).toContain("origin(request)");
    expect(route).toContain("auth.api.signUpEmail");
    expect(route).toContain('if (view.existing === "password") throw new AccessError("ACCOUNT_EXISTS", 409);');
    expect(route).toContain("getSetCookie()");
    const page = readFileSync("src/app/[locale]/welcome/[token]/page.tsx", "utf8");
    expect(page).toContain("/^[a-f0-9]{64}$/.test(token)");
  });
});
