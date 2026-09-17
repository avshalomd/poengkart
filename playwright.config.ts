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
    // --ignore-lock keeps `astro preview` in the foreground: it otherwise
    // daemonizes when it detects a coding agent running it, and Playwright
    // takes the parent's exit for a server that died. Playwright owns this
    // server's lifetime anyway, so the lock file it skips is of no use here.
    command: 'npm run build && npm run preview -- --ignore-lock',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, colorScheme: 'dark' }, testMatch: /a11y|boot|school|settings/ },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /mobile|boot|school|points/ },
  ],
});
