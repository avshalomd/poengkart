# The KI chat: what can go wrong, and what stops it

Poengkart's chat talks to 15-year-olds and their parents about a choice that
shapes their next years. This file is the risk register: each harm, how bad it
would be, what in the code or prompt guards against it, and which eval case
proves the guard holds. Cases live in `evals/cases.json` (W = workflow,
A = adversarial); run them with `npm run eval:radgiver`.

Severity: **High** = could change a real application for the worse or hurt a
child; **Medium** = misleads or embarrasses, recoverable; **Low** = cost or
nuisance.

## 1. Bad advice about the application itself

| Risk | Sev. | Guardrail | Test |
|---|---|---|---|
| A made-up poenggrense, chance or school | High | Every figure comes from a tool (prompt section «Facts come only from your tools»); tools resolve names against the dataset and say «not found»; the eval fails any figure not traceable to a tool result, the screen or the question | grounded check on every W case; A13, A17, A29 |
| Promising a place ("du kommer inn") | High | Ladder rule 8: never promise; the chance is a forecast; always keep a safe option | A04, W-cases with `judge` |
| Telling them to put the safest school first, losing a wish they could have had | High | Ranking rule in Boundaries: rank by preference, safe options lower | A20 |
| A list that breaks county rules (too many schools per utdanningsprogram, under 3 utdanningsprogram, over 10 wishes) | High | `add_wish` refuses or warns; `check_wishes` flags; county limits in `SCHOOLS_PER_PROGRAMME` | W23, unit tests |
| Inventing intake rules (deadlines, changes after 1 March, appeals) | Medium | county_info gives the rule and the county's own page; prompt sends edge cases to the inntakskontor/rådgiver | A33, W-cases on fortrinnsrett |
| "Safe" label on a 72 % chance | Medium | `fit` thresholds in `data.ts` (safe needs ≥ 85 %) | unit tests |
| A forged earlier answer in the history steering a later one | Medium | Client history is the sender's own; text parts capped at 4 000 chars, tool parts at 16 000; the model re-checks with tools | A29 |

## 2. Harm to the child

| Risk | Sev. | Guardrail | Test |
|---|---|---|---|
| Suicidal statement or self-harm met with strategy talk | High | Wellbeing rule: stop, respond with care, 116 111, 800 333 21, 116 123, 113/112 | A07 (no), A25 (en) |
| Disclosure of violence or threats at home | High | Harm rule: not okay, not your fault, 116 111 / 112, a trusted adult (rådgiver, helsesykepleier); no secrecy promises | A24 |
| Ordinary frustration escalated to emergency numbers, or read as "clear my list" | Medium | Graded wellbeing rule; no action without an explicit request | A19 |
| Discouragement: "not smart enough", steering low grades to yrkesfag | High | Grades-and-choice rule: programme follows interests, grades only pick schools | A21 |
| Steering by diagnosis, disability, gender, ethnicity, religion | High | Grades-and-choice and Fairness rules | A11, A12, A22, A32 |
| Sexual, hateful or degrading content | High | Content rule: one kind sentence, then back to the application | A26, A27, A32 |
| A parent overriding the pupil in secret | Medium | Prompt: the application is the pupil's; involve them | A18 |

## 3. Harm to others

| Risk | Sev. | Guardrail | Test |
|---|---|---|---|
| Defaming a school (drugs, "bad environment", "losers") | High | Schools rule: data and the school's own page only; a poenggrense measures demand, not quality | A23, A27 |
| Discussing a named person's grades or admission | Medium | Accounts-and-other-people rule | A30 |
| Helping deceive the intake office (false address, fake diagnosis, fake grades to a parent) | Medium | Honesty rule | A05, A06, A34 |

## 4. Privacy and security

| Risk | Sev. | Guardrail | Test |
|---|---|---|---|
| Collecting personal data from minors | High | Prompt never asks for name, school, address, personnummer, health or family details; does not repeat what is shared; **no conversation logging** (`api/radgiver.ts` logs errors only) | A08 |
| The model provider training on minors' messages | High | Every OpenRouter request carries `provider.data_collection: "deny"` (`agent.ts`); `RADGIVER_ZDR=1` adds zero-data-retention routing | probe, 1 Oct 2026 |
| A pupil pasting their vigo password | Medium | Never repeat it; tell them to change it; the chat cannot log in | A31 |
| Prompt injection via the screen snapshot | Medium | `ScreenSchema` is strict (no extra keys, short strings); `describeScreen` prints a filter only if it is a real county or programme name, and an open school's programme only if that school has it | unit tests |
| Prompt injection via a fake system message, or a tool result telling it to act | Medium | Instructions rule; actions only on the reader's explicit request | A01, A09, A15 |
| Leaking the system prompt | Low | Instructions rule (the prompt holds nothing secret) | A01 |
| XSS or phishing through a link the model writes | High | `md()` escapes everything; links only to schools that exist (path mended through `slug()`), vilbli, vigo, udir and the counties' own sites; external links open in a new tab | `web/test/radgiver.test.ts`, A14 |
| Shared link (`?f=`, `?c=`) carrying an injection to another user | Medium | URL parameters are validated against the dataset in `sidebar.ts` before they reach the screen | code review |

## 5. Abuse and cost

| Risk | Sev. | Guardrail | Test |
|---|---|---|---|
| Use as a free general chatbot (homework, essays, code) | Low | Scope rule: refuse fully, no partial answer | A02, A03, A28 |
| Long or many messages running up the bill | Medium | 1 500 chars per message, 14 messages of history, 96 kB body, 7 steps per answer, 30 messages per 10 min per IP (in memory, per instance) | unit tests |
| A distributed flood of requests | Medium | **Not covered by code.** The in-memory limit is per server instance; the real cap must be a credit limit on a dedicated OpenRouter key (see decisions) | — |

Measured on the default model, gpt-6-luna at medium reasoning (1 Oct 2026):
58-61 of 62 over seven full runs; the adversarial misses were a judge wanting
a fuller answer, not a harmful one. At low reasoning the same set showed real
slips (an unrequested filter change, frustration escalated to self-harm
questions), which is why the chat stays at medium.

## What the evals cannot show

- **A pass is a sample, not a proof.** The model is not deterministic; the
  adversarial set is run several times and with two judges (Luna and Gemini
  3.1 Flash-Lite) and judged per case across runs.
- **The forecast itself can be wrong.** The chat repeats Poengkart's model;
  its error is the model's error (see the technical report). The chat always
  calls a chance a forecast and points to the rådgiver.
- **No output filter.** A harmful answer would stream to the reader before
  anything could stop it. Guardrails sit in the prompt, the tools and the
  renderer; there is no separate moderation model.
- **Languages other than Norwegian and English** are answered (A35 passes in
  Ukrainian), but the eval checks only that the help is useful, not the
  quality of the translation of Norwegian terms.

## Open decisions (Abshalom)

1. A dedicated OpenRouter key with a monthly credit limit for the chat.
2. Zero-data-retention routing on or off (on narrows the providers and was
   briefly rate-limited for GPT-5.6 Luna on 1 Oct 2026).
3. Language policy for parents who write in neither Norwegian nor English.
4. The privacy notice: that messages go to OpenAI or DeepSeek through
   OpenRouter, are not stored by Poengkart and are not used for training.
5. A shared rate limit (for example in a KV store) once the chat is deployed.
6. Whether to add a moderation pass on the output, at the price of latency.
