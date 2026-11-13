import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 12/11/2026, the task board on the real server. A president adds two tasks
 * in « Matériel », drags the second above the first (a coloured line shows
 * where it lands), moves it back with the handle's « Descendre », gives one
 * to a coach and lists its material from the row, creates a category of the
 * club's own, and applies a ready-made list. At 390 px nothing sticks out.
 * Axe on the way.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the task board: drag and drop, people in charge, material, a category, a ready-made list", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(150000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `board-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "Bea Tableau", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id", [`Club tableau ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles,status) VALUES($1,(SELECT id FROM person WHERE user_id=$2),'Coach Léo','{coach}','active')", [club, user]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/fr/tasks");
    const equipment = page.locator("details").filter({ has: page.locator("summary", { hasText: "Matériel" }) });
    await equipment.locator(":scope > summary").click();
    for (const title of ["Gonfler les pneus", "Acheter des batteries"]) {
      await equipment.getByLabel("Nouvelle tâche dans Matériel").fill(title);
      await equipment.getByRole("button", { name: "Ajouter une tâche dans Matériel" }).click();
      await expect(equipment.getByText(title)).toBeVisible();
    }
    const rows = equipment.locator("li.task-row");
    await expect(rows).toHaveCount(2);
    await axe(page, "board");

    // Drag « Acheter des batteries » above « Gonfler les pneus »: the line shows, the order is kept.
    const first = rows.filter({ hasText: "Gonfler les pneus" });
    const second = rows.filter({ hasText: "Acheter des batteries" });
    await second.dragTo(first, { targetPosition: { x: 40, y: 4 } });
    await expect(rows.first()).toContainText("Acheter des batteries");
    await expect.poll(async () => (await db.query("SELECT title FROM task WHERE organization_id=$1 AND category='equipment' ORDER BY board_position", [club])).rows.map((r) => r.title)).toEqual(["Acheter des batteries", "Gonfler les pneus"]);
    // Without a mouse: the handle's menu moves it back down.
    await rows.first().getByRole("button", { name: "Déplacer : Acheter des batteries" }).click();
    await rows.first().getByRole("button", { name: "Descendre" }).click();
    await expect(rows.first()).toContainText("Gonfler les pneus");

    // People in charge and material, from the row.
    await rows.filter({ hasText: "Gonfler les pneus" }).getByRole("button", { name: "Responsables : Gonfler les pneus" }).click();
    const who = page.getByRole("dialog", { name: "Qui s'en charge ?" });
    await who.getByLabel("Coach Léo").check();
    await axe(page, "assign window");
    await who.getByRole("button", { name: "Enregistrer" }).click();
    await expect(rows.filter({ hasText: "Gonfler les pneus" })).toContainText("Coach Léo");
    await rows.filter({ hasText: "Gonfler les pneus" }).getByRole("button", { name: "Matériel : Gonfler les pneus" }).click();
    const kit = page.getByRole("dialog", { name: "Matériel à prévoir" });
    await kit.getByLabel("Un élément (ballons, batteries, trousse de secours…)").fill("Pompe");
    await kit.getByRole("button", { name: "Ajouter" }).click();
    await axe(page, "material window");
    await kit.getByRole("button", { name: "Enregistrer" }).click();
    await expect(rows.filter({ hasText: "Gonfler les pneus" })).toContainText("Pompe");

    // A category of the club's own.
    await page.getByRole("button", { name: "Nouvelle catégorie" }).click();
    await page.getByRole("dialog").getByLabel("Nom de la catégorie").fill("Buvette");
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("summary").filter({ hasText: "Buvette" })).toBeVisible();

    // A ready-made list.
    await page.getByRole("button", { name: "Depuis un modèle" }).click();
    const tpl = page.getByRole("dialog", { name: "Depuis un modèle" });
    await tpl.getByLabel("Modèle").selectOption({ label: "Match à domicile" });
    await expect(tpl.getByRole("group", { name: /Confirmer les arbitres/ })).toBeVisible();
    await tpl.getByRole("button", { name: "Créer les tâches" }).click();
    await expect(page.getByText("Confirmer les arbitres")).toBeVisible();

    // At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/tasks");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "board 390");
  } finally {
    await db.end();
  }
});
