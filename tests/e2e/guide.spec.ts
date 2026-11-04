import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Guide du powerchair football on a phone (390 px): the federation adds the
 * drafts and publishes « Le jeu en une page »; its figures carry their text
 * alternative; the print view hides the tools; a club writes its note
 * « Chez nous » and ticks a chair « Conforme pour un match ». Axe on each
 * state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("the game guide, from the federation's drafts to a club's chair", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `guide-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidence Guide", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération guide','federation') RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club guide','club',$1) RETURNING id", [fed])).rows[0].id as string;
    for (const org of [fed, club]) await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
    const fedMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id;
    const clubMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name) VALUES($1,'Fauteuil bleu') RETURNING id", [club])).rows[0].id as string;
    const context = (mandateId: string) =>
      page.evaluate(async (id) => {
        await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
      }, mandateId);
    await page.goto("/fr");
    await context(fedMandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/guide");
    await page.getByRole("button", { name: "Ajouter les brouillons proposés" }).click();
    await expect(page.getByRole("link", { name: /Le powerchair football en une page/ })).toBeVisible();
    await axe(page, "guide index");
    await noSideScroll(page);
    await page.getByRole("link", { name: /Le powerchair football en une page/ }).click();
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(page.getByText("Chapitre publié.")).toBeAttached();
    await expect(page.getByRole("img", { name: /Le terrain/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Le 2 contre 1/ })).toBeVisible();
    await axe(page, "guide chapter");
    await noSideScroll(page);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".guide-write")).toBeHidden();
    await page.emulateMedia({ media: "screen" });
    await page.goto("/fr/guide");
    await page.getByRole("link", { name: /Le fauteuil de match/ }).click();
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(page.getByText("Chapitre publié.")).toBeAttached();

    // The club: its note under the chapter, then a chair checked.
    await context(clubMandate);
    await page.goto("/fr/guide/chair");
    await expect(page.getByRole("heading", { name: "Le fauteuil de match", level: 1 })).toBeVisible();
    await page.getByRole("textbox", { name: "Chez nous" }).fill("Les chargeurs sont dans l'armoire du local 2.");
    await page.getByRole("button", { name: "Enregistrer la note" }).click();
    await expect(page.locator(".guide-ours p").first()).toHaveText("Les chargeurs sont dans l'armoire du local 2.");
    await axe(page, "club note");
    await page.goto(`/fr/equipment/${chair}`);
    const compliance = page.locator(".chair-compliance");
    await expect(compliance.getByText("Jamais contrôlé.")).toBeVisible();
    await compliance.getByText("Enregistrer le contrôle").first().click();
    for (const box of await compliance.getByRole("checkbox").all()) await box.check();
    await compliance.getByRole("button", { name: "Enregistrer le contrôle" }).click();
    await expect(compliance.getByText("Conforme", { exact: true })).toBeVisible();
    await axe(page, "chair compliance");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/guide-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
