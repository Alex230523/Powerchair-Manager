import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { displayChecks } from "./checks";
import { signIn, type AuditRole } from "./support";
import { matches, type Exception, type Issue, reportHtml } from "./report";

/**
 * Audit 23 (npm run audit:ui): every page of each role's menu. One test per
 * role and screen, run in parallel:
 * - 1440 px light: every check, axe, each tab and the main window (« Ajouter »);
 * - 390 px dark: every check and axe;
 * - 390 px with « Très grand » text: the layout checks;
 * - Dutch and English at 1440 px: the texts.
 * Findings go to audit-report/ (an HTML report with a cropped picture each)
 * and to the log (« AUDIT ui … » lines); the run fails on any finding not in
 * tests/audit/exceptions.json. The accounts come from global-setup.ts.
 */
const roles: AuditRole[] = ["president", "coach", "player", "parent", "federation", "referee", "federation_worker"];
type Variant = { id: string; width: number; height: number; theme: "light" | "dark"; size: "normal" | "xlarge"; locales: ("fr" | "nl" | "en")[]; axe: boolean; deep: boolean; layout: boolean };
const variants: Variant[] = [
  { id: "1440-clair", width: 1440, height: 900, theme: "light", size: "normal", locales: ["fr"], axe: true, deep: true, layout: true },
  { id: "390-sombre", width: 390, height: 844, theme: "dark", size: "normal", locales: ["fr"], axe: true, deep: false, layout: true },
  { id: "390-tres-grand", width: 390, height: 844, theme: "light", size: "xlarge", locales: ["fr"], axe: false, deep: false, layout: true },
  { id: "1440-nl-en", width: 1440, height: 900, theme: "light", size: "normal", locales: ["nl", "en"], axe: false, deep: false, layout: false },
];
const out = "audit-report";
const exceptions: Exception[] = JSON.parse(readFileSync("tests/audit/exceptions.json", "utf8"));

test.describe.configure({ mode: "parallel" });

/** Waits for a view to have loaded its data: no « Chargement » left, a few seconds at most. */
async function settled(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForFunction(() => !/Chargement|Laden|Loading/.test(document.querySelector("main")?.textContent ?? "") && !document.querySelector("[aria-busy='true']"), undefined, { timeout: 6000 })
    .catch(() => undefined);
  await page.waitForTimeout(150);
}

