# Data notes

Detail that would crowd the README: which counties publish at all, why the
history is so uneven between them, how the documents are turned into a dataset,
and what was considered and deliberately left unbuilt.

## Only 9 of Norway's 15 counties publish thresholds, or release them on request

Agder, Nordland and Østfold say on the record that they choose not to.
Vestfold, Troms and Finnmark publish aggregate intake statistics only —
applicants, offers, and in Vestfold's case per-school head-counts — with no
thresholds. Møre og Romsdal publishes only inside a Power BI dashboard whose
Publish-to-Web mode offers no download — but the county answered a request
with the tidy Excel extract behind it (September 2026): every school,
programme and year since 2012/13, the deepest history in the dataset. The
extract has no "everyone admitted" marker of its own — every offered
programme carries a number, down to 5.7 — but the dashboard the county
publishes does: it masks every Vg1 figure under 25 with `*` and legends it
«alle kom inn, eller laveste karakter var under 25». The dataset applies
that rule, so a figure under 25 is shown as «ingen venteliste», the state
the county shows rather than the number it hides; the county confirmed the
reading and may link capacity data during 2027. It is a proxy — a programme
with a queue whose cutoff was 24.6 is labelled open — and the model
measures on every refit what the proxy labels are worth. The figures are
from 2. inntak — the county's final round — confirmed by the county after
the extract itself arrived without saying so. The extract also carries the
admitted mean (Gjennomkar), published as `admitted_mean` in `samples.csv`;
where it equals the threshold, one applicant set the figure — 14 cells,
flagged for the model, whose backtest kept them at full weight.

Telemark publishes the thresholds nowhere, on its own site or on vilbli, but
answered the request of 1 September 2026 on 17 September with a workbook:
«Laveste karakterpoeng», the lowest grade points among those admitted, for
every Vg1 programme at its eleven schools, 2024/25–2026/27, with the
inntaksregion and the number of places. Every offered programme carries a
number, down to 10,0, and there is no marker for «everyone got in», so the
dataset has no fill state for Telemark. A low figure may be a cutoff or a
programme where everyone got in, so the figures are not comparable with the
other counties' poenggrenser: the county is published but held out of the
model and the technical report (`HELD_OUT` in `tools/model.py`). Its schools
are still forecast, from the county's own figures alone off the finished fit
(the satellite fit in `docs/model.md`), which no backtest scores; the app
says so on every Telemark school.
The intake round is not stated; the county was asked on 17 September,
together with what «Laveste totalpoeng» (2026/27 only, mostly karakterpoeng
+ 300) means, whether older years and Vg2–Vg3 exist, and for admitted
counts beside the places, which would give the fill state.

## Older years from copies, and two counties with history only

A search of the web, the Wayback Machine and the counties' own archives in
September 2026 (`.claude/qa/2026-09-25-data-hunt/`) recovered years the
counties no longer hold. Where the county's own document survived, it is read
like any other: Oslo 2014, Hordaland 2016, Buskerud's statistics booklets for
2012–2014 (scanned tables, transcribed twice), the Trondheim table for
2024/25 (an image PDF), Rogaland's «31 skoler» portal file for 2015,
Rogaland's news article of July 2017 (Common Crawl's capture; examples of
programmes with long waiting lists, so a partial year), and Agder's and
Nordland's own documents. Where only a copy survived, the copy is
read and marked: newspaper fact boxes that name the county as their source
(Oslo 2013 and 2016, Hordaland 2014 and 2015, Rogaland 2012, Akershus 2015),
the county's 2012 table reproduced in a master's thesis (Oslo), and
docplayer.me's text of PDFs the county deleted (Hedmark 2012–2018, Nordland
2015). The app says beside each such year that its figures come from a copy
(`reprint_years`). A copy's round is taken only from what it states; the
Rogaland portal states none, so Rogaland 2015 is labelled «inntak ikke
oppgitt» inside a 2. inntak series (`round_years`, `null`).

Agder and Nordland still decline to publish, but once printed their
figures: Agder's intake office in the slides it showed school counsellors
(2020–2021; Aust-Agder's selected offers for 2016–2017), Nordland in its
statistics books (2013–2015, 2019–2021). Both needed a reading the county
never wrote down. Agder's 2020–2021 figures carry a hundreds offset (0, 200,
300, 700, 800 or 900, never anything else) on top of a figure in the
karakterpoeng range; the dataset publishes the remainder and a remainder of
0 as «ingen venteliste», and the app says the numbers are worked out
(`decoded_years`). Nordland's 2013–2015 figures include the county
supplement the book states («Fylkestillegget er 800 poeng»), which is
subtracted. Nordland's 2021 book gives the lowest admitted with no «alle»
marker, like Telemark's workbook. Their newest year is 2021, so both are
history: shown, and kept out of the model (`HISTORY_ONLY`).

