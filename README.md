# Poengkart

**Live: https://poengkart-no.vercel.app**

Admission point thresholds (*poenggrenser*) for upper secondary schools
(videregående skoler) in Rogaland, Norway — on a map, with 8 years of history
(2018–2025). Hover a school for the headline numbers, click it for every
program with trends. Norwegian and English.

![Map of Rogaland with schools colored by admission pressure](docs/map.png)

![School details: trends and per-program thresholds](docs/school.png)

## Run locally

```bash
python3 -m http.server 8742 -d web
```

Then open http://localhost:8742. No build step, no dependencies.

## Where the data comes from

**Thresholds** — Rogaland county publishes the points of the last admitted
applicant per school and program once a year (2nd intake round, applicants
with youth right), as a PDF on [vilbli.no](https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6)
(linked from the county's [Søke skoleplass](https://www.rogfk.no/vare-tjenester/skole-og-utdanning/opplaring-i-skole/soke-skoleplass/)
page). Those PDF links rot yearly; older editions were recovered through the
[Wayback Machine](https://web.archive.org/). Five PDFs together cover every
intake year 2018–2025.

**Schools** — names, org numbers and locations from the national school
register ([NSR / Udir](https://data-nsr.udir.no/)), with address geocoding via
[Kartverket's open address API](https://ws.geonorge.no/adresser/v1/) where the
register lacks coordinates. Photos and summaries from
[Wikipedia](https://no.wikipedia.org) / [Wikimedia Commons](https://commons.wikimedia.org).
Map tiles by [CARTO](https://carto.com/) / [OpenStreetMap](https://www.openstreetmap.org/).

## How it was processed

The PDFs are table scans of varying vintage; `tools/parse_pdfs.py` extracts
them (layout-aware text extraction, column slicing by x-position, with a
fallback parser for older files), normalizes program names across years,
and classifies every program into the 15 national *utdanningsprogram*
categories. Each (school, program, year) cell becomes either a threshold,
*no waitlist* (everyone qualified admitted — deliberately not shown as 0),
a *fortrinnsrett* quota (statutory priority admission, no threshold exists),
or *discontinued*. The merged dataset ships as JSON for the app and as
SQLite + CSV (`data/`) for anyone who wants to query it.

Unofficial project — figures may contain parsing errors. Verify against the
official sources above before making decisions.
