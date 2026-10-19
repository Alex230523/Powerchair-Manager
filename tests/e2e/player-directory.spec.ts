import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
test("player listing, personal then sporting profile, former players and dedicated management screens", async ({
  page,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL }),
    origin = "http://127.0.0.1:3100";
  try {
    await db.query('DELETE FROM "rateLimit"');
    const signup = await page.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        email: `player-list-${Date.now()}@example.test`,
        name: "Directory president",
        password: "Test-fixture-password-2026!",
      },
    });
    expect(signup.status()).toBe(200);
    const user = (await signup.json()).user.id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [
      user,
    ]);
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Powerchair test','club') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, user],
    );
    const mandate = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id",
        [org, user],
      )
    ).rows[0].id;
    expect(
      (
        await page.request.post("/api/workspace", {
          headers: { origin },
          data: { action: "context", mandateId: mandate },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/fr/players");
    await page
      .getByRole("button", { name: "Ajouter un joueur", exact: true })
      .click();
    let modal = page.getByRole("dialog");
    await modal.getByLabel("Nom complet", { exact: true }).fill("Camille Test");
    await modal
      .getByLabel("Date de naissance", { exact: true })
      .fill("2001-02-03");
    await modal.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Camille Test", exact: true }),
    ).toBeVisible();
    modal = page.getByRole("dialog");
    await expect(
      modal.getByRole("heading", { name: "Informations personnelles" }),
    ).toBeVisible();
    await modal.getByLabel("Poste", { exact: true }).first().fill("Gardien");
    await modal.getByLabel("Numéro de maillot", { exact: true }).fill("7");
    await modal
      .getByRole("button", { name: "Enregistrer les informations de jeu" })
      .click();
    await expect(modal.getByRole("status")).toContainText(/enregistr/i);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: "test-results/player-profile.png" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: "Camille Test" }),
    ).toContainText("Gardien");
    await page.screenshot({ path: "test-results/player-list.png" });
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: "Gestion des inscriptions", exact: true }),
    ).toHaveAttribute("href", "/fr/registrations");
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: "Cotisations", exact: true }),
    ).toHaveAttribute("href", "/fr/dues");
    await page
      .getByRole("button", { name: "Vers les anciens joueurs", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmer le départ", exact: true })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "Camille Test" }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Anciens joueurs", exact: true })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "Camille Test" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Réintégrer", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirmer la réintégration", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Joueurs actuels", exact: true })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "Camille Test" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/player-mobile.png" });
    for (const [url, title] of [
      ["/en/coaches", "Coach management"],
      ["/fr/club/manage", "Gestion du club"],
      ["/nl/funding", "Financiering"],
    ]) {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: title, exact: true, level: 1 }),
      ).toBeVisible();
    }
    await page.goto("/en/players");
    await expect(
      page.getByRole("row").filter({ hasText: "Camille Test" }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  } finally {
    await db.end();
  }
});
