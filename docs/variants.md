# Three ways to build the same page

The repository carries three builds of the same content, so the choice of stack
can be made from something other than impressions. Same data, same city, same
two categories. This page is the comparison; the site itself only lists the
examples.

| Page | Stack |
| --- | --- |
| `septima.html`, `parkering.html` | Septima Widget, styled to match the workspace prototype |
| `plain.html` | Septima Widget, configuration only — no stylesheet, no JavaScript |
| `leaflet.html` | Leaflet and OpenStreetMap, list and detail written here |

[docs/septima-overrides.md](septima-overrides.md) is the inventory of what the
first one costs.

## Plain Septima: what configuration alone gives

Everything in `config/plain.json` is a documented option. No `--sw-*`
overrides beyond `cssProperties`, no rules against widget markup, no patches.

**Works, out of the box:** both layers, list and map in sync, selection
highlight, type-ahead search over the data and over Aarhus addresses, category
switch with legend, result count written into our own element, keyboard access
to the list, mobile panel. That is the substance of the page, and it is
configuration only.

**What is lost against the styled build:**

| | Styled | Plain |
| --- | --- | --- |
| Panel width | 420px | 320px, `leftWidth` ignored |
| Panel header | None | "Søg og filtrér" bar with a close button |
| List row | Title, address, city, bay count, photo slot | Two dense lines |
| Row rhythm | 16px, hairline between rows | Widget default, tight |
| Marker | Wheelchair glyph on a rounded square | Default pin |
| Selected place | Opens over the list | Balloon on the map |
| Search field | Bordered box, magnifier inside | Bare input |
| Categories | Plain checkbox list | Card with icon and collapse control |
| axe-core | No violations | `aria-allowed-attr` (critical), `link-in-text-block` (serious), `heading-order` (moderate) |

The last row is the one that matters most: **the plain build does not pass an
accessibility check.** `aria-expanded` lands on a `<div>` in `layerswitch2` and,
on selection, on the list header; the map credits are links told from the text
around them by colour alone; with a place open the widget's popup heading skips
a level. The styled builds patch the first and underline the second in CSS. The
heading level of the list header turned out to be configurable
(`showheaderTemplate`), but the rest is not, so even the "no hacks" option needs
a patch, or a Septima release, before it can be published under the
accessibility regulation.

**What the plain build keeps that costs money:** `route` still needs an API key,
and Septima Widget still needs a licence for aarhus.dk.

## Leaflet and OpenStreetMap: what writing it ourselves costs

`leaflet.html` carries the same content and the same layout as the styled widget
build. List, detail, selection, search and "find nearest" are written in
`js/leaflet-app.js`; the map is Leaflet with OpenStreetMap tiles.

**Verified in the browser:** 437 places in list and map, prototype markers with
a selected state, detail as an overlay over the list with focus moved into it,
Escape closing it and focus returning to the row, address autocomplete
("Hack Kampmanns Plads 2" → one address), nearest five computed from the
chosen address (90 m, 160 m, 200 m …), map above the list on phones.
**axe-core: no violations, with the detail open, closed and with the
suggestion list open.**

Two dependencies disappear with this build:

- **No API key.** Address search is Adressevælger (`adressevaelger.dk`),
  Klimadatastyrelsen's replacement for DAWA, which closes on 1 October 2026. It
  is free and needs no registration: the mandatory `token` parameter is
  unmanaged, and KDS asks everyone to send `adressevaelger123` until user
  management arrives, expected late 2026 or early 2027. Distances are haversine
  in the browser. The Septima routing key is not needed.
- **No licence.** Leaflet is BSD-2, OpenStreetMap is ODbL with attribution.

Adressevælger returns positions in ETRS89 / UTM 32N rather than the WGS84 DAWA
gave, so the build converts them; the conversion agrees with DAWA's own
coordinates for the same address to eight decimals. Search is two calls: a
phonetic search for labels and ids, then a lookup on the chosen id for its
access point. Hits that are a road rather than an address carry no position, so
choosing one narrows the search instead of picking a place.

Septima's `address` driver already calls the same service, so the widget builds
are not on DAWA either.

The tile source is a separate decision: Leaflet can just as well draw Datafordeler
or Septima tiles if Aarhus prefers them.

## Zoom gate and nearest place: what each build needed

