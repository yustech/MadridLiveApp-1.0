import { defineConfig, devices } from '@playwright/test';

const DEV_BASE_URL = 'http://127.0.0.1:5173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || DEV_BASE_URL;
const useExternalBaseURL = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: useExternalBaseURL
    ? undefined
    : {
        command: 'DISABLE_HMR=true npm run dev',
        url: `${DEV_BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
