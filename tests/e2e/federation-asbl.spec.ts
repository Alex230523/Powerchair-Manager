import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 35 on a phone (390 px): the federation's presidency opens its own
 * Finances (no dues, no affiliations to pay) and its ASBL's life, where its
 * clubs are its members with their representative. Axe on each page, no
 * sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("the federation's books and assembly", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `fed-asbl-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Fanny Fédé", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération ASBL','federation') RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club des Hérons','club',$1) RETURNING id", [fed])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [fed, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id as string;
    const rep = (await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES(gen_random_uuid()::text,'Henri Héron',$1,true) RETURNING id`, [`heron-${Date.now()}@example.test`])).rows[0].id;
    await db.query("INSERT INTO person(user_id) VALUES($1)", [rep]);
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, rep]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president')", [club, rep]);
    await page.goto("/fr");
    await page.evaluate(async (id) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId: id }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/fr/funding");
    const nav = page.getByRole("navigation", { name: "Sections des finances" }).first();
    await expect(nav.getByRole("link", { name: "Opérations" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Affiliations/ })).toHaveCount(0);
    await axe(page, "federation finances");
    await noSideScroll(page);

    await page.goto("/fr/club/association");
    await expect(page.getByText("Club des Hérons").first()).toBeVisible();
    const reps = page.locator("section").filter({ has: page.getByRole("heading", { name: "Représentants des clubs" }) });
    await expect(reps.getByLabel("Club des Hérons")).toHaveValue(rep);
    await axe(page, "federation assembly");
    await noSideScroll(page);
    await page.screenshot({ path: "test-results/federation-asbl-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
