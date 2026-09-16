import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'web/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    locale: 'nb-NO',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, colorScheme: 'dark' }, testMatch: /boot|school|settings/ },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /mobile|boot|school|points/ },
  ],
});
