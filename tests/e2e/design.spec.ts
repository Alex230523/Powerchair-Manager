import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Wave 13: the internal design gallery shows every shared component in both
 * themes and passes axe; the tabs move and select with the keyboard.
 */
test("the design gallery passes axe in both themes and its tabs work with the keyboard", async ({ page }) => {
  await page.goto("/fr/design");
  await expect(page.getByRole("heading", { name: "Composants partagés", exact: true })).toBeVisible();
  for (const theme of ["Thème clair", "Thème sombre"]) await expect(page.getByRole("region", { name: theme })).toBeVisible();
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
  expect(violations).toEqual([]);

  const light = page.getByRole("region", { name: "Thème clair" });
  const tabs = light.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await tabs.nth(0).focus();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(light.getByRole("tabpanel")).toContainText("Staff");
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(2)).toBeFocused();
  // Only the selected tab points at the panel; the others control nothing that is not in the page.
  await expect(tabs.nth(2)).toHaveAttribute("aria-controls", /panel/);
  await expect(tabs.nth(0)).not.toHaveAttribute("aria-controls", /./);
  // The segmented control: arrows move the pressed state too.
  const seg = light.getByRole("group", { name: "Vue" }).getByRole("button");
  await seg.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(seg.nth(1)).toHaveAttribute("aria-pressed", "true");

  // Phone width: nothing overflows.
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
