import { test, expect } from '@playwright/test';
import { boot, watchErrors, expectNoConsoleErrors, schoolsOnMap } from './helpers';

test('boots: every school on the map, no console errors, title and lang set', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);
  await expect(page).toHaveTitle(/Poengkart/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'no');
  // the scope line, not #panel-sum: the folded line names the two selects
  // («Fylke: Hele landet, Utdanningsprogram: …»), the tagline carries the count
  await expect(page.locator('#tagline')).toHaveText(/^\d+ skoler · \d+ fylker · \d{4}–\d{4}$/);
  const claimed = Number((await page.locator('#tagline').innerText()).match(/^(\d+)/)![1]);
  // the dots and the headline count the same dataset: at the opening view most
  // schools sit inside a cluster, so the clusters' own labels are the count
  await expect.poll(() => schoolsOnMap(page)).toBe(claimed);
  await expectNoConsoleErrors(errors);
});

test('the report page renders', async ({ page }) => {
  await page.goto('/report.html');
  await expect(page.locator('h1').first()).toBeVisible();
});

test('the failure screen names the data when schools.json is unreachable', async ({ page }) => {
  await page.route('**/data/schools.json', r => r.fulfill({ status: 500, body: '' }));
  await page.goto('/');
  // bootFailed() replaces the whole of #app, so the notice is not inside #map
  await expect(page.locator('#app .boot-fail')).toBeVisible();
  await expect(page.locator('#app .boot-fail')).toContainText('Kartet kunne ikke lastes');
  await expect(page.locator('#app .boot-fail')).toContainText('Fikk ikke lastet datasettet');
});

test('a browser without WebGL boots into the list with the map toggle disabled', async ({ page }) => {
  // the probe is getContext('webgl2'); take it away before any script runs
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return (orig as any).call(this, type, ...rest);
    } as any;
  });
  await page.goto('/');
  await expect(page.locator('#listview')).toBeVisible();
  await expect(page.locator('#view-map')).toBeDisabled();
  await expect(page.locator('#toast')).toContainText('WebGL');
  await expect(page.locator('#map')).toBeHidden();
  // a school still opens from the list; the sheet's header carries a minimap
  // only when the school has no photo (photoHtml, web/src/templates.ts), so
  // that half of the assertion only applies when the first row lands on one
  await page.locator('#listview tbody tr').first().click();
  await expect(page.locator('#side')).toHaveClass(/open/);
  if (await page.locator('#s-minimap').count()) {
    await expect(page.locator('#s-minimap')).toHaveClass(/off/);
  }
});
