import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { createAccount } from "../support/session";

/** Wave 16 (I2): the invitation email's link opens a guided account creation. */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("guided account creation from an invitation, and « Ce n'est pas mon rôle »", async ({ page, browser }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  try {
    await db.query('DELETE FROM "rateLimit"');
    const president = await createAccount(db, "Welcome president", `welcome-president-${stamp}@example.test`, "Browser-test-passphrase-2026!");
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club Bienvenue','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, president.id]);
    await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president')", [club, president.id]);
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    const file = async (name: string) =>
      (
        await db.query(
          "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2000-05-04','{player}' FROM p RETURNING id",
          [club, name],
        )
      ).rows[0].id as string;
    const invite = async (email: string, profile: string, greeting: string) => {
      const token = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO invitation(organization_id,email,role,grants,token_hash,expires_at,created_by,valid_from,profile_id,team_id,greeting) VALUES($1,$2,'player','{}',$3,now()+interval '7 days',$4,now(),$5,$6,$7)",
        [club, email, createHash("sha256").update(token).digest("hex"), president.id, profile, team, greeting],
      );
      return token;
    };
    const camille = await file("Camille Joueuse");
    const email = `camille-${stamp}@example.test`;
    const token = await invite(email, camille, "Camille");

    // 1. Who invites whom, as what.
    await page.goto(`/fr/welcome/${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Bienvenue" })).toBeVisible();
    await expect(page.getByText("Bonjour Camille")).toBeVisible();
    await expect(page.getByText(/Club Bienvenue vous invite sur Powerchair Manager comme/)).toBeVisible();
    await expect(page.getByText("Équipe : Lions")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await axe(page, "welcome");
    await page.getByRole("button", { name: "C'est bien moi" }).click();

    // 2. Basic information, filled from the club's file.
    await expect(page.getByRole("heading", { level: 1, name: "Mes informations" })).toBeFocused();
    await expect(page.getByLabel("Prénom")).toHaveValue("Camille");
    await expect(page.locator("#welcome-lastName")).toHaveValue("Joueuse");
    await expect(page.getByLabel("Date de naissance")).toHaveValue("2000-05-04");
    await axe(page, "details");
    await page.getByRole("button", { name: "Continuer" }).click();

    // 3. Information for the club.
    await expect(page.getByRole("heading", { level: 1, name: "Informations pour le club" })).toBeVisible();
    await page.getByLabel("Classification").selectOption("PF1");
    await page.getByLabel("J'ai mon propre fauteuil de sport").check();
    await axe(page, "club information");
    await page.getByRole("button", { name: "Continuer" }).click();

    // 4. Password, privacy, then signed in on the home page.
    await expect(page.getByRole("heading", { level: 1, name: "Mot de passe" })).toBeVisible();
    await page.getByLabel("Mot de passe (12 caractères minimum)").fill("Browser-test-passphrase-2026!");
    await page.getByLabel("Confirmer le mot de passe").fill("Autre-chose-2026!!");
    await page.getByLabel("J'ai lu et j'accepte la politique de confidentialité.").check();
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Les deux mots de passe sont différents.")).toBeVisible();
    await page.getByLabel("Confirmer le mot de passe").fill("Browser-test-passphrase-2026!");
    await axe(page, "password");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL(/\/fr$/, { timeout: 15000 });
    // Signed in: « Mon espace » offers to sign out (the home keeps it in the account menu).
    await page.goto("/fr/access");
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    expect((await db.query("SELECT role FROM role_assignment WHERE organization_id=$1 AND user_id=$2", [club, user])).rows).toEqual([{ role: "player" }]);
    expect((await db.query("SELECT classification FROM player_sport_profile WHERE profile_id=$1", [camille])).rows[0].classification).toBe("PF1");

    // The same link a second time.
    const otherContext = await browser.newContext();
    const again = await otherContext.newPage();
    await again.goto(`/fr/welcome/${token}`);
    await expect(again.getByText("Cette invitation a déjà été utilisée.")).toBeVisible();

    // « Ce n'est pas mon rôle »: the club is told, the invitation waits.
    const other = await file("Eva Erreur");
    const wrong = await invite(`eva-${stamp}@example.test`, other, "Eva");
    await again.goto(`/fr/welcome/${wrong}`);
    await again.getByRole("button", { name: "Ce n'est pas mon rôle" }).click();
    await again.getByLabel("Que faut-il corriger ? (facultatif)").fill("Je suis la maman");
    await axe(again, "dispute");
    await again.getByRole("button", { name: "Prévenir le club" }).click();
    await expect(again.getByRole("status")).toContainText("La personne qui vous a invité est prévenue");
    expect((await db.query("SELECT disputed_note FROM invitation WHERE profile_id=$1", [other])).rows[0].disputed_note).toBe("Je suis la maman");
    await otherContext.close();
  } finally {
    await db.end();
  }
});
