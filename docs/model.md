# The forecast

What the "your points" field computes, how the model behind it is fitted, how
it was tested, and what it cannot know. Everything here is produced by
`tools/model.py`; the numbers are from the September 2026 dataset and are
rewritten into `web/public/data/model.json` → `meta` on every refresh.

## The question

A threshold is the score of the last applicant who got a place. It exists only
when a programme filled, and when it exists it is one point on the points
scale. A family with 42 points is not asking "what was the threshold" but
"will I get in" — and the honest answer to that is a probability, because the
same programme at the same school moves by a standard deviation of 6.2 points
from one year to the next (8 541 consecutive-year pairs; only half of all
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
similar ones around it instead of being trusted on its own —406 of the 2 579
series have exactly one year.

**Level** (on the 12 999 cells that carry a number):

    y = μ + school + category + programme|level + series + county×year + round offset + ε

**Fill** (on the 18 611 cells that competed on points — number, 0,0 or "no waitlist".
In Møre og Romsdal "no waitlist" is the county's own dashboard rule, a
figure under 25 — see `docs/data-notes.md` — so its labels are a proxy, and
the backtest measures what they are worth, below):

    logit P(filled) = ν + school + category + programme|level + series + county×year + round-3 shift

*County×year* is a random walk, so a county's market level moves smoothly and
the newest year is the forecast for the next. A county-year that holds only a
region or a programme or two of the county (`PARTIAL_YEARS`: Vestland
2014–2020, Akershus 2012–2015, Oslo 2013 and 2016, Rogaland 2012 and 2017, Trøndelag
2024) sits in one pooled level per county outside the walk: its cells train
the other effects without setting the county's level. (Akershus 2012–2014 is
Røyken alone, from Buskerud's table while the school was in Buskerud;
`former_county` in `schools.json`.) *Series* is the school×programme
interaction: a school can be strong in music and ordinary in electro.
Variance components come from a few steps of the usual normal-normal EM
approximation; observations are down-weighted with age (half-life chosen by the
backtest — it barely mattered, 4 years won by 0.027 RMSE over no decay). A
threshold that equals the admitted mean (Gjennomkar, which Møre og Romsdal
publishes beside every figure) is one applicant's score; the backtest chose
its level-fit weight among {1, ½, ¼, 0} and kept 1 — 65 cells cannot move
it.

Fitted variance components (points): school 3.1, programme 3.1, series 2.6,
county×year innovations 0.9, residual 4.6. On the logit scale for fill: school
1.0, programme 1.1, series 1.6

**Coupling the two fits** — "in demand" as one trait read two ways, so that a
school whose thresholds are high is also one whose programmes fill — is a
plug-in of the level model's school effect into the fill model, with the
backtest as judge on every refit. Earlier builds rejected it (0.406 coupled
against 0.403 independent); with the Innlandet 2020–2022 backfill the
verdict flipped, and on the current panel it reads 0.448 coupled against
0.449, so the shipped hurdle is coupled (`meta.coupled`). This is exactly the day the flag was kept for,
though the margin is inside its own noise: a cluster bootstrap over
school×year puts the difference at [−0.003, −0.000], and on the held-out
years the two variants score the same fill Brier.

**What each cell means to the model.** A number of 10,0 or more is an
observation of the level and counts as *filled*. "No waitlist" is *not filled* and says nothing
about the level — it is a state, not a low number. 0,0 counts as *filled* and
stays out of the level fit: it is the bottom of the scale, not a height on it,
which is the rule the app already applies everywhere else. F, D and U never
competed on points and enter neither fit. A number between 0 and 10 counts as
*not filled*, like "no waitlist": a full grade record scores at least 10,0, so
the last one admitted had grades missing and everyone with a full record got
in. Oslo's intake office explained the rule on 5 Oct 2026: an applicant with
fewer than seven counting numeric grades is scored as the sum of their grades
divided by 16, times ten, instead of 0 (`cell_state` in `tools/model.py`).

