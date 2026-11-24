import { defineConfig, devices } from '@playwright/test';
import { urls } from './stack.js';

// PW_CHANNEL=chrome (or msedge) reuses an installed browser; otherwise run
// `npx playwright install chromium` once to download Playwright's Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: './.tmp/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: '../docs/evidence/e2e/e2e-results.json' }],
    ['html', { outputFolder: './reports/html', open: 'never' }],
  ],
  use: {
    baseURL: urls.app,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    channel,
  },
  projects: [
    { name: 'e2e', testMatch: /educert\.spec\.ts/ },
    { name: 'measure', testMatch: /measure\.spec\.ts/ },
  ],
});
