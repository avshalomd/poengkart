import { test, expect } from '@playwright/test';
import { boot } from './helpers';

// renderSettings() draws every choice as a pill: <button data-k="<setting>"
// data-v="<value>" aria-pressed>. There is no <select> and no data-lang.
const pill = (k: string, v: string) => `#settings-body .seg button[data-k="${k}"][data-v="${v}"]`;

test('language, theme, text size and the colour-blind palette switch and persist', async ({ page }) => {
  await boot(page);
  await page.click('#settings-btn');
  await expect(page.locator('#settings')).toBeVisible();
  await page.click(pill('lang', 'en'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#tagline')).toContainText('schools');
  await page.click(pill('theme', 'dark'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click(pill('font', 'xl'));
  await expect(page.locator('html')).toHaveAttribute('data-font', 'xl');
  await page.click(pill('cvd', '1'));
  await expect(page.locator('html')).toHaveAttribute('data-cvd', '1');
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'xl');
  await expect(page.locator('html')).toHaveAttribute('data-cvd', '1');
});

test('the chosen pill is the pressed one, and Escape closes the sheet', async ({ page }) => {
  await boot(page);
  await page.click('#settings-btn');
  await expect(page.locator(pill('levels', '1'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(pill('levels', 'all'))).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();
});

test('Trinn: Vg2 and Vg3 rows appear only when the setting says so', async ({ page }) => {
  await boot(page, '#s=Vestland/F%C3%B8rde%20vidareg%C3%A5ande%20skule');
  const rows = page.locator('#s-list .prow');
  const vg1Only = await rows.count();
  expect(vg1Only).toBeGreaterThan(0);
  // the sheet says the same thing in its own line, and names the count
  await expect(page.locator('#s-list .lvnote')).toContainText('på Vg2 og Vg3 er skjult');
  await page.click('#settings-btn');
  await page.click(pill('levels', 'all'));
  await expect.poll(() => rows.count()).toBeGreaterThan(vg1Only);
  // the scope is a filter like any other, so it rides in the address
  expect(decodeURIComponent(page.url())).toContain('l=all');
});
