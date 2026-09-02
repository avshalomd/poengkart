# Poengkart

Poengkart shows the admission thresholds (poenggrenser) of Norwegian upper-secondary schools on a map and estimates a family's chance of a place. Its vocabulary is the official one from Udir's Grep register, vigo.no and the counties' own publications; nothing is coined for the app. Norwegian terms are canonical; the English in parentheses is a gloss for the docs.

## Language

**Poenggrense** (threshold):
The points of the last applicant admitted to a programområde at a school in one intake; a grade average × 10. It says what it took to get in, not what the school requires.
_Avoid_: cut-off, points requirement, minimum points

**Fortrinnsrett** (statutory priority right):
A legal right to a place ahead of the points queue; a programområde filled through it has no poenggrense.
_Avoid_: priority quota, special admission

**Utdanningsprogram**:
One of Udir's national Vg1 programmes (Studiespesialisering, Helse- og oppvekstfag, …); the top level of the official hierarchy.
_Avoid_: category, programme category, lens, program

**Programområde**:
The specialisation within an utdanningsprogram at Vg2 and Vg3; the unit a poenggrense is published for.
_Avoid_: course, track

**Vg1 / Vg2 / Vg3**:
The three years of upper secondary school.
_Avoid_: grade 11–13, first/second/third year

**Fylke** (county):
The fylkeskommune owns the upper-secondary schools and publishes the poenggrenser; every figure belongs to exactly one fylke.
_Avoid_: region, intake area

**Ønske** (wish):
One ranked entry, a school plus a programme, in the applicant's vigo application.
_Avoid_: choice, pick, selection

**Videregående skole** (upper-secondary school):
The school a poenggrense belongs to; owned by the fylkeskommune. "Skole" alone means this in Poengkart.
_Avoid_: high school, college

**10. trinn**:
The final year of ungdomsskole, when the family files the vigo application; Poengkart's launch audience is the parents of these pupils.
_Avoid_: 10th grade, year 10

**Rådgiver** (school counsellor):
The ungdomsskole adviser who guides pupils through the application; a distribution channel, not a launch user.
_Avoid_: counsellor (except as gloss), advisor

**Inntak** (intake):
One publication of poenggrenser by a fylke; numbered "1. inntak", "2. inntak" as on the vigo letter. Which inntak a county publishes is a property of the county.
_Avoid_: round, inntaksomgang, intake round

## Cell states

Every (school, programområde, year) cell is exactly one of these. Internal tokens in the JSON stay `number`, `0`, `open`, `F`, `D`, `U`.

**Poenggrense** (number):
See above.

**Ingen venteliste** (no waiting list; token `open`):
Every qualified applicant was admitted; this is not a poenggrense of zero.
_Avoid_: uten venteliste, open, ledig, alle inntatt

**Fullt, siste inntatte uten poeng** (filled, last admitted had no points; token `0`):
The programområde filled, but the last admitted applicant had no registered points, so everyone with points got in. Counties print this as its own state.
_Avoid_: alle med poeng, zero, null

**Fortrinnsrett** (token `F`):
See above; the programområde filled through the statutory right and has no poenggrense.
_Avoid_: fortrinnskvote, priority quota

**Inntak etter dokumentasjon** (admission by documentation; token `D`):
Admission decided on documents or interview (IB, elite sport), so no poenggrense exists.
_Avoid_: dokumentasjonsinntak, individual assessment

**Utgått** (discontinued; token `U`):
The programområde was not offered that year.
_Avoid_: nedlagt, gone, closed

## Chance

**Sjanse for plass** (chance of a place):
The model's probability that an applicant with given points gets a place in a programområde at the next inntak.
_Avoid_: odds, likelihood, probability of admission (in UI)

**Sannsynlig / mulig / lite sannsynlig** (likely / possible / unlikely):
The three bands of sjanse for plass, at 70% and 35%; green, amber, red. Code keys: `likely`, `possible`, `unlikely`.
_Avoid_: realistic, long, safe, reach

## Model vocabulary (English, no official Norwegian term exists)

These never reach a family raw; the report and the code use them in English.

**Cell**: one (school, programområde, year) observation. _Avoid_: sample (outside the SQLite table name), row, datapoint.
**Series**: one school × programområde over the years. _Avoid_: occurrence, track.
**Forecast**: the model's expected poenggrense and spread for the next inntak. _Avoid_: prediction, estimate.
**Fill probability**: the probability that a programområde forms a queue at all (has a poenggrense rather than ingen venteliste). _Avoid_: pi, p_fill, queue probability (outside code).
**Backtest**: forecasting each past year from the years before it; the source of every accuracy claim. _Avoid_: validation, held-out (as a noun).
