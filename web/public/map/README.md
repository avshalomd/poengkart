# Pinned CARTO basemap styles

Written by `tools/vendor-map-styles.mjs` on 2026-09-17. Do not edit by hand; re-run the
script to take a newer CARTO style, and commit the result.

- `voyager.json` ← `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json` (93 layers), tiles from `https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json`
- `dark-matter.json` ← `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (93 layers), tiles from `https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json`

Edits the script makes to CARTO's file: the vector source's TileJSON `url` is replaced
by its `tiles`, `minzoom` and `maxzoom` with our key appended to every template, and its
`attribution` is set to the app's credit line. Fonts (`glyphs`) and the `sprite` stay on CARTO.

Terms (checked 17 September 2026): CARTO basemaps are free with a key up to 5 million tile
requests per calendar month, commercial use included; CARTO and OpenStreetMap must stay
credited on the map. https://docs.carto.com/faqs/carto-basemaps
