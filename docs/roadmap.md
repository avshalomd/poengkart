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

- **Move large source documents to object storage.** The FOI-released
  county files (Akershus 2024/2026 xlsx, Innlandet 2020–22 PDFs, the Møre og
  Romsdal extract) get committed to the repo first so the pipeline is
  reproducible from a clone; once they grow, move them to Cloudflare R2 (or
  similar) with the hashes recorded in the repo.
- **Model the intake round explicitly.** Oslo publishes 1st-intake figures,
  most other counties 2nd, Buskerud and Trøndelag do not say. Today the
  difference is absorbed by the county level and stated in an inline caveat;
  the next data-science step is an explicit round adjustment so an Oslo
  chance and a Rogaland chance mean the same thing.
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
- Ask Møre og Romsdal (same thread as the data) for the filled / not-filled
  state per programområde, so the county can enter the fill model instead of
  being treated as always filled. Draft goes in chat first, sent only on his go.
  *Deferred: owner's own task; until then the model fixes the county's fill probability at 1.*
- Register `poengkart.no` (domene.no) and cut over during the autumn refresh,
  keeping the vercel.app address as a redirect. The domain is hard-coded in
  five files and the CARTO key is domain-bound.
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

## Open decisions after the soft-launch pass (2 September 2026)

- **Git history.** The old contact file and one official's address exist in
  earlier commits. Accept (work address on a public-record reply) or rewrite
  history with `git filter-repo` and a force push.
- **Scope denominators.** A school panel can show three counts at once (hero
  "4 programområder", chart "3", chance "2 av 2"). Proposal: name the scope
  ("3 av 4 har poenggrense", "2 av 4 – 2 uten prognose").
- **County short names.** Buskerud and Akershus store the county's short
  school names (Kongsberg), so `#s=Buskerud/Kongsberg videregående skole`
  does not resolve; `nsr_name` holds the full name. Pipeline-side choice.
- **Kongsberg photo** has the school name baked in and is cropped mid-word.
- **List view at 375 px**: the Sjanse column needs a horizontal swipe.
