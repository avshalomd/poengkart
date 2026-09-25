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
- **Better photo coverage.** 203/228 schools (89%) have a reviewed photo
  after the Telemark round of 17 September 2026 (six of its eleven schools
  found on Commons; Bø, Kragerø, Porsgrunn, Skogmo and Vest-Telemark have
  none) and the data-hole sweep of 5 September 2026 (which fixed the Møre og
  Romsdal site URLs and found 15 more, 10 of them in that county). The 25
  gaps are where nothing usable exists online: Innlandet 7 (school sites
  expose 234×63 header strips), Møre og Romsdal 7, Telemark 5 (the county
  CMS serves only news-article images, mostly pupils), Akershus 3 (one
  boilerplate hero shared across schools, rejected as template art),
  Rogaland, Trøndelag and Vestland one each. The automatic tiers are
  exhausted; what remains is manual work per school: municipal image
  archives, county communications offices (the same channel that supplied
  the data — MRO answered within a week), or commissioning uploads to
  Wikimedia Commons. Every accepted photo still passes the standing review:
  shows that school, no identifiable pupils (Borgund's only exterior has
  pupils in frame and stays out).

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
  *Done 5 Sept 2026 (report v1.7): Gjennomkar is carried (`means` in
  `schools.json`, `admitted_mean` in `samples.csv`), the 14 min = mean
  cells are flagged, and the backtest chose their level-fit weight among
  {1, ½, ¼, 0}: full weight, by less than a thousandth of a point of RMSE.
  The mechanism stays; §7.5 reports the verdict.*
- **Suggestion, not adopted: hide raw percentages below 30%.** The fill
  model is documented as optimistic in that range. Decision for now is to
  show what the model says; revisit if calibration in that range does not
  improve. *5 Sept 2026: with Møre og Romsdal's under-25 rule the held-out
  optimism below 60% is at most 1.8 points; the largest gap is now the
  cautious 70–80% bin.*

## Owner asks from the data-hole sweep (5 September 2026)

The sweep's report is `.claude/qa/2026-09-05-data-holes.md` (gitignored, with
the evidence beside it). Merged the same day: Hordaland's 2017–19 3. inntak
table, Sogn og Fjordane's 2018–19 Vg1 table, Vestland's unlinked 2022/23
3. inntak and 2023/24 1. inntak files, the county's corrected 2026/27 reprint,
Oslo 2015/16, fifteen photos, the label and header repairs. What needs a
person:

- **Møre og Romsdal, existing thread (inntak@mrfylke.no):** the same extract
  for all levels («Karaktergrense alle nivå» in the county's dashboard has
  Vg2 thresholds), same columns, as far back as it exists. Ours is Vg1 only.
