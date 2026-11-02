import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { displayChecks, type Finding } from "./checks";
import { prepareAudit, signIn, type AuditRole } from "./support";
import { matches, type Exception, type Issue, reportHtml } from "./report";

/**
 * Audit 23 (npm run audit:ui): every page of each role's menu, its tabs and
 * its main window (« Ajouter », a sheet), at 1440 px light, 390 px dark and
 * 390 px with « Très grand » text, in French; the same pages in Dutch and
 * English for the texts. Findings go to audit-report/ui.html with a cropped
 * picture each; the run fails on any finding not in tests/audit/exceptions.json.
 */
const roles: AuditRole[] = ["president", "coach", "player", "parent", "federation", "referee", "federation_worker"];
const variants = [
  { id: "1440-clair", width: 1440, height: 900, theme: "light", size: "normal" },
  { id: "390-sombre", width: 390, height: 844, theme: "dark", size: "normal" },
  { id: "390-tres-grand", width: 390, height: 844, theme: "light", size: "xlarge" },
] as const;
const out = "audit-report";
const exceptions: Exception[] = JSON.parse(readFileSync("tests/audit/exceptions.json", "utf8"));

test.describe.configure({ mode: "parallel" });

for (const role of roles)
  test(`display of every page: ${role}`, async ({ page }) => {
    test.setTimeout(45 * 60000);
    const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
    const issues: Issue[] = [];
    const errors: string[] = [];
    let mark = 0;
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    mkdirSync(`${out}/shots`, { recursive: true });
    try {
      await prepareAudit(db);
      await signIn(page.request, db, role);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/fr");
      await page.waitForLoadState("networkidle");
      // The pages of the role's menu (and home).
      const paths: string[] = [
        "/fr",
        ...new Set(
          ((await page.locator("aside nav a[href^='/fr/'], nav[aria-label] a[href^='/fr/']").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname))) as string[]).filter((p) => p !== "/fr"),
        ),
      ];
      const links = new Set<string>();

      async function inspect(path: string, variant: string, locale: "fr" | "nl" | "en", what: string) {
        errors.length = 0;
        await page.waitForLoadState("networkidle").catch(() => undefined);
        const found: Finding[] = await page.evaluate(displayChecks, mark);
        mark += found.length + 1;
        // Texts only in Dutch and English.
        const kept = locale === "fr" ? found : found.filter((f) => f.rule === "raw-text");
        if (locale === "fr") {
          const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
          for (const v of axe.violations) kept.push({ rule: `axe:${v.id}`, target: v.nodes[0]?.target.join(" ") ?? "", detail: v.help, mark: null });
          for (const href of (await page.locator("main a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))) as string[]) links.add(href.split("#")[0]);
        }
        for (const e of new Set(errors)) kept.push({ rule: "console-error", target: "page", detail: e, mark: null });
        for (const f of kept) {
          const issue: Issue = { rule: f.rule, role, variant, locale, path, what, target: f.target, detail: f.detail, shot: null };
          if (f.mark !== null && issues.length < 400) {
            const file = `shots/${role}-${issues.length}.png`;
            const box = await page.locator(`[data-audit-id="${f.mark}"]`).first().boundingBox().catch(() => null);
            if (box) {
              const vp = page.viewportSize()!;
              const clip = { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: Math.min(vp.width, box.width + 32), height: Math.min(600, box.height + 32) };
              await page.screenshot({ path: `${out}/${file}`, clip, fullPage: true }).then(
                () => (issue.shot = file),
                () => undefined,
              );
            }
          }
          issues.push(issue);
        }
      }

      for (const variant of variants) {
        await page.setViewportSize({ width: variant.width, height: variant.height });
        await page.evaluate(([theme, size]) => {
          localStorage.setItem("pfm-theme", theme);
          if (size === "normal") localStorage.removeItem("pfm-text-size");
          else localStorage.setItem("pfm-text-size", size);
        }, [variant.theme, variant.size]);
        for (const path of paths) {
          const response = await page.goto(path);
          if (!response || response.status() >= 400) {
            issues.push({ rule: "page-status", role, variant: variant.id, locale: "fr", path, what: "page", target: "page", detail: String(response?.status()), shot: null });
            continue;
          }
          await inspect(path, variant.id, "fr", "page");
          await page.screenshot({ path: `${out}/shots/full-${role}-${variant.id}-${path.replaceAll("/", "_")}.png`, fullPage: true }).catch(() => undefined);
          if (variant.id === "390-tres-grand") continue;
          // Each tab of the page.
          const tabs = await page.locator("main [role=tab]").all();
          for (const [i, tab] of tabs.entries()) {
            if (!(await tab.isVisible()) || (await tab.getAttribute("aria-selected")) === "true") continue;
            const label = ((await tab.textContent()) ?? `tab ${i}`).trim().slice(0, 40);
            await tab.click().catch(() => undefined);
            await inspect(path, variant.id, "fr", `onglet « ${label} »`);
          }
          // The main window: the first « Ajouter » / « Nouveau » button, then closed.
          const add = page.locator("main").getByRole("button", { name: /^(\+ )?(Ajouter|Nouveau|Nouvelle|Créer)\b/ }).first();
          if (await add.isVisible().catch(() => false)) {
            const label = ((await add.textContent()) ?? "").trim().slice(0, 40);
            await add.click().catch(() => undefined);
            if (await page.locator("dialog[open]").first().isVisible().catch(() => false)) {
              await inspect(path, variant.id, "fr", `fenêtre « ${label} »`);
              await page.keyboard.press("Escape");
            }
          }
        }
      }
      // Dutch and English: the texts of every page.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => {
        localStorage.setItem("pfm-theme", "light");
        localStorage.removeItem("pfm-text-size");
      });
      for (const locale of ["nl", "en"] as const)
        for (const path of paths) {
          const localized = path.replace(/^\/fr/, `/${locale}`);
          await page.goto(localized);
          await inspect(localized, "1440-clair", locale, "page");
        }
      // Links of the pages that lead nowhere.
      for (const href of links) {
        if (href.startsWith("/api/")) continue;
        const status = (await page.request.get(href, { maxRedirects: 3 })).status();
        if (status === 404) issues.push({ rule: "link-404", role, variant: "1440-clair", locale: "fr", path: href, what: "lien", target: href, detail: "404", shot: null });
      }
    } finally {
      await db.end();
    }
    const fresh = issues.filter((i) => !exceptions.some((e) => matches(e, i)));
    writeFileSync(`${out}/ui-${role}.json`, JSON.stringify(issues, null, 1));
    writeFileSync(`${out}/ui-${role}.html`, reportHtml(`Audit visuel : ${role}`, issues, exceptions));
    const record = !!process.env.AUDIT_RECORD;
    if (!record) expect(fresh.map((i) => `${i.rule} ${i.path} ${i.what} ${i.target} (${i.variant}, ${i.locale}) ${i.detail}`), `${fresh.length} new findings, see ${out}/ui-${role}.html`).toEqual([]);
  });
