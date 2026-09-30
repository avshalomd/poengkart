import { describe, it, expect, beforeEach } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import {
  toggleChoice, renderChoices, resolveChoice, okChoice, progKeyMap, isChosen,
  initChance, onPoints, onPointsInput, submitPoints, ptsAct, ptsActDown, renderPointsField, refocus,
} from '../src/chance';
import { initHelpers, shownPrograms, fmt } from '../src/helpers';
import { initListview } from '../src/listview';
import { t } from '../src/i18n';
import { S } from '../src/state';

// ten schools that all run the same utdanningsprogram at Vg1, so the wish list
// fills up against vigo's ten-wish cap rather than its three-programme one
const withCat = (cat: string) => DATA.schools
  .map((s: any) => ({ s, p: shownPrograms(s).find((q: any) => q.level === 'Vg1' && q.category === cat) }))
  .filter((x: any) => x.p);

describe('the wish list', () => {
  beforeEach(() => { S.choices = []; S.choicesNote = null; S.current = null; S.myPoints = null; });

  it('a wish is stored under the school, county and programme key, and shows as a row', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const { s, p } = withCat('ST')[0];
    toggleChoice(s, p);
    expect(S.choices).toEqual([{ f: s.fylke, s: s.name, k: progKeyMap(s).get(p) }]);
    expect(JSON.parse(localStorage.getItem('pk-choices')!)).toEqual(S.choices);
    expect(isChosen(s, p)).toBe(true);
    const box = document.getElementById('choices')!;
    expect(box.hidden).toBe(false);
    expect(box.querySelectorAll('.list .row').length).toBe(1);
    expect(box.querySelector('.row .sc')!.textContent).toBe(s.name);
    expect(box.querySelector('.h span')!.textContent).toBe(t('choicesHead', 1));
    toggleChoice(s, p);
    expect(S.choices).toEqual([]);
    expect(box.hidden).toBe(true);
  });

  it('vigo’s ten-wish cap refuses the eleventh and says why', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const pool = withCat('ST');
    expect(pool.length).toBeGreaterThan(10);
    for (let i = 0; i < 10; i++) toggleChoice(pool[i].s, pool[i].p);
    expect(S.choices.length).toBe(10);
    expect(S.choicesNote).toBeNull();
    toggleChoice(pool[10].s, pool[10].p);
    expect(S.choices.length).toBe(10);                       // refused
    expect(S.choicesNote).toBe('vigoMaxWishes');
    expect(document.querySelector('#choices .vnote')!.textContent).toContain(t('vigoMaxWishes'));
    expect(document.querySelectorAll('#choices .list .row').length).toBe(10);
  });

  it('a Vg1 application names at most three utdanningsprogram', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const cats = ['ST', 'HS', 'EL', 'BA'].map(c => withCat(c)[0]);
    expect(cats.every(Boolean)).toBe(true);
    for (const { s, p } of cats.slice(0, 3)) toggleChoice(s, p);
    expect(S.choices.length).toBe(3);
    toggleChoice(cats[3].s, cats[3].p);
    expect(S.choices.length).toBe(3);
    expect(S.choicesNote).toBe('vigoMaxProgs');
    // the refusal also appears where the tap happened, for a phone whose
    // choices box is behind the open sheet
    expect(document.getElementById('pick-note')!.textContent).toContain(t('vigoMaxProgs'));
  });

  it('the refusal note follows a language switch', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const cats = ['ST', 'HS', 'EL', 'BA'].map(c => withCat(c)[0]);
    const was = S.lang;
    S.lang = 'no';
    for (const { s, p } of cats) toggleChoice(s, p);
    expect(document.querySelector('#choices .vnote')!.textContent).toContain(t('vigoMaxProgs'));
    S.lang = 'en'; renderChoices();
    expect(document.querySelector('#choices .vnote')!.textContent).toContain('at most three different education programmes');
    S.lang = was;
  });

  it('with points entered every wish carries its chance and the list carries the summary', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const pool = withCat('ST').filter(({ s, p }: any) => S.MODEL!.schools[`${s.fylke}|${s.name}`]?.programs);
    for (const { s, p } of pool.slice(0, 3)) toggleChoice(s, p);
    onPoints('4,5');
    expect(S.myPoints).toBe(45);
    expect(localStorage.getItem('pk-points')).toBe('45');
    const box = document.getElementById('choices')!;
    expect(box.querySelectorAll('.list .row').length).toBe(3);
    expect(box.querySelectorAll('.list .row .ch').length).toBe(3);
    const sum = box.querySelector('.sum')!.textContent!;
    expect(sum).toMatch(/%/);
    expect(box.querySelectorAll('.bar span').length).toBe(3);
  });

  it('Tøm asks once before it empties the list', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const pool = withCat('ST');
    toggleChoice(pool[0].s, pool[0].p);
    toggleChoice(pool[1].s, pool[1].p);
    const clr = () => document.getElementById('choices-clear') as any;
    expect(clr().textContent).toBe(t('choicesClear'));
    clr().click();
    expect(clr().textContent).toBe(t('choicesClearSure'));
    expect(S.choices.length).toBe(2);
    clr().click();
    expect(S.choices).toEqual([]);
    expect(localStorage.getItem('pk-choices')).toBeNull();
  });

  it('the ✕ on a row removes that wish', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const pool = withCat('ST');
    toggleChoice(pool[0].s, pool[0].p);
    toggleChoice(pool[1].s, pool[1].p);
    (document.querySelector('#choices .row .rm') as any).click();
    expect(S.choices.length).toBe(1);
    expect(document.querySelectorAll('#choices .list .row').length).toBe(1);
  });

  it('a stored wish that no longer resolves is pruned, and a re-labelled one is re-keyed', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const { s, p } = withCat('ST')[0];
    const key = progKeyMap(s).get(p);
    expect(okChoice({ f: s.fylke, s: s.name, k: key })).toBe(true);
    expect(okChoice({ f: s.fylke, s: s.name })).toBe(false);
    expect(okChoice(null)).toBeFalsy();
    expect(resolveChoice({ f: s.fylke, s: s.name, k: key })!.p).toBe(p);
    expect(resolveChoice({ f: s.fylke, s: 'Ingen skole', k: key })).toBeNull();
    // the same programme at another occurrence index still resolves, by name
    const moved = { f: s.fylke, s: s.name, k: `${p.program.toLowerCase()}|${p.level}|7` };
    expect(resolveChoice(moved)!.p).toBe(p);
    expect(moved.k).toBe(key);                               // re-keyed in place
    S.choices = [{ f: s.fylke, s: 'Ingen skole', k: key }, { f: s.fylke, s: s.name, k: key }];
    renderChoices();
    expect(S.choices).toEqual([{ f: s.fylke, s: s.name, k: key }]);
  });

  it('a wish saved under a school’s former spelling follows the school to its new one', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    // «St.Olav» became «St. Olav» on 22 Sept 2026; the address did not move
    const s = DATA.schools.find((x: any) => x.fylke === 'Rogaland' && x.name.startsWith('St. Olav'))!;
    const p = shownPrograms(s)[0], k = progKeyMap(s).get(p);
    const old = { f: s.fylke, s: s.name.replace('St. ', 'St.'), k };
    expect(resolveChoice(old)!.s).toBe(s);
    expect(old.s).toBe(s.name);                              // re-keyed in place
    S.choices = [{ ...old, s: s.name.replace('St. ', 'St.') }];
    renderChoices();
    expect(S.choices).toEqual([{ f: s.fylke, s: s.name, k }]);
    // a different school in the same county is not a respelling
    expect(resolveChoice({ f: s.fylke, s: 'St. Olavs', k })).toBeNull();
  });

  it('initChance keeps only well-formed wishes out of storage', () => {
    localStorage.setItem('pk-choices', JSON.stringify([{ f: 'Oslo', s: 'Blindern', k: 'a|Vg1|0' }, null, 42, {}]));
    initChance();
    expect(S.choices).toEqual([{ f: 'Oslo', s: 'Blindern', k: 'a|Vg1|0' }]);
    localStorage.setItem('pk-choices', '{}');
    initChance();
    expect(S.choices).toEqual([]);
    localStorage.setItem('pk-choices', 'not json');
    initChance();
    expect(S.choices).toEqual([]);
  });

  it('the field takes a grade average, keeps it as karakterpoeng and says what it stands for', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    renderPointsField();
    const inp = document.getElementById('my-points') as HTMLInputElement;
    const act = document.getElementById('pts-act')!, note = document.getElementById('pts-note')!;
    expect(document.getElementById('pts-field')!.hidden).toBe(false);
    expect(document.getElementById('pts-label')!.textContent).toBe(t('ptsLabel'));
    expect(act.hidden).toBe(true);
    onPoints('4,25');
    expect(S.myPoints).toBe(42.5);
    expect(localStorage.getItem('pk-points')).toBe('42.5');
    expect(inp.value).toBe('4,25');
    expect(note.textContent).toBe(t('ptsBridge', '4,25', fmt(42.5)));
    expect(note.classList.contains('bad')).toBe(false);
    expect(act.hidden).toBe(false);
    expect(act.getAttribute('aria-label')).toBe(t('ptsClear'));
    onPoints('');
    expect(S.myPoints).toBeNull();
    expect(localStorage.getItem('pk-points')).toBeNull();
    expect(note.hidden).toBe(true);
    expect(act.hidden).toBe(true);
  });

  it('nothing happens while an average is typed; the ✓, Enter or leaving the field submits it', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    onPoints('');
    const inp = document.getElementById('my-points') as HTMLInputElement;
    const act = document.getElementById('pts-act')!, note = document.getElementById('pts-note')!;
    inp.focus();
    for (const typed of ['3', '30', '30,', '30,2']) {        // «30,2» on the way to nothing good
      inp.value = typed; onPointsInput(typed);
      expect(S.myPoints).toBeNull();
      expect(note.hidden).toBe(true);
      expect(inp.getAttribute('aria-invalid')).toBe('false');
      expect(act.classList.contains('go')).toBe(true);
      expect(act.getAttribute('aria-label')).toBe(t('ptsGo'));
    }
    submitPoints();
    // asked, never corrected: the entry stands, and nothing is coloured by it
    expect(S.myPoints).toBeNull();
    expect(inp.value).toBe('30,2');
    expect(inp.getAttribute('aria-invalid')).toBe('true');
    expect(note.textContent).toBe(`${t('ptsNotAvg', '30,2')} ${t('ptsMeant', '3,02')}`);
    expect(act.classList.contains('go')).toBe(false);
    (note.querySelector('.lnk') as HTMLElement).click();
    expect(S.myPoints).toBe(30.2);
    expect(inp.value).toBe('3,02');
    expect(inp.getAttribute('aria-invalid')).toBe('false');
    // a hundred times too big is asked about the same way; anything else gets the rule
    onPoints('425');
    expect(note.textContent).toContain(t('ptsMeant', '4,25'));
    for (const v of ['7,5', '0,4', '999', 'x', '6,004']) {
      onPoints(v);
      expect(S.myPoints).toBeNull();
      expect(note.textContent).toBe(t('ptsBad'));
    }
    // typing again takes the note out of sight but keeps its box, so nothing
    // under the field jumps; emptying the field clears at once
    inp.value = '4'; onPointsInput('4');
    expect(note.classList.contains('held')).toBe(true);
    expect(note.hidden).toBe(false);
    submitPoints();
    expect(note.classList.contains('held')).toBe(false);
    expect(note.textContent).toBe(t('ptsBridge', '4,0', fmt(40)));
    inp.value = '4,'; onPointsInput('4,');
    expect(note.classList.contains('held')).toBe(true);
    inp.value = ''; onPointsInput('');
    expect(note.classList.contains('held')).toBe(false);
    expect(note.hidden).toBe(true);
    expect(act.hidden).toBe(true);
  });

  it('the one button is ✓ or ✕ by what it was when the pointer went down', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    onPoints('');
    const inp = document.getElementById('my-points') as HTMLInputElement;
    inp.focus(); inp.value = '4,5'; onPointsInput('4,5');
    // a mouse press on ✓ blurs the field first, which submits and turns the
    // button into ✕ before the click arrives: that click must not clear
    ptsActDown();
    submitPoints();
    ptsAct({ detail: 1 }, '#my-points');
    expect(S.myPoints).toBe(45);
    // pressed as ✕, it clears
    ptsActDown();
    ptsAct({ detail: 1 }, '#my-points');
    expect(S.myPoints).toBeNull();
    // from the keyboard there is no gap: the button does what it says now
    inp.value = '5'; onPointsInput('5');
    ptsAct({ detail: 0 }, '#my-points');
    expect(S.myPoints).toBe(50);
    ptsAct({ detail: 0 }, '#my-points');
    expect(S.myPoints).toBeNull();
  });

  it('refocus lands on the first successor that is still on screen', () => {
    loadFixtures(); initHelpers();
    const btn = document.getElementById('panel-sum') as any;
    btn.focus();
    refocus('#map-cat');
    expect(document.activeElement).toBe(btn);                 // a live focus is left alone
    (document.activeElement as any).blur();
    refocus('#nothing-here', '#panel');
    expect(document.activeElement!.id).toBe('panel');
  });
});
