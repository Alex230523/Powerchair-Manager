import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { helpSheets, staleCaptures, type HelpRole } from "../../src/domains/guide/help";
import { signIn, type AuditRole } from "./support";

/**
 * G10 (npm run audit:help): the capture of each how-to sheet, taken on the
 * demo club with the sheet's first role. A missing capture is written to
 * public/help (to commit); a screen that changed beyond the tolerance is
 * reported in audit-report/help-captures.json and as a warning, with the new
 * picture beside it. The run never fails on a changed screen.
 */
const roleOf: Record<HelpRole, AuditRole> = { president: "president", coach: "coach", player: "player", parent: "parent", federation: "federation", referee: "referee" };
const results: { id: string; status: "same" | "changed" | "missing" }[] = [];
test.describe.configure({ mode: "serial" });

async function settled(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForFunction(() => !/Chargement|Laden|Loading/.test(document.querySelector("main")?.textContent ?? "") && !document.querySelector("[aria-busy='true']"), undefined, { timeout: 6000 })
    .catch(() => undefined);
  await page.waitForTimeout(300);
}

for (const sheet of helpSheets)
  test(`help capture: ${sheet.id}`, async ({ page }) => {
    test.setTimeout(120000);
    const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await signIn(page.request, db, roleOf[sheet.roles[0]]);
      await page.goto(`/fr${sheet.route}`);
      await settled(page);
      const missing = !existsSync(`public/help/${sheet.id}.png`);
      let status: "same" | "changed" | "missing" = missing ? "missing" : "same";
      try {
        await expect(page.locator("main")).toHaveScreenshot(`${sheet.id}.png`, { maxDiffPixelRatio: 0.03, animations: "disabled", mask: [page.locator("time")] });
      } catch {
        status = missing ? "missing" : "changed";
      }
      if (status !== "same") {
        mkdirSync("audit-report/help", { recursive: true });
        await page.locator("main").screenshot({ path: `audit-report/help/${sheet.id}.png`, animations: "disabled" });
      }
      results.push({ id: sheet.id, status });
    } finally {
      await db.end();
    }
  });

test.afterAll(() => {
  const stale = staleCaptures(results);
  mkdirSync("audit-report", { recursive: true });
  writeFileSync("audit-report/help-captures.json", JSON.stringify({ checked: results.length, stale }, null, 2));
  for (const s of stale) console.log(`::warning title=Mode d'emploi::La capture de la fiche « ${s.id} » est ${s.reason === "missing" ? "nouvelle (à valider puis committer)" : "obsolète : l'écran a changé"}.`);
});
