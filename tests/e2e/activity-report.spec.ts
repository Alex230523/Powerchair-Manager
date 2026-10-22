import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C11): the activity report from the statistics page: the preview,
 * sections on and off, the president's word, the PowerPoint file read back,
 * the print; the "highlight" box of the event editor.
 */
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("activity report: preview, sections, PowerPoint file and print", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(240000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `report-${Date.now()}@example.test`;
  try {
    await prepareSignIn(page, db, "Report president", email, "Browser-test-passphrase-2026!");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      try {
        await expect(signOut).toBeVisible({ timeout: 8000 });
        break;
      } catch (e) {
        if (attempt) throw e;
        await page.waitForTimeout(11000);
      }
    }
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Report club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-100,CURRENT_DATE+200) RETURNING id", [club])).rows[0].id;
    const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [club, season])).rows[0].id;
    await db.query(
      "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,team_id,final_rank,teams_count,result_note,created_by) VALUES($1,'Tournoi de Gand','tournament',CURRENT_DATE-30,CURRENT_DATE-29,$2,2,8,'Finale',$3)",
      [club, team, user],
    );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. From the statistics page to the preview.
    await page.goto("/fr/statistics");
    await page.getByRole("link", { name: "Rapport d’activité", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/statistics\/report$/);
    const preview = page.locator(".report-preview");
    await expect(preview.getByRole("heading", { name: "Rapport d’activité 2026-27" })).toBeVisible();
    await expect(preview.locator('[data-slide="results"]')).toContainText("2e sur 8");
    await expect(preview.locator('[data-slide="cover"]').getByRole("img", { name: "Glissez une photo ici" })).toBeVisible();
    await axe(page, "report preview");

    // 2. Sections and the president's word.
    await page.getByRole("checkbox", { name: "Matériel" }).uncheck();
    await expect(preview.locator('[data-slide="equipment"]')).toHaveCount(0);
    await page.getByRole("textbox", { name: "Mot du président" }).fill("Une saison pleine d’énergie.");
    await expect(preview.locator('[data-slide="word"]')).toContainText("Une saison pleine d’énergie.");
    const count = await preview.locator(".report-slide").count();

    // 3. The PowerPoint file: one slide per page of the preview, real text.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger en PowerPoint (pour Canva)" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pptx$/);
    const zip = await JSZip.loadAsync(await readFile((await file.path())!));
    expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(count);
    const all = (await Promise.all(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")))).join("");
    expect(all).toContain("Une saison pleine d’énergie.");
    expect(all).toContain("Tournoi de Gand");

    // 4. Print: the settings disappear, the pages stay.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".report-settings")).toBeHidden();
    await expect(preview.locator(".report-slide").first()).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    // 5. The event editor offers the "highlight" box.
    await page.goto("/fr/calendar?create=1");
    // Wave 16 (E1): in the « Avancé » section of the form.
    await page.locator("#event-editor summary", { hasText: "Avancé" }).click();
    await expect(page.getByRole("checkbox", { name: /^Fait marquant de la saison/ })).toBeVisible();

    // 6. 390 px.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/statistics/report");
    await expect(page.locator(".report-slide").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await db.end();
  }
});
