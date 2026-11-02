import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (N1): one « Finances » page in tabs with their own addresses, an
 * operation added with its receipt, deleted then brought back, a deletion
 * refused in a year the assembly approved, a bank statement filed with the
 * gap to the platform's cash.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("finance tabs, add and delete an operation with undo, bank statements", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `n1-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "N1 trésorier", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('N1 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    // A line of a year the assembly approved.
    await db.query(
      "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,'2025-03-10','Achat 2025','out','equipment',3000,$2)",
      [club, user],
    );
    await db.query("INSERT INTO annual_accounts(organization_id,year_start,year_end,status,approved_on,snapshot,created_by) VALUES($1,'2025-01-01','2025-12-31','approved','2026-03-01','{}',$2)", [club, user]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The menu says « Finances » with two entries; the page has its tabs, each with an address.
    await page.goto("/fr/funding");
    await expect(page.locator("nav summary").filter({ hasText: "Finances" })).toHaveCount(1);
    const tabs = page.getByRole("navigation", { name: "Sections des finances" });
    await expect(tabs.getByRole("link")).toHaveText(["Vue d'ensemble", "Opérations", "Budget", "Fonds réservés", "Affiliations", "Relevés de compte", "Comptes annuels et rapports"]);
    await expect(tabs.getByRole("link", { name: "Vue d'ensemble" })).toHaveAttribute("aria-current", "page");
    await axe(page, "overview");
    // 9: grants and sponsors are in the menu; their page has no row of finance tabs.
    await tabs.getByRole("link", { name: "Fonds réservés" }).click();
    await expect(page).toHaveURL(/\/fr\/funding\/reserved$/);
    await page.goto("/fr/funding/grants-sponsors");
    await expect(page.getByRole("navigation", { name: "Sections des finances" })).toHaveCount(0);

    // 2. Add an expense with its receipt.
    await page.goto("/fr/funding/operations");
    await page.getByRole("button", { name: "Ajouter une opération" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: "Dépense" })).toBeChecked();
    await dialog.getByLabel("Libellé").fill("Ballons de match");
    await dialog.getByLabel("Montant").fill("84.50");
    await dialog.getByLabel("Catégorie").selectOption("equipment");
    await dialog.getByLabel("Justificatif (photo ou PDF, facultatif)").setInputFiles({ name: "facture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nfacture") });
    await axe(page, "add operation");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    const line = page.locator(".ledger tbody tr").filter({ hasText: "Ballons de match" });
    await expect(line).toContainText("84,50");
    await expect(line.getByRole("link", { name: "facture.pdf" })).toBeVisible();

    // 3. Delete it with a reason, then « Annuler ».
    await line.getByRole("button", { name: "Supprimer l'opération : Ballons de match" }).click();
    await page.getByRole("dialog").getByLabel("Motif").fill("Saisie en double");
    await axe(page, "delete");
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(line).toHaveCount(0);
    const trace = (await db.query("SELECT details FROM audit_log WHERE organization_id=$1 AND action='finance.delete'", [club])).rows[0].details;
    expect(trace).toMatchObject({ amountCents: 8450, reason: "Saisie en double" });
    await page.locator(".toast").getByRole("button", { name: "Annuler" }).click();
    await expect(page.locator(".toast")).toContainText("C’est annulé.");
    await expect(line).toContainText("84,50");

    // 4. A line of an approved year cannot be deleted.
    await page.locator(".ledger tbody tr").filter({ hasText: "Achat 2025" }).getByRole("button", { name: "Supprimer l'opération : Achat 2025" }).click();
    await page.getByRole("dialog").getByLabel("Motif").fill("Erreur");
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("approuvé par l'assemblée générale");
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

    // 5. A bank statement in CSV: the balance is read, the gap shown.
    await page.goto("/fr/funding/statements");
    await page.getByRole("button", { name: "Déposer un relevé" }).first().click();
    const up = page.getByRole("dialog");
    await up.getByLabel("Fichier du relevé").setInputFiles({ name: "octobre.csv", mimeType: "text/csv", buffer: Buffer.from("Date;Montant;Solde\n01/10;-30,00;970,00\n") });
    await axe(page, "statement dialog");
    await up.getByRole("button", { name: "Déposer un relevé" }).click();
    const row = page.locator(".statements-table tbody tr").filter({ hasText: "octobre.csv" });
    await expect(row).toContainText("970,00");
    await expect(row).toContainText("lu dans le CSV");
    await expect(row.locator(".badge")).toBeVisible();
    await axe(page, "statements");

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/fr/funding", "/fr/funding/operations", "/fr/funding/statements"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
    }
    await axe(page, "statements 390");
    await page.screenshot({ path: "test-results/finances-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
