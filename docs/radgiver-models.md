# Rådgiver: model shortlist on OpenRouter (2026-09-30)

Bottom line: start the evaluation with **`openai/gpt-5.6-luna`**, **`google/gemini-3.1-flash-lite`** and **`google/gemma-4-31b-it`** (paid), and **`google/gemma-4-31b-it:free`**, **`dots-studio/dots-3-note-preview:free`** and **`nvidia/nemotron-3-super-120b-a12b:free`** (free). No public benchmark covers the exact new models on Norwegian plus tool calling, so the real decision needs our own 30-question eval.

Sources: live OpenRouter catalogue `GET /api/v1/models` and `/models/<id>/endpoints` (no key, fetched 2026-09-30), the local probe `~/.claude/skills/openrouter-models/results.md` (2026-09-20), and the public pages cited at the bottom. No key was used and no model was called.

## Method and caveats

- Of 464 models, 396 list `tools` in `supported_parameters`. Every model in the tables below does, and every healthy endpoint lists `tool_choice`.
- Prices are the catalogue list price (the cheapest endpoint). Models served by many providers (DeepSeek, GLM, Gemma, gpt-oss) vary a lot per provider: the range is shown where it matters. Routing with `provider: {sort: "latency"}` or pinning providers changes the bill.
- **Cost per 1000 chat turns** = 3 calls x 6k input = 18M input tokens + 0.4M output tokens (a 150-word Norwegian answer is about 300 to 400 tokens; the tool-call turns are tiny). Hidden reasoning tokens are billed as output and are **not** included, so reasoning models cost more than shown. No prompt caching assumed; the tool definitions and system prompt are the same on every call, so caching would cut input cost 5 to 10x on models that support it (cache read is about a tenth of input price on Luna, DeepSeek, Gemini, Qwen).
- **Latency and throughput:** OpenRouter's public `/endpoints` API returns `null` for `latency_last_30m` and `throughput_last_30m` without a session, and its `/performance` pages are JavaScript-rendered, so per-provider TTFT and tokens/s from OpenRouter itself are **missing**. The numbers below come from Artificial Analysis (AA) where found, plus the local probe's wall-clock seconds (a short non-tool extraction, not a streamed TTFT).
- Uptime is from the endpoint list (last 1 day, worst and best healthy endpoint).

## (a) Free models with tools (15 in the catalogue)

| Model | Ctx | Structured out | Probe 2026-09-20 | Uptime 1d (catalogue) | Verdict |
|---|---|---|---|---|---|
| `google/gemma-4-31b-it:free` | 262K | no | 429 twice over two days | 99.6% | Best Norwegian of the open models (EuroEval below). Re-test; capacity is the risk |
| `google/gemma-4-26b-a4b-it:free` | 262K | no | 429 | not checked | Same family, 4B active, should be fast. Reserve |
| `dots-studio/dots-3-note-preview:free` | 512K | yes | worked, 13.8 s | 99.96% | Only free model that both works and takes a schema. Norwegian unknown, preview |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | yes | worked, 18.8 s | 98.4% | Works, slow-ish; Nemotron 3 Nano scores weakly in Norwegian |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | no | worked, 26.7 s | 96.8% | Too slow for chat |
| `nvidia/nemotron-3.5-lightning:free` | 1M | no | 153 s | not checked | Unusable |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | no | worked, 13.0 s | 75% (endpoint status -2) | Flaky today |
| `qwen/qwen3.8-27b:free` | 262K | yes | 429 | 97.3% | Tool use 87.5% in a Kingy test but 32.8 s median there; slow |
| `inclusionai/ling-3.0-flash-sante:free` | 262K | no | worked, 5.7 s | not checked | Health-domain finetune; Ling 3.0 Flash base scores 73.0% on BFCL v4 |
| `liquid/lfm-2.5-2.6b:free` | 64K | yes | worked, 5.8 s | not checked | 2.6B, BFCL v4 56.9%; too small for Norwegian advice |
| `poolside/laguna-s-2.1:free`, `poolside/laguna-xs-2.1:free` | 262K | no | 429 half the time, wrong shape | not checked | Skip |
| `cohere/north-mini-code:free` | 256K | no | ignored the schema, wrong date | not checked | Skip (code model) |
| `thinkingmachines/inkling:free`, `inkling-small:free` | 1M | no | 403 "agentic harnesses only" | not checked | Skip |

