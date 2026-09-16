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

// listLayout() reads LIST_LAYOUT = { n: [1068, 1582], … } (web/src/app.js) and
// puts one of three classes on <body>. The widths below sit either side of both
// numbers, so a regression to the 1240px split that commit 0621b00 fixed fails
// here — 1400 alone would pass under either threshold.
const LAYOUTS = [
  { w: 1600, cls: 'lv-wide',  beside: true  },  // three columns: panel, table, school
  { w: 1100, cls: 'lv-split', beside: true  },  // two columns, just over the 1068 split
  { w: 1060, cls: 'lv-thin',  beside: false },  // just under it: the sheet covers the table
  { w: 600,  cls: 'lv-thin',  beside: false },
] as const;

test('the list keeps three layouts, at the 1068 and 1582 thresholds', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.click('#view-list');
  await page.locator('#listview tbody tr').first().click();
  await expect(page.locator('#side')).toHaveClass(/open/);
  for (const { w, cls, beside } of LAYOUTS) {
    await page.setViewportSize({ width: w, height: 900 });
    await expect(page.locator('body'), `at ${w}px`).toHaveClass(new RegExp(`\\b${cls}\\b`));
    // lv-stack marks the two that scroll #app, so it is the complement of wide
    await expect.poll(async () => page.locator('body').evaluate(
      b => b.classList.contains('lv-stack')), { message: `lv-stack at ${w}px` }).toBe(cls !== 'lv-wide');
    await expect.poll(async () => {
      const [list, side] = await Promise.all([
        page.locator('#listview').boundingBox(), page.locator('#side').boundingBox()]);
      return !!list && !!side && side.x >= list.x + list.width - 1;
    }, { message: `beside at ${w}px` }).toBe(beside);
  }
});
