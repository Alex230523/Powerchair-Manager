import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 4: a tactic sheet with its objective, a tag created on the fly, the pitch drawn with the keyboard, the federal library. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function switchTo(page: Page, mandate: string) {
  await page.goto("/fr");
  await page.locator(".profile-menu > summary").click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
}

test("tactic sheet: objective, tag, pitch drawn by keyboard, list view, federal library", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `exercises4-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Coach Lina", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé Tactique','federation') RETURNING id")).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club Tactique','club',$1) RETURNING id", [fed])).rows[0].id;
    for (const org of [club, fed]) await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, user]);
    const clubMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const fedMandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'federation_president') RETURNING id", [fed, user])).rows[0].id;
    await switchTo(page, clubMandate);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. A tactic with its free objective and a tag created on the fly.
    await page.goto("/fr/exercises");
    await page.getByRole("button", { name: "Nouvelle fiche" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titre").fill("Sortie de balle");
    await dialog.getByLabel("Genre").selectOption("tactic");
    await dialog.getByLabel(/^Type/).selectOption("tactics");
    await dialog.getByLabel("Objectif").fill("Sortir proprement par le côté faible");
    const tags = dialog.getByRole("combobox", { name: "Tags" });
    await tags.fill("Relance");
    await dialog.getByRole("option", { name: "Créer le tag « Relance »" }).click();
    await expect(dialog.getByRole("button", { name: "Retirer le tag Relance" })).toBeVisible();

    // 2. The pitch: a tool, a tap to place, then the keyboard only.
    await dialog.getByText("Dessiner sur le terrain").click();
    await dialog.getByRole("button", { name: "Joueur A", exact: true }).click();
    const pitch = dialog.getByRole("group", { name: "Éditeur de terrain" });
    const box = (await pitch.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
    const player = dialog.getByRole("button", { name: /^joueur A1 à/ });
    await expect(player).toBeVisible();
    await player.focus();
    const before = await dialog.getByLabel("Position X (m, de gauche à droite)").inputValue();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByLabel("Position X (m, de gauche à droite)")).toHaveValue(String(Math.round((Number(before) + 0.5) * 10) / 10));
    await page.keyboard.press("Control+z");
    await expect(dialog.getByLabel("Position X (m, de gauche à droite)")).toHaveValue(before);
    await dialog.getByRole("button", { name: "Ballon", exact: true }).click();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await expect(dialog.getByText(/joueur A1 à .*ballon à/)).toBeVisible();
    await axe(page, "sheet form with pitch");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();

    // 3. The library: genre, tag, counter, creator; the list view.
    const card = page.getByRole("link", { name: /Sortie de balle/ });
    await expect(card).toContainText("Tactique");
    await expect(card).toContainText("Relance");
    await expect(card).toContainText("Créée par Coach Lina (Club Tactique)");
    await page.getByRole("button", { name: "Liste" }).click();
    await expect(page.getByRole("columnheader", { name: "Tags" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Sortie de balle/ })).toContainText("Relance");
    await page.getByRole("button", { name: "Exercices", exact: true }).click();
    await expect(page.getByRole("row", { name: /Sortie de balle/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Tactiques", exact: true }).click();
    await axe(page, "library list");
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 4. The sheet: the drawing printed with it, its exports, the proposal.
    await page.getByRole("link", { name: "Sortie de balle" }).click();
    await expect(page.getByRole("img", { name: /joueur A1 à .*ballon à/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exporter le terrain en PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Proposer à la bibliothèque fédérale" }).click();
    await expect(page.getByText("En attente de validation par la fédération").first()).toBeVisible();
    await axe(page, "sheet");

    // 5. The federation validates it.
    await switchTo(page, fedMandate);
    await page.goto("/fr/exercises");
    await expect(page.getByRole("heading", { name: "Propositions des clubs" })).toBeVisible();
    await expect(page.getByText("Proposée par Coach Lina (Club Tactique)")).toBeVisible();
    await axe(page, "federation proposals");
    await page.getByRole("button", { name: "Valider et publier" }).click();
    await expect(page.getByText("Décision enregistrée.")).toBeVisible();

    // 6. The club copies it from the federal library.
    await switchTo(page, clubMandate);
    await page.goto("/fr/exercises");
    await page.getByRole("tab", { name: "Bibliothèque fédérale" }).click();
    await expect(page.getByText("Pas encore copiée")).toBeVisible();
    await page.getByRole("button", { name: "Copier dans notre bibliothèque" }).click();
    await expect(page.getByText("Copiée dans la bibliothèque du club.")).toBeVisible();
    await expect(page.getByText("Copiée par 1 club")).toBeVisible();
    await axe(page, "federal library");
    expect((await db.query("SELECT count(*)::int AS n FROM exercise WHERE organization_id=$1 AND title='Sortie de balle'", [club])).rows[0].n).toBe(2);

    // 7. The club's tags in Réglages › Activités.
    await page.goto("/fr/settings/activities");
    await expect(page.getByRole("heading", { name: "Tags des fiches exercices" })).toBeVisible();
    await expect(page.getByLabel("Nom du tag Relance")).toHaveValue("Relance");
  } finally {
    await db.end();
  }
});
