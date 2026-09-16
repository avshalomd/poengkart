import { describe, it, expect } from 'vitest';
import { loadFixtures, asker } from './fixtures';
import { predFor, chanceOf, bucketOf, schoolChance, errCdf } from '../src/chance';
import { S } from '../src/state';

describe('chance of a place', () => {
  it('errCdf is a distribution function: monotone, clamped near 0 far left and near 1 far right', () => {
    // With S.MODEL loaded, errCdf reads meta.error_quantiles and clamps to
    // [0.005, 0.995] outside the fitted grid rather than approaching 0/1
    // exactly (see the comments in src/chance.ts) — the Gaussian fallback
    // used only when the model carries no error_quantiles does approach 0/1.
    loadFixtures();
    expect(errCdf(-1e6)).toBeCloseTo(0.005, 6);
    expect(errCdf(1e6)).toBeCloseTo(0.995, 6);
    let prev = -1;
    for (let z = -30; z <= 30; z += 0.5) { const v = errCdf(z); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });

  it('predFor returns the forecast triple for a programme the model knows', () => {
    loadFixtures();
    const s = asker();
    // predFor(s, p) takes one of the school's own programme rows (not a model
    // key): find one the model actually has a forecast for.
    const p = s.programs.find((prog: any) => predFor(s, prog));
    expect(p).toBeTruthy();
    const pred = predFor(s, p);
    expect(pred).toMatchObject({ m: expect.any(Number), s: expect.any(Number), pi: expect.any(Number) });
    expect(pred.pi).toBeGreaterThanOrEqual(0); expect(pred.pi).toBeLessThanOrEqual(1);
  });

  it('chanceOf rises with points, is bounded, and is 1 − π far below the threshold', () => {
    loadFixtures();
    const s = asker();
    const p = s.programs.find((prog: any) => predFor(s, prog));
    const pred = predFor(s, p);
    // chanceOf(pr, x): the prediction comes first, the reader's points second.
    // errCdf clamps at 0.005/0.995 rather than 0/1 (see the test above), so
    // chanceOf's extremes sit within pi * 0.005 of (1 - pi) and 1, not on them.
    const at = (x: number) => chanceOf(pred, x);
    expect(at(-1000)).toBeCloseTo(1 - pred.pi, 1);
    expect(at(1000)).toBeCloseTo(1, 1);
    let prev = 0;
    for (let x = 0; x <= 60; x += 1) { const v = at(x); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); expect(v).toBeLessThanOrEqual(1); prev = v; }
  });

  it('bucketOf bands at 70% and 35%', () => {
    expect(bucketOf(0.95)).toBe('likely'); expect(bucketOf(0.70)).toBe('likely');
    expect(bucketOf(0.69)).toBe('possible'); expect(bucketOf(0.35)).toBe('possible');
    expect(bucketOf(0.34)).toBe('unlikely'); expect(bucketOf(0)).toBe('unlikely');
  });

  it('schoolChance aggregates the scope’s chances, counts summing to n', () => {
    // schoolChance(s, cat, x) takes the county-lens category and the reader's
    // points explicitly; it does not itself gate on S.myPoints (callers do,
    // via chanceMode()) so it returns an aggregate even for x = null.
    loadFixtures();
    const s = asker();
    S.myPoints = 45;
    const c = schoolChance(s, 'all', 45);
    expect(c).not.toBeNull();
    expect(c!.n).toBeGreaterThan(0);
    expect(c!.n).toBeLessThanOrEqual(c!.total);
    expect(c!.likely + c!.possible + c!.unlikely).toBe(c!.n);
    expect(c!.best).toBeGreaterThanOrEqual(0); expect(c!.best).toBeLessThanOrEqual(1);
  });
});