Change since the probe: `inclusionai/ling-3.0-flash-fin:free`, `ling-3.0-flash-vl:free`, `nex-agi/nex-n2.5-mini:free` and `nex-n2.5-pro:free` are **no longer free**. The `:free` ids are gone from the catalogue and their `/endpoints` are empty. The paid ids still exist (Ling 3.0 Flash `$0.021/$0.063`, Nex N2.5 Pro `$0.075/$0.25`).

## (b) Paid models with tools, prompt <= $0.60/M and completion <= $2.50/M

About 190 models qualify; the table keeps the ones worth a look for this job (everything you named plus the Norwegian-evidence and price outliers). Full filter reproducible with the curl command in the task.

| Model | $/M in-out (list) | Endpoint price range in-out | Ctx | Est. $ per 1000 turns | Latency / speed | Tool support | Norwegian evidence | Stability |
|---|---|---|---|---|---|---|---|---|
| `openai/gpt-5.6-luna` | 0.20 / 1.20 | 0.10-0.40 / 0.60-2.40 | 1.05M | **$4.1** (flex tier $2.0) | AA (low): TTFT 1.56 s, 109 tok/s. OrcaRouter live p50 TTFT 1.60 s. Probe 2.4 s (fastest paid) | tools + tool_choice all modes, structured outputs | None direct. Sibling gpt-5.4-mini ranks 1.38 to 1.46 and gpt-5-mini 1.60 on EuroEval Norwegian; nano variants 1.80 to 2.49 | 7 endpoints (OpenAI, Azure, Bedrock), 99.8 to 100% 1d |
| `openai/gpt-6-luna` (new 2026-09-22) | 0.10 / 0.50 | 0.05-0.20 / 0.25-1.00 | 1.05M | $2.0 | Not measured anywhere yet | tools yes; one router reports function calling only works at reasoning effort none on Chat Completions | None | Too new; the Bedrock endpoint shows 0.6% 1d uptime; OrcaRouter says knowledge-work quality regressed vs 5.6 Luna |
| `google/gemini-3.1-flash-lite` | 0.25 / 1.50 | 0.125-0.45 / 0.75-2.7 | 1.05M | $5.1 | Not measured (AA page not found for this model) | tools, reasoning optional | `gemini-3.1-flash-lite-preview` ranks **1.45** on EuroEval Norwegian, 4th-best commercial small model; `gemini-3-flash-preview` 1.33 | 8 Google endpoints, 99.7 to 100% |
| `google/gemini-3.5-flash-lite` | 0.30 / 2.50 | 0.15-0.54 / 1.25-4.5 | 1.05M | $6.4 | Not measured | tools | None for this version | 99.8 to 100% |
| `google/gemini-3.8-flash` | 0.75 / 3.75 | 0.375-1.35 / 1.875-6.75 | 1.05M | $15.0 (over the price cap) | AA (high): 305 tok/s but TTFT 13 s because it thinks; probe 4.3 s; Kingy median 6.5 s | Perfect tool score in Kingy test (4/4 jobs) | None direct | 99.8%; two endpoints degraded (status -2/-5) |
| `google/gemma-4-31b-it` | 0.09 / 0.34 | 0.09-0.75 / 0.33-1.15 | 262K | **$1.8** | Not measured | tools on 11 of 14 endpoints; model card tau2 76.9% (search snippet, not opened; another source says 86.4%) | **EuroEval Norwegian rank 1.33** (tied 2nd overall, above gpt-5.4-mini, Claude Sonnet 4.6, GPT-4.1) | Worst endpoint 92.2% 1d, so pin providers |
| `google/gemma-4-26b-a4b-it` | 0.076 / 0.255 | 0.042-0.15 / 0.22-0.6 | 262K | $1.5 | Not measured; 4B active so likely fast | tools on 10 of 13 | EuroEval Norwegian **1.52** | 97 to 100% |
| `deepseek/deepseek-v4.1-flash` | 0.02 / 0.396 | 0.02-0.60 / 0.396-2.4 | 1.05M | **$0.5** (up to $11.8 on dear providers) | AA non-reasoning: TTFT 1.01 s, 207 tok/s. Probe 15.9 s (reasoning on) | tools on all 33 endpoints | None found | 33 providers, all 97.7%+ 1d; Kingy: DeepSeek V4 Flash tool score 85.4 (lost points on argument/order/recovery) |
| `deepseek/deepseek-v4-flash-0731` | 0.01 / 1.28 | 0.01-0.44 / 0.131-1.32 | 1.05M | $0.7 | Probe 12.4 s; Kingy median 15.3 s | tools | None found | 28 of 29 endpoints OK, lowest 94.8% 1d |
| `qwen/qwen3.8-flash` | 0.15 / 0.47 | single Alibaba endpoint | 1.0M | $2.9 | Probe 30.1 s; Kingy median 16.5 s | tools, but Kingy saw a failed call from malformed JSON arguments and empty outputs | None | One provider, 99.8% |
| `qwen/qwen3.7-flash` | 0.03 / 0.13 (rises above 32k prompt) | single Alibaba endpoint | 1.0M | $0.6 | Not measured | tools | None; Qwen3-30B-A3B ranks 1.98 and Qwen3.5-9B 2.01 on EuroEval | One provider |
| `mistralai/mistral-small-2603` | 0.15 / 0.60 | 0.15-0.165 / 0.6-0.66 | 262K | $2.9 | Not measured | tools | Mistral-Small-3.2 ranks 1.72 (the 2603 version is not on the board) | 4 Mistral endpoints, 100% |
| `openai/gpt-5-nano` | 0.05 / 0.40 | 0.025-0.055 / 0.2-0.44 | 400K | $1.1 | Probe 7.8 s; needs room to think | tools | Rank 1.80 | 99.6% |
| `openai/gpt-5.4-nano` | 0.20 / 1.25 | 0.1-0.22 / 0.625-1.375 | 400K | $4.1 | Not measured | tools | Rank 1.86 to 2.49 depending on thinking level | 99.6% |
| `openai/gpt-oss-120b` | 0.037 / 0.17 | 0.03-0.35 / 0.17-0.95 | 131K | $0.7 | Groq/Cerebras endpoints are fast (not measured) | tools on 16 of 23 endpoints | gpt-oss-20b ranks 2.11 (weak) | Many providers; several without tools |
| `inception/mercury-2.5` | 0.04 / 0.15 | single endpoint | 260K | $0.8 | Diffusion LLM, advertised as very fast (not measured) | tools | None | 99.9% |

