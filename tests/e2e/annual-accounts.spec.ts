import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C12): the annual accounts from the finance page: the draft from
 * the ledger, a debt entered by hand, a suggested commitment, verified then
 * approved and frozen, the printed version, the financial year in settings.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("annual accounts: draft, manual line, verified, approved, printed; financial year in settings", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `accounts-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Accounts president", email, "Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind,company_number,address) VALUES('Accounts club','club','0987.654.321','Avenue du Sport 2, 5000 Namur') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const last = String(new Date().getUTCFullYear() - 1);
    for (const [day, direction, category, cents] of [
      [`${last}-02-01`, "in", "dues", 50000],
      [`${last}-03-01`, "in", "sponsor", 120000],
      [`${last}-04-01`, "out", "equipment", 30000],
    ] as const)
      await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,$2,'Opération',$3,$4,$5,$6)", [club, day, direction, category, cents, user]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. From the finance page to the draft of last year.
    await page.goto("/fr/funding");
    await page.getByRole("navigation", { name: "Sections des finances" }).getByRole("link", { name: "Comptes annuels et rapports", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/funding\/annual-accounts$/);
    await expect(page.locator(".accounts-banner")).toContainText("Projet généré depuis la plateforme");
    const statement = page.locator("#accounts-statement");
    await expect(statement.getByRole("row", { name: /^Cotisations/ })).toContainText("500,00");
    await expect(statement.getByRole("row", { name: /^Résultat de l’exercice/ })).toContainText(/1.400,00/);
    await expect(page.getByRole("combobox", { name: /^Exercice/ })).toHaveValue(`${last}-01-01`);
    await axe(page, "accounts draft");

    // 2. A debt entered by hand and a commitment.
    await page.getByRole("button", { name: "Ajouter une ligne" }).click();
    const line = page.locator(".accounts-lines li").first();
    await line.getByLabel("Libellé", { exact: true }).fill("Facture de la salle de décembre");
    await line.getByLabel("Montant (€)", { exact: true }).fill("250");
    await page.getByRole("textbox", { name: "Droits et engagements importants" }).fill("Fauteuil prêté par la ligue.");
    await page.getByRole("button", { name: "Enregistrer le projet" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();
    await expect(page.getByRole("region", { name: /^État du patrimoine/ }).getByRole("row", { name: /^Total des dettes/ })).toContainText("250,00");

    // 3. Verified, then approved by the assembly: the version is frozen.
    await page.getByLabel("Nom de la personne qui a vérifié", { exact: true }).fill("Claire Dubois");
    await page.getByRole("button", { name: "Marquer comme vérifié" }).click();
    await expect(page.locator(".accounts-bar")).toContainText("Vérifié");
    await page.getByRole("button", { name: "Approuvé par l’AG" }).click();
    await expect(page.locator(".accounts-bar")).toContainText("Approuvé par l’AG");
    await expect(page.locator(".accounts-bar")).toContainText("Version figée");
    await expect(page.getByRole("button", { name: "Marquer comme déposé" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Exporter en Excel" })).toHaveAttribute("href", `/api/accounts/export?year=${last}-01-01&locale=fr`);
    const exported = await page.request.get(`/api/accounts/export?year=${last}-01-01&locale=fr`);
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-type"]).toContain("spreadsheetml");
    await axe(page, "accounts approved");

    // 4. Printing: the club's letterhead and the signatures.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".report-letterhead")).toContainText("0987.654.321");
    await expect(page.locator(".accounts-signatures")).toBeVisible();
    await expect(page.locator(".accounts-bar")).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    // 5. The financial year in Settings > Money.
    await page.goto("/fr/settings/money");
    const fiscal = page.getByRole("region", { name: "Début de l’exercice comptable" });
    await expect(fiscal.getByRole("radio", { name: "1er janvier (année civile)" })).toBeChecked();
    await fiscal.getByRole("radio", { name: "1er juillet (comme la saison)" }).check();
    await expect(fiscal.getByRole("status")).toHaveText("Enregistré.");
    expect((await db.query("SELECT fiscal_year_start FROM organization WHERE id=$1", [club])).rows[0].fiscal_year_start).toBe("07-01");
    await axe(page, "settings money");
    // 390 px: the statement fits.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/funding/annual-accounts");
    await expect(page.locator("#accounts-statement")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await db.end();
  }
});
