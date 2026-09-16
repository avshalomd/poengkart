import { test, expect } from '@playwright/test';
import { boot, openSchool, watchErrors, expectNoConsoleErrors, F1 } from './helpers';

test('a permalink opens the school with photo, hero figure, chart and programme rows', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page, '#s=Akershus/Asker');
  await expect(page.locator('#side')).toHaveClass(/open/);
  await expect(page.locator('#s-photo .name')).toContainText('Asker');
  await expect(page.locator('#s-hero')).toContainText(/\d/);
  await expect(page.locator('#chart-svg svg')).toBeVisible();
  // the programme list renders one .prow per row (renderList)
  await expect(page.locator('#s-list .prow')).not.toHaveCount(0);
  await expectNoConsoleErrors(errors);
});

test('an unknown permalink shows the not-found toast and leaves the map', async ({ page }) => {
  await boot(page, '#s=Akershus/Finnes%20ikke');
  await expect(page.locator('#toast')).toContainText('Fant ikke «Finnes ikke» i kartet.');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
});

test('the browser back button closes the sheet and leaves the address clean', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  await page.goBack();
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  expect(page.url()).not.toContain('#s=');
});

test('the ✕ closes the sheet and keeps a filter changed while it was open', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'on a phone the sheet covers the panel, so the county select cannot be reached');
  test.fixme(true, F1);
  await boot(page);
  // a county that still contains the open school: onMapFylke closes the sheet
  // outright for one that does not (`current` no longer in visibleSchools)
  await openSchool(page, 'Oslo', 'Elvebakken videregående skole');
  await page.selectOption('#map-fylke', 'Oslo');
  await expect(page.locator('#side')).toHaveClass(/open/);
  await page.locator('#s-photo button.close:not(.bug)').click();
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  await expect(page.locator('#map-fylke')).toHaveValue('Oslo');
  expect(decodeURIComponent(page.url())).toContain('#f=Oslo');
});

test('a county that excludes the open school closes the sheet with it', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'on a phone the sheet covers the panel, so the county select cannot be reached');
  test.fixme(true, F1);
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  await page.selectOption('#map-fylke', 'Oslo');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  expect(decodeURIComponent(page.url())).not.toContain('s=Akershus');
});

test('a permalink pasted into an open tab switches the sheet to that school', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  await openSchool(page, 'Oslo', 'Elvebakken videregående skole');
  await expect(page.locator('#s-photo .name')).toContainText('Elvebakken');
});

test('Escape closes the sheet and leaves no tooltip on the map', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  await expect(page.locator('#tip')).toBeHidden();
  await expect(page.locator('#map .leaflet-tooltip')).toHaveCount(0);
});