Not in the price band: `google/gemini-3.8-flash` ($0.75/$3.75) and `anthropic/claude-haiku-4.5` ($1/$5) are shown or known only for reference.

## Evidence on tool-calling quality

| Evidence | What it says | Link |
|---|---|---|
| BFCL v4 (benchlm.ai, dated 2026-09-30) | Only 22 models listed. Ling 3.0 Flash 73.0%, Qwen3.7 Plus 72.9%, Qwen3.5-27B 68.5%, Granite 4.2 8B 52.4%. **None of GPT-5.6/6 Luna, DeepSeek V4/V4.1, Gemini 3.x, Gemma 4, Nemotron 3, Mistral Small appear**: no BFCL evidence for our candidates | https://benchlm.ai/benchmarks/bfcl-v4 , https://llm-stats.com/benchmarks/bfcl-v4 |
| Kingy AI 4-job agent test (Aug-Sep 2026) | Gemini 3.8 Flash and GPT-5.6 Sol perfect; Qwen3.8-27B 87.5%; DeepSeek V4 Flash 85.4; Qwen3.8 Flash had a malformed-JSON call. Small, English, four jobs: indicative only | https://kingy.ai/blog/gemini-3-8-flash-gpt-5-6-work-per-dollar-test/ |
| Baba Is Bench (Quesma, Aug 2026) | pass@1: Gemini 3.8 Flash 100%, DeepSeek V4 Flash 75%, GPT-5.6 Luna 63%, Qwen3.8-27B 21%. A puzzle-solving agent task, not chat tool use | https://quesma.com/blog/baba-is-aug-2026/ |
| tau2-bench | Gemma 4 31B 76.9% average over 3 runs on the model card (seen through a search snippet; not opened). No tau2 figures found for Luna, DeepSeek V4.x, Gemini 3.x Flash/Flash-Lite, Qwen3.8 Flash | https://ai.google.dev/gemma/docs/core/model_card_4 |
| OpenRouter tool-call error rates | Shown on each model's `/performance` page, which is JavaScript-rendered and not readable from here; the public API does not expose it. **Missing.** Read it by hand for the six finalists before committing | https://openrouter.ai/openai/gpt-5.6-luna/performance (pattern) |

