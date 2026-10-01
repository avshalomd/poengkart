/* What the rådgiver costs per user flow. Runs the scripted multi-turn flows in
   evals/flows.json through the real agent, carrying the conversation the way
   the page does (the model's tool calls and results go back with every turn,
   the last 14 messages only, as api/radgiver.ts cleans them) and applying the
   screen actions between turns. Records per turn: model calls (steps), input,
   cached input and output tokens (reasoning included), seconds, and the cost
   by OpenRouter's own account of each call.

     npx tsx --env-file=.env.local evals/cost.ts [--model <slug>] [--subset]
                                                 [--only school,near] [--no-actual]
     npx tsx evals/cost.ts --report [file ...]     prices a result file for every model

   Results: evals/results/cost-<model>-<timestamp>.json. Fallback is switched
   off so one run measures one model. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { ModelMessage } from 'ai';

process.env.RADGIVER_FALLBACK_MODEL = '';
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const TODAY = new Date('2026-09-30T10:00:00Z');
const MAX_HISTORY = 14;   // api/radgiver.ts: messages sent to the model
const PRICED = ['openai/gpt-5.6-luna', 'openai/gpt-6-luna', 'deepseek/deepseek-v4-flash-0731', 'google/gemini-3.1-flash-lite', 'google/gemma-4-31b-it'];

type Price = { prompt: number; completion: number; cache_read: number; cache_write: number };
export async function fetchPrices(): Promise<Record<string, Price>> {
  const j: any = await (await fetch('https://openrouter.ai/api/v1/models')).json();
  const out: Record<string, Price> = {};
  for (const m of j.data) if (PRICED.includes(m.id)) {
    const p = m.pricing, prompt = Number(p.prompt), completion = Number(p.completion);
    // OpenRouter bills the tokens a call writes to the cache at a separate (higher) price where the model lists one
    out[m.id] = { prompt, completion, cache_read: p.input_cache_read != null ? Number(p.input_cache_read) : prompt,
                  cache_write: m.id.startsWith('openai/') && p.input_cache_write != null ? Number(p.input_cache_write) : prompt };
  }
  return out;
}
export const stepCost = (u: { input: number; cached: number; cache_write?: number; output: number }, p: Price) => {
  const w = u.cache_write ?? 0;
  return (u.input - u.cached - w) * p.prompt + u.cached * p.cache_read + w * p.cache_write + u.output * p.completion;
};

/* ---------- report mode ---------- */
if (flag('report')) {
  const prices = await fetchPrices();
  const files = process.argv.slice(process.argv.indexOf('--report') + 1).filter(a => !a.startsWith('--'));
  for (const f of files) {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    console.log(`\n${f}  (${r.model})`);
    for (const v of r.variants) {
      if (v.error) { console.log(`  ${v.flow}/${v.variant}: ERROR ${v.error}`); continue; }
      const row = PRICED.map(m => `${m.split('/')[1]} $${v.turns.reduce((a: number, t: any) => a + t.steps_usage.reduce((b: number, s: any) => b + stepCost(s, prices[m]), 0), 0).toFixed(5)}`);
      console.log(`  ${v.flow}/${v.variant}: ${v.turns.length} turns, ${row.join('  ')}`);
    }
  }
  process.exit(0);
}

/* ---------- running ---------- */
const { makeAgent, DEFAULT_MODEL } = await import('../api/_radgiver/agent.ts');
const { ScreenSchema } = await import('../api/_radgiver/tools.ts');
type Screen = import('../api/_radgiver/tools.ts').Screen;

const MODEL = arg('model', process.env.RADGIVER_MODEL || DEFAULT_MODEL)!;
const ONLY = arg('only')?.split(',');
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const spec = JSON.parse(readFileSync(new URL('./flows.json', import.meta.url), 'utf8'));
const KEY = process.env.OPENROUTER_API_KEY;

const padTo = (q: string, n: number, blurbs: string[], i: number) => {
  let t = q;
  for (let k = 0; k < blurbs.length; k++) { const b = blurbs[(i + k) % blurbs.length]; if (t.length + 2 + b.length > n) break; t += '\n\n' + b; }
  return t.slice(0, 1500);
};

