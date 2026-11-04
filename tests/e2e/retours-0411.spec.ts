import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/** Retours du 04/11/2026: windows for a club vehicle and a driving licence, at 390 px. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("trips: a club vehicle and a licence are added in a window", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `retours-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Retours", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club des retours','club') RETURNING id")).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const p = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Diane Chauffeur','{coach}')", [club, p]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/trips");

    // « Ajouter un véhicule du club » opens a window.
    await page.getByRole("button", { name: "Ajouter un véhicule du club" }).click();
    const vehicle = page.getByRole("dialog", { name: "Ajouter un véhicule du club" });
    await vehicle.getByLabel(/^Nom \(ex\./).fill("Minibus du club");
    await axe(page, "vehicle window");
    await vehicle.getByRole("button", { name: "Enregistrer" }).click();
    await expect(vehicle).toHaveCount(0);
    await expect(page.getByText("Minibus du club")).toBeVisible();

    // « Ajouter un permis »: who, categories, since, valid until.
    await page.getByRole("button", { name: "Ajouter un permis" }).click();
    const licence = page.getByRole("dialog", { name: "Ajouter un permis" });
    await licence.getByRole("combobox", { name: /^Personne/ }).selectOption({ label: "Diane Chauffeur" });
    await licence.getByRole("checkbox", { name: "B", exact: true }).check();
    await licence.getByLabel("Depuis le").fill("2010-06-15");
    await licence.getByLabel("Valable jusqu'au").fill("2031-06-15");
    await axe(page, "licence window");
    await licence.getByRole("button", { name: "Enregistrer le permis" }).click();
    await expect(licence).toHaveCount(0);
    await expect(page.getByText(/Depuis le 15 juin 2010/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await db.end();
  }
});

test("exercises: a sheet sent to another club, and one received, accepted", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `fiches-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Présidente Fiches", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id as string;
    const fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé des fiches','federation') RETURNING id")).rows[0].id as string;
    const club = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club Envoi','club',$1) RETURNING id", [fed])).rows[0].id as string;
    const other = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club Voisin','club',$1) RETURNING id", [fed])).rows[0].id as string;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2),($3,$2)", [club, user, other]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const sheet = async (org: string, title: string) =>
      (
        await db.query(
          "INSERT INTO exercise(organization_id,author_id,title,objective,duration_minutes,players_min,players_max,level,suited,shared) VALUES($1,$2,$3,'technique',15,2,6,'beginner','both',true) RETURNING id",
          [org, user, title],
        )
      ).rows[0].id as string;
    const mine = await sheet(club, "Slalom rapide");
    const theirs = await sheet(other, "Passe en retrait");
    await db.query("INSERT INTO exercise_offer(exercise_id,from_organization_id,to_organization_id,sent_by,message) VALUES($1,$2,$3,$4,'Pour vos jeunes')", [theirs, other, club, user]);
    await page.goto("/fr");
    await page.evaluate(async (mandateId) => {
      await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "context", mandateId }) });
    }, mandate);
    await page.setViewportSize({ width: 390, height: 844 });

    // Sending: a window with the clubs of the federation.
    await page.goto(`/fr/exercises/${mine}`);
    await page.getByRole("button", { name: "Envoyer à un autre club" }).click();
    const dialog = page.getByRole("dialog", { name: "Envoyer la fiche à un autre club" });
    await dialog.getByRole("combobox", { name: /^Club/ }).selectOption({ label: "Club Voisin" });
    await axe(page, "send window");
    await dialog.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(page.getByText("Fiche envoyée : le club répondra.")).toBeVisible();

    // Received: accepted, it joins the library.
    await page.goto("/fr/exercises");
    const received = page.locator("#exercise-offers");
    await expect(received).toContainText("De Club Voisin, envoyée par Présidente Fiches");
    await axe(page, "received sheets");
    await received.getByRole("button", { name: "Accepter : Passe en retrait" }).click();
    await expect(page.getByText("Fiche ajoutée à votre bibliothèque.")).toBeVisible();
    await expect(page.locator("#exercise-offers")).toHaveCount(0);
    await expect(page.getByText("Passe en retrait").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    await db.end();
  }
});
