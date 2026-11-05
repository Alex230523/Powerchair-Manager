import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 05/11/2026: the public page of a match (lot 3) and the commission's journal (lot 6), at 390 px. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function signIn(page: Page, db: Pool, name: string, email: string, org: string, role: string) {
  await prepareSignIn(page, db, name, email, "Browser-test-passphrase-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
  const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
  const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, user, role])).rows[0].id;
  await page.goto("/fr");
  await page.evaluate(async (mandateId) => {
    await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
  }, mandate);
  return user;
}

test("a match followed live without an account, by the link the club shares", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club du direct','club') RETURNING id")).rows[0].id as string;
    const user = await signIn(page, db, "Présidente Direct", `live-${stamp}@example.test`, club, "club_president");
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name,color) VALUES($1,$2,'Lions','blue') RETURNING id", [club, season])).rows[0].id as string;
    const match = (await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,status,created_by) VALUES($1,$2,'Gand','league',now()-interval '20 minutes','scheduled',$3) RETURNING id", [club, team, user])).rows[0].id as string;
    await db.query("INSERT INTO match_live_event(organization_id,match_id,client_id,kind,created_by,minute) VALUES($1,$2,gen_random_uuid(),'goal_against',$3,12)", [club, match, user]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/fr/matches/${match}`);
    await page.getByRole("button", { name: "Créer le lien" }).click();
    await expect(page.getByText("Lien actif : partagez-le.")).toBeVisible();
    const token = (await db.query("SELECT live_token FROM match WHERE id=$1", [match])).rows[0].live_token as string;
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    // A supporter, signed out, opens the link.
    const supporter = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
    const fan = await supporter.newPage();
    await fan.goto(`/fr/live/${token}`);
    await expect(fan.getByRole("heading", { level: 1 })).toContainText("Lions");
    await expect(fan.getByText("En cours")).toBeVisible();
    await expect(fan.locator(".live-figures")).toHaveText("0 - 1");
    await expect(fan.locator(".live-events li")).toContainText("12'");
    await axe(fan, "live page");
    expect(await fan.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // The link removed: nothing left to see.
    await page.getByRole("button", { name: "Retirer le lien" }).click();
    await expect(page.getByRole("button", { name: "Créer le lien" })).toBeVisible();
    await fan.goto(`/fr/live/${token}`);
    await expect(fan.getByRole("heading", { level: 1 })).not.toContainText("Lions");
    await supporter.close();
  } finally {
    await db.end();
  }
});

test("the federation records and signs a decision of the commission", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé commission','federation') RETURNING id")).rows[0].id as string;
    await signIn(page, db, "Présidente Commission", `commission-${stamp}@example.test`, fed, "federation_president");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/federation/commission");
    await page.getByRole("button", { name: "Inscrire une décision" }).click();
    const dialog = page.getByRole("dialog", { name: "Inscrire une décision" });
    await dialog.getByRole("combobox", { name: /^Objet/ }).selectOption("force_majeure");
    await dialog.getByLabel("Qui ou quoi").fill("Transfert de Léo vers Namur");
    await dialog.getByLabel("Décision", { exact: true }).fill("Accepté : déménagement justifié.");
    await axe(page, "decision window");
    await dialog.getByRole("button", { name: "Inscrire", exact: true }).click();
    const journal = page.locator("#commission-journal");
    await expect(journal).toContainText("Transfert de Léo vers Namur");
    await expect(journal).toContainText("Signée par toute la commission");
    await journal.getByRole("button", { name: /Retirer ma signature/ }).click();
    await expect(journal).toContainText("Pas encore signée");
    await axe(page, "commission");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await db.end();
  }
});