for (const role of roles)
  for (const variant of variants)
    test(`display: ${role}, ${variant.id}`, async ({ page }) => {
      test.setTimeout(20 * 60000);
      const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
      const issues: Issue[] = [];
      const errors: string[] = [];
      let mark = 0;
      // The HTML the server sent for the last page, to name what React found different when hydrating.
      let served = "";
      page.on("response", (r) => {
        if (r.request().isNavigationRequest() && r.request().frame() === page.mainFrame()) void r.text().then((t) => (served = t), () => undefined);
      });
      page.on("console", (m) => {
        // A failed request is reported below with its address, not as the browser's bare message.
        if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text().slice(0, 200));
        if (m.text().includes("#418")) diagnose();
      });
      // React reports the hydration failure as a page error too.
      page.on("pageerror", (e) => {
        if (e.message.includes("#418")) diagnose();
      });
      function diagnose() {
        console.log(`AUDIT hydration\tseen on ${new URL(page.url()).pathname} (${role}, ${variant.id}), ${served.length} bytes served`);
        void page
            .evaluate((html) => {
              const skip = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "LINK", "META"]);
              const sig = (root: Element) =>
                [...root.querySelectorAll("*")].filter((e) => !skip.has(e.tagName)).map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.classList.length ? "." + [...e.classList].join(".") : ""}`);
              const server = sig(new DOMParser().parseFromString(html, "text/html").body),
                client = sig(document.body);
              let i = 0;
              while (i < server.length && server[i] === client[i]) i++;
              return `first difference at element ${i}: server [${server.slice(Math.max(0, i - 2), i + 3).join(" ")}] client [${client.slice(Math.max(0, i - 2), i + 3).join(" ")}]`;
            }, served)
            .then((d) => console.log(`AUDIT hydration\t${new URL(page.url()).pathname}\t${role}\t${variant.id}\t${d.slice(0, 1200)}`))
            .catch((e: Error) => console.log(`AUDIT hydration\tnot compared: ${e.message.slice(0, 200)}`));
      }
      page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
      page.on("response", (r) => {
        const url = new URL(r.url());
        if (r.status() >= 400 && url.pathname.startsWith("/api/")) errors.push(`${r.status()} ${r.request().method()} ${url.pathname}${url.search}`.slice(0, 200));
      });
      // A page that asks before leaving (unsaved form) must not hold the audit: leave.
      page.on("dialog", (d) => void d.accept().catch(() => undefined));
      page.setDefaultNavigationTimeout(30000);
      mkdirSync(`${out}/shots`, { recursive: true });
      try {
        await page.addInitScript(([theme, size]) => {
          try {
            localStorage.setItem("pfm-theme", theme);
            if (size === "normal") localStorage.removeItem("pfm-text-size");
            else localStorage.setItem("pfm-text-size", size);
          } catch {
            // Storage refused: the defaults stay.
          }
        }, [variant.theme, variant.size] as const);
        await page.setViewportSize({ width: 1440, height: 900 });
        await signIn(page.request, db, role);
        await page.goto("/fr");
        await settled(page);
        const paths: string[] = [
          "/fr",
          ...new Set(
            ((await page.locator("nav a[href^='/fr/']").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname))) as string[]).filter((p) => p !== "/fr"),
          ),
        ];
        await page.setViewportSize({ width: variant.width, height: variant.height });
        const links = new Set<string>();

        async function inspect(path: string, locale: string, what: string) {
          errors.length = 0;
          await settled(page);
          // A page whose script never gives the hand back is a finding, not a stalled run.
          const found = await Promise.race([page.evaluate(displayChecks, mark), new Promise<null>((done) => setTimeout(() => done(null), 20000))]);
          if (!found) {
            issues.push({ rule: "page-hang", role, variant: variant.id, locale, path, what, target: "page", detail: "no answer to the checks within 20 s", shot: null });
            return;
          }
          mark += found.length + 1;
          const kept = variant.layout ? found : found.filter((f) => f.rule === "raw-text");
          if (variant.axe) {
            const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
            for (const v of axe.violations) kept.push({ rule: `axe:${v.id}`, target: v.nodes[0]?.target.join(" ") ?? "", detail: v.help, mark: null });
          }
          if (variant.deep) for (const href of (await page.locator("main a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))) as string[]) links.add(href.split("#")[0].split("?")[0]);
          for (const e of new Set(errors)) kept.push({ rule: "console-error", target: "page", detail: e, mark: null });
          for (const f of kept) {
            const issue: Issue = { rule: f.rule, role, variant: variant.id, locale, path, what, target: f.target, detail: f.detail, shot: null };
            if (f.mark !== null && issues.length < 60) {
              const file = `shots/${role}-${variant.id}-${issues.length}.png`;
              const box = await page.locator(`[data-audit-id="${f.mark}"]`).first().boundingBox().catch(() => null);
              if (box) {
                const vp = page.viewportSize()!;
                const x = Math.max(0, box.x - 16);
                const clip = { x, y: Math.max(0, box.y - 16), width: Math.max(1, Math.min(vp.width - x, box.width + 32)), height: Math.max(1, Math.min(600, box.height + 32)) };
                await page.screenshot({ path: `${out}/${file}`, clip, fullPage: true }).then(
                  () => (issue.shot = file),
                  () => undefined,
                );
              }
            }
            issues.push(issue);
          }
        }

        for (const locale of variant.locales)
          for (const base of paths) {
            const path = base.replace(/^\/fr(?=\/|$)/, `/${locale}`);
            const response = await page.goto(path, { timeout: 30000 }).catch(() => null);
            if (!response || response.status() >= 400) {
              issues.push({ rule: "page-status", role, variant: variant.id, locale, path, what: "page", target: "page", detail: String(response?.status() ?? "no answer"), shot: null });
              continue;
            }
            await inspect(path, locale, "page");
            if (!variant.deep) continue;
            await page.screenshot({ path: `${out}/shots/full-${role}${path.replaceAll("/", "_")}.png`, fullPage: true }).catch(() => undefined);
            // Each tab of the page (five at most).
            const tabs = (await page.locator("main [role=tab]").all()).slice(0, 5);
            for (const [i, tab] of tabs.entries()) {
              if (!(await tab.isVisible().catch(() => false)) || (await tab.getAttribute("aria-selected")) === "true") continue;
              const label = ((await tab.textContent()) ?? `tab ${i}`).trim().slice(0, 40);
              await tab.click({ timeout: 3000 }).catch(() => undefined);
              await inspect(path, locale, `onglet « ${label} »`);
            }
            // The main window: the first « Ajouter » / « Nouveau » button, then closed.
            const add = page.locator("main").getByRole("button", { name: /^(\+ )?(Ajouter|Nouveau|Nouvelle|Créer)\b/ }).first();
            if (await add.isVisible().catch(() => false)) {
              const label = ((await add.textContent()) ?? "").trim().slice(0, 40);
              await add.click({ timeout: 3000 }).catch(() => undefined);
              if (await page.locator("dialog[open]").first().isVisible().catch(() => false)) {
                await inspect(path, locale, `fenêtre « ${label} »`);
                await page.keyboard.press("Escape");
              }
            }
          }
        // Links of the pages that lead nowhere.
        for (const href of links) {
          if (href.startsWith("/api/")) continue;
          const status = (await page.request.get(href, { maxRedirects: 3 }).catch(() => null))?.status();
          if (status === 404) issues.push({ rule: "link-404", role, variant: variant.id, locale: "fr", path: href, what: "lien", target: href, detail: "404", shot: null });
        }
      } finally {
        await db.end();
      }
      const fresh = issues.filter((i) => !exceptions.some((e) => matches(e, i)));
      const name = `ui-${role}-${variant.id}`;
      writeFileSync(`${out}/${name}.json`, JSON.stringify(issues, null, 1));
      writeFileSync(`${out}/${name}.html`, reportHtml(`Audit visuel : ${role}, ${variant.id}`, issues, exceptions));
      // The log carries every new finding, so a run can be read without its artefacts.
      for (const i of fresh) console.log(`AUDIT ui\t${i.rule}\t${i.path}\t${i.what}\t${i.target}\t${role}\t${variant.id}\t${i.locale}\t${i.detail.replace(/\s+/g, " ").slice(0, 160)}`);
      if (!process.env.AUDIT_RECORD) expect(fresh.length, `${fresh.length} new findings, see ${out}/${name}.html`).toBe(0);
    });
