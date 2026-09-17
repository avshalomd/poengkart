import type { IControl } from 'maplibre-gl';
import { t } from "./i18n";
import { hideLocation, mapZoom, prefersStill, showLocation } from "./map";
import { S } from './state';

/* ================= geolocation ================= */
// the position is used for one map move and a marker; it never leaves the page
// ms: how long it stays. Steps to follow need longer than a one-line notice,
// and a tap puts any toast away early.
export function toast(msg, ms = 4000) {
  const el: any = document.getElementById('toast');
  if (!el._tap) {
    el._tap = true;
    el.addEventListener('click', () => { clearTimeout((toast as any)._t); el.hidden = true; });
  }
  // reveal first: text set inside a hidden live region is not announced
  el.textContent = ''; el.hidden = false;
  setTimeout(() => { el.textContent = msg; placeToast(); }, 30);
  clearTimeout((toast as any)._t);
  (toast as any)._t = setTimeout(() => { el.hidden = true; }, ms);
}
// The CSS spot (centred at the foot of the map, or beside the controls on a
// phone) is kept while it is clear. It was not whenever the legend stands
// bottom-left: the steps for allowing location covered the legend's right end at
// every width from 561 to 1100px and in landscape. Next it tries the strip
// between the legend and the map buttons, then just above the legend. Lengths
// are divided by the toast's text-size zoom, which multiplies them when painted.
export function placeToast() {
  const el = document.getElementById('toast'), s = el!.style;
  s.left = s.right = s.bottom = s.width = s.margin = s.transform = '';
  if (el!.hidden) return;
  // a school sheet standing beside the map or list is not free space: centred
  // on the window, the location steps lay half over the school's chart
  const sd = document.getElementById('side')!.getBoundingClientRect();
  const beside = document.body.classList.contains('side-open') && sd.width > 0 && sd.left > 0;
  const lg = document.getElementById('legend')?.getBoundingClientRect();
  if (!beside && !lg?.height) return;
  const bars = [...document.querySelectorAll('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-group')].map(b => b.getBoundingClientRect());
  const avoid = [lg, document.getElementById('panel')!.getBoundingClientRect(), ...bars, ...(beside ? [sd] : [])]
    .filter(a => a && a.height);
  const clear = () => {
    const r = el!.getBoundingClientRect();
    return !avoid.some(a => r.right > a!.left && r.left < a!.right && r.bottom > a!.top && r.top < a!.bottom);
  };
  if (clear()) return;
  const z = parseFloat(getComputedStyle(el!).zoom) || 1, px = v => Math.round(v / z) + 'px';
  if (beside) {
    Object.assign(s, { left: px(10), right: px(innerWidth - sd.left + 10), width: 'fit-content', margin: '0 auto', transform: 'none' });
    if (clear() || !lg?.height) return;
    s.bottom = px(innerHeight - lg.top + 10);
    if (!clear()) s.bottom = '';
    return;
  }
  const barsLeft = Math.min(innerWidth, ...bars.map(b => b.left));
  if (barsLeft - lg!.right - 20 >= 280) {
    Object.assign(s, { left: px(lg!.right + 10), right: px(innerWidth - barsLeft + 10),
                       bottom: px(innerHeight - lg!.bottom), width: 'fit-content', margin: '0 auto', transform: 'none' });
    if (clear()) return;
    s.left = s.right = s.width = s.margin = s.transform = '';
  }
  s.bottom = px(innerHeight - lg!.top + 10);
  if (!clear()) s.bottom = '';
}
// Where this browser keeps the switch for location, so a blocked request can
// say how to allow it. On iPhone every browser is WebKit inside an app, and the
// switch is under the app in the Settings app; Safari also has a per-website
// setting. The paths are the ones Apple's and Google's own help pages give.
export function locHelpKind() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    const app = { CriOS: 'Chrome', FxiOS: 'Firefox', EdgiOS: 'Edge' }[(ua.match(/CriOS|FxiOS|EdgiOS/) || [])[0] as string];
    return app ? ['iosApp', app] : ['iosSafari'];
  }
  if (/Android/.test(ua)) return /Firefox\//.test(ua) ? ['other'] : ['android'];
  if (/Firefox\//.test(ua)) return ['firefox'];
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return ['chromium'];
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return ['safariMac'];
  return ['other'];
}
export function addLocateControl() {
  if (!('geolocation' in navigator) || !S.map) return;
  const ctrl: IControl = {
    onAdd() {
      const div = document.createElement('div');
      div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'locate';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
        ' stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>' +
        '<path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>';
      S.locBtnEl = b;
      b.addEventListener('click', ev => { ev.stopPropagation(); locate(); });
      div.appendChild(b);
      return div;
    },
    onRemove() {},
  };
  S.map.addControl(ctrl, 'bottom-right');
  updateLocateAria();
}
// the map's own zoom buttons carry no name of their own; keep them in the app's language
export function updateZoomAria() {
  [['.pk-zoom-in', 'zoomIn'], ['.pk-zoom-out', 'zoomOut']].forEach(([sel, key]) => {
    document.querySelectorAll(sel).forEach((b: any) => { b.title = t(key); b.setAttribute('aria-label', t(key)); });
  });
}
export function updateLocateAria() {
  if (!S.locBtnEl) return;
  S.locBtnEl.title = t('locBtn');
  S.locBtnEl.setAttribute('aria-label', t('locBtn'));
  S.locBtnEl.setAttribute('aria-pressed', String(!!S.loc));
}
export function locate() {
  if (S.locBusy) return;                  // one fix in flight at a time
  if (S.loc) {                            // second press clears the marker again
    hideLocation();
    S.locBtnEl!.classList.remove('on');
    updateLocateAria();
    return;
  }
  S.locBusy = true;
  navigator.geolocation.getCurrentPosition(pos => {
    S.locBusy = false;
    showLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy || 0);
    S.locBtnEl!.classList.add('on');
    updateLocateAria();
    const to = { center: [pos.coords.longitude, pos.coords.latitude] as [number, number], zoom: Math.max(mapZoom(), 9) };
    prefersStill() ? S.map!.jumpTo(to) : S.map!.flyTo(to);
  }, err => {
    S.locBusy = false;
    if (err && err.code === 1) toast(t('locDenied') + ' ' + t('locHow', ...locHelpKind()), 12000);
    else toast(t('locFail'));
  }, { timeout: 10000, maximumAge: 60000 });
}

export function initLocate() {
}
