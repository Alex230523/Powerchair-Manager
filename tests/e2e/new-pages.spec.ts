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
  // The profile select lives in the sidebar foot menu (wave 12): open it first.
  await page.locator(".profile-menu > summary").click();
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
  test.setTimeout(420000);
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
      "/fr/trips",
      "/fr/venues",
      "/fr/offline-book",
      "/fr/fundraising",
      "/fr/dues/attestations",
      "/fr/club/rollover",
      "/fr/communication",
      "/fr/equipment",
      "/fr/messages",
    ])
      await check(page, path);
    // Wave 9: each Communication tab, a group, a newsletter draft and its preview.
    await page.goto("/fr/communication");
    await expect(page.getByRole("tab", { name: "Newsletter", exact: true })).toBeVisible();
    const axe = async (label: string, scope?: string) => {
      const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
      if (scope) builder.include(scope);
      expect((await builder.analyze()).violations.map((v) => `${label} ${v.id}`), label).toEqual([]);
    };
    await page.getByRole("tab", { name: "Groupes", exact: true }).click();
    await page.getByRole("button", { name: "Nouveau groupe", exact: true }).click();
    await page.getByLabel("Nom du groupe", { exact: true }).fill("Tous les joueurs");
    await page.getByLabel("Joueurs", { exact: true }).check();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tous les joueurs" })).toBeVisible();
    await axe("groups");
    await page.getByRole("tab", { name: "Newsletter", exact: true }).click();
    await page.getByRole("button", { name: "Nouvelle newsletter", exact: true }).click();
    await page.getByLabel("Objet", { exact: true }).fill("Nouvelles de la saison");
    await page.getByLabel("Titre 1", { exact: true }).fill("Bienvenue");
    await page.getByLabel("Texte 2", { exact: true }).fill("La saison commence samedi.");
    await page.getByLabel("Tous les joueurs", { exact: false }).check();
    await axe("newsletter editor");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nouvelles de la saison" })).toBeVisible();
    await page.getByRole("button", { name: "Aperçu : Nouvelles de la saison" }).click();
    // The preview is a sandboxed frame: axe cannot enter it, the dialog itself is checked.
    await expect(page.getByTitle("Aperçu de la newsletter")).toBeVisible();
    const dialogViolations = (
      await new AxeBuilder({ page })
        .include("dialog")
        .exclude("iframe")
        .options({ iframes: false })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => v.id);
    expect(dialogViolations).toEqual([]);
    await page.keyboard.press("Escape");
    for (const name of ["Mails d'événements", "Anciens", "Expéditeur"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await axe(name);
    }
    // An unknown unsubscribe link says so, politely and accessibly.
    await page.goto("/fr/desinscription/00000000-0000-4000-8000-000000000000");
    await expect(page.locator("main [role=alert]")).toHaveText("Ce lien n'est pas valable.");
    await axe("unsubscribe");
    // A trip page with its sections (participants, transport, care, offline).
    const tripId = (
      await db.query(
        "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,created_by) VALUES($1,'Tournoi test','tournament',CURRENT_DATE+10,CURRENT_DATE+11,$2) RETURNING id",
        [club, user],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO trip_participant(trip_id,profile_id,role,status,chair) SELECT $1,id,'player','confirmed','powerchair' FROM club_person WHERE organization_id=$2",
      [tripId, club],
    );
    await check(page, `/fr/trips/${tripId}`);

    // Wave 10: the home dashboard, the attendance table, the dues table and
    // the registrations inbox pass axe; the menu lost "Messagerie".
    for (const path of ["/fr", "/fr/dues", "/fr/attendance", "/fr/registrations"])
      await check(page, path);
    await expect(
      page.locator("nav").getByRole("link", { name: "Messagerie", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: "Statistiques", exact: true })).toBeVisible();
    // Presence thresholds: the president lowers the bar for trainings (Settings > Activities since wave 15).
    await page.goto("/fr/settings/activities");
    const okPlayers = page.getByLabel("Entraînements · Joueurs · Suffisant à partir de", { exact: true });
    await expect(okPlayers).toHaveValue("5");
    await okPlayers.fill("3");
    await page.getByLabel("Entraînements · Joueurs · Tendu à partir de", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Enregistrer les seuils", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Seuils enregistrés." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Entraînements · Joueurs · Suffisant à partir de", { exact: true })).toHaveValue("3");
    // The dashboard: to-do blocks, key figures on the left, the agenda on the right.
    await page.goto("/fr");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^À faire/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prochains événements", exact: true })).toBeVisible();
    await expect(page.getByText("Accès rapide", { exact: true })).toHaveCount(0);

    // Wave 11: contact book, grants and partners pages; trips and halls reached
    // from the calendar; notifications inside settings; the photo corner opens Mon espace.
    for (const path of ["/fr/contacts", "/fr/funding/grants", "/fr/funding/partners"]) await check(page, path);
    for (const name of ["Annuaire des salles", "Notifications", "Licences", "Mon espace", "Messagerie"])
      await expect(page.locator("nav").getByRole("link", { name, exact: true, includeHidden: true })).toHaveCount(0);
    // Menu groups are folded until opened: the entries exist, visible or not. Wave 14 regroups the
    // president's menu: Équipes, Activités (trips and halls are back), Communication, Argent, Club, Plus.
    for (const name of ["Transferts", "Finances", "Déplacements", "Salles", "Mes équipes", "Réglages"])
      await expect(page.locator("nav").getByRole("link", { name, exact: true, includeHidden: true })).toHaveCount(1);
    for (const name of ["Équipes", "Activités", "Communication", "Argent", "Club", "Plus"])
      await expect(page.locator("nav summary").filter({ hasText: name })).toHaveCount(1);
    await page.goto("/fr/calendar");
    await expect(page.locator("main").getByRole("link", { name: "Déplacements", exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Annuaire des salles", exact: true })).toBeVisible();
    // Wave 15: notifications and dues rates sit in their own settings sub-pages; the photo is in My account.
    await page.goto("/fr/settings");
    await expect(page.getByRole("heading", { name: "Notifications et résumé", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Argent", exact: true })).toBeVisible();
    await page.goto("/fr/settings/money");
    await expect(page.getByRole("heading", { name: "Cotisations", exact: true }).first()).toBeVisible();
    await page.locator(".profile-menu > summary").click();
    await page.locator(".profile-menu").getByRole("link", { name: "Mon compte", exact: true }).click();
    await expect(page).toHaveURL("/fr/settings/account");
    await expect(page.getByRole("heading", { name: "Photo de profil", exact: true })).toBeVisible();
    // A contact, then a grant linked to it.
    await page.goto("/fr/contacts");
    await page.getByRole("button", { name: "Nouveau contact", exact: true }).click();
    const contact = page.getByRole("dialog", { name: "Nouveau contact" });
    await contact.getByLabel("Nom", { exact: true }).fill("Marc Dupont");
    await contact.getByLabel("Organisation", { exact: true }).fill("Commune");
    await contact.getByLabel("Pouvoirs publics", { exact: true }).check();
    await contact.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.locator("main .contact-table")).toContainText("Marc Dupont");
    await page.goto("/fr/funding/grants");
    await page.getByRole("button", { name: "Nouvelle demande", exact: true }).click();
    const grant = page.getByRole("dialog", { name: "Nouvelle demande" });
    await grant.getByLabel(/^Organisme/).fill("Commune de Schaerbeek");
    await grant.getByLabel("Montant demandé (€)", { exact: true }).fill("8000");
    await grant.getByLabel("Date limite de dépôt", { exact: true }).fill("2026-12-01");
    await grant.getByLabel("Contact").selectOption({ label: "Marc Dupont · Commune" });
    await grant.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.locator("main table")).toContainText("Commune de Schaerbeek");
    await expect(page.locator("main table")).toContainText("Déposer le dossier");
    await check(page, "/fr/funding/grants");

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

    // Wave 13 foundations: the site serves its own fonts (serif titles, DM Sans text) and
    // nothing overflows at 1440, 1024, 390 and 320 px.
    await page.goto("/fr");
    await expect(page.locator("main h1").first()).toBeVisible();
    const fonts = await page.evaluate(() => ({
      ui: getComputedStyle(document.documentElement).getPropertyValue("--font-dm-sans").trim(),
      display: getComputedStyle(document.documentElement).getPropertyValue("--font-source-serif").trim(),
      h1: getComputedStyle(document.querySelector("main h1")!).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
      links: [...document.querySelectorAll('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]')].length,
    }));
    expect(fonts.ui).not.toBe("");
    expect(fonts.display).not.toBe("");
    expect(fonts.h1).not.toBe(fonts.body);
    expect(fonts.links).toBe(0);
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/fr", "/fr/players", "/fr/calendar", "/fr/funding", "/fr/settings", "/fr/teams"]) {
        await page.goto(path);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.getByText(/^Chargement/)).toHaveCount(0, { timeout: 15000 });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, `${path} at ${width}px`).toBeLessThanOrEqual(1);
      }
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
