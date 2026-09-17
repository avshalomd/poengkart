import { chartMode, esc } from "./helpers";
import { t } from "./i18n";
import { hideSheet, INTRO_SEEN, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { PREFS } from "./prefs";
import { S } from './state';

/* ================= feedback =================
   The form asks only what the chosen kind of report actually needs: a school
   name is meaningless on a feature suggestion, and a photo link is meaningless
   on a wrong figure. Everything is posted to /api/feedback, which relays it to
   e-mail — the destination address is held server side so it never appears in
   this page. */
export const FIELDS = {
  tall:     ['school', 'program', 'year'],
  bilde:    ['school', 'photo'],
  skole:    ['school', 'fylke'],
  feil:     [],
  funksjon: [],
  annet:    [],
};

/* ---- the bug report's snapshot ----
   A "something does not work" without the view, the filters and the browser
   is a message nobody can act on. The two bug buttons (the header's, for the
   app as a whole; the sheet's, for one school) take this snapshot at the
   moment they are pressed, the form lists it under «Dette sendes med», and the
   relay prints it under the message. What the reader saw is read from the
   rendered sheet, not recomputed, so the report shows the figures as they were
   on the screen. No picture: a screenshot is more than a bug report needs. */
// child nodes joined with a space: «49,1<small>2026</small>» reads 49,1 2026
export const text1 = el => [...el.childNodes].map(n => n.textContent.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
export function bugContext(school, from) {
  const lv = [...document.body.classList].find(c => /^lv-(wide|split|thin)$/.test(c));
  const ctx: any = {
    from, link: location.href,
    view: S.view + (lv ? ` (${lv.slice(3)})` : ''),
    fylke: S.mapFylke, program: S.mapCat, points: S.myPoints == null ? '' : String(S.myPoints),
    levels: S.allLevels ? 'Vg1–Vg3' : 'Vg1', history: S.showOld ? 'on' : 'off',
    choices: String(S.choices.length), lang: S.lang, font: PREFS.font, theme: PREFS.theme,
    cvd: PREFS.cvd ? 'on' : 'off',
    viewport: `${innerWidth}×${innerHeight} @${devicePixelRatio}`,
    ua: navigator.userAgent,
    data: `${S.DATA!.schools.length} skoler, ${S.DATA!.years[0]}–${S.DATA!.years[S.DATA!.years.length - 1]}`
          + (S.DATA_STAMP ? `, ${S.DATA_STAMP}` : ''),
  };
  if (!school && document.getElementById('side')!.classList.contains('open')) school = S.current;
  if (school) {
    ctx.school = `${school.name} (${school.fylke})`;
    ctx.chart = chartMode() + (S.chart.prog ? `: ${S.chart.prog}` : '');
    ctx.hero = [...document.querySelectorAll('#s-hero .cell')]
      .map(c => `${text1(c.querySelector('.v'))} ${text1(c.querySelector('.l'))}`).join(' · ');
    // the row as the reader saw it: name, chance, level, figure — not the
    // hidden description each row carries for screen readers
    ctx.rows = [...document.querySelectorAll('#s-list .prow')].map(r =>
      ['.nm', '.ch', '.lv', '.val'].map(q => r.querySelector(q)).filter(Boolean).map(text1).join(' · ')
    ).slice(0, 40);
  }
  return ctx;
}
export const CTX_LABELS = {
  from: 'Fra', link: 'Lenke', view: 'Visning', fylke: 'Fylke', program: 'Utdanningsprogram',
  points: 'Poeng', levels: 'Trinn', history: 'Historikk', choices: 'Ønsker', lang: 'Språk',
  font: 'Tekststørrelse', theme: 'Fargetema', cvd: 'Fargeblindvennlig', viewport: 'Vindu',
  ua: 'Nettleser', data: 'Data', school: 'Skole', chart: 'Graf', hero: 'Nøkkeltall', rows: 'Rader',
};
export function renderContactCtx() {
  if (!S.bugCtx) return '';
  const items = Object.entries(S.bugCtx).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `<li><b>${esc(CTX_LABELS[k] || k)}:</b> ${esc(Array.isArray(v) ? v.join(' | ') : v)}</li>`);
  return `<details class="ctx"><summary>${esc(t('contactCtx'))}</summary>` +
         `<p class="hint">${esc(t('contactCtxHint'))}</p><ul>${items.join('')}</ul></details>`;
}
// el is the button pressed: a click does not focus a button in every browser,
// so activeElement alone would send the focus back to the page body
export function openBug(school, el) {
  S.bugCtx = bugContext(school || null, school ? 'school' : 'header');
  S.contactOpener = el || document.activeElement;
  openContact('feil');
}

export function contactField(name) {
  const key = { school: 'contactSchool', program: 'contactProgram', year: 'contactYear',
                photo: 'contactPhoto', fylke: 'contactFylke' }[name];
  const open = document.getElementById('side')!.classList.contains('open');
  // Changing the kind of report rebuilds these fields, and both "wrong figure"
  // and "wrong photo" ask for a school: a hand-typed name used to be replaced
  // by the map's selection on the way past.
  const prev: any = document.getElementById(`c-${name}`);
  const value = prev ? prev.value
    : name === 'school' && open && S.current ? S.current.name
    : name === 'fylke' && S.mapFylke !== 'all' ? S.mapFylke : '';
  const type = name === 'photo' ? 'url' : name === 'year' ? 'number' : 'text';
  const extra = name === 'year'
    ? ` min="${S.DATA!.years[0]}" max="${S.DATA!.years[S.DATA!.years.length - 1]}"` : '';
  return `<label for="c-${name}">${esc(t(key))}</label>
    <input id="c-${name}" data-f="${name}" type="${type}"${extra}
           autocomplete="off" value="${esc(value)}">`;
}

export function renderContactFields() {
  const kind = (document.getElementById('c-kind') as any).value;
  // the kind picked by hand in the form takes its snapshot here, like a button would
  if (kind === 'feil' && !S.bugCtx) S.bugCtx = bugContext(null, 'form');
  document.getElementById('c-extra')!.innerHTML =
    FIELDS[kind].map(contactField).join('') + (kind === 'feil' ? renderContactCtx() : '');
  const hint = t('contactHints')[kind];
  const el = document.getElementById('c-hint');
  el!.textContent = hint || '';
  el!.hidden = !hint;
}

// The sent state lives here so that a language switch can redraw it. Going
// back to a blank form instead would replace a confirmation with an empty
// sheet, and the sender would reasonably conclude nothing had been sent.
export function renderContactDone() {
  const body = document.getElementById('contact-body');
  body!.innerHTML = `<div class="done">
         <svg viewBox="0 0 24 24" fill="none" stroke="var(--good)" stroke-width="2.4"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="m4.5 12.5 5 5 10-11"/>
         </svg>
         <p class="big">${esc(t('contactSent'))}</p>
         <p>${esc(t('contactSentSub'))}</p>
         <button class="cta" onclick="closeContact()">${esc(t('close'))}</button>
       </div>`;
}

export function renderContact() {
  document.getElementById('contact-h')!.textContent = t('contactTitle');
  document.getElementById('contact-x')!.setAttribute('aria-label', t('close'));
  const body = document.getElementById('contact-body');
  if (body!.dataset.done) { renderContactDone(); return; }
  // ...and a switch mid-form should not empty the boxes either
  const keep = {};
  body!.querySelectorAll('input, select, textarea').forEach((el: any) => {
    if (el.id) keep[el.id] = el.value;
  });
  const kinds = t('contactKinds');
  body!.innerHTML = `
    <p class="lede">${esc(t('contactLede'))}</p>
    <form id="c-form" novalidate>
      <p class="hint">${esc(t('contactRequired'))}</p>
      <label for="c-kind">${esc(t('contactKind'))}</label>
      <select id="c-kind">${Object.entries(kinds)
        .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <div id="c-extra"></div>
      <label for="c-msg">${esc(t('contactMsg'))}</label>
      <p class="hint" id="c-hint" hidden></p>
      <textarea id="c-msg" maxlength="4000"
                placeholder="${esc(t('contactPlaceholder'))}"></textarea>
      <label for="c-email">${esc(t('contactEmail'))}</label>
      <input id="c-email" type="email" autocomplete="email" inputmode="email">
      <!-- honeypot: hidden from people, irresistible to bots -->
      <input id="c-website" name="website" type="text" tabindex="-1"
             autocomplete="off" aria-hidden="true" class="hp">
      <p class="privacy">${esc(t('contactPrivacy'))}</p>
      <p class="err" id="c-err" role="alert" hidden></p>
      <button class="cta" id="c-send" type="submit">${esc(t('contactSend'))}</button>
    </form>`;
  if (keep['c-kind']) (document.getElementById('c-kind') as any).value = keep['c-kind'];
  document.getElementById('c-kind')!.onchange = renderContactFields;
  renderContactFields();
  Object.entries(keep).forEach(([id, v]) => {
    const el: any = document.getElementById(id);
    if (el && v) el.value = v;
  });
  document.getElementById('c-form')!.addEventListener('submit', sendContact);
}

export async function sendContact(ev) {
  ev.preventDefault();
  const err = document.getElementById('c-err');
  const btn: any = document.getElementById('c-send');
  const msg: any = document.getElementById('c-msg');
  err!.hidden = true;
  // three characters is what the relay accepts; anything shorter came back as a
  // bare "could not send", which reads like a fault in the site
  if (msg.value.trim().replace(/\s+/g, ' ').length < 3) {
    err!.textContent = t('contactNeedMsg');
    err!.hidden = false;
    msg.focus();
    return;
  }
  // "Hvilken skole?" is the one field with no "(valgfritt)", and a report about
  // a figure or a photo cannot be acted on without it
  const school: any = document.getElementById('c-school');
  if (school && !school.value.trim()) {
    err!.textContent = t('contactNeedSchool');
    err!.hidden = false;
    school.focus();
    return;
  }
  const mail: any = document.getElementById('c-email');
  if (mail.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.value.trim())) {
    err!.textContent = t('contactBadMail');
    err!.hidden = false;
    mail.focus();
    return;
  }
  const payload: any = {
    type: (document.getElementById('c-kind') as any).value,
    message: msg.value,
    email: (document.getElementById('c-email') as any).value,
    website: (document.getElementById('c-website') as any).value,
    lang: S.lang, page: location.pathname + location.search + location.hash,
  };
  document.querySelectorAll('#c-extra input').forEach((i: any) => { payload[i.dataset.f] = i.value; });
  if (payload.type === 'feil' && S.bugCtx) payload.context = S.bugCtx;
  btn.disabled = true;
  btn.textContent = t('contactSending');
  try {
    const r = await fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json().catch(() => ({ ok: true }));
    // { ok: false } is a relay that could not deliver. The message stays in
    // the textarea for another try; nothing built from the destination
    // address ever reaches the browser (a mailto: fallback used to, and a
    // drained provider quota turned it into an address discloser).
    if (data.ok === false) throw new Error('relay');
    document.getElementById('contact-body')!.dataset.done = 'sent';
    renderContactDone();
  } catch (e) {
    err!.textContent = t('contactFail');
    err!.hidden = false;
    btn.disabled = false;
    btn.textContent = t('contactSend');
  }
}

