import { expect, type Page } from '@playwright/test';

/** The localStorage keys the app reads at boot — INTRO_SEEN and HINT_KEY in
 *  web/src/intro.ts, HINT_TRIES is 3. */
export const INTRO_SEEN = 'pk-intro-v1';
export const HINT_KEY = 'pk-help-hint';

/** Collect console errors and page errors from the moment of the call.
 *  The console text of a failed subresource is the browser's generic "Failed to
 *  load resource…", which names nothing; the message's location does, so both
 *  travel in the string the filter below reads. */
export function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`${m.text()} @${m.location()?.url ?? ''}`);
  });
  page.on('pageerror', e => errors.push(String(e)));
  return () => errors;
}

/** Load the app and wait for the boot mark. `intro` seen so the (?) hint does not steal focus. */
export async function boot(page: Page, hash = ''): Promise<void> {
  await page.addInitScript(([seen, hint]) => {
    localStorage.setItem(seen, '1');
    localStorage.setItem(hint, '9');
  }, [INTRO_SEEN, HINT_KEY]);
  await page.goto('/' + hash);
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
}

/** Open a school through its permalink and wait for the sheet to show it.
 *  Writing the whole fragment is what a pasted link does, so it also drops any
 *  `f=` / `c=` the reader had set — see applyUrlFilters() in web/src/sidebar.ts. */
export async function openSchool(page: Page, fylke: string, name: string): Promise<void> {
  await page.evaluate(([f, n]) => { location.hash = `#s=${encodeURIComponent(f)}/${encodeURIComponent(n)}`; }, [fylke, name]);
  await expect(page.locator('#side')).toHaveClass(/open/);
  await expect(page.locator('#s-photo .name h2')).toHaveText(name);
  await expect(page.locator('#side .chart-card')).toBeVisible();
}

/** Every school the map is showing: a cluster counts for the schools inside it
 *  (its label is that number), an unclustered school is one SVG circleMarker in
 *  the overlay pane. Counting only the marker pane would call a zoom-in that
 *  dissolves the clusters a loss of every school on screen. */
export function schoolsOnMap(page: Page): Promise<number> {
  return page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('#map .leaflet-marker-pane .pk-cluster')
      .forEach(c => { n += Number(c.textContent) || 0; });
    return n + document.querySelectorAll('#map .leaflet-overlay-pane path').length;
  });
}

/** The tap area of a control, including the invisible ::after a touch screen
 *  grows out of it (the `@media (pointer: coarse)` block in app.css). */
export function touchTarget(page: Page, selector: string): Promise<{ h: number; w: number }> {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('no such control: ' + sel);
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    const px = (v: string) => (v && v.endsWith('px') ? parseFloat(v) : 0);
    const on = a.content && a.content !== 'none';
    const g = on
      ? { t: px(a.top), b: px(a.bottom), l: px(a.left), r: px(a.right) }
      : { t: 0, b: 0, l: 0, r: 0 };
    return { h: Math.round(r.height - g.t - g.b), w: Math.round(r.width - g.l - g.r) };
  }, selector);
}

/** Fill `pk-choices` with `n` wishes taken from one school, in the storage shape
 *  the app writes: {f: county, s: school, k: `${programme}|${level}|${nth}`}
 *  (progKeyMap in web/src/chance.ts). Returns the school's name. */
export async function seedWishes(page: Page, fylke: string, school: string, n: number): Promise<string> {
  return page.evaluate(async ([f, s, count]) => {
    const data = await (await fetch('/data/schools.json')).json();
    const sc = data.schools.find((x: any) => x.fylke === f && x.name === s);
    if (!sc) throw new Error('no such school: ' + f + '/' + s);
    const occ: Record<string, number> = {};
    const keys = sc.programs.map((p: any) => {
      const k = p.program.toLowerCase(), o = occ[k] || 0;
      occ[k] = o + 1;
      return `${k}|${p.level}|${o}`;
    }).slice(0, count as number);
    localStorage.setItem('pk-choices', JSON.stringify(keys.map((k: string) => ({ f, s, k }))));
    return sc.name;
  }, [fylke, school, n] as const);
}

export async function expectNoConsoleErrors(errors: () => string[]): Promise<void> {
  // the analytics tag is a no-op locally and must not count
  expect(errors().filter(e => !e.includes('_vercel/insights'))).toEqual([]);
}
