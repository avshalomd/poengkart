# Poengkart

Interactive map of admission point thresholds (poenggrenser) for upper
secondary schools (videregående skoler) in Rogaland, Norway — 2018–2025.

Every year the county publishes the threshold of the last admitted applicant
per school × program as a PDF whose URL rots. This project recovered the
historical PDFs (Wayback Machine + the current official file), parsed them
into one dataset, and put a modern UI on top.

**App:** `web/` — a single static page (vanilla JS + Leaflet, no build step).
Map with per-school markers colored by current admission pressure, category
filtering, NO/EN language toggle, and per-school trend charts at three
resolution levels (all programs / category / single program).

## Data pipeline (`tools/`)

1. `parse_pdfs.py` — parses the source PDFs (expected in `../poenggrenser/data/`)
   into `web/data/schools.json`. Handles two PDF generations (pypdf layout mode
   with x-position column slicing; plain-text fallback for rotated-text files),
   normalizes program-name spelling drift, classifies every program into the
   15 national utdanningsprogram categories.
2. `geocode.py` — coordinates via NSR (Nasjonalt skoleregister) with a
   Kartverket address-search fallback.
3. `enrich.py` — school website/address (NSR), photo + summary (Wikipedia
   no/nn, Wikimedia Commons geosearch/text search). Idempotent gap-filler.
4. `build_db.py` — builds `data/poengkart.db` (SQLite) and `data/samples.csv`:
   one row per (school, program, year) with status
   `points | open | priority | discontinued`.

Value semantics: a number is the threshold (grade average × 10); `open` means
no waitlist (everyone qualified admitted); `priority` is a fortrinnsrett quota
row (admission outside the points competition); `discontinued` = program ended.

## Run locally

```bash
python3 -m http.server 8742 -d web
```

## Sources

Rogaland fylkeskommune / vilbli.no (thresholds, 2nd intake round, applicants
with youth right), NSR/Udir, Kartverket, Wikipedia/Wikimedia Commons.
Unofficial prototype — figures may contain parsing errors.