**Rounds.** Within a county the published round is mostly fixed, so it is
absorbed by the county level and need not be known — this is also why
Buskerud, which does not state its round for most years, is no problem. A
3. inntak year inside a county's series gets a fixed offset per category from
the round bridge below, so the random walk does not learn the dip as a market
event; Vestland 2023 was that year until its 1. inntak file was recovered
(5 September 2026), and no county-year currently needs it. The historical
years added on 26 September 2026 bring the other kind of exception: a
1. inntak year inside a 2. inntak series (Akershus 2012–2015, Rogaland 2012 and 2017),
a year whose source states no round inside a series that does (Rogaland
2015, the school portal) and the one stated round inside an unstated series
(Buskerud 2012–2014, 1. inntak). These have no bridge. Akershus's and
Rogaland's 1. inntak years are all excerpts, so the county's pooled partial
level absorbs the difference and the walk never sees it; Buskerud 2012–2014
and Rogaland 2015 are whole years, and the walk takes each as that year's
level, one innovation across the gap to the county's next published year. `round_years` in `schools.json` lists them, with `null` for
an unstated year, and the app says so beside those years.

**Counties with history only.** Agder (2016–2017 and 2020–2021, from the
intake office's counsellor decks) and Nordland (2013–2015 and 2019–2021,
from the county's statistics books) publish nothing today. They are in the
dataset and the app, and in no fit, backtest, score or forecast
(`HISTORY_ONLY` in `tools/model.py`, `meta.history_only_counties`): a
forecast would be for 2022, a year long past, and their figures rest on a
reading of offsets the counties never explained (Agder's hundreds, Nordland's
800-point county supplement), which the pooled fit should not lean on.

**Counties outside the model.** Telemark is in the dataset and the app but
in neither fit, neither backtest nor any score (`HELD_OUT` in
`tools/model.py`, `meta.held_out`). Its workbook gives the lowest points
among those admitted for every offered programme, also where everyone got
in, so its numbers are not poenggrenser in the other counties' sense and
there is no fill state to read. A fit that included it (report v1.10,
17 September 2026) lost 0.5 points of RMSE on one-year series and doubled
the county-year share of the between-school variance. Every figure in this
note is over the other eight counties.

Its schools are still forecast, by a **satellite fit** (`Satellite`): with
the model above finished, μ and the category and programme effects are held
fixed as an offset, and only Telemark's own school, series and county×year
effects are fitted, on Telemark's cells, with the model's own taus. π is pinned at 1 because the
county has no fill state, so the chance rests on the threshold alone. The
walk-forward never sees these cells, so the spread is measured on
Telemark's own years instead (`satellite_backtest`): fit the panel on the
other counties' years before T and the satellite on Telemark's, predict
Telemark's year T. Over 110 cells in 2025–2026 that is an RMSE of 7.78
against 8.98 for persistence, and every Telemark forecast carries 7.8 as
its spread — the model's own buckets, 5.1 to 6.8, covered 63% of those
outcomes where they claimed 80%. The app quotes that measurement on every
Telemark school. The county rejoins
the model when it states, per programme and year, whether everyone was
admitted.

## Spread, and why it is not the model's own

A hierarchical fit is sure of itself. The residual sd is 4.6 points, but the
forecast for next year also carries the uncertainty of every effect and of
the market move, and for a series with one year of history the effects are
mostly borrowed. So *s* is not taken from the fit at all: it is the RMSE of the
walk-forward forecasts (below) in the calibration years, bucketed by how many
years of history the series had when it was forecast — floored at the
residual sd of the newest fit that saw no held-out year (4.5), so the
held-out years cannot narrow their own intervals:

| history | s |
|---|---|
| 0 years | 6.8 |
| 1 year | 6.0 |
| 2–3 years | 5.6 |
| 4+ years | 5.1 |

That history component is then scaled by the band the forecast falls in — a
queue cannot outgrow its applicants' scores, so high forecasts miss by less:
×1.06 below 25 points, ×1.00 from 25 to 40, ×1.00 from 40 to 45, ×0.75 at 45 and above (fitted on
the calibration years, constrained to fall with the level;
`meta.sigma_level_multiplier`). On the held-out years it moved the top
band's 80% coverage from 95.5% to 81.8% and the bottom band's from 64.9% to
70.3%, and nothing else.

Last, a factor per level group, fitted so each group's 80% band covers 80%
of its own calibration-year errors (`meta.sigma_group_multiplier`): ×0.899
for Vg1 and ×1.003 for Vg2 and up. Without it the pooled spread covered
83.5% of held-out Vg1 outcomes and 77.4% of the rest.

And a factor for a series whose two newest figures are more than 8 points
apart (`meta.jump_points`), fitted the same way on the cells after such a
step and on the rest (`meta.sigma_jump_multiplier`): ×1.222 after a jump
and ×0.976 otherwise. Without it the spread covered 73.0% of held-out
outcomes after a jump and 81.2% of the rest; with it, 81.3% and 80.3%. The
app flags such a step as «Uvanlig endring» (the forecast's `j`, the step
in points).

Every county is forecast for the same intake: the next one that has not
happened yet, moving on each 1 July, when the offers go out and before any
county publishes that year's thresholds (`tools/forecast_year.py`,
`meta.forecast_intake`; decided 28 September 2026). Until 30 June 2027 that is
the 2027 intake, school year 2027/28. A county that has not yet published the
intake just held (Trøndelag on 3 October 2026, `meta.forecast_ahead`; Buskerud until its 2026/27 thresholds arrived that day) is
then forecast two years past its newest figure, from the same random walk,
so the level is unchanged and only the spread grows: a walk-forward with the
year before each test year withheld measures the factor the same way
(`meta.sigma_ahead_multiplier`), ×1.033. Two years ahead the held-out
RMSE is 5.87 against 5.45 a year ahead, and the band covers
80.3% of those outcomes with the factor and 78.1% without.

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

