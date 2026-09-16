import { test, expect } from '@playwright/test';
import { boot, F1 } from './helpers';

test('the grade calculator turns grades into points and hands them to the points field', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.click('#calc-open');
  await expect(page.locator('#calc')).toBeVisible();
  // a grade is a pressed pill per subject, not a <select> or a number field:
  // fifteen vitnemål subjects and the two exam slots (CALC_SUBJECTS/CALC_EXAMS)
  const subjects = page.locator('#calc-body .subj');
  const n = await subjects.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    // every press rebuilds #calc-body, so each row is resolved afresh
    await page.locator('#calc-body .subj').nth(i).locator('button[data-g="5"]').click();
  }
  // points = the average of the numeric grades × 10
  await expect(page.locator('#calc-body .sum')).toContainText('5,00');
  await expect(page.locator('#calc-body .sum')).toContainText('50,0');
  await page.click('#calc-use');
  await expect(page.locator('#calc')).toBeHidden();
  await expect(page.locator('#my-points')).toHaveValue('50,0');
});

test('the grades are remembered, and Tøm clears them', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  await page.click('#calc-open');
  await page.locator('#calc-body .subj').first().locator('button[data-g="4"]').click();
  await expect(page.locator('#calc-body .sum')).toContainText('4,00');
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await page.click('#calc-open');
  await expect(page.locator('#calc-body .subj').first().locator('button[data-g="4"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await page.click('#calc-reset');
  await expect(page.locator('#calc-body .sum')).toContainText('–');
  await expect(page.locator('#calc-use')).toBeDisabled();
});
