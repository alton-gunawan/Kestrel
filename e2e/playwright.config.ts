import { defineConfig, devices } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:8787';
const WEB_BASE = process.env.WEB_BASE ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: WEB_BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm --filter @meetingops/api dev',
        url: `${API_BASE}/api/health`,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