/** The page's own bookkeeping: what the screen looks like after a tool's action. */
function applyActions(screen: Screen, actions: any[]): Screen {
  const s: Screen = JSON.parse(JSON.stringify(screen));
  for (const a of actions) {
    if (a.type === 'add') s.wishes.splice(Math.min((a.rank ?? s.wishes.length + 1) - 1, s.wishes.length), 0, { f: a.f, s: a.s, k: a.k });
    else if (a.type === 'remove') s.wishes = a.all ? [] : s.wishes.filter(w => !a.items.some((x: any) => x.f === w.f && x.s === w.s && x.k === w.k));
    else if (a.type === 'move') {
      const i = s.wishes.findIndex(w => w.f === a.f && w.s === a.s && w.k === a.k);
      if (i >= 0) { const [w] = s.wishes.splice(i, 1); s.wishes.splice(Math.min(a.rank, s.wishes.length + 1) - 1, 0, w); }
    }
    else if (a.type === 'points') s.points = Math.round(a.avg * 100) / 10;
    else if (a.type === 'open') s.open_school = { fylke: a.f, school: a.s };
    else if (a.type === 'filter') { if (a.fylke) s.fylke_filter = a.fylke; if (a.cat) s.utdanningsprogram_filter = a.cat; if (a.view) s.view = a.view; }
  }
  s.wishes = s.wishes.slice(0, 12);
  return ScreenSchema.parse(s);
}

/** What the browser sends back of an assistant turn: text and tool calls with results, no reasoning. */
const clean = (msgs: ModelMessage[]): ModelMessage[] => msgs.map(m => m.role === 'assistant' && Array.isArray(m.content)
  ? { ...m, content: m.content.filter((p: any) => p.type !== 'reasoning'), providerOptions: undefined } as ModelMessage : m);

const errText = (e: any) => String(e?.lastError?.data?.error?.metadata?.raw || e?.lastError?.message || e?.message || e).slice(0, 300);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function actual(id: string) {
  if (!KEY || flag('no-actual')) return null;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (i === 9) console.log('   generation lookup failed', r.status);
    if (r.ok) { const d = (await r.json() as any).data; return { cost: d.total_cost, prompt: d.tokens_prompt, completion: d.tokens_completion, cached: d.native_tokens_cached, reasoning: d.native_tokens_reasoning, provider: d.provider_name }; }
    await sleep(2500);
  }
  return null;
}

