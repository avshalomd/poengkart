import { describe, it, expect, beforeEach } from 'vitest';
import { S } from '../src/state';
import { loadFixtures, DATA, asker, forde } from './fixtures';
import { stubMap } from './mapstub';
import { esc, initHelpers, schoolPressure } from '../src/helpers';
import { openSide } from '../src/sidebar';
import { t } from '../src/i18n';
import { photoHtml, metaHtml, notesHtml, heroHtml, srcNoteHtml, listHtml } from '../src/templates';

// The DOM the client renders must be the DOM the build prerendered: same
// strings, so nothing moves when the script takes over a school page.
const norm = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.innerHTML; };
// …a container as the template left it. One thing the client does AFTER it
// assigns the string that no string can carry: MapLibre builds the location map
// inside the empty #s-minimap. Undo that one; any other difference is a
// template that has drifted from what the sheet renders.
const rendered = (id: string) => {
  const d = document.createElement('div');
  d.innerHTML = document.getElementById(id)!.innerHTML;
  const mini = d.querySelector('#s-minimap');
  if (mini) { mini.innerHTML = ''; mini.removeAttribute('class'); mini.removeAttribute('style'); }
  return d.innerHTML;
};

const sample = () => {
  const merged = DATA.schools.find(s => s.merged_from?.length)!;
  const noPhoto = DATA.schools.find(s => !s.photo && s.lat)!;
  const elvebakken = DATA.schools.find(s => s.name === 'Elvebakken videregående skole')!;
  return [asker(), forde(), merged, noPhoto, elvebakken];
};

beforeEach(() => { loadFixtures(); initHelpers(); S.DATA = DATA; S.lang = 'no'; S.mapCat = 'all'; S.mapFylke = 'all'; S.allLevels = false; S.showOld = false; stubMap(); });

describe('the sheet renders what the templates say', () => {
  it.each(sample().map(s => [s.name, s] as const))('%s', (_n, s) => {
    openSide(s);
    expect(rendered('s-photo')).toBe(norm(photoHtml(s)));
    expect(rendered('s-meta')).toBe(norm(metaHtml(s)));
    expect(rendered('s-notes')).toBe(norm(notesHtml(s)));
    expect(document.getElementById('s-notes')!.hidden).toBe(!notesHtml(s));
    const { hero, mix } = heroHtml(s, null);
    expect(rendered('s-hero')).toBe(norm(hero));
    expect(rendered('s-mix')).toBe(norm(mix));
    expect(document.getElementById('s-mix')!.hidden).toBe(!mix);
    expect(rendered('src-note')).toBe(norm(srcNoteHtml()));
    expect(rendered('s-list')).toBe(norm(listHtml(s, null)));
  });
  it('the templates are strings of the school, not of the DOM', () => {
    const s = asker();
    const before = document.body.innerHTML;
    const a = photoHtml(s) + metaHtml(s) + heroHtml(s, null).hero + listHtml(s, null);
    expect(document.body.innerHTML).toBe(before);
    expect(a).toContain('<h2>Asker</h2>');
    expect(a).toContain('class="prow');
  });
  it('a row after an unusual step says so, with both figures, and only that row', () => {
    // Randaberg's Vg1 TIF went 30,0 → 11,3 as Rogaland printed it; the model
    // widened that forecast and carries the step as j
    const s = DATA.schools.find(x => x.name === 'Randaberg videregående skole')!;
    const html = listHtml(s, null);
    expect(html.match(/class="jump"/g)).toHaveLength(1);
    expect(html).toContain(esc(t('jumpTitle', '30,0', '2025', '11,3', '2026', '18,7')));
    expect(listHtml(asker(), null)).not.toContain('class="jump"');
  });
  it('the level chip is marked .tipped in the string, not by the script', () => {
    // bindTips() marks it on the same condition after the render; the build has
    // no script, so the prerendered page must carry the mark itself
    expect(listHtml(asker(), null)).toContain('class="lv tipped"');
  });
  it('the lens narrows the hero and the list the same way it does on screen', () => {
    const s = asker();
    S.mapCat = 'ST'; openSide(s);
    expect(rendered('s-hero')).toBe(norm(heroHtml(s, 'ST').hero));
    expect(rendered('s-list')).toBe(norm(listHtml(s, 'ST')));
  });
});

