/* The KI chat: a column beside the map and the school (the whole screen on a
   phone) where a pupil or a parent can talk through the application. The
   server side is api/radgiver.ts; this file only draws the conversation, sends
   what is on screen with every message, and carries out the screen actions the
   server's tools return (add, remove and move wishes, open a school, set the
   filters and the average). The AI SDK's chat client is loaded the first time the column
   opens, so the map's own first load does not grow by it. */
import type { UIMessage } from 'ai';
import { isChosen, moveChoice, onPoints, progKeyMap, setChoices, toggleChoice } from './chance';
import { esc, fmtAvg, progName, slug, schoolPath } from './helpers';
import { CATS, t } from './i18n';
import { setNear, setView } from './listview';
import { mapZoom, onMapCat, onMapFylke, viewSchool } from './map';
import { findPlaces } from './places';
import { schoolBySlug } from './router';
import { openSide, phoneSheet } from './sidebar';
import { S } from './state';
import type { School } from './types';

const $ = (id: string) => document.getElementById(id)!;
let chat: any = null;
let busyUntil = 0;
const applied = new Set<string>();
const undo = new Map<string, () => void>();
const STORE = 'pk-chat';

/* ---------- what the server sees ---------- */

/** The screen as the server's ScreenSchema takes it (api/_radgiver/tools.ts). */
export function screenSnapshot() {
  const open = $('side').classList.contains('open') && S.current;
  return {
    lang: S.lang,
    view: S.view,
    fylke_filter: S.mapFylke,
    utdanningsprogram_filter: S.mapCat,
    points: S.myPoints,
    open_school: open ? { fylke: S.current!.fylke, school: S.current!.name,
                          ...(S.chart.prog ? { programme: S.chart.prog.program } : {}) } : null,
    wishes: S.choices.slice(0, 12).map(c => ({ f: c.f, s: c.s, k: c.k })),
  };
}

/* ---------- the column ---------- */

export function openChat() {
  const el = $('chat');
  el.removeAttribute('inert');
  el.classList.add('open');
  document.body.classList.add('chat-open');
  $('chat-btn').setAttribute('aria-expanded', 'true');
  S.map?.resize();
  ensureChat().then(() => { render(); ($('chat-in') as HTMLTextAreaElement).focus({ preventScroll: true }); });
}
export function closeChat() {
  const el = $('chat');
  el.classList.remove('open');
  el.setAttribute('inert', '');
  document.body.classList.remove('chat-open');
  $('chat-btn').setAttribute('aria-expanded', 'false');
  setTimeout(() => S.map?.resize(), 300);
  ($('chat-btn') as HTMLElement).focus({ preventScroll: true });
}
const toggleChat = () => $('chat').classList.contains('open') ? closeChat() : openChat();

async function ensureChat() {
  if (chat) return;
  const { AbstractChat, DefaultChatTransport } = await import('ai');
  let saved: UIMessage[] = [];
  try { saved = JSON.parse(sessionStorage.getItem(STORE) || '[]'); } catch (e) {}
  // actions in a restored conversation already happened
  for (const m of saved) for (const p of m.parts as any[]) if (p.toolCallId) applied.add(p.toolCallId);
  const state = {
    status: 'ready' as any, error: undefined as Error | undefined, messages: saved,
    pushMessage(m: UIMessage) { this.messages = [...this.messages, m]; changed(); },
    popMessage() { this.messages = this.messages.slice(0, -1); changed(); },
    replaceMessage(i: number, m: UIMessage) { const a = [...this.messages]; a[i] = m; this.messages = a; changed(); },
    snapshot: <T,>(x: T): T => structuredClone(x),
  };
  // status and error are set straight on the state object; watch them too
  const watched = new Proxy(state, { set(o: any, k, v) { o[k] = v; if (k === 'status' || k === 'error') changed(); return true; } });
  class Chat extends AbstractChat<UIMessage> {
    constructor() {
      super({
        state: watched as any,
        transport: new DefaultChatTransport({
          api: '/api/radgiver',
          prepareSendMessagesRequest: ({ messages }) => ({ body: { messages, screen: screenSnapshot() } }),
        }),
        onFinish: () => { try { sessionStorage.setItem(STORE, JSON.stringify(state.messages.slice(-30))); } catch (e) {} },
      });
    }
  }
  chat = new Chat();
}

