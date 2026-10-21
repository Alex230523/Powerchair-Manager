import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createAuth } from "../../src/lib/auth";
import { totp } from "../support/totp";
for (const locale of ["fr", "nl"])
  test(`access form accessibility ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/access`);
    await expect(
      page.getByRole("button", {
        name: locale === "fr" ? "Se connecter" : "Aanmelden",
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
  });
test("real account without email verification, MFA, contexts, invitation, revocation and recovery", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.PFM_E2E_DATABASE_URL,
    "Use npm run test:e2e:db for persistence scenarios",
  );
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `president-${Date.now()}@example.test`,
    memberEmail = `coach-${Date.now()}@example.test`,
    password = "Browser-only-passphrase-2026!";
  async function mail(address: string, subject: string) {
    let found = "";
    await expect
      .poll(async () => {
        for (const file of (await readdir(".local/mail-e2e"))
          .sort()
          .reverse()) {
          const item = JSON.parse(
            await readFile(".local/mail-e2e/" + file, "utf8"),
          );
          if (item.email === address && item.subject.includes(subject)) {
            found = item.url;
            return true;
          }
        }
        return false;
      })
      .toBe(true);
    return found;
  }
  const memberBrowser = await browser.newContext();
  try {
    await page.goto("/fr/access");
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await page.getByLabel("Nom complet").fill("Présidente test");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill(password);
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Envoyer le lien de vérification",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
    const user = (
      await db.query('SELECT id FROM "user" WHERE email=$1', [email])
    ).rows[0];
    const orgs = [];
    for (const name of ["Club test A", "Club test B"]) {
      const org = (
        await db.query(
          "INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id",
          [name],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
        [org.id, user.id],
      );
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president')",
        [org.id, user.id],
      );
      orgs.push(org.id);
    }
    await page.reload();
    // The profile select lives in the sidebar foot menu (wave 12): open it first.
    await page.locator(".profile-menu > summary").click();
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByLabel("Profil actif")
        .selectOption({ label: "Club test A · Président de club" }),
    ]);

    await page
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill(password);
    await page
      .getByRole("button", { name: "Configurer la double authentification" })
      .click();
    const secret = await page
      .getByLabel("Clé à ajouter à votre application d’authentification")
      .inputValue();
    await page
      .getByLabel("Code de l’application d’authentification", { exact: true })
      .fill(totp(secret));
    await page
      .getByRole("button", { name: "Vérifier le code", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Membres et profils d’accès" }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/access-admin.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 720 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    // The profile select lives in the sidebar foot menu (wave 12): open it first.
    await page.locator(".profile-menu > summary").click();
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByLabel("Profil actif")
        .selectOption({ label: "Club test B · Président de club" }),
    ]);

    await expect(page.locator("header")).toContainText("Club test B");
    // The profile select lives in the sidebar foot menu (wave 12): open it first.
    await page.locator(".profile-menu > summary").click();
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByLabel("Profil actif")
        .selectOption({ label: "Club test A · Président de club" }),
    ]);

    await createAuth(db).api.signUpEmail({
      body: { email: memberEmail, name: "Coach test", password },
    });
    await page.getByLabel("Adresse email", { exact: true }).fill(memberEmail);
    await page
      .getByRole("combobox", { name: "Rôle", exact: true })
      .selectOption("coach");
    await page
      .getByRole("button", { name: "Créer l’invitation", exact: true })
      .click();
    const link = await page
      .getByLabel(
        "Lien d’invitation à transmettre à la personne concernée (valable 7 jours)",
      )
      .inputValue();
    const memberPage = await memberBrowser.newPage();
    await memberPage.goto(link);
    await memberPage
      .getByLabel("Adresse email", { exact: true })
      .fill(memberEmail);
    await memberPage
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill(password);
    await memberPage
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await memberPage
      .locator("summary")
      .filter({ hasText: "Accepter l’invitation" })
      .click();
    await memberPage
      .getByRole("button", { name: "Accepter l’invitation", exact: true })
      .click();
    // The profile select lives in the sidebar foot menu (wave 12): open it first.
    await memberPage.locator(".profile-menu > summary").click();
    await Promise.all([
      memberPage.waitForEvent("load"),
      memberPage
        .getByLabel("Profil actif")
        .selectOption({ label: "Club test A · Coach" }),
    ]);

    await expect(
      memberPage.getByRole("heading", { name: "Membres et profils d’accès" }),
    ).toHaveCount(0);
    await page.reload();
    const row = page
      .locator(".records>li")
      .filter({ has: page.getByText("Coach test", { exact: true }) });
    await row
      .getByRole("button", { name: "Révoquer l’accès", exact: true })
      .click();
    await row
      .getByRole("button", { name: "Révoquer l’accès", exact: true })
      .click();
    await memberPage.reload();
    await expect(
      memberPage.getByText(
        "Aucun profil actif. Acceptez une invitation reçue de votre organisation.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(
      page.getByRole("heading", { name: "Se connecter", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill(password);
    await expect(page.getByLabel("Adresse email", { exact: true })).toHaveValue(
      email,
    );
    const signing = page.waitForResponse((response) =>
      response.url().endsWith("/sign-in/email"),
    );
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    const signed = await signing;
    expect(signed.status(), await signed.text()).toBe(200);
    await expect(
      page.getByLabel("Code de l’application d’authentification", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Code de l’application d’authentification", { exact: true })
      .fill(totp(secret));
    await page
      .getByRole("button", { name: "Vérifier le code", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page
      .getByRole("button", { name: "Récupérer mon accès", exact: true })
      .click();
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Récupérer mon accès", exact: true })
      .click();
    await page.goto(await mail(email, "Récupération"));
    await page
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill(password + "new");
    await page
      .getByRole("button", { name: "Définir le mot de passe", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Se connecter", exact: true }),
    ).toBeVisible();
  } finally {
    await memberBrowser.close();
    await db.end();
  }
});

test("workspace HTTP boundary rejects anonymous and cross-origin writes", async ({
  request,
}) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect(
    (
      await request.post("/api/workspace", {
        headers: { origin: "https://other.example" },
        data: {
          action: "preferences",
          locale: "fr",
          notificationsEnabled: true,
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/workspace", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {
          action: "preferences",
          locale: "fr",
          notificationsEnabled: true,
        },
      })
    ).status(),
  ).toBe(401);
});
