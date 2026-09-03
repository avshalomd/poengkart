# Roadmap — parked feature ideas

Agreed August 2026, in rough priority order. Shipped so far: school search
(overlay, Cmd+K), accessibility settings (theme, text size,
colour-blind-friendly palette, reduced motion, language), geolocation,
permalinks (#s=Fylke/Skolenavn), the grade→points calculator, and the
list view (Kart ⇄ Liste toggle: the map's filters as a sortable table).

- **Wish-list (ønsker) extension.** The app already collects choices across
  schools and shows whether the list holds. Extend toward what applicants
  actually file in vigo: ranked wishes, and the at-least-one probability
  the model already computes per cell.
- **Compare view.** Two or three schools' same programme side by side —
  trend, forecast, interval. Counsellor use case.
- **Mix-adjusted toggle.** Colour the map by the α_s school effect instead
  of the raw mean. The number is computed and documented in the report;
  surfacing it in the UI shows the data-science depth where visitors see it.
- **Better photo coverage.** 181/217 schools (83%) have a reviewed photo;
  the 36 gaps concentrate where automatic harvesting has nothing clean to
  find — Møre og Romsdal 18 (the county CMS serves only news-article
  images), Innlandet 11 (school sites expose 234×63 header strips),
  Akershus 4 (one boilerplate hero shared across schools, rejected as
  template art). The automatic tiers are exhausted; what remains is manual
  work per school: municipal image archives, county communications offices
  (the same channel that supplied the data — MRO answered within a week),
  or commissioning uploads to Wikimedia Commons. Every accepted photo still
  passes the standing review: shows that school, no identifiable pupils.
- **Raster→vector basemap migration.** CARTO is retiring its raster
  basemaps in favour of vector (MapLibre); no date yet and our key covers
  both. When it becomes real: Leaflet + maplibre-gl-leaflet, or a move to
  MapLibre GL proper.

## Added September 2026 (grilling session)

- **Source documents mirrored to object storage.** Done 3 September 2026:
  `sources/` stays in git and is mirrored to the public R2 bucket
  `poengkart-sources`, with `sources/manifest.json` carrying every file's
  SHA-256 and provenance and `tools/sources_r2.py` doing push and fetch.
  When the folder outgrows git, drop it from the tree and rely on fetch.
- **Model the intake round explicitly.** Oslo publishes 1st-intake figures,
  most other counties 2nd, Buskerud and Trøndelag do not say. Today the
  difference is absorbed by the county level and stated in an inline caveat;
  the next data-science step is an explicit round adjustment so an Oslo
  chance and a Rogaland chance mean the same thing.
- **Downweight single-applicant cells in the level model.** Møre og Romsdal's
  extract also carries the admitted mean (Gjennomkar); where the lower bound
  equals the mean, one applicant was admitted and the "threshold" is that
  person's score, not a competitive bar (Romsdal 2018: 56,0; Stranda 2014:
  45,6; the 5,7 and 8,6 at the other end are the same mechanism). All eight
  |z| > 4 outliers on 2 Sept 2026 were verified genuine in the sources; five
  are this. Carrying Gjennomkar into the dataset and downweighting min = mean
  cells is a data-science change with a measurable backtest effect.
- **Suggestion, not adopted: hide raw percentages below 30%.** The fill
  model is documented as optimistic in that range. Decision for now is to
  show what the model says; revisit if calibration in that range does not
  improve.

## Launch list (agreed 2 September 2026)

Soft launch now to county contacts, a few parents of 10. trinn pupils, and
the videregående schools whose figures are shown (they can check their own
numbers and photos); real push January 2027 after the autumn refresh.
Distribution via the kommune education departments, with a Norwegian
one-pager attached to a short e-mail.

Owner's own tasks:
- Møre og Romsdal was asked on 2 September 2026 (same thread as the data)
  for the filled / not-filled state per programområde, or places and admitted
  counts, at 2. inntak; when it arrives the county can enter the fill model
  instead of being fixed at 1. Chase after a week if no reply.
  *Deferred: owner's own task; until then the model fixes the county's fill probability at 1.*
- Register `poengkart.no` (domene.no) and cut over during the autumn refresh,
  keeping the vercel.app address as a redirect. The domain is hard-coded in
  five files and the CARTO key is domain-bound. At the same time, attach a
  custom domain (for example `kilder.poengkart.no`) to the R2 bucket
  `poengkart-sources` and change `bucket_url` in `sources/manifest.json`,
  the one place the r2.dev address lives.
  *Deferred: owner's own task, timed with the autumn refresh.*

Agreed product changes:
- Lookup leads; chance is an opt-in layer with its own one-line explanation
  (ADR 0001).
  *Done 2 Sept 2026.*
- Drop "prototype" from the source note: "uoffisiell" plus the sources line;
  author name and the feedback route in the intro.
  *Done 2 Sept 2026.*
- County select: a transparent "flere" row that reveals the counties without
  data, greyed; tapping one says the county does not publish these figures.
  *Done 2 Sept 2026; the README names the seven counties too.*
- Dot colour in chance mode: best programme by default, labelled "beste
  sjanse"; when an utdanningsprogram filter is active, colour by that one.
  *Done 2 Sept 2026.*
- Inline inntak caveat for the counties whose inntak is not stated (Buskerud,
  Trøndelag) and for Møre og Romsdal, which cannot express "ingen venteliste".
  MRO's fill probability is set to 1 until the county supplies the state.
  *Done 2 Sept 2026: `FILL_BLIND` in `tools/model.py`, checked by `test_model.py`, documented in report v1.4 §4.4.*
- No percentage for a series with zero history ("ingen historikk"); a
  "lite historikk" tag at one year.
  *Done 2 Sept 2026.*
- Photos stay as they are, credited to the fylkeskommune with opt-out by
  issue; no permission round.
  *Done: nothing to change; the README states the opt-out.*
- Contacts and outreach drafts move to a gitignored `docs/private/`; the
  civil-servant address leaves `tools/extractors/mro.py`; FOI case numbers
  stay public.
  *Done 2 Sept 2026: `docs/private/` is gitignored, case numbers in `sources/README.md`.*
- Vocabulary sweep to CONTEXT.md: cell-state labels, "inntak" for round,
  chance band keys renamed in code, official programme names in `CATS`.
  *Done 2 Sept 2026 (ADR 0002).*
- Vercel Web Analytics (cookieless) plus a minimal client error beacon, with a
  personvern line in the intro; self-host the font.
  *Script tag, error beacon and personvern line done 2 Sept 2026. Deferred: switching Web Analytics on in the Vercel project (owner, dashboard toggle) and the self-hosted font (needs the font files downloaded; Google Fonts stays until then).*
- Data licence NLOD 2.0 stated in README, in the SQLite `meta` table and in `data/README.md`.
  *Done 2 Sept 2026.*
- Commit the FOI source files under `sources/` with case numbers.
  *Done 2 Sept 2026: 47 source documents plus `sources/README.md`; extractors read from there.*
- Norwegian one-pager for rådgivere and foresatte (what a poenggrense is,
  what the app does and does not claim, sources, contact).
  *Deferred: written after the soft launch, before the kommune e-mails go out.*

Phone onboarding stays as is: the glowing "?" is the first-visit prompt.

## Decided after the soft-launch pass (2 September 2026)

- Git history keeps the old contact file and one work address in earlier
  commits: accepted as a public-record reply, no rewrite.
- Scope is named in the school panel's three counts ("3 av 4 har
  poenggrense", "2 av 4 – 2 uten prognose").
- Permalinks accept the full NSR school name as an alias where a county
  stores the short name (Buskerud, Akershus).
- The muted text colour is darkened one step for contrast margin.
- The Kongsberg photo stays as it is: photo coverage is valued over polish;
  a cleaner photo is a candidate for the photo-coverage item above.
- The list view's Sjanse column keeps its horizontal swipe at 375 px until
  the January push.
