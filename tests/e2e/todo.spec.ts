import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * A1: the central to-do. Every category is there, the grant's deadline came
 * by itself with its link; a quick add in a category; the task's window
 * with a sub-task and a comment; « En retard »; the yearly model; Ctrl+K
 * opens a new task. Axe and 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the club's to-do, by category", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `a1-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "A1 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('A1 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO grant_application(organization_id,funder,deadline_on,created_by) VALUES($1,'Province',CURRENT_DATE+12,$2)", [club, user]);
    await db.query("INSERT INTO funding_task(organization_id,kind,category,title,due_on,created_by) VALUES($1,'other','admin','Assurance en retard',CURRENT_DATE-3,$2)", [club, user]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);

    // 1. Every category; the grant's deadline came by itself, with its link.
    await page.goto("/fr/tasks");
    for (const name of ["Affiliation et fédération", "Administratif et légal", "Subsides", "Sponsors", "Collecte de fonds", "Matériel", "Événements", "Autre"])
      await expect(page.locator("summary").filter({ hasText: name })).toBeVisible();
    await expect(page.getByText("Déposer le dossier de subside : Province")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir : Province" })).toHaveAttribute("href", /\/fr\/funding\/grants-sponsors\?vue=subsides&grant=/);
    await expect(page.locator("summary").filter({ hasText: "Administratif et légal" })).toContainText("en retard");
    await axe(page, "tasks");

    // 2. Quick add in « Matériel ».
    const equipment = page.locator("details").filter({ has: page.locator("summary", { hasText: "Matériel" }) });
    await equipment.locator("summary").click();
    await equipment.getByLabel("Nouvelle tâche dans Matériel").fill("Gonfler les pneus");
    await equipment.getByRole("button", { name: "Ajouter une tâche dans Matériel" }).click();
    await expect(equipment.getByText("Gonfler les pneus")).toBeVisible();

    // 3. Its window: a sub-task and a comment.
    await page.getByRole("button", { name: "Détails de la tâche : Gonfler les pneus" }).click();
    const dialog = page.getByRole("dialog", { name: "Gonfler les pneus" });
    await dialog.getByLabel("Ajouter une sous-tâche").fill("Trouver la pompe");
    await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(dialog.getByRole("checkbox", { name: "Trouver la pompe" })).toBeVisible();
    await dialog.getByLabel("Votre commentaire").fill("La pompe est au local.");
    await dialog.getByRole("button", { name: "Publier" }).click();
    await expect(dialog.getByText("La pompe est au local.")).toBeVisible();
    await axe(page, "task window");
    await dialog.getByRole("button", { name: "Fermer" }).click();

    // 4. « En retard » keeps only the late one; it is ticked.
    await page.getByRole("button", { name: "En retard" }).click();
    await expect(page.getByText("Assurance en retard")).toBeVisible();
    await expect(page.getByText("Gonfler les pneus")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Marquer comme faite : Assurance en retard" }).check();
    await expect(page.getByText("Assurance en retard")).toHaveCount(0);

    // 5. The yearly model, checked then applied.
    await page.getByRole("button", { name: "Année administrative de l'ASBL" }).click();
    const year = page.getByRole("dialog", { name: "Année administrative de l'ASBL" });
    await expect(year.getByRole("group", { name: "Confirmation annuelle du registre UBO" })).toBeVisible();
    await axe(page, "year model");
    await year.getByRole("button", { name: "Appliquer" }).click();
    await page.getByRole("button", { name: "Toutes" }).click();
    await expect(page.getByText("Confirmation annuelle du registre UBO")).toBeVisible();

    // 6. Ctrl+K: « Ajouter une tâche » opens the window.
    await page.keyboard.press("Control+k");
    await page.getByRole("option", { name: /Ajouter une tâche/ }).click();
    await expect(page.getByRole("dialog", { name: "Nouvelle tâche" })).toBeVisible();
    await page.getByRole("dialog", { name: "Nouvelle tâche" }).getByRole("button", { name: "Annuler" }).click();

    // 7. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/tasks");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "tasks 390");
  } finally {
    await db.end();
  }
});
