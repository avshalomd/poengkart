import { bucketColor, chanceMode, renderPointsField } from "./chance";
import { BIN_EDGES, BINS, cssVar, esc, fmt, HELD_OUT, isVg1, levelScope, MISSING_COUNTIES, shownPrograms } from "./helpers";
import { CATS, t } from "./i18n";
import { renderControls } from "./intro";
import { placeToast } from "./locate";
import { anyClusters, renderPanelSum, visibleSchools } from "./map";
import { S } from './state';
import { bindTitleTips } from "./tips";

/* ================= static chrome rendering ================= */
export function renderPanel() {
  renderControls();
  // in a span: the List view shows the line whole or not at all
  document.getElementById('tagline')!.replaceChildren(Object.assign(document.createElement('span'), {
    textContent: t('tagline', S.DATA!.schools.length, S.DATA!.counties.length,
                   S.DATA!.years[0], S.DATA!.years[S.DATA!.years.length - 1]) }));
  document.getElementById('cat-label')!.textContent = t('catLabel');
  document.getElementById('view-map')!.textContent = t('viewMap');
  document.getElementById('view-list')!.textContent = t('viewList');
  document.getElementById('view-toggle')!.setAttribute('aria-label', t('viewLabel'));
  const co = document.getElementById('calc-open');
  co!.title = t('calcOpen');
  co!.setAttribute('aria-label', t('calcOpen'));
  const counties = (S.DATA!.counties || []).filter(c => c.schools);
  const ff = document.getElementById('fylke-field');
  ff!.hidden = counties.length < 2;               // pointless with a single county
  document.getElementById('fylke-label')!.textContent = t('fylkeLabel');
  const fsel: any = document.getElementById('map-fylke');
  fsel.innerHTML = `<option value="all">${t('allFylker')}</option>` +
    counties.map(c => {
      const n = S.DATA!.schools.filter(s => s.fylke === c.fylke && s.lat).length;
      return `<option value="${esc(c.fylke)}">${esc(c.fylke)} (${n})</option>`;
    }).join('');
  // the counties without figures are listed, greyed and unselectable, so a
  // parent in Agder learns the map did not forget their school
  fsel.innerHTML += `<optgroup label="${esc(t('fylkeNoData'))}">` +
    MISSING_COUNTIES.map(f => `<option disabled>${esc(f)}</option>`).join('') + '</optgroup>';
  fsel.value = S.mapFylke;
  const present = new Set();
  S.DATA!.schools.filter(s => S.mapFylke === 'all' || s.fylke === S.mapFylke)
    .forEach(s => levelScope(s.programs).forEach(p => present.add(p.category)));
  const sel: any = document.getElementById('map-cat');
  sel.innerHTML = `<option value="all">${t('allCats')}</option>` +
    Object.keys(CATS).filter(c => present.has(c))
      .map(c => `<option value="${c}">${CATS[c][S.lang]}</option>`).join('');
  sel.value = S.mapCat;
  renderPointsField();
  renderPanelSum();
}
export function renderCatNote() {
  const el = document.getElementById('cat-note');
  el!.textContent = S.mapCat === 'all' ? '' :
    t('catNote', S.DATA!.schools.filter(s =>
      (S.mapFylke === 'all' || s.fylke === S.mapFylke)
      && shownPrograms(s).some(p => p.category === S.mapCat)).length);
}
export function liftMapControls() {
  // The rect and not offsetHeight: the text-size setting puts a `zoom` on the
  // legend, and offsetHeight reports the height BEFORE that zoom — 125px for a
  // legend really 162px tall at the largest step. Both numbers below were then
  // short by a third: the map's zoom-out button sat buried under the legend and
  // the panel ran off the bottom of a phone. The rect is 0 whenever the legend
  // is hidden — by attribute OR by the view-list / side-open CSS — so it still
  // doubles as the visibility test.
  const h = document.getElementById('legend')?.getBoundingClientRect().height || 0;
  // Lift by the legend's real top, not its height alone: the attribution's
  // bottom margin never counted the legend's own bottom offset, so the credit
  // links ended 4–9px under the legend on a phone.
  const lr = document.getElementById('legend')?.getBoundingClientRect();
  const lift = innerWidth <= 560 && h ? innerHeight - lr!.top + 8 : 0;
  document.documentElement.style.setProperty('--ctrl-lift', lift + 'px');
  // The panel's height cap used to reserve a flat 150px for the legend, but the
  // legend is 200px tall in the default national view — it carries the
  // mixed-rounds warning whenever the selection spans counties that publish
  // different intake rounds, which "Hele landet" always does. The panel then
  // ran 80px under it and hid the bottom of the reader's own choices list.
  // Reserve what the legend actually measures: 22px bottom offset, its height,
  // a 12px gap and the panel's own top (14px, 10px on a phone).
  // Painted lengths, not the stylesheet's: at Ekstra stor the panel's 14px top
  // and the legend's 22px offset are both drawn a third larger, and the
  // unzoomed figures left the panel 1px from the legend instead of 12.
  const pEl = document.getElementById('panel'), pr = pEl!.getBoundingClientRect();
  const panelTop = pr.height ? pr.top : parseFloat(getComputedStyle(pEl!).top) || 14;
  let gap = h ? innerHeight - lr!.top + 12 + panelTop : 46 + panelTop;
  // On a phone the panel spans the whole width, so the map's bottom-right
  // controls have only the strip between the panel and the legend to stand in.
  // Reserve that strip as well: with the ten wishes vigo allows, the choices
  // list grew the panel down over the locate and zoom buttons and they stopped
  // taking taps. The panel scrolls inside itself, so nothing is lost by it.
  const ctrls = document.querySelector('.maplibregl-ctrl-bottom-right');
  if (innerWidth <= 560 && ctrls) {
    const cr = ctrls.getBoundingClientRect();
    // From the lift set above, not from the column's top: the margin that lifts
    // it is transitioned, so its rect still stood at the foot of the screen when
    // read here, and at boot the panel's cap came out 125px too tall and covered
    // the locate and zoom buttons. 12 gap + the panel's own top.
    if (cr.height) gap = Math.max(gap, lift + cr.height + 12 + panelTop);
  }
  // The panel spends that reserve inside its own `zoom`, where a px length is
  // multiplied by the zoom before it is painted, so `calc(100dvh - gap)` gave a
  // panel a third too tall at the largest text step. Divide the budget by the
  // zoom; at z = 1 this is exactly the old `gap`.
  const z = parseFloat(getComputedStyle(document.getElementById('panel')!).zoom) || 1;
  document.documentElement.style.setProperty(
    '--panel-reserve', Math.round(innerHeight - (innerHeight - gap) / z) + 'px');
  placeToast();   // the legend it steers around may have moved or grown
}
// with points entered the legend shows a green/amber/red ramp, but at the
// national zoom every marker is a blue cluster: say why until a dot appears
export function legendZoomHint() {
  const el = document.getElementById('legend-zoom');
  if (!el) return;
  const clustered = anyClusters();
  el.textContent = t('legendZoomHint');
  const was = el.hidden;
  el.hidden = !(chanceMode() && clustered);
  // the line changes the legend's height, which the panel's cap is measured from
  if (el.hidden !== was) liftMapControls();
}
// The intake a forecast is for is the county's first year without published
// figures: 2026 in Buskerud and Trøndelag, 2027 elsewhere (model.json). Said as
// «neste inntak», the legend and the list told those two counties' readers
// about an intake that has already happened.
export function forecastYears(schools) {
  const ys = [...new Set(schools.map(s => S.MODEL?.schools?.[`${s.fylke}|${s.name}`]?.year).filter(Boolean))].sort();
  return t('yearsOr', ys);
}
// the dots are Vg1 unless the reader asked for the later years and the
// counties on screen publish any: the legend says which
export function levelChip() {
  const on = S.allLevels && visibleSchools().some(s => s.programs.some(p => !isVg1(p)));
  return ` <span class="round lv" title="${esc(t(on ? 'levelsChipAllTitle' : 'levelsChipTitle'))}">` +
         `${esc(on ? t('levelsChipAll') : 'Vg1')}</span>`;
}
export function renderLegend() {
  const rounds = [...new Set(visibleSchools().map(s => s.round).filter(Boolean))];
  const anyUnknown = visibleSchools().some(s => !s.round);
  document.getElementById('legend-title')!.innerHTML =
    (chanceMode() ? esc(t('legendChance', fmt(S.myPoints), forecastYears(visibleSchools())))
      : S.mapCat === 'all' ? t('legendAll') : t('legendCat', S.mapCat)) +
    (rounds.length === 1 && !anyUnknown
      ? ` <span class="round" title="${esc(t('roundTitle'))}">${t('roundChip', rounds[0])}</span>`
      : !rounds.length && anyUnknown
      ? ` <span class="round unknown" title="${esc(t('roundUnknownTitle'))}">${t('roundUnknown')}</span>` : '') +
    levelChip();
  const mix = document.getElementById('legend-mixed');
  mix!.hidden = !(rounds.length > 1 || (rounds.length && anyUnknown));
  legendZoomHint();
  mix!.textContent = t('mixedRounds');
  document.getElementById('legend-more-t')!.textContent = t('moreLabel');
  document.getElementById('legend-less-t')!.textContent = t('lessLabel');
  if (chanceMode()) {
    document.getElementById('legend-bins')!.innerHTML = ['likely', 'possible', 'unlikely'].map(b =>
      `<div class="bin"><span class="sw" style="background:${bucketColor(b)}"></span><span class="bl">${t('bandLabel', b)}</span></div>`).join('');
    document.getElementById('legend-size')!.textContent = t('legendChanceSize');
    document.getElementById('legend-none')!.textContent = t('legendNoForecast');
  } else {
    document.getElementById('legend-bins')!.innerHTML = BINS.map((b, i) =>
      `<div class="bin"><span class="sw" style="background:${cssVar(b.css)}"></span><span class="bl">${BIN_EDGES[i]}</span></div>`).join('');
    document.getElementById('legend-size')!.textContent = t('legendSize');
    document.getElementById('legend-none')!.textContent = t('legendNone');
  }
  // "no waitlist" and "filled without points" are not dot states once the
  // dots show chances
  document.getElementById('legend-open')!.parentElement!.hidden = chanceMode();
  document.getElementById('legend-open')!.textContent = t('legendOpen');
  // ...and neither is "how much filled up" a state a held-out county reports:
  // its dots are dashed, and the line names the county on screen
  const held = [...new Set(visibleSchools().filter(s => HELD_OUT.has(s.fylke)).map(s => s.fylke))];
  const heldEl = document.getElementById('legend-held')!;
  heldEl.parentElement!.hidden = chanceMode() || !held.length;
  heldEl.textContent = held.length ? t('legendHeldOut', held.join(', ')) : '';
  document.getElementById('legend-zero')!.parentElement!.hidden = chanceMode();
  document.getElementById('legend-zero')!.textContent = t('noPoints');
  // the intake-round chip in the title advertises an explanation with a dotted
  // underline and `cursor: help`, and every other surface that does so is bound
  // for touch; the legend was the one that never was, so on a phone the single
  // most load-bearing caveat in the dataset had no way to open
  bindTitleTips(document.getElementById('legend'));
  liftMapControls();
}

export function initChrome() {
  // the legend's height feeds the panel's reserve and the control lift, so an
  // unfolded legend has to be measured again
  document.getElementById('legend-more')!.addEventListener('toggle', liftMapControls);
}
