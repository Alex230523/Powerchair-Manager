import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * Smoke test of the pages added by waves 1 to 5: each one opens for the right
 * profile, finishes loading without an error and passes the axe WCAG 2.2 AA
 * checks. The account holds three profiles (club president, federation
 * president, referee) and switches between them like a real user.
 */
async function switchProfile(page: Page, assignment: string) {
  await page.goto("/fr");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByLabel("Profil actif", { exact: true }).selectOption(assignment),
  ]);
}
async function check(page: Page, path: string) {
  await page.goto(path);
  const heading = page.locator("main h1").first();
  await expect(heading, path).toBeVisible({ timeout: 15000 });
  // Views load after the first paint: wait until no loading text remains.
  await expect(page.getByText(/^Chargement/)).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(
    page.getByText(/Page indisponible|Cette page est réservée|est réservée aux personnes/),
    path,
  ).toHaveCount(0);
  await expect(page.locator("main [role=alert]"), path).toHaveCount(0);
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${path} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, path).toEqual([]);
}

test("new club, federation and referee pages load and pass axe", async ({
  page,
}) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `pages-${Date.now()}@example.test`;
  try {
    await page.goto("/fr/access");
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await page
      .getByLabel("Nom complet", { exact: true })
      .fill("Pages test president");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page
      .getByLabel("Mot de passe (12 caractères minimum)", { exact: true })
      .fill("Browser-test-passphrase-2026!");
    // Sign-up is rate limited (3 per 10 s per address) and the previous spec
    // has just created accounts: wait for the window once if refused.
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page
        .getByRole("button", { name: "Créer mon compte", exact: true })
        .click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (
      await db.query('SELECT id FROM "user" WHERE email=$1', [email])
    ).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [
      user,
    ]);
    const fed = (
      await db.query(
        "INSERT INTO organization(name,kind) VALUES('Pages federation','federation') RETURNING id",
      )
    ).rows[0].id;
    const club = (
      await db.query(
        "INSERT INTO organization(name,kind,federation_id) VALUES('Pages club','club',$1) RETURNING id",
        [fed],
      )
    ).rows[0].id;
    const roles: Record<string, string> = {};
    for (const [org, role] of [
      [club, "club_president"],
      [fed, "federation_president"],
      [fed, "referee"],
    ]) {
      await db.query(
        "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [org, user],
      );
      roles[role] = (
        await db.query(
          "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
          [org, user, role],
        )
      ).rows[0].id;
    }
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30')",
      [club],
    );
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,id,'Pages player','2008-03-01' FROM person WHERE user_id=$2",
      [club, user],
    );

    await switchProfile(page, roles.club_president);
    for (const path of [
      "/fr/funding",
      "/fr/funding/report",
      "/fr/players",
      "/fr/coaches",
      "/fr/reminders",
      "/fr/matches",
      "/fr/licenses",
      "/fr/federal-calendar",
      "/fr/privacy",
      "/fr/settings",
      "/fr/statistics",
    ])
      await check(page, path);

    await switchProfile(page, roles.federation_president);
    for (const path of [
      "/fr/federation/clubs",
      "/fr/federation/licenses",
      "/fr/federation/referees",
      "/fr/federation/courses",
    ])
      await check(page, path);

    await switchProfile(page, roles.referee);
    await check(page, "/fr/referee");

    // Phone width: the ledger and the licence table stay inside the screen.
    await switchProfile(page, roles.club_president);
    await page.setViewportSize({ width: 375, height: 760 });
    for (const path of ["/fr/funding", "/fr/licenses", "/fr/players"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(1);
    }

    // Global search: Ctrl+K opens it, a name leads to the player.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/fr/players");
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", {
      name: /Rechercher un joueur/,
    });
    await expect(box).toBeFocused();
    await box.fill("pages pla");
    const palette = page.locator(".command-palette");
    await expect(
      palette.getByRole("option", { name: /^Pages player/ }),
    ).toBeVisible();
    await expect(palette.getByRole("group", { name: "Personnes" })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include(".command-palette")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations.map((v) => v.id),
    ).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fr\/players\/[0-9a-f-]{36}$/);

    // Switching a module off removes it from the menu; switching it back restores it.
    await db.query(
      "UPDATE organization SET disabled_modules='{equipment}' WHERE id=$1",
      [club],
    );
    await page.goto("/fr/equipment");
    await expect(
      page.getByText(/Ce module est désactivé pour votre club/),
    ).toBeVisible();
    await expect(
      page.locator("nav").getByRole("link", { name: "Matériel" }),
    ).toHaveCount(0);
    await db.query(
      "UPDATE organization SET disabled_modules='{}' WHERE id=$1",
      [club],
    );
  } finally {
    await db.end();
  }
});
