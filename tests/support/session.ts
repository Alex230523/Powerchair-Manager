import type { Page } from "@playwright/test";
import type { Pool } from "pg";
import { createAuth } from "../../src/lib/auth";

/**
 * Accounts are created on invitation only since wave 16 (I1): the public
 * sign-up route refuses anyone without one. Tests create their accounts on
 * the server, as the platform does for a federation's new club, then sign
 * in like anybody.
 */
export async function createAccount(db: Pool, name: string, email: string, password: string) {
  return (await createAuth(db).api.signUpEmail({ body: { name, email, password } })).user;
}

const labels = {
  fr: { email: "Adresse email", password: "Mot de passe (12 caractères minimum)" },
  nl: { email: "E-mailadres", password: "Wachtwoord (minimaal 12 tekens)" },
  en: { email: "Email address", password: "Password (at least 12 characters)" },
};

/** Creates the account, opens the sign-in card (back to « Mon espace » afterwards) and fills it; the test clicks « Se connecter ». */
export async function prepareSignIn(page: Page, db: Pool, name: string, email: string, password: string, locale: "fr" | "nl" | "en" = "fr") {
  await createAccount(db, name, email, password);
  // Many sign-ins in a row across the suite: the e2e database starts each one with a clean rate window.
  await db.query('DELETE FROM "rateLimit"');
  await page.goto(`/${locale}/access?next=${encodeURIComponent(`/${locale}/access`)}`);
  await page.getByLabel(labels[locale].email, { exact: true }).fill(email);
  await page.getByLabel(labels[locale].password, { exact: true }).fill(password);
}

/** Former `request.post("/api/auth/sign-up/email")`: creates the account, then signs this page's context in; answers like a sign-in (with `user`). */
type SignedUser = { id: string; email: string; name: string; emailVerified: boolean };
/** What a sign-in answers, typed for the tests (`.user.id`). */
export type SignUpAnswer = {
  status(): number;
  ok(): boolean;
  text(): Promise<string>;
  json(): Promise<{ user: SignedUser }>;
};
export async function signUpVia(
  target: Page,
  db: Pool,
  options: { headers?: Record<string, string>; data: { name: string; email: string; password: string } },
): Promise<SignUpAnswer> {
  await createAccount(db, options.data.name, options.data.email, options.data.password);
  await db.query('DELETE FROM "rateLimit"');
  return target.request.post("/api/auth/sign-in/email", { headers: options.headers, data: { email: options.data.email, password: options.data.password } }) as Promise<SignUpAnswer>;
}
