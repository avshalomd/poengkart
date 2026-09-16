import { test, expect } from '@playwright/test';
import { boot, openSchool, seedWishes } from './helpers';

test('+ on a programme adds a wish that survives a reload; pressing again removes it', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  // .pick is the + beside a row; the row's own name button and the category
  // headings also carry aria-pressed, so the class is what identifies it
  const plus = page.locator('#s-list button.pick').first();
  await plus.click();
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#choices')).toContainText('Asker');
  await expect(page.locator('#choices .h')).toContainText('Ønskene mine (1)');
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await expect(page.locator('#choices')).toContainText('Asker');
  await openSchool(page, 'Akershus', 'Asker');
  await page.locator('#s-list button.pick[aria-pressed="true"]').first().click();
  await expect(page.locator('#choices')).toBeHidden();
});

test('a wish survives the round trip through localStorage in the app’s own key shape', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  await page.locator('#s-list button.pick').first().click();
  await expect(page.locator('#choices')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pk-choices') || '[]'));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ f: 'Akershus', s: 'Asker' });
  // `${programme}|${level}|${nth}` — progKeyMap(); a refactor that changes the
  // shape silently drops every wish a reader has already saved
  expect(stored[0].k).toMatch(/^[^|]+\|Vg[123]\|\d+$/);
});

test('a Vg1 application takes at most three different utdanningsprogram', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Vestland', 'Førde vidaregåande skule');
  const picks = page.locator('#s-list button.pick');
  const n = await picks.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) await picks.nth(i).click();
  // vigo's rule, enforced in toggleChoice(): the fourth programme is refused
  await expect(page.locator('#choices .vnote'))
    .toHaveText('⚠ Til Vg1 kan du søke på inntil tre ulike utdanningsprogram.');
  await expect(page.locator('#s-list button.pick[aria-pressed="true"]')).toHaveCount(3);
});

test('the eleventh wish is refused: a vigo application holds ten', async ({ page }) => {
  await boot(page);
  await seedWishes(page, 'Vestland', 'Førde vidaregåande skule', 10);
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await expect(page.locator('#choices .h')).toContainText('Ønskene mine (10)');
  await openSchool(page, 'Akershus', 'Asker');
  await page.locator('#s-list button.pick').first().click();
  await expect(page.locator('#choices .vnote'))
    .toHaveText('⚠ Vigo-søknaden har plass til ti ønsker – lista er full.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pk-choices') || '[]').length)).toBe(10);
  await expect(page.locator('#s-list button.pick').first()).toHaveAttribute('aria-pressed', 'false');
});
