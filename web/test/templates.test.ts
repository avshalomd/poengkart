import { describe, it, expect, beforeEach } from 'vitest';
import { S } from '../src/state';
import { loadFixtures, DATA, asker, forde } from './fixtures';
import { stubMap } from './mapstub';
import { initHelpers } from '../src/helpers';
import { openSide } from '../src/sidebar';
import { photoHtml, metaHtml, notesHtml, heroHtml, srcNoteHtml, listHtml } from '../src/templates';

// The DOM the client renders must be the DOM the build prerendered: same
// strings, so nothing moves when the script takes over a school page.
const norm = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.innerHTML; };
// …a container as the template left it. Two things the client does AFTER it
// assigns the string, which no string can carry: Leaflet builds the location
// map inside the empty #s-minimap, and bindTips() marks every level chip
// .tipped. Undo exactly those two; any other difference is a drifted template.
const rendered = (id: string) => {
  const d = document.createElement('div');
  d.innerHTML = document.getElementById(id)!.innerHTML;
  d.querySelectorAll('.lv').forEach(e => e.setAttribute('class', 'lv'));
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
  it('the lens narrows the hero and the list the same way it does on screen', () => {
    const s = asker();
    S.mapCat = 'ST'; openSide(s);
    expect(rendered('s-hero')).toBe(norm(heroHtml(s, 'ST').hero));
    expect(rendered('s-list')).toBe(norm(listHtml(s, 'ST')));
  });
});
