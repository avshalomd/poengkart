# Rådgiver: what a session costs (1 October 2026)

Bottom line: a typical session (3.6 user turns, 7 model calls) costs **about $0.004 on `openai/gpt-5.6-luna`, so about $4 per 1,000 sessions**; `openai/gpt-6-luna` does the same for about half; the free `ling` model carries **about 150 such sessions a day** (7 a day without $10 of purchased credits), which covers 1,000 sessions a month but not 10,000.

| Model (list price in / out, $ per M) | quick (1 turn) | school (3) | near (3) | build (8) | review (3) | English (8) | worst (4) | typical session | 1,000 sessions a month |
|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-5.6-luna` (0.20 / 1.20) | 0.0002 | 0.0014 | 0.0038 | 0.0121 | 0.0029 | 0.0112 | 0.0089 | **0.0042** | **$4.2** |
| `openai/gpt-6-luna` (0.10 / 0.50) | 0.0001 | 0.0007 | 0.0019 | 0.0058 | 0.0011 | 0.0064 | 0.0081 | **0.0022** | **$2.2** |
| `deepseek/deepseek-v4-flash-0731` (0.011 / 1.28) | 0.0004 | 0.0022 | 0.0044 | 0.0115 | 0.0036 | 0.0075 | 0.0160 | 0.0045 | $4.5 |
| `google/gemini-3.1-flash-lite` (0.25 / 1.50), estimate | 0.0003 | 0.0017 | 0.0046 | 0.0137 | 0.0033 | 0.0126 | 0.0107 | 0.0049 | $4.9 |
| `google/gemma-4-31b-it` (0.09 / 0.34), estimate | 0.0003 | 0.0013 | 0.0032 | 0.0095 | 0.0023 | 0.0083 | 0.0066 | 0.0034 | $3.4 |
| `inclusionai/ling-3.0-flash-sante:free` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Free tier: flows a day at 1,000 requests (at 50) | 1,000 (50) | 250 (12) | 166 (8) | 58 (2) | 166 (8) | 66 (3) | 90 (4) | **147 (7)** | |
| Model calls per flow (ling) | 1 | 4 | 6 | 17 | 6 | 15 | 11 | 6.8 | |

Cells are dollars per flow. luna and gpt-6-luna cells are means of 2 and 3 runs of the same scripted flow (the model chooses its own tools, so a flow varies by about ±30% between runs); deepseek is 2 runs; ling is 1 run. **Gemini and Gemma were not run**: their cells price luna's token counts at their list prices, so their real step counts and reasoning tokens will differ. The luna, gpt-6-luna and deepseek figures were checked against OpenRouter's own per-call `total_cost` (`GET /api/v1/generation`) on every one of 562 calls: identical to the fifth decimal.

## What was measured

- **Method.** `evals/cost.ts` runs the flows in `evals/flows.json` (7 flows, 20 variants, mostly Norwegian, one English) through the real agent (`makeAgent`, up to 7 calls per turn, 30 Sept 2026 date). It sends the conversation back each turn the way the page does: every earlier tool call and result, but only the last 14 messages (`api/radgiver.ts`), and it applies each screen action (add, remove, move, grade average) to the snapshot between turns. Fallback model off. Results: `evals/results/cost-<model>-<time>.json`.
- **Flow mix** used for "typical session": quick 25%, one open school 20%, schools near a place 20%, build a list 15%, review a list 10%, English parent 7%, worst case 3%. That is 3.6 turns and 7.2 calls per session. The shares are a guess; the per-flow columns let you substitute your own.
- **Prices** (OpenRouter `/api/v1/models`, 1 Oct 2026): luna in 0.20, out 1.20, cache read 0.02, cache write 0.25 per M; gpt-6-luna 0.10 / 0.50 / 0.01 / 0.125; deepseek 0.0108 / 1.28 / 0.0108 (as listed, it is the real billed price); gemini-3.1-flash-lite 0.25 / 1.50 / 0.025; gemma-4-31b-it 0.09 / 0.34 / 0.05.
- **Calls per turn.** luna 2.0, gpt-6-luna 2.4, deepseek 1.7, ling 2.0. By flow on luna: quick 1.0, school 1.3, near 2.3, build 2.3, review 2.2, English 1.9, worst 2.3. Nearly a quarter of luna's turns (28 of 121) are answered without any tool. In the Norwegian county flows the first call is almost always `county_info`, then `compare_schools` or `search_schools`.
- **Seconds per turn** (median over all luna turns 5.9 s, p90 11.5 s). By model on the mid variants: luna 6.5 s, gpt-6-luna 9.5 s, ling 6.2 s, deepseek 21.9 s (reasoning-heavy, up to 93 s on long-message turns).
- **No free-tier 429s** in the ling run, no retries; the account sits at the 1,000-a-day tier.

## Free tier (OpenRouter docs, `limits`, read 1 Oct 2026)

| Credits ever purchased | Requests per minute | Requests per day |
|---|---|---|
| under $10 (the doc says the higher tier starts at about $9) | 20 | 50 |
| $10 or more | 20 | 1,000 |

Every model call counts as one request, and the quota belongs to the one server key, not to each reader. At 2.0 calls a turn that is about **500 turns a day (25 without credits)**, and at 6.8 calls a session about **147 sessions a day (7)**. The per-minute cap of 20 is about 10 turns a minute for the whole site, so a school class opening the chat in the same minute gets 429s even when the day's quota is nowhere near used. The free pool also shares capacity with everyone else: free models returned 429 in the earlier probe (`docs/radgiver-models.md`).

## Monthly projection (typical-session mix, per month of use)

| Sessions a month | gpt-5.6-luna | gpt-6-luna | deepseek | gemini* | gemma* | ling (free) |
|---|---|---|---|---|---|---|
| 100 | $0.42 to 0.53 | $0.22 to 0.27 | $0.45 | $0.49 | $0.34 | carried (3 a day) |
| 1,000 | $4.2 to 5.3 | $2.2 to 2.7 | $4.5 | $4.9 | $3.4 | carried (33 a day, a fifth of the 147 cap) |
| 10,000 | $42 to 53 | $22 to 27 | $45 | $49 | $34 | **not carried** (333 a day average against 147) |

*estimate, see above. The low end is a warm cache, the high end a cold start for every session (below).

Use peaks from January to March, before the 1 March deadline (1 February for fortrinnsrett), and is thin from April to December. Read the rows as the busy month, not as one twelfth of a year. A busy month at 10,000 sessions is 330 a day on average and several times that in the evenings, so the free tier cannot carry it and the 20-a-minute cap would hit first.

## What drives the cost (gpt-5.6-luna, 248 calls)

| Share of the bill | What |
|---|---|
| 48% | **cache writes**: every new token (the user's message, tool results, the last answer) is billed once at the cache-write price, 0.25 per M, a quarter more than plain input |
| 34% | **output**: about 450 tokens per turn, of which about a third is hidden reasoning (12% of the bill) |
| 18% | cache reads: the same prefix re-read at 0.02 per M |
| 0% | uncached input |

- **The 4.5k-token prefix** (system prompt plus tool definitions, identical on every call) is the same for everyone and is read from the cache at one tenth of the price: about 11% of the bill. Caching works: 82% of input tokens were cache reads, 100% on a warm quick question.
- **Cold start.** A prefix that has not been called for a few minutes is written, not read: +$0.0010 on luna (+$0.0005 on gpt-6-luna) for the first call of a session, about +25% on a typical session. At 3 sessions a day that is every session; at hundreds a day it is none. My numbers are warm because my own parallel runs kept the cache hot.
- **History grows, then stops.** The 14-message cap flattens it: the first call of turn 1 is 4.5k tokens, of turn 7 and later about 10 to 11k for ordinary messages, and about 24k with 1,500-character messages. A 10 to 12-turn session costs $0.018 to 0.026 (build 10 turns $0.018, English 12 turns $0.026), and a longer one adds only about $0.0015 to 0.002 a turn, however long the parent keeps going. The worst case (eight turns of 1,490-character messages, every turn a tool lookup) was $0.037, $0.0046 a turn.
- **Tool results.** Averages in characters: `compare_schools` 3,900 (up to 8,300), `search_schools` 3,800, `check_wishes` 2,700, `school_details` 1,900, the rest under 500. Counting the write and every later read, tool results are about 17% of the bill, `compare_schools` alone 10%.
- **Steps.** Each call re-sends everything, but most of it is cached; a second call in a turn costs about $0.0006 against $0.0009 for the first, which carries the writes.

## Three levers, with estimated savings

| Lever | Saves | Cost of doing it |
|---|---|---|
| **Run `openai/gpt-6-luna` instead of gpt-5.6-luna** | **about 48%** on the typical session ($2.2 against $4.2 per 1,000): 40 to 60% on most flows, only about 10% on the worst case | Slower (9.5 s against 6.5 s a turn, 8.0 against 7.2 calls a session). Quality is not measured here: on the 40-case set (30 Sept) it scored 37 and 36 of 40 against 34 to 41 for 5.6. Re-run it before switching |
| **Limit reasoning effort** (the agent sets none today) | 6 to 12% on luna (reasoning is 12% of the bill), 13 to 20% on gpt-6-luna (26% of the bill) | Needs the eval set re-run: advice quality, Norwegian wording and the safety cases are where a model thinking less would show |
| **Shrink the tool results** (`compare_schools` 12 rows to 8, drop the per-row history, short keys) | 4 to 5% | Small; mainly worth it for speed. Do not strip old results from the history: the model quotes figures from them, and they are cache reads anyway, so the most it saves is about 6% (bounded by what those reads cost) |

Not worth doing for money: folding `county_info` into the next tool (saves about 18 calls in 248 and under 2% of the bill, though it also removes a second of waiting and a seventh of free-tier requests) and warming the cache (a ping every five minutes costs about $1.7 a month, which pays only above about 1,700 sessions a month, and then the traffic keeps it warm anyway).

## Surprises

- **Cache writes are billed.** OpenRouter lists `input_cache_write` for the luna models at 1.25 times the input price and bills it on the OpenAI route; half the bill is writes. With a cold cache a call costs more than with no caching at all.
- **The prompt and tool definitions are 4.5k tokens on the first call**, 4.2k in the first measurements, 2.5k for the prompt alone: the prompt in the worktree changed while I measured (the other agent's edits to `api/_radgiver/`), so the figures are for the state of 1 Oct, about 10:50. A change of 1k tokens in the prefix moves a typical session by about 2%.
- **Deepseek is cheap on input and not on output**: input is almost free (0.011 per M), but it thinks a lot (57% of its bill is reasoning, 89% output), takes 22 s a turn and costs the same as luna. Fallback only.
- **gpt-6-luna calls more** (2.4 against 2.0 a turn; 4.2 on the worst case), yet is still half the price because its tokens cost half.
- **Step counts were not higher than expected on luna**: 2.0 a turn, a maximum of 4 (the limit is 7), and 23% of turns needed no tool, often because the earlier result was still in the history. gpt-6-luna is the one that wanders: 15 of its 90 turns took 4 to 6 calls.
- **Harness note for later cost or eval scripts:** in AI SDK 7, `result.response.messages` holds only the last step. Carrying history from it drops every tool call and result and undercounts a long session by about a quarter; take `result.steps.flatMap(s => s.response.messages)` instead (the page itself is not affected, it keeps the whole UI message).
- **Earlier doc figures.** `docs/radgiver-models.md` assumed no caching and about $4 per 1,000 turns for luna; measured, a turn costs $0.0016 on average ($1.6 per 1,000 turns), and a session $0.004.

Spend for this measurement: about $0.80 in all, of which $0.35 is in the kept result files (the rest was two runs discarded after the history bug above).

## Update, 1 Oct 2026: gpt-6-luna at medium reasoning (the default now)

Measured run `evals/results/cost-openai_gpt-6-luna-2026-10-01-09-47-56.json`, after the switch, with
`compare_schools` trimmed to 8 rows. Mean of each flow's variants, typical-session mix as above:

| Flow | quick | school | near | build | review | English | worst | **typical session** |
|---|---|---|---|---|---|---|---|---|
| $ per flow | 0.0001 | 0.0007 | 0.0021 | 0.0055 | 0.0020 | 0.0067 | 0.0167 | **0.0026** |

So about **$2.6 per 1,000 sessions** (about $3.1 with a cold cache), against $4.2 on gpt-5.6-luna.
Medium reasoning costs about the same as the model's own default; low would save roughly a third
more but failed safety cases (docs/radgiver-models.md). The worst flow's slowest turns took 30-46 s.