- **Utdanningsetaten Oslo (postmottak@osloskolen.no):** innsyn in «Nedre
  poenggrense 1. inntak Vg1» for 2011, 2012, 2013 and 2016, by their original
  filenames (the archived linking pages are in the sweep's Lane B report).
  2015 was found on a school site; 2010–2014 and 2016 are not archived.
- **Innlandet (inntak@innlandetfylke.no, sak 2026/1-152):** what `-` (11
  cells) and «Ikke igangsatt» (3) mean in the rolling matrices, and why
  Dombås, Lom and Skarnes left the tables from the 2023 edition, two years
  before they closed.
- **Vestland (contact form):** does a 3. inntak file for 2021/22 exist; the
  2022/23 3. inntak and 2023/24 1. inntak files should be linked from the
  poenggrense page again.
- **Rogaland (inntak@rogfk.no):** the 2026/27 publication promised on 26 Aug
  («this week or next») arrived on vilbli on 7 Sept as the 2024–2026 edition
  and is ingested; nothing to chase. The header typo we fixed ourselves (the
  parser now trusts the edition's majority header) recurs in the new edition
  on the same Kopervik page.
- **Buskerud:** chase the 5 Sept mail after a week (Kongsberg 4,0; which
  inntak).
- **Photos:** ask Innlandet, Akershus and Møre og Romsdal communications
  for building photos of the 21 schools with nothing usable online (list in
  the sweep's Lane D report).
- **Fagerlia / Ålesund identity (decision):** orgnr 974576503 is the Fagerlia
  lineage (renamed Ålesund vgs in 2021) and sits on the Ålesund row; the
  pre-2021 Ålesund vgs was 974576538. Recommendation: keep 974576503 on
  Ålesund and add `merged_from: ["Fagerlia videregående skole"]`,
  `merged_year: 2021`, the way Førde carries Hafstad and Mo og Øyrane.
- **Kunnskapsløftet-2020 renames (design call):** Elektrofag → Elektro og
  datateknologi, Design og håndverk → the two 2020 programmes, Service og
  samferdsel → Salg, service og reiseliv, Elenergi → Elenergi og ekom,
  Hudpleie → Hudpleier, and so on. Same Grep code, different official name;
  today each is its own series, with a break at 2020. Joining them would give
  longer trend lines at the cost of the register's own names.
- **2026/27 not yet published:** Trøndelag (December, by their PDF dates),
  Buskerud (a new page slug will appear), Akershus's own page (November).
  Recheck monthly; the six counties outside the dataset are unchanged.
  *Rechecked 10 Sept 2026: all ten unchanged. Telemark's intake news of
  9 July 2026 gives per-school head-counts only, no thresholds.*
- **Telemark (thread «Poenggrenser i Telemark», answered 17 Sept 2026 with
  the Vg1 workbook, ingested the same day):** asked back the same day for
  which inntak the figures are from, what «Laveste totalpoeng» is (mostly
  karakterpoeng + 300), older years and Vg2–Vg3, and admitted counts beside
  «Plasser». Held out of the model and the report the same day
  (`HELD_OUT`), because without a fill state its figures are not
  comparable; its schools keep a forecast from a satellite fit on the
  county's own figures (`docs/model.md`). Followed up the same day (Marianne Follaug is away until
  5 Oct 2026): which rows of the workbook filled and in which everyone who
  applied got a place, and whether «Laveste totalpoeng» exists for 2024/25
  and 2025/26. Telemark rejoins both when the county says, per programme and
  year, whether everyone was admitted.
- **Carry capacity.** Telemark publishes «Plasser» per programme and year;
  no other county does. Carry it as `places` beside `means` once a second
  county has it or the fill model can use it (with admitted counts it is
  the observed fill state).

## Found 8 September 2026 (licence change)

- **The pinned model numbers are finer than the fit resolves.** Root cause,
  established by experiment (`.claude/qa/2026-09-08-rogaland-2026-merge.md`
  §9): `tools/model.py` fits by three outer EM passes of L-BFGS-B stopped at
  scipy's default tolerance, on a ridge objective that is flat around its
  optimum, so the solution is determined only to about 0.2–0.4 % relative
  (90th percentile ≈ 1 %). The report and `test_docs.py` pin values to the
  last displayed digit, which is below that resolution, so any change in the
  floating-point path moves them: the v1.9 `model.json` built on the branch's
  Linux box differs from a Mac refit in 389 of 9 450 values; scaling every
  input by one ulp on the Mac moves 1 601; tightening the solver moves
  2 263 and still leaves 275 moving under one ulp. Inputs and code were
  identical in every case, two Mac refits were bit-identical, and every
  headline number (coverage80 0.801, Brier 0.0926, half-life 4.0, spread
  4.56) is unchanged; what flips is the last digit, bucket counts at bin
  edges and the order of two outliers tied at |z| = 3.9. Options, owner's
  call: (a) give `test_docs.py` a tolerance of the fit's resolution (about
  0.5 % relative, ±2 in counts) and say in the report that quoted digits
  beyond that are not reproducible — recommended, no numbers change; (b)
  iterate the EM loop and solver to convergence, re-pin and bump the
  version — costs a refit and a v1.9.1, still not bit-reproducible across
  machines; (c) build `model.json` in one named environment only. v1.9.1
  (8 Sept) re-pinned the docs to a Mac build and says so in Appendix D.
  Owner's decision, 8 Sept: leave it; if a refit on another machine fails
  `test_docs.py`, take option (a) and widen the test's tolerance to the
  fit's resolution rather than chase the environment.

## Launch list (agreed 2 September 2026)

Soft launch now to county contacts, a few parents of 10. trinn pupils, and
the videregående schools whose figures are shown (they can check their own
numbers and photos); real push January 2027 after the autumn refresh.
Distribution via the kommune education departments, with a Norwegian
one-pager attached to a short e-mail.

Owner's own tasks:
- Møre og Romsdal was asked on 2 September 2026 (same thread as the data)
  for the filled / not-filled state per programområde, or places and admitted
  counts, at 2. inntak. The county answered on 3 September: the state is not
  in the data behind the file, capacity may be linked «i løpet av neste år»,
  and the dashboard's own `*` («alle kom inn, eller laveste karakter var
  under 25») can be read as «ledig plass» for Vg1.
  *Done 5 Sept 2026 as far as the data allows: the county's rule is applied
  in `tools/extractors/mro.py` (a figure under 25 → ingen venteliste), the
  county is in the fill model, and `FILL_BLIND` is empty. Still open: ask
  again in 2027 for the capacity data, which would replace the proxy.*
