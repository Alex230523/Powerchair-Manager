import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * H4 on a phone (390 px): « Prévisions » with its chart in two scenarios and
 * the month table; a simulation line added, the alert under the threshold,
 * never a ledger line. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("the 12-month cash forecast", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `forecast-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Fred Prévoyant", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des Prévisions','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,'Solde','in','other',100000,$2)", [club, user]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/funding/forecast");
    await expect(page.getByRole("heading", { name: "Prévisions", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sections des finances" }).getByRole("link", { name: "Prévisions" })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Libellé").fill("Achat de 2 fauteuils");
    await page.getByLabel("Montant").fill("5000");
    await page.getByRole("button", { name: "Ajouter à la prévision" }).click();
    await expect(page.getByText(/Achat de 2 fauteuils/).first()).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "passe sous le seuil" })).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM finance_transaction WHERE organization_id=$1", [club])).rows[0].n).toBe(1);
    await axe(page, "forecast");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/forecast-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
