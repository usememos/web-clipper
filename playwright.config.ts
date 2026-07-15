import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: "line",
  outputDir: "test-results/e2e",
  use: { trace: "retain-on-failure" },
});
