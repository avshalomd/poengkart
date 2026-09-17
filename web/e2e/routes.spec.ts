import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test('a legacy #s= link lands on the school path with the sheet open', async ({ page }) => {
  await boot(page, '/#s=Akershus/Asker&c=ST');
  await expect(page.locator('#side')).toHaveClass(/open/);
  await expect(page.locator('#s-photo .name h2')).toHaveText('Asker');
  expect(new URL(page.url()).pathname).toBe('/akershus/asker');
  expect(new URL(page.url()).search).toBe('?c=ST');
  expect(new URL(page.url()).hash).toBe('');
});

test('a ?s= link (the mailed form) lands on the school path', async ({ page }) => {
  await boot(page, '/?s=Akershus/Asker');
  await expect(page.locator('#s-photo .name h2')).toHaveText('Asker');
  expect(new URL(page.url()).pathname).toBe('/akershus/asker');
});

test('an unknown school is a 404 that still boots the app and says so', async ({ page }) => {
  const res = await page.goto('/akershus/finnes-ikke');
  expect(res!.status()).toBe(404);
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await expect(page.locator('#toast')).toContainText('finnes ikke');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex');
});

test('the filters ride in the query string and the back button steps over them', async ({ page }) => {
  await boot(page, '/?f=Oslo');
  await expect(page.locator('#map-fylke')).toHaveValue('Oslo');
  await page.locator('#map-fylke').selectOption('Akershus');
  expect(new URL(page.url()).search).toBe('?f=Akershus');
  await page.goBack();
  await expect(page.locator('#map-fylke')).toHaveValue('Oslo');
  expect(new URL(page.url()).search).toBe('?f=Oslo');
});
