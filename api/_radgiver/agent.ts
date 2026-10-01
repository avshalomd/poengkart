/* The agent: AI SDK's ToolLoopAgent over an OpenAI-compatible OpenRouter
   model. The model slug comes from the environment so a model that falls over
   costs a restart, not a code change (RADGIVER_MODEL). */
import { createOpenAI } from '@ai-sdk/openai';
import { isStepCount, ToolLoopAgent } from 'ai';
import { systemPrompt } from './prompt.ts';
import { makeTools, type Screen } from './tools.ts';

// chosen on the eval set (evals/cases.json; docs/radgiver-models.md): on 1 Oct
// 2026 gpt-6-luna at medium reasoning scored 58-61 of 62 over seven runs
// (low: 56-59, with safety slips; minimal 54) at about half gpt-5.6-luna's
// price. The fallback is another vendor, so one outage is not both.
export const DEFAULT_MODEL = 'openai/gpt-6-luna';
export const FALLBACK_MODEL = 'deepseek/deepseek-v4-flash-0731';
export const REASONING_EFFORT = 'medium';

function provider() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    headers: { 'HTTP-Referer': 'https://poengkart.no', 'X-Title': 'Poengkart radgiver (local)' },
    // the readers are mostly minors: route only to providers that neither
    // train on nor keep the conversation for training (OpenRouter's
    // data_collection), and on request only to zero-retention endpoints
    // (RADGIVER_ZDR=1; fewer endpoints, so it can hit rate limits sooner)
    fetch: (url, init) => {
      if (typeof init?.body !== 'string') return fetch(url, init);
      const body = JSON.parse(init.body);
      body.provider = { ...body.provider, data_collection: 'deny', ...(process.env.RADGIVER_ZDR === '1' ? { zdr: true } : {}) };
      // how hard a reasoning model thinks before it answers (RADGIVER_EFFORT:
      // minimal, low, medium, high); hidden reasoning is billed as output
      const effort = process.env.RADGIVER_EFFORT ?? REASONING_EFFORT;
      if (effort) body.reasoning = { ...body.reasoning, effort };
      return fetch(url, { ...init, body: JSON.stringify(body) });
    },
  });
  return openrouter;
}

/** The primary model, falling back to the second one when a call fails before
    it starts streaming (a 429 from the free pool, a retired slug). */
export function modelFor(slug = process.env.RADGIVER_MODEL || DEFAULT_MODEL,
                         fallback = process.env.RADGIVER_FALLBACK_MODEL ?? FALLBACK_MODEL) {
  const p = provider(), main = p.chat(slug);
  if (!fallback || fallback === slug) return main;
  const alt = p.chat(fallback);
  return {
    ...main,
    specificationVersion: main.specificationVersion, provider: main.provider, modelId: main.modelId,
    supportedUrls: main.supportedUrls,
    doGenerate: (o: any) => Promise.resolve(main.doGenerate(o)).catch((e: unknown) => { console.warn('[radgiver] fallback:', String(e).slice(0, 120)); return alt.doGenerate(o); }),
    doStream: (o: any) => Promise.resolve(main.doStream(o)).catch((e: unknown) => { console.warn('[radgiver] fallback:', String(e).slice(0, 120)); return alt.doStream(o); }),
  } as typeof main;
}

const MAX_STEPS = 7;

/** said: everything the reader wrote in this conversation, which a grade average a tool is handed must come from */
export function makeAgent(screen: Screen, opts: { model?: string; today?: Date; said?: string } = {}) {
  return new ToolLoopAgent({
    model: modelFor(opts.model),
    instructions: systemPrompt(screen, opts.today),
    tools: makeTools(screen, opts.said),
    stopWhen: isStepCount(MAX_STEPS),
    // the last two steps may only write: a model that keeps calling tools
    // otherwise runs out of steps and the reader gets no answer at all
    prepareStep: async ({ stepNumber }) => stepNumber >= MAX_STEPS - 2 ? { toolChoice: 'none' as const } : {},
    temperature: 0.3,
    maxOutputTokens: 4000,   // room for a reasoning model to think and still answer
    maxRetries: 2,
  });
}
