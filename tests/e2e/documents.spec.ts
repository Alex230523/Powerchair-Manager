import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
const origin = "http://127.0.0.1:3100";
test("unverified accounts, document requests, deposit, review, versions and generated template", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use npm run test:e2e:db");
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL }),
    playerContext = await browser.newContext({ baseURL: origin }),
    playerPage = await playerContext.newPage();
  try {
    await db.query('DELETE FROM "rateLimit"');
    const password = "Documents-test-fixture-2026!";
    const signup = await page.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Document President",
        email: "docs-admin-" + crypto.randomUUID() + "@example.test",
        password,
      },
    });
    expect(signup.status()).toBe(200);
    const admin = (await signup.json()).user;
    expect(admin.emailVerified).toBe(false);
    const playerSignup = await playerPage.request.post(
      "/api/auth/sign-up/email",
      {
        headers: { origin },
        data: {
          name: "Autonomous Player",
          email: "docs-player-" + crypto.randomUUID() + "@example.test",
          password,
        },
      },
    );
    expect(playerSignup.status()).toBe(200);
    const player = (await playerSignup.json()).user;
    expect(player.emailVerified).toBe(false);
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Club Documents','club') RETURNING id",
      )
    ).rows[0].id;
    for (const [user, role, target] of [
      [admin, "club_president", page],
      [player, "player", playerPage],
    ] as const) {
      await db.query(
        "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
        [org, user.id],
      );
      const mandate = (
        await db.query(
          "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
          [org, user.id, role],
        )
      ).rows[0].id;
      expect(
        (
          await target.request.post("/api/workspace", {
            headers: { origin },
            data: { action: "context", mandateId: mandate },
          })
        ).status(),
      ).toBe(200);
    }
    const season = (
      await db.query(
        "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026','2026-01-01','2026-12-31') RETURNING id",
        [org],
      )
    ).rows[0].id;
    const profile = (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,'Autonomous Player','1990-01-01' FROM person WHERE user_id=$2 RETURNING id",
        [org, player.id],
      )
    ).rows[0].id;
    for (const locale of ["fr", "nl"]) {
      await page.goto("/" + locale + "/documents");
      await expect(
        page.getByRole("heading", {
          name: locale === "fr" ? "Bibliothèque privée" : "Privébibliotheek",
          exact: true,
        }),
      ).toBeVisible();
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
    await page.goto("/fr/documents");
    const requestPanel = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Demander un document",
        exact: true,
      }),
    });
    await requestPanel
      .getByLabel("Propriétaire", { exact: true })
      .selectOption(profile);
    await requestPanel
      .getByLabel("Saison", { exact: true })
      .selectOption(season);
    await requestPanel
      .getByLabel("Nom du document", { exact: true })
      .fill("Consentement annuel");
    await requestPanel
      .getByLabel("Catégorie", { exact: true })
      .selectOption("consent");
    await requestPanel
      .getByRole("button", { name: "Créer la demande", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Consentement annuel · Demandé",
        exact: true,
      }),
    ).toBeVisible();
    await playerPage.goto("/fr/documents");
    await playerPage
      .getByRole("button", {
        name: "Consentement annuel · Demandé",
        exact: true,
      })
      .click();
    await playerPage.getByLabel("Fichier", { exact: true }).setInputFiles({
      name: "consent.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nconsent"),
    });
    await playerPage
      .getByRole("button", {
        name: "Déposer une nouvelle version",
        exact: true,
      })
      .click();
    await expect(
      playerPage.getByRole("button", {
        name: "Consentement annuel · Déposé",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", {
        name: "Consentement annuel · Déposé",
        exact: true,
      })
      .click();
    await page.getByLabel("Décision", { exact: true }).selectOption("valid");
    await page
      .getByLabel("Date d’expiration (facultative)", { exact: true })
      .fill("2026-12-31");
    await page
      .getByRole("button", { name: "Enregistrer la décision", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Consentement annuel · Valide",
        exact: true,
      }),
    ).toBeVisible();
    await playerPage.reload();
    await playerPage
      .getByRole("button", {
        name: "Consentement annuel · Valide",
        exact: true,
      })
      .click();
    const fileLink = playerPage.getByRole("link", {
      name: "Télécharger consent.pdf",
      exact: true,
    });
    const fileResponse = await playerPage.request.get(
      (await fileLink.getAttribute("href"))!,
    );
    expect((await fileResponse.body()).toString()).toContain("consent");
    expect(fileResponse.headers()["content-type"]).toBe(
      "application/octet-stream",
    );
    const templatePanel = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Modèles de documents",
        exact: true,
      }),
    });
    await templatePanel
      .getByLabel("Nom du document", { exact: true })
      .fill("Accusé");
    await templatePanel
      .getByLabel("Texte du modèle", { exact: true })
      .fill("Bonjour {name}, dossier pour {organization}, saison {season}.");
    await templatePanel
      .getByRole("button", { name: "Enregistrer le modèle", exact: true })
      .click();
    await expect(
      page.getByLabel("Modèle", { exact: true }).first(),
    ).toBeVisible();
    const generation = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Générer depuis un modèle",
        exact: true,
      }),
    });
    await generation
      .getByLabel("Modèle", { exact: true })
      .selectOption({ label: "Accusé · fr · 1" });
    await generation
      .getByRole("button", { name: "Générer depuis un modèle", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Consentement annuel · Déposé",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Télécharger Accusé.txt", exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/documents.png",
      fullPage: true,
    });
    expect(
      (
        await db.query(
          "SELECT id FROM mail_job WHERE kind='auth_verify' AND recipient_user_id IN ($1,$2)",
          [admin.id, player.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await page.request.post("/api/documents", {
          headers: { origin: "https://invalid.example" },
          data: { action: "plan", seasonId: season, organizationId: org },
        })
      ).status(),
    ).toBe(403);
    const anonymous = await browser.newContext({ baseURL: origin });
    expect((await anonymous.request.get("/api/documents")).status()).toBe(401);
    await anonymous.close();
  } finally {
    await playerContext.close();
    await db.end();
  }
});
