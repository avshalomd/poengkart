import { describe, it, expect, vi } from 'vitest';
import { loadFixtures, asker, forde } from './fixtures';
import { stubMap } from './mapstub';
import { openSide, closeSide, renderSide, renderChance, listLayout, phoneSheet, sheetFull, widenFor, applyUrlFilters } from '../src/sidebar';
import { buildUrl } from '../src/router';
import { schoolChance } from '../src/chance';
import { capFirst, meanStep, photoSrc, schoolTitle, shownPrograms, visibleIn, fmt } from '../src/helpers';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { t } from '../src/i18n';
import { S } from '../src/state';

describe('the school sheet', () => {
  it('opens with the name, the hero figure that equals the mean the chart and the dot use, and a row per programme', () => {
    loadFixtures(); initHelpers(); stubMap();
    const s = forde();
    openSide(s);
    expect(document.getElementById('side')!.classList.contains('open')).toBe(true);
    expect(document.querySelector('#s-photo .name')!.textContent).toContain('Førde');
    // The hero's own definition (renderSide): meanStep() over the programmes
    // the list shows, i.e. the mean of the newest COMMON year — not each
    // programme's own newest figure, which is what the chart's last point and
    // the map dot would disagree with.
    const shown = shownPrograms(s);
    const { mean } = meanStep(shown);
    expect(mean).not.toBeNull();
    const hero = document.getElementById('s-hero')!.textContent!;
    expect(hero).toContain(fmt(mean));
    // and the second cell counts the rows printed underneath
    expect(hero).toContain(String(visibleIn(shown)));
    expect(document.querySelectorAll('#s-list .prow').length).toBe(visibleIn(shown));
  });
  it('closes and clears the selection', () => {
    loadFixtures(); initHelpers(); stubMap(); openSide(asker()); closeSide(true);
    expect(document.getElementById('side')!.classList.contains('open')).toBe(false);
    expect(S.current).toBeNull();
  });
  // the first open pushes the address itself and never reaches setUrlSchool,
  // so the tab title has to be written on that branch too
  it('puts the open school in the tab title, and the app’s own title back', () => {
    loadFixtures(); initHelpers(); stubMap();
    history.replaceState(null, '', '/');          // no pkSide: openSide pushes
    openSide(asker());
    expect(document.title).toBe(schoolTitle(asker()));
    closeSide(true);
    expect(document.title).toBe(t('pageTitle'));
  });
  // A school the address named at boot is the page the reader arrived on: it
  // pushes nothing over the landing entry (one Back leaves, as from any page),
  // its ✕ closes in place, and focus stays where a page load leaves it.
  it('a school opened at boot keeps the landing entry, closes in place and leaves focus alone', () => {
    loadFixtures(); initHelpers(); stubMap();
    history.replaceState(null, '', '/akershus/asker');
    const pushes = vi.spyOn(history, 'pushState');
    const backs = vi.spyOn(history, 'back');
    openSide(asker(), true);
    expect(pushes).not.toHaveBeenCalled();
    expect(history.state).toMatchObject({ pkSide: 1, pkLanding: 1 });
    expect(document.title).toBe(schoolTitle(asker()));
    vi.advanceTimersByTime(100);                   // past the deferred focus a reader's open makes
    expect(document.activeElement).toBe(document.body);
    closeSide();                                   // the ✕: no history.back(), the sheet just closes
    expect(backs).not.toHaveBeenCalled();
    expect(document.getElementById('side')!.classList.contains('open')).toBe(false);
    expect(location.pathname).toBe('/');
    expect(history.state).toBeNull();               // the flags are gone: the next open pushes again
    expect(document.title).toBe(t('pageTitle'));
    pushes.mockRestore(); backs.mockRestore();
  });
  // a school opened by the reader still gets its own entry and moves focus in
  it('a school opened inside the app pushes its entry and focuses the close button', () => {
    loadFixtures(); initHelpers(); stubMap();
    history.replaceState(null, '', '/');
    const pushes = vi.spyOn(history, 'pushState');
    openSide(asker());
    expect(pushes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    // Lukk, not «Meld feil på denne skolen»: the bug button precedes it and shares the class
    expect(document.activeElement).toBe(document.querySelector('#s-photo .close:not(.bug)'));
    expect(document.activeElement!.getAttribute('onclick')).toBe('closeSide()');
    pushes.mockRestore();
    closeSide(true);
  });
  it('the chance block asks for points when there are none and counts the programmes in reach when there are', () => {
    loadFixtures(); initHelpers(); stubMap(); openSide(asker());
    expect(document.getElementById('s-chance')!.textContent).toMatch(/poeng/i);
    S.myPoints = 45; renderChance(asker(), 'all');   // renderChance(s, lensCat): the lens is not optional
    const ch = schoolChance(asker(), 'all', 45)!;
    expect(ch).toBeTruthy();
    const box = document.getElementById('s-chance')!;
    // renderChance picks one of three heads by which band has anything in it
    const noPred = Math.max(0, ch.total - ch.n);
    const head = ch.likely ? t('chanceHeadL', fmt(45), ch.likely, ch.n, noPred, ch.total)
               : ch.possible ? t('chanceHeadR', fmt(45), ch.possible, ch.n, noPred, ch.total)
               : t('chanceHeadU', fmt(45), ch.n, noPred, ch.total);
    expect(box.querySelector('.h')!.textContent).toBe(head);
    expect(box.textContent).toMatch(/%/);
    expect(box.querySelectorAll('.bar span').length).toBe(3);
  });
  it('renders in English when asked', () => {
    loadFixtures(); initHelpers(); stubMap(); S.lang = 'en'; openSide(asker());
    expect(document.getElementById('side')!.textContent).toMatch(/programme|Programme|admitted|threshold/i);
    expect(document.getElementById('s-hero')!.textContent).toContain('Average');
  });
  it('a school with no photo gets the location map instead, and the credit only with a photo', () => {
    loadFixtures(); initHelpers(); stubMap();
    const withPhoto = asker();
    expect(withPhoto.photo).toBeTruthy();
    openSide(withPhoto);
    // the header's own <img>, as a direct child: the minimap below sits in
    // #s-photo too, and draws a map of its own inside itself
    expect(document.querySelector('#s-photo > img')).toBeTruthy();
    expect(document.querySelector('#s-photo .credit')).toBeTruthy();
    const noPhoto = S.DATA!.schools.find((x: any) => !x.photo && x.lat);
    expect(noPhoto).toBeTruthy();
    openSide(noPhoto);
    expect(document.querySelector('#s-photo > img')).toBeNull();
    expect(document.querySelector('#s-photo .credit')).toBeNull();
    expect(document.getElementById('s-minimap')).toBeTruthy();
  });
  it('the meta line names the county and the intake round the dataset gives', () => {
    loadFixtures(); initHelpers(); stubMap();
    const s = asker();
    openSide(s);
    const meta = document.getElementById('s-meta')!.textContent!;
    expect(meta).toContain(s.fylke);
    expect(document.querySelector('#s-meta .round')).toBeTruthy();
  });
  it('widenFor drops a filter that hides the school the sheet is about', () => {
    loadFixtures(); initHelpers(); stubMap();
    S.mapFylke = 'Oslo';
    expect(widenFor(asker())).toBe(true);        // Asker is in Akershus
    expect(S.mapFylke).toBe('all');
    expect(widenFor(asker())).toBe(false);       // nothing left in the way
  });
  it('applyUrlFilters puts the county and programme named in the address on the controls', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    history.replaceState(null, '', '/?f=Oslo&c=ST');
    expect(applyUrlFilters(true)).toBe(true);
    expect(S.mapFylke).toBe('Oslo');
    expect(S.mapCat).toBe('ST');
    expect((document.getElementById('map-fylke') as HTMLSelectElement).value).toBe('Oslo');
    expect((document.getElementById('map-cat') as HTMLSelectElement).value).toBe('ST');
    expect(applyUrlFilters()).toBe(false);       // the second pass has nothing to move
    history.replaceState(null, '', '/');
  });
  // queryParts() has already decoded the query, so a value carrying a literal
  // «%» used to be handed to decodeURIComponent a second time, throw a URIError
  // inside the try, and silently drop every filter in the address.
  it('a stray percent in one filter does not drop the others', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    history.replaceState(null, '', '/?f=100%25&c=ST');
    expect(applyUrlFilters(true)).toBe(true);
    expect(S.mapCat).toBe('ST');
    expect(S.mapFylke).toBe('all');              // «100%» is no county we carry
    history.replaceState(null, '', '/');
  });
  it('buildUrl carries the school, the county and the programme it was taken under', () => {
    loadFixtures(); initHelpers();
    expect(buildUrl(null)).toBe('/');
    S.mapFylke = 'Akershus'; S.mapCat = 'ST';
    expect(buildUrl(asker())).toBe('/akershus/asker?f=Akershus&c=ST');
  });
  it('listLayout is the map view’s empty string and one of the three list layouts', () => {
    loadFixtures(); initHelpers();
    S.view = 'map';
    expect(listLayout()).toBe('');
    S.view = 'list';
    // happy-dom's window is 1024×768: below LIST_LAYOUT.n's 1068 two-column
    // point, so the thinnest of the three list layouts
    expect(listLayout()).toBe('thin');
    expect(document.body.classList.contains('lv-thin')).toBe(true);
    expect(document.body.classList.contains('lv-stack')).toBe(true);
    expect(phoneSheet()).toBe(false);            // wide enough not to be a phone
    expect(sheetFull()).toBe(true);              // but the sheet covers the thin list
    S.view = 'map';
    expect(sheetFull()).toBe(false);
  });
  it('capFirst and photoSrc are the small shapes the header depends on', () => {
    expect(capFirst('alle programområder')).toBe('Alle programområder');
    expect(photoSrc('https://x.example/p.jpg')).toBe('https://x.example/p.jpg');
  });
});