async function runVariant(flow: any, v: any) {
  const base = spec.flows.flatMap((f: any) => f.variants).find((x: any) => x.id === v.like);
  const turnsRaw: string[] = v.turns ?? base.turns.slice(0, v.n);
  const pad = v.pad ?? base?.pad;
  const screenName = v.screen ?? base?.screen ?? flow.screen;
  let screen = ScreenSchema.parse(cases.screens[screenName]);
  const pairs: ModelMessage[][] = [];   // one entry per finished turn: [user, ...assistant/tool messages]
  const turns: any[] = [];
  for (let i = 0; i < turnsRaw.length; i++) {
    const text = pad ? padTo(turnsRaw[i], pad, spec.blurbs, i) : turnsRaw[i];
    const user: ModelMessage = { role: 'user', content: text };
    // api/radgiver.ts keeps the last 14 UI messages: a user and an assistant message per finished turn, then this one
    const keep = Math.floor((MAX_HISTORY - 1) / 2);
    const history = pairs.slice(-keep).flat();
    const t0 = Date.now();
    let r: any, err = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try { r = await makeAgent(screen, { model: MODEL, today: TODAY }).generate({ messages: [...history, user] }); err = ''; break; }
      catch (e: any) { err = errText(e); if (!/429|rate|busy|shared_pool|capacity/i.test(err)) break; await sleep(20_000); }
    }
    const secs = (Date.now() - t0) / 1000;
    if (!r) { console.log(`  ${flow.id}/${v.id} turn ${i + 1}: ERROR ${err}`); return { flow: flow.id, variant: v.id, screen: screenName, error: err, turns }; }
    const steps_usage = r.steps.map((s: any) => ({
      input: s.usage.inputTokens ?? 0, cached: s.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      cache_write: s.usage.inputTokenDetails?.cacheWriteTokens ?? 0, output: s.usage.outputTokens ?? 0,
      reasoning: s.usage.outputTokenDetails?.reasoningTokens ?? 0, tools: s.toolCalls.map((t: any) => t.toolName),
      result_chars: s.toolResults.reduce((a: number, t: any) => a + JSON.stringify(t.output).length, 0),
      id: s.response?.id, model: s.response?.modelId,
    }));
    const sum = (k: string) => steps_usage.reduce((a: number, s: any) => a + s[k], 0);
    const actions = r.steps.flatMap((s: any) => s.toolResults).filter((t: any) => t.output?.ok && t.output.action).map((t: any) => t.output.action);
    const turn: any = {
      n: i + 1, user_chars: text.length, history_messages: history.length, steps: r.steps.length,
      input: sum('input'), cached: sum('cached'), output: sum('output'), reasoning: sum('reasoning'), secs,
      first_step_input: steps_usage[0].input, tools: steps_usage.flatMap((s: any) => s.tools), answer_chars: (r.text || '').length,
      answer: r.text, steps_usage,
    };
    if (!flag('no-actual') && KEY) {
      const gens = await Promise.all(steps_usage.map((s: any) => s.id ? actual(s.id) : null));
      steps_usage.forEach((s: any, k: number) => { s.or = gens[k]; });
      turn.or_cost = gens.every(Boolean) ? gens.reduce((a, g: any) => a + (g.cost ?? 0), 0) : null;
    }
    turns.push(turn);
    console.log(`  ${flow.id}/${v.id} turn ${i + 1}/${turnsRaw.length}: ${turn.steps} calls, in ${turn.input} (cached ${turn.cached}), out ${turn.output}, ${secs.toFixed(1)}s${turn.or_cost != null ? `, OR $${turn.or_cost.toFixed(5)}` : ''}`);
    // r.response.messages holds the last step only; the browser sends back every step's tool calls and results
    pairs.push([user, ...clean(r.steps.flatMap((s: any) => s.response.messages))]);
    screen = applyActions(screen, actions);
  }
  return { flow: flow.id, variant: v.id, screen: screenName, user_turns: turns.length, turns };
}

const prices = await fetchPrices();
const jobs: { flow: any; v: any }[] = [];
for (const flow of spec.flows) for (const v of flow.variants)
  if ((!flag('subset') || v.subset) && (!ONLY || ONLY.includes(flow.id) || ONLY.includes(`${flow.id}/${v.id}`))) jobs.push({ flow, v });
console.log(`model ${MODEL}, ${jobs.length} variants\n`);
const variants: any[] = [];
let next = 0;
const conc = Number(arg('concurrency', '3'));
await Promise.all(Array.from({ length: Math.min(conc, jobs.length) }, async () => {
  while (next < jobs.length) { const { flow, v } = jobs[next++]; variants.push(await runVariant(flow, v)); }
}));
const order = (x: any) => jobs.findIndex(j => j.flow.id === x.flow && j.v.id === x.variant);
variants.sort((a, b) => order(a) - order(b));
const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const file = new URL(`./results/cost-${MODEL.replace(/[^a-z0-9.-]+/gi, '_')}-${date}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ model: MODEL, date: new Date().toISOString(), today: TODAY, max_history: MAX_HISTORY, prices, variants }, null, 1));
const own = prices[MODEL];
for (const v of variants) {
  if (v.error) { console.log(`${v.flow}/${v.variant}: ERROR`); continue; }
  const c = v.turns.reduce((a: number, t: any) => a + t.steps_usage.reduce((b: number, s: any) => b + (own ? stepCost(s, own) : 0), 0), 0);
  console.log(`${(v.flow + '/' + v.variant).padEnd(14)} ${v.turns.length} turns, ${v.turns.reduce((a: number, t: any) => a + t.steps, 0)} calls, $${c.toFixed(5)}`);
}
console.log('wrote', file.pathname);
