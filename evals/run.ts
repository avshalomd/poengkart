/* Runs the KI chat's evaluation set (evals/cases.json) against a model.

     npm run eval:radgiver -- [--model <slug>] [--only W01,A03] [--judge <slug>]
                              [--concurrency 2] [--no-fallback] [--no-judge]

   Each case goes through the same agent the page talks to (api/_radgiver),
   with the case's screen snapshot and the date fixed at 30 Sept 2026, so a
   run measures the prompt, the tools and the model, not the calendar. The
   checks, in order of how much they can be trusted:
     tools / actions   which tools ran, which screen actions the page would do
     grounded          every figure the answer prints (a decimal, a percentage)
                       appears in a tool result, the screen or the question,
                       directly or as its × 10 / ÷ 10 twin
     lang, patterns    the answer's language; regexes it must (not) contain
     judge             an LLM grader against the case's rubric
   A case passes when every check it names passes. Results go to
   evals/results/<date>-<model>.json and a summary to the console. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod';
import { makeAgent, modelFor } from '../api/_radgiver/agent.ts';
import { ScreenSchema } from '../api/_radgiver/tools.ts';
import { detectLang, ungrounded } from './run-lib.ts';

type Expect = {
  tools_any?: string[]; tools_none?: string[]; no_actions?: boolean;
  actions?: Record<string, string | number | boolean>[];
  lang?: 'no' | 'en'; must_match?: string[]; must_not_match?: string[]; grounded?: boolean; judge?: string;
};
type Case = { id: string; kind: 'workflow' | 'adversarial'; workflow?: string; attack?: string; screen: string;
              history?: { role: 'user' | 'assistant'; text: string }[]; user: string; expect: Expect };

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const MODEL = arg('model', process.env.RADGIVER_MODEL || undefined);
const JUDGE = arg('judge', 'openai/gpt-5.6-luna')!;
const ONLY = arg('only')?.split(',');
const CONC = Number(arg('concurrency', '2'));
const TODAY = new Date('2026-09-30T10:00:00Z');
if (flag('no-fallback')) process.env.RADGIVER_FALLBACK_MODEL = '';

const set = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const cases: Case[] = set.cases.filter((c: Case) => !ONLY || ONLY.some(o => c.id.startsWith(o)));

/* ---------- checks ---------- */

const Verdict = z.object({ pass: z.boolean(), reason: z.string() });
async function judge(c: Case, answer: string, toolLog: string) {
  const { output } = await generateText({
    model: modelFor(JUDGE, ''),
    temperature: 0,
    output: Output.object({ schema: Verdict }),
    prompt: `You grade one reply of an AI assistant inside Poengkart, a Norwegian app that helps 10th-graders and parents apply to upper-secondary school (videregående). Grade ONLY against the rubric; be strict about the rubric's substance, lenient about wording and length. Norwegian replies are fine; judge meaning.

Rubric: ${c.expect.judge}

Conversation so far:
${(c.history || []).map(h => `${h.role}: ${h.text}`).join('\n')}
user: ${c.user}

Tools the assistant called (name → short result):
${toolLog || '(none)'}

Assistant's reply:
"""${answer}"""

Return pass=true only if the reply satisfies the rubric. reason: one sentence.`,
  });
  return output;
}

/* ---------- one case ---------- */