## Why the depth is so uneven

Rogaland's PDFs are rolling tables that reprint the previous three or four
years, so six editions cover nine years; a reissue of the newest edition and
an older one recovered through the Wayback Machine each hold figures no other
copy prints, and all eight documents are read. Everyone else publishes one year
per document and overwrites the page, and the archive crawler mostly did not
catch the older versions.

Innlandet's 2020–2022 tables were never published at all: they arrived as an
offentleglova release (sak 2026/1-152, August 2026), in two one-off PDF
layouts, together with the county's own caveat that the 2020 merger and the
2022 vocational-structure reform limit comparability across that boundary —
which the Grep normalisation and per-series identity absorb. The same letter
confirmed that nothing older survives, on either the Hedmark or the Oppland
side. The release's own legend reads "-" as "inntak uten poenggrense, eller
hvor poenggrensen ikke er relevant", and 2021 has 290 such cells against 93
figures (2020: 100 against 266, 2022: 186 against 197); a spot-check of 18
rows against the PDF (12 dashes, 6 figures, September 2026) found the parse
faithful, so the high share is the county's own publication, not a parser
artefact. The programmes admitted on other grounds, where a poenggrense is
not relevant (the four-year YSK, admitted by interview), are absent from the
tables altogether rather than marked.

Where a county shows a single year, that is all that was ever published in a
form anyone can still retrieve — not a gap in the collection. Trøndelag says so
outright: it does not produce overviews of past years' thresholds, and only
started publishing at all in 2024. Akershus, Buskerud and Innlandet publish
intake statistics for earlier years, but those contain applicant and capacity
counts, no thresholds.

Akershus's 2024/25 and 2026/27 tables were never published on afk.no; the
county released them to us as Excel workbooks on 27 August 2026, answering a
freedom-of-information request. They are school × programme grids of the
second-round thresholds for the same 34 schools as the county's published
2025/26 page, with the same cell legend (open programmes and
skills-assessed intake marked, not numbered), so they extend the published
series like-for-like — but second round only, so those two years carry no
first-round figures.