- Ask Buskerud whether Kongsberg's «Musikk, dans og drama» threshold of 4,0 in
  2025 is a real threshold (a 0,4 grade average) or a publication artefact. It
  is in the source and is shown as-is; the app invents no plausibility
  threshold (QA pass 5 Sept 2026). *Asked 5 Sept 2026 (inntak@bfk.no), together
  with which inntak the page reports; chase after a week.*
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
- County select: a greyed "(ingen data)" group lists the counties without
  data; they cannot be selected.
  *Done 2 Sept 2026; the README names the seven counties too. The tap-to-explain
  sentence was dropped on 3 Sept 2026: a disabled option fires no event, and the
  greyed group already says what it needs to.*
- Dot colour in chance mode: best programme by default, labelled "beste
  sjanse"; when an utdanningsprogram filter is active, colour by that one.
  *Done 2 Sept 2026.*
- Inline inntak caveat for the counties whose inntak is not stated (Buskerud,
  Trøndelag) and for Møre og Romsdal, which cannot express "ingen venteliste".
  MRO's fill probability is set to 1 until the county supplies the state.
  *Done 2 Sept 2026: `FILL_BLIND` in `tools/model.py`, checked by `test_model.py`, documented in report v1.4 §4.4.
  Superseded 5 Sept 2026: the county's own dashboard rule supplies the state (see the owner task above); the
  caveat now explains the rule instead.*
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

## Added 14 September 2026 (Vg1 as the default scope)

The map dot, the List view's value and «beste sjanse» were computed over
every level a county publishes. Five counties publish Vg1 only, but in
Innlandet, Rogaland and Vestland the Vg2–Vg4 rows outnumber Vg1 (290 vs 159,
398 vs 157, 320 vs 272), so a school's colour there was mostly the years a
10. trinn family cannot apply for. Decision: Vg1 is the default scope
everywhere; Vg2 and up are one click away (a «Trinn» choice in the settings
sheet, remembered like the other preferences; a disclosure line in the school
sheet; `l=all` in the permalink), the same pattern as the history toggle.
Shipped 14 September; the first cut put a «Vg2+» switch in the filter panel
and was taken out the same day: a third kind of control in a row built for
two selects. Two data-science items follow from it:

- **Backtest accuracy by level.** The headline numbers (coverage80 0.801,
  Brier 0.0926) pool every cell. With Vg1 as the product's default, the
  backtest should print RMSE, coverage80 and Brier for Vg1 and for Vg2+
  separately, the report should quote the Vg1 figures beside the pooled
  ones, and the app's spread footnote should use the Vg1 figures if they
  differ.
- **Experiment: pooled fit versus Vg1-only fit, judged on Vg1 cells.** The
  model separates levels through programme|level, but the school effect and
  the county×year walk are shared across levels, and Vg2+ is about half the
  numeric evidence in the three counties that publish it (Innlandet 525 Vg1
  / 724 Vg2+, Rogaland 713 / 1 019, Vestland 1 444 / 1 457). Fit once with
  every cell and once with Vg1 only, compare RMSE and coverage80 on Vg1
  cells, keep the winner: the procedure that chose the single-applicant
  weight. If Vg1-only wins clearly, the follow-up is a school|level effect,
  not dropping the data.

## Rebuild, 16 September 2026

Stages 1–2 of the rebuild plan landed: `web/index.html`'s script is nineteen
TypeScript modules with one state object (`web/src/state.ts`), the style is
`web/src/styles/app.css`, Vite builds `web/dist`, Vitest and Playwright run
in GitHub Actions on every push, and the figure invariants are a CI test.
Behaviour is unchanged by design. Still to do from the same plan:

