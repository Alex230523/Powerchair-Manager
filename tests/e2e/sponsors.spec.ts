import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C1): a package with three conditions, a partner on it, a condition
 * ticked in the side sheet, the dates in the calendar layer and on the home,
 * the tasks page and the agreement.
 */
async function axe(page: Page, label: string, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  const violations = (await (within ? builder.include(within) : builder).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("sponsor packages, conditions, partner sheet, calendar layer, home and agreement", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `sponsors-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Sponsors president", email, "Browser-test-passphrase-2026!");
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
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Sponsors club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. A package with three conditions.
    await page.goto("/fr/funding/partners");
    await page.getByRole("tab", { name: /^Formules/ }).click();
    await page.getByRole("button", { name: "Nouvelle formule", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Nouvelle formule" });
    await form.getByLabel("Nom de la formule", { exact: true }).fill("Coéquipier");
    await form.getByLabel("Montant (€)", { exact: true }).fill("1000");
    for (const [i, [title, offset]] of [
      ["Logo sur les maillots", "0"],
      ["Publications sur les réseaux", "0"],
      ["Invitation au tournoi", ""],
    ].entries()) {
      await form.getByRole("button", { name: "Ajouter une condition" }).click();
      const row = form.locator(".condition-editor li").nth(i);
      await row.getByLabel(`Condition ${i + 1}`, { exact: true }).fill(title);
      if (offset) await row.getByLabel("Délai après la signature (jours)", { exact: true }).fill(offset);
    }
    await axe(page, "package form", "dialog[open]");
    await form.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(form).toHaveCount(0);
    const card = page.locator(".package-card").filter({ hasText: "Coéquipier" });
    await expect(card.locator(".package-conditions li")).toHaveCount(3);
    await axe(page, "packages tab");

    // 2. A partner on this package, signed today.
    await page.getByRole("tab", { name: /^Partenaires/ }).click();
    await page.getByRole("button", { name: "Nouveau partenaire", exact: true }).click();
    const partner = page.getByRole("dialog", { name: "Nouveau partenaire" });
    await partner.getByLabel("Nom", { exact: true }).fill("Garage Dupont");
    const packageSelect = partner.getByRole("combobox", { name: /^Formule/ });
    await packageSelect.selectOption((await packageSelect.locator("option", { hasText: "Coéquipier" }).getAttribute("value")) ?? "");
    await expect(partner.getByLabel("Montant par an (€)", { exact: true })).toHaveValue("1000");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    await partner.getByLabel("Signé le", { exact: true }).fill(today);
    await partner.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(partner).toHaveCount(0);
    const row = page.locator(".partners-table tbody tr").filter({ hasText: "Garage Dupont" });
    await expect(row).toContainText("Coéquipier");
    await expect(row).toContainText("0 sur 3");
    await axe(page, "partners tab");

    // 3. The sheet: tick a condition.
    await row.getByRole("button", { name: /^Garage Dupont/ }).click();
    const sheet = page.getByRole("dialog", { name: "Garage Dupont" });
    await expect(sheet.locator(".task-list li")).toHaveCount(3);
    await sheet.getByRole("checkbox", { name: "Logo sur les maillots" }).check();
    await expect(sheet.getByText("1 sur 3")).toBeVisible();
    await axe(page, "partner sheet", "dialog[open]");
    await sheet.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(row).toContainText("1 sur 3");

    // 4. The calendar layer shows the open condition due today.
    await page.goto("/fr/calendar");
    const layer = page.getByRole("checkbox", { name: /Échéances/ });
    await expect(layer).toBeVisible();
    await layer.check();
    await expect(page.locator(".board-deadline").filter({ hasText: "Garage Dupont · Publications sur les réseaux" })).toBeVisible();
    await axe(page, "calendar layer");

    // 5. The home: a to-do and the date in the coming events.
    await page.goto("/fr");
    await expect(page.locator(".todo-card").filter({ hasText: "Sponsors et subsides" })).toBeVisible();
    await expect(page.locator(".agenda").getByText(/Garage Dupont/).first()).toBeVisible();
    await page.locator(".todo-card").filter({ hasText: "Sponsors et subsides" }).click();
    await expect(page).toHaveURL("/fr/tasks");
    // Two conditions are still open: one due today, one without a date.
    // A1: the sponsors' category of the central to-do.
    await expect(page.locator("#tasks-sponsors .task-page li")).toHaveCount(2);
    await axe(page, "tasks page");

    // 6. The agreement.
    await page.goto("/fr/funding/partners");
    await page.locator(".partners-table tbody tr").filter({ hasText: "Garage Dupont" }).getByRole("button", { name: /^Garage Dupont/ }).click();
    await page.getByRole("dialog", { name: "Garage Dupont" }).getByRole("link", { name: "Générer la convention" }).click();
    await expect(page.getByRole("heading", { name: "Convention de partenariat", level: 1 })).toBeVisible();
    await expect(page.locator(".agreement-doc ol li")).toHaveCount(3);
    await axe(page, "agreement");
    // 390 px: the partners table scrolls inside its card.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/funding/partners");
    await expect(page.locator(".partners-table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await db.end();
  }
});
