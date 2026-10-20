import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
// Menu groups unfold on click; open the one holding the link if it is closed.
async function openMenuGroup(page: Page, name: string) {
  const group = page
    .locator("nav details")
    .filter({ has: page.locator("summary", { hasText: name }) });
  if (!(await group.evaluate((d) => (d as HTMLDetailsElement).open)))
    await group.locator("summary").click();
}
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
    await openMenuGroup(page, "Club finances");
    await page
      .locator("nav")
      .getByRole("link", { name: "Dues", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Dues", exact: true }),
    ).toBeVisible();
    // Rates and receivables are created from dialogs (wave 10).
    await page.getByRole("button", { name: "New rate", exact: true }).click();
    const rate = page.getByRole("dialog", { name: "New rate" });
    await rate
      .getByLabel("Rate category", { exact: true })
      .fill("Player membership");
    await rate.getByLabel("Amount (€)", { exact: true }).fill("250");
    await rate.getByLabel("First due date", { exact: true }).fill("2026-10-31");
    await rate
      .getByRole("button", { name: "Create rate", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(rate).toHaveCount(0);
    await page.getByRole("button", { name: "Issue dues", exact: true }).click();
    const issue = page.getByRole("dialog", { name: "Issue dues" });
    await issue
      .getByRole("combobox", { name: "Rate", exact: true })
      .selectOption({ label: "Player membership · 2026-27 · €250.00" });
    await issue.getByLabel("Number of instalments", { exact: true }).fill("4");
    await issue
      .getByRole("button", { name: "Issue", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    // One line per player in the table, with the amount due and the next instalment.
    const row = page
      .locator("main .dues-table tbody tr")
      .filter({ hasText: "Browser player" });
    await expect(row).toContainText("€250.00");
    await expect(row).toContainText("€62.50");
    await row.getByRole("button", { name: /^Details/ }).click();
    const detail = page.getByRole("dialog", { name: /Browser player/ });
    await expect(detail.locator("tbody tr")).toHaveCount(4);
    expect(
      await detail.locator("tbody tr td:nth-child(3)").allTextContents(),
    ).toEqual(["€62.50", "€62.50", "€62.50", "€62.50"]);
    await detail.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    // The tick records a payment of the next instalment in the ledger.
    await row.getByRole("button", { name: /^Collect : Browser player/ }).click();
    const pay = page.getByRole("dialog", { name: /Record a payment/ });
    await pay.getByRole("button", { name: "Collect", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(row).toContainText("€187.50");
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
    // A player only has "My space" in the menu: calendar, file, documents, dues.
    await openMenuGroup(page, "My space");
    await expect(
      page.locator("nav").getByRole("link", { name: "Players", exact: true }),
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
      page.locator("main .dues-table tbody tr").filter({ hasText: "Browser player" }),
    ).toBeVisible();
  } finally {
    await db.end();
  }
});
