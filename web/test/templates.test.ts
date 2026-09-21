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
