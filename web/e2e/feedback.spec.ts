import { test, expect } from '@playwright/test';
import { boot, openSchool } from './helpers';

// the feedback form, reached through help, on «Noe i appen virker ikke»
async function reportFromHelp(page) {
  await page.click('#help-btn');
  await page.click('#intro .cta.ghost');
  await expect(page.locator('#contact')).toBeVisible();
  await page.selectOption('#c-kind', 'feil');
}

test('a bug report from help sends the view, the filters and the school on screen, never a picture', async ({ page }) => {
  await boot(page);
  // the county is set AFTER the school: a permalink is a page load, so opening
  // one drops the `f=` a reader had chosen (applyUrlFilters)
  await openSchool(page, 'Oslo', 'Elvebakken videregående skole');
  await page.selectOption('#map-fylke', 'Oslo');
  await expect(page.locator('#side')).toHaveClass(/open/);

  let body: any = null;
  await page.route('**/api/feedback', async r => { body = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
  await reportFromHelp(page);
  // the kind takes the snapshot and lists it in the open
  await expect(page.locator('#contact-body details.ctx')).toContainText('Dette sendes med');

  await page.fill('#c-msg', 'Testmelding fra e2e');
  await page.click('#c-send');
  await expect.poll(() => body).not.toBeNull();

  expect(body.type).toBe('feil');
  expect(body.message).toBe('Testmelding fra e2e');
  // bugContext(): the keys the relay prints under the message
  expect(body.context).toMatchObject({
    from: 'form',
    view: 'map',
    fylke: 'Oslo',
    school: 'Elvebakken videregående skole (Oslo)',
    levels: 'Vg1',
    lang: 'no',
  });
  expect(body.context.link).toContain('/oslo/elvebakken-videregaende-skole');
  expect(Array.isArray(body.context.rows)).toBe(true);
  expect(body.context.rows.length).toBeGreaterThan(0);
  expect(body.context.hero).toContain('Snitt');
  // a screenshot is more than a bug report needs
  expect(JSON.stringify(body)).not.toMatch(/data:image/);
  await expect(page.locator('#contact-body')).toContainText('Takk! Meldingen er sendt.');
});

test('the sheet’s own bug button reports the school it sits on', async ({ page }) => {
  await boot(page);
  await openSchool(page, 'Akershus', 'Asker');
  let body: any = null;
  await page.route('**/api/feedback', async r => { body = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
  await page.locator('#s-photo button.close.bug').click();
  await expect(page.locator('#contact')).toBeVisible();
  await page.fill('#c-msg', 'Testmelding fra e2e');
  await page.click('#c-send');
  await expect.poll(() => body).not.toBeNull();
  expect(body.context.school).toBe('Asker (Akershus)');
  expect(body.context.from).toBe('school');
});

test('an empty message is refused before anything is posted', async ({ page }) => {
  await boot(page);
  let posted = false;
  await page.route('**/api/feedback', async r => { posted = true; await r.fulfill({ json: { ok: true } }); });
  await reportFromHelp(page);
  await page.click('#c-send');
  await expect(page.locator('#c-err')).toHaveText('Skriv en melding først.');
  expect(posted).toBe(false);
});
