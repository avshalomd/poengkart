# Data notes

Detail that would crowd the README: which counties publish at all, why the
history is so uneven between them, how the documents are turned into a dataset,
and what was considered and deliberately left unbuilt.

## Only 7 of Norway's 15 counties publish thresholds

Agder, Nordland and Østfold say on the record that they choose not to.
Vestfold, Troms and Finnmark publish aggregate intake statistics only —
applicants, offers, and in Vestfold's case per-school head-counts — with no
thresholds. Møre og Romsdal publishes behind a Power BI dashboard.

Telemark is the one still worth chasing: it appears in vilbli's
county-information block alongside four counties that *are* covered here, but
the block would not render during verification.

## Why the depth is so uneven

Rogaland's PDFs are rolling tables that reprint the previous three or four
years, so five documents cover eight years. Everyone else publishes one year
per document and overwrites the page, and the archive crawler mostly did not
catch the older versions.

Where a county shows a single year, that is all that was ever published in a
form anyone can still retrieve — not a gap in the collection. Trøndelag says so
outright: it does not produce overviews of past years' thresholds, and only
started publishing at all in 2024. Akershus, Buskerud and Innlandet publish
intake statistics for earlier years, but those contain applicant and capacity
counts, no thresholds.

Many of the county links rot yearly; older editions were recovered through the
[Wayback Machine](https://web.archive.org/).

**The 2017–2019 Hordaland rows are narrower than everything else here**: Vg1
studiespesialisering, public schools in the Bergen area only. Two press
releases each printed the previous year's figure beside the current one, and
they agree on all fifteen schools where they overlap.

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
school as `uncertain_years`, and the app says so in words.

`tools/test_parse.py` runs 70 regression checks over the result; every one of
them encodes a defect that was found in the data at some point.

## Deliberately not built

**The intake round is modelled per county, not per year.** Vestland's 2023
figures come from 3. inntak while the rest of its series is 1. inntak — 53% of
that year's cells are "no waitlist" against 0–6% in every other year, so the
2023 thresholds sit visibly lower for a reason that has nothing to do with
demand. `build_dataset.py` derives the exception from the rows and records it
against the county (`round_years`), and the school panel explains it in a
sentence.

The fuller version would carry the round on each cell — the extractors already
know it per source file — and make the round chip follow the year being
displayed. That turns a static label into one that changes as you read, in a
panel that is already dense, for an audience of teenagers and their parents.
Worth revisiting if more counties turn out to mix rounds inside one series.

**The alternate-round figures already in the dataset are not shown.** 151
programmes carry `values_r1` and 586 carry `values_r3`; the app reads only
`values`. They are the raw material for numbers that would be comparable across
counties publishing different rounds — the problem the app currently apologises
for in three separate strings. Left until the round model above is settled,
because two series per programme without a coherent story about rounds would
add confusion rather than remove it. What they *are* used for is measuring the
gap between rounds — see the round bridge in [model.md](model.md) — and
correcting Vestland's 2023 figures inside the forecast.

## The forecast

`tools/model.py` fits a model to every cell and forecasts the county's next
publication year per programme, with a spread and a probability that a queue
forms at all; the app turns that into a chance of a place for the reader's own
points. The model, the walk-forward backtest and its limits are in
[model.md](model.md).
