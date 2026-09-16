import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DATA, MODEL } from './fixtures';
import { main, framePad, bootFailed, updateMapLabels, initBoot } from '../src/boot';
import { isSheetOpen } from '../src/intro';
import { showTip } from '../src/tips';
import { initHelpers } from '../src/helpers';
import { initChance } from '../src/chance';
import { initMap } from '../src/map';
import { initChrome } from '../src/chrome';
import { initSidebar } from '../src/sidebar';
import { initListview } from '../src/listview';
import { initIntro } from '../src/intro';
import { initTips } from '../src/tips';
import { t } from '../src/i18n';
import { S } from '../src/state';

/* The whole app, booted against the fixture files in place of the network.
   Everything below is the state a first frame leaves behind. */
const serve = (body: any) => ({ ok: true, headers: { get: () => 'Tue, 16 Sep 2026 20:00:00 GMT' }, json: async () => body });
const network = (schools: any = DATA, model: any = MODEL) => vi.fn(async (u: string) =>
  /model\.json$/.test(u) ? serve(model) : /schools\.json$/.test(u) ? serve(schools)
  : { ok: false, headers: { get: () => null }, json: async () => ({}) });

function initAll() {
  // the same order main.ts runs them in, minus the modules with no state to set
  initHelpers(); initChance(); initMap(); initChrome(); initSidebar();
  initListview(); initIntro(); initTips();
}

