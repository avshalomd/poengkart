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

// The tab title is part of the page a link opens, and a bookmark keeps it.
// A school's page is titled after the school, and the prerendered title has to
// survive the script's takeover; with no sheet open the title is the app's own.
const HOME_TITLE = 'Poengkart – poenggrenser for videregående skole';

test('the title follows the sheet', async ({ page }) => {
  await boot(page, '/akershus/asker');
  await expect(page).toHaveTitle('Asker – poenggrenser | Poengkart');
  await page.locator('#s-photo button.close:not(.bug)').click();
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  await expect(page).toHaveTitle(HOME_TITLE);
  // a school opened inside the app, with a real click, is titled too
  await page.click('#view-list');
  await page.locator('#listview tbody tr').first().click();
  await expect(page.locator('#side')).toHaveClass(/open/);
  const name = await page.locator('#s-photo .name h2').textContent();
  await expect(page).toHaveTitle(`${name} – poenggrenser | Poengkart`);
  await page.goBack();
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  await expect(page).toHaveTitle(HOME_TITLE);
});

// The page a link opens is the page the reader arrived on: one Back leaves it,
// as from any other page; the ✕ closes the sheet in place; and focus stays
// where a page load leaves it instead of jumping to the close button.
test('a school page opened directly is one history entry, and its ✕ closes in place', async ({ page }) => {
  await page.goto('/robots.txt');                  // the page before, whatever it was
  await boot(page, '/akershus/asker');
  await expect(page.locator('#side')).toHaveClass(/open/);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.goBack();
  expect(new URL(page.url()).pathname).toBe('/robots.txt');
  await page.goForward();
  await page.waitForFunction(() => performance.getEntriesByName('pk:boot-done').length > 0);
  await page.locator('#s-photo button.close:not(.bug)').click();
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page).toHaveTitle(HOME_TITLE);
  // a school opened inside the app still gets its own entry, and Back closes it
  await page.click('#view-list');
  await page.locator('#listview tbody tr').first().click();
  await expect(page.locator('#side')).toHaveClass(/open/);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement?.matches('#s-photo .close') ?? false)).toBe(true);
  await page.goBack();
  await expect(page.locator('#side')).not.toHaveClass(/open/);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('a school path no school answers to ends on the home title', async ({ page }) => {
  await boot(page, '/akershus/finnes-ikke');
  await expect(page).toHaveTitle(HOME_TITLE);
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
  // the Search Console property is verified by this tag; a page without it
  // un-verifies the property
  expect(html).toContain('<meta name="google-site-verification" content="nstWEgPKGkzQDB8692StPPh6C1gsEGfjoOXMiDN6lJo">');
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