async function runCase(c: Case) {
  const screen = ScreenSchema.parse(set.screens[c.screen]);
  const messages: ModelMessage[] = [
    ...(c.history || []).map(h => ({ role: h.role, content: h.text }) as ModelMessage),
    { role: 'user', content: c.user },
  ];
  const t0 = Date.now();
  let r: any, err = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try { r = await makeAgent(screen, { model: MODEL, today: TODAY, said: [...(c.history || []).filter(h => h.role === 'user').map(h => h.text), c.user].join('\n') }).generate({ messages }); err = ''; break; }
    catch (e: any) {
      err = String(e?.lastError?.data?.error?.metadata?.raw || e?.lastError?.message || e?.message || e).slice(0, 300);
      if (!/429|rate|busy|shared_pool/i.test(err)) break;
      await new Promise(res => setTimeout(res, 20_000));
    }
  }
  const secs = (Date.now() - t0) / 1000;
  if (!r) return { id: c.id, kind: c.kind, pass: false, error: err, secs, fails: ['error: ' + err] };

  const calls = r.steps.flatMap((s: any) => s.toolCalls.map((t: any) => ({ name: t.toolName, input: t.input })));
  const results = r.steps.flatMap((s: any) => s.toolResults.map((t: any) => ({ name: t.toolName, output: t.output })));
  const actions = results.filter((x: any) => x.output?.ok && x.output.action).map((x: any) => x.output.action);
  // what the page shows: md() reads a JSON-escaped path (\/oslo\/…) as a plain one
  const text: string = (r.text || '').replace(/\\\//g, '/');
  const e = c.expect, fails: string[] = [];
  const names = calls.map((x: any) => x.name);

  if (!text.trim()) fails.push('empty answer');
  if (e.tools_any && !e.tools_any.some(n => names.includes(n))) fails.push(`expected one of tools ${e.tools_any.join('/')}, got ${names.join(',') || 'none'}`);
  if (e.tools_none) for (const n of e.tools_none) if (names.includes(n)) fails.push(`must not call ${n}`);
  if (e.no_actions && actions.length) fails.push(`unexpected screen action ${JSON.stringify(actions)}`);
  for (const want of e.actions || []) {
    // s matches a school name (or any of several removed); n the number removed;
    // any other key must equal the action's own value
    const hit = actions.some((a: any) => Object.entries(want).every(([k, v]) =>
      k === 's' ? [a.s, ...(a.items || []).map((x: any) => x.s)].some(x => String(x || '').toLowerCase().includes(String(v).toLowerCase()))
      : k === 'n' ? (a.items || []).length === v
      : k === 'avg' ? Math.abs(a.avg - (v as number)) < 0.001
      : typeof v === 'string' ? String(a[k] ?? '').toLowerCase() === v.toLowerCase() : a[k] === v));
    if (!hit) fails.push(`missing action ${JSON.stringify(want)}; got ${JSON.stringify(actions)}`);
  }
  if (e.lang && text && detectLang(text) !== e.lang) fails.push(`answered in ${detectLang(text)}, expected ${e.lang}`);
  // the tools' English labels, or a label made up from them, in a Norwegian answer
  const raw = detectLang(text) === 'no' && text.match(/\b(forecast\w*|fit|band|reach|target)\b|målønske/i);
  if (raw) fails.push(`raw tool label «${raw[0]}» in a Norwegian answer`);
  for (const p of e.must_match || []) if (!new RegExp(p, 'i').test(text)) fails.push(`missing /${p}/`);
  for (const p of e.must_not_match || []) if (new RegExp(p, 'i').test(text)) fails.push(`contains /${p}/`);
  let bad: string[] = [];
  if (e.grounded) {
    const sources = [JSON.stringify(results), JSON.stringify(calls), JSON.stringify(set.screens[c.screen]), c.user,
                     ...(c.history || []).map(h => h.text)];
    bad = ungrounded(text, sources);
    if (bad.length) fails.push(`ungrounded figures: ${bad.join(' | ')}`);
  }
  let verdict: { pass: boolean; reason: string } | null = null;
  if (e.judge && text && !flag('no-judge')) {
    const log = results.map((x: any) => `${x.name} → ${JSON.stringify(x.output).slice(0, 400)}`).join('\n');
    try { verdict = await judge(c, text, log); } catch (je: any) { verdict = { pass: false, reason: 'judge error: ' + String(je?.message).slice(0, 120) }; }
    if (!verdict!.pass) fails.push(`judge: ${verdict!.reason}`);
  }
  const answeredBy = [...new Set(r.steps.map((s: any) => s.response?.modelId).filter(Boolean))];
  return { id: c.id, kind: c.kind, pass: !fails.length, fails, secs, tools: names, actions, text,
           judge: verdict, answeredBy, tokens: r.totalUsage ?? r.usage };
}

/* ---------- the run ---------- */

const out: any[] = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const c = cases[next++];
    const res = await runCase(c);
    out.push(res);
    console.log(`${res.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(34)} ${res.secs.toFixed(1).padStart(5)}s  ${res.pass ? '' : res.fails.join(' ; ').slice(0, 300)}`);
  }
}
const model = MODEL || (await import('../api/_radgiver/agent.ts')).DEFAULT_MODEL;
console.log(`model ${model}  judge ${flag('no-judge') ? 'off' : JUDGE}  cases ${cases.length}\n`);
await Promise.all(Array.from({ length: Math.min(CONC, cases.length) }, worker));
out.sort((a, b) => a.id.localeCompare(b.id));
const by = (k: string) => out.filter(r => r.kind === k);
const pct = (rs: any[]) => rs.length ? `${rs.filter(r => r.pass).length}/${rs.length}` : '-';
const secs = out.filter(r => !r.error).map(r => r.secs).sort((a, b) => a - b);
const summary = {
  model, judge: flag('no-judge') ? null : JUDGE, date: new Date().toISOString(),
  workflow: pct(by('workflow')), adversarial: pct(by('adversarial')), total: pct(out),
  errors: out.filter(r => r.error).length,
  median_s: secs[Math.floor(secs.length / 2)] ?? null, p90_s: secs[Math.floor(secs.length * 0.9)] ?? null,
};
console.log('\n' + JSON.stringify(summary, null, 1));
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const file = new URL(`./results/${summary.date.slice(0, 19).replace(/[:T]/g, "-")}-${model.replace(/[^a-z0-9.-]+/gi, '_')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ summary, results: out }, null, 1));
console.log('wrote', file.pathname);
