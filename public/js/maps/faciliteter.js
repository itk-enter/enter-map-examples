/* Facilities for faciliteter.html: Enter's merged handicap parking and
 * merged toilets, and the benches, on one map with a checkbox each. Parking
 * and toilets are each stated once however many sources know them; benches
 * have one source, OpenStreetMap, so there is nothing to merge. The row
 * names its layer, as a toilet's title is only its name. */

window.ENTER_MAP = {
  showSource: true,
  sources: [
    {
      kind: "merged-handicap-parking-spots",
      label: "Handicapparkering",
      url: "./data/merged-handicap-parking-spots.geojson",
      colour: "#3661d8",
      glyph: window.PARKING_SPOT.glyph,
      describe: window.PARKING_SPOT.describe,
    },
    {
      kind: "merged-public-toilets",
      label: "Offentlige toiletter",
      url: "./data/merged-public-toilets.geojson",
      colour: "#6b3fa0",
      glyph: window.PUBLIC_TOILET.glyph,
      describe: window.PUBLIC_TOILET.describer(window.PUBLIC_TOILET.mergedFrom),
    },
    {
      kind: "osm-bench",
      label: "Bænke",
      url: "./data/osm-bench.geojson",
      colour: "#7a4a1e",
      glyph: window.BENCH.glyph,
      describe: window.BENCH.describe,
    },
  ],
};
