import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadFixtures } from './fixtures';
import { stubMap } from './mapstub';
import { toast, placeToast, locHelpKind, addLocateControl, locate, updateLocateAria, updateZoomAria } from '../src/locate';
import { renderLegend } from '../src/chrome';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { t } from '../src/i18n';
import { S } from '../src/state';

const ua = (s: string) => {
  Object.defineProperty(navigator, 'userAgent', { value: s, configurable: true });
};
const geolocation = (impl: any) => {
  Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true });
};
// both live on Navigator.prototype in happy-dom; the two helpers above shadow
// them with own properties, so put the navigator back as it was handed over
const ownBefore: Record<string, PropertyDescriptor | undefined> = {
  userAgent: Object.getOwnPropertyDescriptor(navigator, 'userAgent'),
  geolocation: Object.getOwnPropertyDescriptor(navigator, 'geolocation'),
};

describe('the toast and the locate button', () => {
  beforeEach(() => { S.loc = null; S.locBtnEl = null; S.locBusy = false; });
  afterEach(() => {
    for (const [k, d] of Object.entries(ownBefore)) {
      delete (navigator as any)[k];
      if (d) Object.defineProperty(navigator, k, d);
    }
  });

  it('a toast reveals itself first and speaks a tick later, then goes', () => {
    loadFixtures(); initHelpers();
    const el = document.getElementById('toast')!;
    toast('Hei', 4000);
    // the text is set inside a live region only once it is visible, or it is
    // never announced
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('');
    vi.advanceTimersByTime(30);
    expect(el.textContent).toBe('Hei');
    vi.advanceTimersByTime(4000);
    expect(el.hidden).toBe(true);
    // a tap puts it away early
    toast('Hei igjen');
    vi.advanceTimersByTime(30);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.hidden).toBe(true);
  });

  it('a second toast queues behind one already showing, and a duplicate is not queued twice', () => {
    loadFixtures(); initHelpers();
    const el = document.getElementById('toast')!;
    toast('Første', 1000);
    toast('Andre', 500);
    toast('Andre', 500);        // a duplicate of the one already waiting is not queued again
    vi.advanceTimersByTime(30);
    expect(el.textContent).toBe('Første');
    vi.advanceTimersByTime(969);              // 999ms: just short of the first's own duration
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Første');
    vi.advanceTimersByTime(1);                // 1000ms: the first hides, the second takes over
    expect(el.hidden).toBe(false);
    vi.advanceTimersByTime(30);
    expect(el.textContent).toBe('Andre');
    vi.advanceTimersByTime(500);              // the de-duplicated second's own duration
    expect(el.hidden).toBe(true);             // nothing else queued behind it
  });

  it('placeToast keeps the notice out of the legend’s way and does nothing when hidden', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    renderLegend();
    const el = document.getElementById('toast')!;
    el.hidden = true;
    el.style.left = '5px';
    placeToast();
    expect(el.style.left).toBe('');            // cleared, then left alone
    el.hidden = false;
    el.textContent = 'Tillat posisjon i nettleseren';
    placeToast();
    // in happy-dom every rect is 0×0, so the CSS spot is already clear
    expect(el.style.bottom).toBe('');
  });

  it('names the setting this browser keeps location under', () => {
    loadFixtures();
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1');
    expect(locHelpKind()).toEqual(['iosSafari']);
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile Safari/604.1');
    expect(locHelpKind()).toEqual(['iosApp', 'Chrome']);
    ua('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36');
    expect(locHelpKind()).toEqual(['android']);
    ua('Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0');
    expect(locHelpKind()).toEqual(['other']);
    ua('Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/120.0');
    expect(locHelpKind()).toEqual(['firefox']);
    ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
    expect(locHelpKind()).toEqual(['chromium']);
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15');
    expect(locHelpKind()).toEqual(['safariMac']);
    ua('Some crawler/1.0');
    expect(locHelpKind()).toEqual(['other']);
  });

  it('a fix drops a marker, names the button, and a second press clears it', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    geolocation({
      getCurrentPosition: (ok: any) => ok({ coords: { latitude: 59.9, longitude: 10.75, accuracy: 25 } }),
    });
    addLocateControl();
    expect(S.locBtnEl).toBeTruthy();
    expect(S.locBtnEl!.getAttribute('aria-label')).toBe(t('locBtn'));
    expect(S.locBtnEl!.getAttribute('aria-pressed')).toBe('false');
    S.locBtnEl!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(S.loc).toEqual({ lat: 59.9, lon: 10.75, acc: 25 });
    expect(document.querySelector('#map .pk-loc')).toBeTruthy();
    expect(S.locBtnEl!.classList.contains('on')).toBe(true);
    expect(S.locBtnEl!.getAttribute('aria-pressed')).toBe('true');
    locate();                                   // the second press clears it again
    expect(S.loc).toBeNull();
    expect(document.querySelector('#map .pk-loc')).toBeNull();
    expect(S.locBtnEl!.classList.contains('on')).toBe(false);
  });

  it('a refused fix says how to allow it, and any other failure says it failed', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
    geolocation({ getCurrentPosition: (_ok: any, bad: any) => bad({ code: 1 }) });
    addLocateControl();
    locate();
    vi.advanceTimersByTime(30);
    expect(document.getElementById('toast')!.textContent).toContain(t('locDenied'));
    expect(S.locBusy).toBe(false);
    geolocation({ getCurrentPosition: (_ok: any, bad: any) => bad({ code: 2 }) });
    locate();
    // the denied notice is still showing (12s): the failure notice queues
    // behind it rather than cutting it off early (toast()'s own queue, locate.ts)
    vi.advanceTimersByTime(30);
    expect(document.getElementById('toast')!.textContent).toContain(t('locDenied'));
    vi.advanceTimersByTime(12000 - 30);
    vi.advanceTimersByTime(30);
    expect(document.getElementById('toast')!.textContent).toBe(t('locFail'));
  });

  it('one fix at a time, and nothing to name before the button exists', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    geolocation({ getCurrentPosition: () => {} });       // never answers
    addLocateControl();
    locate();
    expect(S.locBusy).toBe(true);
    locate();                                            // refused while one is in flight
    expect(S.loc).toBeNull();
    S.locBusy = false;
    S.locBtnEl = null;
    expect(updateLocateAria()).toBeUndefined();          // a no-op, not a crash
  });

  it('the map’s own zoom buttons are titled in the app’s language', () => {
    loadFixtures(); initHelpers();
    const bar = document.createElement('div');
    bar.innerHTML = '<button class="pk-zoom-in"></button><button class="pk-zoom-out"></button>';
    document.getElementById('map')!.appendChild(bar);
    updateZoomAria();
    expect(document.querySelector('.pk-zoom-in')!.getAttribute('aria-label')).toBe(t('zoomIn'));
    expect((document.querySelector('.pk-zoom-out') as any).title).toBe(t('zoomOut'));
  });
});