- **Stage 3 — Astro shell, a prerendered page per school, real paths instead
  of `#s=`.** Landed 17 September 2026: real paths, prerendered pages, share
  cards, sitemap; hash links adopted at boot.
  - Search Console: the URL-prefix property `https://poengkart-no.vercel.app/`
    is verified by the `google-site-verification` tag in
    `web/src/layouts/Base.astro` (17 September 2026; removing the tag
    un-verifies it). `/sitemap.xml` was submitted the same day; watch the
    school pages get indexed under Indexing → Pages (the owner's account).
  - 22 September 2026: `SITE` is `https://poengkart.vercel.app`, the address
    readers are given, so canonical, og:url and the sitemap name it. Its
    URL-prefix property was added the same day and verified by the same tag
    (one token covers both hosts); `/sitemap.xml` was submitted there and
    read with 230 pages. The `poengkart-no` property now reports its pages as
    alternates of the new canonical.
  - The school photo on a prerendered page keeps `loading="lazy"` because the
    template is the client's; an eager hint on the page's own photo would be
    a template split — measure LCP on a school page first.
  - The LOCAL preview server (`astro dev`, `astro preview`) has no
    `/_vercel/image`, so the 40 county-hosted (`bv.ashx`) photos written into
    a prerendered sheet are a broken image there until boot re-renders the
    sheet with the county's own URL. On production and on Vercel preview
    deployments the optimiser answers, and the prerendered markup is
    byte-equal to the client's. The share card never calls `photoSrc`.
  - Parked: satori 0.33.4 pins fflate 0.7.3, which carries a moderate npm
    advisory (GHSA-px8p-9vwx-vf98, an infinite loop in `unzipSync` on a
    malformed archive); it runs at build time only, on the two checked-in
    TTFs, and `npm audit fix --force` would downgrade satori. Left for the
    owner to decide.
- **Stage 4 — MapLibre GL.** Landed 17 September 2026 (PR #5): the base map is MapLibre GL 6.10
  drawing CARTO's vector tiles (Voyager GL light, Dark Matter GL dark) from two
  pinned styles under `web/public/map/` (`tools/vendor-map-styles.mjs`); MapLibre's
  modules are served from `/maplibre/<v>/` (`tools/vendor-maplibre.mjs`, run
  before every build); dots, clusters and the tooltip are HTML in one pane;
  a browser without WebGL2 opens as a list. MapLibre's three modules are
  296 KB gzipped (`tools/vendor-maplibre.mjs --check`, budget 320 KB);
  supercluster (~3 KB) and MapLibre's CSS (~11 KB) ride in the app's own
  bundles. Leaflet + markercluster were 52 KB gzipped. Spec and plan:
  `.claude/plans/2026-09-17-stage-4-maplibre*.md`.
- **Pipeline: the long table as the primary artefact.** `build_dataset.py`
  writes `schools.json` directly; inverting that (cells first, `schools.json`
  a view) makes a new county one extractor emitting typed cells. Deferred
  from stages 1–2 because it changes the generator of every figure.
- **Python 3.12 for the local venv.** CI already runs the tests on 3.12; the
  venv stays on 3.9 until the next refit, because a new interpreter and
  numpy build move the fit within its resolution (see test_docs tolerance).
- **`as any` backlog:** the count per module is in the commit "The data
  contract and the state are typed".

Found by the rebuild's own QA and left alone (zero behaviour change was the rule):

- `schoolFromUrl` cannot resolve a hash whose whole `Fylke/Skole` segment is
  percent-encoded (`#s=Akershus%2FAsker`); the app never writes that form,
  only hand-built or third-party links hit it. (`web/test/url.test.ts` holds
  the `it.todo`.)
- Three phone controls are under the 44 px tap height: the map/list toggle
  buttons at 39 px and the search button at 41 px.
- The colour-key's first bin label "<30" is interpolated unescaped into
  innerHTML (`web/src/chrome.ts`); browsers render it, happy-dom drops it, so
  no unit test pins that label. Escape it.
- The threshold bins' last `max` is 99, not Infinity (`web/src/helpers.ts`);
  the colour lookup relies on no poenggrense reaching 99. Make the last bin
  open-ended so the code carries its own guarantee.
- 336 non-null assertions (`!`) under `web/src/` after strict mode; a typed
  `el(id)` helper that throws once at the seam would retire most of them (a
  behaviour change, hence deferred).
- `S.chart`, `S.listSort` and `S.labelMarkers` are typed non-null while their
  value is set by the module inits before boot; a boot path that renders
  earlier would bite there.
- `exposeGlobals()` assigns every export to `window` unguarded in
  strict-mode module code; an export named like a read-only Window accessor
  (`origin`, `length`, `top`, `closed`) would throw and stop boot. None
  collides today.
- `actions/checkout@v4`, `setup-node@v4`, `setup-python@v5` carry GitHub's
  Node 20 deprecation annotation; bump when convenient.

Found by the final whole-branch review (17 September 2026) and left for later:

- No screenshot baseline exists, although the plan's stage-1 verification
  named one; the CSS was proved byte-identical instead. Before stage 3
  rewrites the shell, record `toHaveScreenshot` baselines from the current,
  known-good build at three viewports and both themes.
- Geolocation (`web/src/locate.ts`, the map's locate control) is unit-tested
  only; add a browser test with a stubbed `geolocation` before stage 3.
- The browser tests still run against the real build, so they read the live
  `web/public/data/`; they name Asker, Førde and Elvebakken but assert no
  figure of theirs, so only a refresh that renames or drops one of the three
  turns them red. (The unit tests read the frozen slice in `web/test/data/`,
  written by `tools/make_test_fixture.py`.)
