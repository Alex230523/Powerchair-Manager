import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * B5: an incident reported from a phone (390 px): the person, the facts,
 * the health part apart; the insurance follow-up and the prefilled PDF;
 * anonymous statistics. Axe on each step.
 */
async function axe(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("an incident from the report to the insurance", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `b5-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "B5 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('B5 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Ana Peeters','2012-03-01','{player}')", [club, person]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. The report, from the phone.
    await page.goto("/fr/incidents");
    await expect(page.getByText("Aucun incident déclaré.")).toBeVisible();
    await page.getByRole("button", { name: "Déclarer un incident" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Déclarer un incident" });
    await dialog.getByRole("checkbox", { name: /Ana Peeters/ }).click();
    await expect(dialog.getByText("Aucune consigne de soin enregistrée.")).toBeVisible();
    await dialog.getByRole("combobox", { name: "Type", exact: true }).selectOption({ label: "Collision" });
    await dialog.getByLabel("Lieu").fill("Salle du club");
    await dialog.getByLabel("Circonstances").fill("Collision avec un autre fauteuil pendant l'exercice de passes");
    await dialog.getByLabel("Blessures constatées").fill("Douleur au poignet");
    await axe(page, "report", "dialog[open]");
    await dialog.getByRole("button", { name: "Déclarer un incident" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Incident déclaré.");
    const card = page.locator(".incident-card").filter({ hasText: "Ana Peeters" });
    await expect(card).toContainText("Collision");
    await expect(card).toContainText("Douleur au poignet");
    await axe(page, "list");

    // 2. Insurance: sent, with its reference; the prefilled PDF.
    await page.getByRole("tab", { name: "Assurance", exact: true }).click();
    const claim = page.locator(".incident-card").filter({ hasText: "Ana Peeters" });
    await expect(claim).toContainText("Dans les délais");
    await claim.getByRole("combobox", { name: "Statut", exact: true }).selectOption({ label: "Envoyé" });
    await claim.getByLabel("Référence du dossier").fill("SIN-2026-14");
    await claim.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Enregistré.");
    await expect(page.locator(".incident-card").filter({ hasText: "Ana Peeters" })).toContainText("Traité");
    const id = (await db.query("SELECT id,insurance_status,claim_reference FROM incident WHERE organization_id=$1", [club])).rows[0];
    expect([id.insurance_status, id.claim_reference]).toEqual(["sent", "SIN-2026-14"]);
    const pdf = await page.request.get(`/api/incidents/pdf?id=${id.id}`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await axe(page, "insurance");

    // 3. Anonymous statistics.
    await page.getByRole("tab", { name: "Statistiques", exact: true }).click();
    await expect(page.getByRole("table", { name: "Par type" })).toContainText("Collision");
    await expect(page.locator("#incidents-panel")).not.toContainText("Ana Peeters");
    await axe(page, "stats");
  } finally {
    await db.end();
  }
});