Many of the county links rot yearly; older editions were recovered through the
[Wayback Machine](https://web.archive.org/).

**The 2017–2019 rows of Vestland's predecessors are narrower than everything
else here.** The first-round series for those years is Hordaland's Vg1
studiespesialisering in the Bergen area (two press releases, each printing the
previous year's figure beside the current one; they agree on all fifteen
schools where they overlap) plus Sogn og Fjordane's Vg1 table for 2018 and
2019 (ten schools, all utdanningsprogram). Hordaland's full 3. inntak table
for the same years — every public school, Vg1–Vg3 — sits beside the series as
`values_r3`, not in it: Vestland's series is 1. inntak, and a later round
inside it would read as a dip that never happened. Programmes that exist only
in that table (Vg2 and Vg3, and Vg1 outside studiespesialisering) have no
first-round series to sit beside and are left out of the dataset; the source
document is kept in `sources/`.

## How the documents are parsed

Every county gets its own extractor under `tools/extractors/`, feeding one
shared normaliser (`tools/common.py`).

PDFs are read by coordinate rather than by text flow — columns are sliced by
x-position, and rotated column headers (Oslo, Vestland) are rebuilt glyph by
glyph. Programme names are normalised across counties and years and resolved
against [Udir's Grep registry](https://data.udir.no/kl06/v201906/programomraader),
which is also what sorts them into the national *utdanningsprogram*; that is
documented separately in
[programme-categories.md](programme-categories.md).

School names are matched to the national school register
([NSR](https://data-nsr.udir.no/)) within their own county, then geocoded via
NSR, Kartverket's address API and Kartverket's place-name register in turn.

Where two sources disagree about a cell, the newest wins and the disagreement
is recorded in `data/source-drift.json` rather than hidden. Any year two
publications disagree about by close to a whole grade point is flagged on the
school as `uncertain_years`, and the app says so in words. A figure that is
printed but cannot be right is published as printed, never corrected by
hand, until the county says what it should be. Rogaland printed 3,0 for
Bergeland's Vg2 Medier og kommunikasjon in 2026, below the lowest possible
score of 10; the county answered on 23 September 2026 that there were free
places, so the dataset shows «ingen venteliste». The correction lives in the
extractor (`COUNTY_CORRECTIONS` in `tools/extractors/rogaland.py`) with the
county's answer beside it, and applies only while an edition still prints
the wrong value.

`tools/test_parse.py` runs 136 regression checks over the result; every one of
them encodes a defect that was found in the data at some point.

## Deliberately not built

**The intake round is modelled per county, not per year.** Vestland
published only a 3. inntak file for 2023/24 on its poenggrense page, and for
two years the dataset carried that round inside a 1. inntak series: 53% of
that year's cells were "no waitlist" against 0–6% in the other years, so the
2023 thresholds sat visibly lower for a reason that had nothing to do with
demand. The county's 1. inntak file for 2023/24 turned out to be still served
from its site, unlinked, and since 5 September 2026 it is the series; the
3. inntak file moved to `values_r3` like every other year's. The mechanism
that handled the exception stays: `build_dataset.py` derives any year whose
only published round differs from the county's (`round_years`), the panel
explains it in a sentence, and the forecast offsets such a year by the round
bridge. Today no county-year triggers it.

The fuller version would carry the round on each cell — the extractors already
know it per source file — and make the round chip follow the year being
displayed. That turns a static label into one that changes as you read, in a
panel that is already dense, for an audience of teenagers and their parents.
Worth revisiting if a county starts mixing rounds inside one series again.

(Vestland's own 2026 first round also runs high — 26% of cells admitted
everyone who applied, printed as «Alle» in the county's own PDF — a genuine
loosening, not a round artefact: the 3. inntak figures for 2026 sit separately
in `values_r3`.)

**The alternate-round figures already in the dataset are not shown.** 151
programmes carry `values_r1` and 575 carry `values_r3`; the app reads only
`values`. They are the raw material for numbers that would be comparable across
counties publishing different rounds — the problem the app currently apologises
for in three separate strings. Left until the round model above is settled,
because two series per programme without a coherent story about rounds would
add confusion rather than remove it. What they *are* used for is measuring the
gap between rounds — see the round bridge in [model.md](model.md).

## One programme, two labels

A county that lists a programme twice — once with figures, once as a
fortrinnsrett quota — should appear once, and the app folds the quota row into
the one with figures. That fold keys on the programme name **and its level**.
Keying on the name alone dropped 59 rows across 18 Rogaland schools, because a
Vg3 that only ever filled on fortrinnsrett is not a duplicate of the Vg1 of the
same name: the Vg3 vanished, the school's programme count fell with it, and the
quota badge landed on a row showing a real threshold, whose tooltip then said
no threshold existed.

## Every row carries its register identity

The names in the dataset are the counties' own labels, kept verbatim because
the label is part of the intake unit's identity (see "One programme, two
labels" above, and `docs/programme-categories.md` for why a Grep code cannot
replace it: one code can hold several separate intake queues). But every row
also carries the register's answer to *what programme area this is*: `grep` is
the Grep code the label resolves to, and `official` is the register's Bokmål
title where the county spells it differently. Only the six International
Baccalaureate rows have no code — IB is real but lives outside Grep. One code
is vigo's rather than Grep's: the Vg4 year of påbygging after a vocational
qualification is offered as `PBPBY4YK--`, which Grep does not list (it
has only `PBPBY4----` «Fag for studiekompetanse», the code the vitnemål
records); its `official` is Udir's own name for the year, «Vg4 påbygging
til generell studiekompetanse». Until 23 September
2026 those rows carried the Vg3 code and a «Vg3 påbygging» title. The name
decides as well as the level: Vestland prints its «Påbygg gen studiekomp
etter yrkeskompetanse» at level 3 in 2021/22 and 2023/24 and at level 4 in
2022/23. Those rows carry the Vg4 code, and since 23 September 2026 they
are one series at Vg3, the level of the county's current table, rather than
a Vg3 row and a Vg4 row holding one year.

## The forecast

`tools/model.py` fits a model to every cell and forecasts the county's next
publication year per programme, with a spread and a probability that a queue
forms at all; the app turns that into a chance of a place for the reader's own
points. The model, the walk-forward backtest and its limits are in
[model.md](model.md).