**Level, held-out 2025–26** (2 648 cells that got a number):

| history | n | model RMSE | "last year's figure" RMSE | programme-county mean RMSE | within ±3 |
|---|---|---|---|---|---|
| 0 years | 127 | 7.4 | — | 8.2 | 32% |
| 1 year | 263 | 5.8 | 7.1 | 6.8 | 49% |
| 2–3 years | 475 | 5.7 | 6.7 | 6.5 | 45% |
| 4+ years | 1783 | 5.2 | 6.2 | 6.0 | 49% |

Exponential smoothing of the series' own figures (α = 0.4; Muth, 1960) is a
stronger baseline than either: RMSE 6.0 with two or three years of history
and 5.3 with four or more, against the model's 5.7 and 5.2 — most of the
model's margin over "last year's figure" on long series is smoothing, not
pooling.

**Steadily rising series.** Where a Vg1 series never fell over its
newest three or four figures and the forecast sits 4 or more points below
the last one, the backtest has been there 81 times: the published figure
came in below the last one 82.7% of the time, the model's RMSE was
5.89 against 7.62 for persistence and 5.69 for the EWMA, and it
under-forecast by 1.23 points on average (95% CI [-0.02, 2.48]). So the
drop mostly comes, a little smaller than forecast. A trend term (the
error regressed on the forecast's gap below the last figure, slope
0.123 fitted on 2020–2024) takes the held-out Vg1 RMSE from 4.891 to
4.827: not enough to add one (`meta.halflife_search.rising_series_check`).

The 80% interval (m ± 1.2816 s) contained the published figure 81% of the time.

**Fill.** The hurdle's series effects make it sure of itself: programmes it
gave 0.96 filled 0.88 of the time in the held-out years. So π is passed
through a two-parameter recalibration learned on the calibration years
(logit π′ = 0.195 + 0.661 logit π). Scored on all eight counties, Møre og
Romsdal's proxy labels included: held-out Brier 0.156 against 0.203 for the
base rate. Held out of the fill fit instead, with its fill probability
fixed at 1 as it was until 5 September 2026, the other seven counties'
held-out Brier goes from 0.1584 to 0.1577 and the Platt slope from 0.661 to
0.586; on the county's own 730 held-out cells the proxy-labelled hurdle
scores 0.150 against 0.180 for its base rate
(`meta.halflife_search.proxy_label_experiment`).

