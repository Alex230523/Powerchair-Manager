import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * 17 on a phone (390 px): an admission written in the register, the
 * assembly planned with its agenda, a member present, a point voted, the
 * minutes written. Axe on each state, no sideways scroll.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}

test("the register and the assembly, on a phone", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `association-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente ASBL", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club ASBL','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Martine Membre')", [club, person]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/club/association");
    await expect(page.getByRole("heading", { name: "Vie de l'ASBL", level: 1 })).toBeVisible();
    await page.getByRole("combobox", { name: /^Personne/ }).selectOption({ label: "Martine Membre" });
    await page.getByRole("button", { name: "Inscrire au registre" }).click();
    await expect(page.locator(".asbl-members").getByText("Martine Membre")).toBeVisible();
    await expect(page.locator(".asbl-history").getByText(/Admission · Membre effectif/)).toBeVisible();
    await axe(page, "register");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    await page.getByRole("tab", { name: "Assemblées et conseil" }).click();
    const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    await page.getByLabel("Date et heure").fill(`${day}T19:00`);
    await page.getByLabel("Lieu", { exact: true }).fill("Local du club");
    await page.getByRole("button", { name: "Planifier", exact: true }).click();
    const meeting = page.locator(".asbl-meeting").first();
    await expect(meeting.getByText("Décharge aux administrateurs").first()).toBeVisible();
    await meeting.getByRole("checkbox", { name: "Martine Membre" }).check();
    await meeting.getByRole("form", { name: "Vote : Décharge aux administrateurs" }).getByLabel("Pour").fill("1");
    await meeting.getByRole("form", { name: "Vote : Décharge aux administrateurs" }).getByRole("button", { name: "Enregistrer le vote" }).click();
    await expect(meeting.getByText("Adopté").first()).toBeVisible();
    await axe(page, "assembly");
    await meeting.getByRole("button", { name: "Clôturer et rédiger le PV" }).click();
    await expect(meeting.getByRole("textbox", { name: "Procès-verbal" })).toHaveValue(/Décharge aux administrateurs/);
    await axe(page, "minutes");
    await page.screenshot({ path: "test-results/association-390.png", fullPage: true });
  } finally {
    await db.end();
  }
});
