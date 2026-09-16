import { test, expect } from '@playwright/test';
import { boot, openSchool, touchTarget, F1 } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'phone only');

const noSideScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('nothing scrolls sideways, and the school sheet fits the screen', async ({ page }) => {
  await boot(page);
  expect(await noSideScroll(page)).toBe(true);
  // the heaviest sheet in the dataset
  await openSchool(page, 'Vestland', 'Førde vidaregåande skule');
  expect(await noSideScroll(page)).toBe(true);
  const vp = page.viewportSize()!;
  const side = await page.locator('#side').boundingBox();
  expect(side!.height).toBeLessThanOrEqual(vp.height + 1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
});

test('the settings, the calculator and the help sheet fit the screen', async ({ page }) => {
  test.fixme(true, F1);
  await boot(page);
  const vp = page.viewportSize()!;
  for (const [btn, sheet] of [['#settings-btn', '#settings'], ['#calc-open', '#calc'], ['#help-btn', '#intro']] as const) {
    await page.click(btn);
    await expect(page.locator(sheet)).toBeVisible();
    const box = await page.locator(sheet).boundingBox();
    expect(box!.height, sheet).toBeLessThanOrEqual(vp.height + 1);
    expect(await noSideScroll(page), sheet).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator(sheet)).toBeHidden();
  }
});

// The tap area, not the painted box: the `@media (pointer: coarse)` block grows
// an invisible ::after out of the small icon buttons. Three of these reach the
// 44px the rest of the app is held to; the view toggle (39) and the search
// button (41) do not — see the report's Findings, this pins today's geometry so
// that nothing shrinks further unnoticed.
const TOUCH_HEIGHT: Record<string, number> = {
  '#bug-btn': 44, '#help-btn': 44, '#settings-btn': 44, '#calc-open': 44,
  '#searchov-btn': 41, '#view-map': 39, '#view-list': 39,
};

test('every control in the panel keeps its tap area', async ({ page }) => {
  await boot(page);
  for (const [sel, min] of Object.entries(TOUCH_HEIGHT)) {
    const { h, w } = await touchTarget(page, sel);
    expect(h, `${sel} height`).toBeGreaterThanOrEqual(min);
    // WCAG 2.5.8 AA, which every one of them clears in both directions
    expect(w, `${sel} width`).toBeGreaterThanOrEqual(24);
  }
});

test('the points field asks for the decimal keypad, and stays in sight when the keyboard opens', async ({ page }) => {
  await boot(page);
  // web/index.html: a points field that summoned the full QWERTY would be a
  // phone bug of its own
  await expect(page.locator('#my-points')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.locator('#pts-field')).toBeVisible();

  const box = () => page.evaluate(() => {
    const el = document.getElementById('panel');
    const p = el.getBoundingClientRect(), f = document.getElementById('my-points').getBoundingClientRect();
    return { scrollable: el.scrollHeight > el.clientHeight, inside: f.top >= p.top - 1 && f.bottom <= p.bottom + 1 };
  });
  await page.locator('#my-points').focus();
  const vp = page.viewportSize()!;
  // A software keyboard is not something Playwright can raise, but what it does
  // to the page is take roughly half the height — which is the part commit
  // 453b812 had to survive: the panel's cap shrinks, the field falls below it.
  await page.setViewportSize({ width: vp.width, height: Math.round(vp.height / 2) });
  await expect.poll(async () => (await box()).scrollable, { message: 'the shrunk panel scrolls' }).toBe(true);
  await expect.poll(async () => (await box()).inside, { message: 'the focused field is in the panel' }).toBe(true);

  // and the counter-case, so the assertion above cannot pass by accident:
  // scrolled away the field really is out of view, and focus brings it back
  // (panel's focusin → keepPanelFocusInView in web/src/app.js)
  await page.evaluate(() => { document.getElementById('my-points')!.blur(); document.getElementById('panel')!.scrollTop = 0; });
  expect((await box()).inside, 'scrolled to the top the field is out of view').toBe(false);
  await page.locator('#my-points').focus();
  await expect.poll(async () => (await box()).inside, { message: 'refocus scrolls it back' }).toBe(true);
  await page.setViewportSize(vp);
});

test('the panel folds to one row once the reader uses the map', async ({ page }) => {
  await boot(page);
  const before = (await page.locator('#panel').boundingBox())!.height;
  await page.mouse.move(200, 500); await page.mouse.down(); await page.mouse.move(260, 560, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('body')).toHaveClass(/panel-folded/);
  await expect.poll(async () => (await page.locator('#panel').boundingBox())!.height).toBeLessThan(before);
  // the folded line says what the two selects it hides are set to
  await expect(page.locator('#panel-sum')).toContainText('Hele landet');
});
