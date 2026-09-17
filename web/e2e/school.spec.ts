import { test, expect } from '@playwright/test';
import { boot, openSchool, watchErrors, expectNoConsoleErrors } from './helpers';

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

// #tip is hidden in the markup and nothing on a permalink load creates one, so
// a bare "the tip is hidden" assertion is true before the test does anything.
// Both tests below open a real tooltip first — bindTips() attaches to the level
// chip on hover and to the row's name button on keyboard focus.
const TIP = '#tip';

test('Escape closes the sheet and takes an open tooltip with it', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'hover is a pointer gesture; a touch tip is its own path, with a 4.5s timer');
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  const lv = page.locator('#s-list .lv.tipped').first();
  await expect(lv).toBeVisible();
  await lv.hover();
  await expect(page.locator(TIP)).toBeVisible();
  await expect(page.locator(TIP)).toContainText('Vg1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  // the chip leaves the cursor as the sheet goes, so mouseleave clears the tip:
  // nothing floats over the map afterwards
  await expect(page.locator(TIP)).toBeHidden();
  await expect(page.locator('#map .leaflet-tooltip')).toHaveCount(0);
});

test('a keyboard reader’s first Escape closes the tooltip, the second the sheet', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'no Tab order to walk on a phone');
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  // Tab all the way in rather than calling focus(): the tip only opens on
  // :focus-visible, which is the browser's own keyboard-modality judgement.
  const onName = () => page.evaluate(() => !!document.activeElement?.matches('#s-list .prow button.nm'));
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) { await page.keyboard.press('Tab'); reached = await onName(); }
  expect(reached, 'Tab reaches the programme row’s name button').toBe(true);
  await expect(page.locator(TIP)).toBeVisible();
  // programs.ts: the row's keydown hides the tip and stops the event, so the sheet stays
  await page.keyboard.press('Escape');
  await expect(page.locator(TIP)).toBeHidden();
  await expect(page.locator('#side')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
});