let frame = 0;
function changed() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; applyActions(); render(); });
}

/* ---------- screen actions ---------- */

const schoolOf = (f: string, s: string) => S.DATA?.schools.find(x => x.fylke === f && x.name === s) || null;
const progOf = (s: School, k: string) => s.programs.find(p => progKeyMap(s).get(p) === k) || null;
const wishIndex = (a: { f: string; s: string; k: string }) => S.choices.findIndex(c => c.f === a.f && c.s === a.s && c.k === a.k);
function moveTo(i: number, to: number) {
  while (i > to) moveChoice(i, -1), i--;
  while (i < to) moveChoice(i, 1), i++;
}

function applyActions() {
  if (!chat) return;
  for (const m of chat.messages as UIMessage[]) {
    if (m.role !== 'assistant') continue;
    for (const p of m.parts as any[]) {
      if (!p.toolCallId || p.state !== 'output-available' || applied.has(p.toolCallId)) continue;
      applied.add(p.toolCallId);
      const a = p.output?.ok && p.output.action;
      if (a) act(a, p.toolCallId);
    }
  }
}

function act(a: any, id: string) {
  const s = a.f && schoolOf(a.f, a.s);
  if (a.type === 'add' && s) {
    const p = progOf(s, a.k);
    if (!p || isChosen(s, p)) return;
    toggleChoice(s, p);
    const i = wishIndex(a);
    if (i >= 0 && a.rank && a.rank - 1 < i) moveTo(i, a.rank - 1);
    undo.set(id, () => { if (isChosen(s, p)) toggleChoice(s, p); });
  } else if (a.type === 'remove') {
    const before = S.choices.slice();
    for (const w of a.items || []) {
      const ws = schoolOf(w.f, w.s), p = ws && progOf(ws, w.k);
      if (ws && p && isChosen(ws, p)) toggleChoice(ws, p);
    }
    if (S.choices.length !== before.length) undo.set(id, () => setChoices(before));
  } else if (a.type === 'move') {
    const i = wishIndex(a);
    if (i >= 0) { moveTo(i, a.rank - 1); undo.set(id, () => { const j = wishIndex(a); if (j >= 0) moveTo(j, i); }); }
  } else if (a.type === 'open' && s) {
    showSchool(s);
  } else if (a.type === 'filter') {
    const was = { fylke: S.mapFylke, cat: S.mapCat, view: S.view, near: S.near };
    applyFilter(a);
    undo.set(id, () => applyFilter({ ...was, near: was.near }));
  } else if (a.type === 'points') {
    const was = S.myPoints;
    onPoints(String(a.avg).replace('.', ','));
    undo.set(id, () => onPoints(was == null ? '' : fmtAvg(was)));
  }
}

/** A school from the chat: the map flies to it, as a pick from search or a
    wish does, and its sheet opens (on a phone the chat steps aside first). */
function showSchool(s: School) {
  if (phoneSheet()) closeChat();
  if (s.lat && S.map && S.view === 'map') viewSchool(s, Math.max(mapZoom(), 10));
  openSide(s);
}

/** The filters as the panel's own controls set them; county first, since a
    county without the programme widens the programme filter (onMapFylke). */
function applyFilter(f: { fylke?: string; cat?: string; view?: string; near?: any }) {
  if (f.fylke && f.fylke !== S.mapFylke) {
    const sel = document.getElementById('map-fylke') as HTMLSelectElement | null;
    if (sel) sel.value = f.fylke;
    onMapFylke(f.fylke);
  }
  if (f.cat && f.cat !== S.mapCat) onMapCat(f.cat);
  if (f.view && f.view !== S.view) setView(f.view);
  if (f.near !== undefined) {
    // the server sends a name; an undo sends the place it replaced
    const p = typeof f.near === 'string' ? (f.near ? findPlaces(f.near, 1)[0] || null : null) : f.near;
    if ((p?.name || null) !== (S.near?.name || null)) setNear(p);
  }
}

