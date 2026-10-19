import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { totp } from "../support/totp";
import { localAt, shiftLocal } from "../../src/domains/calendar/time";
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
test("calendar venue, recurring exceptions, cancellation, views and revoked private ICS", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use npm run test:e2e:db");
  test.setTimeout(120000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL }),
    playerContext = await browser.newContext({ baseURL: origin }),
    playerPage = await playerContext.newPage(),
    anon = await browser.newContext();
  try {
    await db.query('DELETE FROM "rateLimit"');
    const password = "Calendar-fixture-only-2026!";
    async function signup(target: Page, name: string) {
      const r = await target.request.post("/api/auth/sign-up/email", {
        headers: { origin },
        data: {
          name,
          email: "calendar-" + crypto.randomUUID() + "@example.test",
          password,
        },
      });
      expect(r.status()).toBe(200);
      return (await r.json()).user;
    }
    const admin = await signup(page, "Calendar President"),
      player = await signup(playerPage, "Calendar Player");
    const enabled = await page.request.post("/api/auth/two-factor/enable", {
      headers: { origin },
      data: { password },
    });
    expect(enabled.status()).toBe(200);
    const secret = new URL((await enabled.json()).totpURI).searchParams.get(
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
        "INSERT INTO organization(name,kind) VALUES('Club Planning','club') RETURNING id",
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
      const m = (
        await db.query(
          "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
          [org, user.id, role],
        )
      ).rows[0].id;
      expect(
        (
          await target.request.post("/api/workspace", {
            headers: { origin },
            data: { action: "context", mandateId: m },
          })
        ).status(),
      ).toBe(200);
    }
    const season = (
        await db.query(
          "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Planning pilote','2020-01-01','2099-12-31') RETURNING id",
          [org],
        )
      ).rows[0].id,
      team = (
        await db.query(
          "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe pilote') RETURNING id",
          [org, season],
        )
      ).rows[0].id,
      profile = (
        await db.query(
          "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,'Calendar Player','1990-01-01' FROM person WHERE user_id=$2 RETURNING id",
          [org, player.id],
        )
      ).rows[0].id;
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')",
      [org, team, profile],
    );
    for (const locale of ["fr", "nl"]) {
      await page.goto("/" + locale + "/calendar");
      await expect(
        page.getByRole("heading", {
          name: locale === "fr" ? "Agenda" : "Agenda",
          exact: true,
        }),
      ).toBeVisible();
      await accessible(page);
    }
    await page.goto("/fr/calendar");
    await page
      .locator("summary")
      .filter({ hasText: /^Lieux$/ })
      .click();
    await page.getByLabel("Nom du lieu", { exact: true }).fill("Salle pilote");
    await page.getByLabel("Adresse", { exact: true }).fill("Rue du sport 1");
    await page.getByLabel("Capacité (facultative)", { exact: true }).fill("10");
    await page.getByLabel("Accès PMR", { exact: true }).check();
    await page.getByLabel("Recharge", { exact: true }).check();
    await page
      .getByRole("button", { name: "Enregistrer le lieu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Salle pilote", exact: true }),
    ).toBeVisible();
    const place = (
        await db.query(
          "SELECT id FROM calendar_place WHERE organization_id=$1",
          [org],
        )
      ).rows[0].id,
      date = shiftLocal(localAt(new Date(), "Europe/Brussels"), 14).slice(
        0,
        10,
      );
    await page.getByLabel("Date de référence", { exact: true }).fill(date);
    await page.getByLabel("Vue", { exact: true }).selectOption("list");
    await page
      .getByRole("button", { name: "Ajouter un événement", exact: true })
      .click();
    await expect(page.locator("#event-zone")).toHaveCount(0);
    await page.getByLabel("Titre", { exact: true }).fill("Entraînement pilote");
    await page
      .getByLabel("Début (heure locale)", { exact: true })
      .fill(date + "T18:00");
    await page
      .getByLabel("Fin (heure locale)", { exact: true })
      .fill(date + "T20:00");
    await page
      .getByLabel("Équipe", { exact: true })
      .filter({ visible: true })
      .nth(1)
      .selectOption(team);
    const editor = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Enregistrer l’événement",
        exact: true,
      }),
    });
    await editor.getByLabel("Lieu", { exact: true }).selectOption(place);
    await editor.getByLabel("Visibilité", { exact: true }).selectOption("team");
    await editor.getByLabel("Récurrence", { exact: true }).selectOption("7");
    await editor
      .getByLabel("Nombre d’occurrences (maximum 52)", { exact: true })
      .fill("3");
    await editor
      .getByRole("button", { name: "Enregistrer l’événement", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Entraînement pilote · Programmé",
        exact: true,
      }),
    ).toHaveCount(3);
    const records = (
      await db.query(
        "SELECT id FROM calendar_event WHERE organization_id=$1 ORDER BY ordinal",
        [org],
      )
    ).rows;
    await page
      .getByRole("button", {
        name: "Entraînement pilote · Programmé",
        exact: true,
      })
      .nth(1)
      .click();
    await page
      .locator("#event-details")
      .getByRole("button", { name: "Modifier cet événement", exact: true })
      .click();
    await page
      .getByLabel("Début (heure locale)", { exact: true })
      .fill(shiftLocal(date + "T10:00", 7));
    await page
      .getByLabel("Fin (heure locale)", { exact: true })
      .fill(shiftLocal(date + "T11:00", 7));
    await page
      .getByRole("button", { name: "Enregistrer l’événement", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT is_exception FROM calendar_event WHERE id=$1",
              [records[1].id],
            )
          ).rows[0].is_exception,
      )
      .toBe(true);
    await page
      .getByRole("button", {
        name: "Entraînement pilote · Programmé",
        exact: true,
      })
      .nth(2)
      .click();
    await page
      .getByLabel("Motif d’annulation", { exact: true })
      .fill("Vacances du club");
    await page
      .getByRole("button", {
        name: "Annuler les occurrences sélectionnées",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Entraînement pilote · Annulé",
        exact: true,
      }),
    ).toHaveCount(1);
    await page
      .getByRole("button", {
        name: "Entraînement pilote · Programmé",
        exact: true,
      })
      .first()
      .click();
    await page
      .locator("#event-details")
      .getByRole("button", { name: "Modifier cet événement", exact: true })
      .click();
    const edit = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Enregistrer l’événement",
        exact: true,
      }),
    });
    await edit
      .getByLabel("Début (heure locale)", { exact: true })
      .fill(date + "T19:00");
    await edit
      .getByLabel("Fin (heure locale)", { exact: true })
      .fill(date + "T21:00");
    await edit
      .getByLabel("Appliquer la modification", { exact: true })
      .selectOption("following");
    await edit
      .getByRole("button", { name: "Enregistrer l’événement", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT local_start FROM calendar_event WHERE id=$1",
              [records[0].id],
            )
          ).rows[0].local_start,
      )
      .toBe(date + "T19:00");
    expect(
      (
        await db.query(
          "SELECT local_start,status FROM calendar_event WHERE id=$1",
          [records[1].id],
        )
      ).rows[0].local_start,
    ).toBe(shiftLocal(date + "T10:00", 7));
    await page
      .locator("summary")
      .filter({ hasText: /^Lieux$/ })
      .click();
    for (const mode of ["month", "week", "list"]) {
      await page.getByLabel("Vue", { exact: true }).selectOption(mode);
      if (mode === "week" || mode === "month")
        await page.screenshot({
          path: "test-results/calendar-" + mode + ".png",
          fullPage: true,
        });
      await accessible(page);
    }
    await page.getByLabel("Vue", { exact: true }).selectOption("list");
    await page.screenshot({
      path: "test-results/calendar.png",
      fullPage: true,
    });
    await playerPage.goto("/fr/calendar");
    await playerPage.getByLabel("Vue", { exact: true }).selectOption("list");
    await playerPage
      .getByLabel("Date de référence", { exact: true })
      .fill(date);
    await expect(
      playerPage.getByRole("button", {
        name: "Entraînement pilote · Annulé",
        exact: true,
      }),
    ).toHaveCount(1);
    await playerPage
      .getByRole("link", { name: "S’abonner au calendrier", exact: true })
      .click();
    await playerPage
      .getByLabel("Nom de l’abonnement", { exact: true })
      .fill("Mon planning");
    await playerPage
      .getByRole("button", { name: "Créer mon lien privé", exact: true })
      .click();
    const feed = await playerPage
      .getByLabel("Lien privé à conserver", { exact: true })
      .inputValue();
    const response = await anon.request.get(feed);
    expect(response.status()).toBe(200);
    const ics = await response.text();
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:" + records[0].id + "@pfm");
    expect(ics).not.toContain("Calendar Player");
    await playerPage
      .getByRole("button", { name: "Révoquer", exact: true })
      .click();
    await expect
      .poll(async () => (await anon.request.get(feed)).status())
      .toBe(404);
    await page
      .getByRole("button", { name: "Ajouter un événement", exact: true })
      .click();
    await page.getByLabel("Titre", { exact: true }).fill("Autre événement");
    await page
      .getByLabel("Début (heure locale)", { exact: true })
      .fill(date + "T19:00");
    await page
      .getByLabel("Fin (heure locale)", { exact: true })
      .fill(date + "T20:00");
    const fresh = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Enregistrer l’événement",
        exact: true,
      }),
    });
    await fresh.getByLabel("Lieu", { exact: true }).selectOption(place);
    await fresh
      .getByRole("button", { name: "Enregistrer l’événement", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "déjà occupé" }),
    ).toHaveCount(1);
    expect(
      (
        await db.query(
          "SELECT id FROM calendar_event WHERE organization_id=$1",
          [org],
        )
      ).rowCount,
    ).toBe(3);
    expect(
      (
        await page.request.post("/api/calendar", {
          headers: { origin: "https://invalid.example" },
          data: {
            action: "feed",
            name: "Wrong",
            teamId: null,
            organizationId: org,
          },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/fr/messages");
    await page
      .getByLabel("Objet", { exact: true })
      .fill("Organisation entraînement");
    await page
      .getByLabel("Destinataires", { exact: true })
      .selectOption(player.id);
    await page
      .getByLabel("Message", { exact: true })
      .fill("Rendez-vous à la salle à 18 h.");
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(
      page.getByText("Rendez-vous à la salle à 18 h.", { exact: true }),
    ).toBeVisible();
    await playerPage.goto("/fr/messages");
    await playerPage
      .getByRole("button", { name: "Organisation entraînement", exact: true })
      .click();
    await playerPage
      .getByLabel("Message", { exact: true })
      .fill("Merci, je serai présent.");
    await playerPage
      .getByRole("button", { name: "Répondre", exact: true })
      .click();
    await expect(
      playerPage.getByText("Merci, je serai présent.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Actualiser", exact: true }).click();
    await expect(
      page.getByText("Merci, je serai présent.", { exact: true }),
    ).toBeVisible();
    await accessible(page);
    await page.screenshot({
      path: "test-results/messages.png",
      fullPage: true,
    });
  } finally {
    await anon.close();
    await playerContext.close();
    await db.end();
  }
});
