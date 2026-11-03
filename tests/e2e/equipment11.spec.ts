import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 11: the equipment page: two groups of tabs at 390 px, the model to choose, a loan from the row and « Nouveau prêt », a category typed on the fly. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("equipment: tabs, models, loans and categories", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `equipment11-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Matériel", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club Matériel','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Vieux fauteuil','available','club')", [club]);
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Martin','2010-01-01','{player}')", [club, person]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);

    // 1. Two groups of tabs, readable on a phone.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/fr/equipment");
    await expect(page.getByRole("tablist", { name: "Ce que nous possédons" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Où et chez qui" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await axe(page, "equipment at 390 px");
    await page.setViewportSize({ width: 1280, height: 900 });

    // 2. A chair without a model: badge and « Choisir le modèle »; « Prêter » from its row.
    await expect(page.getByText("Modèle à choisir")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choisir le modèle de Vieux fauteuil" })).toBeVisible();
    await page.getByRole("button", { name: "Prêter Vieux fauteuil" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Fauteuil")).toHaveValue(/.+/);
    await dialog.getByLabel("Joueur").selectOption({ label: "Léa Martin" });
    await dialog.getByLabel("Au").fill(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    await dialog.getByRole("button", { name: "Prêter maintenant" }).click();

    // 3. Small material with a category typed on the fly, then « Nouveau prêt » of 5 balls.
    await page.getByRole("tab", { name: "Petit matériel" }).click();
    await page.getByRole("button", { name: "Ajouter du matériel" }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Ballons de match");
    const category = page.getByRole("combobox", { name: "Catégorie" });
    await category.fill("Signalétique");
    await page.getByRole("option", { name: "+ Créer « Signalétique »" }).click();
    await category.fill("Ballons");
    await page.getByRole("option", { name: "Ballons", exact: true }).click();
    await page.getByLabel("Quantité").fill("8");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { name: "Catégories du matériel" })).toBeVisible();
    await expect(page.getByText("Signalétique").first()).toBeVisible();
    await page.getByRole("tab", { name: "Prêts entre clubs" }).click();
    await expect(page.getByRole("cell", { name: "Léa Martin" })).toBeVisible();
    await page.getByRole("button", { name: "Nouveau prêt" }).click();
    const loan = page.getByRole("dialog");
    await loan.getByLabel("Du matériel").check();
    await loan.getByLabel("Matériel", { exact: true }).selectOption({ index: 1 });
    await loan.getByLabel("Quantité").fill("5");
    await loan.getByLabel("Joueur").selectOption({ label: "Léa Martin" });
    await loan.getByLabel("Au").fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    await loan.getByRole("button", { name: "Prêter maintenant" }).click();
    await expect(page.getByRole("rowheader", { name: "5 × Ballons de match" })).toBeVisible();
    await axe(page, "loans");
  } finally {
    await db.end();
  }
});
