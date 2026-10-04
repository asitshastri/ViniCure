import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (P2-12): a real browser against `next dev` on port 3100, talking to the
// Postgres and Valkey from docker/compose.yml (or docker/cloud-services.sh in a cloud session).
// Database access for seeding uses the app role; nothing here touches production.
//
//   DATABASE_URL, VALKEY_URL  default to the local compose values
//   PW_CHROMIUM_PATH          use an installed Chromium instead of the one Playwright downloads

export const E2E_PORT = 3100;
export const E2E_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://app:dev-only-change-me@localhost:5432/vinicure",
  VALKEY_URL: process.env.VALKEY_URL ?? "redis://localhost:6379",
  AUTH_SECRET: "e2e-secret-with-at-least-thirty-two-characters-ok",
  APP_URL: `http://localhost:${E2E_PORT}`,
  LOCAL_DEV_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=", // 32 bytes, throwaway
  LOG_LEVEL: "warn",
  // Fake Google credentials: the button appears and the server builds Google's address; the
  // browser is stopped before it leaves for google.com. No real sign-in is attempted here.
  GOOGLE_CLIENT_ID: "e2e-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "e2e-client-secret",
};

const cloudChromium = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (existsSync(cloudChromium) ? cloudChromium : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: E2E_ENV.APP_URL,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath, args: ["--no-sandbox"] } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${E2E_PORT}`,
    url: `${E2E_ENV.APP_URL}/api/ready`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
