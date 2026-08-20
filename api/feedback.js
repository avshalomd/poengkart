/**
 * Relay the in-app feedback form to e-mail.
 *
 * The destination address lives in the FEEDBACK_TO environment variable, never
 * in the page or the repository: a mailto: or a client-side form endpoint puts
 * a personal address in public HTML, where it is scraped within days.
 *
 * Two providers, in order of preference:
 *   RESEND_API_KEY set -> send directly through Resend, nobody else involved.
 *   otherwise          -> relay through formsubmit.co, which needs no account
 *                         but does see the submissions.
 * Swapping from the second to the first is adding one environment variable.
 */

const MAX = { message: 4000, field: 200 };
const TYPES = new Set(['tall', 'bilde', 'skole', 'funksjon', 'annet']);
const LABELS = {
  tall: 'Feil i tallene',
  bilde: 'Feil eller manglende bilde',
  skole: 'Skole mangler eller feil sted',
  funksjon: 'Forslag til funksjon',
  annet: 'Annet',
};

// Best effort only: serverless instances come and go, so this stops a naive
// flood from one browser rather than a determined attacker.
const seen = new Map();
const RATE = { window: 60_000, max: 3 };

function limited(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter(t => now - t < RATE.window);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 500) for (const [k, v] of seen) if (!v.some(t => now - t < RATE.window)) seen.delete(k);
  return hits.length > RATE.max;
}

const clean = (v, cap) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, cap);

async function viaResend(subject, text, replyTo, to) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
               Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.FEEDBACK_FROM || 'Poengkart <onboarding@resend.dev>',
      to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function viaFormsubmit(subject, text, replyTo, to) {
  const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ _subject: subject, _template: 'table',
                           ...(replyTo ? { _replyto: replyTo } : {}), melding: text }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`formsubmit ${r.status}: ${body.slice(0, 200)}`);
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const to = (process.env.FEEDBACK_TO || '').trim();
  if (!to) return res.status(503).json({ error: 'not_configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // Honeypot: a real person never fills a field they cannot see. Answer 200 so
  // a bot learns nothing from the difference.
  if (clean(body.website, 50)) return res.status(200).json({ ok: true });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const type = TYPES.has(body.type) ? body.type : 'annet';
  const message = clean(body.message, MAX.message);
  if (message.length < 3) return res.status(400).json({ error: 'empty_message' });

  const replyTo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(body.email, MAX.field))
    ? clean(body.email, MAX.field) : '';
  const details = [
    ['Skole', clean(body.school, MAX.field)],
    ['Programområde', clean(body.program, MAX.field)],
    ['År', clean(body.year, 12)],
    ['Fylke', clean(body.fylke, MAX.field)],
    ['Lenke til bilde', clean(body.photo, 500)],
    ['Svaradresse', replyTo],
    ['Side', clean(body.page, 300)],
    ['Språk', clean(body.lang, 8)],
  ].filter(([, v]) => v);

  const subject = `[Poengkart] ${LABELS[type]}`
    + (clean(body.school, 60) ? ` – ${clean(body.school, 60)}` : '');
  const text = `${message}\n\n---\n`
    + details.map(([k, v]) => `${k}: ${v}`).join('\n');

  try {
    if (process.env.RESEND_API_KEY) await viaResend(subject, text, replyTo, to);
    else await viaFormsubmit(subject, text, replyTo, to);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('feedback relay failed:', err.message);
    return res.status(502).json({ error: 'relay_failed' });
  }
}
