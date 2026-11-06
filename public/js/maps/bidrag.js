/* Contributions for bidrag.html: the places of faciliteter.html — Enter's
 * merged handicap parking and merged toilets, and the benches — with
 * "Tilføj eller ret oplysninger" on each. */

window.ENTER_MAP = {
  showSource: true,
  plugins: [window.CONTRIBUTE.plugin],
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
