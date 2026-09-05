# The forecast

What the "your points" field computes, how the model behind it is fitted, how
it was tested, and what it cannot know. Everything here is produced by
`tools/model.py`; the numbers are from the September 2026 dataset and are
rewritten into `web/data/model.json` → `meta` on every refresh.

## The question

A threshold is the score of the last applicant who got a place. It exists only
when a programme filled, and when it exists it is one point on the points
scale. A family with 42 points is not asking "what was the threshold" but
"will I get in" — and the honest answer to that is a probability, because the
same programme at the same school moves by a standard deviation of 6.2 points
from one year to the next (4 668 consecutive-year pairs; only half of all
moves are within ±3).

So the app forecasts, per programme, for the county's next publication year:

- **m** — the expected threshold, if a queue forms
- **s** — how far that forecast is typically off, measured rather than assumed
- **π** — the probability a queue forms at all

and turns them into one number for the reader:

    P(place | x points) = (1 − π) + π · F((x − m) / s)

Either nobody is turned away, or the cutoff lands below your score. F is the
empirical distribution of the backtest's own forecast errors (see *Spread*).

## The model

Two fits, one structure. Every effect is a random effect, so a school or
programme with a single year of data borrows its level from the hundreds of
similar ones around it instead of being trusted on its own —530 of the 2 026
series have exactly one year.

**Level** (on the 7 639 cells that carry a number):

    y = μ + school + category + programme|level + series + county×year + round offset + ε

**Fill** (on the 11 479 cells that competed on points — number, 0,0 or "no waitlist".
In Møre og Romsdal "no waitlist" is the county's own dashboard rule, a Vg1
figure under 25 — see `docs/data-notes.md` — so its labels are a proxy, and
the backtest measures what they are worth, below):

    logit P(filled) = ν + school + category + programme|level + series + county×year + round-3 shift

*County×year* is a random walk, so a county's market level moves smoothly and
the newest year is the forecast for the next. *Series* is the school×programme
interaction: a school can be strong in music and ordinary in electro.
Variance components come from a few steps of the usual normal-normal EM
approximation; observations are down-weighted with age (half-life chosen by the
backtest — it barely mattered, 4 years won by 0.011 RMSE over no decay). A
threshold that equals the admitted mean (Gjennomkar, which Møre og Romsdal
publishes beside every figure) is one applicant's score; the backtest chose
its level-fit weight among {1, ½, ¼, 0} and kept 1 — 14 cells cannot move
it.

Fitted variance components (points): school 3.2, programme 3.2, series 2.6,
county×year innovations 1.2, residual 4.5. On the logit scale for fill: school
1.0, programme 1.3, series 1.6

**Coupling the two fits** — "in demand" as one trait read two ways, so that a
school whose thresholds are high is also one whose programmes fill — is a
plug-in of the level model's school effect into the fill model, with the
backtest as judge on every refit. Earlier builds rejected it (0.406 coupled
against 0.403 independent); with the Innlandet 2020–2022 backfill the
verdict flipped, and on the current panel it reads 0.470 coupled against
0.471, so the shipped hurdle is coupled (`meta.coupled`). This is exactly the day the flag was kept for,
though the margin is inside its own noise: a cluster bootstrap over
school×year puts the difference at [−0.005, +0.004], and on the held-out
years the two variants score the same fill Brier.

**What each cell means to the model.** A number > 0 is an observation of the
level and counts as *filled*. "No waitlist" is *not filled* and says nothing
about the level — it is a state, not a low number. 0,0 counts as *filled* and
stays out of the level fit: it is the bottom of the scale, not a height on it,
which is the rule the app already applies everywhere else. F, D and U never
competed on points and enter neither fit.

**Rounds.** Within a county the published round is fixed, so it is absorbed by
the county level and need not be known — this is also why Buskerud and
Trøndelag, which do not state their round, are no problem. The one exception
is Vestland 2023, published from 3. inntak inside a 1. inntak series; those
cells get a fixed offset per category from the round bridge below, so the
random walk does not learn the dip as a market event.

## Spread, and why it is not the model's own

A hierarchical fit is sure of itself. The residual sd is 4.5 points, but the
forecast for next year also carries the uncertainty of every effect and of
the market move, and for a series with one year of history the effects are
mostly borrowed. So *s* is not taken from the fit at all: it is the RMSE of the
walk-forward forecasts (below) in the calibration years, bucketed by how many
years of history the series had when it was forecast — floored at the
residual sd of the newest fit that saw no held-out year (4.3), so the
held-out years cannot narrow their own intervals:

| history | s |
|---|---|
| 0 years | 7.9 |
| 1 year | 6.3 |
| 2–3 years | 5.5 |
| 4+ years | 4.5 |

