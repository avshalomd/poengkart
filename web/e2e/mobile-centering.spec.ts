import { test, expect } from '@playwright/test';
import { boot, openSchool } from './helpers';

/* Round controls, measured by what they actually draw.
 *
 * Three of them had drifted off their own middle and nothing could see it:
 *   - the calculator button in the points row held a bare <svg>, which sits on
 *     the text baseline, 1,5px above the centre of its circle (its neighbour,
 *     the ✕, escaped through `.xi { margin: auto }`);
 *   - the bug button on a school's photo took its grid centring and its icon
 *     size from inside `@media (hover: hover)`, so on a phone the icon fell
 *     back to the UA's 28px in a 40px circle, 2px high;
 *   - the remove ✕ in the choices list kept the UA's own `padding: 1px 6px`,
 *     which left its 13px cross a content box of 10 to overflow rightwards.
 *
 * The box being square and the border-radius being 999px says nothing about
 * where the ink lands, so this measures the ink: the union of the drawn
 * geometry (getBBox mapped through the viewBox, not the <svg> box, which can be
 * larger than the artwork) and the text runs, against the control's own centre.
 *
 * 0.75px is the line. Everything the app draws today is inside 0.5 — the bug
 * glyph is 0.35 off its own viewBox and the zoom `+` half a pixel, both the
 * artwork's business — and the three defects were 1.5, 1.75 and 2.08.
 */
const TOLERANCE = 0.75;

type Off = { name: string; dx: number; dy: number; box: string };

/** Every round control on screen, with how far its ink sits from its centre. */
function measure(page: import('@playwright/test').Page, state: string): Promise<Off[]> {
  return page.evaluate(label => {
    const ink = (el: Element) => {
      let box: { l: number; t: number; r: number; b: number } | null = null;
      const add = (r: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => {
        if (!r || (!r.width && !r.height)) return;
        box = box
          ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) }
          : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      };
      const walk = (n: Node) => {
        for (const c of Array.from(n.childNodes)) {
          if (c.nodeType === 3) {
            if (!(c as Text).data.trim()) continue;
            const rg = document.createRange();
            rg.selectNodeContents(c);
            for (const r of Array.from(rg.getClientRects())) add(r);
          } else if (c.nodeType === 1) {
            const e = c as Element;
            const cs = getComputedStyle(e);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (e.tagName === 'svg' || e.tagName === 'IMG') {
              const r = e.getBoundingClientRect();
              const svg = e as SVGSVGElement;
              const vb = svg.viewBox?.baseVal;
              let bb: DOMRect | null = null;
              try { bb = svg.getBBox ? svg.getBBox() : null; } catch { bb = null; }
              if (bb && vb && vb.width && bb.width) {
                // the drawn geometry, placed through the viewBox
                const sx = r.width / vb.width, sy = r.height / vb.height;
                const l = r.left + (bb.x - vb.x) * sx, t = r.top + (bb.y - vb.y) * sy;
                const rr = r.left + (bb.x - vb.x + bb.width) * sx, bt = r.top + (bb.y - vb.y + bb.height) * sy;
                add({ left: l, top: t, right: rr, bottom: bt, width: rr - l, height: bt - t });
              } else add(r);
            } else walk(e);
          }
        }
      };
      walk(el);
      return box as { l: number; t: number; r: number; b: number } | null;
    };

    const out: Off[] = [];
    for (const el of Array.from(document.querySelectorAll('button, summary, [role="button"]'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      // round: the radius takes the whole of the shorter side. A pill of text
      // is left- or right-aligned as often as centred and is not this test's
      // business; a circle always centres what is in it.
      const radius = parseFloat(cs.borderTopLeftRadius);
      if (!(radius >= Math.min(r.width, r.height) / 2 - 1)) continue;
      if (Math.abs(r.width - r.height) > 2) continue;
      const i = ink(el);
      if (!i) continue;
      const bl = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const br = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight);
      const bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
      const bb = parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom);
      const cx = (r.left + bl + r.right - br) / 2, cy = (r.top + bt + r.bottom - bb) / 2;
      const id = el.id ? '#' + el.id : '';
      const cl = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      out.push({
        name: `${label}: ${el.tagName.toLowerCase()}${id}${cl}`,
        dx: +((i.l + i.r) / 2 - cx).toFixed(2),
        dy: +((i.t + i.b) / 2 - cy).toFixed(2),
        box: `${Math.round(r.width)}×${Math.round(r.height)}`,
      });
    }
    return out;
  }, state);
}

function expectCentred(found: Off[]): void {
  expect(found.length, 'no round control was measured at all').toBeGreaterThan(0);
  const off = found.filter(o => Math.abs(o.dx) > TOLERANCE || Math.abs(o.dy) > TOLERANCE);
  expect(off.map(o => `${o.name} (${o.box}) is ${o.dx}, ${o.dy} off centre`)).toEqual([]);
}

test('every round control in the panel centres what it draws', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '42,5');
  await page.waitForTimeout(400);
  const found = await measure(page, 'panel');
  // the points row draws both of its circles only once there is a value to clear
  expect(found.map(o => o.name)).toContain('panel: button#calc-open');
  expect(found.map(o => o.name)).toContain('panel: button#pts-clear');
  expectCentred(found);
});

test('every round control in the sheets centres what it draws', async ({ page }) => {
  await boot(page);
  const found: Off[] = [];
  for (const [btn, sheet] of [
    ['#settings-btn', '#settings'], ['#calc-open', '#calc'],
    ['#help-btn', '#intro'], ['#bug-btn', '#contact'],
  ] as const) {
    await page.click(btn);
    await expect(page.locator(sheet)).toBeVisible();
    await page.waitForTimeout(300);
    found.push(...await measure(page, sheet));
    await page.keyboard.press('Escape');
    await expect(page.locator(sheet)).toBeHidden();
  }
  expectCentred(found);
});

test('every round control on a school centres what it draws', async ({ page }) => {
  await boot(page);
  await page.fill('#my-points', '42,5');
  await openSchool(page, 'Vestland', 'Førde vidaregåande skule');
  await page.waitForTimeout(500);
  const found = await measure(page, 'school');
  // the photo's two glass circles: the ✕ and, one step to its left, the bug
  // report whose place and size used to be declared inside the hover query
  expect(found.map(o => o.name)).toContain('school: button.close.bug');
  // a pick toggle, then the wish it makes in the panel's choices list — which
  // on a phone the sheet covers, so the list is read once the sheet is closed
  await page.locator('#side .prow .pick').first().click();
  await page.waitForTimeout(400);
  const wished = await measure(page, 'school+wish');
  expect(wished.map(o => o.name)).toContain('school+wish: button.pick.on');
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  await page.waitForTimeout(400);
  const choices = await measure(page, 'choices');
  expect(choices.map(o => o.name)).toContain('choices: button.rm');
  expectCentred([...found, ...wished, ...choices]);
});
