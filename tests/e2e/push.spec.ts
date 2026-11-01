import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B4: « Notifications sur ce téléphone » in Settings › Notifications, on a
 * phone (390 px): the guided activation with the iPhone steps, and the
 * topics that reach the phone for the club, saved at once. Axe.
 */
test("phone notifications: activation guide and topics per club", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b4-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B4 Parent", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('B4 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/settings/notifications");
    const card = page.getByRole("region", { name: "Notifications sur ce téléphone" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Sur l'écran d'accueil");
    await expect(card).toContainText("Aucun appareil pour l'instant.");
    const dues = card.getByRole("group", { name: "B4 club" }).getByRole("checkbox", { name: "Cotisations" });
    await expect(dues).toBeChecked();
    await dues.click();
    await expect(card.getByRole("status")).toHaveText("Enregistré.");
    await expect(dues).not.toBeChecked();
    expect((await db.query("SELECT enabled FROM push_preference WHERE organization_id=$1 AND user_id=$2 AND topic='dues'", [club, user])).rows[0].enabled).toBe(false);
    const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
    expect(violations).toEqual([]);
  } finally {
    await db.end();
  }
});
