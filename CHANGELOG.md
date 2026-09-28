# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Demo pages showing Enter's accessibility data as a list and a map that stay in
  sync, built on Septima Widget and styled with aarhus.dk design tokens:
  `septima.html` for parking and dog forests, `parkering.html` for parking alone.
- Type-ahead search over the loaded data and Aarhus addresses, a category switch,
  and the result count in a live region.
- "Find nærmeste" on the parking page: pick an address and get the nearest bays
  with distance, time and the route in the map.
- The selected place opens over the list, as in the prototype, with the marker
  highlighted, focus moved into it and Escape to close. Markers, list rows and
  panel proportions follow the prototype too.
- A zoom gate on the widget and Leaflet builds: zoomed out the map holds the
  places back and the panel says to search or zoom in.
- The distance to the nearest other parking space in the detail view.
  `bin/nearest.py` derives it into the snapshot, since the source carries no
  relation between two places.
- `plain.html` and `leaflet.html`: the same content on widget configuration
  alone, and on Leaflet with OpenStreetMap. The Leaflet build needs neither a
  licence nor an API key.
- `index.html`, an overview of the four builds with the measurements behind them.
- `bin/fetch-data.sh` for snapshotting entities from an Enter instance,
  flattening normalized NGSI-LD and asking for the real geometry rather than the
  centroid.
- The data snapshot itself, so the demo runs straight after a clone without
  credentials for the Enter instance.
- Documentation of the configuration, the accessibility decisions, what the
  widget styling costs and how the three builds compare.

### Changed

- The Septima routing key is out of the repository. `task route:key` writes it
  from `.env` into the git-ignored `public/config/key.json`; without it the
  `route` control is left out rather than rendered dead.
- The Leaflet build looks addresses up in Klimadatastyrelsens Adressevælger
  instead of DAWA, which closes on 1 October 2026. Positions arrive in
  ETRS89 / UTM 32N and are converted for the map.
- The styled pages create the widget from `widgetapi.mjs` instead of the
  `widgetconfig.js` loader, which keeps the configuration and the instance to
  itself.
- The list holds what the map shows, under one "Resultater" heading that carries
  the number of places in view and follows every pan, zoom and search.
- README rewritten around what someone picking the repository up needs: how to
  run it, where the data comes from, and what each build is worth.

### Removed

- The architecture decision record. These are examples, and the comparison it
  framed is in `docs/variants.md`.
- The bay-count range and dog-forest fencing filters. Neither is how anyone
  narrows this list; fencing is shown on the place instead.

### Fixed

- `bin/fetch-data.sh` keeps its intermediate pages outside `public/data` and
  removes them after a failed run.
- The map credits are underlined, so they are not links told apart from the text
  around them by colour alone (axe: `link-in-text-block`). `plain.html` keeps
  the violation, having no stylesheet.
- The dev server sends `Cache-Control: no-store`, so configuration, templates
  and CSS are not served stale.
- `task data:fetch` reports the HTTP status when the Enter instance answers an
  error, instead of failing on a curl exit code.
- Opening a place in the Leaflet build no longer lets a scroll run past the
  detail and drag the list and the page with it.
- The detail view on the styled pages no longer has the search field and the
  category list showing through it.
- Picking a search result on the styled pages lands close enough to see the
  places.
- `aria-expanded` is stripped from the list header, where selecting a place puts
  it and where the attribute is not allowed.
