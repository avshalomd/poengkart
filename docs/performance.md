# Performance

The flows that matter, what each one costs, the baseline every change is
compared against, and how to re-measure. The harness lives at
`.claude/skills/qa/perf-harness.js` (QA Lane D); paste it whole into the
loaded page and it prints the boot timeline and every operation's median/p90
using the app's own functions.

## The flows

1. **Cold first visit** — HTML (49 KB br) → vendor scripts → app script →
   `schools.json` (78 KB br) → `model.json` (24 KB br) → markers drawn, map
   usable. Tiles stream in parallel from CARTO/OSM and dominate the *visual*
   finish; everything above dominates the *usable* finish.
2. **Repeat visit** — same assets, served from HTTP cache subject to
   `Cache-Control`.
3. **In-page operations** — open a school panel, move the category lens,
   enter points (chance mode recolours all 191 dots), toggle language,
   search the list, switch chart modes.

## Methodology

- **Boot**: buffered `navigation`/`paint`/`resource` entries plus the app's
  own marks — `pk:data` (dataset parsed), `pk:model` (forecast parsed),
  `pk:boot-done` (map interactive). Compare warm with warm: load twice, keep
  the second. Paint entries are meaningless in a hidden tab; the resource
  waterfall and marks are not.
- **Ops**: `performance.now()` around the app's own functions, 6–15
  repetitions, median and p90, on the heaviest school (Førde, 41 rows).
  JS-only cost — valid in a hidden tab, but absolute values swing ~2× with
  tab visibility and machine load, so compare runs from the same session and
  read *structure* (which op is heaviest, did a change move its own number)
  rather than absolute milliseconds across sessions.

## Baseline — 2026-08-24, production, warm load (pre-optimization)

The waterfall was strictly serial:

| stage | when (ms) | note |
|---|---|---|
| TTFB | 67 | |
| vendor scripts | 82–89 | **parser-blocking** — first paint waits for them |
| first contentful paint | 136 | |
| `schools.json` | starts 100, ends 121 | fetch starts only after HTML parse + scripts |
| `model.json` | starts 124, ends 145 | **strictly after** schools.json — serial await |
| map usable | ≈ 152 | after model + marker draw |

`Cache-Control` on both JSONs was `max-age=0, must-revalidate`: every visit
revalidated every asset (one conditional round-trip each, four in the chain).

**Ops baseline** (same session, medians/p90 in ms): drawMarkers 6.1/9.8 ·
drawMarkers with lens 2.9/4.0 · drawMarkers in chance mode 5.2/7.0 ·
openSide (heaviest) 1.8/5.1 · renderSide 1.5/1.7 · renderList 0.2/0.3 ·
renderChartCard 0.1/0.2 · setLens round-trip 6.4/7.9 · onPoints on 7.9/11.0 ·
off 7.0/8.9 · setLang 8.5/10.2 · JSON.parse schools 1.1/1.3.

**Conclusion from the baseline:** every operation was already under ~10 ms —
runtime was not the problem. The whole snappiness budget sat in the boot
chain: a blocking-script tax on first paint, a fetch that could not start
until the parser finished, a serial model request, and a cache policy that
re-asked about every asset on every visit.

## What was changed

1. **`<link rel="preload" as="fetch">` for both JSONs** — the downloads now
   leave with the first bytes of HTML instead of after parse. (Verified: the
   preload matches the later `fetch()` — one request per file, no
   double-fetch.)
2. **`defer` on Leaflet and MarkerCluster** — the parser and first paint no
   longer wait for 44 KB of vendor script; boot now runs on
   `DOMContentLoaded`, after deferred scripts, so `L` is always defined.
3. **`model.json` fetched in parallel** with `schools.json` instead of
   serially after it (it stays optional — a failed model still boots the app).
4. **`Cache-Control: max-age=300, stale-while-revalidate=86400` on
   `/data/*`** — a family browsing for twenty minutes re-fetches nothing, and
   a return within a day gets served instantly while the cache revalidates
   behind the scenes. (Vendor files were already `immutable`; the HTML keeps
   `must-revalidate` so deploys land immediately.)
5. **Permanent instrumentation** — `performance.mark('pk:data' | 'pk:model' |
   'pk:boot-done')` in the boot path, so every future measurement reads the
   app's own timeline instead of reconstructing it.

## After — 2026-08-24, production, warm load

| stage | when (ms) | change |
|---|---|---|
| `schools.json`, `model.json`, vendor JS/CSS | all start **together** | was: three sequential stages |
| `pk:data` → `pk:model` | 2 ms apart | was: model ended 24 ms of pure serial time after schools |
| double-fetch check | none | preloads match the fetches |
| `/data/*` cache | 300 s + SWR 1 day | was: revalidate every visit |

Absolute wall-clock on the measurement machine is within noise of the
baseline (a warm localhost-grade connection hides network structure), so the
honest statement of the win is structural, and it scales with the connection:

- On a slow mobile link (~150 ms RTT, ~1.5 Mb/s), the removed serial model
  request is worth ~250–300 ms; starting the 78 KB dataset download at
  parse-start instead of parse-end is worth roughly the HTML parse + script
  time it used to wait (200–400 ms on a mid-range phone); and first paint no
  longer queues behind 44 KB of vendor script (~300–400 ms). Together:
  roughly **0.6–1.0 s off time-to-usable-map on a cold mobile visit**.
