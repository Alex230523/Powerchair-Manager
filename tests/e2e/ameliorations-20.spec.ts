import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 04/11/2026, points 6 to 11: the federation's fines, the clubs' training format and an international transfer, at 390 px. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("federation: a fine, a club's format, the BPCF participation and an international transfer", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `bpcf-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Fédé BPCF", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé des amendes','federation') RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club Ponctuel','club',$1) RETURNING id", [fed])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [fed, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id;
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Léo Voyageur','{player}')", [club, person]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    // 9 and 10: the BPCF participation is offered; a fine, its amount from the rules.
    await page.goto("/fr/federation/affiliations");
    await expect(page.getByRole("button", { name: "Partir de « Participation BPCF »" })).toBeVisible();
    await page.getByRole("button", { name: "Donner une amende" }).click();
    const fine = page.getByRole("dialog", { name: "Donner une amende" });
    await fine.getByRole("combobox", { name: /^Club/ }).selectOption({ label: "Club Ponctuel" });
    await fine.getByRole("combobox", { name: /^Motif/ }).selectOption("forfeit");
    await expect(fine.getByLabel("Montant en euros")).toHaveValue("50.00");
    await axe(page, "fine window");
    await fine.getByRole("button", { name: "Enregistrer l'amende" }).click();
    await expect(page.locator("#fines")).toContainText("Forfait : Club Ponctuel");
    await axe(page, "fines");

    // 6: the club's training format; 11: an international transfer, its compensation computed.
    await page.goto("/fr/transfers");
    await page.getByRole("tab", { name: "Clubs" }).click();
    await page.getByRole("combobox", { name: "Format de formation : Club Ponctuel" }).selectOption("academy");
    await expect(page.getByText("Enregistré.").first()).toBeVisible();
    await page.getByRole("tab", { name: "Transferts internationaux" }).click();
    const form = page.getByRole("form", { name: "Enregistrer le transfert international" });
    await form.getByRole("combobox", { name: /^Joueur/ }).selectOption({ label: "Léo Voyageur · Club Ponctuel" });
    await form.getByLabel("Club étranger").fill("Lille Powerchair");
    await form.getByLabel("Pays").fill("France");
    await form.getByLabel("Années de formation").fill("3");
    await axe(page, "international form");
    await form.getByRole("button", { name: "Enregistrer le transfert international" }).click();
    await expect(page.getByText(/Léo Voyageur · Club Ponctuel → Lille Powerchair \(France\)/)).toBeVisible();
    await expect(page.getByText(/1\s?750,00/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await db.end();
  }
});
