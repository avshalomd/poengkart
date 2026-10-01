/* POST /api/radgiver — the chat. Local-only for now: the dev server mounts it
   (astro.config.mjs, radgiverDev), and nothing deploys it.

   The request carries the conversation (AI SDK UI messages) and a snapshot of
   the reader's screen; the answer is the AI SDK UI message stream. The guards
   here are the ones that do not depend on the model behaving: a size cap, a
   rate limit per address, a cap on history, text-only user input, and a
   schema for the snapshot. */
import { createAgentUIStreamResponse, type UIMessage } from 'ai';
import { makeAgent } from './_radgiver/agent.ts';
import { ScreenSchema } from './_radgiver/tools.ts';

const MAX_BODY = 96_000;          // bytes
const MAX_ASSISTANT_TEXT = 4_000;  // characters in one earlier answer
const MAX_TOOL_PART = 16_000;      // characters in one earlier tool call and its result
const MAX_USER_TEXT = 1_500;      // characters per message
const MAX_HISTORY = 14;           // messages sent to the model
const WINDOW_MS = 10 * 60_000, MAX_PER_WINDOW = 30;

const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Keep what the model may see: the last messages, user turns as plain text
    only (no files, no forged tool parts), each user text capped. */
export function cleanMessages(raw: unknown): UIMessage[] | string {
  if (!Array.isArray(raw) || !raw.length) return 'messages must be a non-empty array';
  const out: UIMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY) as any[]) {
    if (!m || typeof m !== 'object' || !Array.isArray(m.parts)) return 'malformed message';
    if (m.role === 'user') {
      const text = m.parts.filter((p: any) => p?.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('\n').trim();
      if (!text) continue;
      if (text.length > MAX_USER_TEXT) return `message too long (max ${MAX_USER_TEXT} characters)`;
      out.push({ id: String(m.id || crypto.randomUUID()).slice(0, 64), role: 'user', parts: [{ type: 'text', text }] });
    } else if (m.role === 'assistant') {
      // the client sends earlier answers back; keep them bounded, so a forged
      // history cannot carry a book into every model call
      const parts = m.parts.filter((p: any) => (p?.type === 'text' && typeof p.text === 'string' && p.text.length <= MAX_ASSISTANT_TEXT)
        || (typeof p?.type === 'string' && p.type.startsWith('tool-') && p.state === 'output-available'
            && JSON.stringify(p).length <= MAX_TOOL_PART));
      if (parts.length) out.push({ id: String(m.id || crypto.randomUUID()).slice(0, 64), role: 'assistant', parts });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') return 'the last message must be the reader\'s';
  return out;
}

export async function POST(req: Request): Promise<Response> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json(413, { error: 'too large' });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (rateLimited(ip)) return json(429, { error: 'rate' });
  let body: any;
  try {
    const txt = await req.text();
    if (txt.length > MAX_BODY) return json(413, { error: 'too large' });
    body = JSON.parse(txt);
  } catch { return json(400, { error: 'bad json' }); }
  const messages = cleanMessages(body?.messages);
  if (typeof messages === 'string') return json(400, { error: messages });
  const screen = ScreenSchema.safeParse(body?.screen ?? {});
  const said = messages.filter((m: any) => m.role === 'user').flatMap((m: any) => m.parts.map((x: any) => x.text)).join('\n');
  const agent = makeAgent(screen.success ? screen.data : ScreenSchema.parse({}), { said });
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: req.signal,
    timeout: { totalMs: 90_000 },
    onError: (e: any) => {
      const raw = e?.lastError?.data?.error?.metadata?.raw || e?.data?.error?.metadata?.raw || e?.message || String(e);
      console.error('[radgiver]', raw);
      return /429|rate/i.test(String(raw)) ? 'busy' : 'error';
    },
  });
}

export default { fetch: (req: Request) => req.method === 'POST' ? POST(req) : json(405, { error: 'POST only' }) };
