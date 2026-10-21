import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { signUpVia } from "../support/session";
const origin = "http://127.0.0.1:3100";
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
}
test("real registration builder, family application, attachment, complement, admission and renewal", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use npm run test:e2e:db");
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL }),
    candidateContext = await browser.newContext({ baseURL: origin }),
    candidatePage = await candidateContext.newPage();
  try {
    await db.query('DELETE FROM "rateLimit"');
    const password = "Registration-fixture-2026!";
    async function signup(target: Page, name: string) {
      const r = await signUpVia(target, db, {
        headers: { origin },
        data: {
          name,
          email: "registration-" + crypto.randomUUID() + "@example.test",
          password,
        },
      });
      expect(r.status(), await r.text()).toBe(200);
      const u = (await r.json()).user;
      return u;
    }
    const admin = await signup(page, "Registration President"),
      candidate = await signup(candidatePage, "Candidate Parent");
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Club Admissions','club') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, admin.id],
    );
    const mandate = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id",
        [org, admin.id],
      )
    ).rows[0].id;
    expect(
      (
        await page.request.post("/api/workspace", {
          headers: { origin },
          data: { action: "context", mandateId: mandate },
        })
      ).status(),
    ).toBe(200);
    const season = (
      await db.query(
        "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026','2026-01-01','2026-12-31') RETURNING id",
        [org],
      )
    ).rows[0].id;
    const team = (
      await db.query(
        "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Team Admissions') RETURNING id",
        [org, season],
      )
    ).rows[0].id;
    for (const locale of ["fr", "nl"]) {
      await page.goto("/" + locale + "/registrations");
      await expect(
        page.getByRole("heading", {
          name: locale === "fr" ? "Nouveau formulaire" : "Nieuw formulier",
          exact: true,
        }),
      ).toBeVisible();
      await accessible(page);
    }
    await page.goto("/fr/registrations");
    await page
      .getByLabel("Titre du formulaire", { exact: true })
      .fill("Admission pilote");
    await page
      .getByLabel("Présentation", { exact: true })
      .fill("Bienvenue au club pilote");
    await page.getByLabel("Ouvrir les candidatures", { exact: true }).check();
    await page
      .getByRole("button", { name: "Ajouter une question", exact: true })
      .click();
    await page
      .getByLabel("Libellé français", { exact: true })
      .fill("Je confirme les coordonnées");
    await page
      .getByLabel("Libellé néerlandais", { exact: true })
      .fill("Ik bevestig de gegevens");
    await page
      .getByLabel("Type de réponse", { exact: true })
      .selectOption("consent");
    await page.getByLabel("Réponse obligatoire", { exact: true }).check();
    await page
      .getByRole("button", { name: "Ajouter une question", exact: true })
      .click();
    await page
      .getByLabel("Libellé français", { exact: true })
      .nth(1)
      .fill("Pièce facultative");
    await page
      .getByLabel("Libellé néerlandais", { exact: true })
      .nth(1)
      .fill("Optioneel bestand");
    await page
      .getByLabel("Type de réponse", { exact: true })
      .nth(1)
      .selectOption("file");
    await page
      .getByRole("button", { name: "Aperçu du formulaire", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Aperçu du formulaire", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT id FROM registration_form WHERE organization_id=$1",
              [org],
            )
          ).rowCount,
      )
      .toBe(1);
    const form = (
      await db.query(
        "SELECT id FROM registration_form WHERE organization_id=$1",
        [org],
      )
    ).rows[0].id;
    const anon = await browser.newContext({ baseURL: origin }),
      anonPage = await anon.newPage();
    for (const locale of ["fr", "nl"]) {
      await anonPage.goto("/" + locale + "/inscription/" + form);
      await expect(
        anonPage.getByRole("heading", {
          name: "Admission pilote",
          exact: true,
        }),
      ).toBeVisible();
      await accessible(anonPage);
    }
    const widget = await anon.request.get("/fr/registration-widget/" + form);
    expect(widget.status()).toBe(200);
    expect(widget.headers()["x-frame-options"]).toBeUndefined();
    expect(
      (await anon.request.get("/fr/inscription/" + form)).headers()[
        "x-frame-options"
      ],
    ).toBe("DENY");
    await anon.close();
    await candidatePage.goto("/fr/inscription/" + form);
    await candidatePage
      .getByLabel("Nom et prénom du candidat", { exact: true })
      .fill("Enfant Pilote");
    await candidatePage
      .getByLabel("Date de naissance", { exact: true })
      .fill("2015-03-04");
    await candidatePage
      .getByLabel("Je confirme le nom et la date de naissance saisis.", {
        exact: true,
      })
      .check();
    await candidatePage
      .getByRole("button", { name: "Préparer ma candidature", exact: true })
      .click();
    await expect(candidatePage).toHaveURL(/\/fr\/registrations\/mine/);
    await expect(
      candidatePage.getByRole("heading", {
        name: "Enfant Pilote",
        exact: true,
      }),
    ).toBeVisible();
    await candidatePage
      .getByLabel("Je confirme les coordonnées *", { exact: true })
      .check();
    await candidatePage
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT version FROM registration_application WHERE applicant_user_id=$1",
              [candidate.id],
            )
          ).rows[0]?.version,
      )
      .toBe(2);
    const app = (
      await db.query(
        "SELECT id FROM registration_application WHERE applicant_user_id=$1",
        [candidate.id],
      )
    ).rows[0].id;
    const bytes = Buffer.from("%PDF-1.7\nTest fixture");
    await candidatePage
      .getByLabel("Pièce facultative", { exact: true })
      .setInputFiles({
        name: "proof.pdf",
        mimeType: "application/pdf",
        buffer: bytes,
      });
    await candidatePage
      .getByRole("button", { name: "Déposer la pièce", exact: true })
      .click();
    await expect(
      candidatePage.getByRole("link", { name: "proof.pdf", exact: true }),
    ).toBeVisible();
    const file = (
      await db.query(
        "SELECT id FROM registration_attachment WHERE application_id=$1",
        [app],
      )
    ).rows[0].id;
    const download = await candidatePage.request.get(
      "/api/registrations/file/" + file,
    );
    expect(await download.body()).toEqual(bytes);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(
      (await page.request.get("/api/registrations/file/" + file)).status(),
    ).toBe(404);
    await candidatePage
      .getByRole("button", { name: "Soumettre au club", exact: true })
      .click();
    await expect(
      candidatePage.getByRole("button", {
        name: "Enfant Pilote · Soumis",
        exact: true,
      }),
    ).toBeVisible();
    await accessible(candidatePage);
    await page.reload();
    await page
      .getByRole("button", { name: "Enfant Pilote · Soumis", exact: true })
      .click();
    await page
      .getByLabel("Note réservée aux responsables", { exact: true })
      .fill("Note confidentielle du club");
    await page
      .getByRole("button", { name: "Ajouter la note", exact: true })
      .click();
    await expect(
      page.getByText("Note confidentielle du club", { exact: true }),
    ).toBeVisible();
    async function decision(status: string, message: string) {
      await page.getByLabel("État", { exact: true }).selectOption(status);
      await page
        .getByLabel("Réponse au candidat", { exact: true })
        .fill(message);
      await page
        .getByRole("button", { name: "Enregistrer la décision", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await db.query(
                "SELECT status FROM registration_application WHERE id=$1",
                [app],
              )
            ).rows[0].status,
        )
        .toBe(status);
    }
    await decision("incomplete", "Veuillez confirmer vos coordonnées");
    await candidatePage.reload();
    await expect(
      candidatePage.getByText("Veuillez confirmer vos coordonnées", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      candidatePage.getByText("Note confidentielle du club", { exact: true }),
    ).toHaveCount(0);
    await candidatePage
      .getByRole("button", { name: "Soumettre au club", exact: true })
      .click();
    await expect(
      candidatePage.getByRole("button", {
        name: "Enfant Pilote · Soumis",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Enfant Pilote · Soumis", exact: true })
      .click();
    await decision("waiting", "En attente de place");
    await page
      .getByLabel("Afficher les dossiers", { exact: true })
      .selectOption("waiting");
    await expect(
      page.getByRole("button", {
        name: "Enfant Pilote · Liste d’attente",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Affecter à une équipe (facultatif)", { exact: true })
      .selectOption(team);
    await decision("accepted", "Bienvenue dans notre club");
    await page
      .getByLabel("Afficher les dossiers", { exact: true })
      .selectOption("recent");
    await expect(
      page.getByRole("button", {
        name: "Enfant Pilote · Accepté",
        exact: true,
      }),
    ).toBeVisible();
    await accessible(page);
    await page.screenshot({
      path: "test-results/registrations.png",
      fullPage: true,
    });
    await candidatePage.reload();
    await expect(candidatePage.getByText(/Après admission/)).toBeVisible();
    expect(
      (
        await db.query("SELECT id FROM club_person WHERE organization_id=$1", [
          org,
        ])
      ).rowCount,
    ).toBe(1);
    const nextSeason = (
      await db.query(
        "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2027','2027-01-01','2027-12-31') RETURNING id",
        [org],
      )
    ).rows[0].id;
    await page.reload();
    await page
      .getByRole("button", {
        name: "Dupliquer pour une nouvelle saison",
        exact: true,
      })
      .click();
    await page.locator("main").getByLabel("Saison", { exact: true }).selectOption(nextSeason);
    await page
      .getByLabel("Titre du formulaire", { exact: true })
      .fill("Réinscription 2027");
    await page.getByLabel("Ouvrir les candidatures", { exact: true }).check();
    await expect(
      page.getByLabel("Libellé français", { exact: true }).first(),
    ).toHaveValue("Je confirme les coordonnées");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT id FROM registration_form WHERE organization_id=$1",
              [org],
            )
          ).rowCount,
      )
      .toBe(2);
    const nextForm = (
      await db.query(
        "SELECT id FROM registration_form WHERE organization_id=$1 AND season_id=$2",
        [org, nextSeason],
      )
    ).rows[0].id;
    await candidatePage.goto("/fr/inscription/" + nextForm);
    await candidatePage
      .getByLabel(
        "Réinscription : choisissez une candidature acceptée d’une saison précédente",
        { exact: true },
      )
      .selectOption(app);
    await expect(
      candidatePage.getByLabel("Nom et prénom du candidat", { exact: true }),
    ).toHaveValue("Enfant Pilote");
    await expect(
      candidatePage.getByLabel("Date de naissance", { exact: true }),
    ).toHaveValue("2015-03-04");
    await candidatePage
      .getByLabel("Je confirme le nom et la date de naissance saisis.", {
        exact: true,
      })
      .check();
    await candidatePage
      .getByRole("button", { name: "Préparer ma candidature", exact: true })
      .click();
    await expect(candidatePage).toHaveURL(/registrations\/mine/);
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT id FROM registration_application WHERE applicant_user_id=$1",
              [candidate.id],
            )
          ).rowCount,
      )
      .toBe(2);
    expect(
      (
        await page.request.post("/api/registrations", {
          headers: { origin: "https://invalid.example" },
          data: { action: "note", id: app, message: "Rejected" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await candidateContext.close();
    await db.end();
  }
});
