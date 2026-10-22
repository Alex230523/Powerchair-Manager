import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * A2: « Subsides & sponsors ». The old addresses land on the right view;
 * a grant with its period, the opening of its call and two instalments;
 * a sponsor not contacted for 90 days, contacted today; « Tâches (n) »
 * opens the to-do on that sponsor. Axe and 390 px.
 */
async function axe(page: Page, label: string, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("grants and sponsors in one page, two views", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `a2-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "A2 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('A2 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Alex Président' FROM person WHERE user_id=$2", [club, user]);
    await db.query(
      "INSERT INTO partner(organization_id,name,kind,status,amount_cents,starts_on,last_contact_on,signed_on,created_by) VALUES($1,'Garage Dupont','sponsor','active',150000,CURRENT_DATE-200,CURRENT_DATE-120,CURRENT_DATE-200,$2)",
      [club, user],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The old address lands on the « Subsides » view; one menu entry.
    await page.goto("/fr/funding/grants");
    await expect(page).toHaveURL(/\/fr\/funding\/grants-sponsors\?vue=subsides/);
    await expect(page.getByRole("heading", { name: "Subsides & sponsors", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Vues de la page" }).getByRole("link", { name: "Subsides" })).toHaveAttribute("aria-current", "page");

    // 2. A grant with its period and the opening of the call, already granted.
    await page.getByRole("button", { name: "Nouvelle demande", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Nouvelle demande" });
    await form.getByLabel(/^Organisme/).fill("Région");
    await form.getByLabel("Appel ou programme", { exact: true }).fill("Sport adapté");
    await form.getByLabel("Montant demandé (€)", { exact: true }).fill("5000");
    await form.getByLabel("Montant accordé (€)", { exact: true }).fill("5000");
    await form.getByLabel("Statut", { exact: true }).selectOption("granted");
    await form.getByLabel("Ouverture de l'appel", { exact: true }).fill("2026-09-01");
    await form.getByLabel("Début de la période couverte", { exact: true }).fill("2027-01-01");
    await form.getByLabel("Fin de la période couverte", { exact: true }).fill("2027-12-31");
    await form.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(form).toHaveCount(0);
    const row = page.locator(".grants-table tbody tr").filter({ hasText: "Région · Sport adapté" });
    await expect(row).toContainText("Oui");
    await expect(row).toContainText("2027");
    await axe(page, "grants view");

    // 3. Two instalments: one grant, paid.
    await row.getByRole("button", { name: /^Région · Sport adapté/ }).click();
    const sheet = page.getByRole("dialog", { name: "Région · Sport adapté" });
    for (const [i, amount] of ["3000", "2000"].entries()) {
      await sheet.getByLabel("Montant (€)", { exact: true }).fill(amount);
      await sheet.getByRole("button", { name: "Ajouter la tranche" }).click();
      await expect(sheet.locator(".payment-lines li")).toHaveCount(i + 1);
    }
    await expect(sheet.locator(".payment-lines li")).toHaveCount(2);
    await expect(sheet.getByText(/Total reçu : 5\s?000,00/)).toBeVisible();
    await axe(page, "grant instalments", "dialog[open]");
    await sheet.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(page.locator(".grants-table tbody tr").filter({ hasText: "Région · Sport adapté" })).toContainText("Versé");

    // 4. Sponsoring: a sponsor without contact for 90 days, contacted today.
    await page.getByRole("navigation", { name: "Vues de la page" }).getByRole("link", { name: "Sponsoring" }).click();
    await expect(page).toHaveURL(/vue=sponsoring/);
    const sponsor = page.locator(".partners-table tbody tr").filter({ hasText: "Garage Dupont" });
    await expect(sponsor).toContainText("Sans contact depuis 90 jours");
    await axe(page, "sponsoring view");
    await sponsor.getByRole("button", { name: /^Garage Dupont/ }).click();
    const partner = page.getByRole("dialog", { name: "Garage Dupont" });
    await partner.getByRole("button", { name: "Contact pris aujourd'hui avec Garage Dupont" }).click();
    await expect(partner.getByRole("button", { name: "Contact pris aujourd'hui avec Garage Dupont" })).toBeDisabled();
    await partner.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(sponsor).not.toContainText("Sans contact depuis 90 jours");

    // 5. « Tâches (n) » opens the to-do on this sponsor.
    await sponsor.getByRole("link", { name: /^Tâches de Garage Dupont/ }).click();
    await expect(page).toHaveURL(/\/fr\/tasks\?partner=/);
    await expect(page.getByText("Voir toutes les tâches")).toBeVisible();

    // 6. The old sponsors' address, at 390 px.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/funding/partners");
    await expect(page).toHaveURL(/vue=sponsoring/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "sponsoring 390");
  } finally {
    await db.end();
  }
});
