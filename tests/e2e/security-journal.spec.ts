import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Security (07/11/2026), missing logging and alerting. The platform's owner
 * signs in (journaled), and on a phone (390 px) reads the security journal
 * of the console: the counts of the day, the alerts sent, each event with
 * its account or organisation and the start of its source's fingerprint.
 * A wrong scheduler secret, knocked for real, appears there. Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the owner reads the security journal, a wrong scheduler secret in it", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `owner-sec-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Alex Sécurité", email, "Browser-test-passphrase-2026!");
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query("INSERT INTO platform_operator(user_id,role) VALUES($1,'owner')", [user]);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    // The operator's sign-in is in the journal.
    await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM security_event WHERE kind='auth.operator_signin' AND actor_id=$1", [user])).rows[0].n).toBe(1);
    // The scheduler's door, knocked with a wrong secret (when the server has one).
    const knock = await page.request.post("/api/cron/mail", { headers: { authorization: "Bearer wrong-secret-of-the-test" } });
    if (knock.status() === 401) await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM security_event WHERE kind='cron.unauthorized'")).rows[0].n).toBeGreaterThan(0);
    await db.query("INSERT INTO security_event(kind,severity,source,details) VALUES('auth.lockout','warning','abcdef0123456789abcdef0123456789','{\"failures\":10}')");
    await db.query("INSERT INTO security_alert(rule,hour,events,recipients) VALUES('lockouts',date_trunc('hour',now())-interval '1 hour',3,1) ON CONFLICT DO NOTHING");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/console");
    await page.getByRole("tab", { name: "Supervision" }).click();
    const card = page.locator("#console-security");
    await expect(card.getByRole("heading", { name: "Journal de sécurité" })).toBeVisible();
    await expect(card.getByText("Adresse bloquée après 10 mots de passe faux").first()).toBeVisible();
    await expect(card.getByText("Connexion d'un opérateur").first()).toBeVisible();
    await expect(card.getByText("abcdef01").first()).toBeVisible();
    await expect(card.getByText(/Adresses bloquées · 3 événement\(s\), 1 destinataire\(s\)/).first()).toBeVisible();
    // The address itself is never shown: only the start of its fingerprint.
    await expect(card.getByText("abcdef0123456789abcdef0123456789")).toHaveCount(0);
    await axe(page, "security journal");
  } finally {
    await db.end();
  }
});
