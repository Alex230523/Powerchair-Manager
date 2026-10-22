import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (N2): the federation defines an affiliation for chosen clubs and
 * one for all, the club sees what it owes, marks it « en ordre » with the
 * expense (and can undo), and « Statut du club » is ticked.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function signIn(page: Page, db: Pool, name: string, email: string, org: string, role: string) {
  await prepareSignIn(page, db, name, email, "Browser-test-passphrase-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
  const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
  const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
  await page.goto("/fr");
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
  return user as string;
}

test("federal and club affiliations, « en ordre » with the expense and undo", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  const club = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('N2 fédération','federation') RETURNING id")).rows[0].id;
    const clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('N2 Club A','club',$1) RETURNING id", [fed])).rows[0].id;
    await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('N2 Club B','club',$1)", [fed]);
    await signIn(page, db, "N2 fédé", `n2-fed-${stamp}@example.test`, fed, "federation_president");
    await page.setViewportSize({ width: 1280, height: 900 });
    const month = String(Number((await db.query("SELECT to_char(now() AT TIME ZONE 'Europe/Brussels','MM') AS m")).rows[0].m));

    // 1. The federation: Sportéa for club A only, BPCF for every club.
    await page.goto("/fr/federation/affiliations");
    await expect(page.getByRole("heading", { name: "Affiliations", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Partir de « Sportéa »" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Nom", { exact: true })).toHaveValue("Sportéa");
    await dialog.getByLabel("Montant (€)").fill("25");
    await dialog.getByLabel("Mois").first().selectOption(month);
    await dialog.getByRole("radio", { name: "Les clubs choisis" }).check();
    await dialog.getByRole("checkbox", { name: "N2 Club A" }).check();
    await axe(page, "fee dialog");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("#federation-fees")).toContainText("Sportéa");
    await page.getByRole("button", { name: "Partir de « Affiliation BPCF »" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Montant (€)").fill("150");
    await dialog.getByLabel("Mois").first().selectOption(month);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    const tracking = page.locator("#federation-tracking");
    await expect(tracking.getByRole("row").filter({ hasText: "N2 Club B" })).toContainText("Affiliation BPCF");
    await expect(tracking.getByRole("row").filter({ hasText: "N2 Club B" })).toHaveCount(1);
    await expect(tracking.getByRole("row").filter({ hasText: "N2 Club A" })).toHaveCount(2);
    await axe(page, "federation");

    // 2. The club: what it owes, « Marquer en ordre » with the expense, then « Annuler ».
    const clubPage = await club.newPage();
    await signIn(clubPage, db, "N2 président", `n2-club-${stamp}@example.test`, clubA, "club_president");
    await clubPage.setViewportSize({ width: 1280, height: 900 });
    await clubPage.goto("/fr/funding/affiliations");
    const row = clubPage.locator("#affiliation-dues").getByRole("row").filter({ hasText: "Affiliation BPCF" });
    await expect(row).toContainText("À payer");
    await expect(row).toContainText("150,00");
    await axe(clubPage, "club");
    await row.getByRole("button", { name: /^Marquer en ordre : Affiliation BPCF/ }).click();
    const mark = clubPage.getByRole("dialog");
    await expect(mark.getByRole("checkbox", { name: "Créer la dépense dans le grand livre" })).toBeChecked();
    await mark.getByRole("button", { name: "Marquer en ordre" }).click();
    await expect(row).toContainText("En ordre");
    const due = async () =>
      (await db.query("SELECT d.paid_on IS NOT NULL AS paid,t.category,t.cancelled_at IS NOT NULL AS cancelled FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id LEFT JOIN finance_transaction t ON t.id=d.transaction_id WHERE d.organization_id=$1 AND f.name='Affiliation BPCF'", [clubA])).rows[0];
    expect(await due()).toEqual({ paid: true, category: "affiliation", cancelled: false });
    // « Statut du club » is ticked.
    expect(
      (await db.query("SELECT count(*)::int AS n FROM club_obligation WHERE organization_id=$1 AND auto_source='affiliation'", [clubA])).rows[0].n,
    ).toBe(2);
    await clubPage.locator(".toast").getByRole("button", { name: "Annuler" }).click();
    await expect(clubPage.locator(".toast")).toContainText("C’est annulé.");
    await expect(row).toContainText("À payer");
    expect((await due()).paid).toBe(false);

    // 3. At 390 px nothing sticks out.
    await clubPage.setViewportSize({ width: 390, height: 844 });
    await clubPage.goto("/fr/funding/affiliations");
    await expect(clubPage.locator("#affiliation-dues")).toBeVisible();
    expect(await clubPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(clubPage, "club 390");
    await clubPage.screenshot({ path: "test-results/affiliations-390.png", fullPage: true });
  } finally {
    await club.close();
    await db.end();
  }
});