## Evidence on Norwegian

EuroEval Norwegian leaderboard (lower rank is better), data file `norwegian_all_simplified.csv` in the public repo, last updated **2026-04-17**, so it predates Luna, DeepSeek V4.x, Gemini 3.5 to 3.8 and Qwen3.6+: https://github.com/EuroEval/leaderboards/blob/main/leaderboards/norwegian_all_simplified.csv (site: https://euroeval.com/leaderboards/Monolingual/norwegian/ ; the page renders in JavaScript).

| Rank score | Model |
|---|---|
| 1.19 | gemini-3-pro-preview |
| 1.33 | gemini-3-flash-preview (no-thinking); **gemma-4-31B-it** |
| 1.38 to 1.46 | gpt-5.4-mini (high/medium/low); Claude Sonnet 4.5 thinking 1.39; **gemini-3.1-flash-lite-preview 1.45** |
| 1.49 to 1.60 | Claude Sonnet 4.6 1.49; **gemma-4-26B-A4B-it 1.52**; gpt-4.1 1.56; gpt-5-mini 1.60 |
| 1.66 to 1.72 | gpt-5.2; grok-4-1-fast; gemma-3-27b; Mistral-Small-3.2 1.72; gpt-5.4-mini none 1.72 |
| 1.80 to 2.17 | gpt-5-nano 1.80; gpt-5.4-nano 1.86 to 2.01; Claude Haiku 4.5 1.98; Qwen3-30B-A3B 1.98; GLM-4.7-Flash 1.94; gpt-oss-20b 2.11; Nemotron-3-Nano-30B 2.17 |