describe('boot', () => {
  beforeEach(() => {
    // main() leaves six deferred reframes behind (ensureFramed); setup.ts's fake
    // timers park them instead of letting them fire into the next test's document
    S.DATA = null; S.MODEL = null; S.markerLayer = null; S.tileLayer = null;
    S.current = null; S.myPoints = null; S.lang = 'no'; S.mapCat = 'all'; S.mapFylke = 'all';
    S.allLevels = false; S.showOld = false; S.choices = []; S.view = 'map'; S._newestByFylke = null;
    location.hash = '';
    history.replaceState(null, '', location.pathname);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  /* First, so that exactly one set of the listeners main() installs is live:
     every call adds another, and a second copy would answer these events too. */
  it('wires the page up: a pasted link, the search shortcut and the back gesture', async () => {
    vi.stubGlobal('fetch', network());
    initAll(); initBoot();
    await main();
    // the deferred reframes: with a 0×0 container in happy-dom each one gives up
    vi.advanceTimersByTime(5000);
    // a tab brought back to the front reframes the map; with the list on screen
    // that is deferred until the map is visible again (boot.ts's own branch)
    S.view = 'list'; S.refitPending = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(S.refitPending).toBe(true);
    S.view = 'map'; S.refitPending = false;

    // a link pasted into the open tab is a hashchange, and only ever that
    const elvebakken = DATA.schools.find((s: any) => /^Elvebakken/.test(s.name))!;
    location.hash = `#s=${elvebakken.fylke}/${encodeURIComponent(elvebakken.name)}`;
    window.dispatchEvent(new Event('hashchange'));
    expect(S.current.name).toBe(elvebakken.name);
    expect(document.getElementById('side')!.classList.contains('open')).toBe(true);

    // the back gesture closes what is on screen
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.getElementById('side')!.classList.contains('open')).toBe(false);
    S.sideClosing = true;                       // the ✕'s own back() landing
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(S.sideClosing).toBe(false);

    // "/" opens the search overlay; typing, arrowing and Enter open a school
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(isSheetOpen(document.getElementById('searchov'))).toBe(true);
    const q = document.getElementById('ov-q') as HTMLInputElement;
    q.value = 'asker';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(S.ovHits.length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#ov-list .opt').length).toBe(S.ovHits.length);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(S.ovAct).toBe(0);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(S.ovAct).toBe(-1);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(S.current.name).toBe('Asker');
    expect(isSheetOpen(document.getElementById('searchov'))).toBe(false);

    // a floating tooltip does not outlive the reader's attention
    showTip(document.getElementById('panel')!, 'hei');
    expect(document.getElementById('tip')!.hidden).toBe(false);
    document.getElementById('app')!.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(document.getElementById('tip')!.hidden).toBe(true);
    // a resize re-measures once the debounce has run out
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(document.documentElement.style.getPropertyValue('--panel-reserve')).toMatch(/px$/);
  });

  it('reads both datasets, builds the map and draws the first frame', async () => {
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(S.DATA.schools.length).toBe(DATA.schools.length);
    expect(S.MODEL).toBeTruthy();
    expect(S.DATA_STAMP).toContain('2026');
    expect(S.map).toBeTruthy();
    expect(S.HOME).toBeTruthy();
    expect(S.tileLayer).toBeTruthy();
    // the loading card is gone and the chrome is painted
    expect(document.querySelector('#map .boot-pending')).toBeNull();
    expect(document.getElementById('tagline')!.textContent).toContain(String(DATA.schools.length));
    expect(document.getElementById('legend-bins')!.children.length).toBeGreaterThan(0);
    expect(document.getElementById('map')!.classList.contains('leaflet-container')).toBe(true);
    expect(document.getElementById('map')!.getAttribute('aria-label')).toBe(t('viewMap'));
    expect(document.getElementById('side')!.hasAttribute('inert')).toBe(true);
  });

  it('a stored language, points, scope and view are in force on the first frame', async () => {
    localStorage.setItem('pk-lang', 'en');
    localStorage.setItem('pk-points', '45');
    localStorage.setItem('pk-alllevels', '1');
    localStorage.setItem('pk-view', 'list');
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(S.lang).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(S.myPoints).toBe(45);
    expect(S.allLevels).toBe(true);
    expect(S.view).toBe('list');
    expect(document.getElementById('listview')!.hidden).toBe(false);
    expect(document.querySelectorAll('#listview tbody tr').length).toBeGreaterThan(0);
    // with points and a forecast the legend turns into the three chance bands
    expect(document.getElementById('legend-bins')!.children.length).toBe(3);
  });

  it('a stored points value nobody can have is dropped rather than colouring the map', async () => {
    localStorage.setItem('pk-points', '999');
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(S.myPoints).toBeNull();
    expect(localStorage.getItem('pk-points')).toBeNull();
  });

  it('a deep link opens the school it names, with the county and lens it was taken under', async () => {
    location.hash = '#s=Akershus/Asker&f=Akershus&c=ST';
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(S.mapFylke).toBe('Akershus');
    expect(S.mapCat).toBe('ST');
    expect(S.current.name).toBe('Asker');
    expect(document.getElementById('side')!.classList.contains('open')).toBe(true);
    expect(document.querySelector('#s-photo .name')!.textContent).toContain('Asker');
  });

  it('a link to a school that does not exist says so instead of opening nothing', async () => {
    location.hash = '#s=Akershus/Finnes%20ikke';
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(S.current).toBeNull();
    expect(document.getElementById('toast')!.hidden).toBe(false);
  });

  it('a query-string link is adopted into the fragment once', async () => {
    history.replaceState(null, '', location.pathname + '?f=Oslo&c=ST');
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(location.hash).toContain('f=Oslo');
    expect(location.hash).toContain('c=ST');
    expect(S.mapFylke).toBe('Oslo');
    history.replaceState(null, '', location.pathname);
  });

  it('a dataset that cannot be fetched leaves an explanation and a way to retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, headers: { get: () => null }, json: async () => ({}) })));
    initAll();
    await main();
    expect(document.querySelector('#app .boot-fail .big')!.textContent).toBe(t('bootFail'));
    expect(document.querySelector('#app .boot-fail .cta')!.textContent).toBe(t('bootRetry'));
    expect(document.getElementById('legend')!.hasAttribute('hidden')).toBe(true);
  });

  it('the help hint is marked on a first visit only', async () => {
    vi.stubGlobal('fetch', network());
    initAll();
    await main();
    expect(document.getElementById('help-btn')!.classList.contains('hint')).toBe(true);
    expect(localStorage.getItem('pk-help-hint')).toBe('1');
  });

  it('bootFailed and framePad stand on their own', () => {
    S.DATA = DATA;
    // framePad measures #panel, and the failure screen below removes it: the
    // order here is the order the app itself can only take
    const pad: any = framePad();
    expect(pad.paddingTopLeft.length).toBe(2);
    expect(pad.paddingBottomRight.every((n: number) => n >= 12)).toBe(true);
    bootFailed('bootFailSub');
    expect(document.querySelector('#app .boot-fail')).toBeTruthy();
    expect(document.querySelector('#app .boot-fail p:last-of-type')!.textContent).toBe(t('bootFailSub'));
    S.map = null;
    expect(updateMapLabels()).toBeUndefined();     // nothing to label before the map exists
  });
});
