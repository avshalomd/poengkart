import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test('a legacy #s= link lands on the school path with the sheet open', async ({ page }) => {
  await boot(page, '/#s=Akershus/Asker&c=ST');
  await expect(page.locator('#side')).toHaveClass(/open/);
  await expect(page.locator('#s-photo .name h2')).toHaveText('Asker');
  expect(new URL(page.url()).pathname).toBe('/akershus/asker');
  expect(new URL(page.url()).search).toBe('?c=ST');
  expect(new URL(page.url()).hash).toBe('');
});

test('a ?s= link (the mailed form) lands on the school path', async ({ page }) => {
  await boot(page, '/?s=Akershus/Asker');
  await expect(page.locator('#s-photo .name h2')).toHaveText('Asker');
  expect(new URL(page.url()).pathname).toBe('/akershus/asker');
});

test('an unknown school is a 404 that still boots the app and says so', async ({ page }) => {
  const res = await page.goto('/akershus/finnes-ikke');
  expect(res!.status()).toBe(404);
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await expect(page.locator('#toast')).toContainText('finnes ikke');
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex');
});

test('the filters ride in the query string and the back button steps over them', async ({ page }) => {
  await boot(page, '/?f=Oslo');
  await expect(page.locator('#map-fylke')).toHaveValue('Oslo');
  await page.locator('#map-fylke').selectOption('Akershus');
  expect(new URL(page.url()).search).toBe('?f=Akershus');
  await page.goBack();
  await expect(page.locator('#map-fylke')).toHaveValue('Oslo');
  expect(new URL(page.url()).search).toBe('?f=Oslo');
});

test('a school page carries the school before any script runs', async ({ request }) => {
  const res = await request.get('/akershus/asker');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<title>Asker – poenggrenser \| Poengkart<\/title>/);
  expect(html).toMatch(/<link rel="canonical" href="https:\/\/poengkart-no\.vercel\.app\/akershus\/asker">/);
  expect(html).toMatch(/<meta property="og:title" content="Asker – hva krevdes for å komme inn\?">/);
  expect(html).toContain('<aside id="side" class="open">');
  expect(html).toContain('<h2>Asker</h2>');
  expect(html).toContain('class="prow');
  expect(html).not.toContain('<meta name="robots"');
});

test('the home page head is unchanged', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toMatch(/<title>Poengkart – poenggrenser for videregående skole<\/title>/);
  expect(html).toMatch(/<link rel="canonical" href="https:\/\/poengkart-no\.vercel\.app\/">/);
  expect(html).not.toContain('class="side-open"');
});

test('the script takes over a prerendered sheet without changing it', async ({ page, request }) => {
  // the page as the server sends it, before any script — parsed by the same
  // browser that will serialise the live DOM, so the two sides agree on quoting
  const raw = await (await request.get('/akershus/asker')).text();
  await page.goto('/akershus/asker');
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  const [prerendered, live] = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [doc.getElementById('s-list')!.innerHTML, document.getElementById('s-list')!.innerHTML];
  }, raw);
  expect(live).toBe(prerendered);
  await expect(page.locator('#s-hero .cell').first()).toBeVisible();
});

test('every school page points at its own card, and the card is a PNG', async ({ request }) => {
  const html = await (await request.get('/akershus/asker')).text();
  expect(html).toMatch(/<meta property="og:image" content="https:\/\/poengkart-no\.vercel\.app\/og\/akershus\/asker\.png">/);
  const res = await request.get('/og/akershus/asker.png');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
  expect((await res.body()).length).toBeGreaterThan(10_000);
});

test('the sitemap names every school', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect((xml.match(/<loc>/g) || []).length).toBeGreaterThan(200);
  expect(xml).toContain('<loc>https://poengkart-no.vercel.app/akershus/asker</loc>');
});
