import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Lot 1, the sign-in screen: no « Réessayer » without an error; when the
 * server cannot be reached, the message and « Réessayer » inside the card;
 * every element of the card on one left edge; the logo and name whole in
 * the bar; the card centred; at 1440 and 390 px, light and dark, very large
 * text. And the former « Licences » address.
 */
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => `${label} ${x.id}: ${x.nodes[0]?.target.join(" ")}`);
  expect(v, label).toEqual([]);
}
for (const variant of [
  { id: "1440-light", width: 1440, height: 900, theme: "light", size: "" },
  { id: "390-dark", width: 390, height: 844, theme: "dark", size: "" },
  { id: "390-xlarge", width: 390, height: 844, theme: "light", size: "xlarge" },
])
  test(`sign-in card, ${variant.id}`, async ({ page }) => {
    await page.addInitScript(([theme, size]) => {
      localStorage.setItem("pfm-theme", theme);
      if (size) localStorage.setItem("pfm-text-size", size);
    }, [variant.theme, variant.size]);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.goto("/fr/access");
    const card = page.locator(".access-card");
    await expect(card.getByRole("heading", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByText("Réessayer")).toHaveCount(0);
    // One left edge for the title, the fields, the button and the links' block (1 px).
    const lefts = await card.evaluate((c) =>
      [...c.querySelectorAll("h1, label, input:not([type=hidden]), .button, .access-links")].map((e) => Math.round(e.getBoundingClientRect().left)),
    );
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1);
    // The logo and the name whole inside the bar.
    const bar = (await page.locator(".guest-bar").boundingBox())!;
    for (const part of [page.locator(".guest-bar .brand-mark"), page.locator(".guest-bar .brand-name")]) {
      const box = (await part.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(bar.y);
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
    }
    // Centred on a computer, 16 px from the edges on a phone.
    const c = (await card.boundingBox())!;
    if (variant.width > 640) expect(Math.abs(c.x + c.width / 2 - variant.width / 2)).toBeLessThanOrEqual(2);
    // The gutter is 1 rem: 16 px, a little more with very large text.
    else expect(Math.round(c.x)).toBe(variant.size === "xlarge" ? 20 : 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await axe(page, `sign-in ${variant.id}`);
    await page.screenshot({ path: `test-results/sign-in-${variant.id}.png`, fullPage: true });
  });

test("the server out of reach: the message and « Réessayer » in the card", async ({ page }) => {
  await page.route("**/api/workspace", (route) => route.abort());
  await page.goto("/fr/access");
  const alert = page.locator(".access-card").getByRole("alert");
  await expect(alert).toContainText("Impossible de joindre le serveur. Vérifiez votre connexion.");
  await expect(alert.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await page.unroute("**/api/workspace");
  await alert.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.locator(".access-card").getByRole("alert")).toHaveCount(0);
  await axe(page, "sign-in after retry");
});

test("the former « Licences » address leads to « Classification »", async ({ page }) => {
  await page.goto("/fr/licenses");
  await expect(page).toHaveURL(/\/fr\/classification$/);
});
