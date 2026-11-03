import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 19 on a phone (390 px): a chair's breakdown from the equipment page (type,
 * « à surveiller »), the chair's QR label; a remark on the application with a
 * masked screenshot, then its state in « Mes signalements ». Axe on each
 * state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("report a chair's breakdown and a problem in the application", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `reports-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Rose Rapport", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des Rapports','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Strike bleu','available','club') RETURNING id", [club])).rows[0].id as string;
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/equipment");
    await page.getByLabel("Fauteuil en panne").selectOption({ label: "Strike bleu" });
    await page.getByRole("button", { name: "Signaler une panne", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/equipment/${chair}\\?report=1`));
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Ce qui ne va pas").selectOption("wheels");
    await dialog.getByLabel("À surveiller").check();
    await dialog.getByLabel("Que se passe-t-il ?").fill("Un bruit dans la roue avant gauche");
    await axe(page, "chair report");
    await dialog.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText(/Problème signalé. Le fauteuil reste en service/)).toBeVisible();
    expect((await db.query("SELECT status FROM equipment_chair WHERE id=$1", [chair])).rows[0].status).toBe("available");
    await expect(page.getByRole("img", { name: /Code QR pour signaler une panne du fauteuil Strike bleu/ })).toBeVisible();
    await noSideScroll(page);

    await page.goto("/fr/signalements?new=1");
    const report = page.getByRole("dialog", { name: "Signaler un problème dans l'application" });
    await report.getByLabel("Une idée").check();
    await report.getByLabel(/Décrivez ce qui se passe/).fill("Pouvoir trier les fauteuils par date de révision.");
    await report.getByRole("button", { name: "Joindre une capture de l'écran" }).click();
    await expect(report.getByRole("img", { name: "Capture de l'écran, données masquées" }).or(report.getByText(/ne permet pas la capture/))).toBeVisible();
    await axe(page, "feedback dialog");
    await report.getByRole("button", { name: "Envoyer" }).click();
    await expect(report.getByText(/Votre signalement est envoyé/)).toBeVisible();
    await report.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByText("Reçu", { exact: true })).toBeVisible();
    await axe(page, "my reports");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/reports-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
