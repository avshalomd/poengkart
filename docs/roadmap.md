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
