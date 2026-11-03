import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 21: the public texts, and « Sécurité et données » for a club opened by its federation. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("legal pages are public, marked as drafts, readable at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  for (const [path, title] of [
    ["/fr/legal/privacy", "Politique de confidentialité"],
    ["/nl/legal/dpa", "Verwerkersovereenkomst (artikel 28 AVG)"],
    ["/en/legal/subprocessors", "Sub-processors"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/juriste|jurist|lawyer/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await axe(page, path);
  }
});

test("security and data: accept the agreement, ask the full export, send a request", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `care-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Données", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,dpa_required) VALUES('Club Données','club',true) RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/fr/settings/club");
    await expect(page.getByRole("heading", { name: "Sécurité et données" })).toBeVisible();
    await expect(page.getByText(/doit être acceptée par la présidence avant d'inviter des membres/)).toBeVisible();
    await page.getByLabel("J'ai lu le contrat de sous-traitance et je l'accepte au nom du club.").check();
    await page.getByRole("button", { name: "J'accepte le contrat au nom du club" }).click();
    await expect(page.getByText(/acceptée par Présidente Données/)).toBeVisible();
    await page.getByRole("button", { name: "Préparer l'export complet" }).click();
    await expect(page.getByRole("link", { name: "Télécharger l'archive" })).toBeVisible();
    await axe(page, "security and data");

    await page.goto("/fr/settings/data");
    await page.getByRole("combobox", { name: /^Demande/ }).selectOption("rectification");
    await page.getByLabel("Précisions (facultatif)").fill("Mon adresse a changé.");
    await page.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByText("Demande transmise au club.")).toBeVisible();
    await axe(page, "my data");
  } finally {
    await db.end();
  }
});
