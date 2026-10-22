import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (Q1): equipment. The chair sheet opens from its name in a window
 * (and as a full page); a model proposed by a club then validated by the
 * federation; storage by place; a loan between two clubs (request,
 * acceptance, hand-over, return) with the borrower's badge; axe and 390 px.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
}

test("equipment: sheet in a window, model validated, storage place, loan between clubs", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `q1-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Q1 matériel", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('Q1 fédération','federation') RETURNING id")).rows[0].id;
    const clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Q1 club A','club',$1) RETURNING id", [federation])).rows[0].id;
    const clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Q1 club B','club',$1) RETURNING id", [federation])).rows[0].id;
    const mandate: Record<string, string> = {};
    for (const [key, org, role] of [
      ["F", federation, "federation_president"],
      ["A", clubA, "club_president"],
      ["B", clubB, "club_president"],
    ] as const) {
      await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
      mandate[key] = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
    }
    const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    await page.goto("/fr");
    await switchTo(page, mandate.A);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. Club A adds a chair with a new model: it waits for the federation.
    await page.goto("/fr/equipment");
    await page.getByRole("button", { name: "Ajouter un fauteuil" }).first().click();
    const add = page.getByRole("dialog", { name: "Ajouter un fauteuil" });
    await add.getByLabel("Nom ou numéro").fill("Rouge");
    await add.getByLabel(/^Modèle/).selectOption({ label: "Proposer un nouveau modèle…" });
    await add.getByLabel("Marque du nouveau modèle").fill("Acme");
    await add.getByLabel("Nom du nouveau modèle").fill("Viper");
    await add.getByLabel(/^Date d'achat/).fill("2024-03-01");
    await add.getByLabel("Prêtable").check();
    await axe(page, "new chair");
    await add.getByRole("button", { name: "Enregistrer" }).click();
    const sheet = page.getByRole("dialog", { name: "Rouge" });
    await expect(sheet.locator(".chair-key")).toContainText("Acme · Viper");
    await expect(sheet.locator(".chair-key")).toContainText("En attente de validation");
    await expect(sheet.locator(".chair-key")).toContainText("1 mars 2024");
    await axe(page, "chair sheet");
    await sheet.getByRole("button", { name: "Fermer" }).click();

    // 2. A storage place, chosen in the sheet's « Modifier ».
    await page.getByRole("tab", { name: "Lieux de stockage" }).click();
    await page.getByRole("button", { name: "Ajouter un lieu" }).click();
    await page.getByLabel("Nom du lieu").fill("Local d'Uccle");
    await page.getByLabel("Accès (clés, horaires)").fill("Clé chez le coach");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { name: "Ce qui est stocké à Local d'Uccle" })).toBeVisible();
    await page.getByRole("tab", { name: "Fauteuils" }).click();
    await page.getByRole("button", { name: "Rouge", exact: true }).click();
    await sheet.getByRole("tab", { name: "Modifier" }).click();
    await sheet.getByLabel("Lieu de stockage").selectOption({ label: "Local d'Uccle" });
    await sheet.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();
    await sheet.getByRole("button", { name: "Fermer" }).click();
    await page.getByRole("tab", { name: "Lieux de stockage" }).click();
    await expect(page.locator(".storage-places li").filter({ hasText: "Local d'Uccle" })).toContainText("Rouge");
    await axe(page, "storage places");

    // 3. The federation validates the model.
    await switchTo(page, mandate.F);
    await page.goto("/fr/equipment");
    await page.getByRole("tab", { name: "Modèles de fauteuils" }).click();
    await page.getByRole("button", { name: "Valider : Acme · Viper" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Viper" })).toContainText("Validé");
    await axe(page, "federation models");

    // 4. Club B asks for the chair.
    await switchTo(page, mandate.B);
    await page.goto("/fr/equipment");
    await page.getByRole("tab", { name: "Prêts entre clubs" }).click();
    const offer = page.getByRole("row").filter({ hasText: "Rouge" });
    await expect(offer).toContainText("Q1 club A");
    await expect(offer).toContainText("Local d'Uccle");
    await offer.getByRole("button", { name: "Demander un prêt : Rouge" }).click();
    const ask = page.getByRole("form", { name: "Demander un prêt : Rouge" });
    await ask.getByLabel("Du").fill(iso(1));
    await ask.getByLabel("Au").fill(iso(10));
    await ask.getByLabel("Message (facultatif)").fill("Pour le tournoi de Namur");
    await ask.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByRole("region", { name: "Mes emprunts et demandes envoyées" }).first().getByRole("row").filter({ hasText: "Rouge" })).toContainText("Demandé");
    await axe(page, "lending");

    // 5. Club A accepts and hands it over.
    await switchTo(page, mandate.A);
    await page.goto("/fr/equipment");
    await page.getByRole("tab", { name: "Prêts entre clubs" }).click();
    const request = page.getByRole("row").filter({ hasText: "Pour le tournoi de Namur" });
    await request.getByRole("button", { name: /^Accepter \/ Refuser/ }).click();
    await request.getByRole("button", { name: /^Accepter :/ }).click();
    await expect(request).toContainText("Accepté");
    await request.getByRole("button", { name: /^Remettre le fauteuil/ }).click();
    await request.getByLabel("État au départ").fill("Batteries chargées");
    await request.getByRole("button", { name: /^Remettre le fauteuil/ }).click();
    await expect(request).toContainText("En cours");

    // 6. Club B sees the borrowed chair with its badge.
    await switchTo(page, mandate.B);
    await page.goto("/fr/equipment");
    await expect(page.getByRole("region", { name: "Fauteuils empruntés" })).toContainText(/Prêté par Q1 club A jusqu'au/);

    // 7. Club A notes the return; the sheet opens as a full page.
    await switchTo(page, mandate.A);
    await page.goto("/fr/equipment");
    await page.getByRole("tab", { name: "Prêts entre clubs" }).click();
    await request.getByRole("button", { name: /^Noter le retour/ }).click();
    await request.getByLabel("État au retour").fill("Rien à signaler");
    await request.getByRole("button", { name: /^Noter le retour/ }).click();
    await expect(request).toContainText("Rendu");
    await page.getByRole("tab", { name: "Fauteuils" }).click();
    await page.getByRole("button", { name: "Rouge", exact: true }).click();
    await sheet.getByRole("tab", { name: "Historique" }).click();
    await expect(sheet).toContainText("Rendu");
    await sheet.getByRole("button", { name: "Agrandir la fiche de Rouge en pleine page" }).click();
    await expect(page).toHaveURL(/\/fr\/equipment\/[0-9a-f-]{36}$/);
    await expect(page.locator("main h1")).toHaveText("Rouge");
    await axe(page, "chair page");

    // 8. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/equipment");
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "equipment 390");
  } finally {
    await db.end();
  }
});
