import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn, createAccount } from "../support/session";

/**
 * Wave 17 (F1): the list of forms and its editor, neutral templates, the
 * « Partager » dialog (link and QR code, website, social networks), the
 * question cards, and the decision in one click with « Annuler »: an undone
 * acceptance sends no email.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}
async function fits(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), label).toBe(true);
}

test("forms list, templates, sharing, question cards and one-click decisions with undo", async ({ page, context }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `f1-${Date.now()}@example.test`;
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3100" });
    await prepareSignIn(page, db, "F1 president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('F1 club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    // Two teams: Lions is full, Tigres has places.
    const lions = (await db.query("INSERT INTO team(organization_id,season_id,name,capacity) VALUES($1,$2,'Lions',1) RETURNING id", [club, season])).rows[0].id;
    const tigres = (await db.query("INSERT INTO team(organization_id,season_id,name,capacity) VALUES($1,$2,'Tigres',12) RETURNING id", [club, season])).rows[0].id;
    const star = (
      await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,p.id,'Joueur Lions','{player}' FROM p RETURNING id", [club])
    ).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [club, lions, star]);
    const fields = [
      { key: "phone", type: "phone", label: { fr: "Téléphone", nl: "Telefoon" }, required: true, options: [], confidential: false },
      { key: "size", type: "choice", label: { fr: "Taille de maillot", nl: "Shirtmaat" }, required: false, options: ["S", "M", "L"], confidential: false },
    ];
    const form = (
      await db.query("INSERT INTO registration_form(organization_id,season_id,title,description,fields,published) VALUES($1,$2,'Inscriptions 2026-27','Bienvenue',$3,true) RETURNING id", [
        club,
        season,
        JSON.stringify(fields),
      ])
    ).rows[0].id;
    await db.query("INSERT INTO registration_form(organization_id,season_id,title,description,fields,published) VALUES($1,$2,'Stage d''été','',$3,false)", [club, season, JSON.stringify(fields)]);
    const family = await createAccount(db, "Julie Martin", `f1-family-${Date.now()}@example.test`, "Browser-test-passphrase-2026!");
    const apply = async (name: string) =>
      (
        await db.query(
          "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,answers,status,submitted_at,subject_kind) VALUES($1,$2,$3,$4,$5,'2014-05-02','fr',$6,'{\"phone\":\"+32 470 00 00 00\"}','submitted',now(),'represented') RETURNING id",
          [club, form, family.id, season, name, JSON.stringify({ title: "Inscriptions 2026-27", fields })],
        )
      ).rows[0].id as string;
    const lucas = await apply("Lucas Martin");
    const emma = await apply("Emma Martin");
    const status = async (id: string) => (await db.query("SELECT status FROM registration_application WHERE id=$1", [id])).rows[0].status as string;
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. The list: name, year, season, applications, state, icon actions; one main button.
    await page.goto("/fr/registrations");
    const forms = page.locator("#reg-forms");
    const first = forms.getByRole("row").filter({ hasText: "Inscriptions 2026-27" });
    await expect(first).toContainText("Ouvert au public");
    await expect(first.locator("td.numeric")).toHaveText("2");
    await expect(forms.getByRole("row").filter({ hasText: "Stage d'été" })).toContainText("Fermé");
    await expect(page.getByRole("button", { name: "Nouveau formulaire", exact: true })).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText(/tigerstorm/i);
    // A click on a form shows its questions below.
    await forms.getByRole("button", { name: "Afficher les questions de Stage d'été", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Questions de Stage d'été" })).toBeVisible();
    await axe(page, "list");

    // 2. Preview as the public sees it, then reuse for a new season.
    await first.getByRole("button", { name: "Aperçu de Inscriptions 2026-27", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Taille de maillot")).toBeVisible();
    await axe(page, "preview");
    await dialog.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await first.getByRole("button", { name: "Réutiliser Inscriptions 2026-27 pour une nouvelle saison", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Réutiliser Inscriptions 2026-27" })).toBeVisible();
    await expect(page.getByLabel("Titre du formulaire", { exact: true })).toHaveValue("Inscriptions 2026-27");

    // 3. « Nouveau formulaire »: from scratch or from a neutral template.
    await page.getByRole("button", { name: "Nouveau formulaire", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Modèles de la plateforme" })).toBeVisible();
    for (const name of ["Inscription d'un joueur", "Réinscription", "Inscription à un stage"]) await expect(dialog.getByText(name, { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText(/tigerstorm|BE41/i);
    await axe(page, "new form");
    await dialog.getByRole("button", { name: "Utiliser le modèle Inscription d'un joueur", exact: true }).click();
    await expect(page.getByLabel("Titre du formulaire", { exact: true })).toHaveValue("Inscription d'un joueur");
    await expect(page.locator("main")).not.toContainText(/tigerstorm|BE41/i);

    // 4. Question cards: the bin removes, « Annuler » puts it back; arrows reorder.
    await forms.getByRole("button", { name: "Afficher les questions de Inscriptions 2026-27", exact: true }).click();
    await page.getByRole("button", { name: "Retirer la question 1 : Téléphone", exact: true }).click();
    await expect(page.getByLabel("Libellé français", { exact: true })).toHaveCount(1);
    await page.locator(".toast").getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByLabel("Libellé français", { exact: true })).toHaveCount(2);
    await expect(page.getByLabel("Libellé français", { exact: true }).first()).toHaveValue("Téléphone");
    await page.getByRole("button", { name: "Descendre la question 1", exact: true }).click();
    await expect(page.getByLabel("Libellé français", { exact: true }).first()).toHaveValue("Taille de maillot");
    // The card keeps 16 px inside, the bin stays clear of the fields.
    const card = page.locator(".question-card").first();
    expect(await card.evaluate((el) => getComputedStyle(el).paddingTop)).toBe("16px");
    await axe(page, "editor");

    // 5. « Partager »: open to the public with dates, then link and QR, website, social networks.
    await first.getByRole("button", { name: "Partager Inscriptions 2026-27", exact: true }).click();
    await expect(dialog.getByRole("switch", { name: "Ouvert au public" })).toBeChecked();
    const url = `http://127.0.0.1:3100/fr/inscription/${form}`;
    await dialog.getByRole("button", { name: "Copier : Adresse publique", exact: true }).click();
    await expect(dialog.getByRole("status").filter({ hasText: "Copié dans le presse-papiers." })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect(dialog.getByRole("img", { name: "QR code du formulaire Inscriptions 2026-27" })).toBeVisible();
    await axe(page, "share link");
    await dialog.getByRole("tab", { name: "Site web" }).click();
    await expect(dialog).toContainText("WordPress");
    await dialog.getByRole("button", { name: "Copier : Code du formulaire intégré", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/fr/registration-widget/${form}`);
    await dialog.getByRole("tab", { name: "Réseaux sociaux" }).click();
    await expect(dialog.getByRole("link", { name: /Partager sur Facebook/ })).toHaveAttribute("href", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    await expect(dialog.getByRole("link", { name: /Partager sur WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
    await axe(page, "share social");
    // Closed from tomorrow on: the public page is unavailable.
    const tomorrow = (await db.query("SELECT to_char((now() AT TIME ZONE 'Europe/Brussels')::date+1,'YYYY-MM-DD') AS d")).rows[0].d;
    await dialog.getByLabel("Ouverture le (facultatif)").fill(tomorrow);
    await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(async () => (await db.query("SELECT opens_on::text FROM registration_form WHERE id=$1", [form])).rows[0].opens_on).toBe(tomorrow);
    expect((await page.request.get(`/api/registrations/public/${form}`)).status()).toBe(404);
    await dialog.getByLabel("Ouverture le (facultatif)").fill("");
    await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect.poll(async () => (await page.request.get(`/api/registrations/public/${form}`)).status()).toBe(200);
    await dialog.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();

    // 6. Accept in one click (two teams: the choice, with places left), then « Annuler »: nothing is emailed.
    const apps = page.locator("#reg-apps");
    await apps.getByRole("button", { name: "Accepter le dossier de Lucas Martin", exact: true }).click();
    await expect(dialog.getByText("Lions · Complète")).toBeVisible();
    await expect(dialog.getByText("Tigres · 12 places libres")).toBeVisible();
    await axe(page, "team choice");
    await dialog.getByRole("radio", { name: /Tigres/ }).check();
    await dialog.getByRole("button", { name: "Accepter le dossier", exact: true }).click();
    const toast = page.locator(".toast");
    await expect(toast).toContainText("Dossier accepté");
    await expect.poll(() => status(lucas)).toBe("accepted");
    expect((await db.query("SELECT count(*)::int AS n FROM team_membership WHERE team_id=$1", [tigres])).rows[0].n).toBe(1);
    const waiting = await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND state='pending' AND available_at>now()+interval '60 seconds'", [club]);
    expect(waiting.rows[0].n).toBeGreaterThan(0);
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect(toast).toContainText("C’est annulé.");
    await expect.poll(() => status(lucas)).toBe("submitted");
    expect((await db.query("SELECT count(*)::int AS n FROM team_membership WHERE team_id=$1", [tigres])).rows[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND state<>'cancelled'", [club])).rows[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int AS n FROM invitation WHERE organization_id=$1", [club])).rows[0].n).toBe(0);

    // 7. A full team: the waiting list instead.
    await apps.getByRole("button", { name: "Accepter le dossier de Lucas Martin", exact: true }).click();
    await dialog.getByRole("radio", { name: /Lions/ }).check();
    await dialog.getByRole("button", { name: "Accepter le dossier", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Lions est complète" })).toBeVisible();
    await dialog.getByRole("button", { name: "Mettre en liste d'attente", exact: true }).click();
    await expect.poll(() => status(lucas)).toBe("waiting");

    // 8. Refuse with a reason, sent to the applicant.
    await apps.getByRole("button", { name: "Refuser le dossier de Emma Martin", exact: true }).click();
    await dialog.getByLabel("Motif (facultatif)").fill("Plus de place dans cette catégorie d'âge");
    await axe(page, "refuse");
    await dialog.getByRole("button", { name: "Refuser le dossier", exact: true }).click();
    await expect(toast).toContainText("Dossier refusé");
    await expect.poll(() => status(emma)).toBe("refused");
    expect((await db.query("SELECT message FROM registration_history WHERE application_id=$1 AND status='refused'", [emma])).rows[0].message).toBe(
      "Plus de place dans cette catégorie d'âge",
    );
    await page.screenshot({ path: "test-results/registration-forms-1440.png", fullPage: true });

    // 9. At 390 px: nothing sticks out, light and dark.
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/fr/registrations");
      await expect(forms.getByRole("row").filter({ hasText: "Inscriptions 2026-27" })).toBeVisible();
      await fits(page, `390 ${scheme}`);
      await axe(page, `390 ${scheme}`);
      await page.screenshot({ path: `test-results/registration-forms-390-${scheme}.png`, fullPage: true });
    }
  } finally {
    await db.end();
  }
});
