# Poengkart

**Live: https://poengkart-no.vercel.app**

Admission point thresholds (*poenggrenser*) for Norwegian upper secondary
schools (videregående skoler) — on a map, with up to 10 years of history
(2017–2026). **191 schools across 7 counties**: Akershus, Buskerud, Innlandet,
Oslo, Rogaland, Trøndelag and Vestland. Hover a school for the headline
numbers, click it for every programme with trends. Norwegian and English.

Only 7 of Norway's 15 counties publish these figures at all. Agder, Nordland
and Østfold say on the record that they choose not to; Vestfold, Troms and
Finnmark publish only aggregate intake statistics (applicants, offers, and in
Vestfold's case per-school head-counts) with no thresholds; Telemark is the one
county still worth chasing — it appears in vilbli's county-information block
alongside four counties that *are* covered here, but the block would not render
during verification. Møre og Romsdal publishes behind a Power BI dashboard.

Each county also publishes a *different intake round*, and thresholds fall
between rounds, so the app labels every figure with its round — including
"round not stated" for the two counties that never say — and warns when a view
mixes them.

![Map of Norway with upper secondary schools coloured by admission pressure](docs/map.png)

![School details: trends and per-programme thresholds](docs/school.png)

## Run locally

```bash
python3 -m http.server 8742 -d web
```

Then open http://localhost:8742. No build step, no dependencies.

## Where the data comes from

**Thresholds** — each county publishes the points of the last admitted
applicant per school and programme, in its own format and for its own intake
round:

| County | Format | Years | Round |
|---|---|---|---|
| [Akershus](https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/poenggrenser.222835.aspx) | HTML tables | 2025 | 1. and 2. |
| [Buskerud](https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/) | HTML matrix | 2024–2025 | not stated |
| [Innlandet](https://innlandetfylke.no/) | PDF matrix | 2023–2025 | 2. |
| [Oslo](https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/) | HTML + PDF | 2020–2026 | 1. |
| [Rogaland](https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6) | PDF | 2018–2025 | 2. |
| [Trøndelag](https://www.vilbli.no/nb/trondelag/a/poengsum-og-karakterer-6) | PDF, per intake region | 2025 | not stated |
| [Vestland](https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/) | PDF | 2020–2026 | 1. and 3. |
| ↳ Hordaland (pre-merger), via the Wayback Machine | PDF press releases | 2017–2019 | 1. |

Many of these links rot yearly; older editions were recovered through the
[Wayback Machine](https://web.archive.org/).

**Why the depth is so uneven.** Rogaland's PDFs are rolling tables that reprint
the previous three or four years, so five documents cover eight years. Everyone
else publishes one year per document and overwrites the page, and the archive
crawler mostly did not catch the older versions. Where a county is shown with a
single year, that is all that was ever published in a form anyone can still
retrieve — not a gap in the collection. Trøndelag says so outright: it does not
produce overviews of past years' thresholds, and only started publishing at all
in 2024. Akershus, Buskerud and Innlandet publish intake statistics for earlier
years, but those contain applicant and capacity counts, no thresholds.

The 2017–2019 Hordaland rows are narrower than everything else here: Vg1
studiespesialisering, public schools in the Bergen area only. Two press
releases each printed the previous year's figure beside the current one, and
they agree on all fifteen schools where they overlap.

**Schools** — names, org numbers and locations from the national school
register ([NSR / Udir](https://data-nsr.udir.no/)), with address geocoding via
[Kartverket's open address API](https://ws.geonorge.no/adresser/v1/) where the
register lacks coordinates. Map tiles by [CARTO](https://carto.com/) /
[OpenStreetMap](https://www.openstreetmap.org/).

**Photos** come either from [Wikimedia Commons](https://commons.wikimedia.org)
— credited to the photographer under the licence shown on the image — or from
the school's own website, credited to the school and its county authority. Each
one was looked at before publication: a photo is used only if it shows that
school, and photos in which pupils are identifiable are not used at all.
Schools without a suitable photo get a small location map instead. If you hold
the rights to a photo here and would rather it were not used, open an issue and
it will be removed.

## How it was processed

Every county gets its own extractor under `tools/extractors/`, feeding one
shared normaliser (`tools/common.py`). PDFs are read by coordinate rather than
by text flow — columns are sliced by x-position, and rotated column headers
(Oslo, Vestland) are rebuilt glyph by glyph. Programme names are normalised
across counties and years, resolved against
[Udir's Grep registry](https://data.udir.no/kl06/v201906/programomraader) where
the source uses official codes. School names are matched to the national school
register ([NSR](https://data-nsr.udir.no/)) within their own county, then
geocoded via NSR, Kartverket's address API and Kartverket's place-name
register in turn. Programmes are sorted into the national *utdanningsprogram*
by resolving each county's label against Grep rather than by keyword — the
reasoning, the five judgement calls behind the mapping, and what to do when a
new source brings an unrecognised name are written down in
[docs/programme-categories.md](docs/programme-categories.md). Each (school, program, year) cell becomes either a threshold,
*no waitlist* (everyone qualified admitted — deliberately not shown as 0),
a *fortrinnsrett* quota (statutory priority admission, no threshold exists),
or *discontinued*. Where two sources disagree, the newest wins and the
disagreement is recorded in `data/source-drift.json` rather than hidden.
`tools/test_parse.py` runs 67 regression checks over the result. The merged
dataset ships as JSON for the app and as SQLite + CSV (`data/`) for anyone who
wants to query it.

## Deliberately not built

**The intake round is modelled per county, not per year.** Vestland's 2023
figures come from 3. inntak while the rest of its series is 1. inntak — 53% of
that year's cells are "no waitlist" against 0–6% in every other year, so the
2023 thresholds sit visibly lower for a reason that has nothing to do with
demand. `build_dataset.py` derives the exception from the rows and records it
against the county (`round_years`), and the school panel explains it in a
sentence. The fuller version would carry the round on each cell — the
extractors already know it per source file — and make the round chip follow
the year being displayed. That turns a static label into one that changes as
you read, in a panel that is already dense, for an audience of teenagers and
their parents. Worth revisiting if more counties turn out to mix rounds inside
one series.

**The alternate-round figures already in the dataset are not shown.** 151
programmes carry `values_r1` and 586 carry `values_r3`; the app reads only
`values`. They are the raw material for numbers that would be comparable
across counties publishing different rounds — the problem the app currently
apologises for in three separate strings. Left until the round model above is
settled, because two series per programme without a coherent story about
rounds would add confusion rather than remove it.

Unofficial project — figures may contain parsing errors. Verify against the
official sources above before making decisions.
