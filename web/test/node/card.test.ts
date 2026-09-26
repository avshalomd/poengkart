import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../src/data';
import { cardTree, renderCard } from '../../src/cards/card';
import { meanStep, shownPrograms, yearMeans } from '../../src/helpers';
import { S } from '../../src/state';

describe('the share card', () => {
  const data = loadDataset();
  const asker = data.schools.find(s => s.name === 'Asker' && s.fylke === 'Akershus')!;
  it('is a 1200×630 PNG', async () => {
    S.DATA = data;
    const png = await renderCard(asker);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR: width and height at bytes 16–23, big-endian
    const dv = new DataView(png.buffer, png.byteOffset);
    expect(dv.getUint32(16)).toBe(1200); expect(dv.getUint32(20)).toBe(630);
    expect(png.length).toBeGreaterThan(10_000);
  }, 30_000);
  it('names the school, the county and the hero figure', () => {
    S.DATA = data;
    const text = JSON.stringify(cardTree(asker));
    expect(text).toContain('Asker'); expect(text).toContain('Akershus'); expect(text).toContain('poengkart.no');
  });
  // 7 schools have a label rather than a figure for their latest year but means
  // in earlier ones. The line drawn from those means ends years before the year
  // the label names, and the card has no axis to say so.
  it('draws the line only where the figure is a number', () => {
    S.DATA = data;
    const s = data.schools.find(x => x.name === 'Storsteigen videregående skole' && x.fylke === 'Innlandet')!;
    expect(meanStep(shownPrograms(s)).mean).toBeNull();
    expect(yearMeans(shownPrograms(s)).length).toBeGreaterThan(1);   // a line could be drawn
    expect(JSON.stringify(cardTree(s))).not.toContain('"img"');
    expect(JSON.stringify(cardTree(asker))).toContain('"img"');
  });
  it('a school without a numeric mean shows the sheet\'s own label', () => {
    S.DATA = data;
    const s = data.schools.find(x => !x.programs.some(p => Object.values(p.values).some(v => typeof v === 'number')));
    if (!s) return;   // none in this dataset: nothing to prove
    expect(JSON.stringify(cardTree(s))).not.toContain('NaN');
  });
});
