import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * A4: the contact book as a light CRM. A contact and its organisation, the
 * log in one click, the next action in the to-do, two duplicates merged, a
 * CSV import, and a contact created from a grant's form without leaving
 * it. Axe and 390 px.
 */
async function axe(page: Page, label: string, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const violations = (await builder.analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("the contact book as a light CRM", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `a4-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "A4 Présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('A4 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name) SELECT $1,id,'Alex Président' FROM person WHERE user_id=$2", [club, user]);
    // Two sheets of the same person.
    await db.query("INSERT INTO contact(organization_id,full_name,email,created_by) VALUES($1,'Julie Martin','julie@club.test',$2),($1,'julie MARTIN','julie@club.test',$2)", [club, user]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. A contact, its organisation typed in.
    await page.goto("/fr/contacts");
    await page.getByRole("button", { name: "Nouveau contact", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Nouveau contact" });
    await form.getByLabel("Nom", { exact: true }).fill("Paul Dumont");
    await form.getByLabel("Organisation", { exact: true }).fill("Province de Liège");
    await form.getByLabel("Email", { exact: true }).fill("paul@province.test");
    await axe(page, "contact form", "dialog[open]");
    await form.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(form).toHaveCount(0);

    // 2. Its sheet: a call in one click, then the next action.
    await page.getByRole("button", { name: "Ouvrir la fiche de Paul Dumont" }).click();
    const sheet = page.getByRole("dialog", { name: "Paul Dumont" });
    await sheet.getByLabel(/^Ce qui s'est dit/).fill("Appel pour le dossier 2027");
    await sheet.getByRole("button", { name: "Enregistrer comme Appel" }).click();
    await expect(sheet.locator(".contact-log li").filter({ hasText: "Appel pour le dossier 2027" })).toBeVisible();
    await sheet.getByLabel("Quoi", { exact: true }).fill("Envoyer le dossier");
    await sheet.getByRole("button", { name: "Ajouter à la to-do" }).click();
    await expect(sheet.getByRole("link", { name: /Envoyer le dossier/ })).toBeVisible();
    await axe(page, "contact sheet", "dialog[open]");
    await sheet.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(page.locator(".contact-table tbody tr").filter({ hasText: "Paul Dumont" })).not.toContainText("Jamais");

    // 3. Organisations and duplicates.
    await page.getByRole("tab", { name: /^Organisations/ }).click();
    await expect(page.getByText("Province de Liège")).toBeVisible();
    await page.getByRole("tab", { name: /^Doublons/ }).click();
    await expect(page.getByText("Même email")).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Garder Julie Martin et y fusionner julie MARTIN", exact: true }).click();
    await expect(page.getByText("Aucun doublon repéré.")).toBeVisible();
    await axe(page, "duplicates");

    // 4. A CSV import.
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "Importer des contacts" });
    await importer.getByLabel("Fichier").setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from("Nom;Email;Société\nAnne Legrand;anne@commune.test;Commune de Namur\nPaul Dumont;paul@province.test;\n") });
    await expect(importer.getByText("2 contact(s) prêt(s) à importer")).toBeVisible();
    await importer.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(importer.getByText("1 contact(s) importé(s), 1 déjà connu(s).")).toBeVisible();
    await importer.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();

    // 5. From a grant's form: create a contact without leaving it.
    await page.goto("/fr/funding/grants-sponsors?vue=subsides");
    await page.getByRole("button", { name: "Nouvelle demande", exact: true }).click();
    const grant = page.getByRole("dialog", { name: "Nouvelle demande" });
    await grant.getByLabel(/^Organisme/).fill("Commune de Namur");
    await grant.getByRole("button", { name: "+ Créer un contact" }).click();
    await grant.getByLabel("Nom", { exact: true }).fill("Sophie Échevine");
    await grant.getByRole("button", { name: "Créer et choisir" }).click();
    await expect(grant.getByLabel("Contact", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
    await grant.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(grant).toHaveCount(0);
    expect((await db.query("SELECT count(*)::int AS n FROM grant_application g JOIN contact c ON c.id=g.contact_id WHERE g.organization_id=$1 AND c.full_name='Sophie Échevine'", [club])).rows[0].n).toBe(1);

    // 6. At 390 px nothing sticks out.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/contacts");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, "contacts 390");
  } finally {
    await db.end();
  }
});
