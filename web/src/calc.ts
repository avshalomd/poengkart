import { onPoints } from "./chance";
import { esc, X_ICON } from "./helpers";
import { t } from "./i18n";
import { hideSheet, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { S } from './state';

/* ================= grade calculator ================= */
// vitnemål subjects with a numeric grade at grunnskole level, official names;
// the two exam slots come on top of standpunkt, as on the vitnemål itself
export const CALC_SUBJECTS = [
  'Norsk hovedmål', 'Norsk sidemål', 'Norsk muntlig', 'Engelsk skriftlig',
  'Engelsk muntlig', 'Matematikk', 'Naturfag', 'Samfunnsfag', 'KRLE',
  'Fremmedspråk / språklig fordypning', 'Kroppsøving', 'Kunst og håndverk',
  'Musikk', 'Mat og helse', 'Valgfag',
];
export const CALC_EXAMS = ['Skriftlig eksamen', 'Muntlig eksamen'];
export function loadCalc() {
  try {
    const g = JSON.parse(localStorage.getItem('pk-grades') || '{}');
    if (g && typeof g === 'object') {
      for (const [k, v] of Object.entries(g) as [string, any][])
        if ([...CALC_SUBJECTS, ...CALC_EXAMS].includes(k) && [1,2,3,4,5,6].includes(v))
          S.calcGrades[k] = v;
    }
  } catch (e) {}
}
export function saveCalc() {
  try {
    Object.keys(S.calcGrades).length
      ? localStorage.setItem('pk-grades', JSON.stringify(S.calcGrades))
      : localStorage.removeItem('pk-grades');
  } catch (e) {}
}
export function calcMean() {
  const vs: any[] = Object.values(S.calcGrades);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
}
export function renderCalc() {
  document.getElementById('calc-h')!.textContent = t('calcTitle');
  document.getElementById('calc-x')!.setAttribute('aria-label', t('close'));
  const row = (f, exam) => {
    const cur = S.calcGrades[f];
    return `<div class="subj${exam ? ' exam' : ''}"><span class="n">${esc(f)}</span>` +
      `<span class="grades">` +
      [1,2,3,4,5,6].map(g =>
        `<button type="button" data-f="${esc(f)}" data-g="${g}" class="${cur === g ? 'on' : ''}"` +
        ` aria-pressed="${cur === g}" aria-label="${esc(t('calcGradeAria', g, f))}">${g}</button>`).join('') +
      `<button type="button" class="rm${cur ? '' : ' off'}" data-f="${esc(f)}" data-g=""` +
      ` aria-label="${esc(t('calcClearAria', f))}">${X_ICON}</button>` +
      `</span></div>`;
  };
  const mean = calcMean();
  const fmtN = v => v.toFixed(2).replace('.', S.lang === 'no' ? ',' : '.');
  const fmtP = v => v.toFixed(1).replace('.', S.lang === 'no' ? ',' : '.');
  document.getElementById('calc-body')!.innerHTML =
    `<p class="lede">${esc(t('calcLede'))}</p>` +
    CALC_SUBJECTS.map(f => row(f, false)).join('') +
    CALC_EXAMS.map(f => row(f, true)).join('') +
    `<div class="sum">` +
    `<span><span class="v">${mean === null ? t('calcEmpty') : fmtN(mean)}</span> <span class="l">${esc(t('calcSnitt'))}</span></span>` +
    `<span><span class="v">${mean === null ? t('calcEmpty') : fmtP(mean * 10)}</span> <span class="l">${esc(t('calcPoeng'))}</span></span>` +
    `</div>` +
    `<button class="cta" id="calc-use" ${mean === null ? 'disabled' : ''}>${esc(t('calcUse'))}</button>` +
    ` <button class="cta ghost" id="calc-reset" ${Object.keys(S.calcGrades).length ? '' : 'hidden'}>${esc(t('calcReset'))}</button>` +
    `<p class="note">${esc(t('calcNote'))}</p>`;
  document.getElementById('calc-body')!.querySelectorAll('.grades button').forEach((b: any) => {
    b.onclick = () => {
      const f = b.dataset.f, g = b.dataset.g;
      if (!g) delete S.calcGrades[f];
      else S.calcGrades[f] = +g;
      saveCalc(); renderCalc();
      // the rebuild removed the pressed button; focus its successor (or the
      // row's first grade, when the pressed one was the now-hidden ✕)
      (document.querySelector(`#calc .grades button[data-f="${CSS.escape(f)}"][data-g="${g || '1'}"]`) as any)?.focus();
    };
  });
  const use = document.getElementById('calc-use');
  if (use) use.onclick = () => {
    const m = calcMean();
    if (m === null) return;
    onPoints((m * 10).toFixed(1));       // renderPointsField reprints the field
    closeCalc();
  };
  const reset = document.getElementById('calc-reset');
  if (reset) reset.onclick = () => {
    S.calcGrades = {}; saveCalc(); renderCalc();
    (document.querySelector('#calc .grades button') as any)?.focus();
  };
}
export function openCalc() {
  renderCalc();
  showSheet('calc');
  setModalTrap();
  openSheetHistory();
  setTimeout(() => (document.querySelector('#calc .grades button') as any)?.focus(), 40);
}
export function closeCalc(fromHistory?) {
  if (!fromHistory && (history.state || {}).pkSheet) { history.back(); return; }
  hideSheet('calc');
  setModalTrap();
  document.getElementById('calc-open')?.focus();
}

export function initCalc() {
}
