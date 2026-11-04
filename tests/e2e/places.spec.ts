import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (C4): « Lieux » in two categories, a place created with its contact
 * in the same window, a dated rate, a proposal validated by the federation
 * (which never sees the private sheet), the creation window from the calendar.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
}

test("places: private sheet, rate, proposal validated by the federation, window from the calendar", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `c4-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "C4 présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('C4 fédération','federation') RETURNING id")).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('C4 club','club',$1) RETURNING id", [federation])).rows[0].id;
    for (const org of [club, federation]) await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
    const clubMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const fedMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [federation, user])).rows[0].id;
    await page.goto("/fr");
    await switchTo(page, clubMandate);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. « Lieux », two tabs; a place with a contact created in the same window.
    await page.goto("/fr/venues");
    await expect(page.getByRole("heading", { name: "Lieux", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["Entraînement et match", "Autres lieux"]);
    await page.getByRole("button", { name: "Ajouter un lieu" }).click();
    const win = page.getByRole("dialog", { name: "Ajouter un lieu" });
    await win.getByLabel("Nom du lieu").fill("Salle Alpha");
    await win.getByLabel("Adresse").fill("Rue du Stade 4, Namur");
    await expect(win.getByRole("radio", { name: "Entraînement et match" })).toBeChecked();
    await win.getByRole("button", { name: "Créer un contact" }).click();
    await win.getByLabel("Nom du contact").fill("Marc Concierge");
    await win.getByLabel("Téléphone (facultatif)").fill("081 00 00 00");
    await win.getByLabel("Accès PMR").check();
    await win.getByLabel("Notre salle d'entraînement (domicile)").check();
    await win.getByLabel("Nourriture et boissons").fill("Boissons à la cafétéria seulement");
    await win.getByLabel("Notes").fill("Clé chez le concierge");
    await axe(page, "place window");
    await win.getByRole("button", { name: "Enregistrer le lieu" }).click();
    const card = page.locator(".place-card").filter({ hasText: "Salle Alpha" });
    await expect(card).toContainText("Marc Concierge");
    await expect(card.locator(".badge")).toContainText(["Domicile", "Privé"]);

    // 2. A dated rate, put forward as the current one.
    await card.getByRole("button", { name: "Ajouter un tarif : Salle Alpha" }).click();
    const rate = page.getByRole("dialog", { name: "Ajouter un tarif : Salle Alpha" });
    await rate.getByLabel("Libellé (par exemple « terrain 2 h »)").fill("Terrain 2 h");
    await rate.getByLabel("Montant (€)").fill("45");
    await rate.getByLabel("Valable à partir du").fill("2026-01-01");
    await rate.getByRole("button", { name: "Ajouter un tarif" }).click();
    await expect(card.locator(".place-rates li").filter({ hasText: "Terrain 2 h" })).toContainText("En cours");

    // 3. Proposed for sharing: waiting for the federation.
    await card.getByRole("button", { name: "Proposer au partage : Salle Alpha" }).click();
    await expect(card.locator(".badge").filter({ hasText: "En attente de validation" })).toBeVisible();
    await axe(page, "places");

    // 4. The federation sees the public fields only, and validates.
    await switchTo(page, fedMandate);
    await page.goto("/fr/venues");
    const proposals = page.getByRole("region", { name: "Propositions des clubs" }).or(page.locator(".proposal-list"));
    await expect(proposals.first()).toContainText("Salle Alpha");
    await expect(page.locator("main")).not.toContainText("Marc Concierge");
    await expect(page.locator("main")).not.toContainText("cafétéria");
    await axe(page, "federation proposals");
    await page.getByRole("button", { name: "Valider : Salle Alpha" }).click();
    await expect(page.getByText("Aucune proposition en attente.")).toBeVisible();
    await expect(page.locator(".venue-card h3").filter({ hasText: "Salle Alpha" })).toBeVisible();

    // 5. Back in the club: validated. The calendar opens the same window.
    await switchTo(page, clubMandate);
    await page.goto("/fr/venues");
    await expect(page.locator(".place-card").filter({ hasText: "Salle Alpha" }).locator(".badge").filter({ hasText: "Validé" })).toBeVisible();
    await page.goto("/fr/calendar");
    await page.getByRole("button", { name: "Ajouter un lieu", exact: true }).click();
    const fromCalendar = page.getByRole("dialog", { name: "Ajouter un lieu" });
    await fromCalendar.getByLabel("Nom du lieu").fill("Restaurant du club");
    await fromCalendar.getByRole("radio", { name: "Autres lieux" }).check();
    await axe(page, "place window from calendar");
    await fromCalendar.getByRole("button", { name: "Enregistrer le lieu" }).click();
    await expect(fromCalendar).toHaveCount(0);
    await page.getByRole("button", { name: "Nouvel événement", exact: true }).click();
    // 1: one search for the place; « Nos lieux » first, the new place among them.
    const field = page.locator("input[role=combobox]").and(page.getByRole("combobox", { name: "Lieu", exact: true }));
    await field.fill("Restaurant");
    await expect(page.getByRole("group", { name: "Nos lieux" }).getByRole("option", { name: /^Restaurant du club/ })).toHaveCount(1);
    await expect(page.getByRole("option", { name: "Utiliser « Restaurant » comme lieu libre" })).toBeVisible();
    await axe(page, "place search");
    await field.press("Escape");

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/venues");
    await expect(page.getByRole("heading", { name: "Lieux", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "places 390");
  } finally {
    await db.end();
  }
});
