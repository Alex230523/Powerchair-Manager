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
    await page.evaluate(() => {
        const over = document.documentElement.scrollWidth - innerWidth;
        if (over <= 0) return [];
        // Names the widest offenders so the failure says what sticks out.
        return [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== "fixed")
          .slice(0, 12)
          .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} right=${Math.round(e.getBoundingClientRect().right)} (over ${over}px)`);
      }),
  ).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 900 });
}
test("invitation response, offline refusal, independent pointage, closure and traced correction", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(60000);
  page.setDefaultTimeout(10000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL }),
    playerContext = await browser.newContext({ baseURL: origin }),
    playerPage = await playerContext.newPage();
  playerPage.setDefaultTimeout(10000);
  try {
    await db.query('DELETE FROM "rateLimit"');
    const password = "Attendance-fixture-only-2026!";
    async function signup(target: Page, name: string) {
      const r = await signUpVia(target, db, {
        headers: { origin },
        data: {
          name,
          email: "attendance-" + crypto.randomUUID() + "@example.test",
          password,
        },
      });
      expect(r.status()).toBe(200);
      return (await r.json()).user;
    }
    const admin = await signup(page, "Attendance President"),
      player = await signup(playerPage, "Attendance Player");
    // Sign out and back in: email and password only, no second factor (removed 21/10/2026).
    expect(
      (
        await page.request.post("/api/auth/sign-out", {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    const login = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin },
      data: { email: admin.email, password },
    });
    expect(login.status()).toBe(200);
    expect((await login.json()).twoFactorRedirect).not.toBe(true);
    const org = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Club Presence','club') RETURNING id",
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
    const year = new Date().getUTCFullYear(),
      season = (
        await db.query(
          "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Pilot season',$2,$3) RETURNING id",
          [org, year + "-01-01", year + 1 + "-01-01"],
        )
      ).rows[0].id,
      team = (
        await db.query(
          "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Pilot team') RETURNING id",
          [org, season],
        )
      ).rows[0].id,
      person = (
        await db.query("SELECT id FROM person WHERE user_id=$1", [player.id])
      ).rows[0].id,
      profile = (
        await db.query(
          "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,'Attendance Player','1990-01-01') RETURNING id",
          [org, person],
        )
      ).rows[0].id;
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')",
      [org, team, profile],
    );
    const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const created = await page.request.post("/api/calendar", {
      headers: { origin },
      data: {
        organizationId: org,
        action: "create",
        requestId: crypto.randomUUID(),
        title: "Training presence",
        kind: "training",
        customType: "",
        timezone: "Europe/Brussels",
        localStart: day + "T18:00",
        localEnd: day + "T20:00",
        fold: "reject",
        teamId: team,
        placeId: null,
        responsibleId: admin.id,
        visibility: "team",
        equipment: "",
        instructions: "",
        participants: [],
        documents: [],
        intervalDays: 0,
        occurrences: 1,
      },
    });
    expect(created.status()).toBe(200);
    const event = (await created.json()).id;
    for (const locale of ["fr", "nl"]) {
      await page.goto("/" + locale + "/attendance");
      await expect(
        page.getByRole("button", { name: /Training presence/ }),
      ).toBeVisible();
      await accessible(page);
    }
    await page.goto("/fr/attendance");
    await page.getByRole("button", { name: /Training presence/ }).click();
    await page
      .getByLabel("Effectif confirmé minimum", { exact: true })
      .fill("1");
    await page
      .getByRole("button", {
        name: "Envoyer / modifier les invitations",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Registre ouvert ·", { exact: false }),
    ).toBeVisible();
    await playerPage.goto("/fr/attendance");
    await playerPage.getByRole("button", { name: /Training presence/ }).click();
    await playerPage
      .getByLabel("Réponse déclarée", { exact: true })
      .selectOption("present");
    await playerPage
      .getByLabel("Commentaire facultatif", { exact: true })
      .fill("Transport confirmé");
    await playerPage.route("**/api/attendance", (route) =>
      route.abort("internetdisconnected"),
    );
    await playerPage
      .getByRole("button", { name: "Enregistrer ma réponse", exact: true })
      .click();
    await expect(
      playerPage
        .getByRole("alert")
        .filter({ hasText: "Connexion indisponible" }),
    ).toBeVisible();
    expect(
      (
        await db.query(
          "SELECT response FROM attendance_invitation WHERE profile_id=$1",
          [profile],
        )
      ).rows[0].response,
    ).toBe("none");
    await playerPage.unroute("**/api/attendance");
    await playerPage
      .getByRole("button", { name: "Enregistrer ma réponse", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT response FROM attendance_invitation WHERE profile_id=$1",
              [profile],
            )
          ).rows[0].response,
      )
      .toBe("present");
    await db.query(
      "UPDATE calendar_event SET starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' WHERE id=$1",
      [event],
    );
    await page.getByRole("button", { name: "Actualiser", exact: true }).click();
    await expect(
      page.getByLabel("Présence constatée", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Présence constatée", { exact: true })
      .selectOption("absent");
    await page
      .getByRole("button", { name: "Enregistrer le pointage", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT actual FROM attendance_invitation WHERE profile_id=$1",
              [profile],
            )
          ).rows[0].actual,
      )
      .toBe("absent");
    await page
      .getByRole("button", { name: "Clôturer le registre", exact: true })
      .click();
    await expect(
      page.getByText(/^Registre clôturé · Date limite/),
    ).toBeVisible();
    await page
      .getByLabel("Présence constatée", { exact: true })
      .selectOption("late");
    await page
      .getByLabel("Motif de correction (obligatoire après clôture)", {
        exact: true,
      })
      .fill("Arrivée confirmée à 18 h 15");
    await page
      .getByRole("button", { name: "Enregistrer le pointage", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT actual FROM attendance_invitation WHERE profile_id=$1",
              [profile],
            )
          ).rows[0].actual,
      )
      .toBe("late");
    expect(
      (
        await db.query(
          "SELECT response,comment FROM attendance_invitation WHERE profile_id=$1",
          [profile],
        )
      ).rows[0],
    ).toMatchObject({ response: "present", comment: "Transport confirmé" });
    await expect(
      page.getByText("Assiduité : 100 %", { exact: false }).first(),
    ).toBeVisible();
    await accessible(page);
    await page.screenshot({
      path: "test-results/attendance.png",
      fullPage: true,
    });
    expect(
      (
        await playerPage.request.post("/api/attendance", {
          headers: { origin },
          data: {
            organizationId: org,
            action: "mark",
            id: (
              await db.query(
                "SELECT id FROM attendance_invitation WHERE profile_id=$1",
                [profile],
              )
            ).rows[0].id,
            expectedVersion: 4,
            actual: "absent",
            reason: "",
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/attendance", {
          headers: { origin: "https://untrusted.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    // Wave 16 (S1): the statistics open on the Club tab; the closed register feeds the attendance curve.
    await page.goto("/fr/statistics");
    await expect(
      page.getByRole("heading", { name: "Statistiques", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("#stats-attendance").getByRole("group", { name: /^Taux de présence/ }),
    ).toBeVisible();
    await accessible(page);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export CSV", exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(
      /^statistics-.*\.csv$/,
    );
    await page.screenshot({
      path: "test-results/statistics.png",
      fullPage: true,
    });
    for (const [locale, title] of [
      ["en", "Statistics"],
      ["nl", "Statistieken"],
    ]) {
      await page.goto("/" + locale + "/statistics");
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await accessible(page);
    }
    await page.goto("/fr/access");
    await expect(
      page.getByText("double authentification", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Membres et profils d’accès",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await playerContext.close().catch(() => {});
    await db.end();
  }
});
