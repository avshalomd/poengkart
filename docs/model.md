# The forecast

What the "your points" field computes, how the model behind it is fitted, how
it was tested, and what it cannot know. Everything here is produced by
`tools/model.py`; the numbers are from the August 2026 dataset and are
rewritten into `web/data/model.json` → `meta` on every refresh.

## The question

A threshold is the score of the last applicant who got a place. It exists only
when a programme filled, and when it exists it is one point on the points
scale. A family with 42 points is not asking "what was the threshold" but
"will I get in" — and the honest answer to that is a probability, because the
same programme at the same school moves by a standard deviation of 6.3 points
from one year to the next (3 156 year-to-year pairs; only half of all moves are
within ±3).

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
similar ones around it instead of being trusted on its own — 564 of the 1 653
series have exactly one year.

**Level** (on the 5 259 cells that carry a number):

    y = μ + school + category + programme|level + series + county×year + round offset + ε

**Fill** (on all 7 734 cells that competed on points — number, 0,0 or "no waitlist"):

    logit P(filled) = ν + school + category + programme|level + series + county×year + round-3 shift

*County×year* is a random walk, so a county's market level moves smoothly and
the newest year is the forecast for the next. *Series* is the school×programme
interaction: a school can be strong in music and ordinary in electro.
Variance components come from a few steps of the usual normal-normal EM
approximation; observations are down-weighted with age (half-life chosen by the
backtest — it barely mattered, 4 years won by 0.03 RMSE over no decay).

Fitted variance components (points): school 3.4, programme 3.1, series 2.7,
county×year innovations 1.3, residual 4.5. On the logit scale for fill: school
1.3, programme 1.4, series 1.7.

**Coupling the two fits** — "in demand" as one trait read two ways, so that a
school whose thresholds are high is also one whose programmes fill — was
tried as a plug-in of the level model's school effect into the fill model,
with the backtest as judge. It did not help: fill log-loss on the calibration
years 0.4081 coupled against 0.4071 independent, so the fits stay independent
(`meta.coupled`). The fill model's own school effect already carries what the
level's would add; the refit is kept behind a flag for the day a county with
thresholds but no fill history makes it matter.

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
years of history the series had when it was forecast:

| history | s |
|---|---|
| 0 years | 7.7 |
| 1 year | 6.2 |
| 2–3 years | 5.6 |
| 4+ years | 4.6 |

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

**Level, held-out 2025–26** (1 497 cells that got a number):

| history | n | model RMSE | "last year's figure" RMSE | programme-county mean RMSE | within ±3 |
|---|---|---|---|---|---|
| 0 years | 269 | 7.4 | — | 8.1 | 34% |
| 1 year | 169 | 5.8 | 7.7 | 6.8 | 41% |
| 2–3 years | 352 | 5.6 | 7.1 | 6.6 | 42% |
| 4+ years | 707 | 5.0 | 5.9 | 6.1 | 52% |

The 80% interval (m ± 1.28 s) contained the published figure 82% of the time.

**Fill.** The hurdle's series effects make it sure of itself: programmes it
gave 0.97 filled 0.82 of the time in the held-out years. So π is passed
through a two-parameter recalibration learned on the calibration years
(logit π′ = −0.13 + 0.45 logit π). Held-out Brier 0.164 against 0.204 for the
base rate.

**Chance, held-out 2025–26**, for every cell and every score in
{20, 25, …, 55} — "did an applicant with x points get a place":

| predicted | observed | n |
|---|---|---|
| 0–10% | 2.5% | 486 |
| 10–20% | 8% | 1 123 |
| 20–30% | 21% | 1 281 |
| 30–40% | 35% | 1 152 |
| 40–50% | 42% | 939 |
| 50–60% | 56% | 894 |
| 60–70% | 61% | 799 |
| 70–80% | 77% | 1 040 |
| 80–90% | 88% | 1 235 |
| 90–100% | 98.5% | 8 027 |

Brier 0.097, against 0.150 for the rule "last year's figure is the cutoff".
From 30% up the forecast is within five points of what happened; below 30% it
is a few points optimistic — a 15% chance was really about 8% — which the app's
bands absorb (both are "unlikely") but a reader of the raw percentage should
know. The walk-forward forecasts themselves are in `data/model-backtest.csv`.

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
Against the raw mean that the map colours by, ranking the 137 schools with five
or more figures by α instead moves the average school 16 places, and the most
extreme by 65: a good part of a raw mean is what the school teaches, not how
hard it is to get into. The panel prints α with an approximate standard error;
it is a measure of demand, not of quality, and the app says so.

## The model as a detector

The 25 cells the fitted model finds least plausible are listed in
`meta.outliers` (|z| ≥ 3: 49 of 5 259 cells). Six of the top twenty-five were
Vestland 2022 — clustering of that kind has meant a parser problem before, so
the three largest were checked against the county's own PDF
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
- Below a 30% chance the forecast is a few points optimistic; the bands hide
  this, the raw percentage does not.

## Files

- `tools/model.py` — everything above; `--quick` fits without the backtest
- `tools/test_model.py` — invariants: probabilities, monotonicity in points,
  coverage, spread ≥ residual, and that the backtest the app quotes is in the file
- `web/data/model.json` — per school α, per programme (m, s, π, history), `meta`
- `data/forecasts.csv`, and the `forecasts` table in `data/poengkart.db`
- `data/model-backtest.csv` — every walk-forward forecast and its outcome
