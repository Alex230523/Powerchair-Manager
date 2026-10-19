import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { totp } from "../support/totp";
const origin = "http://127.0.0.1:3100";
test("notification inbox, FR/NL models, preferences and local delivery queue", async ({
  page,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use npm run test:e2e:db");
  test.setTimeout(90000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  try {
    // Reset only the isolated E2E database counters between independent fixtures.
    await db.query('DELETE FROM "rateLimit"');
    const email = `notifications-${Date.now()}@example.test`,
      password = "Notifications-fixture-2026!";
    const signup = await page.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: { email, name: "Notifications Admin", password },
    });
    expect(signup.status(), await signup.text()).toBe(200);
    const user = (await signup.json()).user;
    const enable = await page.request.post("/api/auth/two-factor/enable", {
      headers: { origin },
      data: { password },
    });
    expect(enable.status(), await enable.text()).toBe(200);
    const secret = new URL((await enable.json()).totpURI).searchParams.get(
      "secret",
    )!;
    expect(
      (
        await page.request.post("/api/auth/two-factor/verify-totp", {
          headers: { origin },
          data: { code: totp(secret) },
        })
      ).status(),
    ).toBe(200);
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Club Notifications','club') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, user.id],
    );
    const mandate = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id",
        [org, user.id],
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
    for (const locale of ["fr", "nl"]) {
      await page.goto(`/${locale}/notifications`);
      await expect(
        page.getByRole("heading", {
          name: locale === "fr" ? "Modèles d’emails" : "E-mailsjablonen",
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
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.goto("/fr/notifications");
    await page
      .getByRole("button", {
        name: "Mettre les emails de cette organisation en pause",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Objet", { exact: true })
      .fill("Message test · {organization}");
    await page
      .getByLabel("Texte du message", { exact: true })
      .fill("Bonjour {name}, votre test est prêt.\n{url}");
    await page
      .getByRole("button", { name: "Prévisualiser", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Aperçu avec des données d’exemple",
        exact: true,
      }),
    ).toBeVisible();
    const editor = page
      .locator("form")
      .filter({ has: page.getByLabel("Objet", { exact: true }) });
    await editor
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tester mes notifications", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Message test · Club Notifications",
        level: 3,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tester mes notifications", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Message test · Club Notifications",
        level: 3,
        exact: true,
      }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Marquer comme lu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Mes notifications · Non lues : 0",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Reprendre les emails de cette organisation",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => {
        await page
          .getByRole("button", { name: "Actualiser", exact: true })
          .click();
        return page.getByText("Enregistré localement", { exact: true }).count();
      })
      .toBe(1);
    const preference = page.locator("form.preference-form").filter({
      has: page.getByRole("group", {
        name: "Administration du club",
        exact: true,
      }),
    });
    await preference.getByLabel("Email", { exact: true }).uncheck();
    await preference
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.reload();
    await expect(
      preference.getByLabel("Email", { exact: true }),
    ).not.toBeChecked();
    await page.setViewportSize({ width: 320, height: 720 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({
      path: "test-results/notifications.png",
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const invalid = await page.request.post("/api/notifications", {
      headers: { origin: "https://untrusted.example" },
      data: { organizationId: org, action: "pause", paused: true },
    });
    expect(invalid.status()).toBe(403);
  } finally {
    await db.end();
  }
});
