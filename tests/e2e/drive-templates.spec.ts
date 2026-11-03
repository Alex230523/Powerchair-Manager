import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** 10: the documents' folders (free folder, file added, keyboard move) and the email templates (preview, test). */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

test("documents in folders and email templates", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `drive-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Drive", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club Drive','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027','2026-07-01','2027-06-30')", [club]);
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Martin','2010-01-01','{player}')", [club, person]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. The drive: a folder per type, the club's documents, a free folder.
    await page.goto("/fr/documents");
    await expect(page.getByRole("tab", { name: "Dossiers" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /Ouvrir le dossier Assurance/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ouvrir le dossier Documents du club/ })).toBeVisible();
    await page.getByRole("button", { name: "Nouveau dossier" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nom du dossier").fill("Vie du club");
    await dialog.getByLabel("Visible par").selectOption("members");
    await dialog.getByRole("button", { name: "Créer le dossier" }).click();
    await page.getByRole("button", { name: /Ouvrir le dossier Vie du club/ }).click();
    await expect(page.getByRole("navigation", { name: "Fil d'Ariane" })).toContainText("Vie du club");

    // 2. A file added in the folder, its type and season already filled in.
    await page.getByRole("button", { name: "Ajouter un fichier ici" }).click();
    const add = page.getByRole("dialog");
    await add.getByLabel("Nom du document").fill("Statuts");
    await expect(add.getByLabel("Saison")).toHaveValue(/.+/);
    await add.getByLabel("Fichier (PDF, PNG ou JPEG, 2 Mo maximum)").setInputFiles({ name: "statuts.pdf", mimeType: "application/pdf", buffer: pdf });
    await add.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByRole("link", { name: "Télécharger Statuts" })).toBeVisible();
    await axe(page, "free folder");

    // 3. Moved with the keyboard, back to the club's documents.
    const select = page.getByLabel("Déplacer Statuts vers…");
    await select.focus();
    await select.selectOption("");
    await page.getByRole("button", { name: "Déplacer", exact: true }).press("Enter");
    await expect(page.getByText("Document déplacé.")).toBeAttached();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: /Ouvrir le dossier Documents du club, 1 fichier/ }).click();
    await page.getByRole("button", { name: /Ouvrir le dossier 2026-2027/ }).click();
    await expect(page.getByRole("link", { name: "Télécharger Statuts" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await axe(page, "drive at 390 px");
    await page.setViewportSize({ width: 1280, height: 900 });

    // 4. The templates: offered, previewed with a real person, a test to oneself.
    await page.goto("/fr/communication/templates");
    await expect(page.getByRole("heading", { level: 2, name: "Rappel de cotisation" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Invitation à un match" })).toBeVisible();
    const card = page.locator(".template-card").filter({ has: page.getByRole("heading", { name: "Bienvenue à une nouvelle recrue" }) });
    await card.getByRole("button", { name: "Aperçu" }).click();
    await card.getByLabel("Aperçu avec").selectOption({ label: "Léa Martin" });
    await expect(card.getByText("Bienvenue au Club Drive, Léa !")).toBeVisible();
    await card.getByRole("button", { name: "M'envoyer un test" }).click();
    await expect(page.getByText("Test envoyé à votre adresse.")).toBeVisible();
    await card.getByRole("button", { name: "Modifier" }).click();
    const editor = page.getByRole("dialog");
    await editor.getByLabel("Objet").fill("Bienvenue, ");
    await editor.getByLabel("Insérer une variable", { exact: true }).selectOption("prénom");
    await editor.getByLabel("Objet").focus();
    await editor.getByRole("button", { name: "Insérer une variable" }).click();
    await expect(editor.getByLabel("Objet")).toHaveValue("Bienvenue, {prénom}");
    await axe(page, "template editor");
    await editor.getByRole("button", { name: "Enregistrer le modèle" }).click();
    await expect(page.getByText("Bienvenue, {prénom}")).toBeVisible();
    await axe(page, "templates");
  } finally {
    await db.end();
  }
});
