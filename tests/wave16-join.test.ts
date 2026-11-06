import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { joinCopy } from "../src/components/join-copy";
import { accessCopy, errors } from "../src/components/access-copy";

/** Wave 16 (I1): visitors see no menu, and accounts are created on invitation only. */
describe("visitor and sign-up on invitation", () => {
  it("guards the public sign-up route with the invitation of the same email", () => {
    const route = readFileSync("src/app/api/auth/[...all]/route.ts", "utf8");
    // Security (06/11/2026): the path is read the way the auth router reads it (tests/auth-safety.test.ts).
    expect(route).toContain("isSignUp(path)");
    expect(route).toContain("signupAllowed(getDb(), request.headers.get(invitationHeader), await bodyEmail(request))");
    expect(route).toContain("status: 403");
    expect(readFileSync("src/domains/access/signup.ts", "utf8")).toContain("lower(email)=lower($2) AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL");
  });
  it("renders the visitor without any menu, from the server's knowledge of the session", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain("if (!signedIn || signedOut) return <GuestShell locale={locale}>{children}</GuestShell>;");
    const guest = shell.slice(shell.indexOf("function GuestShell"), shell.indexOf("export function AppShell"));
    for (const absent of ["sidebar", "bottom-nav", "ScopeBar", "bell"]) expect(guest).not.toContain(absent);
    expect(readFileSync("src/app/[locale]/layout.tsx", "utf8")).toContain("signedIn={signedIn}");
  });
  it("offers sign-up only with an invitation, and a « Pas encore de compte ? » link otherwise", () => {
    const access = readFileSync("src/components/access.tsx", "utf8");
    expect(access).toContain('(invitationToken ? (["login", "signup", "forgot"] as const) : (["login", "forgot"] as const))');
    expect(access).toContain("{ headers: { [invitationHeader]: invitationToken } }");
    expect(access).toContain("href={`/${locale}/join`}");
    for (const l of ["fr", "nl", "en"] as const) {
      expect(accessCopy[l].noAccount).toBeTruthy();
      expect(errors.INVITATION_REQUIRED[l]).toBeTruthy();
    }
  });
  it("explains how to join, in three languages, with a configurable address", () => {
    for (const l of ["nl", "en"] as const) expect(Object.keys(joinCopy[l]).sort()).toEqual(Object.keys(joinCopy.fr).sort());
    expect(JSON.stringify(joinCopy)).not.toMatch(/[–—]/);
    expect(readFileSync(".env.example", "utf8")).toContain("PFM_CONTACT_EMAIL=");
  });
});
