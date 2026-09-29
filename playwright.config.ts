import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: 'tmp/test-results',
  reporter: [['list'], ['html', { outputFolder: 'tmp/playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}`,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
