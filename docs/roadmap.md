# Roadmap — parked feature ideas

Agreed August 2026, in rough priority order. Shipped so far: school search
(overlay, Cmd+K), accessibility settings (theme, text size,
colour-blind-friendly palette, reduced motion, language), geolocation,
permalinks (#s=Fylke/Skolenavn), and the grade→points calculator.

- **Wish-list (ønsker) extension.** The app already collects choices across
  schools and shows whether the list holds. Extend toward what applicants
  actually file in vigo: ranked wishes, and the at-least-one probability
  the model already computes per cell.
- **Compare view.** Two or three schools' same programme side by side —
  trend, forecast, interval. Counsellor use case.
- **List view of the map.** "All helse- og oppvekstfag in a county, sorted
  by threshold." Serves power users and screen readers — the map alone is
  invisible to assistive tech.
- **Mix-adjusted toggle.** Colour the map by the α_s school effect instead
  of the raw mean. The number is computed and documented in the report;
  surfacing it in the UI shows the data-science depth where visitors see it.
- **Raster→vector basemap migration.** CARTO is retiring its raster
  basemaps in favour of vector (MapLibre); no date yet and our key covers
  both. When it becomes real: Leaflet + maplibre-gl-leaflet, or a move to
  MapLibre GL proper.
