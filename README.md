# Tilgængelighed i byen — kortdemo

Accessibility data from [Enter] shown as a list and a map that stay in sync.
The pages stand in for the embeddable map Aarhus Kommune wants on aarhus.dk, and
they exist to show what the same page costs on three different stacks.

| Page              | Shows                                                       |
| ----------------- | ----------------------------------------------------------- |
| `index.html`      | List of the Leaflet examples                                |
| `baenke.html`     | Benches from OpenStreetMap, source `test:osm-bench`         |
| `aarhus-dk-baenke-sidebar.html` | `baenke-embed.html` in an iframe in the text column of a mock aarhus.dk article, next to the sidebar |
| `aarhus-dk-baenke-fuld.html` | The same article and iframe without the sidebar, the frame full container width |
| `baenke-embed.html` | The bench map with no heading or intro, filling its frame    |
| `toiletter.html`  | Toilets from three sources on one map: `test:osm-public-toilet`, `test:mtm_spatialmaps-toilet-city`, `test:mtm_spatialmaps-toilet-other` |
| `toiletter-samlet.html` | Toilets from Enter's merged source `test:merged-public-toilets`, each toilet once |
| `septima.html`    | Handicapparkering and hundeskove on Septima Widget, styled to the prototype |
| `parkering.html`  | Handicapparkering alone, with "find nærmeste"               |
| `plain.html`      | Same content on widget configuration only                    |
| `leaflet.html`    | Same content on Leaflet and OpenStreetMap                    |

All of them start at Dokk1. The front page links only the Leaflet examples of
Enter sources (`baenke.html`, `toiletter.html`, `toiletter-samlet.html`); new examples are added there
the same way. The last four pages compared the builds for handicapparkering
and hundeskove. They are still published at their own address, linked from
nowhere, and the comparison is in `docs/variants.md`.

### Embedding in aarhus.dk

Two pages show how the map sits on aarhus.dk when it is embedded with an
`<iframe>`, the way an editor would add it to an article: the site's header,
breadcrumb, text column and footer around `baenke-embed.html` in a frame. The
columns follow aarhus.dk's grid: text in `col-lg-7 offset-xl-1`, sidebar in
`col-lg-4 offset-lg-1 col-xl-3`. The pages differ only in how wide the frame
gets:

- `aarhus-dk-baenke-sidebar.html` has the sidebar, so the frame stays in the
  text column. That is the safe assumption: the article wrapper on aarhus.dk
  is not known to allow full-width content. The sidebar holds a placeholder for
  the contact box, with no contact details.
- `aarhus-dk-baenke-fuld.html` has no sidebar, and the frame runs the width of
  the container.

Both are mock-ups and say so in a banner at the top. Their stylesheet,
`css/aarhus-dk.css`, carries the
design tokens from aarhus.dk's `identity-aarhus.css` (Arial, text `#333`,
links `#3661d8`, footer `#333`), copied rather than linked so the demo does not
change with the live site. The two logos in `public/img/` are Aarhus Kommune's,
from the same site.

The framed page, `baenke-embed.html`, is `baenke.html` without the heading and
intro (the heading stays for screen readers) and with `css/embed.css`, which
makes the map fill the frame. The host page sets the frame's height. In the
text column the frame is about 800px wide at most, under the Leaflet build's
820px breakpoint, so the map and list are stacked and the frame scrolls. At
full width they sit side by side, as on the stand-alone page.

### Adding a Leaflet example

A Leaflet page is `leaflet.html` with its own intro and one file in
`public/js/maps/` that sets `window.ENTER_MAP`. That file lists the sources: the
snapshot to load, a label and colour for the checkbox and the marker, the marker
glyph, and `describe`, which turns a feature's properties into the row and the
detail view. With `showSource: true` each row also says which source it came
from, for pages that put several sources of the same thing side by side.

## Running it

```shell
task serve      # http://localhost:8088/enter-map-examples/
```

That is all it takes. The data is in the repository, and nothing here needs a
build step, a package manager or an Enter instance. The site is served under
the same path as on GitHub Pages, and anything outside it answers 404, so a
path that would break once published breaks locally too.

