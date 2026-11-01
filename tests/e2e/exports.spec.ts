import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { prepareSignIn } from "../support/session";

/**
 * Wave 17 (G2): « Exporter en Excel » gives a typed file named after the
 * club on every important list, each export noted in the journal.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("Excel exports on every list", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(300000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const stamp = Date.now();
  const email = `g2-${stamp}@example.test`;
  try {
    await prepareSignIn(page, db, "G2 présidente", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id", [`G2 Club ${stamp}`])).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240)", [club]);
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Profil actif", exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 2. Exports: each list gives a typed Excel file named after the club; each one is journaled.
    const pages: [string, string?][] = [
      ["/fr/settings/members"],
      ["/fr/matches"],
      ["/fr/dues"],
      ["/fr/funding/operations"],
      ["/fr/funding/budget"],
      ["/fr/funding/affiliations"],
      ["/fr/funding/partners"],
      ["/fr/funding/grants"],
      ["/fr/equipment"],
      ["/fr/registrations"],
      ["/fr/attendance", "Statistiques"],
      ["/fr/statistics"],
    ];
    for (const [path, tab] of pages) {
      await page.goto(path);
      if (tab) await page.getByRole("tab", { name: tab }).click();
      if (path === "/fr/statistics") {
        // The whole tab in one click (each chart has its own entry in « ... »).
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Exporter en Excel" }).first().click();
        expect((await download).suggestedFilename(), path).toMatch(new RegExp(`^g2-club-${stamp}-statistiques.*\\.xlsx$`));
        continue;
      }
      await page.getByRole("button", { name: "Exporter en Excel" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Exporter en Excel" });
      await expect(dialog.getByRole("radio", { name: "Fichier Excel" })).toBeChecked();
      if (path === "/fr/dues") await axe(page, "export window");
      const download = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Télécharger" }).click();
      expect((await download).suggestedFilename(), path).toMatch(new RegExp(`^g2-club-${stamp}-.+\\.xlsx$`));
    }
    const actions = (await db.query("SELECT DISTINCT action FROM audit_log WHERE organization_id=$1 AND action LIKE 'export.%' ORDER BY action", [club])).rows.map((r) => r.action);
    expect(actions).toEqual(
      ["export.affiliations", "export.attendanceStats", "export.budget", "export.dues", "export.equipment", "export.grants", "export.matches", "export.members", "export.operations", "export.registrations", "export.sponsors", "export.statistics"].sort(),
    );
  } finally {
    await db.end();
  }
});
