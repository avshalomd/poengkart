import { test, expect } from '@playwright/test';
import { boot, openSchool } from './helpers';

test('a submitted grade average switches the legend to chance bands and colours the sheet', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '4,5');
  await page.press('#my-points', 'Enter');
  // the legend's bins are the band thresholds, not their names: the words
  // «sannsynlig / mulig / lite sannsynlig» live in the title and the sheet
  await expect(page.locator('#legend-title')).toContainText('Estimert sjanse for plass med 4,5 i snitt');
  await expect(page.locator('#legend-bins')).toContainText('≥ 70 %');
  // the thresholds stay in karakterpoeng, so the field says how the two meet
  await expect(page.locator('#pts-note')).toContainText('4,5 i snitt tilsvarer 45,0');
  await openSchool(page, 'Akershus', 'Asker');
  await expect(page.locator('#s-chance')).toContainText('Med 4,5 i snitt');
  await expect(page.locator('#s-list .ch:not(.none)')).not.toHaveCount(0);
});

test('nothing moves while the reader types; the ✓, Enter and leaving the field submit', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '4,5');
  await expect(page.locator('#pts-act')).toHaveClass(/go/);
  await expect(page.locator('#pts-act')).toHaveAttribute('aria-label', 'Vis sjansen for plass');
  await expect(page.locator('#legend-bins')).toContainText('42+');
  await expect(page.locator('#legend-bins')).not.toContainText('≥ 70 %');
  await page.click('#pts-act');
  await expect(page.locator('#legend-bins')).toContainText('≥ 70 %');
  // submitted, the same button is the ✕
  await expect(page.locator('#pts-act')).not.toHaveClass(/go/);
  await expect(page.locator('#pts-act')).toHaveAttribute('aria-label', 'Fjern karaktersnittet');
  await page.fill('#my-points', '5,1');
  await expect(page.locator('#legend-title')).toContainText('4,5 i snitt');
  await page.locator('#my-points').blur();
  await expect(page.locator('#legend-title')).toContainText('5,1 i snitt');
});

test('the average persists across a reload and clears with the ✕', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '4,5');
  await page.press('#my-points', 'Enter');
  await expect(page.locator('#pts-act')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  // renderPointsField reprints a stored figure in the language's own convention
  await expect(page.locator('#my-points')).toHaveValue('4,5');
  await page.click('#pts-act');
  await expect(page.locator('#my-points')).toHaveValue('');
  await expect(page.locator('#legend-bins')).toContainText('42+');
  await expect(page.locator('#pts-act')).toBeHidden();
});

test('points typed for an average are asked about, never corrected', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '30,2');
  await page.press('#my-points', 'Enter');
  await expect(page.locator('#pts-note')).toHaveText('30,2 er ikke et karaktersnitt. Mente du 3,02?');
  await expect(page.locator('#my-points')).toHaveValue('30,2');
  await expect(page.locator('#my-points')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#legend-bins')).not.toContainText('≥ 70 %');
  // the question is the button: the reader takes the suggestion, the app does not
  await page.click('#pts-note button');
  await expect(page.locator('#my-points')).toHaveValue('3,02');
  await expect(page.locator('#legend-title')).toContainText('3,02 i snitt');
});

test('an impossible average is refused and the map keeps its threshold colours', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '7,5');
  await page.press('#my-points', 'Enter');
  await expect(page.locator('#pts-note')).toHaveText('Skriv et karaktersnitt mellom 1 og 6 – for eksempel 4,25.');
  await expect(page.locator('#my-points')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#legend-bins')).toContainText('42+');
  await expect(page.locator('#legend-bins')).not.toContainText('≥ 70 %');
});
