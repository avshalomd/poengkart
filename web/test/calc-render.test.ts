import { describe, it, expect, beforeEach } from 'vitest';
import { loadFixtures } from './fixtures';
import { stubMap } from './mapstub';
import { CALC_SUBJECTS, CALC_EXAMS, renderCalc, calcMean, loadCalc, saveCalc, openCalc, closeCalc } from '../src/calc';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { isSheetOpen } from '../src/intro';
import { t } from '../src/i18n';
import { S } from '../src/state';

const sumCells = () => [...document.querySelectorAll('#calc-body .sum .v')].map(e => e.textContent);

describe('the grade calculator', () => {
  beforeEach(() => { S.calcGrades = {}; });

  it('draws a row of grades per subject and per exam, and nothing in the total until a grade is set', () => {
    loadFixtures(); initHelpers();
    renderCalc();
    expect(document.getElementById('calc-h')!.textContent).toBe(t('calcTitle'));
    // the two exam slots come on top of the subjects, as on the vitnemål
    expect(document.querySelectorAll('#calc-body .subj').length).toBe(CALC_SUBJECTS.length + CALC_EXAMS.length);
    expect(document.querySelectorAll('#calc-body .subj.exam').length).toBe(CALC_EXAMS.length);
    expect(document.querySelectorAll(`#calc-body .subj:first-of-type .grades button:not(.rm)`).length).toBe(6);
    expect(calcMean()).toBeNull();
    expect(sumCells()).toEqual([t('calcEmpty'), t('calcEmpty')]);
    expect((document.getElementById('calc-use') as any).disabled).toBe(true);
  });

  it('the total is the app’s own mean, and the points figure is that mean times ten', () => {
    loadFixtures(); initHelpers();
    renderCalc();
    // press 5 on the first subject and 4 on the second
    (document.querySelector(`#calc-body button[data-f="${CSS.escape(CALC_SUBJECTS[0])}"][data-g="5"]`) as any).click();
    (document.querySelector(`#calc-body button[data-f="${CSS.escape(CALC_SUBJECTS[1])}"][data-g="4"]`) as any).click();
    expect(S.calcGrades).toEqual({ [CALC_SUBJECTS[0]]: 5, [CALC_SUBJECTS[1]]: 4 });
    const m = calcMean()!;
    expect(m).toBeCloseTo(4.5, 10);
    // the sum block prints the mean to two decimals and the points to one,
    // with the language's own decimal separator
    expect(sumCells()).toEqual(['4,50', '45,0']);
    expect(JSON.parse(localStorage.getItem('pk-grades')!)).toEqual(S.calcGrades);
    expect((document.getElementById('calc-use') as any).disabled).toBe(false);
  });

  it('the ✕ on a row clears that subject, and Tøm clears them all', () => {
    loadFixtures(); initHelpers();
    renderCalc();
    (document.querySelector(`#calc-body button[data-f="${CSS.escape(CALC_SUBJECTS[0])}"][data-g="3"]`) as any).click();
    (document.querySelector(`#calc-body button[data-f="${CSS.escape(CALC_SUBJECTS[1])}"][data-g="6"]`) as any).click();
    (document.querySelector(`#calc-body .rm[data-f="${CSS.escape(CALC_SUBJECTS[0])}"]`) as any).click();
    expect(S.calcGrades).toEqual({ [CALC_SUBJECTS[1]]: 6 });
    (document.getElementById('calc-reset') as any).click();
    expect(S.calcGrades).toEqual({});
    expect(localStorage.getItem('pk-grades')).toBeNull();
  });

  it('a stored vitnemål comes back, and anything that is not a grade is dropped', () => {
    loadFixtures(); initHelpers();
    localStorage.setItem('pk-grades', JSON.stringify({
      [CALC_SUBJECTS[0]]: 4, [CALC_EXAMS[0]]: 6, 'Trolldom': 5, [CALC_SUBJECTS[1]]: 9,
    }));
    loadCalc();
    expect(S.calcGrades).toEqual({ [CALC_SUBJECTS[0]]: 4, [CALC_EXAMS[0]]: 6 });
    saveCalc();
    expect(JSON.parse(localStorage.getItem('pk-grades')!)).toEqual(S.calcGrades);
  });

  it('“use this” hands the points field the mean times ten', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    renderCalc();
    (document.querySelector(`#calc-body button[data-f="${CSS.escape(CALC_SUBJECTS[0])}"][data-g="4"]`) as any).click();
    (document.getElementById('calc-use') as any).click();
    expect(S.myPoints).toBe(40);
    expect((document.getElementById('my-points') as any).value).toBe('40,0');
  });

  it('the sheet opens and closes', () => {
    loadFixtures(); initHelpers();
    openCalc();
    expect(isSheetOpen(document.getElementById('calc'))).toBe(true);
    closeCalc(true);
    expect(isSheetOpen(document.getElementById('calc'))).toBe(false);
  });
});
