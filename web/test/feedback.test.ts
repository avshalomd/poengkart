import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixtures, asker } from './fixtures';
import { stubMap } from './mapstub';
import {
  FIELDS, CTX_LABELS, bugContext, renderContact, renderContactFields, renderContactCtx,
  renderContactDone, openBug, openContact, closeContact, sendContact, switchToContact, text1,
} from '../src/feedback';
import { openSide } from '../src/sidebar';
import { setView } from '../src/listview';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { isSheetOpen } from '../src/intro';
import { t } from '../src/i18n';
import { S } from '../src/state';

// the relay's own list of snapshot keys, read from the function that receives
// them: the two must not drift apart
const here = path.dirname(fileURLToPath(import.meta.url));
const relay = readFileSync(path.join(here, '../../api/feedback.js'), 'utf8');
const CTX_KEYS = (relay.match(/const CTX = \[([\s\S]*?)\];/)![1].match(/\['(\w+)'/g) || [])
  .map(m => m.slice(2, -1));

const submit = () => sendContact({ preventDefault() {} } as any);

describe('the relay', () => {
  it('takes mail from this site and its own deployments, not from any poengkart-<x>.vercel.app', () => {
    const SELF = new RegExp(relay.match(/const SELF = \/(.+)\/;/)![1]);
    for (const ok of ['https://poengkart-no.vercel.app', 'https://poengkart-ad-6b15.vercel.app',
      'https://poengkart-k3j2h1g-ad-6b15.vercel.app', 'https://poengkart-git-side-branch-ad-6b15.vercel.app']) {
      expect(SELF.test(ok), ok).toBe(true);
    }
    for (const bad of ['https://poengkart-evil.vercel.app', 'https://poengkart.vercel.app',
      'https://poengkart-no.vercel.app.evil.com', 'http://poengkart-no.vercel.app']) {
      expect(SELF.test(bad), bad).toBe(false);
    }
  });
});

describe('the feedback form', () => {
  beforeEach(() => { S.bugCtx = null; S.contactOpener = null; S.current = null; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the bug snapshot carries exactly the keys the relay prints', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    // a lower bound, not a pin: the regex above is what is being guarded here,
    // and the relay is free to send more
    expect(CTX_KEYS.length).toBeGreaterThan(10);
    const ctx = bugContext(null, 'header');
    // school, chart and hero are the three the relay prints only when a school
    // was open; rows is a list and rides outside CTX (CTX_ROWS in the relay)
    expect(Object.keys(ctx)).toEqual(CTX_KEYS.filter(k => !['school', 'chart', 'hero'].includes(k)));
    expect(ctx.view).toBe('map');
    expect(ctx.fylke).toBe('all');
    expect(ctx.program).toBe('all');
    expect(ctx.points).toBe('');
    expect(ctx.levels).toBe('Vg1');
    expect(ctx.data).toContain(`${S.DATA!.schools.length} skoler`);
    // every key it sends has a Norwegian label for the e-mail
    expect(Object.keys(ctx).every(k => CTX_LABELS[k])).toBe(true);
  });

  it('with a school open the snapshot names it and repeats the figures on screen', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    openSide(asker());
    const ctx = bugContext(null, 'school');
    expect(Object.keys(ctx)).toEqual([...CTX_KEYS, 'rows']);
    expect(ctx.school).toBe(`${asker().name} (${asker().fylke})`);
    expect(ctx.chart).toBe('all');
    expect(ctx.hero).toBe([...document.querySelectorAll('#s-hero .cell')]
      .map(c => `${text1(c.querySelector('.v'))} ${text1(c.querySelector('.l'))}`).join(' · '));
    expect(ctx.rows.length).toBe(document.querySelectorAll('#s-list .prow').length);
    expect(ctx.rows[0]).toContain(document.querySelector('#s-list .prow .nm')!.textContent!.trim());
  });

  it('the snapshot names the view the reader is in', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    expect(bugContext(null, 'header').view).toMatch(/^list \((wide|split|thin)\)$/);
    setView('map');
    expect(bugContext(null, 'header').view).toBe('map');
  });

  it('each kind of report asks only for the fields it needs', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    renderContact();
    const kind = document.getElementById('c-kind') as HTMLSelectElement;
    expect([...kind.options].map(o => o.value)).toEqual(Object.keys(FIELDS));
    for (const [k, fields] of Object.entries(FIELDS)) {
      kind.value = k;
      renderContactFields();
      expect([...document.querySelectorAll('#c-extra input')].map((i: any) => i.dataset.f)).toEqual(fields);
    }
    // "feil" takes its own snapshot and lists it under «Dette sendes med»
    kind.value = 'feil'; renderContactFields();
    expect(S.bugCtx).toBeTruthy();
    expect(document.querySelector('#c-extra details.ctx summary')!.textContent).toBe(t('contactCtx'));
    expect(document.querySelectorAll('#c-extra details.ctx li').length).toBe(
      Object.entries(S.bugCtx!).filter(([, v]: any) => v !== '' && !(Array.isArray(v) && !v.length)).length);
  });

  it('a report about a figure starts on the school that is open', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    openSide(asker());
    openContact('tall');
    expect((document.getElementById('c-kind') as HTMLSelectElement).value).toBe('tall');
    expect((document.getElementById('c-school') as HTMLInputElement).value).toBe('Asker');
    // a hand-typed name survives a change of kind
    (document.getElementById('c-school') as HTMLInputElement).value = 'Annen skole';
    (document.getElementById('c-kind') as HTMLSelectElement).value = 'bilde';
    renderContactFields();
    expect((document.getElementById('c-school') as HTMLInputElement).value).toBe('Annen skole');
    expect(document.getElementById('c-photo')).toBeTruthy();
    closeContact(true);
    expect(isSheetOpen(document.getElementById('contact'))).toBe(false);
  });

  it('the bug button takes the snapshot at the moment it is pressed', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const btn = document.getElementById('bug-btn');
    openBug(null, btn);
    expect(S.bugCtx!.from).toBe('header');
    expect(S.contactOpener).toBe(btn);
    expect((document.getElementById('c-kind') as HTMLSelectElement).value).toBe('feil');
    expect(renderContactCtx()).toContain(CTX_LABELS.view[S.lang]);
    closeContact(true);
    expect(S.bugCtx).toBeNull();
  });

  it('refuses an empty message, a missing school and a mistyped address before it sends', async () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    openContact('tall');
    const err = document.getElementById('c-err')!;
    await submit();
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe(t('contactNeedMsg'));
    (document.getElementById('c-msg') as HTMLTextAreaElement).value = 'Tallet stemmer ikke';
    (document.getElementById('c-school') as HTMLInputElement).value = '';
    await submit();
    expect(err.textContent).toBe(t('contactNeedSchool'));
    (document.getElementById('c-school') as HTMLInputElement).value = 'Asker';
    (document.getElementById('c-email') as HTMLInputElement).value = 'ikke-en-adresse';
    await submit();
    expect(err.textContent).toBe(t('contactBadMail'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a complete report is posted to the relay and confirmed in place', async () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    openBug(null, null);
    (document.getElementById('c-msg') as HTMLTextAreaElement).value = 'Kartet henger seg opp';
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe('/api/feedback');
    const payload = JSON.parse(init.body);
    expect(payload.type).toBe('feil');
    expect(payload.message).toBe('Kartet henger seg opp');
    expect(payload.lang).toBe('no');
    expect(payload.context.from).toBe('header');
    expect(document.querySelector('#contact-body .done .big')!.textContent).toBe(t('contactSent'));
    // and the confirmation survives a language switch
    renderContact();
    expect(document.querySelector('#contact-body .done')).toBeTruthy();
  });

  it('a relay that cannot deliver keeps the message in the form', async () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })));
    openContact('annet');
    (document.getElementById('c-msg') as HTMLTextAreaElement).value = 'Hei og hå';
    await submit();
    const err = document.getElementById('c-err')!;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe(t('contactFail'));
    expect((document.getElementById('c-msg') as HTMLTextAreaElement).value).toBe('Hei og hå');
    expect((document.getElementById('c-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('the help sheet hands over to the feedback sheet without a second backdrop', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    document.getElementById('intro')!.hidden = false;
    switchToContact();
    expect(document.getElementById('intro')!.hidden).toBe(true);
    expect(isSheetOpen(document.getElementById('contact'))).toBe(true);
    renderContactDone();
    expect(document.querySelector('#contact-body .done')).toBeTruthy();
    closeContact(true);
  });
});
