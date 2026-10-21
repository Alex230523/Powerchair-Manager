import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { signUpVia } from "../support/session";
const origin = "http://127.0.0.1:3100";
function section(page: Page, title: string) {
  return page.locator("main details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: new RegExp("^" + title + "$") }),
  });
}
test("persistent club directory, seasons, teams, families, archives and CSV", async ({
  page,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use npm run test:e2e:db");
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now(),
    email = `directory-${stamp}@example.test`,
    password = "Directory-fixture-only-2026!";
  try {
    // Reset only the isolated E2E database counters between independent fixtures.
    await db.query('DELETE FROM "rateLimit"');
    const signup = await signUpVia(page, db, {
      headers: { origin },
      data: { email, name: "Directory Admin", password },
    });
    expect(signup.status(), await signup.text()).toBe(200);
    const user = (await signup.json()).user;
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id",
        ["Directory Club"],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, user.id],
    );
    const mandate = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id",
        [org, user.id],
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
    for (const locale of ["fr", "nl"]) {
      await page.goto(`/${locale}/club`);
      await expect(page.getByRole("table")).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.setViewportSize({ width: 320, height: 720 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.goto("/fr/club");
    const season = section(page, "Créer une saison");
    await season.locator("summary").click();
    await season.getByLabel("Nom complet", { exact: true }).fill("2026–2027");
    await season
      .getByLabel("Date de début", { exact: true })
      .fill("2026-01-01");
    await season.getByLabel("Date de fin", { exact: true }).fill("2027-12-31");
    await season.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(page.locator(".records")).toContainText(["2026–2027"]);
    const team = section(page, "Créer une équipe");
    await team.locator("summary").click();
    await team
      .getByLabel("Nom de l’équipe", { exact: true })
      .fill("Les Tigres");
    await team.getByLabel("Catégorie", { exact: true }).fill("Senior");
    await team
      .getByLabel("Lieu habituel", { exact: true })
      .fill("Salle du club");
    await team.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(
      page.locator(".records strong").filter({ hasText: /^Les Tigres$/ }),
    ).toBeVisible();
    const add = section(page, "Ajouter une personne");
    await add.locator("summary").click();
    for (const [name, birth] of [
      ["Parent Test", "1980-01-01"],
      ["Joueur Test", "2015-01-01"],
    ]) {
      await add.getByLabel("Nom complet", { exact: true }).fill(name);
      await add.getByLabel("Date de naissance", { exact: true }).fill(birth);
      await add
        .getByLabel("Email de contact", { exact: true })
        .fill(
          name === "Parent Test"
            ? "parent@example.test"
            : "player@example.test",
        );
      await add
        .getByLabel("Téléphone", { exact: true })
        .fill("+32 400 00 00 00");
      await add.getByRole("button", { name: "Créer", exact: true }).click();
      await expect(
        page.getByRole("rowheader", { name, exact: true }),
      ).toBeVisible();
    }
    const assign = section(page, "Affecter une personne");
    await assign.locator("summary").click();
    await assign
      .getByRole("combobox", { name: "Personne", exact: true })
      .selectOption({ label: "Joueur Test" });
    await assign
      .getByLabel("Poste / mission", { exact: true })
      .fill("Attaquant");
    await assign
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    const family = section(page, "Enregistrer le lien");
    await family.locator("summary").click();
    await family
      .getByRole("combobox", { name: "Représentant / aidant", exact: true })
      .selectOption({ label: "Parent Test" });
    await family
      .getByRole("combobox", { name: "Personne accompagnée", exact: true })
      .selectOption({ label: "Joueur Test" });
    await family
      .getByRole("combobox", { name: "Nature du lien", exact: true })
      .selectOption("legal_verified");
    await family
      .getByLabel("Autoriser la consultation de la fiche", { exact: true })
      .check();
    await family
      .getByLabel("Autoriser la modification des coordonnées", { exact: true })
      .check();
    await family
      .getByLabel(
        "Référence de l’autorisation vérifiée (sans donnée médicale)",
        { exact: true },
      )
      .fill("Autorisation contrôlée par le club");
    await family
      .getByRole("button", { name: "Enregistrer le lien", exact: true })
      .click();
    await expect(
      page
        .locator("#families .records li")
        .filter({ hasText: "Parent Test → Joueur Test" }),
    ).toBeVisible();
    const profile = page.locator("section.card").filter({
      has: page.getByRole("heading", {
        name: "Fiche de la personne · Joueur Test",
        exact: true,
      }),
    });
    await expect(
      profile.getByText("Attaquant", { exact: false }),
    ).toBeVisible();
    await profile
      .getByLabel("Téléphone", { exact: true })
      .fill("0470 00 00 00");
    await profile
      .getByRole("button", { name: "Enregistrer", exact: true })
      .first()
      .click();
    await page.reload();
    await page
      .getByRole("button", {
        name: "Ouvrir la fiche : Joueur Test",
        exact: true,
      })
      .click();
    await expect(profile.getByLabel("Téléphone", { exact: true })).toHaveValue(
      "0470 00 00 00",
    );
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Exporter le résultat (CSV)", exact: true })
      .click();
    const download = await downloadEvent;
    expect(await readFile((await download.path())!, "utf8")).toContain(
      "Joueur Test",
    );
    await profile
      .getByRole("button", { name: "Archiver", exact: true })
      .click();
    await profile
      .getByRole("button", { name: "Archiver", exact: true })
      .click();
    await expect(
      page.getByRole("rowheader", { name: "Joueur Test", exact: true }),
    ).toHaveCount(0);
    const filter = page.locator("form.filters");
    await filter
      .getByRole("combobox", { name: "Statut", exact: true })
      .selectOption("archived");
    await filter.getByRole("button", { name: "Filtrer", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Ouvrir la fiche : Joueur Test",
        exact: true,
      })
      .click();
    await expect(
      profile.getByText("Attaquant", { exact: false }),
    ).toBeVisible();
    await profile
      .getByRole("button", { name: "Réactiver", exact: true })
      .click();
    await profile
      .getByRole("button", { name: "Réactiver", exact: true })
      .click();
    await filter
      .getByRole("combobox", { name: "Statut", exact: true })
      .selectOption("active");
    await filter.getByRole("button", { name: "Filtrer", exact: true }).click();
    await expect(
      page.getByRole("rowheader", { name: "Joueur Test", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/club-directory.png",
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const stale = await page.request.post("/api/people", {
      headers: { origin },
      data: {
        action: "createPerson",
        organizationId: "00000000-0000-4000-8000-000000000001",
        fullName: "Wrong Organization",
        birthDate: null,
        email: "",
        phone: "",
        joinedOn: "2026-01-01",
      },
    });
    expect(stale.status()).toBe(409);
  } finally {
    await db.end();
  }
});
