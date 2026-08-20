# Poengkart

**Live: https://poengkart-no.vercel.app**

Admission point thresholds (*poenggrenser*) for Norwegian upper secondary
schools (videregående skoler) — on a map, with up to 9 years of history
(2018–2026). **190 schools across 7 counties**: Akershus, Buskerud, Innlandet,
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
| [Oslo](https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/) | HTML + PDF | 2021–2026 | 1. |
| [Rogaland](https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6) | PDF | 2018–2025 | 2. |
| [Trøndelag](https://www.vilbli.no/nb/trondelag/a/poengsum-og-karakterer-6) | PDF, per intake region | 2025 | not stated |
| [Vestland](https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/) | PDF | 2021–2026 | 1. and 3. |

Many of these links rot yearly; older editions were recovered through the
[Wayback Machine](https://web.archive.org/).

**Schools** — names, org numbers and locations from the national school
register ([NSR / Udir](https://data-nsr.udir.no/)), with address geocoding via
[Kartverket's open address API](https://ws.geonorge.no/adresser/v1/) where the
register lacks coordinates. Photos and summaries from
[Wikipedia](https://no.wikipedia.org) / [Wikimedia Commons](https://commons.wikimedia.org).
Map tiles by [CARTO](https://carto.com/) / [OpenStreetMap](https://www.openstreetmap.org/).

## How it was processed

Every county gets its own extractor under `tools/extractors/`, feeding one
shared normaliser (`tools/common.py`). PDFs are read by coordinate rather than
by text flow — columns are sliced by x-position, and rotated column headers
(Oslo, Vestland) are rebuilt glyph by glyph. Programme names are normalised
across counties and years, resolved against
[Udir's Grep registry](https://data.udir.no/kl06/v201906/programomraader) where
the source uses official codes, and classified into the national
*utdanningsprogram* categories. School names are matched to the national school
register ([NSR](https://data-nsr.udir.no/)) within their own county, then
geocoded via NSR, Kartverket's address API and Kartverket's place-name
register in turn. Each (school, program, year) cell becomes either a threshold,
*no waitlist* (everyone qualified admitted — deliberately not shown as 0),
a *fortrinnsrett* quota (statutory priority admission, no threshold exists),
or *discontinued*. Where two sources disagree, the newest wins and the
disagreement is recorded in `data/source-drift.json` rather than hidden.
`tools/test_parse.py` runs 41 regression checks over the result. The merged
dataset ships as JSON for the app and as SQLite + CSV (`data/`) for anyone who
wants to query it.

Unofficial project — figures may contain parsing errors. Verify against the
official sources above before making decisions.