**Chance, held-out 2025–26**, for every cell and every score in
{20, 25, …, 55} — "did an applicant with x points get a place":

| predicted | observed | n |
|---|---|---|
| 0–10% | 5.5% | 2058 |
| 10–20% | 17.1% | 2 427 |
| 20–30% | 28% | 1 864 |
| 30–40% | 38% | 1 503 |
| 40–50% | 47% | 1 444 |
| 50–60% | 60% | 1 460 |
| 60–70% | 73% | 1 556 |
| 70–80% | 83% | 1 693 |
| 80–90% | 89% | 2 061 |
| 90–100% | 99.0% | 13 998 |

Brier 0.091, against 0.156 for the rule "the last published figure is the
cutoff", on the pairs where that rule is defined (over all pairs the model's
Brier is 0.093). The fairer comparison centres the same spread, error
distribution and fill probability on the last published figure instead of
on the forecast: that scores 0.095, so most of the gain over the bare rule
is the uncertainty treatment, and the model's own point forecast is worth
the last 0.006 of it.
Below 60% the forecast is within 4.3 points of the outcome in every bin,
optimistic by at most 0.2 points in the three lowest — a 15% chance was
really 17% — which the app's bands absorb (both are "unlikely"); from 60%
up it is cautious — a stated 65% came true 73% of the time, the largest gap
in any bin. The walk-forward forecasts themselves are in `data/model-backtest.csv`.

## The round bridge

Akershus publishes both 1. and 2. inntak, Vestland both 1. and 3.; the same
programme in the same year, in two rounds, is a direct measurement of what a
later round does:

| | pairs with a queue in both | later − earlier | of the queues present in the earlier round, gone by the later |
|---|---|---|---|
| Akershus, 1. → 2. inntak | 101 | −3.4 (sd 3.1) | 16% of 124 |
| Vestland, 1. → 3. inntak | 1436 | −3.0 (sd 3.9) | 37% of 2 275 |

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
Decomposing the raw mean that the map colours by, over the 189 schools whose
α rests on five or more fitted cells: the school's own effect explains 44%
of the variance between schools, the programme mix 24%, the county's level
that year (which inntak it publishes, and its market) 12%, and the series
interactions 10%. Ranked within their own county by α instead of by raw
mean, schools move 3.3 places on average and at most 26 — a good part of a
raw mean is what the school teaches and when its county publishes, not how
hard it is to get into. The panel prints α with an approximate standard
error; it is a measure of demand, not of quality, and the app says so.
Schools are never ranked across counties: the published inntak differs, and
the county level is the largest single term after the school's own.

## The model as a detector

The 25 cells the fitted model finds least plausible are listed in
`meta.outliers` (|z| ≥ 3: 107 of 12 999 cells, 38 of them in Vestland, the
county with the most cells). Five of the top twenty-five are Vestland 2022 — clustering of that kind has meant a parser
problem before, so
three of them, the largest included, were checked against the county's own PDF
(`vestland_2022-23_1inntak.pdf`): Dale helse- og oppvekstfag Vg1 **12,50**,
Slåtthaug automatisering Vg2 **18,00**, Fitjar helsearbeiderfag Vg2 **48,80**
— all printed exactly so. They are real extremes, not damage; the cluster is
Vestland having the most cells. Figures printed between 0 and 10, such as
Kongsberg's 2025 figure of 4,0 for musikk, dans og drama, are not extremes
either: they are shown as printed and the model reads them as *not filled*
(above), so they never reach the level fit.

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
- It does not know the number of places. Each county adopts next year's
  offer (the skoletilbudssak) every autumn, and a cut or an expansion at one
  school and programme can move its threshold far more than the history
  suggests. The backtest's spread absorbs the changes of past years on
  average, not a known change at a given school; the panel says so beside
  every forecast. Vestfold's intake office raised it in September 2026.
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
- `web/public/data/model.json` — per school α, per programme (m, s, π, history), `meta`
- `data/forecasts.csv`, and the `forecasts` table in `data/poengkart.db`
- `data/model-backtest.csv` — every walk-forward forecast and its outcome
