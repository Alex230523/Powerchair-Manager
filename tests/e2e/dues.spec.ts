import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
test("saved profiles, English preferences, sidebar and a 250 EUR debt in four instalments", async ({
  page,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `dues-${Date.now()}@example.test`;
  try {
    await page.goto("/fr/access");
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await page
      .getByLabel("Nom complet", { exact: true })
      .fill("Dues test president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill("Browser-test-passphrase-2026!");
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
    const user = (
      await db.query('SELECT id FROM "user" WHERE email=$1', [email])
    ).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [
      user,
    ]);
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Dues browser club','club') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, user],
    );
    const admin = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id",
        [org, user],
      )
    ).rows[0].id;
    const player = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'player') RETURNING id",
        [org, user],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30')",
      [org],
    );
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,'Browser player','2000-01-01' FROM person WHERE user_id=$2",
      [org, user],
    );
    await page.reload();
    await Promise.all([
      page.waitForEvent("load"),
      page.getByLabel("Profil actif", { exact: true }).selectOption(admin),
    ]);
    await expect(
      page.getByRole("heading", { name: "Enregistrer un profil", exact: true }),
    ).toBeVisible();
    const profileForm = page
      .locator("form")
      .filter({ has: page.getByLabel("Nom du profil", { exact: true }) });
    await profileForm
      .getByLabel("Nom du profil", { exact: true })
      .fill("Club — Président");
    await profileForm.getByLabel("Utiliser à la connexion").check();
    await profileForm
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(page.locator("header option:checked")).toHaveText(
      "Club — Président",
    );
    const pref = page
      .locator("form")
      .filter({ has: page.locator('select[name="locale"]') });
    await pref.locator('select[name="locale"]').selectOption("en");
    await pref
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(page).toHaveURL("/en/access");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("header")).not.toContainText("Language");
    await page
      .locator("nav")
      .getByRole("link", { name: "Dues", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Dues", exact: true }),
    ).toBeVisible();
    const rate = page
      .locator("form")
      .filter({ has: page.getByLabel("Rate category", { exact: true }) });
    await rate
      .getByLabel("Rate category", { exact: true })
      .fill("Player membership");
    await rate.getByLabel("Amount (€)", { exact: true }).fill("250");
    await rate.getByLabel("First due date", { exact: true }).fill("2026-10-31");
    await rate
      .getByRole("button", { name: "Create rate", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    const issue = page.locator("form").filter({
      has: page.getByLabel("Discount / exemption (€)", { exact: true }),
    });
    await issue
      .getByRole("combobox", { name: "Rate", exact: true })
      .selectOption({ label: "Player membership · 2026-27 · €250.00" });
    await issue.getByLabel("Number of instalments", { exact: true }).fill("4");
    await issue
      .getByRole("button", { name: "Issue dues", exact: true })
      .click();
    const summary = page
      .locator("main details>summary")
      .filter({ hasText: "Browser player" });
    await expect(summary).toContainText("€250.00");
    await summary.click();
    await expect(page.locator("main tbody tr")).toHaveCount(4);
    expect(
      await page.locator("main tbody tr td:last-child").allTextContents(),
    ).toEqual(["€62.50", "€62.50", "€62.50", "€62.50"]);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/dues-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/dues-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await Promise.all([
      page.waitForEvent("load"),
      page.getByLabel("Active profile", { exact: true }).selectOption(player),
    ]);
    await expect(page).toHaveURL("/en/access");
    await expect(
      page.getByRole("heading", {
        name: "Members and access profiles",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .locator("nav")
      .getByRole("link", { name: "Dues", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Receivables", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Rates", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator("main details>summary")
        .filter({ hasText: "Browser player" }),
    ).toBeVisible();
  } finally {
    await db.end();
  }
});
