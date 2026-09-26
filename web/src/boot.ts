import { closeCalc, loadCalc } from "./calc";
import { parsePoints, renderChoices, renderPointsField } from "./chance";
import { liftMapControls, renderCatNote, renderLegend, renderPanel } from "./chrome";
import { closeContact } from "./feedback";
import { esc } from "./helpers";
import { t } from "./i18n";
import { anySheetOpen, closeIntro, hintHelp, INTRO_SEEN, openSheetHistory, renderIntro } from "./intro";
import { setView } from "./listview";
import { addLocateControl, toast, updateZoomAria } from "./locate";
import { boundsOf, createMap, drawMarkers, fitHome, fitVisible, foldPanel, hasWebGL, padBounds,
         resizeMap, setMapStyle, viewSchool } from "./map";
import { applyPrefs, closeSettings, loadPrefs, PREFS } from "./prefs";
import { runSearch } from "./search";
import { closeSearchOv, openSearchOv, pickOv, renderOvList, searchMode } from "./searchov";
import { adoptLegacyUrl, pathSegments, schoolFromUrl, syncUrl, unresolvedFromPath } from "./router";
import { applyUrlFilters, closeSide, openSide, renderSide, sideTrap } from "./sidebar";
import { S } from './state';
import { hideTip } from "./tips";

/* ================= boot ================= */
// The map's canvas is the region a screen reader lands in. MapLibre gives it
// role="region" and a tabindex of its own and names it from the map's `locale`
// at the first paint, so a language switch is this one attribute.
export function updateMapLabels() {
  if (!S.map) return;
  S.map.getCanvas().setAttribute('aria-label', t('viewMap'));
}
export function framePad(): { top: number; left: number; bottom: number; right: number } {
  // The panel and legend float over the map, so fit the country into what is
  // actually visible. Each pad is capped: on a phone held sideways the panel
  // is over half the width, and paying that in full squeezed Norway into the
  // right-hand third and dropped the zoom a whole step.
  const box = id => document.getElementById(id)!.getBoundingClientRect();
  const p = box('panel'), l = box('legend');
  const cap = (v, max) => Math.max(12, Math.min(Math.round(v), Math.round(max)));
  // On a short screen every pixel of height counts, and the legend sits
  // bottom-left while the country sits centre-right — let the map run under it
  // rather than shrink the whole of Norway to avoid a corner.
  const bottom = innerHeight <= 480 ? 12
    : cap(innerHeight - l.top + 12, innerHeight * 0.3);
  if (innerWidth <= 560) return { left: 12, top: cap(p.height + 22, innerHeight * 0.34), right: 12, bottom };
  return { left: cap(p.right + 12, innerWidth * 0.32), top: 12, right: 12, bottom };
}

// Without the dataset — or with one the map cannot be built from — every
// render is a no-op and the page settles into empty chrome over a grey
// rectangle with nothing to explain it. A build that shipped 195 schools and
// no coordinates did exactly that, in silence.
export function bootFailed(subKey) {
  try { window.va && window.va('event', { name: 'boot-failed', data: { msg: String(subKey).slice(0, 120) } }); } catch (_) {}
  // #panel lives inside #app now — the innerHTML below removes it, so nothing
  // here may assume it exists afterwards
  // #side is inside #app too: a school page that fails to boot loses the sheet
  // it was prerendered with, so the tab may not keep claiming that school
  document.title = t('pageTitle');
  document.getElementById('legend')?.setAttribute('hidden', '');
  document.getElementById('app')!.innerHTML =
    `<div class="boot-fail"><p class="big">${esc(t('bootFail'))}</p>
     <p>${esc(t(subKey))}</p>
     <button class="cta" onclick="location.reload()">${esc(t('bootRetry'))}</button></div>`;
}

