import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * H1 on a phone (390 px): a minor prospect with his parent, moved on the
 * board with the keyboard (its select), then registered as a player with
 * nothing typed again. Axe, no sideways scroll of the page.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("recruiting a new player", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `recruit-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Rita Recrute", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des Recrues','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/recrutement");
    await expect(page.getByRole("heading", { name: "Recrutement", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Nouveau prospect" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Prénom").fill("Noa");
    await dialog.getByLabel("Mineur (contact par le parent)").check();
    await dialog.getByLabel("Nom du parent").fill("Inès Durand");
    await dialog.getByLabel("Email du parent").fill("ines@example.test");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { name: "Noa" })).toBeVisible();
    await page.getByLabel("Étape de Noa").selectOption("trial_done");
    await expect(page.getByRole("region", { name: /Essai fait/ }).or(page.locator("#col-trial_done").locator(".."))).toContainText("Noa");
    await axe(page, "recruitment board");
    await noSideScroll(page);
    await page.getByRole("button", { name: "Inscrire : Noa" }).click();
    await expect(page.getByText("Inscrit comme joueur.")).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND full_name LIKE 'Noa%'", [club])).rows[0].n).toBe(1);
    expect((await db.query("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND full_name='Inès Durand'", [club])).rows[0].n).toBe(1);
    await page.screenshot({ path: "test-results/recruitment-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
