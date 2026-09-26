import { describe, it, expect } from 'vitest';
import { loadFixtures } from './fixtures';
import { stubMap } from './mapstub';
import {
  renderIntro, openIntro, closeIntro, hintHelp, clearHelpHint, HINT_KEY, HINT_TRIES, INTRO_SEEN,
  showSheet, hideSheet, isSheetOpen, anySheetOpen, setModalTrap, renderControls, SHEET_IDS,
} from '../src/intro';
import { initHelpers, shownCounties, shownSchools } from '../src/helpers';
import { t } from '../src/i18n';
import { S } from '../src/state';

describe('the help sheet', () => {
  it('renders the dataset’s own scope, one block per step, and the colophon', () => {
    loadFixtures(); initHelpers();
    renderIntro();
    expect(document.getElementById('intro-h')!.textContent).toBe(t('introTitle'));
    const body = document.getElementById('intro-body')!;
    expect(body.querySelectorAll('.step').length).toBe(t('introSteps').length);
    expect(body.querySelector('.lede')!.textContent)
      .toContain(t('introScope', shownSchools().length, shownCounties().length,
                   S.DATA!.years[0], S.DATA!.years[S.DATA!.years.length - 1]));
    // the colour key draws one dot per t('introKeys') entry, plus the
    // "no points" swatch renderIntro adds from t('noPointsShort')
    expect(body.querySelectorAll('.keyrow .key').length).toBe(t('introKeys').length + 1);
    // root-absolute: on /oslo/ullern-videregaende-skole a relative link asked for /oslo/data/… (404)
    expect(body.querySelector('a[href="/data/schools.json"]')).toBeTruthy();
    expect(body.querySelector('a[href="/report"]')).toBeTruthy();
    expect(document.getElementById('intro-x')!.getAttribute('aria-label')).toBe(t('close'));
  });

  it('opening takes the page out of the tab order, closing puts it back and records the visit', () => {
    loadFixtures(); initHelpers(); stubMap();
    const intro = document.getElementById('intro')!;
    expect(isSheetOpen(intro)).toBe(false);
    openIntro();
    expect(isSheetOpen(intro)).toBe(true);
    expect(anySheetOpen()).toBe(true);
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(true);
    expect(document.getElementById('legend')!.hasAttribute('inert')).toBe(true);
    closeIntro(true);
    expect(isSheetOpen(intro)).toBe(false);
    expect(anySheetOpen()).toBe(false);
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(false);
    expect(localStorage.getItem(INTRO_SEEN)).toBe('1');
  });

  it('the hint on the help button gives up after three visits, and an opened sheet retires it', () => {
    loadFixtures(); initHelpers();
    const btn = document.getElementById('help-btn')!;
    for (let i = 1; i <= HINT_TRIES; i++) {
      hintHelp();
      expect(localStorage.getItem(HINT_KEY)).toBe(String(i));
      expect(btn.classList.contains('hint')).toBe(true);
      btn.classList.remove('hint');
    }
    hintHelp();
    expect(btn.classList.contains('hint')).toBe(false);
    expect(localStorage.getItem(HINT_KEY)).toBe(String(HINT_TRIES));
    localStorage.setItem(HINT_KEY, '0');
    hintHelp();
    clearHelpHint();
    expect(btn.classList.contains('hint')).toBe(false);
    expect(localStorage.getItem(HINT_KEY)).toBe(String(HINT_TRIES));
  });

  it('a sheet on its way out is no longer open, and asking for it again cancels the exit', () => {
    loadFixtures(); initHelpers();
    const el = document.getElementById('settings')!;
    showSheet('settings');
    expect(isSheetOpen(el)).toBe(true);
    hideSheet('settings');
    expect(el.classList.contains('closing')).toBe(true);
    expect(isSheetOpen(el)).toBe(false);          // still painted, no longer the thing you talk to
    showSheet('settings');
    expect(el.classList.contains('closing')).toBe(false);
    expect(isSheetOpen(el)).toBe(true);
    hideSheet('settings');
    setModalTrap();
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(false);
    // every sheet the trap knows about is in the markup
    expect(SHEET_IDS.every(id => document.getElementById(id))).toBe(true);
  });

  it('renderControls names the four icon buttons and the sheet itself', () => {
    loadFixtures(); initHelpers();
    renderControls();
    expect(document.getElementById('help-btn')!.getAttribute('aria-label')).toBe(t('helpLabel'));
    expect(document.getElementById('bug-btn')!.title).toBe(t('bugLabel'));
    expect(document.getElementById('settings-btn')!.getAttribute('aria-label')).toBe(t('settingsLabel'));
    expect(document.getElementById('searchov-btn')!.title).toBe(t('searchLabel'));
    expect(document.getElementById('side')!.getAttribute('aria-label')).toBe(t('sideLabel'));
  });
});