That history component is then scaled by the band the forecast falls in — a
queue cannot outgrow its applicants' scores, so high forecasts miss by less:
×1.09 below 25 points, ×1.01 from 25 to 45, ×0.72 at 45 and above (fitted on
the calibration years, constrained to fall with the level;
`meta.sigma_level_multiplier`). On the held-out years it moved the top
band's 80% coverage from 96.7% to 82.0% and the bottom band's from 73.2% to
75.6%, and nothing else.

F, the error distribution, is likewise the empirical distribution of those
standardised errors (41 quantiles in `meta.error_quantiles`) rather than a
bell curve. It is slightly left-heavy — thresholds collapse more often than
they jump — though on this data the Gaussian would have done about as well.

## The backtest

Forecast each year 2020–2026 from everything published before it; 2020–2024
are used to calibrate *s*, F and the fill recalibration, 2025–2026 are held out
and reported here. Vestland's 2023 round-3 cells are excluded from scoring —
no earlier year can teach a forecast what that does, and the final fit handles
it with the fixed offset; grading the model on an event it is told about would
flatter nothing and mislead the calibration.

**Level, held-out 2025–26** (1 964 cells that got a number):

| history | n | model RMSE | "last year's figure" RMSE | programme-county mean RMSE | within ±3 |
|---|---|---|---|---|---|
| 0 years | 159 | 8.2 | — | 9.8 | 30% |
| 1 year | 255 | 5.7 | 7.0 | 6.5 | 50% |
| 2–3 years | 547 | 5.5 | 7.0 | 6.2 | 44% |
| 4+ years | 1003 | 5.0 | 5.9 | 5.9 | 51% |

Exponential smoothing of the series' own figures (α = 0.4; Muth, 1960) is a
stronger baseline than either: RMSE 6.2 with two or three years of history
and 5.1 with four or more, against the model's 5.5 and 5.0 — most of the
model's margin over "last year's figure" on long series is smoothing, not
pooling.

The 80% interval (m ± 1.2816 s) contained the published figure 81% of the time.

**Fill.** The hurdle's series effects make it sure of itself: programmes it
gave 0.97 filled 0.88 of the time in the held-out years. So π is passed
through a two-parameter recalibration learned on the calibration years
(logit π′ = 0.123 + 0.577 logit π). Scored on all eight counties, Møre og
Romsdal's proxy labels included: held-out Brier 0.158 against 0.205 for the
base rate. Held out of the fill fit instead, with its fill probability
fixed at 1 as it was until 5 September 2026, the other seven counties'
held-out Brier goes from 0.159 to 0.161 and the Platt slope from 0.577 to
0.502; on the county's own 223 held-out cells the proxy-labelled hurdle
scores 0.148 against 0.186 for its base rate
(`meta.halflife_search.proxy_label_experiment`).

**Chance, held-out 2025–26**, for every cell and every score in
{20, 25, …, 55} — "did an applicant with x points get a place":

| predicted | observed | n |
|---|---|---|
| 0–10% | 4.3% | 1402 |
| 10–20% | 13.7% | 1 494 |
| 20–30% | 24% | 1 374 |
| 30–40% | 38% | 1 232 |
| 40–50% | 44% | 1 050 |
| 50–60% | 59% | 1 067 |
| 60–70% | 66% | 1 134 |
| 70–80% | 80% | 1 268 |
| 80–90% | 87% | 1 503 |
| 90–100% | 98.6% | 11 060 |

Brier 0.090, against 0.156 for the rule "the last published figure is the
cutoff", on the pairs where that rule is defined (over all pairs the model's
Brier is 0.092). The fairer comparison centres the same spread, error
distribution and fill probability on the last published figure instead of
on the forecast: that scores 0.096, so most of the gain over the bare rule
is the uncertainty treatment, and the model's own point forecast is worth
the last 0.006 of it.
Below 70% the forecast is within 3.7 points of the outcome in every bin,
optimistic by at most 1.6 points in the three lowest — a 15% chance was
really 14% — which the app's bands absorb (both are "unlikely"); from 70%
up it is cautious — a stated 75% came true 80% of the time, the largest gap
in any bin. The walk-forward forecasts themselves are in `data/model-backtest.csv`.

## The round bridge

Akershus publishes both 1. and 2. inntak, Vestland both 1. and 3.; the same
programme in the same year, in two rounds, is a direct measurement of what a
later round does:

| | pairs with a queue in both | later − earlier | of the queues present in the earlier round, gone by the later |
|---|---|---|---|
| Akershus, 1. → 2. inntak | 101 | −3.4 (sd 3.1) | 16% of 124 |
| Vestland, 1. → 3. inntak | 910 | −3.2 (sd 3.8) | 32% of 1 348 |

