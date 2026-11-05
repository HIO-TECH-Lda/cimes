import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (H.2): Chromium, Firefox e WebKit; os testes de fumo (@smoke) correm em
 * `npm run check`. Os testes completos das jornadas E2E-01 a E2E-09 chegam nos
 * marcos respectivos.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Sequencial com 1 retry: o primeiro acesso a uma rota no dev server compila
  // a pedido e pode devolver 500 uma vez; em paralelo, três motores a criar
  // sessões na mesma base de dev também colidem (TransactionWriteConflict).
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx next dev --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});