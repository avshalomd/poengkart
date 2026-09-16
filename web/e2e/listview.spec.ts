import { test, expect } from '@playwright/test';
import { boot, F1 } from './helpers';

test('Kart ⇄ Liste shows a sortable table of the visible schools and remembers the view', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.click('#view-list');
  await expect(page.locator('#listview')).toBeVisible();
  await expect(page.locator('#view-list')).toHaveAttribute('aria-pressed', 'true');
  const rows = page.locator('#listview tbody tr');
  expect(await rows.count()).toBeGreaterThan(100);
  const firstBefore = await rows.first().textContent();
  // the header's own <button> does the sorting; the <th> around it takes no click
  await page.locator('#listview th').nth(1).locator('button').click();
  await expect.poll(async () => rows.first().textContent()).not.toBe(firstBefore);
  await expect(page.locator('#listview th').nth(1)).toHaveAttribute('aria-sort', 'ascending');
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await expect(page.locator('#listview')).toBeVisible();
});

test('a row opens the school beside the table', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.click('#view-list');
  await page.locator('#listview tbody tr').first().click();
  await expect(page.locator('#side')).toHaveClass(/open/);
  await expect(page.locator('#s-photo .name h2')).not.toBeEmpty();
});

test('the list keeps three layouts: a school beside the table from 1068px, stacked below it', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.click('#view-list');
  await page.locator('#listview tbody tr').first().click();
  await expect(page.locator('#side')).toHaveClass(/open/);
  for (const [w, expectBeside] of [[1400, true], [1000, false], [600, false]] as const) {
    await page.setViewportSize({ width: w, height: 900 });
    await expect.poll(async () => {
      const [list, side] = await Promise.all([
        page.locator('#listview').boundingBox(), page.locator('#side').boundingBox()]);
      return !!list && !!side && side.x >= list.x + list.width - 1;
    }, { message: `at ${w}px` }).toBe(expectBeside);
  }
});