Two behaviours taken from
[vurderingsportalen.dk/kort](https://www.vurderingsportalen.dk/kort) — which is
not the widget, but Septima tiles and Septima Search under a hand-written app.

**Zoomed out, the map holds the data back** and the panel says to search or zoom
in, with a bar showing how much zoom is left. In the widget build the data side
is `maxResolution: 3.2` on the layer: the features stop drawing and the list
empties by itself. The message is not: the only text the table can show is
`emptyText`, which reads "nothing matches your search", so the card is rendered
through the panel's `html` control and `js/widget-host.js` decides when it shows.
That also means creating the widget through `widgetapi.mjs` instead of
`widgetconfig.js`, which keeps the instance to itself. The Leaflet build gates at
Leaflet zoom 15 — the same 3.2 m/px at this latitude — in about 30 lines.

**"140 m til nærmeste anden plads, vis"** in the detail. The distance is a
relation between two features, and both a widget template and a computed
property only ever see one, so `bin/nearest.py` writes it into the snapshot and
both builds render a property. Opening the neighbour needs
`selectFeatureInLayer(layer, predicate, {activateZoom: true, minResolution: 0.4})`
in the widget build — without `minResolution` the widget stops zooming at 3.2,
exactly where the layer switches off — and one `find` in the Leaflet build. The
predicate can only see feature properties, so the neighbour is identified by the
source's own `mi_prinx`, not the GeoJSON feature id.

In production the distance belongs in Enter, or in the application reading it —
not in a snapshot script.

**The list holds what the map shows.** `mapFilter: true` on the table does it in
the widget builds; the Leaflet build filters against `map.getBounds()` on
`moveend`. Neither page claims a total above the map any more: a count of 437
next to a map showing twenty of them was the wrong number in the wrong place.

The count sits in one "Resultater" heading above the list, written by
`table.countSelector` on every map move and every search. The widget's own
header is one per layer and titled with the layer name, which reads as if the
list only held that kind of place — so `showheader` is off in the styled builds
and the heading comes from the panel's `html` control. Each row already says
what kind of place it is. The plain build keeps the per-layer headers, since
that is what the widget gives you.

Selecting a place also puts `aria-expanded` on the list header, where the
attribute is not allowed — the same defect `layerswitch2` has. The styled builds
strip it; the plain build cannot, so it now shows the critical violation twice.

## Side by side

| | Styled widget | Plain widget | Leaflet |
| --- | --- | --- | --- |
| Lines we maintain | 1375 | 175 | 1352 |
| …of which fight another stylesheet | ~250 | 0 | 0 |
| `!important` | 4 | 0 | 0 |
| Patches for someone else's markup | 59 lines | 0 (and 3 axe violations left) | 0 |
| axe-core | Clean | `aria-allowed-attr`, `link-in-text-block`, `heading-order` | Clean |
| Matches the prototype | Yes | No | Yes |
| Needs a Septima licence | Yes | Yes | No |
| Needs an API key | Yes (`route`) | Yes (`route`) | No |
| Breaks on a widget upgrade | Likely — nothing used is an extension point | No | Not applicable |
| Map data | Septima / KDS | Septima / KDS | OpenStreetMap, or any tile source |
| Who can maintain it | Someone who knows the widget's internals | Anyone who can read JSON | Any front-end developer |

The line count covers every file a build needs that we wrote: page, widget
configuration, templates, stylesheet and script, but not the shared page frame
or the 115-line snapshot enrichment both builds read. The two builds are within
two percent of each other, and the zoom gate and the nearest-place field
cost them roughly the same. They are still not the same kind of line: about a
fifth of the widget build (~250 of 1375 lines; 39 of the 79 rules in
`enter-widget.css`) exists to defeat `widget.css`; in the Leaflet build every
line styles or drives markup from this repository.

The counts are `wc -l` over each build's files, run from `public/`:

```shell
wc -l septima.html parkering.html config/tilgaengelighed.json config/parkering.json \
  templates/*.html css/enter-widget.css js/widget-host.js js/a11y-fixes.js
wc -l plain.html config/plain.json
wc -l leaflet.html css/leaflet-app.css js/leaflet-app.js
```

## Found along the way

- **The plain widget does not pass an accessibility check.** Of its three axe
  violations only the heading level can be reached from configuration, so even
  the "no hacks" option needs a patch or a Septima release.
- **Half of the styled stylesheet overrides the widget** rather than styling
  content. None of it is a supported extension point, so a minor widget release
  can change the layout without warning.
- **Three documented options do not work:** `layout.leftWidth`,
  `slots.left.header`, and the substitution of `fill="currentColor"` in SVG
  markers. Details in [septima-overrides.md](septima-overrides.md#defects).
- **Filters can empty the map silently.** A `range` filter without `min`, `max`
  and `limit`, or a `selectlist` without `values`, matches nothing and says
  nothing.
- **The Leaflet build removes two contract dependencies.** Address search comes
  from Klimadatastyrelsen's Adressevælger and distances are computed in the
  browser, so neither a licence nor an API key is on the critical path to
  publishing.
- **Data is still missing.** Photo, rating, payment, surface, charging and
  vehicle type are not in the source. Every build shows them as not registered
  rather than hiding them.

## What each option is good for

- **Plain widget** — cheapest to own, upgrades safely, and Septima keeps the map
  current. Costs the prototype's design and, as it stands, an accessibility
  approval. Right choice if the visual result is negotiable.
- **Styled widget** — what the demo shows today. Matches the prototype and keeps
  Septima's map stack, but pays for it in overrides that no upgrade guarantees.
- **Leaflet** — the most code, the fewest dependencies, no licence, no key, and
  full control of layout and accessibility. Costs the map features Septima ships
  for free: address search of the quality Septima Search gives, road-based
  routing, print, oblique photos, layer catalogues.
