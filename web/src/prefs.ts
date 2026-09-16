import { renderPointsField } from "./chance";
import { renderCatNote, renderLegend } from "./chrome";
import { esc } from "./helpers";
import { t } from "./i18n";
import { hideSheet, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { setLang } from "./lang";
import { drawMarkers, setLevels, setTiles } from "./map";
import { listLayout, renderSide, sideTrap } from "./sidebar";
import { S } from './state';

/* ================= preferences: theme, text size, colours ================= */
export const PREFS = { theme: 'auto', font: 'n', cvd: false };
export function loadPrefs() {
  try {
    const th = localStorage.getItem('pk-theme');
    if (th === 'light' || th === 'dark') PREFS.theme = th;
    const f = localStorage.getItem('pk-font');
    if (f === 'lg' || f === 'xl') PREFS.font = f;
    PREFS.cvd = localStorage.getItem('pk-cvd') === '1';
  } catch (e) {}
}
export function applyPrefs(rerender) {
  const de = document.documentElement;
  if (PREFS.theme === 'auto') delete de.dataset.theme; else de.dataset.theme = PREFS.theme;
  if (PREFS.font === 'n') delete de.dataset.font; else de.dataset.font = PREFS.font;
  if (PREFS.cvd) de.dataset.cvd = '1'; else delete de.dataset.cvd;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m: any) => {
    m.content = PREFS.theme === 'dark' ? '#0e1116' : PREFS.theme === 'light' ? '#2a78d6' : m.dataset.c;
  });
  try {
    if (PREFS.theme === 'auto') localStorage.removeItem('pk-theme');
    else localStorage.setItem('pk-theme', PREFS.theme);
    if (PREFS.font === 'n') localStorage.removeItem('pk-font');
    else localStorage.setItem('pk-font', PREFS.font);
    if (PREFS.cvd) localStorage.setItem('pk-cvd', '1');
    else localStorage.removeItem('pk-cvd');
  } catch (e) {}
  if (rerender && S.map) {
    setTiles(); drawMarkers(); renderLegend(); renderCatNote(); renderPointsField();
    if (S.current) renderSide();
    listLayout();                                               // a text size moves the breakpoints
    sideTrap(document.body.classList.contains('side-open'));
  }
}
export function renderSettings() {
  document.getElementById('settings-h').textContent = t('settingsLabel');
  document.getElementById('settings-x').setAttribute('aria-label', t('close'));
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linejoin="round" aria-hidden="true"><path d="M20.4 14.3A8.5 8.5 0 0 1 9.7 3.6a8.5 8.5 0 1 0 10.7 10.7z"/></svg>';
  // opts: [value, contents, spoken label] — contents may be an icon, the
  // spoken label is what a screen reader (and the tooltip) gets
  const seg = (key, opts, cur, groupLabel) => `<div class="seg" role="group"${groupLabel ? ` aria-label="${esc(groupLabel)}"` : ''}>` + opts.map(([v, html, label]) =>
    `<button type="button" data-k="${key}" data-v="${v}" class="${cur === v ? 'on' : ''}"` +
    ` aria-pressed="${cur === v}"${label ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ''}>${html}</button>`)
    .join('') + `</div>`;
  document.getElementById('settings-body').innerHTML =
    `<div class="row"><div class="t">${esc(t('levelsSumLabel'))}</div>` +
    seg('levels', [['1', 'Vg1'], ['all', esc(t('levelsChipAll'))]], S.allLevels ? 'all' : '1', t('levelsSumLabel')) +
    `<div class="hint">${esc(t('setLevelsHint'))}</div></div>` +
    `<div class="row"><div class="t">${esc(t('langLabel'))}</div>` +
    seg('lang', [['no', 'NO'], ['en', 'EN']], S.lang, t('langLabel')) + `</div>` +
    `<div class="row"><div class="t">${esc(t('setTheme'))}</div>` +
    seg('theme', [['auto', esc(t('setThemeAuto'))], ['light', SUN, t('setThemeLight')],
                  ['dark', MOON, t('setThemeDark')]], PREFS.theme, t('setTheme')) + `</div>` +
    `<div class="row"><div class="t">${esc(t('setFont'))}</div>` +
    seg('font', [['n', esc(t('setFontN'))], ['lg', esc(t('setFontL'))], ['xl', esc(t('setFontX'))]], PREFS.font, t('setFont')) + `</div>` +
    `<div class="row"><div class="t">${esc(t('setColors'))}</div>` +
    seg('cvd', [['0', esc(t('setColorsStd'))], ['1', esc(t('setColorsCvd'))]], PREFS.cvd ? '1' : '0', t('setColors')) + `</div>` +
    `<div class="note">${esc(t('setNote'))}</div>`;
  document.getElementById('settings-body').querySelectorAll('.seg button').forEach((b: any) => {
    b.onclick = () => {
      const k = b.dataset.k, v = b.dataset.v;
      if (k === 'lang') setLang(v);            // re-renders this sheet
      else if (k === 'levels') { setLevels(v === 'all'); renderSettings(); }
      else {
        if (k === 'cvd') PREFS.cvd = v === '1';
        else PREFS[k] = v;
        applyPrefs(true); renderSettings();
      }
      // innerHTML replaced the pressed button; put focus back on its successor
      (document.querySelector(`#settings .seg button[data-k="${k}"][data-v="${v}"]`) as any)?.focus();
    };
  });
}
export function openSettings() {
  renderSettings();
  showSheet('settings');
  setModalTrap();
  openSheetHistory();
  setTimeout(() => (document.querySelector('#settings .seg button.on') as any)?.focus(), 40);
}
export function closeSettings(fromHistory?) {
  if (!fromHistory && (history.state || {}).pkSheet) { history.back(); return; }
  hideSheet('settings');
  setModalTrap();
  // a text size can turn the school sheet full-screen and hide the panel with
  // this button in it, and focus() on a hidden button left focus on <body>
  const b: any = document.getElementById('settings-btn');
  (b && b.offsetParent ? b : document.querySelector('#side.open #s-photo .close') || document.getElementById('panel'))?.focus();
}

export function initPrefs() {
}
