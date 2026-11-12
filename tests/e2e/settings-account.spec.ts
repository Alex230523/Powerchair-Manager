import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 12/11/2026, on a phone (390 px). A club's president finds the platform's
 * subscription in Réglages (no more in the menu; the old address leads
 * there) and cannot delete an account that leaves the club without a
 * president; the second president asks for the deletion of theirs, sees the
 * date 30 days on, and cancels it. Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("subscription in the settings, and deleting one's account after 30 days", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `delete-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Dora Départ", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id", [`Club Dora ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // The subscription: in the settings, out of the menu; the old address leads there.
    await expect(page.locator('nav a[href="/fr/club/billing"]')).toHaveCount(0);
    await page.goto("/fr/club/billing");
    await expect(page).toHaveURL(/\/fr\/settings\/subscription$/);
    await expect(page.getByRole("heading", { level: 1, name: "Abonnement à la plateforme" })).toBeVisible();
    await axe(page, "subscription in settings");

    // The only president: hand over first.
    await page.goto("/fr/settings/account");
    const card = page.locator(".danger-zone");
    await expect(card.getByRole("heading", { name: "Supprimer mon compte" })).toBeVisible();
    await expect(card).toContainText(`Club Dora ${stamp}`);
    await expect(card.getByRole("link", { name: "Transmettre la présidence" })).toBeVisible();
    await axe(page, "sole president");

    // A second president: now the account can go, after 30 days.
    const other = (await db.query("INSERT INTO \"user\"(id,name,email,\"emailVerified\") VALUES($1,'Autre présidente',$2,true) RETURNING id", [`u-${stamp}`, `other-${stamp}@example.test`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, other]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president')", [club, other]);
    await page.reload();
    await card.getByLabel("Tapez votre adresse e-mail pour confirmer").fill(email);
    await card.getByRole("button", { name: "Supprimer mon compte dans 30 jours" }).click();
    await expect(card.getByText(/Suppression prévue le/)).toBeVisible();
    expect((await db.query("SELECT (due_on-(now() AT TIME ZONE 'Europe/Brussels')::date) AS d FROM account_deletion WHERE user_id=$1", [user])).rows[0].d).toBe(30);
    await axe(page, "deletion planned");
    await card.getByRole("button", { name: "Annuler la suppression" }).click();
    await expect(card.getByRole("button", { name: "Supprimer mon compte dans 30 jours" })).toBeVisible();
    expect((await db.query("SELECT cancelled_at IS NOT NULL AS c FROM account_deletion WHERE user_id=$1", [user])).rows[0].c).toBe(true);
  } finally {
    await db.end();
  }
});
