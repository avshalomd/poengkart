import { describe, it, expect, beforeEach } from 'vitest';
import { calcMean, loadCalc, saveCalc, CALC_SUBJECTS } from '../src/calc';
import { S } from '../src/state';

// calcMean, loadCalc and saveCalc all take no arguments: they read and write
// S.calcGrades (a { subject: 1..6 } map) and localStorage directly, rather
// than taking a grades array. calcMean returns the mean on the 1-6 grade
// scale printed on a vitnemål, not the ×10 "points" figure (that scaling
// happens in renderCalc, not here).
beforeEach(() => { S.calcGrades = {}; });

describe('grade calculator', () => {
  it('averages S.calcGrades on the 1–6 scale; empty is null', () => {
    expect(calcMean()).toBeNull();
    S.calcGrades = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, 5]));
    expect(calcMean()).toBe(5);
    S.calcGrades = { a: 5, b: 4 };
    expect(calcMean()).toBe(4.5);
    S.calcGrades = { a: 5, b: 4, c: 4 };
    expect(calcMean()).toBeCloseTo(4.333, 3);
  });
  it('grades round-trip through localStorage, filtered to known subjects and valid grades', () => {
    S.calcGrades = { [CALC_SUBJECTS[0]]: 5, [CALC_SUBJECTS[1]]: 4, [CALC_SUBJECTS[2]]: 3 };
    saveCalc();
    S.calcGrades = {};
    loadCalc();
    expect(S.calcGrades).toEqual({ [CALC_SUBJECTS[0]]: 5, [CALC_SUBJECTS[1]]: 4, [CALC_SUBJECTS[2]]: 3 });
  });
  it('loadCalc discards a stored value under an unknown subject or an out-of-range grade', () => {
    localStorage.setItem('pk-grades', JSON.stringify({ [CALC_SUBJECTS[0]]: 5, 'Ikke et fag': 4, [CALC_SUBJECTS[1]]: 7 }));
    S.calcGrades = {};
    loadCalc();
    expect(S.calcGrades).toEqual({ [CALC_SUBJECTS[0]]: 5 });
  });
});
