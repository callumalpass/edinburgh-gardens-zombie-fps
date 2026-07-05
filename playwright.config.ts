import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5481";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 75_000,
  workers: 1,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"]
    }
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } }
    }
  ],
  webServer: process.env.PW_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5481 --strictPort",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 90_000
      }
});
