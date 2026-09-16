import { describe, it, expect, vi } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { showTip, hideTip, bindTips, bindTitleTips } from '../src/tips';
import { openSide } from '../src/sidebar';
import { initHelpers, shownPrograms } from '../src/helpers';
import { initListview, renderListView } from '../src/listview';
import { t } from '../src/i18n';
import { S } from '../src/state';

const tip = () => document.getElementById('tip')!;

describe('tooltips', () => {
  it('a tip is placed over the element and taken away again', () => {
    loadFixtures(); initHelpers();
    const el = document.getElementById('panel-sum')!;
    showTip(el, '<b>Vg1</b><br>Første året');
    expect(tip().hidden).toBe(false);
    expect(tip().classList.contains('on')).toBe(true);
    expect(tip().innerHTML).toContain('Vg1');
    expect(tip().style.left).toMatch(/px$/);
    expect(tip().style.top).toMatch(/px$/);
    hideTip();
    expect(tip().hidden).toBe(true);
    expect(tip().classList.contains('on')).toBe(false);
  });

  it('a row’s level chip explains itself on hover and on touch', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    openSide(DATA.schools.find((s: any) => shownPrograms(s).length > 1));
    const lv = document.querySelector('#s-list .prow .lv') as any;
    expect(lv.classList.contains('tipped')).toBe(true);
    lv.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip().hidden).toBe(false);
    expect(tip().textContent).toContain(t('levels')[lv.textContent.trim()][0]);
    lv.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip().hidden).toBe(true);
    // touch gets whatever hover gets, and the tip gives up after a while
    lv.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    expect(tip().hidden).toBe(false);
    vi.advanceTimersByTime(4500);
    expect(tip().hidden).toBe(true);
  });

  it('a data-tip chip is bound the same way', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const host = document.createElement('div');
    host.innerHTML = '<span class="soft" data-tip="Fortrinnsrett forklart">Fortrinnsrett</span>';
    document.body.appendChild(host);
    bindTips(host);
    const chip = host.querySelector('.soft') as any;
    chip.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip().textContent).toBe('Fortrinnsrett forklart');
    chip.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip().hidden).toBe(true);
  });

  it('a title on a plain element reaches touch, and one on a control is left alone', () => {
    loadFixtures(); initHelpers();
    const host = document.createElement('div');
    host.innerHTML = '<span id="plain" title="Et inntak">1. inntak</span>' +
                     '<button id="ctl" title="Knapp">Trykk</button>' +
                     '<span id="empty" title="">tom</span>';
    document.body.appendChild(host);
    bindTitleTips(host);
    const ev = () => new Event('touchstart', { bubbles: true, cancelable: true });
    document.getElementById('plain')!.dispatchEvent(ev());
    expect(tip().hidden).toBe(false);
    expect(tip().textContent).toBe('Et inntak');
    hideTip();
    // a button keeps doing what it says: no tooltip shim on it
    document.getElementById('ctl')!.dispatchEvent(ev());
    expect(tip().hidden).toBe(true);
    document.getElementById('empty')!.dispatchEvent(ev());
    expect(tip().hidden).toBe(true);
  });

  it('a sort header explains itself without swallowing the tap that sorts', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    S.view = 'list';
    renderListView();
    const th = document.querySelector('#listview th.col-value') as any;
    const touch = new Event('touchstart', { bubbles: true, cancelable: true });
    th.dispatchEvent(touch);
    expect(tip().hidden).toBe(false);
    // the th wraps its own sort button, so the tap must stay live
    expect(touch.defaultPrevented).toBe(false);
  });
});
