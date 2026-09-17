import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { boot, openSchool } from './helpers';

// CI fails only on serious and critical axe impacts. Moderate findings
// (contrast at the margins, landmark nits) are triaged by the /qa skill, so a
// green run here is "no serious violation", not "axe-clean".
const serious = (r: { violations: { impact?: string | null; id: string; nodes: unknown[] }[] }) =>
  r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id} ×${v.nodes.length}`);

test('no serious axe violations on the map view', async ({ page }) => {
  await boot(page);
  expect(serious(await new AxeBuilder({ page }).exclude('#map .leaflet-tile-pane').analyze())).toEqual([]);
});

test('no serious axe violations with a school open', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  expect(serious(await new AxeBuilder({ page }).exclude('#map').analyze())).toEqual([]);
});

test('no serious axe violations in the list view', async ({ page }) => {
  await boot(page);
  await page.click('#view-list');
  await expect(page.locator('#listview')).toBeVisible();
  expect(serious(await new AxeBuilder({ page }).exclude('#map').analyze())).toEqual([]);
});
