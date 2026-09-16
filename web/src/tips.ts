import { esc } from "./helpers";
import { t } from "./i18n";

/* ================= tooltips =================
   "Vg1" is second nature inside the school system and opaque outside it, which
   covers most of the people this map is for. Hover explains it on a pointer;
   tap explains it on a touch screen without also selecting the programme row
   the chip sits inside. */
export function showTip(el, html) {
  const tip = document.getElementById('tip');
  tip!.hidden = false;
  tip!.innerHTML = html;
  const r = el.getBoundingClientRect();
  const w = tip!.offsetWidth, h = tip!.offsetHeight;
  let x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
  let y = r.top - h - 8;
  if (y < 8) y = r.bottom + 8;                 // flip below rather than clip
  tip!.style.left = x + 'px';
  tip!.style.top = y + 'px';
  tip!.classList.add('on');
}

export function hideTip() {
  const tip = document.getElementById('tip');
  tip!.classList.remove('on');
  tip!.hidden = true;
}

export function bindTips(root) {
  const attach = (el, html) => {
    el.onmouseenter = () => showTip(el, html);
    el.onmouseleave = hideTip;
    el.addEventListener('touchstart', ev => {
      ev.preventDefault(); ev.stopPropagation();   // do not select the row
      showTip(el, html);
      clearTimeout((showTip as any).timer);
      (showTip as any).timer = setTimeout(hideTip, 4500);
    }, { passive: false });
  };
  // The row's chips carry data-tip rather than a title, and get the same touch
  // handling as the chance chip. Their text reaches a screen reader as the
  // name button's description: an aria-label on a plain span is not read.
  root.querySelectorAll('.ch[data-tip], .soft[data-tip]').forEach(el => attach(el, esc(el.dataset.tip)));
  bindTitleTips(root);
  root.querySelectorAll('.lv').forEach(el => {
    const key = el.textContent.trim();
    const entry = t('levels')[key];
    if (!entry) return;
    el.classList.add('tipped');
    const html = `<b>${esc(entry[0])}</b><br>${esc(entry[1])}`;
    el.onmouseenter = () => showTip(el, html);
    el.onmouseleave = hideTip;
    el.addEventListener('touchstart', ev => {
      ev.preventDefault(); ev.stopPropagation();   // do not select the row
      showTip(el, html);
      clearTimeout((showTip as any).timer);
      (showTip as any).timer = setTimeout(hideTip, 4500);
    }, { passive: false });
  });
}

// A title attribute is invisible on a phone: no hover, no long-press, and a
// tap on an \u24d8 fell through to whatever sat underneath. Touch gets the
// same text in the app's own tooltip. Interactive elements are skipped — a
// tap on them must keep doing what it says, and their titles are redundant.
export function bindTitleTips(root) {
  root.querySelectorAll('[title]').forEach(el => {
    if (el.closest('a, button, select, input, .pick, .who') || el.classList.contains('nm')) return;
    const txt = el.getAttribute('title');
    if (!txt) return;
    el.addEventListener('touchstart', ev => {
      // The guard above walks UPWARDS, so it clears an element sitting inside a
      // control but not one wrapped AROUND it — a <th> holding its own sort
      // button, a value chip inside a clickable row. For those, preventDefault
      // cancels the click the browser was about to synthesise, and the tap does
      // nothing at all: on a phone the list could not be sorted by Snitt,
      // Endring or Sjanse, while Skole and Fylke (which carry no title, so no
      // shim) sorted fine. Explain the element, but never swallow its action.
      if (!el.querySelector('a, button, select, input') && !el.closest('tr[data-i]')) {
        ev.preventDefault(); ev.stopPropagation();
      }
      showTip(el, esc(txt));
      clearTimeout((showTip as any).timer);
      (showTip as any).timer = setTimeout(hideTip, 4500);
    }, { passive: false });
  });
}

export function initTips() {
}