Three optional things need `.env` or `.env.local` (copy `.env.example`):

- `task data:fetch-sources` refreshes the bench and toilet data from Enter's
  sources. Needs credentials.
- `task data:fetch` refreshes the parking and dog forest data. Needs
  credentials, and the old `/data/ngsi-ld` path, which the staging instance no
  longer serves.
- `task route:key` turns on "find nærmeste" on `parkering.html`. Needs a Septima
  routing key.

## GitHub Pages

The examples are published at
<https://itk-enter.github.io/enter-map-examples/> for sharing with stakeholders.
`.github/workflows/pages.yaml` publishes `public/` as it is on every push to
`main`; there is no build step. The repository's Pages source has to be set to
"GitHub Actions" once.

Paths in the widget configuration (`css`, `features_host`, template `url`) are
resolved against the page, not the configuration file, so they start with `./`.
A `../` climbs out of the site and fails under `task serve` as it would on
Pages.

Published, the pages run without the routing key: `key.json` is git-ignored, so
"find nærmeste" is left out of `parkering.html`. Pages caches files for ten
minutes, so a deploy can take that long to show.

## The data

### Benches and toilets

`public/data/test-*.geojson` are a one-off dump of four sources on the Enter
staging instance (<https://enter.srvitkstgweb02.itkdev.dk/>), taken 29 October
2026 with `bin/fetch-sources.sh`:

| Source                              | Model        | Places |
| ----------------------------------- | ------------ | ------ |
| `test:osm-bench`                    | Bench        | 2281   |
| `test:osm-public-toilet`            | PublicToilet | 163    |
| `test:mtm_spatialmaps-toilet-city`  | PublicToilet | 16     |
| `test:mtm_spatialmaps-toilet-other` | PublicToilet | 37     |
| `test:merged-public-toilets`        | PublicToilet | 174    |

`test:merged-public-toilets` was added 30 October 2026. It is Enter's merge of
the toilet sources, each toilet stated once: the 216 toilets above come to
174, of which 41 were merged from more than one source. `seeAlso` holds the
ids of the entities a toilet was merged from, a string for one and an array
for several, and `toiletter-samlet.html` names the sources from their prefix.
FindToilet is an input too, but its test source is empty on staging. The
source without the `test:` prefix, `merged-public-toilets`, has no entities
there.

Enter lists its sources in `/sources.json`. The script looks each one up there
for its data model and JSON-LD context, then asks the broker for
`/ngsi-ld/v1/entities?q=sourceId=="<id>"` as GeoJSON in simplified
(key-values) form, a page of 1000 at a time. A file is named after the source
with `:` turned into `-`. The whole site, the broker included, is behind basic
auth, which is why the pages read a snapshot rather than Enter.

The MTM toilets arrive as `MultiPoint` with one point each; OpenStreetMap
toilets rarely have a name or an address, and benches never have an address.

### Handicapparkering and hundeskove

`public/data/handicapparkering.geojson` (414 places) and
`public/data/hundeskov.geojson` (23 places) are a one-off dump from the Enter
staging instance, taken 17 September 2026 with `bin/fetch-data.sh`. It is
committed on purpose: the demo is meant to run straight after a clone, and the
data is public municipal data that changes slowly.

It is a snapshot, not a feed. Nothing reads Enter at runtime. To bring it up to
date, put the staging credentials in `.env` and run `task data:fetch`; ITK Dev
has them.

Enter publishes normalized NGSI-LD, where every attribute is an object with a
`value`. The fetch script flattens it to key-values so a template can read
`navn` rather than `navn.value`, and asks for `geometryProperty=geometry` —
without it the broker answers with `location`, a centroid, and the dog forests
arrive as points instead of areas. A page inside Enter would ask the broker for
the same shape with `options=keyValues`.

The staging instance publishes the source fields as they arrive, not the Smart
Data Model attributes:

| Type                | Fields used                                     |
| ------------------- | ----------------------------------------------- |
| `handicapparkering` | `vejnavn`, `husnnr`, `invalidepladser`, `bemrk` |
| `hundeskov`         | `navn`, `hegnet`, `ejer`                        |

`husnnr` is missing on 55 of the 414 bays and `invalidepladser` on 12, so the
address and the bay count are built with `computedProperties` that guard against
the missing key. A template that reads an absent field throws, and the row stays
empty.

`bin/nearest.py` adds `nabo_afstand_m`, `nabo_prinx` and `nabo_adresse` to each
feature: the distance to the nearest other place of the same type. Those three
fields are not in Enter. The distance is a relation between two features, and
neither a template nor a computed property ever sees more than one, so it is
derived into the snapshot instead. In production it belongs in Enter, or in the
application reading it.

The widget needs `"srs": "EPSG:4326"` on the layer. The data is WGS84 while the
map is EPSG:25832, and `crs` alone does not do it.

## Keys

No key is committed. `public/config/key.json` holds them, it is git-ignored, and
`task route:key` writes it from `SEPTIMA_ROUTE_APIKEY` in `.env`.

The only feature that needs a key is "find nærmeste" on `parkering.html`, which
uses Septima's routing service. Without `key.json` the `route` control is left
out of the configuration by `js/widget-host.js`, and the rest of the page works
as before. A search field that quietly returns nothing would be worse. The
console shows one 404 for `config/key.json` in that state; that is the check,
not a fault.

The key comes with the Septima Widget agreement. Septima also publish a demo key
in their own example configurations, which is enough to see the feature work
locally, but it is theirs and not something to ship on.

Worth being clear about: the browser sends this key, so it can be kept out of
the repository but not kept secret. That is why the GitHub Pages site runs
without it. The Leaflet build needs no key at all.

## How a page is built

A page is a heading, an intro, a result count and two lines of embed:

```html
<div id="kort" data-widget-url="./config/parkering.json"></div>
<script type="module" src="./js/widget-host.js"></script>
```

Everything else is in the configuration.

| File                                 | Role                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `public/config/tilgaengelighed.json` | Overview widget: map, both layers, category switch, list          |
| `public/config/parkering.json`       | Parking widget: one layer, prototype-shaped detail card           |
| `public/config/plain.json`           | The same content with no styling and no host code                 |
| `public/templates/*.html`            | Markup for list rows and for the selected place                   |
| `public/css/enter-widget.css`        | Aarhus design tokens mapped onto the widget's `--sw-*` variables  |
| `public/js/widget-host.js`           | Creates the widget; routing key, zoom gate, nearest other place   |
| `public/js/a11y-fixes.js`            | One patch for widget markup, see below                            |
| `public/js/leaflet-app.js`           | The Leaflet build: map, list, detail, search                      |
| `public/js/maps/*.js`                | What each Leaflet page shows: sources, markers, row and detail text |
| `public/js/maps/public-toilet.js`    | Row and detail text for the PublicToilet model, shared by the toilet pages |

### List and map

`table` is the list. Placed in a `layout` slot to the left of the map, it gives
list ↔ map interaction for free: selecting a row zooms and highlights the place,
clicking a marker scrolls to the row. Below `appBreakpoint` (820px) the slot
becomes a sheet under the map, so one configuration serves phone and desktop.

`mapFilter: true` makes the list hold what the map shows. The count sits in the
"Resultater" heading above it, written by `table.countSelector` on every map
move and every search. There is no total above the map: a count of 437 next to a
map showing twenty of them was the wrong number in the wrong place.

### Search and categories

Search is the `search` control with a `local` driver for the loaded data and an
`address` driver for Aarhus addresses. The `text` userfilter was tried first and
dropped: it collects search terms as tags behind an "Add" button, which is not
what anyone expects of a search field.

Categories are `layerswitch2`, an accessible layer switch with a legend, because
each category is its own layer.

There are no other filters. A range on the number of bays and a checkbox list on
fencing were both removed: nobody looks for a parking space with more than one
bay, and fencing is a property of a dog forest rather than a way to narrow a
list.

If a filter comes back, two traps, both of which empty the map silently:

- A `range` filter without explicit `min`, `max` and `limit` renders with the
  right bounds and matches nothing. `task data:fetch` prints the observed range.
- A `selectlist` or `multiselect` without explicit `values` does the same.
  `allDefaultSelected` does not save it.

### The selected place

The prototype opens a place over the list, not as a balloon on the map. The
widget can render the selected feature into an element of ours (`detach`), so
that element is laid over the panel and the marker is highlighted through
`svg_selected`. Focus handling — focus into the overlay, Escape to close, focus
back to the row — is in `a11y-fixes.js`.

Two things about `detach`: the widget only renders into the element while it is
displayed, so an empty host is collapsed with `height: 0` rather than hidden;
and closing leaves the markup in place, so the overlay keys off the inline
`display: none` the widget sets. That uses `:has()` (Chrome 105+, Safari 15.4+,
Firefox 121+).

### Zoom gate

Zoomed out, the map holds the data back and the panel says to search or zoom in,
with a bar showing how much zoom is left. Same pattern as
[vurderingsportalen.dk/kort](https://www.vurderingsportalen.dk/kort).

`maxResolution: 3.2` on the layer does the data half: above 3.2 m/px the
features stop drawing and the list empties. The message is host-side, because
the only text the table can show is `emptyText` ("nothing matches your search"),
which is not what happened.

### Accessibility

- The list is real markup, so the data is usable without touching the map.
- `tabindex: true` puts the list in the tab order and every row has a zoom
  button, so showing a place on the map does not need a pointer.
- The number of matching places is written into a `role="status"` element.
- `mouseWheelZoom: false` keeps the map from swallowing page scroll;
  `mapcontrols.keyboard` keeps it pannable from the keyboard.
- axe-core reports no violations on the styled builds, the Leaflet build or the
  overview. `plain.html` has three, which configuration cannot reach.

`mapActivation` is off. With `"mobile"` the map has to be tapped before it
becomes interactive, which protects page scrolling, but the widget then also
hides the panel navigation until the map is activated — putting the list behind
a tap on the map. The map is 50vh on phones, so there is page left to scroll on
either side of it.

`a11y-fixes.js` exists because `layerswitch2` puts `aria-expanded` on a plain
`<div>`, where the attribute is not allowed (axe: `aria-allowed-attr`,
critical). Reported to Septima; delete the file once the widget stops emitting
it.

## Which build to go on with

Not decided. [docs/variants.md](docs/variants.md) compares the three builds with
the measurements behind them, and
[docs/septima-overrides.md](docs/septima-overrides.md) is the full inventory of
what the styled build overrides.

## Moving it into Enter

The demo is standalone so it can be worked on without running Enter. To serve it
from Enter next to `/hundeskov`:

1. Copy `public/config`, `public/css`, `public/templates` and `public/js` into
   Enter's `assets/` or `public/`.
2. Add a controller route and a Twig template with the two embed lines.
3. Replace `features_host` with the proxy route Enter already has, for example
   `path('app_data', {path: '/ngsi-ld/v1/entities', _format: 'geojson', type: 'handicapparkering', geometryProperty: 'geometry'})`,
   and add `options=keyValues` if the broker supports it. Same origin, so no
   CORS handling.
4. Enter pins Septima Widget 3.19.0; this demo uses 3.23.0, which is where
   `layout` slots, `layerswitch2` and the app-mode panel come from.

## Open

- **Licence.** Septima Widget is commercial. The CDN does not enforce it, but a
  licence covering aarhus.dk has to be in place before anything ships on it.
- **Prototype gap.** The prototype also shows accessible toilets, step-free
  entrances, payment, surface, charging, vehicle type, ratings and 360° photos.
  None of it is in the data. `parkering.html` shows those rows as not
  registered rather than hiding them.
- **Widget defects to report** (or to check are fixed): `fill="currentColor"`
  not substituted in `features_style`, `detach` skipped while hidden,
  `aria-expanded` on a `<div>`, filters that match nothing, ignored `leftWidth`
  and `slots.left.header`.
- **Tile source**, if the Leaflet build is taken further. OpenStreetMap needs an
  attribution and a usage policy check; Datafordeler or Septima tiles are a
  one-line change.

[Enter]: https://github.com/itk-dev/enter
