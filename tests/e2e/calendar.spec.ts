import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { localAt, shiftLocal } from "../../src/domains/calendar/time";
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
      const r = await signUpVia(target, db, {
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
      // Wave 15: the agenda card is titled with the period, its views in a segmented control.
      await expect(page.getByRole("group", { name: locale === "fr" ? "Vue" : "Weergave", exact: true })).toBeVisible();
      await accessible(page);
    }
    await page.goto("/fr/calendar");
    // Wave 17 (C4): « Ajouter un lieu » in the header opens the place window.
    await page.getByRole("button", { name: "Ajouter un lieu", exact: true }).click();
    const placeWindow = page.getByRole("dialog", { name: "Ajouter un lieu" });
    await placeWindow.getByLabel("Nom du lieu", { exact: true }).fill("Salle pilote");
    await placeWindow.getByLabel("Adresse", { exact: true }).fill("Rue du sport 1");
    await placeWindow.getByLabel("Capacité (facultative)", { exact: true }).fill("10");
    await placeWindow.getByLabel("Accès PMR", { exact: true }).check();
    await placeWindow.getByLabel("Recharge", { exact: true }).check();
    await placeWindow
      .getByRole("button", { name: "Enregistrer le lieu", exact: true })
      .click();
    await expect(placeWindow).toHaveCount(0);
    await expect
      .poll(async () => (await db.query("SELECT count(*)::int AS n FROM calendar_place WHERE organization_id=$1 AND name='Salle pilote'", [org])).rows[0].n)
      .toBe(1);
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
    // Wave 15: each event is a button named in full ("…, mardi 4 novembre de 18 h à 20 h, Salle pilote").
    const scheduled = /^Entraînement pilote(?!.*Annulé$)/,
      cancelled = /^Entraînement pilote.*Annulé$/;
    await page.getByLabel("Date de référence", { exact: true }).fill(date);
    await page.getByRole("group", { name: "Vue", exact: true }).getByRole("button", { name: "Liste", exact: true }).click();
    await page
      .getByRole("button", { name: "Nouvel événement", exact: true })
      .click();
    await expect(page.locator("#event-zone")).toHaveCount(0);
    await page.getByLabel("Titre", { exact: true }).fill("Entraînement pilote");
    await page
      .getByLabel("Début (heure locale)", { exact: true })
      .fill(date + "T18:00");
    await page
      .getByLabel("Fin (heure locale)", { exact: true })
      .fill(date + "T20:00");
    const editor = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Enregistrer l’événement",
        exact: true,
      }),
    });
    await editor.getByLabel("Équipe", { exact: true }).selectOption(team);
    await editor.getByLabel("Lieu", { exact: true }).selectOption(place);
    // Wave 16 (E1): responsible, visibility and attachments live in « Avancé ».
    await editor.locator("summary", { hasText: "Avancé" }).click();
    await editor.getByLabel("Visibilité", { exact: true }).selectOption("team");
    await editor.getByLabel("Récurrence", { exact: true }).selectOption("7");
    await editor
      .getByLabel("Nombre d’occurrences (maximum 52)", { exact: true })
      .fill("3");
    await editor
      .getByRole("button", { name: "Enregistrer l’événement", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: scheduled }),
    ).toHaveCount(3);
    const records = (
      await db.query(
        "SELECT id FROM calendar_event WHERE organization_id=$1 ORDER BY ordinal",
        [org],
      )
    ).rows;
    await page
      .getByRole("button", { name: scheduled })
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
      .getByRole("button", { name: scheduled })
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
    // The sheet shows the cancellation, then closes.
    const sheet = page.getByRole("dialog", { name: "Entraînement pilote" });
    await expect(sheet.getByText("Annulé", { exact: true }).first()).toBeVisible();
    await sheet.getByRole("button", { name: "Fermer / Sluiten / Close" }).click();
    await expect(
      page.getByRole("button", { name: cancelled }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: scheduled })
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
    for (const mode of ["Mois", "Semaine", "Liste"]) {
      await page.getByRole("group", { name: "Vue", exact: true }).getByRole("button", { name: mode, exact: true }).click();
      if (mode !== "Liste")
        await page.screenshot({
          path: "test-results/calendar-" + mode + ".png",
          fullPage: true,
        });
      await accessible(page);
    }
    await page.getByRole("group", { name: "Vue", exact: true }).getByRole("button", { name: "Liste", exact: true }).click();
    await page.screenshot({
      path: "test-results/calendar.png",
      fullPage: true,
    });
    await playerPage.goto("/fr/calendar");
    await playerPage.getByRole("group", { name: "Vue", exact: true }).getByRole("button", { name: "Liste", exact: true }).click();
    await playerPage
      .getByLabel("Date de référence", { exact: true })
      .fill(date);
    await expect(
      playerPage.getByRole("button", { name: cancelled }),
    ).toHaveCount(1);
    await playerPage
      .getByRole("button", { name: "S’abonner", exact: true })
      .click();
    await playerPage
      .getByLabel("Nom du lien (pour vous y retrouver)", { exact: true })
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
      .getByRole("button", { name: /^Révoquer/ })
      .click();
    await expect
      .poll(async () => (await anon.request.get(feed)).status())
      .toBe(404);
    await page
      .getByRole("button", { name: "Nouvel événement", exact: true })
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