/* ---------- drawing ---------- */

// links the chat may print: a school's own page, and the official sites
const OFFICIAL = ['vilbli.no', 'vigo.no', 'udir.no', 'utdanning.no', 'karriereveiledning.no', 'korspahalsen.no', '116111.no', 'mentalhelse.no'];
function allowedHref(u: string): { href: string; school?: School } | null {
  // a model sometimes spells a path with the name's own letters (ullern-videregående-skole)
  const m = /^\/([^/\s]+)\/([^/\s]+)$/.exec(u);
  if (m) {
    let f = m[1], n = m[2];
    try { f = decodeURIComponent(f); n = decodeURIComponent(n); } catch (e) { return null; }
    const s = schoolBySlug(slug(f), slug(n));
    return s ? { href: schoolPath(s), school: s } : null;
  }
  let url: URL;
  try { url = new URL(u); } catch (e) { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '');
  const counties = (S.DATA?.counties || []).map(c => { try { return new URL(c.source).hostname.replace(/^www\./, ''); } catch (e) { return ''; } });
  return [...OFFICIAL, ...counties].some(h => h && (host === h || host.endsWith('.' + h))) ? { href: url.href } : null;
}

function inline(txt: string): string {
  let h = esc(txt);
  h = h.replace(/\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/g, (_, label, u) => {
    // a model sometimes writes a path JSON-escaped: (\/oslo\/…)
    const ok = allowedHref(u.replace(/&amp;/g, '&').replace(/\\\//g, '/'));
    if (!ok) return label;
    return ok.school ? `<a href="${esc(ok.href)}" data-school="${esc(ok.href)}">${label}</a>`
                     : `<a href="${esc(ok.href)}" target="_blank" rel="noopener">${label} ↗</a>`;
  });
  // a bare official address (https://www.vilbli.no) is a link too; an href
  // or a link's own label follows `"` or `>`, so neither is matched again
  h = h.replace(/(^|[\s(«])(https:\/\/[^\s<)»]*[^\s<)».,;:!?])/g, (all, pre, u) => {
    const ok = allowedHref(u.replace(/&amp;/g, '&'));
    return ok && !ok.school ? `${pre}<a href="${esc(ok.href)}" target="_blank" rel="noopener">${u} ↗</a>` : all;
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return h;
}
/** A small, safe Markdown: paragraphs, bullet and numbered lists, bold,
    italics and the links allowedHref lets through. Everything else is text. */
export function md(src: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null, para: string[] = [];
  const flushP = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushL = () => { if (list) out.push(`</${list}>`); list = null; };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const b = /^\s*[-*•]\s+(.*)$/.exec(line), n = /^\s*\d+[.)]\s+(.*)$/.exec(line), hd = /^#{1,4}\s+(.*)$/.exec(line);
    if (b || n) {
      flushP();
      const want = b ? 'ul' : 'ol';
      if (list !== want) { flushL(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((b || n)![1])}</li>`);
    } else if (!line.trim()) { flushP(); flushL(); }
    else if (hd) { flushP(); flushL(); out.push(`<p><strong>${inline(hd[1])}</strong></p>`); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return out.join('');
}

function actionLine(p: any): string {
  const o = p.output, a = o.action;
  const s = a.f ? schoolOf(a.f, a.s) : null, pr = s && a.k ? progOf(s, a.k) : null;
  const what = s ? `${s.name}${pr ? ' – ' + progName(pr) : ''}` : '';
  const n = a.items?.length || 0, one = n === 1 && schoolOf(a.items[0].f, a.items[0].s);
  const removed = a.all ? t('chatDidClear') : one ? t('chatDidRemove', `${one.name}${progOf(one, a.items[0].k) ? ' – ' + progName(progOf(one, a.items[0].k)!) : ''}`)
    : t('chatDidRemoveN', n);
  const shown = [a.fylke && (a.fylke === 'all' ? t('allFylker') : a.fylke), a.cat && (a.cat === 'all' ? t('allCats') : (CATS as any)[a.cat]?.[S.lang]),
                 a.view && t(a.view === 'list' ? 'viewList' : 'viewMap'), a.near && t('chatNearFrom', a.near)].filter(Boolean).join(' · ');
  const txt = a.type === 'add' ? t('chatDidAdd', a.rank, what) : a.type === 'remove' ? removed
    : a.type === 'filter' ? t('chatDidFilter', shown)
    : a.type === 'move' ? t('chatDidMove', what, a.rank) : a.type === 'open' ? t('chatDidOpen', what)
    : t('chatDidPoints', fmtAvg(a.avg * 10));
  const u = undo.has(p.toolCallId) ? `<button type="button" class="undo" data-undo="${esc(p.toolCallId)}">${esc(t('chatUndo'))}</button>` : '';
  return `<div class="act"><span>✓ ${esc(txt)}</span>${u}</div>`;
}

function suggestions(): string[] {
  const out: string[] = [];
  if ($('side').classList.contains('open') && S.current) out.push(t('chatSugSchool', S.current.name));
  if (S.choices.length) out.push(t('chatSugCheck'));
  else out.push(t('chatSugList'));
  out.push(S.myPoints != null ? t('chatSugFit') : t('chatSugHow'));
  return out.slice(0, 3);
}

// #chat-log holds the messages and, after them, one thinking indicator that
// stays in the page while the answer is worked out: three dots and the step
// under way («Sammenligner skoler …»), which never flashes in and out
let drawn = '';
function logParts() {
  const log = $('chat-log');
  let msgs = log.querySelector<HTMLElement>('.msgs'), ind = log.querySelector<HTMLElement>('.typing');
  if (!msgs || !ind) {
    log.innerHTML = '<div class="msgs"></div><div class="msg bot typing" aria-hidden="true" hidden>'
      + '<span class="dots"><span></span><span></span><span></span></span><span class="step"></span></div>';
    msgs = log.querySelector<HTMLElement>('.msgs')!; ind = log.querySelector<HTMLElement>('.typing')!;
    drawn = '';
  }
  return { msgs, ind };
}
const STEP_MIN_MS = 900;
let stepShown = 0, stepTimer = 0;
function working(on: boolean, last: UIMessage | undefined) {
  const { ind } = logParts(), step = ind.querySelector<HTMLElement>('.step')!;
  // the answer has begun once its last part is text with something in it
  const parts = (last?.role === 'assistant' ? last.parts : []) as any[];
  const tail = parts[parts.length - 1];
  const show = on && !(tail?.type === 'text' && tail.text.trim());
  ind.hidden = !show;
  if (!show) { clearTimeout(stepTimer); step.textContent = ''; stepShown = 0; return; }
  // the latest step with a label, kept on screen after the tool returns and
  // until the next one has had its turn: a quick tool no longer blinks
  let lbl = '';
  for (const p of parts) if (p.type?.startsWith('tool-')) lbl = (t('chatTool') as Record<string, string>)[p.type.slice(5)] || lbl;
  if (!lbl || lbl === step.textContent) return;
  const wait = STEP_MIN_MS - (Date.now() - stepShown);
  clearTimeout(stepTimer);
  const put = () => { step.textContent = lbl; stepShown = Date.now(); };
  if (!step.textContent || wait <= 0) put(); else stepTimer = window.setTimeout(put, wait);
}

function render() {
  if (!chat) return;
  const log = $('chat-log'), msgs = chat.messages as UIMessage[], status = chat.status;
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const html: string[] = [];
  if (!msgs.length) {
    html.push(`<div class="msg bot"><p>${esc(t('chatHello'))}</p></div>`);
    html.push(`<div class="sugs">${suggestions().map(s => `<button type="button" class="sug">${esc(s)}</button>`).join('')}</div>`);
  }
  msgs.forEach(m => {
    if (m.role === 'user') {
      const txt = m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
      html.push(`<div class="msg me">${esc(txt)}</div>`);
      return;
    }
    const parts: string[] = [];
    for (const p of m.parts as any[]) {
      if (p.type === 'text' && p.text.trim()) parts.push(`<div class="txt">${md(p.text)}</div>`);
      else if (p.type?.startsWith('tool-') && p.state === 'output-available' && p.output?.ok && p.output.action)
        parts.push(actionLine(p));
    }
    if (parts.length) html.push(`<div class="msg bot">${parts.join('')}</div>`);
  });
  if (status === 'error') {
    const e = String(chat.error?.message || '');
    const key = /busy/.test(e) ? 'chatBusy' : /429|rate/.test(e) ? 'chatRate' : 'chatError';
    html.push(`<div class="msg err" role="alert">${esc(t(key))} <button type="button" class="retry">${esc(t('chatRetry'))}</button></div>`);
  }
  // the messages are redrawn only when they change: a stream fires many events
  // that change nothing visible, and each redraw restarted the dots' animation
  const msgsEl = logParts().msgs, next = html.join('');
  if (next !== drawn) { msgsEl.innerHTML = next; drawn = next; }
  const streaming = status === 'submitted' || status === 'streaming';
  working(streaming, msgs[msgs.length - 1]);
  if (atBottom || status !== 'ready') log.scrollTop = log.scrollHeight;
  const send = $('chat-send');
  send.classList.toggle('stop', streaming);
  send.setAttribute('aria-label', t(streaming ? 'chatStop' : 'chatSend'));
  send.innerHTML = streaming
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  $('chat-new').hidden = !msgs.length;
}

function send(text: string) {
  text = text.trim();
  if (!text || !chat || Date.now() < busyUntil) return;
  if (chat.status === 'submitted' || chat.status === 'streaming') return;
  busyUntil = Date.now() + 400;
  chat.sendMessage({ text });
}

function labels() {
  $('chat-btn').setAttribute('aria-label', t('chatOpen'));
  $('chat-btn').title = t('chatOpen');
  $('chat-h').textContent = t('chatTitle');
  $('chat-beta').textContent = t('chatBeta');
  $('chat-x').setAttribute('aria-label', t('chatClose'));
  $('chat-new').setAttribute('aria-label', t('chatNew'));
  $('chat-new').title = t('chatNew');
  ($('chat-in') as HTMLTextAreaElement).placeholder = t('chatPlaceholder');
  $('chat-note').textContent = t('chatNote');
  render();
}

// the endpoint exists only under `astro dev` (astro.config.mjs mounts it);
// a build shows the chat only when it is built for a server that has one
const ENABLED = (import.meta as any).env?.DEV || (import.meta as any).env?.PUBLIC_RADGIVER === '1';

export function initRadgiver() {
  if (!document.getElementById('chat')) return;
  if (!ENABLED) { document.getElementById('chat')!.remove(); document.getElementById('chat-btn')?.remove(); return; }
  labels();
  new MutationObserver(labels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  $('chat-btn').addEventListener('click', toggleChat);
  $('chat-x').addEventListener('click', closeChat);
  $('chat-new').addEventListener('click', () => {
    if (!chat) return;
    chat.stop?.();
    chat.messages = [];
    try { sessionStorage.removeItem(STORE); } catch (e) {}
    render();
    ($('chat-in') as HTMLTextAreaElement).focus();
  });
  const input = $('chat-in') as HTMLTextAreaElement;
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ($('chat-form') as HTMLFormElement).requestSubmit(); }
    if (e.key === 'Escape') closeChat();
  });
  $('chat-form').addEventListener('submit', e => {
    e.preventDefault();
    if (chat && (chat.status === 'submitted' || chat.status === 'streaming')) { chat.stop(); return; }
    send(input.value);
    input.value = ''; grow();
  });
  $('chat-log').addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest('a, button') as HTMLElement | null;
    if (!el) return;
    if (el.classList.contains('sug')) { send(el.textContent || ''); return; }
    if (el.classList.contains('retry')) { chat?.regenerate(); return; }
    if (el.dataset.undo) { undo.get(el.dataset.undo)?.(); undo.delete(el.dataset.undo); render(); return; }
    if (el.dataset.school) {
      e.preventDefault();
      const [, f, s] = el.dataset.school.split('/');
      const school = schoolBySlug(f, s);
      if (school) showSchool(school);
    }
  });
}