export async function main() {
  loadPrefs();
  applyPrefs(false);
  loadCalc();
  try {
    const l = localStorage.getItem('pk-lang');
    if (l === 'no' || l === 'en') S.lang = l;   // anything else is not a language
  } catch (e) {}
  try { S.showOld = localStorage.getItem('pk-showold') === '1'; } catch (e) {}
  try { S.allLevels = localStorage.getItem('pk-alllevels') === '1'; } catch (e) {}
  // setLang() does this on every switch, but a fresh load never called it, so a
  // reader who had chosen English got an English page inside a document still
  // declaring itself Norwegian — wrong to a screen reader and to a translator.
  document.documentElement.lang = S.lang === 'no' ? 'no' : 'en';
  // A school's page arrives titled after the school, and the sheet it carries
  // stays open: overwriting that title here took the school out of the tab the
  // moment the script booted. The home title is this page's only when the
  // address names no school; a school path is titled by openSide below, and a
  // path no school answers to falls back after the data has been read.
  if (!pathSegments()) document.title = t('pageTitle');
  // both requests leave together (and were already preloaded from <head>);
  // the forecast is optional: without it the points field stays hidden and
  // the app is exactly what it was
  // a megabyte of data on a slow link is a blank card for many seconds:
  // say so, in the failure screen's own place
  document.getElementById('map')!.insertAdjacentHTML('beforeend',
    `<div class="boot-fail boot-pending" aria-live="polite"><p class="big">${esc(t('bootLoading'))}</p></div>`);
  // A connection that opens and then says nothing never rejects, and «Laster
  // kartet …» stood for as long as the tab did: no Retry for the dataset, and
  // a stalled forecast held up a map that needs none. Each request gets a
  // clock that covers the body as well; 110 kB takes 18 s on a 2G link.
  const timed = <T>(url: string, ms: number, read: (r: Response) => Promise<T>) => {
    const c = new AbortController(), timer = setTimeout(() => c.abort(), ms);
    return fetch(url, { signal: c.signal }).then(read).finally(() => clearTimeout(timer));
  };
  const modelReq = timed('/data/model.json', 20000, async r => r.ok ? await r.json() : null).catch(() => null);
  try {
    await timed('/data/schools.json', 45000, async r => {
      if (!r.ok) throw new Error(String(r.status));
      S.DATA = await r.json();
      try { S.DATA_STAMP = r.headers.get('last-modified') || ''; } catch (e) {}
    });
    performance.mark('pk:data');
  } catch (e) {
    return bootFailed('bootFailSub');
  }
  const model = await modelReq;
  if (model) S.MODEL = model;
  performance.mark('pk:model');
  try {
    // through the same validator as the field: a stored 999 used to colour the
    // whole map on a score nobody can have
    const sp = parsePoints(localStorage.getItem('pk-points'));
    if (S.MODEL && sp.pts !== null) {
      S.myPoints = sp.pts;
      (document.getElementById('my-points') as any).value = String(sp.pts).replace('.', S.lang === 'no' ? ',' : '.');
    } else if (sp.pts === null) {
      try { localStorage.removeItem('pk-points'); } catch (e) {}
    }
  } catch (e) {}
  // Open on the whole dataset. This used to open on a hard-coded Rogaland view
  // and correct itself inside a requestAnimationFrame — but rAF does not fire
  // while the tab is not being painted, so a national map could sit there
  // showing one county. Fit first, synchronously, and treat the deferred pass
  // purely as a correction for a pane that was still laying out.
  const pts = S.DATA!.schools.filter(s => s.lat).map(s => [s.lat, s.lon] as [number, number]);
  S.HOME = padBounds(boundsOf(pts), 0.06);
  document.querySelector('#map .boot-pending')?.remove();
  if (hasWebGL()) {
    // The probe says the browser can make a WebGL2 context; the map asks for
    // one of its own, and MapLibre throws (GPUInitializationError) from the
    // constructor when that one fails — a driver blocklist, a lost context, a
    // machine already at its handful of live contexts. Unguarded that rejected
    // main() and the reader got the boot-failure screen instead of the list the
    // spec gives a browser with no map (decision 1). The `!S.map` branch below
    // does the rest: list view, a disabled toggle and the notice.
    try {
      createMap();
      updateMapLabels();
      addLocateControl();
      updateZoomAria();
    } catch (e) {
      console.error('map:', e);
      S.map = null;
    }
  }
  let touched = false;
  if (S.map) {
    ['mousedown', 'wheel', 'touchstart'].forEach(ev => S.map!.getContainer()
      .addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));
    // the panel folds on every return to the map, not the first only: a reader
    // who unfolded it to change a select is done with it once they pan again
    ['mousedown', 'wheel', 'touchstart'].forEach(ev => S.map!.getContainer()
      .addEventListener(ev, () => foldPanel(true), { passive: true }));
  }
  // A map framed against a 0×0 container sticks at max zoom over empty terrain
  // with no markers, and nothing about the page looks broken enough to explain
  // it. A container is 0×0 at boot for many unrelated reasons — a background
  // tab, a hidden iframe later revealed, a webview attached after load, a
  // restored session, a prerender — and each announces itself differently, or
  // not at all. So do not wait to be told: keep checking, cheaply, until the
  // frame is honest, and give up once the reader has moved the map themselves.
  let framed = false;
  function ensureFramed() {
    if (framed || touched || !S.map) return true;
    if (S.view === 'list') { S.refitPending = true; return true; }   // reframed on the way back
    if (!S.map.getContainer().clientWidth) return false;             // still nothing to frame
    resizeMap();
    fitHome(false);
    framed = true;
    return true;
  }
  [0, 150, 400, 900, 2000, 4000].forEach(ms => setTimeout(ensureFramed, ms));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureFramed(); });
  // The engine re-measures on a window resize only. A container that changes
  // size on its own (the school sheet opening beside the map, the panel
  // docking) left the map drawing to its old width: a click landed on the
  // wrong school and the right edge stayed blank. The controls are measured
  // again here too: closing a phone's full-screen sheet measured them against
  // a 0px map, and the panel's cap stayed 59px short until the next points edit.
  if (S.map && window.ResizeObserver) new ResizeObserver(() => {
    if (S.map!.getContainer().clientWidth) {
      resizeMap();
      if (S.view === 'map') liftMapControls();
    }
    ensureFramed();
  }).observe(S.map.getContainer());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (PREFS.theme !== 'auto') return;    // a pinned theme does not follow the OS
    setMapStyle(); drawMarkers(); renderLegend(); renderCatNote(); renderPointsField();
    if (S.current) renderSide();
    // the guide draws its sample dots in the theme's colours
    if (!document.getElementById('intro')!.hidden) {
      const inside = document.getElementById('intro-body')!.contains(document.activeElement);
      renderIntro();
      if (inside) document.getElementById('intro-h')!.focus();
    }
  });
  document.getElementById('side')!.setAttribute('inert', '');
  const ovq: any = document.getElementById('ov-q');
  ovq.addEventListener('input', () => {
    S.ovAct = -1; S.ovHits = runSearch(ovq.value, searchMode()) || []; renderOvList();
  });
  ovq.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); S.ovAct = Math.min(S.ovAct + 1, S.ovHits.length - 1); renderOvList(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); S.ovAct = Math.max(S.ovAct - 1, -1); renderOvList(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); pickOv(S.ovAct >= 0 ? S.ovAct : 0); }
  });
  document.addEventListener('keydown', ev => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') || (ev.key === '/' && !typing)) {
      ev.preventDefault();
      if (!anySheetOpen()) openSearchOv();   // never stack two aria-modal sheets
    }
  });
  // A phone keyboard takes half the screen. The panel's height cap shrinks with
  // the viewport while the legend and map controls keep their reserve, so an
  // iPhone showed a 99px card with the points field being typed into below it,
  // out of sight. Whatever has focus in the panel is scrolled into its view.
  const panelEl = document.getElementById('panel');
  const keepPanelFocusInView = () => {
    const el = document.activeElement;
    if (el && el !== panelEl && panelEl!.contains(el)) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  panelEl!.addEventListener('focusin', () => requestAnimationFrame(keepPanelFocusInView));
  let reframe;
  addEventListener('resize', () => {
    clearTimeout(reframe);
    reframe = setTimeout(() => {
      resizeMap(); liftMapControls(); keepPanelFocusInView();
      sideTrap(document.body.classList.contains('side-open'));   // a rotation crosses the breakpoint
    }, 200);
  });
  document.addEventListener('touchstart', ev => {
    // a floating tooltip should not outlive the reader's attention
    if (!(ev.target as any).closest('[title], .ch, .lv, #tip')) hideTip();
  }, { passive: true });
  addEventListener('popstate', () => {
    // a back-gesture closes what is actually on screen: an open sheet first —
    // and re-pushes the side panel's entry the pop just consumed, so the next
    // back still closes the panel instead of leaving the page
    const sideOpen = document.getElementById('side')!.classList.contains('open');
    if (S.sideClosing) {
      // the ✕'s own back() landing: close, never treat it as a gesture on a
      // sheet — and keep the filters the reader set while it was open. The
      // entry underneath is the pre-open one; re-reading its filters undid a
      // Vg2+ or county change made from the sheet. closeSide writes the
      // current filters into that entry instead.
      S.sideClosing = false;
      if (sideOpen) closeSide(true); else syncUrl();
      if (S.sheetPushPending) { S.sheetPushPending = false; openSheetHistory(); }
      return;
    }
    if (anySheetOpen()) {
      // same priority order as the Escape handler, so the two agree
      if (!document.getElementById('contact')!.hidden) closeContact(true);
      else if (!document.getElementById('intro')!.hidden) closeIntro(true);
      else if (!document.getElementById('settings')!.hidden) closeSettings(true);
      else if (!document.getElementById('calc')!.hidden) closeCalc(true);
      else closeSearchOv(true);
      // the entry landed on is the pre-open one: a scope changed in the
      // settings sheet (the Trinn choice) is written into it, not re-read
      // from it
      syncUrl();
      if (sideOpen && !(history.state || {}).pkSide) {
        try { history.pushState({ pkSide: 1 }, ''); } catch (e) {}
      }
      return;
    }
    // An entry naming a different school is forward navigation, not a
    // back-gesture: the address bar never gets to claim a school the sheet
    // is not showing.
    const target = schoolFromUrl();
    // the entry may differ only in its filters — stepping back over a county
    // change has no school to open or close, but still has to move the controls
    const filtersMoved = applyUrlFilters();
    if (target && target !== S.current) { openSide(target); return; }
    if (!target && sideOpen) { closeSide(true); return; }
    if (filtersMoved) return;
    if (sideOpen) { closeSide(true); return; }
    // forward-navigation onto a school entry reopens it, so the address bar
    // never claims a school that is not showing
    if (target) openSide(target);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (!document.getElementById('contact')!.hidden) { closeContact(); return; }
    if (!document.getElementById('intro')!.hidden) { closeIntro(); return; }
    if (!document.getElementById('settings')!.hidden) { closeSettings(); return; }
    if (!document.getElementById('calc')!.hidden) { closeCalc(); return; }
    if (!document.getElementById('searchov')!.hidden) { closeSearchOv(); return; }
    if (document.getElementById('side')!.classList.contains('open')) closeSide();
  });
  renderPanel(); renderLegend(); renderCatNote(); drawMarkers(); renderChoices();
  // a shared link carries the selection it was taken under, so read the filters
  // before the first frame rather than snapping the reader back to Hele landet
  // A link from before stage 3 carries the school in the fragment (#s=) or, in
  // the mailed county links, in the query (?s=). Both become the path form
  // here, in place, so the filters and the school are read from one shape.
  const unresolved = adoptLegacyUrl();
  const framedByUrl = applyUrlFilters(true);
  let storedView = 'map';
  try { if (localStorage.getItem('pk-view') === 'list') storedView = 'list'; } catch (e) {}
  if (!S.map) {
    // no WebGL2: the list is the only view; say so once and keep the toggle honest
    storedView = 'list';
    document.body.classList.add('no-map');
    const b = document.getElementById('view-map') as HTMLButtonElement;
    b.disabled = true; b.title = t('noMapWebGL'); b.setAttribute('aria-description', t('noMapWebGL'));
    toast(t('noMapWebGL'), 8000);
  }
  setView(storedView);
  if (framedByUrl && S.view === 'map' && S.map && fitVisible(false)) touched = true;
  const linked = schoolFromUrl();
  if (!linked && unresolved) toast(t('linkNotFound', unresolved));
  else if (!linked && document.body.dataset.notfound) toast(t('linkNotFound', unresolvedFromPath()));
  if (linked) {
    if (linked.lat && S.map) {
      touched = true;                  // the deferred HOME refit must not undo this
      viewSchool(linked, 10, false);
    }
    openSide(linked, true);              // the page the reader arrived on, not one they opened
  }
  // an address no school answers to keeps the 404 page's prerendered title,
  // which is the home one — but in Norwegian, whatever the reader chose
  if (!S.current) document.title = t('pageTitle');
  performance.mark('pk:boot-done');
  let seen = true;
  try { seen = !!localStorage.getItem(INTRO_SEEN); } catch (e) {}
  // Not a modal on arrival. A reader who lands on a map they have not looked at
  // yet treats a full-screen panel as an obstacle, and closes it unread — which
  // is exactly what the first person to try this did. Mark the door instead and
  // let them reach it when the map has raised a question worth answering.
  if (!seen) hintHelp();
}
export const boot = () => main().catch(e => { console.error(e); bootFailed('bootFailApp'); });

export function initBoot() {
  // a broken deploy should show up in the analytics before a parent writes in
  window.addEventListener('error', e => { try { window.va && window.va('event', { name: 'js-error', data: { msg: String(e.message).slice(0, 120) } }); } catch (_) {} });
}
