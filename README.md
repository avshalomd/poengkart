# Poengkart

[![test](https://github.com/avshalomd/poengkart/actions/workflows/test.yml/badge.svg)](https://github.com/avshalomd/poengkart/actions/workflows/test.yml)

**https://poengkart.no**

Admission thresholds (*poenggrenser*) for Norwegian upper secondary schools,
on a map and as a ranked list. A threshold is the points of the last applicant
who got a place (grade average × 10): what it took to get in, not what the
school requires. 228 schools in the nine counties that publish the figures
or released them on request, 2012–2026, in Norwegian and English.

![The map of southern and central Norway with Bryne vidaregåande skule open: its photo, figures, trend and every programme](docs/map.png)

![A school: photo, your chance of a place at the next intake, the trend, and every programme with its own figure](docs/school.png)

Type in your points and every school and programme is coloured by your chance
of a place at the next intake: green likely, amber possible, red unlikely. The
chance comes from a model fitted on the whole history and backtested year by
year (Telemark's schools from a separate fit on the county's own figures);
[docs/model.md](docs/model.md) explains it and the
[technical report](https://poengkart.no/report) is the full
write-up. Press + on a programme to build your list of wishes (*ønsker*, the
ten a vigo application allows), or use the calculator if you do not know your
points. Search finds any school (⌘K or `/`), Kart ⇄ Liste swaps the map for a
sortable table, every open school has its own shareable page
(`/akershus/asker`; old `#s=Fylke/Skolenavn` links still open), and settings
hold language, theme, text size, the Vg2–Vg3 rows and a
colour-blind palette. The bug button sends the view you had open with your
report, never a picture.

## Run locally

```bash
npm install
npm run dev
```

Opens on http://localhost:8123, or on `$PORT` when it is set. `npm run build`
writes the deployable site to `web/dist`. Every school has its own page (`/akershus/asker`), prerendered at
build time from `web/public/data/schools.json`, with its own share card
under `/og/` and an entry in `/sitemap.xml`; links of the old
`#s=Fylke/Skole` form still open. To rebuild the dataset from the county
source documents in `sources/`:

```bash
.venv/bin/python3 tools/refresh.py
```

The share card in that pipeline first runs `npm run build`, then photographs
the app and so needs Playwright (`pip install playwright && playwright install
chromium-headless-shell`); without it the last capture in `tools/og-panel.png`
is reused. A missing `sources/` is restored from the public mirror with
`tools/sources_r2.py fetch`, verified against `sources/manifest.json`.

`npm test` runs the unit tests (Vitest, two projects: happy-dom and node —
the node project runs the prerender, sitemap and share-card modules with no
DOM at all; coverage thresholds 80 % for statements, functions and lines,
65 % for branches), `npm run e2e` the browser suite (Playwright: boot,
permalinks, filters, points, wishes, the list, settings, the calculator, the
bug button, routes, a phone, axe, and the figure invariants), and
`.venv/bin/python3 -m pytest` the dataset checks. `npm run typecheck` runs
`tsc --noEmit`; there is no `astro check` (the project pins TypeScript 7,
which `@astrojs/check` does not support), so the build is the check for
`.astro` files and endpoints. GitHub Actions runs all four, plus the build,
on every push to `main` and on every pull request.

## The data

`web/public/data/schools.json` is what the app reads. `data/` has the same as SQLite
and CSV: `samples` is every cell with its county, inntak and Grep code,
`forecasts` the model's expected threshold, spread and fill probability per
programme (`held_out` marks Telemark's, which the backtest never scores), and
`model-backtest.csv` every walk-forward forecast behind the accuracy claims. The data is published under
[NLOD 2.0](https://data.norge.no/nlod/no/2.0); the code is MIT.

Each (school, programme, year) cell is one of:

| | |
|---|---|
| a number | the threshold: the last admitted applicant's points |
| `0` | filled, but the last admitted had no registered points, so everyone with points got in; the counties print this as its own state |
| `open` | no waitlist; everyone qualified was admitted (**not** zero) |
| `F` | filled on *fortrinnsrett*, a statutory priority right; no threshold |
| `D` | admission by documentation (IB, elite sport); no threshold |
| `U` | discontinued that year |

Agder, Finnmark, Nordland, Troms, Vestfold and Østfold do not publish
thresholds; the county select lists them as *(ingen data)*.

| County | Format | Years | Inntak |
|---|---|---|---|
| [Akershus](https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/poenggrenser.222835.aspx) | HTML tables; 2024 and 2026 as Excel, released under an FOI request | 2024–2026 | 1. and 2. (FOI years: 2. only) |
| [Buskerud](https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/) | HTML matrix | 2024–2025 | not stated |
| [Innlandet](https://www.vilbli.no/nb/innlandet/a/poengsum-og-karakterer-6) | PDF matrix; 2020–2022 released under an FOI request | 2020–2026 | 2. |
| Møre og Romsdal | Excel extract from the county's Power BI dashboard, released on request | 2012–2026 | 2. |
| [Oslo](https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/) | HTML + PDF, oldest years via school-site PDFs | 2015, 2017–2026 | 1. |
| [Rogaland](https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6) | PDF | 2018–2026 | 2. |
| Telemark | Excel extract released on request: the lowest points of the admitted for every programme, no fill state, so not comparable: outside the model, forecast from its own figures alone with the error measured on its own years | 2024–2026 | not stated |
| [Trøndelag](https://www.vilbli.no/nb/trondelag/a/poengsum-og-karakterer-6) | PDF, per intake region | 2025 | not stated |
| [Vestland](https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/) | PDF | 2020–2026 | 1. and 3. |
| ↳ Hordaland, pre-merger | PDF: press releases via the Wayback Machine (1.), the county's full table (3.) | 2017–2019 | 1. and 3. |
| ↳ Sogn og Fjordane, pre-merger | PDF | 2018–2019 | 1. |

Schools come from the national register ([NSR](https://data-nsr.udir.no/)),
geocoded through [Kartverket](https://ws.geonorge.no/adresser/v1/) where the
register has no coordinates. Map tiles by [CARTO](https://carto.com/) and
[OpenStreetMap](https://www.openstreetmap.org/).

## Notes

- **Inntak are not comparable.** Counties publish different rounds (1., 2. or
  3.) and thresholds fall between them, so every figure carries its inntak and
  the app warns when a view mixes them.
- **Photos** come from [Wikimedia Commons](https://commons.wikimedia.org)
  under the licence shown on each image, or from the school's own site with
  credit. Each was checked to show that school and no identifiable pupils;
  schools without one get a small location map. If you hold the rights to a
  photo and want it removed, open an issue.
- **Unofficial project.** Figures may contain parsing errors; check the
  county's own pages before making decisions.
- More detail: [docs/data-notes.md](docs/data-notes.md) on who publishes, why
  the history is uneven and how the documents are parsed;
  [docs/programme-categories.md](docs/programme-categories.md) on how
  programmes map to the national *utdanningsprogram*.
