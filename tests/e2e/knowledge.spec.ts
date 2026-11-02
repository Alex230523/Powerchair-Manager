import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Knowledge centre on a phone (390 px): the federation adds and publishes
 * the drafts; a lexicon term is reached with the keyboard and shows its
 * definition (Escape hides it); the quiz explains each answer and passes;
 * the search finds a rule; the lexicon, gallery, catalogue and how-to pages
 * open; the tips can be switched off in Mon compte. Axe on each state.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("the knowledge centre: tips, quiz, search and its pages", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `knowledge-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Fédération Savoir", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération savoir','federation') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [fed, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id;
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/guide");
    await page.getByRole("button", { name: "Ajouter les brouillons proposés" }).click();
    await expect(page.getByRole("link", { name: /Qui fait quoi/ })).toBeVisible();
    // Everything published straight away for the test.
    await db.query("UPDATE guide_chapter SET status='published',published_version=current_version,updated_on=CURRENT_DATE WHERE federation_id=$1", [fed]);

    await page.goto("/fr/guide/game");
    const tip = page.locator(".tip-term").first();
    await tip.focus();
    await expect(page.getByRole("tooltip").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip").first()).toBeHidden();
    await axe(page, "chapter with tips");
    await noSideScroll(page);

    // The quiz: each answer explained, a pass at the end.
    const quiz = page.locator(".guide-quiz");
    const answers = ["Quatre, dont un gardien", "10 km/h", "Un 2 contre 1", "Avec le fauteuil", "Deux"];
    for (const [i, a] of answers.entries()) {
      await quiz.getByLabel(a, { exact: true }).check();
      await quiz.getByRole("button", { name: "Valider" }).click();
      await expect(quiz.getByText("Bonne réponse.")).toBeVisible();
      await quiz.getByRole("button", { name: i < 4 ? "Question suivante" : "Voir le résultat" }).click();
    }
    await expect(quiz.getByText("Réussi : 5 bonnes réponses sur 5.")).toBeVisible();
    await axe(page, "quiz");

    await page.goto("/fr/guide");
    await page.getByLabel("Rechercher dans le guide").fill("ramming");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByRole("link", { name: "Le powerchair football en une page" }).first()).toBeVisible();
    await axe(page, "search");
    for (const [path, heading] of [
      ["/fr/guide/lexicon", "Lexique"],
      ["/fr/guide/gallery", "Galerie terrain et équipement"],
      ["/fr/guide/chairs", "Catalogue des fauteuils"],
      ["/fr/guide/help", "Mode d'emploi"],
      ["/fr/guide/help/take-attendance", "Faire l'appel"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await axe(page, path);
      await noSideScroll(page);
    }

    // The tips switched off in Mon compte.
    await page.goto("/fr/settings/account");
    await page.getByLabel(/Souligner les mots du lexique/).uncheck();
    await page.goto("/fr/guide/game");
    await expect(page.locator(".tip-term")).toHaveCount(0);
    await page.screenshot({ path: "test-results/knowledge-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
