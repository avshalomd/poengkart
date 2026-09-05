# Poengkart: Open Admission Thresholds and a Calibrated Forecast for the Norwegian Upper-Secondary Intake

**Abshalom Dayan**
Technical report · September 2026 · v1.7 (version history in Appendix D)
Application: [poengkart-no.vercel.app](https://poengkart-no.vercel.app) · Code and data: [github.com/avshalomd/poengkart](https://github.com/avshalomd/poengkart)

---

## Abstract

Admission to Norwegian upper-secondary school is a centralised, points-based
intake with about 80,000 first-year applicants a year, yet its most
decision-relevant statistic — the admission threshold (*poenggrense*), the
points of the last applicant admitted to each programme at each school — is
published by only eight of fifteen counties, mostly as PDF tables, with
inconsistent structure, retention, and semantics. We assemble every edition
we could retrieve into an open, register-normalised panel: 217 schools,
2,405 programme rows, 12,241 observations, 2012–2026, keyed to Norway's
national programme register (Grep). On this censored panel we forecast the
next intake as the probability of admission given the applicant's points,
using a hurdle model: a hierarchical logistic model for whether a programme
fills, and a hierarchical Gaussian model with a random-walk county–year level
for where the threshold lands if it does. Spread is estimated from
walk-forward errors rather than from the fit, the error distribution is
empirical, and fill probabilities are Platt-recalibrated. Evaluated
walk-forward with 2025–2026 held out, the model beats persistence,
exponential-smoothing and group-mean baselines on RMSE in every history
stratum where they are defined (4.97 vs 5.94 and 5.11 points on series with
four or more observed years; cluster-bootstrap intervals exclude zero), nominal 80% intervals cover
80.9% [78.9, 82.7] of outcomes, and the admission probability is calibrated
to within 5.2 points in every decile and beats both a deterministic and a
probabilistic persistence rule (Brier 0.090 vs 0.156 and 0.096). Paired
within-year publications identify an intake-round effect of −3.2 to −3.4
points that makes cross-county comparison of raw thresholds misleading.
Code and data: https://github.com/avshalomd/poengkart.

---

## 1. Introduction

In most Norwegian counties, admission to upper-secondary school
(*videregående opplæring*) is a points-based queue. Applicants rank
programme–school combinations in the counties' joint application portal,
vigo.no, and each programme admits by descending lower-secondary grade
points until its capacity is reached. The points of the last admitted
applicant — the *poenggrense*, or admission threshold — is a market-clearing
cutoff, re-set every year by that year's cohort. For a family choosing where
to apply, the distribution of plausible thresholds at each candidate
programme is the central planning quantity.

That quantity is public only in fragments. Eight of Norway's fifteen
counties (*fylker*) publish thresholds at all — one of them only inside a
Power BI dashboard, obtained here as an extract on request. Those that do
publish tables that differ in structure, in retention (Oslo's archive
reaches 2017; Akershus publishes only the latest year), in which of up to
three intakes the figures describe — often without stating which — and in
the notation used for special cases, such as programmes that filled with
applicants who had no points. No national, machine-readable, or historical
compilation exists. Forecasting from such data is hard for structural
reasons: a threshold exists only where demand exceeded capacity, so the
panel is censored by construction; a quarter of the series have a single
observed year; and the published figure is intake-specific, so identical
demand can print different numbers in different counties.

To the best of our knowledge, no prior work forecasts admission thresholds
in the Norwegian intake, and published work on cutoff forecasting in any
centralised score-based admission system is thin (Section 3). This report
describes **Poengkart** ("points map"), an open dataset, forecasting model,
and deployed application. Our contributions are as follows:

- **An open, register-normalised dataset** of every retrievable published
  threshold — 217 schools, 2,405 programme rows, 12,241 cell-level
  observations across 8 counties and the years 2012–2026 — in which every
  row is resolved against the national Grep register and every cell's state
  (numeric threshold, filled at zero, no waiting list, quota-based
  admission) is preserved as data (Section 4).
- **A calibrated probabilistic forecast** of the next intake, P(admission |
  applicant's points), from a hurdle model with hierarchical partial pooling
  and a random-walk county–year component, whose predictive spread is
  estimated from walk-forward forecast errors rather than model internals
  (Sections 5–6).
- **A held-out evaluation** on the 2025–2026 intakes, with cluster-bootstrap
  uncertainty, showing the model beats persistence and group-mean baselines
  on RMSE in every history stratum (4.97 vs 5.94 and 5.91 points in the
  deepest stratum), covers 80.9% of outcomes with nominal 80% intervals,
  and produces calibrated probabilities that beat both a deterministic and
  a probabilistic persistence rule (Brier 0.090 vs 0.156 and 0.096), plus
  ablations of the structural choices (Section 7).
- **Measurements of the publication practice itself**: a paired within-year
  estimate of the intake-round effect (−3.2 to −3.4 points, 16–32% of
  queues cleared between intakes), a decomposition of raw school means into
  demand, programme mix and market timing, and a residual-based audit that
  distinguishes genuine extremes from parsing damage (Section 8).

Section 9 describes the deployed application; Sections 10–12 give
limitations, ethical considerations, and recommendations to the publishing
counties.

## 2. Institutional background

**Points and applications.** Norwegian pupils finish compulsory school with
a points total (*grunnskolepoeng*): ten times the mean of their final
grades on the 1–6 scale, a maximum of 60; pupils without grades compete
"without points". Applications go through vigo.no, the counties' joint
application portal, by 1 March. An applicant to the first year (Vg1) must
name three programmes of study (*utdanningsprogram*) in order of
preference and has a statutory right to a place on one of them
(opplæringslova § 5-1); the form takes up to ten ranked wishes, each a
programme at a school. For the 2025–26 intake, 80,144 pupils applied to
Vg1 and 210,866 to all levels (Utdanningsdirektoratet, 2025). The
programme structure is national, maintained by the Directorate for
Education and Training (Udir) in the **Grep** register: 15
utdanningsprogram subdivided into *programområder* (programme areas)
across year levels Vg1–Vg3, plus the one-year *påbygging* to general
university admission, which the counties publish beside them and which we
carry as a sixteenth programme.

**Intakes.** Counties run the intake in up to three publications
(*inntak*) in July–August, numbered "1. inntak", "2. inntak", "3. inntak"
as on the applicant's letter; we use *inntak* and *intake* interchangeably
below and say "round" only for the code's `round_bridge`. In each intake
every programme admits by descending points among remaining applicants;
seats declined in one intake are re-offered in the next, so thresholds fall
between them (Section 8.1 measures how much). The published threshold is
the points of the last admitted applicant *in the published intake* — and
counties differ in which one they publish, sometimes without saying.
Statutory priority admission (*fortrinnsrett*) and admission on documented
grounds (*inntak etter dokumentasjon*: International Baccalaureate, elite
sport) bypass the points queue entirely.

**Catchment.** Whether an applicant competes county-wide or within an
intake area (*inntaksområde*) is set by each county's own admission
regulation. Oslo and Rogaland run a county-wide points queue (Oslo:
FOR-2025-01-29-147); Møre og Romsdal likewise. Akershus admits within three
intake regions (FOR-2025-02-13-354, in force from 1 January 2025), Innlandet
requires the nearest school offering the programme as the first wish
(FOR-2024-12-17-3529 § 2-4), and Buskerud, Trøndelag and Vestland give
residents of an intake area priority. Where catchment applies, a published
threshold binds only applicants resident in the area, and the application
says so.

**Two shocks in the panel's window.** Written examinations were cancelled
in 2020, 2021 and 2022, so those cohorts' grunnskolepoeng rest on
classroom grades alone; the national mean rose from 41.9 in 2019 to 43.2 in
2020 and fell back to 42.4 in 2023 (Statistics Norway, table 07495), a
shift of the whole points scale that a threshold model sees as a county-year
level move. And the county map changed twice: Innlandet (2020, from Hedmark
and Oppland) and Vestland (2020, from Hordaland and Sogn og Fjordane) were
formed at the start of the panel's dense years, and on 1 January 2024 Viken
was dissolved into Akershus, Buskerud and Østfold, so Akershus's and
Buskerud's series start in 2024 with no earlier county to inherit from.

Two structural facts shape everything downstream. First, a threshold exists
only where demand exceeded capacity: undersubscribed programmes have no
waiting list (*ingen venteliste*) and no threshold, so the dataset is
**censored by construction**, and the censoring is informative — it is
exactly the "no queue" event our fill model predicts. Second, the published
figure is **intake-specific**: comparing thresholds across counties without
knowing the intake conflates market differences with administrative timing.

## 3. Related work

**School choice and matching markets.** Centralised admission mechanisms
descend from deferred acceptance (Gale & Shapley, 1962); their analysis and
design as school-choice mechanisms is a mature literature (Abdulkadiroğlu &
Sönmez, 2003). In large score-priority markets, stable outcomes are
characterised by market-clearing cutoffs (Azevedo & Leshno, 2016) — the very
object we forecast — and cutoffs figure as sufficient statistics in
empirical work on centralised admission (Fack, Grenet & He, 2019). In
Norway, Kirkebøen, Leuven & Mogstad (2016) use the university-admission
cutoffs as a regression discontinuity to estimate returns to fields of
study; the upper-secondary cutoffs studied here have not, to our knowledge,
been compiled or modelled. This literature designs and analyses mechanisms;
it does not forecast next year's cutoffs for applicants.

**Information and beliefs in centralised admissions.** Applicants
misjudge their admission chances, and the misjudgement has consequences:
Kapor, Neilson & Zimmerman (2020) show that families in New Haven hold
inaccurate beliefs about admission probabilities and that the resulting
application mistakes are costly, and Arteaga et al. (2022) show in Chile and
New Haven that many applicants submit "smart" lists that nonetheless leave
them unassigned, and that a warning about the risk changes behaviour. A
calibrated public forecast of cutoffs is the informational instrument those
papers point to; our contribution is the forecast and its evaluation, not
the effect of providing it, which we cannot measure (Section 10).

**Norwegian school choice.** The Norwegian debate has been about the
admission rule rather than its outcome data: Sandsør (2020) reviews the
Norwegian and international evidence on free school choice versus catchment
for the Ministry's consultation, and Serediak & Helland (2020) simulate
alternative intake models on Oslo's applicant data and their effect on
segregation between schools. Our data are the thresholds those rules
produce, which is why we present them without ranking schools (Section 11).

**Cutoff prediction.** Direct prior art is thin. The closest published work
we know of predicts admission score lines in China's Gaokao system (Chen,
Peng, Gao & Cai, 2022). Our setting differs in scale and structure — many
small county-level queues with short histories rather than one national
exam — which motivates partial pooling and makes calibrated probabilities,
not point predictions, the deliverable.

**Hierarchical models and shrinkage.** Borrowing strength across small
groups by partial pooling is classical (James & Stein, 1961; Efron & Morris,
1975) and is standard multilevel practice (Gelman & Hill, 2007). We apply it
to a censored panel in which 530 of the 2,026 series with any numeric
threshold have a single observation, with variance components estimated by
an EM-type procedure (Dempster, Laird & Rubin, 1977).

**Censored and two-part models.** Treating "no queue formed" as censoring of
a latent threshold descends from Tobin (1958); we instead use a two-part
hurdle specification (Cragg, 1971), because the fill event is observed and
economically distinct from the threshold's level, and because the
application needs the fill probability as its own output.

**Calibration and forecast evaluation.** Post-hoc recalibration by a fitted
logistic map is Platt scaling (Platt, 1999; Niculescu-Mizil & Caruana,
2005; Guo, Pleiss, Sun & Weinberger, 2017). Probabilities are scored with
the Brier score (Brier, 1950), a strictly proper scoring rule (Gneiting &
Raftery, 2007), and reliability diagrams (DeGroot & Fienberg, 1983; Murphy,
1973); interval forecasts are judged by the calibration-and-sharpness
criterion (Gneiting, Balabdaoui & Raftery, 2007). Taking the predictive
distribution from the forecaster's own past errors rather than from the
model is an old idea in forecasting (Williams & Goodman, 1971) and is the
principle behind conformal prediction (Vovk, Gammerman & Shafer, 2005; Lei
et al., 2018); Section 6 is a stratified, non-exchangeable version of it,
and Section 7.3 reports where its coverage guarantee holds and where it
does not. Our temporal evaluation follows rolling-origin practice (Tashman,
2000; Bergmeir & Benítez, 2012; Hyndman & Athanasopoulos, 2021).

**Open government data.** The fragmentation documented in Section 4 is a
known failure mode of public-sector open data — publication without
machine-readability, stable identifiers, or retention (Janssen, Charalabidis
& Zuiderwijk, 2012); Section 12 turns our error classes into concrete
publishing recommendations.

## 4. Data

### 4.1 Sources and extraction

The sources are the counties' own publications — typically one PDF per
county per year, occasionally per intake — together with tables released to
us on request (Section 4.4). Each county has a dedicated extractor feeding a
shared normaliser. PDFs are read by coordinate rather than by text flow:
columns are sliced by x-position, and rotated column headers (Oslo,
Vestland) are reconstructed glyph by glyph. Editions that counties
overwrote or removed were recovered from the Internet Archive where it
holds them; "every edition we could retrieve" is the honest description of
the panel, not "all editions that ever existed" — Oslo, for one, published
thresholds before 2017, and the one older edition the archive holds (2009,
2. inntak) is kept under `sources/` but not ingested, because a single
year sixteen intakes back would enter the model only as noise. School names
are matched to the national school register (NSR) within county and
geocoded via NSR, the national address API, and the national place-name
register, in that order. Where two publications disagree on a cell, the
newer wins and the disagreement is retained in `data/source-drift.json`; a
disagreement near a full grade point flags the school-year as uncertain,
and the application says so in words. A bare integer below 8 in a cell is
read as a fragment of a course code rather than a threshold, but a printed
decimal below 8 is always a threshold — no course code carries a decimal
separator, and the counties do print figures like 4,0. A suite of 88
regression checks locks known failure modes: shifted year columns,
implausible values, unmatched schools, county-specific quirks, and the
decimal rule itself.

### 4.2 Register normalisation

Programme labels vary in spelling across counties and across years within a
county. Every row is resolved against Grep: 2,399 of 2,405 rows carry a
register code (the remaining six are International Baccalaureate, outside
the register). The classification into utdanningsprogram is therefore the
state's own, not ours — an earlier keyword classifier misfiled
*gartnernæring* (horticulture) under restaurant and food processing because
the substring "ernæring" (nutrition) matched. County intake groups are finer
than Grep codes (one school can run several queues under one code), so each
row keeps the county's own label as its identity and carries the register
code and official name as metadata. Levels follow the counties' tables:
mostly Vg1, with Vg2, Vg3, a fourth-year Vg4 (in Rogaland and Vestland) and
a combined Vg2/Vg3 group where the county prints one.

### 4.3 Cell semantics

A cell in a county table is not always a number, and the non-numbers are
distinct events, not missing data. Table 1 gives the taxonomy, in the
counties' own terms, and how each state enters the analysis.

**Table 1:** Cell states in county publications and their treatment. "Level"
and "fill" refer to the two model components of Section 5.

| Cell | Meaning | In averages? | In the model? |
|---|---|---|---|
| e.g. 38.4 | Poenggrense: waiting list; last admitted had 38.4 points | yes | level + filled |
| 0.0 | Filled, but last admitted competed without points | **no** | filled, never level |
| ingen venteliste | No waiting list; every qualified applicant admitted; no threshold exists | no | not filled |
| F / D / U | Fortrinnsrett / inntak etter dokumentasjon / utgått (discontinued) | no | outside both parts |

One county's "ingen venteliste" is a published rule rather than an observed
state. Møre og Romsdal's dashboard masks every Vg1 figure under 25 points
with * and legends it «alle kom inn, eller at laveste karakter var under
25» (everyone admitted, or the lowest score under 25); the extract behind
it prints the number, and we apply the county's rule so that the panel
shows what the county publishes (Section 4.4).

Two consequences are enforced throughout. The dataset is censored by
construction, so averages of published numbers are averages over the queued
subset, and the fill indicator carries the rest of the signal. And 0.0 is a
trap: it prints like a number but is the bottom of the scale, not a height
on it — including it in a mean drags a school's level toward zero for the
opposite reason a genuinely low threshold does.

### 4.4 Coverage

Table 1b lists the panel county by county: the years held, the intake the
county publishes, and how the cells divide among the states of Table 1.

**Table 1b:** The panel by county. "Intake" is the publication the figures
describe, as stated by the county or confirmed to us; "—" where the county
does not say. Cell columns use the tokens of Table 1.

| Fylke | Years | Intake | Cells | Poenggrense | Ingen venteliste | 0.0 | F | D | U | Levels | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Akershus | 2024–2026 | 2. (2025 also 1.) | 453 | 333 | 91 | 3 | 0 | 26 | 0 | Vg1 | web page (2025/26); two workbooks released on request (2024/25, 2026/27) |
| Buskerud | 2024–2025 | — | 153 | 131 | 17 | 0 | 0 | 5 | 0 | Vg1 | county web page |
| Innlandet | 2020–2026 | 2. | 2,511 | 1,194 | 1,240 | 55 | 0 | 12 | 10 | Vg1–Vg2 | vilbli PDFs; 2020–2022 released on request |
| Møre og Romsdal | 2012–2026 | 2. | 1,790 | 1,228 | 562 | 0 | 0 | 0 | 0 | Vg1 | extract behind the county's Power BI dashboard, sent on request; figures under 25 shown as ingen venteliste by the dashboard's own rule |
| Oslo | 2017–2026 | 1. | 765 | 609 | 89 | 0 | 0 | 67 | 0 | Vg1 | yearly PDFs; 2026 as a web page |
| Rogaland | 2018–2025 | 2. | 3,411 | 1,514 | 1,255 | 0 | 482 | 73 | 87 | Vg1–Vg4 | rolling multi-year PDFs via vilbli; one Wayback edition |
| Trøndelag | 2025 | — | 174 | 72 | 102 | 0 | 0 | 0 | 0 | Vg1 | five regional PDFs via vilbli |
| Vestland | 2017–2026 | 1. (2023: 3.) | 2,984 | 2,558 | 416 | 10 | 0 | 0 | 0 | Vg1–Vg4 | county PDFs; 2017–2019 as Hordaland press releases |

Innlandet's 2020–2022 tables and Akershus's 2024/25 and 2026/27 workbooks
were released to us under freedom-of-information requests in August 2026
rather than published (Innlandet confirmed nothing older survives; the
Akershus workbooks are 2. inntak only and were never published). Møre og
Romsdal's extract — fifteen years behind the county's dashboard — was
released in September 2026, and the county confirmed the figures describe
the second, final intake. Vestland's 2017–2019 editions are a narrower
Bergen-area series of studiespesialisering cells.

Of the 2,026 school×programme series that ever carry a numeric threshold,
530 have exactly one observed year. Among the 12,241 cells, 11,479
competed on points and inform the fill model, and 7,639 carry a numeric
threshold and thus inform the level model. Møre og Romsdal's extract also
carries the admitted mean (Gjennomkar), which no other county publishes;
where it equals the threshold, one applicant set the figure. Fourteen of
the county's 1,228 numeric cells are of that kind, and Section 7.5 reports
what down-weighting them does. Møre og Romsdal's 562 "ingen
venteliste" cells are of a different kind from the other counties'. The
extract behind the dashboard has no fill state of its own — every offered
programme carries a number, down to 5.7 — but the dashboard the county
publishes never prints a Vg1 figure under 25: it masks the cell with * and
legends it «Ruter markert med * betyr at alle kom inn, eller at laveste
karakter var under 25», and the extract reproduces the mask exactly (every
starred 2026/27 cell has a figure under 25, every unstarred cell 25 or
more). We apply the county's rule: a figure under 25 enters the panel as
"ingen venteliste", the state the county shows rather than the number it
hides, which the county's intake adviser confirmed as the intended reading
for Vg1 given the county's high fill rates. It is a proxy label. A
programme with a queue whose cutoff was 24.6 is labelled open, and one that
admitted everyone with a weakest applicant at 27 keeps its number; the
share it produces, 31% of the county's cells, sits between Vestland's 14%
and Innlandet's 50%. Section 7.5 measures what the proxy labels are worth
— to the county's own fill forecast and to the seven counties whose labels
are observed — and the county may link capacity data during 2027, which
would replace the rule with the state. From 2 to 5 September 2026 the
county was instead held out of the fill model with its fill probability
fixed at 1; Appendix D records the change.

The non-publishing counties either state that they choose not to publish
(Agder, Nordland, Østfold) or publish aggregate statistics without
thresholds. The unevenness is a property of the publication regime, not of
the collection: for several counties and periods, county-wide thresholds
were never computed, because admission ran on catchment rather than points.

## 5. Forecasting model

### 5.1 Notation and target

A **series** $i$ is one school×programme×level queue; $sc[i]$, $p[i]$,
$a[i]$, and $c[i]$ denote its school, utdanningsprogram, programme area, and
county, and $r(i,t)$ the intake its county published in year $t$. In
year $t$, $Q_{it} \in \{0, 1\}$ indicates that the cell filled (a queue
formed), and $y_{it}$ is the published threshold, observed only when
$Q_{it} = 1$ and the last admitted applicant had points ($y > 0$). For an applicant
with points $x$, the deployed quantity for the county's next publication
year is

$$P(\text{place} \mid x) \;=\; (1 - \pi) \;+\; \pi \, \Phi_F\!\left(\frac{x - m}{s}\right), \tag{1}$$

where $\pi$ is the forecast probability that a queue forms, $m$ the forecast
threshold conditional on a queue, $s$ the forecast spread (Section 6.1), and
$\Phi_F$ the CDF of the standardised forecast error (Section 6.2). Equation
(1) is the hurdle decomposition: either no one is turned away, or admission
requires the cutoff to land at or below $x$. One state sits outside the
decomposition: a cell that fills with the last admitted applicant holding no
points (the 0.0 state of Table 1) counts as $Q = 1$ but contributes no $y$ —
admission there is certain at any score, and the calibration in Section 7.4
scores it as such; the empirical recalibration of $\pi$ absorbs the
approximation.

### 5.2 Two components, one hierarchy

The **level** component models the observed thresholds:

$$y_{it} \mid Q_{it} = 1,\, y_{it} > 0 \;\sim\; \mathcal{N}\!\left(\mu + \alpha_{sc[i]} + \beta_{p[i]} + \gamma_{a[i]} + u_i + w_{c[i],t} + \rho_{r(i,t)},\; \sigma^2\right), \tag{2}$$

and the **fill** component the queue-formation event:

$$\operatorname{logit} P(Q_{it} = 1) \;=\; \nu + \alpha'_{sc[i]} + \beta'_{p[i]} + \gamma'_{a[i]} + u'_i + w'_{c[i],t} + \rho'_{r(i,t)}. \tag{3}$$

$\mu$ and $\nu$ are intercepts. Four terms are random effects with
mean-zero Gaussian priors and estimated variances: school ($\alpha$),
programme area within level ($\gamma$), the series interaction $u_i$ (a
school can be strong in music and ordinary in electrical), and the
county–year effect $w$. The programme-area effect $\gamma$ is keyed by the
county's own label and level, not by Grep code, because one code can cover
several county queues (Section 4.2); the register enters as metadata, not
as a pooling key. The utdanningsprogram effect $\beta$ is an
(essentially unpenalised) fixed effect — with only 16 levels it needs no
pooling — and the round terms $\rho$ are fixed too: in the fill model an
unpenalised 3. inntak indicator, and in the level model a plug-in constant
taken from the round bridge rather than an estimated coefficient
(Section 5.4). The county–year effect follows a random walk,

$$w_{c,t} \;=\; w_{c,t-1} + \eta_{c,t}, \qquad \eta_{c,t} \sim \mathcal{N}(0, \tau_w^2), \tag{4}$$

so a county's market level moves smoothly and its latest state is the
forecast for next year; an innovation spans two *consecutive published*
years, so a publication gap is one step, not one step per calendar year.
Four partial county-years are pooled out of the walk: Vestland 2017–2020,
that is the Hordaland press releases of 2017–2019 (fifteen Bergen-area
studiespesialisering cells) and the Vg1-only 2020 publication with no
"ingen venteliste" state. Their cells still train the school, programme and
series effects, but they share one pooled level outside every walk, so the
county's level starts where its first full publication does. The pooled
partial level serves as a fallback for the level walk only where a county
has no non-partial fitted year at all — Vestland in the 2020 and 2021
walk-forward folds — while the fill walk keeps the neutral level there,
because the partial years' fill labels are uninformative by construction.
The level component is fitted on the 7,639 cells with a numeric threshold;
the fill component on the 11,479 cells that competed on points (Section 4.4). The hierarchy exists to borrow strength: a series with
one observed year inherits its level from the hundreds of comparable series
around it — partially pooled toward its school, programme, and county means
— instead of being trusted alone.

### 5.3 Estimation

Effects are estimated by penalised maximum likelihood — a ridge whose
penalties are the inverse prior variances — with the variance components
updated by a few rounds of the standard normal–normal EM approximation, in
which each posterior is taken as diagonal (the posterior variance of an
effect is computed from its own precision, ignoring correlation with the
other effects). This is the usual first-order approximation; its known bias
is to understate posterior variance and hence to shrink the estimated
$\tau$ slightly toward zero, which we accept because the spread that the
application shows comes from Section 6, not from these components. The
residual $\sigma$ is the RMS of the fitted residuals without a
degrees-of-freedom correction, and each $\tau$ is floored at 0.3 points.
The school, programme-area and series effects are separately identified
only through their priors — a series effect and its school effect are
exchangeable on a series-only school — so the random-walk levels carry a
small ridge and the intercepts absorb the common level; the reported
decomposition of Section 8.2 is therefore the penalised one, not a unique
one. The pipeline is deterministic. Observations are exponentially
down-weighted with age; the half-life of 4 years was selected by the
backtest and mattered little (Section 7.5). A threshold that equals the
admitted mean — one applicant's score, flagged in 14 Møre og Romsdal cells
— enters the level fit at a weight the backtest chooses among {1, ½, ¼, 0};
it chose 1 (Section 7.5). Table 2 reports the fitted standard deviations.

**Table 2:** Fitted variance components (standard deviations) of the four
random-effect families. Level components in points; fill components on the
logit scale. The fixed effects ($\mu$, $\nu$, $\beta$, $\rho$) have no
variance component.

| Component | Level (points) | Fill (logit) |
|---|---|---|
| School | 3.2 | 1.0 |
| Programme area (within level) | 3.2 | 1.3 |
| Series (school×programme) | 2.6 | 1.6 |
| County–year innovation | 1.2 | 0.9 |
| Residual | 4.5 | — |

Coupling the components — the level model's school effect entering the
fill model as an offset, so "in demand" is one trait read two ways — is
adjudicated by the backtest on every refit. Earlier builds rejected it;
with the Innlandet backfill it wins on the calibration years, by a margin
whose interval includes zero (Section 7.5), and the deployed hurdle is
coupled.

### 5.4 Intakes

Within a county the published intake is constant, so it is absorbed by the
county level and need not be known — which is why counties that do not state
their intake remain usable. The one exception in the data, Vestland 2023
(published from 3. inntak inside a 1. inntak series), is handled with fixed
per-programme offsets taken from the round bridge (Section 8.1), so the
random walk does not read an administrative dip as a market event. These
offsets enter the level model as known constants — $\rho$ in (2) is not
estimated — and the affected cells are also excluded from evaluation
(Section 7.1).

## 6. Uncertainty

### 6.1 Spread from walk-forward errors, not from the fit

A hierarchical model is sure of itself: the residual standard deviation is
4.5 points, but a next-year forecast also carries the uncertainty of every
borrowed effect and of the market's next move — and for a one-year series
the effects are mostly borrowed. The spread $s$ in (1) is therefore not read
from the final fit. It is the RMSE of the model's own walk-forward
forecasts on the calibration years (Section 7.1), stratified by the history
the series had at forecast time, and floored at the residual sd of the
newest fit that saw no evaluation year (4.3 points, from the fit trained on
data through 2024), so the history component can never claim to beat the
model's own in-sample noise (Table 3); that component is then scaled by the
band the forecast level falls in (Table 3b). An earlier version floored at
the final fit's
residual instead — a small leak of the held-out years into their own
intervals, worth 0.4 points of coverage; both review passes flagged it, and
the floor now uses only pre-evaluation data.

**Table 3:** Forecast spread $s$, estimated from walk-forward errors on the
calibration years 2020–2024.

| History at forecast time | $s$ (points) |
|---|---|
| 0 years | 7.9 |
| 1 year | 6.3 |
| 2–3 years | 5.5 |
| 4+ years | 4.5 |

The gradient is the empirical price of borrowing: a never-observed series is
forecast 7.9 points loose; four observed years buy the spread down to 4.5.
History is not the only conditioning variable. A queue cannot outgrow its
applicants' scores, so a forecast in the forties has less room to miss than
one in the twenties, and v1.6 found its intervals too wide above 45 points
and too narrow below 25 (Section 7.3). The spread is therefore the product
of the history bucket's RMSE and a multiplier for the band the forecast
falls in, the two fitted by backfitting on the calibration years — each is
the RMSE of the errors standardised by the other — with the multiplier
constrained to fall with the level (pooled adjacent violators, weighted by
cells), so that six free numbers cannot chase the calibration years' noise,
and clipped to [0.5, 1.5].

**Table 3b:** Level multiplier of the spread, by forecast band, from the
calibration years 2020–2024.

| Forecast $m$ | Multiplier |
|---|---|
| below 25 | 1.09 |
| 25–45 | 1.01 |
| 45 and above | 0.72 |

Only the ends move: a forecast above 45 points gets a band 28% narrower
than its history alone would give, one below 25 a band 9% wider. Section
7.3 reports what that bought on the held-out years.

### 6.2 An empirical error distribution

$\Phi_F$ in (1) is the empirical CDF of the standardised walk-forward errors
(41 quantiles), not a Gaussian. It is mildly left-skewed — thresholds
collapse more often than they jump, because a queue can vanish but cannot
exceed its applicant pool — though on this data a Gaussian would have scored
almost identically. The empirical CDF is clamped to [0.005, 0.995], so no
single cell's probability is ever exactly $1 - \pi$ or 1.

### 6.3 Recalibrating the fill probability

The raw fill model is overconfident: in the calibration-year walk-forwards
on all eight counties (Møre og Romsdal's proxy labels included), cells the raw model gave a
mean $\pi$ of 0.97 (the ≥ 0.9 bin) filled 92% of the time, and in the
held-out years cells given a mean 0.97 filled 88% — the series effects fit
the training panel too well. We therefore recalibrate by Platt scaling,
fitting

$$\operatorname{logit} \pi' \;=\; 0.123 \;+\; 0.577 \, \operatorname{logit} \pi \tag{5}$$

on the calibration years only, which are disjoint from the held-out
evaluation years. The slope well below 1 is a uniform confidence haircut.
The map is one pair of coefficients for all eight counties; it transfers a
calibration-year haircut to the held-out years on the assumption that the
overconfidence is stable in time, which the held-out reliability table
(Appendix C) bears out in the upper bins and not in the sparse 50–70%
bins. Held-out Brier for the fill event: 0.158 against 0.205 for the base-rate
forecaster (base rate 0.712; difference −0.047, cluster-bootstrap 95%
interval [−0.056, −0.037], Section 7.2). The recalibrated $\pi'$ is still
uneven in the mid-range (60% observed in the 50–60% bin, 70% in the 60–70%
bin, but 69% in the 70–80% bin), which the deployed quantity (1) — the
only probability shown to users — absorbs, as Section 7.4 shows.

## 7. Evaluation

### 7.1 Protocol

Evaluation is walk-forward with an expanding window (Tashman, 2000; Bergmeir
& Benítez, 2012): for each target year $t \in \{2020, \dots, 2026\}$, the
model is fitted on everything published before $t$ and forecasts year $t$.
Years 2020–2024 are **calibration years**: they set $s$ (Section 6.1),
$\Phi_F$ (Section 6.2), and the Platt map (5). Years **2025–2026 are held
out entirely** and are the only years reported in this section. For the
held-out years, no information from 2025 onward touches the forecasts:
model fits, spread, error distribution, Platt map, and the half-life were
all fixed on earlier data. (Within the calibration years the selection is
pooled across 2020–2024, as calibration always is.) One caveat survives:
the round bridge of Section 8.1 is computed once on all paired
publications, including 2025–2026, and its offsets enter each training fit
only for the Vestland 2023 cells — cells that are themselves excluded from
all scoring (464 competed cells, 218 with a numeric threshold), so the
contamination is confined to a second-order training detail. The exclusion
itself is principled: no earlier year can teach any forecaster that
administrative event, and grading the model on an offset it is told about
would mislead in both directions.

Two things the protocol does not do. It scores the level model only on
cells that published a number in the target year, so a series that
collapsed to "ingen venteliste" is scored by the fill component and not by
the level one; the level results are conditional on a queue surviving, and
Section 7.4 is the unconditional view. And the base-rate baseline of the
fill event uses the held-out base rate itself, an oracle that a real
competitor would not have; the calibration-year base rate is within a point
of it.

**Baselines.** For the threshold: **persistence** — the series' most recent
published figure, at whatever lag — where the series has history, and the
**programme–county mean** of prior years, where the programme has been
published in the county before. For the admission probability: the
deterministic **step rule** ("the last published figure is this year's
cutoff", probability 0 or 1) and a **probabilistic persistence** forecast
that centres the same spread $s$, error distribution $\Phi_F$ and
recalibrated $\pi'$ on the last published figure instead of on $m$ — so
that the comparison isolates the model's point forecast from its
uncertainty treatment.

**Uncertainty on every comparison.** Held-out cells are not independent: a
county's year moves all its series together, and the two held-out years
share the fitted structure. Every difference reported below therefore
carries a 95% interval from a cluster bootstrap over school×year (348
clusters, 1,000 resamples), which respects the within-school co-movement
that a plain binomial standard error ignores but still treats county-years
as exchangeable within a school; with only fourteen held-out county-years
it cannot do better, and the by-county coverage of Section 7.3 shows the
size of what it leaves out.

### 7.2 Threshold accuracy

**Table 4:** Held-out threshold accuracy, 2025–2026 (1,964 cells with a
published number), by history stratum. RMSE and MAE in points (↓ better);
bias is mean forecast minus outcome; ±3 is the share of forecasts within
three points (higher better); best per row in bold. Persistence is
undefined for 0-year series, and the programme–county mean is defined for
only 54 of the 159 0-year cells (the model's RMSE on those 54 is 8.35).
EWMA is exponential smoothing of the series' own past figures with
α = 0.4 (Muth, 1960); with one observed year it is persistence.

| History | n | Model RMSE | Persistence RMSE | EWMA RMSE | Prog–county mean RMSE | Model MAE | Persistence MAE | Model bias | Model ±3 | Persistence ±3 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 years | 159 | **8.23** | — | — | 9.75 | **6.19** | — | −2.65 | **30%** | — |
| 1 year | 255 | **5.72** | 6.99 | 6.99 | 6.55 | **4.26** | 5.21 | −1.11 | **50%** | 42% |
| 2–3 years | 547 | **5.53** | 6.97 | 6.15 | 6.21 | **4.35** | 5.25 | +0.55 | **44%** | 39% |
| 4+ years | 1,003 | **4.97** | 5.94 | 5.11 | 5.91 | **3.72** | 4.22 | +0.02 | 51% | **53%** |

The model beats all three baselines on RMSE and MAE in every stratum where
they are defined (Figure 1), and the margins over persistence are not
sampling noise: the
model-minus-persistence RMSE difference is −1.27 points [−1.76, −0.83]
with one year of history, −1.44 [−1.87, −0.96] with two or three, and
−0.97 [−1.22, −0.71] with four or more; against the programme–county mean
the intervals are [−1.26, −0.45], [−1.02, −0.35] and [−1.27, −0.65]. The
one exception is the 0-year stratum, where the mean baseline exists for a
third of the cells and the difference, −1.40 points on those 54, has an
interval [−2.72, +0.12] that touches zero. The ±3 hit rate tells a subtler
story: persistence edges it in the deepest stratum (53% vs 51%), a
difference whose interval [−0.05, +0.02] is centred on zero — repeating
the last figure lands inside a narrow band about as often, and misses by
more when it misses, which is the trade a squared-error forecast makes.
The bias column shows where the borrowing costs: series with no history are
forecast 2.7 points too low on average and one-year series 1.1 too low,
because a new queue tends to open above its programme's county mean; from
two years on the forecast is unbiased. Overall: RMSE 5.56 [5.28, 5.83],
MAE 4.17, bias −0.19, 47% of forecasts within ±3 points. For scale, the
same series moves with a standard deviation of 6.2 points between
consecutive published years (4,668 pairs; 50% of moves within ±3), so
persistence is a strong baseline and the residual year effect is large —
which is why the deliverable is the distribution, not the point forecast.
Per-year results are in Appendix B.

Persistence and the programme–county mean are the two ends of one family:
the last figure with all the weight, or every past figure with equal
weight. Exponential smoothing sits between them, and Muth (1960) showed it
is the optimal forecast when a series is a random walk observed with noise
— close to what a threshold is. With α = 0.4 (the weight on the newest
figure; the rest decays geometrically) it is a far stronger baseline than
either end on deep series: RMSE 6.15 against persistence's 6.97 with two
or three years of history, and 5.11 against 5.94 with four or more. The
model still wins, but by less — −0.62 points [−0.83, −0.42] and −0.14
[−0.28, −0.01] — and the deepest interval only just excludes zero. That is
the honest size of what pooling across schools and programmes adds once a
series can be smoothed on its own: most of the model's margin over
persistence on long series is the smoothing, not the hierarchy. On short
series the hierarchy is everything — with one observed year exponential
smoothing is persistence, and the model beats it by 1.27 points.

**Figure 1:** Held-out RMSE by history stratum: model against three
baselines — persistence, exponential smoothing (α = 0.4) and the
programme–county mean.

![Held-out RMSE by history stratum](figures/rmse-by-history.svg)

### 7.3 Interval coverage

The nominal 80% interval $m \pm 1.2816\,s$ contained the published figure
**80.9%** of the time on held-out cells (n = 1,964; cluster-bootstrap
interval [78.9, 82.7]), at a mean width of 13.5 points; the 50, 90 and 95%
Gaussian intervals covered 53.1, 89.0 and 93.7%. The deployed
distribution $\Phi_F$ is the empirical one, and its central 80% band
covered 78.1% (50/90/95: 49.3, 88.1, 93.3%): the Gaussian band lands on
its nominal level, and the empirical quantiles, learned on the calibration
years, transfer to the held-out years a little too tight. Coverage is the
target and width the price (Gneiting, Balabdaoui & Raftery, 2007): roughly
±6.7 points is what an honest 80% claim costs on this data. The graded interval is the symmetric Gaussian one because that
is what the application displays, and coverage is conditional on a numeric
threshold materialising at all.

The marginal figure hides a conditional pattern, and v1.7 acts on it.
Table 4b stratifies the 80% Gaussian coverage by the forecast level and by
county. Errors are smaller where the forecast is high — the cutoff cannot
exceed the applicant pool, so a programme forecast above 45 points has
little room to surprise — and with the spread conditioned on history alone
(v1.6) the intervals covered 96.7% above 45 points and 73.2% below 25. The
level multiplier of Table 3b, fitted on the calibration years only, moves
those two bands to 82.0% and 75.6% on the held-out years and leaves the
three middle bands where they were (79.3–80.0% against 79.2–79.6% before);
the overall coverage, the mean width and the admission-probability Brier
score are unchanged (80.9%, 13.5 points, 0.0918 against 0.0919), which is
what moving width from one end to the other should do. The 40–45 band, at
89.8%, is still too wide: the monotone fit pooled it with the middle bands
on the calibration years, and the held-out years say it belongs with the
top. Across counties, coverage runs from 75% in Buskerud to 90% in
Akershus; Møre og Romsdal, forecast from proxy-labelled cells, sits at
80%.

**Table 4b:** Held-out coverage of the nominal 80% interval, by forecast
level and by county. RMSE and mean $s$ in points.

| Forecast $m$ | n | Coverage | RMSE | Mean $s$ |
|---|---|---|---|---|
| below 25 | 41 | 75.6% | 6.21 | 5.88 |
| 25–30 | 405 | 79.3% | 5.75 | 5.49 |
| 30–35 | 670 | 80.0% | 5.54 | 5.28 |
| 35–40 | 562 | 79.7% | 6.07 | 5.38 |
| 40–45 | 225 | 89.8% | 4.10 | 5.12 |
| 45 and above | 61 | 82.0% | 3.09 | 3.33 |

| Fylke | n | Coverage |
|---|---|---|
| Akershus | 210 | 90.5% |
| Buskerud | 69 | 75.4% |
| Innlandet | 369 | 82.1% |
| Møre og Romsdal | 168 | 80.4% |
| Oslo | 124 | 90.3% |
| Rogaland | 206 | 75.7% |
| Trøndelag | 72 | 81.9% |
| Vestland | 746 | 77.9% |



### 7.4 Admission-probability calibration

The deployed quantity is (1). For every held-out cell and every score $x \in
\{20, 25, \dots, 55\}$ we ask "would an applicant with $x$ points have been
admitted?" — the outcome is determined by the published threshold and fill
state — and score the predicted probability over all 22,584 score–cell
pairs (2,823 cells), with $\pi$ as deployed: Brier score **0.092** [0.088, 0.096]. The step rule is defined
only where the series has a prior figure, 19,280 of those pairs; on that
common subset the model scores **0.090** against the step rule's
**0.156** (difference [−0.072, −0.059]) and the probabilistic persistence
forecast's **0.096** (difference −0.006 [−0.008, −0.003]). The second
comparison is the fair one: most of the model's advantage over the step
rule is the uncertainty treatment of Section 6, which any centre could
carry, and the model's own point forecast is worth a further 0.006 of Brier
on top of it — small in absolute terms, but its interval excludes zero.

**Table 5:** Reliability of the held-out admission probability (Figure 2
shows the same data as a diagram).

| Predicted | Observed | n |
|---|---|---|
| 0–10% | 4.3% | 1,402 |
| 10–20% | 14% | 1,494 |
| 20–30% | 24% | 1,374 |
| 30–40% | 38% | 1,232 |
| 40–50% | 44% | 1,050 |
| 50–60% | 59% | 1,067 |
| 60–70% | 66% | 1,134 |
| 70–80% | 80% | 1,268 |
| 80–90% | 87% | 1,503 |
| 90–100% | 98.6% | 11,060 |

The largest gap between prediction and outcome in any decile is 5.2 points,
in the 70–80% bin, where the forecast is cautious: a stated 75% was
realised at 80%, so the *likely* band (≥ 70%) understates the chance
rather than overstating it. Below 70% the forecast is within 3.7 points of
the outcome in every bin and optimistic by at most 1.6 points, in the three
lowest bins — a stated 15% was realised at 14% — a region the
application's coarse bands (likely ≥ 70%, possible ≥ 35%, otherwise
unlikely) absorb in any case.

**Figure 2:** Reliability diagram of the held-out admission probability.
Grey bars show where the predictions' mass sits (56% of score–cell pairs
land above 80%).

![Reliability diagram](figures/reliability.svg)

### 7.5 Ablations

Three structural choices that could have gone the other way were
adjudicated on the calibration years, never the held-out years; the
intervals are the cluster bootstrap of Section 7.1 applied to the
calibration-year folds:

- **Recency half-life.** Over half-lives {1.5, 2.5, 4, ∞} years the
  calibration-year walk-forward RMSE was {6.412, 6.393, 6.388, 6.399}: 4
  years wins, by 0.011 points over no decay [−0.001, +0.023] — kept
  because it wins, reported because the interval says the choice does not
  matter.
- **Level→fill coupling.** Plugging the level model's school effect into the
  fill model lowered calibration-year fill log-loss from 0.471 to 0.470
  (difference [−0.005, +0.004]) on the current panel, so the deployed
  hurdle is coupled. On the held-out years the two variants score the same
  fill Brier (0.158 against 0.158). Every earlier build rejected the same
  coupling (0.403 vs 0.406 before the Innlandet backfill) — the verdict
  belongs to the backtest, this report documents the flip rather than
  smoothing it over, and the interval says the two hurdles are
  indistinguishable on this data.
- **A county's proxy fill labels.** Møre og Romsdal's "ingen venteliste" is
  the dashboard's rule of Section 4.4, not an observed state. Holding the
  county out of the fill fit instead — its $\pi$ forced to 1, as deployed
  before the rule — moves the Platt slope from 0.577 to 0.502 and the
  held-out fill Brier on the seven counties whose labels are observed from
  0.159 to 0.161: the proxy labels do not distort the other counties'
  calibration, they sharpen it slightly. On the county's own 223 held-out
  cells the proxy-labelled hurdle scores 0.148 against 0.186 for its base
    rate, which says the rule is predictable — a low cutoff one year
  foretells one the next — not that it separates queues from empty places.
- **Level-conditioned spread.** Section 6.1's multiplier is fitted on the
  calibration years and judged on the held-out ones (Section 7.3): the top
  band's coverage falls from 96.7% to 82.0% and the bottom band's rises
  from 73.2% to 75.6%, at no cost to the overall coverage, width or Brier
  score. Kept.
- **Single-applicant cells.** A threshold equal to the admitted mean is one
  applicant's score. Over level-fit weights {1, ½, ¼, 0} for the 14 such
  cells the calibration-year RMSE was {6.388, 6.389, 6.389, 6.390}: full
  weight wins by less than a thousandth of a point, and the paired interval
  is [0.00, 0.00]. Fourteen cells in 7,639 cannot move a backtest, so the
  choice is a prior, not an estimate; the pipeline keeps the flag, the
  search and the full weight, and reports the verdict rather than the
  intuition.


## 8. Findings about the publication practice

### 8.1 The intake-round effect

Two counties publish the same programmes in the same year from two intakes
— a paired, within-year measurement of what a later intake does (Table 6).

**Table 6:** The round bridge: paired within-year threshold changes between
published intakes. Standard errors of the mean in parentheses; "queues
cleared" counts earlier-intake queues that no longer existed in the later
one.

| | Years | Pairs queued in both | Later − earlier (points) | Queues cleared by later intake |
|---|---|---|---|---|
| Akershus, 1. → 2. inntak | 2025 | 101 | −3.4 (se 0.3, sd 3.1) | 16% of 124 |
| Vestland, 1. → 3. inntak | 2020, 2024–2026 | 910 | −3.2 (se 0.1, sd 3.8) | 32% of 1,348 |

The drop conditional on the queue surviving is half the story; the cleared
queues are the other half. The two rows are not one effect: Akershus's rests
on a single year and a step of one intake, Vestland's on four years and two
intakes, and what makes them similar in size — a first intake that
over-offers by about the same margin in both — is a coincidence of two
counties' practice, not a national constant. The effect is heterogeneous by
programme — in Vestland, *studiespesialisering* −5.3 and *påbygging* −5.9
against electrical −1.7 and building −2.6 (full table in Appendix A).
Cross-county comparison of raw thresholds that ignores the intake is
therefore systematically misleading by 3–6 points — and several counties do
not state the intake in their publication. We deliberately do not project a
common "1. inntak equivalent" scale across counties: applying Akershus's
offsets to Rogaland would be an assumption dressed as a measurement.

### 8.2 What a raw school mean measures

The school effect $\alpha_s$ in (2) is a school's threshold level relative
to the same programmes elsewhere in its county — programme mix held
constant. Writing a school's raw mean threshold as the mean of its fitted
cells and attributing the between-school variance of that mean to the
components of (2) gives a decomposition of what the map's colour actually
encodes. Over the 181 schools whose $\alpha_s$ rests on five or more fitted
cells (between-school sd of the raw mean 5.1 points), the school's own
effect accounts for 48% of the variance, the programme mix (which
utdanningsprogram and programme areas it offers) for 24%, the county-year
level — which intake the county publishes, and its market that year — for
10%, the series interactions for 9%, and residuals and covariances for the
rest. Ranked within their own county by $\alpha_s$ instead of by raw mean,
schools move 2.9 places on average and at most 19; in Møre og Romsdal, where
mix explains 67% and the school effect 14%, the average move is 6.5 places,
in Oslo 2.0. A substantial part of a raw school mean is what the school
*offers* and when its county publishes, not how contested it is — which is
why the application prints the mix-adjusted effect with a standard error,
states that it measures demand, not quality, and does not rank schools
across counties at all (Section 11).

### 8.3 The model as a data audit

The cells the fitted model finds least plausible ($|z| > 3$: 72 of 7,639, 33 of
them in Vestland, the county with the most cells; the 25 most extreme are
published in the model metadata) were checked against sources. The largest deviation and two
further Vestland-2022 extremes (Slåtthaug 18.0, Dale 12.5, Fitjar 48.8)
appear verbatim in the county's own PDF — genuine extremes, not parse
damage. One case remains open: Kongsberg's 2025 figure of 4.0 for musikk,
dans og drama, following a "by documentation" cell in 2024, is printed so
by the county and is kept as data. Residual screening of this kind is a
continuous quality control of both pipeline and source, and would catch the
header-shift class of parser bug if it recurred.

## 9. The deployed application

The map colours each school by the mean of its current-year thresholds and
sizes each marker by the share of its programmes that filled — the censoring
is displayed, not hidden inside the mean. One global filter follows the
register's hierarchy (all → utdanningsprogram → programområde), with county
row labels preserved as queue identities and official register names
attached where spellings diverge. With the applicant's points entered, every
row shows the probability (1); a choice list enforces vigo's real
constraints — ten wishes, at most three distinct Vg1 utdanningsprogram — and
reports the probability of at least one place as $1 - \prod_k (1 - p_k)$
under an explicit independence caveat. Where a county publishes 1. inntak
but admits through 3. inntak (Vestland), the application also shows the
chance by the final intake,

$$P(\text{place by round 3}) \;=\; (1 - \pi) + \pi \left( v_p + (1 - v_p)\, \Phi_F\!\left(\frac{x - m - \delta_p}{s}\right) \right), \tag{6}$$

with $v_p$ the share of 1. inntak queues cleared by 3. inntak and
$\delta_p$ the surviving-queue drop, both per programme from Section 8.1
where a programme has at least ten pairs, and the county-wide values
otherwise. The interface is bilingual (Norwegian/English), phrased in the
official Udir/vigo vocabulary throughout, and the compiled dataset is
available from the page as JSON and in the repository as CSV and SQLite.
The shipped model carries 1,753 programme forecasts, of which 207 are for
series with no observed year. Two things it deliberately does not forecast:
a series whose newest cell is *utgått* (discontinued; 65 series) gets no
forecast, whatever the year before said, and a series with no observed year
is tagged "ingen historikk" (no history) — with "lite historikk" (little
history) at a single year — rather than handed a bare percentage. Those 205
forecasts are in the exported files, tagged by their zero history, so that
a reader can exclude them.

## 10. Limitations

- **Marginal, not individual.** The model forecasts the queue's cutoff, not
  an individual's outcome. It ignores that applicants compete only at their
  highest surviving wish, tie-breaking, and seats consumed by priority and
  documentation quotas.
- **Stationarity.** The random walk extrapolates a smoothly moving market.
  Capacity changes, new schools, catchment redistricting, and reputation
  shocks are structurally unforecastable from thresholds alone; the model
  will be wrong at exactly the discontinuities families most want warned
  about, and the spread $s$ prices this only on average. The panel's own
  window contains one such shock — the 2020–2022 examination cancellations
  moved the whole points scale (Section 2) — which the county walk absorbed
  as a level move; a future shock of that kind would first appear as a
  one-year bias.
- **The published number, in the published intake.** Where a county
  publishes 1. inntak, more applicants are ultimately admitted than the
  figure implies; Section 8.1 measures the gap where it can be measured, and
  equation (6) passes it on only for the county where it is measured.
- **Short test window.** Two held-out years (2,019 cells with a number,
  2,823 that competed) from one country and fourteen county-years. The
  cluster bootstrap of Section 7.1 prices the within-school dependence but
  treats county-years as exchangeable; the by-county coverage of Table 4b,
  from 75% to 90%, is the honest size of what it leaves out. 2026 looks
  better than 2025 partly because most of its cells are drawn from the
  counties with the deepest histories (Appendix B).
- **Cold starts.** Trøndelag has one published year and Buskerud two, so
  their forecasts rest almost entirely on borrowed effects; Buskerud's
  intervals cover 75% instead of 80%, and Trøndelag's first forecasts
  cannot be evaluated at all until the county publishes again.
- **Independence in the choice list.** The at-least-one probability treats
  wishes as independent; a hard year hits several of them at once, so the
  true probability is somewhat lower.
- **Catchment counties.** A threshold binds only residents of the intake
  area (*inntaksområde*); the application states this where it applies, and
  the model does not know where an applicant lives.
- **A proxy fill state in one county.** Møre og Romsdal's "ingen
  venteliste" is the county's own display rule — a Vg1 figure under 25 —
  not an observed queue state (Section 4.4). A programme with a queue whose
  cutoff was 24.6 is labelled open, and one that admitted everyone with a
  weakest applicant at 27 keeps its number. The rule's held-out fill Brier
  (0.148 against 0.186 for the county's base rate, Section 7.5) says the
  labels are predictable, not that they are right; the county may link
  capacity data during 2027.
- **Self-selected counties.** The eight publishing counties chose to
  publish; nothing here is evidence about the seven that do not, and any
  future expansion inherits whatever made them different.
- **Regime changes.** A programme can move between the points queue and the
  quota states (F/D/U) between years; the hurdle predicts queue formation,
  not that kind of administrative transition.
- **Mid-range calibration.** The raw probability is within 2 points of the
  outcome below 30% and cautious by up to 5 points in the 70–80% bin
  (Section 7.4); the application's bands absorb both.
- **Reflexivity.** A public forecast can move where people apply, which
  moves the thresholds being forecast — a Goodhart-type feedback. At the
  current scale we judge this unmeasurable, but it is the reason the
  application shows bands and history rather than a single authoritative
  number, and the effect would first appear as a calibration drift in
  precisely the walk-forward record this report is built on.

## 11. Ethical considerations

The unit of analysis is the queue, never the applicant: the data contain no
personal information — only the per-programme cutoffs counties already
publish — and the application collects none; points entered by a user stay
in the browser. The county publications are public records and the
fylkeskommuner remain their controllers; the copies mirrored under
`sources/` are reproduced for reproducibility, with the document metadata
that named individual officials stripped. The tool informs applicants; it
does not gatekeep, rank, or score any person, and it must not be used by
institutions for admission decisions. Miscalibration harms are asymmetric —
an overconfident "you will get in" can cost a pupil their safety choice —
which is why the fill probability is deliberately recalibrated downward
(Section 6.3), why coarse bands absorb the optimistic low tail, and why
every forecast is shown next to the threshold's actual history. The
mitigation itself has a cost: a conservative "unlikely" can deter an
application that would have succeeded, and for a pupil that chilling effect
is as real as the false promise — the history shown beside every forecast,
and the 3. inntak chance where it is measured, exist to let a family see
past the band. The interface is Norwegian and English only; families most
disadvantaged by the current PDF-fragmented practice include those reading
neither, and closing that gap is distribution work the tool has not yet
done.

Thresholds are also a ranking in disguise. A map of cutoffs can be read as
a league table of schools, and league tables of admission scores are known
to feed the sorting they measure: Serediak & Helland (2020) show how Oslo's
points-based intake concentrates high-scoring pupils, and the free-choice
literature Sandsør (2020) reviews finds the same pattern where scores
decide places. We therefore do not present raw school means as rankings,
label the mix-adjusted school effect a measure of demand, not quality, and
decompose in Section 8.2 how much of the raw mean is timing and mix rather
than contest. Finally, information tools tend to benefit the already
informed; publishing the compiled dataset and the tool free of charge is an
attempt to level an asymmetry that today favours families with the
resources to collect and interpret eight counties' publications by hand.

## 12. Recommendations to publishers

Each of these is cheap, and each would have removed an entire error class
from this work:

1. **Publish machine-readable tables** (CSV/JSON) alongside the PDF, at a
   stable URL per year, so that an edition is neither overwritten nor lost
   when a site is rebuilt.
2. **State the intake in the table** — it moves the numbers by 3–6 points
   and is today often omitted.
3. **Standardise cell semantics**: distinguish "filled at 0.0", "ingen
   venteliste", and fortrinnsrett / documentation admissions explicitly,
   and print the filled/not-filled state even where every programme carries
   a number.
4. **Print Grep codes** — programme names are today spelled differently
   across counties and across years within a county.
5. **Publish history, not only the latest year** — the uncertainty in any
   advice to a family cannot be quantified without it. A national table,
   compiled once a year from figures every county already computes, would
   cost the publishers nothing new.

## 13. Conclusion

A censored panel of published cutoffs, a hurdle model with partial pooling,
and uncertainty measured from the model's own out-of-sample record turn
eight counties' publications into a calibrated answer to the question families
actually ask. The same assembly measures the publication practice it
depends on: the intake-round effect, the decomposition of school averages
into demand, mix and timing, and the residual audit are of more lasting
interest than any single year's forecast — and each points to a concrete,
low-cost improvement the publishing counties could make.

## Reproducibility statement

All code for data extraction, normalisation, model fitting, evaluation, and
the figures in this report is available at
[github.com/avshalomd/poengkart](https://github.com/avshalomd/poengkart);
the version this report describes is tagged `report-v1.7`, and the numbers
quoted here are from the build of 2026-09-05. The compiled dataset ships in
the repository as CSV and SQLite (`data/`, including the paired-intake
cells of Table 6 as `alternate-rounds.csv`) and from the application as
JSON; the original county publications are mirrored under `sources/`,
including the releases on request, with a hash manifest and their
provenance in `sources/README.md`, and a copy in object storage for the
day a county page disappears. `tools/refresh.py` regenerates the dataset,
the model, every walk-forward forecast with its outcome
(`data/model-backtest.csv`), and every figure from the sources; the only
network steps are the geocoding and the photo lookups, which are cached, so
the model and the report rebuild offline. The fit is deterministic; the
cluster bootstrap uses a fixed seed. The whole pipeline runs in minutes on a
laptop. `tools/test_docs.py` pins every number in this report and in
`docs/model.md` to the shipped model file, so a refresh that moves a figure
fails the build until the text is updated; validation further comprises 88
parser regression checks and 13,838 model invariants. The dataset is
released under the Norwegian Licence for Open Government Data (NLOD 2.0)
and the code under the MIT licence.

## References

- Abdulkadiroğlu, A., & Sönmez, T. (2003). School choice: A mechanism design
  approach. *American Economic Review*, 93(3), 729–747.
- Arteaga, F., Kapor, A. J., Neilson, C. A., & Zimmerman, S. D. (2022).
  Smart matching platforms and heterogeneous beliefs in centralized school
  choice. *Quarterly Journal of Economics*, 137(3), 1791–1848.
- Azevedo, E. M., & Leshno, J. D. (2016). A supply and demand framework for
  two-sided matching markets. *Journal of Political Economy*, 124(5),
  1235–1268.
- Bergmeir, C., & Benítez, J. M. (2012). On the use of cross-validation for
  time series predictor evaluation. *Information Sciences*, 191, 192–213.
- Brier, G. W. (1950). Verification of forecasts expressed in terms of
  probability. *Monthly Weather Review*, 78(1), 1–3.
- Chen, X., Peng, Y., Gao, Y., & Cai, S. (2022). A competition model for
  prediction of admission scores of colleges and universities in Chinese
  college entrance examination. *PLOS ONE*, 17(10), e0274221.
- Cragg, J. G. (1971). Some statistical models for limited dependent
  variables with application to the demand for durable goods.
  *Econometrica*, 39(5), 829–844.
- DeGroot, M. H., & Fienberg, S. E. (1983). The comparison and evaluation of
  forecasters. *Journal of the Royal Statistical Society, Series D*, 32,
  12–22.
- Dempster, A. P., Laird, N. M., & Rubin, D. B. (1977). Maximum likelihood
  from incomplete data via the EM algorithm. *Journal of the Royal
  Statistical Society, Series B*, 39(1), 1–38.
- Efron, B., & Morris, C. (1975). Data analysis using Stein's estimator and
  its generalizations. *Journal of the American Statistical Association*,
  70(350), 311–319.
- Fack, G., Grenet, J., & He, Y. (2019). Beyond truth-telling: Preference
  estimation with centralized school choice and college admissions.
  *American Economic Review*, 109(4), 1486–1529.
- Gale, D., & Shapley, L. S. (1962). College admissions and the stability of
  marriage. *The American Mathematical Monthly*, 69(1), 9–15.
- Gelman, A., & Hill, J. (2007). *Data Analysis Using Regression and
  Multilevel/Hierarchical Models*. Cambridge University Press.
- Gneiting, T., Balabdaoui, F., & Raftery, A. E. (2007). Probabilistic
  forecasts, calibration and sharpness. *Journal of the Royal Statistical
  Society, Series B*, 69(2), 243–268.
- Gneiting, T., & Raftery, A. E. (2007). Strictly proper scoring rules,
  prediction, and estimation. *Journal of the American Statistical
  Association*, 102(477), 359–378.
- Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). On calibration
  of modern neural networks. *Proceedings of the 34th International
  Conference on Machine Learning*, PMLR 70, 1321–1330.
- Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and
  Practice* (3rd ed.). OTexts.
- James, W., & Stein, C. (1961). Estimation with quadratic loss.
  *Proceedings of the Fourth Berkeley Symposium on Mathematical Statistics
  and Probability*, Vol. 1, 361–379. University of California Press.
- Janssen, M., Charalabidis, Y., & Zuiderwijk, A. (2012). Benefits,
  adoption barriers and myths of open data and open government.
  *Information Systems Management*, 29(4), 258–268.
- Kapor, A. J., Neilson, C. A., & Zimmerman, S. D. (2020). Heterogeneous
  beliefs and school choice mechanisms. *American Economic Review*, 110(5),
  1274–1315.
- Kirkebøen, L. J., Leuven, E., & Mogstad, M. (2016). Field of study,
  earnings, and self-selection. *Quarterly Journal of Economics*, 131(3),
  1057–1111.
- Lei, J., G'Sell, M., Rinaldo, A., Tibshirani, R. J., & Wasserman, L.
  (2018). Distribution-free predictive inference for regression. *Journal
  of the American Statistical Association*, 113(523), 1094–1111.
- Murphy, A. H. (1973). A new vector partition of the probability score.
  *Journal of Applied Meteorology*, 12(4), 595–600.
- Muth, J. F. (1960). Optimal properties of exponentially weighted
  forecasts. *Journal of the American Statistical Association*, 55(290),
  299–306.
- Niculescu-Mizil, A., & Caruana, R. (2005). Predicting good probabilities
  with supervised learning. *Proceedings of the 22nd International
  Conference on Machine Learning*, 625–632.
- Platt, J. C. (1999). Probabilistic outputs for support vector machines
  and comparisons to regularized likelihood methods. In A. J. Smola, P.
  Bartlett, B. Schölkopf, & D. Schuurmans (Eds.), *Advances in Large Margin
  Classifiers* (pp. 61–74). MIT Press.
- Sandsør, A. M. J. (2020). *Fritt skolevalg? En gjennomgang av relevant
  forskning* (NIFU-innsikt 2020:4). Nordisk institutt for studier av
  innovasjon, forskning og utdanning.
- Serediak, O., & Helland, H. (2020). *Inntak til Oslos videregående
  skoler: Analyse av simulerte inntaksmodeller* (Skriftserie 2020 nr 1).
  OsloMet – storbyuniversitetet.
- Tashman, L. J. (2000). Out-of-sample tests of forecasting accuracy: An
  analysis and review. *International Journal of Forecasting*, 16(4),
  437–450.
- Tobin, J. (1958). Estimation of relationships for limited dependent
  variables. *Econometrica*, 26(1), 24–36.
- Vovk, V., Gammerman, A., & Shafer, G. (2005). *Algorithmic Learning in a
  Random World*. Springer.
- Williams, W. H., & Goodman, M. L. (1971). A simple method for the
  construction of empirical confidence limits for economic forecasts.
  *Journal of the American Statistical Association*, 66(336), 752–754.

**Official sources and data**

- Akershus fylkeskommune. *Forskrift om inntak til videregående opplæring
  og formidling til læreplass, Akershus* (FOR-2025-02-13-354). Lovdata.
- Innlandet fylkeskommune. *Forskrift om inntak til videregående opplæring
  og formidling til læreplass, Innlandet* (FOR-2024-12-17-3529). Lovdata.
- Oslo kommune. *Forskrift om inntak til videregående opplæring og
  formidling til læreplass, Oslo* (FOR-2025-01-29-147). Lovdata.
- Opplæringslova. *Lov om grunnskoleopplæringa og den vidaregåande
  opplæringa* (LOV-2023-06-09-30). Lovdata.
- Statistisk sentralbyrå. Table 07495: *Grunnskolepoeng, etter fylke og
  kjønn*. https://www.ssb.no/statbank/table/07495
- Utdanningsdirektoratet (2025). *Fortsatt økning i søkere til yrkesfag*
  (søkertall videregående opplæring 2025–26).
  https://www.udir.no/tall-og-forskning/statistikk/statistikk-videregaende-skole/sokere-vgs/sokere-til-videregaende-opplaring/
- Utdanningsdirektoratet. *Grep* (the national curriculum and programme
  register), read through its open API. https://data.udir.no
- Utdanningsdirektoratet. *Nasjonalt skoleregister* (NSR).
  https://data-nsr.udir.no
- Kartverket. Address and place-name APIs. https://ws.geonorge.no
- The counties' threshold publications and the releases on request, listed
  document by document in `sources/README.md` of the repository.

## Appendix A: The round bridge by programme (Vestland, 1. → 3. inntak)

**Table A1:** Paired within-year threshold change from 1. inntak to 3. inntak
in Vestland (2020, 2024–2026), by utdanningsprogram; sorted by the size of
the drop. "Queues cleared" counts 1. inntak queues that no longer existed in
3. inntak.

| Utdanningsprogram | Pairs | Later − earlier | Queues cleared |
|---|---|---|---|
| Påbygging til generell studiekompetanse | 56 | −5.9 | 20% of 70 |
| Håndverk, design og produktutvikling | 7 | −5.8 | 30% of 10 |
| Studiespesialisering | 64 | −5.3 | 41% of 109 |
| Medier og kommunikasjon | 9 | −4.7 | 47% of 17 |
| Salg, service og reiseliv | 41 | −4.5 | 33% of 61 |
| Kunst, design og arkitektur | 14 | −4.2 | 18% of 17 |
| Informasjonsteknologi og medieproduksjon | 11 | −4.1 | 62% of 29 |
| Helse- og oppvekstfag | 167 | −3.4 | 28% of 231 |
| Naturbruk | 55 | −3.2 | 39% of 90 |
| Frisør, blomster, interiør og eksponeringsdesign | 16 | −3.0 | 50% of 32 |
| Idrettsfag | 19 | −2.9 | 41% of 32 |
| Bygg- og anleggsteknikk | 93 | −2.6 | 37% of 150 |
| Restaurant- og matfag | 18 | −2.6 | 60% of 47 |
| Teknologi- og industrifag | 165 | −2.5 | 30% of 236 |
| Musikk, dans og drama | 18 | −2.1 | 42% of 31 |
| Elektro og datateknologi | 157 | −1.7 | 16% of 186 |

## Appendix B: Held-out results by year

**Table B1:** Threshold accuracy per held-out year. Most 2026 cells come
from the counties with the deepest histories (Vestland, Møre og Romsdal —
whose extract reaches 2012 — and Oslo, joined since v1.3 by Akershus and
Innlandet), which partly explains the better figures.

| Year | n | Model RMSE | Model MAE |
|---|---|---|---|
| 2025 | 1,184 | 5.79 | 4.31 |
| 2026 | 780 | 5.18 | 3.95 |

## Appendix C: Fill-event calibration

**Table C1:** Reliability of the recalibrated fill probability $\pi'$ on the
held-out years (2,823 cells that competed on points, all eight counties,
Møre og Romsdal's 223 proxy-labelled cells included; base rate 0.712).
Held-out Brier 0.158 against 0.205 for the base-rate forecaster.

| Predicted | Observed | n |
|---|---|---|
| 10–20% | 8.6% | 35 |
| 20–30% | 19% | 117 |
| 30–40% | 27% | 161 |
| 40–50% | 46% | 185 |
| 50–60% | 60% | 230 |
| 60–70% | 70% | 244 |
| 70–80% | 68% | 410 |
| 80–90% | 83% | 740 |
| 90–100% | 93% | 701 |

## Appendix D: Version history

- **v1.0** (August 2026). First report: six counties, the hurdle model, the
  walk-forward evaluation.
- **v1.1**. Revised after two independent review passes: the spread floor
  moved to the last pre-evaluation fit (Section 6.1), the Vestland 2023
  cells excluded from scoring.
- **v1.2**. Innlandet 2020–2022 added, released under a freedom-of-
  information request; the level→fill coupling first wins the backtest.
- **v1.3**. Akershus 2024/25 and 2026/27 added, likewise released on
  request.
- **v1.4**. Møre og Romsdal 2012–2026 added from the county's dashboard
  extract; the coupled hurdle deployed; Innlandet 2026; and the review of
  2 September 2026: discontinued programmes no longer forecast, Møre og
  Romsdal's fill probability fixed at 1, partial county-years excluded from
  the county walk, the decimal rule of Section 4.1.
- **v1.5**. After two further review passes and a data
  re-examination: every held-out comparison carries a cluster-bootstrap
  interval; a probabilistic persistence baseline; the admission probability
  scored with the deployed fill probability, and the fill calibration
  reported on the seven counties that carry a label; coverage by forecast
  level and county; the raw-mean decomposition of Section 8.2 replacing a
  cross-county re-ranking; the paired-intake cells exported; Section 2
  sourced; related work extended to school-choice information, Norwegian
    school choice, conformal prediction and open data.
- **v1.6**. Møre og Romsdal's fill state, from the county's
  own dashboard rule (a Vg1 figure under 25 is published as "ingen
  venteliste", Section 4.4): the county enters the fill model, its fill
  probability is fitted rather than fixed at 1, and Section 7.5 measures
  the proxy against holding the county out. The rule removes 562 cells from
    the level model and the county's low-side outliers with them; the
  admission probability's largest decile gap moves from the low bins to
  the 70–80% bin.
- **v1.7** (this version). Three model changes, each judged by the
  backtest: the forecast spread conditioned on the forecast level as well
  as on history (Table 3b; the top band's held-out coverage from 96.7% to
  82.0%); the admitted mean (Gjennomkar) carried through the dataset for
  Møre og Romsdal, with a backtest-chosen level-fit weight for the 14
  thresholds one applicant set (it chose full weight); and exponential
  smoothing (Muth, 1960) as a third baseline in Table 4, which shows that
  most of the model's margin over persistence on long series is smoothing,
  not pooling.


