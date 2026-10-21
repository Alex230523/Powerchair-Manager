import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { prepareSignIn } from "../support/session";

/**
 * Wave 15 (C8): the data tables: sorting kept in the URL, selection with the
 * keyboard and Shift, the select-all box, an export, and a grouped action
 * with a row the service refuses.
 */
const origin = "http://127.0.0.1:3100";
async function axe(page: Page, label: string) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations, label).toEqual([]);
}

test("data tables: sort, keyboard selection, export and a grouped action with a refused row", async ({ page }) => {
  test.skip(!process.env.PFM_E2E_DATABASE_URL, "Use test:e2e:db");
  test.setTimeout(180000);
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  const email = `tables-${Date.now()}@example.test`;
  try {
    await db.query('DELETE FROM "rateLimit"');
    await prepareSignIn(page, db, "Tables president", email, "Browser-test-passphrase-2026!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible({ timeout: 15000 });
    const user = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [user]);
    const club = (await db.query("INSERT INTO organization(name,kind) VALUES('Tables club','club') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
    const mandate = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,'club_president') RETURNING id", [club, user])).rows[0].id;
    const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [club])).rows[0].id;
    const players: string[] = [];
    for (const [name, birth] of [
      ["Bruno Lambert", "2010-05-01"],
      ["Alice Dumont", "2012-02-01"],
      ["Chloé Martin", "2008-09-01"],
    ])
      players.push(
        (
          await db.query(
            "WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,$3,'{player}' FROM p RETURNING id",
            [club, name, birth],
          )
        ).rows[0].id,
      );
    await page.goto("/fr");
    await page.locator(".profile-menu > summary").click();
    await Promise.all([page.waitForEvent("load"), page.getByLabel("Profil actif", { exact: true }).selectOption(mandate)]);
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1. Sorting: by name, then descending, kept in the URL and after a reload.
    await page.goto("/fr/players");
    const table = page.locator(".directory-table");
    const names = () => table.getByRole("rowheader").allInnerTexts();
    await expect(table.getByRole("rowheader")).toHaveCount(3);
    const nameHeader = table.getByRole("columnheader", { name: /^Nom/ });
    await nameHeader.getByRole("button").click();
    await expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    expect((await names()).map((n) => n.replace(/^\S+\s+/, ""))).toEqual(["Alice Dumont", "Bruno Lambert", "Chloé Martin"]);
    await nameHeader.getByRole("button").click();
    await expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    expect(page.url()).toContain("sort=-name");
    await page.reload();
    await expect(page.locator(".directory-table").getByRole("columnheader", { name: /^Nom/ })).toHaveAttribute("aria-sort", "descending");
    expect((await names()).map((n) => n.replace(/^\S+\s+/, ""))).toEqual(["Chloé Martin", "Bruno Lambert", "Alice Dumont"]);

    // 2. Selection with the keyboard: Space, then Shift+Space for the range.
    await table.getByRole("checkbox", { name: "Sélectionner Chloé Martin" }).focus();
    await page.keyboard.press("Space");
    await table.getByRole("checkbox", { name: "Sélectionner Alice Dumont" }).focus();
    await page.keyboard.press("Shift+Space");
    const bar = page.getByRole("toolbar", { name: "Actions sur la sélection" });
    await expect(bar).toContainText("3 sélectionnés");
    const all = table.getByRole("checkbox", { name: "Tout sélectionner" });
    await expect(all).toBeChecked();
    await table.getByRole("checkbox", { name: "Sélectionner Bruno Lambert" }).click();
    await expect(bar).toContainText("2 sélectionnés");
    expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
    await axe(page, "players with a selection");

    // 3. Export of the selection.
    const download = page.waitForEvent("download");
    await bar.getByRole("button", { name: "Exporter" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const csv = await readFile((await file.path())!, "utf8");
    expect(csv).toContain("Chloé Martin");
    expect(csv).toContain("Alice Dumont");
    expect(csv).not.toContain("Bruno Lambert");

    // 4. A grouped action with a refused row: exempt two players, one has already paid.
    const post = async (data: Record<string, unknown>) => {
      const r = await page.request.post("/api/dues", { headers: { origin }, data: { organizationId: club, ...data } });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    const plan = (await post({ action: "plan", seasonId: season, category: "Cotisation", amountCents: 20000, maxInstallments: 2, firstDue: "2026-12-01" })).id;
    await post({ action: "issue", planId: plan, profileId: players[0], installments: 1, firstDue: "2026-12-01" });
    const paid = (await post({ action: "issue", planId: plan, profileId: players[1], installments: 1, firstDue: "2026-12-01" })).id;
    await post({ action: "pay", id: paid, amountCents: 5000, method: "cash", occurredOn: (await db.query("SELECT CURRENT_DATE::text AS d")).rows[0].d, reference: "" });
    await page.goto("/fr/dues");
    const dues = page.locator(".dues-table");
    await dues.getByRole("checkbox", { name: "Tout sélectionner" }).check();
    const duesBar = page.getByRole("toolbar", { name: "Actions sur la sélection" });
    await duesBar.getByRole("button", { name: "Exonérer" }).click();
    await duesBar.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.locator(".dues-table").getByRole("status")).toHaveText("1 réussie, 1 refusée : paiement déjà reçu");
    expect((await db.query("SELECT full_name,net_cents FROM dues_receivable d JOIN club_person c ON c.id=d.profile_id WHERE d.organization_id=$1 ORDER BY full_name", [club])).rows).toEqual([
      { full_name: "Alice Dumont", net_cents: 5000 + 15000 },
      { full_name: "Bruno Lambert", net_cents: 0 },
    ]);
    // The refused row stays selected, to see it.
    await expect(duesBar).toContainText("1 sélectionné");
    await axe(page, "dues after a grouped action");

    // 5. 390 px: the page does not scroll sideways; the table does.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/players");
    await expect(page.locator(".directory-table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await db.end();
  }
});