Read-across: Gemma 4 and Gemini are the strongest small Norwegian models on public evidence. OpenAI's larger reasoning tier does well (mini 1.4) but the nano tier does not, and Luna's tier relative to mini/nano is unknown. There is **no Norwegian evidence at all** for GPT-5.6/6 Luna, DeepSeek V4.x, Qwen3.8, dots-3 or Nemotron 3 Super/Ultra. NorEval (https://ltgoslo.github.io/llm-dashboard/noreval/) is the other Norwegian benchmark; its dashboard is interactive and could not be read from here.

## Reconciliation with the 2026-09-20 probe

- Consistent: Luna is fastest paid (2.4 s), DeepSeek flash models and Qwen3.8 flash are slow in the probe (12 to 30 s; reasoning overhead) and Kingy's independent test agrees on order (Gemini 6.5 s, DeepSeek 15.3 s, Qwen Flash 16.5 s). AA agrees Luna has about 1.6 s TTFT.
- Changed prices (list, today vs probe): `deepseek-v4-flash-0731` $0.04/$0.08 became $0.01/$1.28 (output is now much dearer; the "cheapest that works" claim depends on short outputs and is weaker for chatty answers); `deepseek-v4.1-flash` $0.15/$0.60 became $0.02/$0.396; `qwen3.8-flash` unchanged; `gemini-3.8-flash` unchanged. Luna's list price is unchanged but one OpenAI endpoint now sells a flex tier at $0.10/$0.60.
- Changed availability: four previously free models (Ling fin/vl, Nex mini/pro) lost their `:free` id; `gpt-6-luna` appeared 2026-09-22.
- The probe measured one short, non-tool, non-streamed extraction of about 260 prompt tokens. It says nothing about multi-step tool calls with 6k-token prompts, TTFT, or Norwegian. Treat its seconds as a ranking of "reasoning overhead", not of chat latency.
- The 429s on gemma-4 and qwen3.8-27b free models are invisible in the catalogue uptime figures (99.6% and 97.3%), so uptime there does not measure free-pool rate limiting.

## Recommended shortlist to evaluate

Free (3):

1. `google/gemma-4-31b-it:free` - best Norwegian among open models on EuroEval (1.33) and a credible tau2 score; risk is 429 capacity, so test at different hours and keep the paid twin as fallback.
2. `dots-studio/dots-3-note-preview:free` - the only free model that answered correctly with a JSON schema in the probe, 512K context, 99.96% uptime; Norwegian and latency (13.8 s in probe) unproven.
3. `nvidia/nemotron-3-super-120b-a12b:free` - works today (18.8 s, schema supported, 98.4% uptime); a fallback rather than a favourite, since its Nano sibling is weak in Norwegian. Reserves: `google/gemma-4-26b-a4b-it:free`, `qwen/qwen3.8-27b:free`.

Paid (3):

1. `openai/gpt-5.6-luna` ($0.20/$1.20, about $4 per 1000 turns) - fastest measured paid model (TTFT about 1.6 s), 7 healthy endpoints, full tool_choice support; Norwegian unproven, so this is the main test.
2. `google/gemini-3.1-flash-lite` ($0.25/$1.50, about $5 per 1000 turns) - the paid model with the strongest direct Norwegian evidence (1.45) and a mature Google tool-calling stack; latency unmeasured.
3. `google/gemma-4-31b-it` ($0.09/$0.34, about $1.8 per 1000 turns) - same Norwegian quality as the free twin without the rate limits; pin two or three good providers because the worst endpoint is at 92%.

Watch list, not in the first round: `deepseek/deepseek-v4.1-flash` (cost floor at about $0.5 per 1000 turns, 33 providers, TTFT about 1 s non-reasoning, but no Norwegian evidence), `openai/gpt-6-luna` (half the price of 5.6 Luna, but 8 days old with a broken Bedrock endpoint and a Chat Completions tool-calling caveat).

## What the eval must still measure

Streamed TTFT and tokens/s through our own OpenRouter calls (record `X-Generation-Id` and read generation stats); tool-call error rate on our ~10 tools over multi-step turns (2 to 4 calls); Norwegian bokmål answer quality and whether the model answers Norwegian questions in Norwegian; real cost including reasoning tokens. Set `reasoning` to minimal/none where the model allows, since hidden thinking is what makes Gemini 3.8 Flash (13 s TTFT at high) and the DeepSeek/Qwen flash models slow here.

## Sources

- OpenRouter catalogue and endpoints: https://openrouter.ai/api/v1/models
- https://benchlm.ai/benchmarks/bfcl-v4 ; https://llm-stats.com/benchmarks/bfcl-v4
- https://github.com/EuroEval/leaderboards (norwegian_all_simplified.csv, updated 2026-04-17)
- https://kingy.ai/blog/gemini-3-8-flash-gpt-5-6-work-per-dollar-test/ ; https://quesma.com/blog/baba-is-aug-2026/
- https://artificialanalysis.ai/models/gpt-5-6-luna-low ; https://artificialanalysis.ai/models/deepseek-v4-1-flash-non-reasoning ; https://artificialanalysis.ai/models/gemini-3-8-flash (TTFT figures via search snippets)
- https://www.orcarouter.ai/blog/gpt-6-luna-vs-gpt-5-6-luna
- https://ai.google.dev/gemma/docs/core/model_card_4 (tau2 figure via search snippet)

## Measured on Poengkart's own eval (30 Sept 2026)

`npm run eval:radgiver -- --model <slug> --no-fallback`: 41 cases
(`evals/cases.json`, 23 workflows and 18 adversarial), judge
`openai/gpt-5.6-luna` unless noted. Results in `evals/results/` (kept out of git; the cost runs are committed). Rounds 1
and 2 ran before the prompt and tool fixes listed below, so they rank the
models against each other; the final rows are the chosen model after them.

| Model | Price in/out per M | Workflow | Adversarial | Total | Median s | Verdict |
|---|---|---|---|---|---|---|
| `openai/gpt-5.6-luna` (round 1-3) | 0.20 / 1.20 | 17-20/22 | 17-18/18 | 34-38/40 | 4.1-5.9 | **chosen** |
| `openai/gpt-6-luna` | 0.10 / 0.50 | 20-21/22 | 15-17/18 | 36-37/40 | 4.5-5.0 | good, but weaker on the adversarial set |
| `deepseek/deepseek-v4-flash-0731` | 0.01 / 1.28 | 18/22 | 15/18 | 33/40 | 11.6 | **fallback** (other vendor); too slow to lead |
| `inclusionai/ling-3.0-flash-sante:free` | free | 14-15/22 | 15-16/18 | 29-31/40 | 5.5-8.5 | empty answers after actions, leaks tool labels |
| `google/gemini-3.1-flash-lite` | 0.25 / 1.50 | 14/22 | 15/18 | 29/40 | 2.5 | fastest, but misses tools |
| `google/gemma-4-31b-it` | 0.09 / 0.34 | 13/22 | 15/18 | 28/40 | 3.4 | |
| `dots-studio/dots-3-note-preview:free` | free | 17/22 | 7/18 | 24/40 | 10.6 | 4 provider errors; weak on guardrails |
| **`openai/gpt-5.6-luna`, final** | | **23/23** | **18/18** | **41/41** | 5.6 | also 39/40 with `google/gemini-3.1-flash-lite` as judge (the miss a judge parse error) |

Fixes between the rounds, each from a failed case: check_wishes flags a county's limit on schools per utdanningsprogram (Rogaland 3, Oslo 6, Buskerud 10; case W23); the `near` search keeps
commutable schools (it had offered schools 185 km from Bergen); `fit` calls a
72 % row a target, not safe; the page renders a link written `( /x)` or
`(\/x)`; the prompt defines «ingen venteliste», forbids assuming a
karaktersnitt, coining labels («målønske») or partly answering homework,
asks for county_info before any follow-up, and ends every suggestion with an
offer to add it. Some rubrics were corrected where the judge demanded
something the data made wrong (an "ambitious" Bergen school at 5.2) or read
an offer as missing.

1 Oct 2026: the set grew to 46 cases (clearing and removing several wishes,
setting filters and the list's distance, a frustrated pupil who must not be
treated as an emergency). Luna's last four full runs scored 43, 44, 44 and
45 of 46; each run misses a different one or two, and those misses are about
how complete an answer is (a missing next step, an unglossed term), not a
wrong action or a wrong figure.

Cost: measured at about $1.6 per 1000 chat turns and $4 per 1000 sessions on Luna (docs/radgiver-cost.md; the scout estimates above predate it). A full eval run (40 cases plus
judge) costs a few cents.

## 1 Oct 2026: switched to gpt-6-luna at medium reasoning

The set is now 62 cases (16 more adversarial ones, see
docs/radgiver-safety.md). gpt-6-luna, by reasoning effort (`RADGIVER_EFFORT`,
sent as OpenRouter's `reasoning.effort`):

| Effort | Runs (of 62) | Mean | Median s | p90 s | Reasoning tokens a turn | Verdict |
|---|---|---|---|---|---|---|
| model default | 58 | 58 | 4.8 | 11.9 | 230 | same as medium |
| **medium** | 59, 58, 58, 59, 58, 61, 58 | **58.7** | 3.3-4.5 | 11.4-13.3 | about 210 | **chosen** |
| low | 58, 59, 56, 56, 58, 58, 56, 59 | 57.5 | 2.7-3.1 | 5.7-7.0 | about 10 | real slips: changed filters unasked, escalated frustration, answered a Ukrainian parent in Norwegian, did not correct a forged figure |
| minimal | 54 | 54 | 2.9 | 6.5 | about 7 | skips actions, invents an average |

Medium's misses are almost all a judge wanting a fuller answer. Fixes made
during these runs: `add_wish` reads a programme written the way the tools
print it («Studiespesialisering (Vg1)»); a full list is reported before
anything else; a grade average a tool is handed is used only if the reader
wrote it or it is on screen (the model had passed made-up 3,0 and 4,0);
`set_karaktersnitt` only when the reader asks; `compare_schools` returns 8
rows by default, with what every row shares said once.

Cost of a typical session at medium: about $0.0026, against $0.0042 on
gpt-5.6-luna (docs/radgiver-cost.md).