describe('a county held out of the model', () => {
  it('says on every Telemark school that its figures are not comparable', () => {
    loadFixtures();
    const html = notesHtml({ name: 'Skien videregående skole', fylke: 'Telemark', programs: [] } as any);
    expect(html).toContain(esc(t('heldOutNote', 'Telemark')));
    const other = notesHtml({ name: 'Asker', fylke: 'Akershus', programs: [] } as any);
    expect(other).not.toContain('ikke sammenlignes');
    expect(other).not.toContain('cannot be compared');
  });
  it('names the county that published a moved school’s years, Nordland’s supplement and a register renaming', () => {
    loadFixtures();
    S.DATA = { ...DATA, counties: [...DATA.counties, { fylke: 'Nordland', supplement_years: ['2013', '2014', '2015'] }] };
    const hs = (values: any) => ({ program: 'Helse- og oppvekstfag', level: 'Vg1', category: 'HS', values, former_names: ['Helse- og sosialfag'] });
    const royken: any = { name: 'Røyken', fylke: 'Akershus', former_county: { Buskerud: ['2012', '2013', '2014'] },
                          programs: [hs({ 2012: 30.1, 2025: 38.2 })] };
    const html = notesHtml(royken);
    expect(html).toContain(esc(t('formerCountyNote', '2012–2014', 'Buskerud')));
    expect(html).toContain(esc(t('formerNameNote', 'Helse- og oppvekstfag', 'Helse- og sosialfag')));
    const bodo: any = { name: 'Bodø videregående skole', fylke: 'Nordland', programs: [{ ...hs({ 2013: 31.0, 2021: 33.4 }), former_names: undefined }] };
    const nb = notesHtml(bodo);
    expect(nb).toContain(esc(t('supplementNote', '2013')));
    expect(nb).not.toContain(esc(t('formerNameNote', 'Helse- og oppvekstfag', 'Helse- og sosialfag')));
    expect(notesHtml({ name: 'Asker', fylke: 'Akershus', programs: [] } as any)).not.toContain('fylkeskommune');
    S.DATA = DATA;
  });
  it('a 0 in a lowest-admitted year is the figure 0,0, not «Fullt»; elsewhere it stays «Fullt»', () => {
    loadFixtures(); initHelpers();
    S.DATA = { ...DATA, counties: [...DATA.counties, { fylke: 'Nordland', lowest_admitted_years: ['2019', '2020', '2021'] }] };
    const prog = (values: any) => [{ program: 'Restaurant- og matfag', level: 'Vg1', category: 'RM', values }];
    const bodo: any = { name: 'Bodø videregående skole', fylke: 'Nordland', programs: prog({ 2020: 24.1, 2021: 0 }) };
    const row = listHtml(bodo, null);
    expect(row).toContain(`0,0<small>2021</small>`);
    expect(row).not.toContain(t('noPointsShort'));
    // all the scope has is that 0: the hero prints it, not «Fullt – siste inntatte uten poeng»
    const only: any = { ...bodo, programs: prog({ 2021: 0 }) };
    expect(heroHtml(only, null).hero).toContain('>0,0<');
    expect(heroHtml(only, null).hero).not.toContain(t('noPoints'));
    const asker0: any = { name: 'Asker', fylke: 'Akershus', programs: prog({ 2024: 30.2, 2025: 0 }) };
    expect(listHtml(asker0, null)).toContain(t('noPointsShort'));
    S.DATA = DATA;
  });
  it('never claims how many Telemark programmes filled: no filled count, no size from it', () => {
    loadFixtures();
    const yr = DATA.years[DATA.years.length - 1];
    const progs = [{ program: 'Elektro', level: 'Vg1', category: 'EL', values: { [yr]: 12.8 } },
                   { program: 'Helse', level: 'Vg1', category: 'HO', values: { [yr]: 38.1 } }];
    const tm: any = schoolPressure({ name: 'Skien', fylke: 'Telemark', programs: progs } as any, 'all');
    expect(tm.kind).toBe('points');
    expect(tm.filled).toBeNull();
    expect(tm.share).toBeNull();
    const ak: any = schoolPressure({ name: 'Asker', fylke: 'Akershus', programs: progs } as any, 'all');
    expect(ak.filled).toBe(2);
    expect(ak.share).toBe(1);
  });
});

describe('the programme list in English', () => {
  it('groups the rows exactly as the Norwegian sheet does: a lone row named after its programme stands without a heading', () => {
    loadFixtures(); initHelpers();
    const heads = (html: string) => (html.match(/class="cat-head"/g) || []).length;
    let solo = 0;
    for (const s of DATA.schools) {
      S.lang = 'no'; const no = listHtml(s, null);
      S.lang = 'en'; const en = listHtml(s, null);
      expect(heads(en), s.name).toBe(heads(no));
      if (!heads(no)) solo++;
    }
    S.lang = 'no';
    expect(solo).toBeGreaterThan(0);        // the case exists in the dataset
  });
});

describe('the chance explains itself', () => {
  it('every chance chip has the forecast it is measured against beside it', () => {
    S.myPoints = 43;
    const s = asker();
    const html = listHtml(s, null);
    const d = document.createElement('div'); d.innerHTML = html;
    const rows = [...d.querySelectorAll('.prow')].filter(r => r.querySelector('.ch:not(.none)'));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.querySelector('.fc')!.textContent).toMatch(/^Forventet poenggrense \d{4}.*: ca\. \d+,\d ± \d+,\d/);
    S.myPoints = null;
  });
  it('the hero names one programme area’s figure a poenggrense, several an average with its range', () => {
    const s = asker();
    const { hero } = heroHtml(s, null);
    expect(hero).toMatch(/Snitt av grensene \d+,\d–\d+,\d|Poenggrense/);
    expect(hero).not.toMatch(/>Snitt ·/);
  });
});
