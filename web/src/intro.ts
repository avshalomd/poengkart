import { cssVar, esc, REPO_LINK } from "./helpers";
import { t } from "./i18n";
import { updateLocateAria } from "./locate";
import { S } from './state';

/* ================= intro / help =================
   Poenggrenser are a genuinely confusing unit: the number is a grade average
   times ten, and it describes the *last* person admitted rather than a
   requirement. A 15-year-old landing here cold should not have to infer that —
   but pushing the explanation at them before they have looked at anything only
   taught them to dismiss it. It lives behind the ? button, which marks itself
   on a first visit, and the button's own label is the sentence it opens. */
export const INTRO_SEEN = 'pk-intro-v1';
// How many first-visits have pointed at the help button without anyone taking
// it up. A hint that never gives up stops being a hint.
export const HINT_KEY = 'pk-help-hint';
export const HINT_TRIES = 3;
export function hintHelp() {
  let n = 0;
  try { n = +(localStorage.getItem(HINT_KEY) || 0) || 0; } catch (e) {}
  if (n >= HINT_TRIES) return;
  try { localStorage.setItem(HINT_KEY, String(n + 1)); } catch (e) {}
  document.getElementById('help-btn')?.classList.add('hint');
}
// Opening it at all — however they got there — is the whole point, so retire
// the hint for good rather than counting that visit against them.
export function clearHelpHint() {
  document.getElementById('help-btn')?.classList.remove('hint');
  try { localStorage.setItem(HINT_KEY, String(HINT_TRIES)); } catch (e) {}
}

export function renderControls() {
  updateLocateAria();
  for (const [id, key] of [['bug-btn', 'bugLabel'], ['help-btn', 'helpLabel'],
                           ['settings-btn', 'settingsLabel'], ['searchov-btn', 'searchLabel']]) {
    const el = document.getElementById(id);
    el!.title = t(key);
    el!.setAttribute('aria-label', t(key));
  }
  // the switch names the other language, in that language
  const lb = document.getElementById('lang-btn');
  if (lb) {
    lb.textContent = S.lang === 'no' ? 'EN' : 'NO';
    lb.title = t('langSwitch');
    lb.setAttribute('aria-label', t('langSwitch'));
    lb.setAttribute('lang', S.lang === 'no' ? 'en' : 'no');
  }
  // these two were written into the markup in English and so stayed English
  document.getElementById('side')!.setAttribute('aria-label', t('sideLabel'));
}

export function renderIntro() {
  document.getElementById('intro-h')!.textContent = t('introTitle');
  const [avg, pts] = t('introCalc');
  const keys = t('introKeys');
  const dot = (r, fill, extra = '') =>
    `<svg class="swatch" width="${r * 2 + 4}" height="${r * 2 + 4}" viewBox="0 0 ${r * 2 + 4} ${r * 2 + 4}">` +
    `<circle cx="${r + 2}" cy="${r + 2}" r="${r}" fill="${fill}" ${extra}/></svg>`;
  const steps = t('introSteps').map(([h, b], i) => `
    <div class="step">
      <div class="n">${i + 1}</div>
      <div>
        <h3>${esc(h)}</h3>
        <p>${esc(b)}</p>
        ${i === 0 ? `<div class="calc"><b>${esc(avg)}</b><span>=</span><b>${esc(pts)}</b></div>` : ''}
        ${i === 1 ? `<div class="keyrow">
          <span class="key">${dot(6, cssVar('--seq-250'))}${esc(keys[0])}</span>
          <span class="key">${dot(6, cssVar('--seq-700'))}${esc(keys[1])}</span>
          <span class="key">${dot(6, 'none', `stroke="${cssVar('--accent')}" stroke-width="1.6" stroke-dasharray="3 2"`)}${esc(keys[2])}</span>
          <span class="key">${dot(6, cssVar('--accent'), `fill-opacity="0.35" stroke="${cssVar('--accent')}" stroke-width="1.6"`)}${esc(t('noPointsShort').toLocaleLowerCase())}</span>
          <span class="key">${dot(6, cssVar('--context'))}${esc(keys[3])}</span>
        </div>` : ''}
      </div>
    </div>`).join('');
  document.getElementById('intro-body')!.innerHTML =
    `<p class="lede">${esc(t('introLede'))} ${esc(t('introScope', S.DATA!.schools.length, S.DATA!.counties.length,
      S.DATA!.years[0], S.DATA!.years[S.DATA!.years.length - 1]))}</p>${steps}` +
    // the terms the sheets use without stopping to define them, and the one
    // thing a parent asks next: what do we actually do
    `<h3 class="words-h">${esc(t('introWordsH'))}</h3><dl class="words">` +
      t('introWords').map(([w, d]) => `<dt>${esc(w)}</dt><dd>${esc(d)}</dd>`).join('') + `</dl>` +
    `<h3 class="words-h">${esc(t('introApplyH'))}</h3><p class="apply">${esc(t('introApply'))}</p>` +
    `<p class="caveat">${esc(t('introCaveat'))} `
      + `<a href="/data/schools.json">${esc(t('introData'))}</a></p>` +
    `<p class="caveat">${esc(t('introPrivacy'))}</p>` +
    `<p class="colophon">${t('introRepo', REPO_LINK)} ` +
      `${t('introReport', `<a href="/report">${esc(t('introReportLink'))}</a>`)}` +
      `<span class="who">${esc(t('introCredit'))}</span></p>` +
    `<button class="cta" onclick="closeIntro()">${esc(t('introCta'))}</button>` +
    `<button class="cta ghost" onclick="switchToContact()">${esc(t('contactLabel'))}</button>`;
  document.getElementById('intro-x')!.setAttribute('aria-label', t('close'));
}

