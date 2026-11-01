import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B8: « Notre ASBL est agréée » in Réglages › Club. On « non » nothing about
 * tax receipts shows; on « oui » (number and period) Finances gets its tab:
 * a donor, a gift, the national number, the receipt and its PDF. Axe and
 * 390 px.
 */
async function axe(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
const nn = (base: string) => base + String(97 - (Number(base) % 97)).padStart(2, "0");

test("tax receipts only for an approved club", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b8-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B8 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,address,company_number) VALUES('B8 club','club','Rue du Stade 1, 1300 Wavre','0412.345.670') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. « Non » by default: no tab, no page.
    await page.goto("/fr/funding");
    await expect(page.getByRole("navigation", { name: "Sections des finances" }).getByRole("link", { name: "Attestations fiscales" })).toHaveCount(0);
    await page.goto("/fr/settings/club");
    const card = page.locator("#settings-tax");
    await expect(card.getByRole("radio", { name: "Non" })).toBeChecked();
    await expect(card.getByLabel("Numéro d'agrément")).toHaveCount(0);
    await axe(page, "approval off");

    // 2. « Oui » asks the number and the period.
    await card.getByRole("radio", { name: "Oui" }).check();
    await card.getByLabel("Numéro d'agrément").fill("AG-2024-15");
    await card.getByLabel("Agréée du").fill("2024-01-01");
    await card.getByLabel("Agréée jusqu'au").fill("2029-12-31");
    await card.getByRole("button", { name: "Enregistrer" }).click();
    await expect(card.getByRole("status")).toHaveText("Enregistré.");
    expect((await db.query("SELECT tax_approved,tax_approval_number FROM organization WHERE id=$1", [club])).rows[0]).toEqual({ tax_approved: true, tax_approval_number: "AG-2024-15" });
    await axe(page, "approval on");

    // 3. The module: a donor, a gift of last year, the national number.
    await page.goto("/fr/funding");
    await page.getByRole("navigation", { name: "Sections des finances" }).getByRole("link", { name: "Attestations fiscales" }).click();
    await expect(page).toHaveURL(/\/fr\/funding\/tax$/);
    await page.getByRole("button", { name: "Ajouter un donateur", exact: true }).click();
    const donor = page.getByRole("dialog", { name: "Ajouter un donateur" });
    await donor.getByLabel("Nom", { exact: true }).fill("Marie Peeters");
    await donor.getByLabel("Rue et numéro").fill("Rue Haute 3");
    await donor.getByLabel("Code postal").fill("1300");
    await donor.getByLabel("Commune").fill("Wavre");
    await axe(page, "donor", "dialog[open]");
    await donor.getByRole("button", { name: "Enregistrer" }).click();
    await expect(donor).toHaveCount(0);
    await page.getByRole("button", { name: "Ajouter un don", exact: true }).click();
    const gift = page.getByRole("dialog", { name: "Ajouter un don" });
    await gift.getByRole("combobox", { name: "Donateur", exact: true }).selectOption({ label: "Marie Peeters" });
    await gift.getByLabel("Montant (€)").fill("45");
    await gift.getByRole("button", { name: "Enregistrer" }).click();
    await expect(gift).toHaveCount(0);
    const report = page.locator("#tax-report");
    await expect(report).toContainText("Marie Peeters");
    await page.getByRole("button", { name: "Numéro national de Marie Peeters" }).click();
    const national = page.getByRole("dialog", { name: "Numéro national de Marie Peeters" });
    await national.getByLabel("Numéro national").fill("85073003300");
    await national.getByRole("button", { name: "Enregistrer" }).click();
    await expect(national.getByRole("alert")).toContainText("n'est pas valide");
    await national.getByLabel("Numéro national").fill(nn("850730033"));
    await national.getByRole("button", { name: "Enregistrer" }).click();
    await expect(national).toHaveCount(0);
    await expect(page.locator("#tax-donors")).toContainText("Numéro national : Connu");
    await axe(page, "tax page");

    // 4. The receipt and its PDF.
    await page.getByRole("button", { name: "Émettre les attestations de l'année" }).click();
    const row = page.locator(".tax-receipts tbody tr").filter({ hasText: "Marie Peeters" });
    await expect(row).toContainText("45,00");
    const pdf = row.getByRole("link", { name: /^Ouvrir l'attestation/ });
    const response = await page.request.get((await pdf.getAttribute("href"))!);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await axe(page, "receipts");
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action='tax.national.set'", [club])).rows[0].n).toBe(1);
  } finally {
    await db.end();
  }
});
