import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { boot } from './helpers';

test('the figure invariants hold on every school (the app checks its own arithmetic)', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  const harness = readFileSync(new URL('./harness/figure-invariants.js', import.meta.url), 'utf8');
  const report = await page.evaluate(harness);
  expect(String(report)).toMatch(/^all green/);
});
