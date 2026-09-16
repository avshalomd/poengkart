import { describe, it, expect } from 'vitest';
import { loadFixtures, asker, forde, DATA } from './fixtures';
import { meanOf, round1, isPoints, fmtNum, fmt, esc, numericLatest, yearSpan, levelScope, shownPrograms, visibleIn, isRecent, countyNewest, partitionPrograms, progId } from '../src/helpers';
import { parsePoints } from '../src/chance';
import { S } from '../src/state';

describe('figures', () => {
  it('round1 rounds half away from zero at one decimal, the way the county tables print', () => {
    expect(round1(45.05)).toBe(45.1); expect(round1(45.04)).toBe(45); expect(round1(-0.05)).toBe(-0.1);
  });
  it('isPoints accepts numbers and rejects the cell-state tokens', () => {
    expect(isPoints(45.1)).toBe(true); expect(isPoints(0)).toBe(false);
    for (const tok of ['open', 'F', 'D', 'U', null, undefined, '']) expect(isPoints(tok as any), String(tok)).toBe(false);
  });
  it('meanOf averages the points and ignores nothing (callers filter)', () => {
    expect(meanOf([40, 50])).toBe(45); expect(meanOf([45.1])).toBe(45.1);
  });
  it('fmtNum always prints a comma; fmt (its lang-aware wrapper) uses a point in English', () => {
    // fmtNum itself is not lang-aware (it always emits a comma, one decimal);
    // fmt(v) is the wrapper that swaps the separator for English. S.lang here
    // only matters for fmt.
    expect(fmtNum(45.1)).toBe('45,1');
    S.lang = 'no'; expect(fmt(45.1)).toBe('45,1');
    S.lang = 'en'; expect(fmt(45.1)).toBe('45.1');
  });
  it('esc escapes what breaks innerHTML', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('points field', () => {
  it('parsePoints reads comma and point, refuses the impossible', () => {
    expect(parsePoints('45,1').pts).toBe(45.1); expect(parsePoints('45.1').pts).toBe(45.1);
    expect(parsePoints('999').pts).toBeNull(); expect(parsePoints('').pts).toBeNull(); expect(parsePoints('abc').pts).toBeNull();
  });
});

// One regular row, its F-only (fortrinnsrett) duplicate — same progId, so
// partitionPrograms folds it away — and one genuine orphan: priority-only
// with no regular twin. Shared by the visibleIn and partitionPrograms tests
// below, which check the two halves of the same fold/orphan split.
const PARTITION_FIXTURE = [
  { program: 'Studiespesialisering', level: 'Vg1', values: { '2026': 40 } },
  { program: 'Studiespesialisering', level: 'Vg1', values: { '2026': 'F' } },   // folded: same progId as above
  { program: 'Idrettsfag', level: 'Vg1', values: { '2026': 'F' } },             // orphan: no regular twin
];

describe('dataset helpers', () => {
  it('yearSpan is one school’s own year range, "y0–y1" (or a single year)', () => {
    // yearSpan(s) takes a school, not the dataset (S.DATA.years is a separate
    // dataset-wide field the sources cited above read directly) and returns a
    // formatted string, not a [from, to] tuple.
    loadFixtures(); const s = asker();
    const years = [...new Set(s.programs.flatMap((p: any) => Object.keys(p.values)))].sort();
    const expected = years.length === 0 ? '' : years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`;
    expect(yearSpan(s)).toBe(expected);
    expect(years.length).toBeGreaterThan(1);
    expect(yearSpan(s)).toContain('–');
  });
  it('shownPrograms is Vg1 only by default and grows with allLevels', () => {
    loadFixtures(); const s = forde();
    const vg1 = shownPrograms(s); expect(vg1.every((p: any) => p.level === 'Vg1')).toBe(true);
    S.allLevels = true; expect(shownPrograms(s).length).toBeGreaterThan(vg1.length);
  });
  it('numericLatest picks the newest numeric year of a programme’s values', () => {
    // numericLatest(values) takes the programme's `values` map directly (not
    // the programme object) and returns a [year, value] tuple, not an object.
    loadFixtures(); const p = asker().programs[0];
    const years = Object.keys(p.values).filter(y => isPoints(p.values[y])).sort();
    expect(numericLatest(p.values)![0]).toBe(years.at(-1));
  });
  it('visibleIn folds an F-only duplicate into its regular row, but keeps an orphan priority-only row', () => {
    // visibleIn(progs) counts a programme list's rows after partitionPrograms
    // folds away an F-only (fortrinnsrett) duplicate of a row that also has a
    // real, numeric row — it does not take a county or category (that
    // filtering is visibleSchools()'s and schoolPressure()'s job, upstream).
    expect(visibleIn(PARTITION_FIXTURE as any)).toBe(2);
  });
  it('countyNewest is the newest year any school of the county reports', () => {
    loadFixtures();
    const expected = Math.max(...DATA.schools.filter((s: any) => s.fylke === 'Akershus')
      .flatMap((s: any) => s.programs.flatMap((p: any) => Object.keys(p.values).map(Number))));
    expect(countyNewest('Akershus')).toBe(expected);
  });
  it('partitionPrograms folds the F-only duplicate into regular, keeps the true orphan, and lists both F-only ids in prioNames', () => {
    // partitionPrograms(progs) takes a programme array, not a school, and
    // splits by isPrioOnly (every year is 'F'), not by isRecent. Concrete
    // shape on the same fixture as visibleIn's test above, so a fold/orphan
    // regression that still returns a 3-key, size-bounded object is caught.
    const parts = partitionPrograms(PARTITION_FIXTURE as any);
    expect(parts.regular.length).toBe(1);
    expect(parts.regular.map(progId)).toEqual(['studiespesialisering|Vg1']);
    expect(parts.orphans.map(progId)).toEqual(['idrettsfag|Vg1']);
    expect(parts.prioNames).toEqual(new Set(['studiespesialisering|Vg1', 'idrettsfag|Vg1']));
  });
  it('levelScope keeps Vg1 rows unless allLevels is on, and falls back to every row when there is no Vg1', () => {
    const mixed = [{ level: 'Vg1' }, { level: 'Vg2' }];
    S.allLevels = false;
    expect(levelScope(mixed as any)).toEqual([mixed[0]]);
    S.allLevels = true;
    expect(levelScope(mixed as any)).toBe(mixed);
    S.allLevels = false;
    const noVg1 = [{ level: 'Vg2' }, { level: 'Vg3' }];
    expect(levelScope(noVg1 as any)).toBe(noVg1);
  });
  it('isRecent is true only within one year of the county’s newest', () => {
    loadFixtures();
    const newest = countyNewest('Akershus');
    expect(isRecent({ values: { [String(newest)]: 40 } } as any, 'Akershus')).toBe(true);
    expect(isRecent({ values: { [String(newest - 1)]: 40 } } as any, 'Akershus')).toBe(true);
    expect(isRecent({ values: { [String(newest - 5)]: 40 } } as any, 'Akershus')).toBe(false);
  });
});
