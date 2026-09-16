import { test, expect } from '@playwright/test';
import { boot, openSchool, F1 } from './helpers';

test('entering points switches the legend to chance bands and colours the sheet', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.fill('#my-points', '45');
  // the legend's bins are the band thresholds, not their names: the words
  // «sannsynlig / mulig / lite sannsynlig» live in the title and the sheet
  await expect(page.locator('#legend-title')).toContainText('Sjanse for plass med 45,0 poeng');
  await expect(page.locator('#legend-bins')).toContainText('≥ 70 %');
  await openSchool(page, 'Akershus', 'Asker');
  await expect(page.locator('#s-chance')).toContainText('Med 45,0 poeng');
  await expect(page.locator('#s-list .ch:not(.none)')).not.toHaveCount(0);
});

test('points persist across a reload and clear with the ✕', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.fill('#my-points', '45');
  await expect(page.locator('#pts-clear')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  // renderPointsField reprints a stored figure in the language's own convention
  await expect(page.locator('#my-points')).toHaveValue('45,0');
  await page.click('#pts-clear');
  await expect(page.locator('#my-points')).toHaveValue('');
  await expect(page.locator('#legend-bins')).toContainText('42+');
  await expect(page.locator('#pts-clear')).toBeHidden();
});

test('an impossible score is refused and the map keeps its threshold colours', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.fill('#my-points', '999');
  await expect(page.locator('#pts-note')).toHaveText('Skriv et tall mellom 0 og 70 – for eksempel 42,5.');
  await expect(page.locator('#my-points')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#legend-bins')).toContainText('42+');
  await expect(page.locator('#legend-bins')).not.toContainText('≥ 70 %');
});
