import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "37521";
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Spawns the production bundle (requires `npm run build` first).
 * Local: `npm run build && npm run test:e2e`
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `cross-env PORT=${port} NODE_ENV=production DATABASE_URL= node dist/index.cjs`,
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
