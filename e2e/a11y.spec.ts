import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * WCAG-oriented scans on public routes. Rules tuned to avoid flaky third-party
 * embed noise while catching real app regressions.
 */
const axe = (page: Page) =>
  new AxeBuilder({ page })
    .disableRules([
      // Color-contrast false positives on gradient / glass UI; fix in CSS separately if needed.
      "color-contrast",
    ])
    .analyze();

test.describe("a11y (axe)", () => {
  test.describe.configure({ timeout: 60_000 });

  test("home has no serious/critical axe violations", async ({ page }) => {
    await page.goto("/");
    const { violations } = await axe(page);
    const bad = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect.soft(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("pricing has no serious/critical axe violations", async ({ page }) => {
    await page.goto("/pricing");
    const { violations } = await axe(page);
    const bad = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect.soft(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("learn has no serious/critical axe violations", async ({ page }) => {
    await page.goto("/learn");
    const { violations } = await axe(page);
    const bad = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect.soft(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("docs has no serious/critical axe violations (gate or docs shell)", async ({ page }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ hasText: /Equilibrium/i }),
    ).toBeVisible();
    const { violations } = await axe(page);
    const bad = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect.soft(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
