import { test, expect } from '@playwright/test';
import { boot, schoolsOnMap } from './helpers';

test('the county select narrows the map and writes the permalink', async ({ page }) => {
  await boot(page);
  const before = await schoolsOnMap(page);
  // the option's label carries the school count («Oslo (25)»); its value is the
  // county's own name, which is what onMapFylke and the `f=` query carry
  await page.selectOption('#map-fylke', 'Oslo');
  await expect.poll(() => schoolsOnMap(page)).toBeLessThan(before);
  expect(decodeURIComponent(page.url())).toContain('?f=Oslo');
  await expect(page.locator('#panel-sum')).toContainText('Oslo');
});

test('the utdanningsprogram select explains itself in the note', async ({ page }) => {
  await boot(page);
  const options = await page.locator('#map-cat option').allTextContents();
  expect(options.length).toBeGreaterThan(2);
  await page.selectOption('#map-cat', { index: 1 });
  await expect(page.locator('#cat-note')).toHaveText(/^\d+ skole(r)? tilbyr dette$/);
});

test('a filter permalink restores both selects on load', async ({ page }) => {
  // applyUrlFilters runs from boot, so this half of the round trip is reachable
  // without an inline handler: the query string is read straight off the address.
  await boot(page);
  const cat = await page.locator('#map-cat option').nth(1).getAttribute('value');
  await boot(page, `/?f=Oslo&c=${encodeURIComponent(cat!)}`);
  await expect(page.locator('#map-fylke')).toHaveValue('Oslo');
  await expect(page.locator('#map-cat')).toHaveValue(cat!);
  await expect(page.locator('#panel-sum')).toContainText('Oslo');
});

test('picking the two selects writes that permalink back', async ({ page }) => {
  await boot(page);
  await page.selectOption('#map-fylke', 'Oslo');
  await page.selectOption('#map-cat', { index: 1 });
  const cat = await page.locator('#map-cat').inputValue();
  expect(decodeURIComponent(page.url())).toContain('c=' + cat);
  expect(decodeURIComponent(page.url())).toContain('f=Oslo');
});

test('the counties with no figures are listed but cannot be picked', async ({ page }) => {
  await boot(page);
  const disabled = page.locator('#map-fylke optgroup option');
  await expect(disabled).not.toHaveCount(0);
  for (const o of await disabled.all()) await expect(o).toBeDisabled();
});