// from the help sheet to the feedback sheet without touching the history
// entry both share — closeIntro()'s history.back() would race openContact()
export function switchToContact() {
  // A swap, not a dismissal, so it skips the exit animation: the two sheets
  // share a backdrop and a history entry, and fading one out while the other
  // arrives would show both at once behind a doubled scrim.
  document.getElementById('intro')!.hidden = true;   // deliberately instant
  try { localStorage.setItem(INTRO_SEEN, '1'); } catch (e) {}
  openContact();
}
export function openContact(kind?) {
  const body = document.getElementById('contact-body');
  delete body!.dataset.done;
  renderContact();
  if (kind) { (document.getElementById('c-kind') as any).value = kind; renderContactFields(); }
  showSheet('contact');
  setModalTrap();
  openSheetHistory();
  setTimeout(() => document.getElementById('c-kind')?.focus(), 40);
}

export function closeContact(fromHistory?) {
  if (!fromHistory && (history.state || {}).pkSheet) { history.back(); return; }
  hideSheet('contact');
  setModalTrap();
  const back = S.contactOpener && document.contains(S.contactOpener) ? S.contactOpener
             : document.getElementById('help-btn');
  S.contactOpener = null; S.bugCtx = null;
  back?.focus();
}

export function initFeedback() {
}
