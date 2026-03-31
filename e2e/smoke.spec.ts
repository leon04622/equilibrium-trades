import { test, expect } from "@playwright/test";

test.describe("public pages", () => {
  test.describe.configure({ timeout: 60_000 });

  test("home loads Equilibrium shell or wallet gate", async ({ page }) => {
    await page.goto("/");
    // Production: wallet gate (h1). If gate is disabled: header brand or sidebar.
    const gateHeading = page.getByRole("heading", { name: "Equilibrium", level: 1 });
    const sidebarToggle = page.getByTestId("button-sidebar-toggle");
    await expect(gateHeading.or(sidebarToggle).first()).toBeVisible();
  });

  test("pricing page shows membership heading", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Choose the plan/i);
  });
});
