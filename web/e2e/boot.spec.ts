import { test, expect } from '@playwright/test';
import { boot, watchErrors, expectNoConsoleErrors, schoolsOnMap } from './helpers';

test('boots: every school on the map, no console errors, title and lang set', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);
  await expect(page).toHaveTitle(/Poengkart/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'no');
  // the panel has no count line under the title any more
  await expect(page.locator('#tagline')).toHaveCount(0);
  // the county select's «Oslo (24)» counts are what the map claims to show
  const claimed = await page.locator('#map-fylke > option:not([value="all"])').evaluateAll(
    os => os.reduce((n, o) => n + Number(/\((\d+)\)$/.exec(o.textContent ?? '')?.[1] ?? 0), 0));
  expect(claimed).toBeGreaterThan(0);
  // the dots and the select count the same dataset: at the opening view most
  // schools sit inside a cluster, so the clusters' own labels are the count
  await expect.poll(() => schoolsOnMap(page)).toBe(claimed);
  await expectNoConsoleErrors(errors);
});

test('the help sheet says when the figures last changed, in both languages', async ({ page }) => {
  await boot(page);
  const data = await (await page.request.get('/data/schools.json')).json();
  const [y, m, d] = data.updated.date.split('-').map(Number);
  await page.click('#help-btn');
  await expect(page.locator('#intro-updated')).toHaveText(
    `Tallene ble sist oppdatert ${d}. ${['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august',
      'september', 'oktober', 'november', 'desember'][m - 1]} ${y}.`);
  await page.click('#intro-x');
  await page.click('#settings-btn');
  await page.click('#settings-body .seg button[data-k="lang"][data-v="en"]');
  await page.keyboard.press('Escape');
  await page.click('#help-btn');
  await expect(page.locator('#intro-updated')).toHaveText(new RegExp(`^Figures last updated ${d} \\w+ ${y}\\.$`));
});

test('text is laid out unhinted, so a whole-pixel renderer keeps the spaces between words', async ({ page }) => {
  await boot(page);
  for (const sel of ['body', '#legend-title', '#pts-note'])
    expect(await page.locator(sel).evaluate(el => getComputedStyle(el).textRendering), sel).toBe('geometricprecision');
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
