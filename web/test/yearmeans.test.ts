import { describe, it, expect, beforeEach } from 'vitest';
import { S } from '../src/state';
import { loadFixtures, DATA, asker } from './fixtures';
import { yearMeans, meanStep, shownPrograms } from '../src/helpers';

beforeEach(() => { loadFixtures(); S.DATA = DATA; S.allLevels = false; S.showOld = false; });

describe('yearMeans', () => {
  it('ends on the two figures meanStep reports — one statistic everywhere', () => {
    const progs = shownPrograms(asker());
    const ym = yearMeans(progs);
    const step: any = meanStep(progs);
    expect(ym[ym.length - 1]).toEqual([step.latest, step.mean]);
    if (step.meanPrev !== null) expect(ym[ym.length - 2]).toEqual([step.prev, step.meanPrev]);
  });
  it('is sorted by year, one entry per year with a numeric cell', () => {
    const ym = yearMeans(shownPrograms(asker()));
    expect(ym.map(y => y[0])).toEqual([...ym.map(y => y[0])].sort());
    for (const [, m] of ym) expect(Number.isFinite(m)).toBe(true);
  });
  it('is empty when no programme has a numeric cell', () => {
    expect(yearMeans([{ program: 'x', program_en: 'x', level: 'Vg1', category: 'ST', values: { '2026': 'open', '2025': 'F' } } as any])).toEqual([]);
  });
});
