import { updateMapLabels } from "./boot";
import { renderCalc } from "./calc";
import { renderChoices } from "./chance";
import { renderCatNote, renderLegend, renderPanel } from "./chrome";
import { renderContact } from "./feedback";
import { t } from "./i18n";
import { renderIntro } from "./intro";
import { updateLocateAria, updateZoomAria } from "./locate";
import { drawMarkers } from "./map";
import { renderSettings } from "./prefs";
import { renderSide } from "./sidebar";
import { S } from './state';

/* ================= language ================= */
export function setLang(l) {
  if (l !== 'no' && l !== 'en') return;   // the only two languages that exist
  S.lang = l;
  try { localStorage.setItem('pk-lang', l); } catch (e) {}
  document.documentElement.lang = l === 'no' ? 'no' : 'en';
  document.title = t('pageTitle');
  updateZoomAria(); updateLocateAria(); updateMapLabels();
  renderPanel(); renderLegend(); renderCatNote(); drawMarkers(); renderChoices();
  if (S.current) renderSide();
  if (!document.getElementById('intro')!.hidden) renderIntro();
  if (!document.getElementById('contact')!.hidden) renderContact();
  if (!document.getElementById('settings')!.hidden) renderSettings();
  if (!document.getElementById('calc')!.hidden) renderCalc();
}

export function initLang() {
}
