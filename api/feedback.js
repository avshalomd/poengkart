/**
 * Relay the in-app feedback form to e-mail.
 *
 * The destination address lives in the FEEDBACK_TO environment variable, never
 * in the page or the repository: a mailto: or a client-side form endpoint puts
 * a personal address in public HTML, where it is scraped within days.
 *
 * Delivery, in order of preference:
 *   RESEND_API_KEY  -> send through Resend. Nobody else sees the message.
 *   WEB3FORMS_KEY   -> send through Web3Forms.
 *   neither, or the relay fails -> { ok: false }. The page keeps the text in
 *                      the form for another try. There is no mailto: fallback
 *                      any more: one built from FEEDBACK_TO handed the address
 *                      to any browser that asked once the day's quota was spent,
 *                      which is exactly what keeping it out of the page was for.
 *
 * formsubmit.co was the first choice because it needs no account, and it works
 * from a laptop — but from a serverless function it comes back 403 behind a
 * Cloudflare "Just a moment..." challenge, because the request arrives from a
 * datacentre. Defeating that check is not something to build into a product,
 * so the relay needs a provider key instead.
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
const RATE = { window: 600_000, max: 3 };
// The provider's free tier is 100 messages a day. Real feedback here is a
// handful a week, so a cap this far above the traffic costs a genuine sender
// nothing and keeps one browser from draining the day's quota for everyone.
const DAY = { since: 0, sent: 0, max: 80 };

function dayFull() {
  const now = Date.now();
  if (now - DAY.since > 86_400_000) { DAY.since = now; DAY.sent = 0; }
  return DAY.sent >= DAY.max;
}

// A cross-site POST cannot read the reply, but it is still delivered: a
// text/plain body is a "simple" request, so no browser asks permission first.
// Any page in the world could have its visitors send mail here, one per
// visitor, past a per-IP limit that never sees the same address twice.
const SELF = /^https:\/\/poengkart(-[a-z0-9-]+)?\.vercel\.app$/;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function limited(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter(t => now - t < RATE.window);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 500) for (const [k, v] of seen) if (!v.some(t => now - t < RATE.window)) seen.delete(k);
  return hits.length > RATE.max;
}

// Cutting UTF-16 at a fixed length can leave half of an emoji behind, and a
// lone surrogate makes the JSON we hand the mail provider invalid.
const trunc = (s, cap) => s.slice(0, cap).replace(/[\uD800-\uDBFF]$/, '');
// A field is one line by definition, and flattening it is also what keeps a
// CR/LF out of the subject.
const clean = (v, cap) => trunc(String(v ?? '').replace(/\s+/g, ' ').trim(), cap);
// The message is not: somebody who writes three paragraphs should not receive
// them back as one. Collapse runs of spaces, keep the line breaks.
const multiline = (v, cap) => trunc(String(v ?? '')
  .replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n')
  .trim(), cap);

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

// Web3Forms delivers to the address registered against the access key, so it
// cannot be pointed at FEEDBACK_TO — that address is only honoured by Resend.
async function viaWeb3Forms(subject, text, replyTo) {
  const r = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: process.env.WEB3FORMS_KEY, subject, message: text,
      from_name: 'Poengkart', ...(replyTo ? { replyto: replyTo } : {}),
    }),
  });
  if (!r.ok) throw new Error(`web3forms ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export default async function handler(req, res) {
  // A GET reports which delivery path is live, so the setup can be checked
  // without sending mail. Booleans only — never the key, never the address.
  if (req.method === 'GET') {
    return res.status(200).json({
      destination: !!(process.env.FEEDBACK_TO || '').trim(),
      provider: process.env.RESEND_API_KEY ? 'resend'
        : process.env.WEB3FORMS_KEY ? 'web3forms' : 'none',
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  // absent on a same-origin form post from some browsers, present and wrong
  // on every cross-site one
  const origin = req.headers.origin || '';
  if (origin && !SELF.test(origin) && !LOCAL.test(origin)) {
    return res.status(403).json({ error: 'bad_origin' });
  }
  const to = (process.env.FEEDBACK_TO || '').trim();
  if (!to) return res.status(503).json({ error: 'not_configured' });

  // Vercel only parses the body for us when the request says it is JSON; any
  // other content type arrives as a raw string, and one curl of garbage must
  // not crash the function.
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid_json' });

  // Counted before the honeypot, so a bot that trips it still spends its quota.
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) { res.setHeader('Retry-After', '600'); return res.status(429).json({ error: 'rate_limited' }); }

  // Honeypot: a real person never fills a field they cannot see. Answer 200 so
  // a bot learns nothing from the difference.
  if (clean(body.website, 50)) return res.status(200).json({ ok: true });

  if (dayFull()) { res.setHeader('Retry-After', '3600'); return res.status(429).json({ error: 'daily_cap' }); }

  const type = TYPES.has(body.type) ? body.type : 'annet';
  const message = multiline(body.message, MAX.message);
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
    else if (process.env.WEB3FORMS_KEY) await viaWeb3Forms(subject, text, replyTo);
    else return res.status(200).json({ ok: false });
    DAY.sent += 1;
    return res.status(200).json({ ok: true });
  } catch (err) {
    // The message is still in the visitor's form; the page asks them to retry.
    console.error('feedback relay failed:', err.message);
    return res.status(200).json({ ok: false });
  }
}
