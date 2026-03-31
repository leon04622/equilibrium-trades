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

  test("docs route responds (gate or docs shell)", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: /Equilibrium/i })).toBeVisible();
  });

  test("learn page loads (public funnel)", async ({ page }) => {
    await page.goto("/learn");
    await expect(page.getByRole("heading", { name: /Learn Trading/i, level: 1 })).toBeVisible();
  });
});

test.describe("api", () => {
  test("GET /health returns ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});
