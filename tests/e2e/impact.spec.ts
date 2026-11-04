import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * H13 on a phone (390 px): the impact report of a grant's period, its key
 * figures (a missing datum said as such), an adjustment with its reason,
 * filed with the grant. Axe, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("the impact report of a grant", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `impact-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Ida Impact", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club de l''Impact','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id as string;
    const grant = (await db.query("INSERT INTO grant_application(organization_id,funder,status,starts_on,ends_on,created_by) VALUES($1,'Province','granted','2026-01-01','2026-12-31',$2) RETURNING id", [club, user])).rows[0].id as string;
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/fr/statistics/impact?grant=${grant}&from=2026-01-01&to=2026-12-31`);
    await expect(page.getByRole("heading", { name: "Rapport d'impact", level: 1 })).toBeVisible();
    await expect(page.getByText("Pour le subside : Province")).toBeVisible();
    await expect(page.getByText("donnée absente").first()).toBeVisible();
    await page.getByLabel("Indicateur").selectOption("volunteerHours");
    await page.getByLabel("Ajout ou retrait").fill("12");
    await page.getByLabel("Raison").fill("Fête du club non saisie");
    await page.getByRole("button", { name: "Ajouter l'ajustement" }).click();
    await expect(page.getByText(/Fête du club non saisie/)).toBeVisible();
    await page.getByRole("button", { name: "Joindre au dossier du subside" }).click();
    await expect(page.getByText("Rapport joint au dossier du subside.")).toBeVisible();
    expect((await db.query("SELECT count(*)::int AS n FROM grant_attachment WHERE grant_id=$1", [grant])).rows[0].n).toBe(1);
    await axe(page, "impact report");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/impact-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