- On a repeat visit within five minutes: four conditional requests → zero.
  Within a day: served stale instantly, revalidated in the background.

**Ops after:** unchanged, as expected — no operation code was touched. The
same-session comparison showed every op within its baseline noise band, and
the full figure-invariant suite (I1–I13) is green on the deployed build.

## After the Vite build — 2026-09-17, preview build, warm load

`web/index.html`'s inline script became nineteen TypeScript modules, bundled
by Vite into one script and one stylesheet. Measured with the perf harness
(`.claude/skills/qa/perf-harness.js`, unchanged — `exposeGlobals()` in
`web/src/globals.ts` still puts every function and state field on `window`)
pasted into `npm run build` + `npm run preview` (port 4173, localhost),
loaded twice, second (warm) load kept. Not the production edge — see the
2026-08-24 sections for that — so absolute milliseconds are not compared
across the two; the question here is whether the module split and the
bundler kept the 2026-08-24 optimizations' structure.

The waterfall is still parallel, now with one script and one stylesheet
instead of the old inline script plus two deferred vendor files:

| resource | start (ms) | end (ms) |
|---|---|---|
| `assets/index-CC5cGhQ5.css` | 7 | 13 |
| `assets/index-CSHk1ijY.js` | 7 | 13 |
| `data/model.json` | 7 | 14 |
| `data/schools.json` | 7 | 18 |

All four start within the same millisecond of navigation, and the harness's
own double-fetch check is empty (`doubleFetch: []`): one request per JSON,
no re-fetch when the app's own `fetch()` runs against the preloaded
response. **The preloads still leave with the first bytes.** Vite keeps the
`<link rel="preload" as="fetch" crossorigin>` pair for both JSONs in
`web/dist/index.html`'s `<head>` (lines 44–45), ahead of the bundled
`<script type="module">` and `<link rel="stylesheet">` (lines 62–63) that
replaced the old vendor `<script defer>` tags — same contract as the
2026-08-24 optimization, carried through the rebuild unchanged.

`performance.mark` timeline this load: `pk:data` 30 ms, `pk:model` 32 ms (2 ms
apart — still parallel, not the old serial 24 ms gap), `pk:boot-done` 118 ms
(`domInteractive` 12 ms, `load` 19 ms — the ~100 ms from `load` to
`pk:boot-done` is marker-draw and first render, not asset loading).

**Ops, same session** (median/p90 ms, for reference only — not a
cross-session comparison, see Methodology): drawMarkers 5.9/7.0 · with lens
3.5/4.3 · in chance mode 6.3/8.9 · openSide (heaviest) 0.5/1.3 · renderSide
0.4/0.5 · renderList 0.1/0.2 · renderChartCard 0.1/0.2 · setLens round-trip
6.2/13 · onPoints on 7.6/11.5 · off 7.2/8.4 · setLang 8.4/11.3 · JSON.parse
schools 12.7/16.5. Same shape as the 2026-08-24 baseline (every op under
15 ms median); no operation code changed in the rebuild.

**Bundle size** (`ls -l web/dist/assets`):

| file | bytes |
|---|---|
| `index-CSHk1ijY.js` | 316,478 |
| `index-CSHk1ijY.js.map` | 1,170,478 |
| `index-CC5cGhQ5.css` | 69,718 |

The content hashes name the build measured on 17 September 2026; the next
code edit renames them.

`gzip -c web/dist/assets/index-*.js | wc -c` → **95,815 bytes** (93.6 KiB)
compressed. Against the old single-file `web/index.html` on `main`
(355,091 bytes, 346.8 KiB, raw — not a like-for-like compression
comparison, since that figure was never gzipped as one unit): the app's
entire script, gzipped, is now about a quarter of the old page's raw
weight. The CSS split out of that same file compresses to 17.39 kB gzip per
the build's own report (`vite build`'s `computing gzip size` step), separate
from the JS number above.

## After stage 3 — 17 September 2026

Astro prerenders one page per school plus a share card and a sitemap at
build time; the questions here are build cost and whether the client bundle
Vite produces changed, not runtime — see the sections above for that.

A clean `npm run build` (Task 5's measurement, confirmed on a re-run) takes
**5.6 s** wall clock and writes:

| what | count / size |
|---|---|
| files under `web/dist` (`find web/dist -type f \| wc -l`) | 460 |
| HTML pages | 219 built by Astro (220 `.html` files on disk, `404.html` included) |
| share cards under `web/dist/og` | 217 PNGs, 8.7 MB total, ~35 KB each |
| `web/dist/akershus/asker.html` (`wc -c`) | 19,825 bytes |
| `web/dist/index.html` (`wc -c`) | 16,840 bytes |

The client bundle did not change: `web/dist/assets/*.css` is byte-identical
to the 2026-09-17 Vite-build section above (69,718 bytes, same content
hash), and the bundled script grew by 262 bytes (316,478 → 316,740 bytes,
96,004 gzip vs 95,815) — the router that adopts old `#s=`/`?s=` links at
boot, the only client-side change stage 3 made.

## Standing budget

- No user-facing operation above 15 ms median on a desktop-class machine.
- `schools.json` and `model.json` must start before HTML parse ends
  (preload present, no double-fetch).
- No parser-blocking script may precede first paint.
- A regression against these numbers is a QA finding even if it still feels
  fast — budgets erode by small steps.