// A sheet that covers the page has to take the page out of the tab order with
// it: tabbing off the end of the feedback form used to land on the county
// select behind the backdrop, where nothing was visible to act on.
export const SHEET_IDS = ['contact', 'intro', 'settings', 'calc', 'searchov'];
/* A sheet on its way out is still on screen but is no longer the thing you
   are talking to: it takes no clicks (CSS), holds no focus and traps no Tab.
   Everything below therefore asks "open" rather than "visible". */
export const isSheetOpen = el => el && !el.hidden && !el.classList.contains('closing');
export const anySheetOpen = () => SHEET_IDS.some(id => isSheetOpen(document.getElementById(id)));

/* Hiding a sheet waits for the exit animation; nothing else does. Focus, the
   inert trap and the history entry are handled by the caller and stay
   immediate — a keyboard user must never wait 160ms to get their focus back.
   Reopening during the exit cancels it, because a sheet you ask for again has
   to come back rather than finish leaving. */
export const SHEET_EXIT_MS = 160;
export function hideSheet(id) {
  const el: any = document.getElementById(id);
  if (!el || el.hidden) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.hidden = true; return; }
  el.classList.add('closing');
  clearTimeout(el._exit);
  el._exit = setTimeout(() => {
    el._exit = null; el.classList.remove('closing'); el.hidden = true;
  }, SHEET_EXIT_MS);
}
export function showSheet(id) {
  const el: any = document.getElementById(id);
  if (!el) return;
  clearTimeout(el._exit); el._exit = null;   // caught mid-exit: it comes back
  el.classList.remove('closing');
  el.hidden = false;
}
// inert keeps focus inside an open sheet, but past its last control the browser
// parks focus on <body> for one press before coming back; wrap it instead
export const SHEETS = ['searchov', 'settings', 'intro', 'calc', 'contact'];
export function setModalTrap() {
  const open = anySheetOpen();
  ['app', 'legend'].forEach(id => document.getElementById(id)?.toggleAttribute('inert', open));
}

export function openSheetHistory() {
  // a phone's system back must close the sheet, not leave the site — the
  // side panel already pushes its own entry; the sheets do the same.
  // While closeSide()'s history.back() has not landed, pushing now would put
  // the sheet's entry on top of the school's and the pop would then land on
  // the school again and reopen it behind the sheet; push once it has landed.
  if (S.sideClosing) { S.sheetPushPending = true; return; }
  if (!(history.state || {}).pkSheet) {
    try { history.pushState({ ...(history.state || {}), pkSheet: 1 }, ''); } catch (e) {}
  }
}
export function openIntro() {
  clearHelpHint();
  renderIntro();
  showSheet('intro');
  setModalTrap();
  openSheetHistory();
  // the heading, not the call to action: that sits at the foot of a sheet taller
  // than a 700px window, where a keyboard reader got an invisible focus and an
  // Enter that closed the sheet they had just opened
  setTimeout(() => document.getElementById('intro-h')?.focus({ preventScroll: true }), 40);
}

export function closeIntro(fromHistory?) {
  if (!fromHistory && (history.state || {}).pkSheet) { history.back(); return; }
  hideSheet('intro');
  try { localStorage.setItem(INTRO_SEEN, '1'); } catch (e) {}
  setModalTrap();
  document.getElementById('help-btn')?.focus();
}

export function initIntro() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const sheet = SHEETS.map(id => document.getElementById(id)).find(isSheetOpen);
    if (!sheet) return;
    const f: any[] = [...sheet.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el: any) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], outside = !sheet.contains(e.target as any);
    if (!e.shiftKey && (e.target === last || outside)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (e.target === first || outside)) { e.preventDefault(); last.focus(); }
  });
}
