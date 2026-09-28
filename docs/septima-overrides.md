# What it costs to make Septima Widget look like the prototype

An inventory of everything this demo does beyond configuring the widget, why it
is there, and what would remove it. Written down so the decision about what to
build on is made from facts rather than impressions.

Measured on `public/css/enter-widget.css` (591 lines, 79 rules) and
`public/js/a11y-fixes.js`, Septima Widget 3.23.0.

| | Count |
| --- | --- |
| CSS rules styling our own markup (`.result`, `.detalje`, `.thumb`, `.route__*`) | 40 |
| CSS rules reaching into widget internals (`.sw-*`, `.widget-*`, `.ss*`, `.irs*`) | 39 |
| `!important` | 4 |
| JavaScript | 59 lines |

Roughly half the stylesheet overrides the widget rather than styling content.

## Defects

Behaviour that contradicts the documentation. Each one is worth reporting; each
fix deletes code here.

### Marker colours are not substituted

`features_style.svg` is documented to replace `fill="currentColor"` with
`fillcolor`. It does not, in either quoting style, with or without a second
vector layer, with or without `layerswitch2`. Markers render as white outlines.

**Workaround:** the colour is written into the SVG, and the selected state is a
second full SVG string (`svg_selected`) rather than `fillcolor_selected`.

**Removes:** one of the two SVG strings in each configuration.

### A detached info element is skipped while hidden

`info.detach` renders into our element only while that element is displayed. A
host with `display: none` is recognised — it gets the `widget-detached` class —
but stays empty for good.

**Workaround:** the empty host is collapsed with `height: 0; overflow: hidden`
instead of hidden.

### Closing the detail leaves the markup behind

Closing sets an inline `display: none` on the widget's own box but leaves the
rendered template in the DOM, so "is something selected" cannot be answered by
the presence of the template.

**Workaround:** the overlay keys off the inline style:
`.detalje-host:has(.widget-info:not([style*="none"]))`. This is the only reason
the demo needs `:has()` (Chrome 105+, Safari 15.4+, Firefox 121+).

**Removes:** the `:has()` dependency, and the browser floor with it.

### `aria-expanded` on elements that are not controls

`layerswitch2` puts `aria-expanded` on a plain `<div>`, and selecting a place
puts it on the list header — which is only a control when
`showheaderCollapsible` is set, and it is not here. Neither element accepts the
attribute; axe-core rates it critical (`aria-allowed-attr`). The layer
switcher's state is already carried by the header button's `aria-pressed`.

**Workaround:** `a11y-fixes.js` removes the attribute on every mutation, unless
the element really is collapsible.

**Removes:** roughly a third of the JavaScript.

### Controls paint over a detached info element

The widget's own stacking runs high: the search sits at `z-index: 5001` and
`layerswitch2` at `10000`. A detail detached into our own element is therefore
covered by the widget's controls — visibly, with the search field and the
category list showing through the detail.

**Workaround:** `z-index: 10001` on `.detalje-host`, which is a number chosen
to beat someone else's.

**Removes:** one rule, and the need to track what the widget's z-indexes are.

### Filters that match nothing

- A `range` filter without explicit `min`, `max` and `limit` renders with the
  correct bounds and matches no features. List and map both empty, no error.
- A `selectlist` or `multiselect` without explicit `values` behaves the same.
  `allDefaultSelected: true` does not help.

**Workaround:** none needed now — both filters were removed for other reasons —
but the trap is documented in the README for whoever adds the next one.

### An unlabelled search input

The `text` userfilter renders `<label>` and `<input>` as siblings with neither
`for` nor `id`; axe rates the missing label critical. The filter is no longer
used, so the patch has been deleted, but the defect stands.

## Ignored configuration

Documented options that have no effect, handled in CSS instead.

| Option | What happens | Handled by |
| --- | --- | --- |
| `layout.leftWidth` | Panel stays 320px; `--sw-slot-left-max-width` caps it | `.sw-slot-grid { --sw-slot-left-width/-max-width }` |
| `slots.left.header: false` | The header bar renders anyway | `.sw-slot-header { display: none }` |
| `cssProperties` | Covers simple variables, but composites declared at `:root` (`--sw-table-irs--round-handle-border` is `4px solid var(--sw-primary)`) resolve against the `:root` value, so an override further down the tree is ignored | `--sw-*` declared in the stylesheet instead |

## Fighting the widget's own CSS

Not defects — consequences of how the widget is built. They would remain after
every fix above.

- **Load order.** `widget.css` and the per-control stylesheets load *after* the
  stylesheet named in the configuration, so equal-specificity rules lose.
  Fifteen or so rules are scoped `.sw-slot-body …` or
  `.widget-contains-map …` for no reason other than to win.
- **Inline styles.** The search field's width is written into the element by
  JavaScript. All four `!important` declarations exist to beat it.
- **One variable, four sides.** The search input's padding comes from
  `--sw-search-inner-padding-left` applied on every side, so making room for a
  magnifier also makes the field 56px tall. Padding is set directly instead.
- **Component chrome.** `layerswitch2` ships a card, a layers icon, a collapse
  button and hover fills. Eleven rules undo that to reach the prototype's plain
  checkbox list.
- **Map credits.** The widget's copyright line renders its links without an
  underline, so they are told from the surrounding text by colour alone (axe:
  `link-in-text-block`, serious). One rule underlines them. `plain.html` keeps
  the violation, since it has no stylesheet.
- **Behaviour the widget does not own.** The detail is rendered into our
  element, but the widget does not know it is an overlay: focus on open, Escape
  to close and focus return are ours. That is the other two thirds of the
  JavaScript, and no upstream fix removes it.

## What this means

- **If Septima fixes the defects**, the JavaScript shrinks to the overlay focus
  handling, the `:has()` floor disappears, and the marker configuration
  halves. The overrides that remain are the ones that exist because the widget
  looks like a Septima widget and the prototype does not.
- **The remaining overrides are the real cost.** They are load-order and
  component-chrome fights, and they will break on a widget upgrade without any
  warning — nothing here is a supported extension point. A 3.24 release can
  rename `.sw-layerswitch-layer-label` and the panel silently reverts.
- **A Septima-native design would need almost none of this.** The 31
  content rules plus a handful of `--sw-*` variables would cover it. The gap is
  the prototype's visual language, not the data or the interaction.

## Also outstanding

- **`route` needs an API key.** It is not in the repository: `task route:key`
  writes it into the git-ignored `public/config/key.json`, and without it the
  control is left out of the configuration. Straight-line distance
  (`profile: "air"`) needs the key too.
- **Septima Widget is commercial.** A licence covering aarhus.dk is a
  prerequisite regardless of which way this goes.