The drop is conditional on the queue surviving; the right-hand column is the
rest of the story. It differs by programme: in Vestland, studiespesialisering
−5.3 and påbygging −5.9 against electro −1.7 and building −2.6. The bridge is
reported in `meta.round_bridge` and used for the Vestland 2023 correction; a
common "round-1 equivalent" scale across counties is *not* shown, because
applying Akershus's offsets to Rogaland would be an assumption dressed as a
measurement.

## Mix-adjusted school level

The school effect α from the level fit is the school's thresholds relative to
the same programmes elsewhere in its county, with its programme mix taken out.
Decomposing the raw mean that the map colours by, over the 181 schools whose
α rests on five or more fitted cells: the school's own effect explains 48%
of the variance between schools, the programme mix 24%, the county's level
that year (which inntak it publishes, and its market) 10%, and the series
interactions 9%. Ranked within their own county by α instead of by raw
mean, schools move 2.9 places on average and at most 19 — a good part of a
raw mean is what the school teaches and when its county publishes, not how
hard it is to get into. The panel prints α with an approximate standard
error; it is a measure of demand, not of quality, and the app says so.
Schools are never ranked across counties: the published inntak differs, and
the county level is the largest single term after the school's own.

## The model as a detector

The 25 cells the fitted model finds least plausible are listed in
`meta.outliers` (|z| ≥ 3: 72 of 7 639 cells, 33 of them in Vestland, the
county with the most cells). Six of the top twenty-five are Vestland 2022 — clustering of that kind has meant a parser
problem before, so
three of them, the largest included, were checked against the county's own PDF
(`vestland_2022-23_1inntak.pdf`): Dale helse- og oppvekstfag Vg1 **12,50**,
Slåtthaug automatisering Vg2 **18,00**, Fitjar helsearbeiderfag Vg2 **48,80**
— all printed exactly so. They are real extremes, not damage; the cluster is
Vestland having the most cells. Kongsberg's 2025 figure of 4,0 for musikk,
dans og drama, after a "by documentation" in 2024, is the one still open.

## The final round, where the county publishes an earlier one

Vestland publishes 1. inntak and the app forecasts that figure. But a family is
admitted, if at all, by the last round — and Vestland also publishes 3. inntak,
so the gap is measured on its own cells (the bridge above, per category where
there are at least ten pairs). For a Vestland programme the app therefore also
gives the chance *by 3. inntak*:

    P(place by round 3) = (1 − π) + π · (v_c + (1 − v_c) · F((x − m − δ_c) / s))

with v_c the share of round-1 queues gone by round 3 and δ_c the drop where
they survived, both per category. It appears in the chip's tooltip and as a
sentence in the chance block. Oslo publishes round 1 only and has no later
figures, so the app says that and nothing more; Akershus's 1. inntak pairs
could give the reverse (the first-offer chance for a round-2 county) and are
left for later.

## My choices

Families rank several choices, and the real question is whether the list
holds. The list enforces vigo's own limits — ten ranked wishes, and at most
three different utdanningsprogram at Vg1 — so it can only hold an application
that could actually be submitted; without the cap, adding wish after wish
drives the at-least-one figure toward certainty for an application no county
would accept. A + on any programme row collects it into a list in the control panel;
with points set, each choice carries its chance, the list is summarised as
likely / possible / unlikely counts, and the chance of at least one place is
shown as 1 − Π(1 − pᵢ) with a tooltip saying the choices are treated as
independent and that this overstates a little — a hard year hits several of
them at once. If none of the choices is likely the list says so.

## What it cannot know

- It is a model of the *marginal applicant*, not of you: it ignores that you
  compete only at your highest surviving choice, tie-breaking, and places
  consumed by the priority and documentation quotas.
- It forecasts the figure *as the county will publish it*, in the county's own
  round. Where the county publishes 1. inntak, more people get in by the final
  round than the number says; the round bridge above is how much, on average.
- A threshold in a catchment county applies only to applicants resident in the
  intake area; the panel says so where it applies.
- The at-least-one figure for a list of choices assumes independence; the
  truth is lower, by an amount this data cannot measure.
- Published chances could move where people apply, which moves the cutoffs.
  Small at this scale, real in principle.
- The raw percentage is within two points of the outcome below 30% and up
  to five points cautious in the 70–80% bin; the bands absorb both.

## Files

- `tools/model.py` — everything above; `--quick` fits without the backtest
- `tools/test_model.py` — invariants: probabilities, monotonicity in points,
  coverage, spread ≥ residual, and that the backtest the app quotes is in the file
- `web/data/model.json` — per school α, per programme (m, s, π, history), `meta`
- `data/forecasts.csv`, and the `forecasts` table in `data/poengkart.db`
- `data/model-backtest.csv` — every walk-forward forecast and its outcome
